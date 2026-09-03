import { openTab, Plugin } from "siyuan";
import "@/index.scss";
import { parseCsv, readDisplayConfig } from "@/config/display-config";
import { SETTING_KEY_FIELD_RULES, parseFieldRules, serializeFieldRules } from "@/config/field-rules";
import { getAVCustomColors, loadAVPalette } from "@/domain/option-color";
import { DisplayController } from "@/services/display-controller";
import { parseAttributeViewUpdateSignal } from "@/services/attribute-view-update-signal";
import { createDatabaseCommands, createDatabaseSlashCommands, isDatabaseCommandKey } from "@/services/slash-command";
import { parsePinnedDatabases, SETTING_KEY_PINNED_DATABASES } from "@/config/pinned-databases";
import { setI18n, t } from "@/i18n";
import { notify, setShowNotifications } from "@/libs/notify";
import { SettingUtils } from "@/libs/setting-utils";
import { addSettings, migrateLegacySettings } from "@/settings";
import { LicenseService, ProAccessService, TrialService } from "@/licensing";
import type { ProFeature } from "@/licensing";

export default class DatabaseDisplay extends Plugin {
    private settings!: SettingUtils;
    private controller!: DisplayController;
    private license!: LicenseService;
    private trial!: TrialService;
    private proAccess!: ProAccessService;
    private readonly onSwitchProtyle = (event: CustomEvent) => void this.controller.switchDocument(event.detail);
    private readonly onLoaded = () => this.controller.scheduleRefresh(false);
    private readonly onWebsocketMessage = (event: MessageEvent) => this.handleWebsocketMessage(event);
    private themeObserver: MutationObserver | undefined;

    async onload(): Promise<void> {
        setI18n(this.i18n as Record<string, unknown>);
        this.settings = new SettingUtils({ plugin: this, name: "DatabaseDisplay" });
        this.license = new LicenseService();
        this.trial = new TrialService({
            getRecords: () => this.settings.get("pro-trial-records"),
            saveRecords: value => this.settings.setAndSave("pro-trial-records", value)
        });
        this.proAccess = new ProAccessService(this.license, this.trial);
        addSettings(this.settings, () => this.applySettings(), this.license, this.trial,
            (feature: ProFeature) => this.proAccess.isFeatureEnabled(feature));
        const savedSettings = await this.settings.load();
        if (migrateLegacySettings(this.settings, savedSettings)) await this.settings.save();
        setShowNotifications(String(this.settings.get("show-messages")) !== "false");
        await this.license.refresh(this.settings.get("pro-license"));
        void this.trial.reportLoad();
        this.controller = new DisplayController({
            getConfig: () => readDisplayConfig(key => this.settings.get(key)),
            isFeatureEnabled: feature => this.proAccess.isFeatureEnabled(feature),
            openBlock: (blockId, openInSplit) => this.openBlock(blockId, openInSplit),
            openAsset: (path, openInSplit) => this.openAsset(path, openInSplit),
            hideField: fieldName => this.hideField(fieldName)
        });
        this.eventBus.on("switch-protyle", this.onSwitchProtyle);
        this.eventBus.on("loaded-protyle-dynamic", this.onLoaded);
        this.eventBus.on("loaded-protyle-static", this.onLoaded);
        // 布局就绪前就把命令注册好，避免 onLayoutReady 之前打开 / 面板或快捷键设置时缺项
        this.syncSlashCommands();
        this.syncCommands();
    }

    onLayoutReady(): void {
        this.applySettings();
        window.siyuan.ws.ws.addEventListener("message", this.onWebsocketMessage);
        this.themeObserver?.disconnect();
        this.themeObserver = new MutationObserver(() => this.controller?.scheduleRefresh(true));
        this.themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme-mode"] });
        // 预载工作空间配色：自定义色与隐藏的内置色会影响选项色块，
        // 首屏渲染时还没有缓存，载入后按需重刷一次
        void loadAVPalette().then(() => {
            if (getAVCustomColors().length > 0) this.controller?.scheduleRefresh(true);
        });
    }

    onunload(): void {
        this.eventBus.off("switch-protyle", this.onSwitchProtyle);
        this.eventBus.off("loaded-protyle-dynamic", this.onLoaded);
        this.eventBus.off("loaded-protyle-static", this.onLoaded);
        window.siyuan.ws.ws.removeEventListener("message", this.onWebsocketMessage);
        this.themeObserver?.disconnect();
        this.controller?.dispose();
    }

    private applySettings(): void {
        setShowNotifications(String(this.settings.get("show-messages")) !== "false");
        void this.license.refresh(this.settings.get("pro-license")).then(() => this.controller?.scheduleRefresh(true));
        this.controller?.scheduleRefresh(true);
        this.syncSlashCommands();
        this.syncCommands();
    }

    /**
     * 按当前设置为每个常用数据库注册一条斜杠命令。
     * 思源每次打开 / 面板都会重新读取 protyleSlash，原地更新即可生效。
     */
    private syncSlashCommands(): void {
        const databases = parsePinnedDatabases(this.settings.get(SETTING_KEY_PINNED_DATABASES));
        this.protyleSlash.length = 0;
        this.protyleSlash.push(...createDatabaseSlashCommands({
            databases,
            onAdded: blockID => this.controller?.scheduleRefresh(true, new Set([blockID]), { trusted: true })
        }));
    }

    /**
     * 按当前设置为每个常用数据库注册一条思源快捷键命令（不设默认快捷键，
     * 用户可在「设置 → 快捷键 → 插件」中自行绑定）。
     *
     * addCommand 只对新增命令调用；设置里删除的数据库对应命令直接从 this.commands
     * 移除，快捷键设置面板按 plugin.commands 渲染（config/tabs/keymapUi.ts:308），
     * 原地更新即可生效，无需重载插件。
     */
    private syncCommands(): void {
        const databases = parsePinnedDatabases(this.settings.get(SETTING_KEY_PINNED_DATABASES));
        const commands = createDatabaseCommands({
            databases,
            onAdded: blockID => this.controller?.scheduleRefresh(true, new Set([blockID]), { trusted: true })
        });
        const wanted = new Map(commands.map(command => [command.langKey, command]));
        // 只清理本插件管理的数据库命令，避免将来新增其他命令时被误删
        for (let i = this.commands.length - 1; i >= 0; i--) {
            const langKey = this.commands[i].langKey;
            if (isDatabaseCommandKey(langKey) && !wanted.has(langKey)) {
                this.commands.splice(i, 1);
            }
        }
        for (const [langKey, command] of wanted) {
            const existing = this.commands.find(item => item.langKey === langKey);
            if (existing) {
                // 数据库可能被重命名：同步命令文案与回调，保留用户已绑定的快捷键
                existing.langText = command.langText;
                existing.editorCallback = command.editorCallback;
            } else {
                this.addCommand(command);
            }
        }
    }

    private handleWebsocketMessage(event: MessageEvent): void {
        try {
            const signal = parseAttributeViewUpdateSignal(JSON.parse(event.data));
            if (signal) this.controller.handleAttributeViewUpdate(signal);
        } catch {
            // Ignore non-JSON websocket traffic.
        }
    }

    /**
     * 右键菜单"隐藏此字段"：写入全局隐藏规则，对所有数据库生效。
     * 只想隐藏某个数据库的字段时，在设置面板的「按数据库」里单独配置。
     */
    private hideField(fieldName: string): void {
        if (!fieldName) return;
        const rules = parseFieldRules(this.settings.get(SETTING_KEY_FIELD_RULES));
        const hidden = new Set([...rules.global.hidden, ...parseCsv(this.settings.get("hidden-fields")), fieldName]);
        rules.global.hidden = [...hidden];
        void this.settings.setAndSave(SETTING_KEY_FIELD_RULES, serializeFieldRules(rules)).then(() => {
            notify(t("common.fieldHidden", { name: fieldName }), 3000, "info");
            this.controller?.scheduleRefresh(true);
        });
    }

    private openBlock(blockId: string, openInSplit: boolean): void {
        void openTab({
            app: this.app,
            doc: { id: blockId },
            ...(openInSplit ? { position: "right" as const } : {})
        }).catch(error => console.warn("[DatabaseDisplay] Failed to open block", error));
    }

    private openAsset(path: string, openInSplit: boolean): void {
        void openTab({
            app: this.app,
            asset: { path },
            ...(openInSplit ? { position: "right" as const } : {})
        }).catch(error => console.warn("[DatabaseDisplay] Failed to open asset", error));
    }
}
