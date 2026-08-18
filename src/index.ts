import { openTab, Plugin, showMessage } from "siyuan";
import "@/index.scss";
import { parseCsv, parseJsonObject, readDisplayConfig, readRefreshOptions } from "@/config/display-config";
import { DisplayController } from "@/services/display-controller";
import { setI18n, t } from "@/i18n";
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
        await this.license.refresh(this.settings.get("pro-license"));
        void this.trial.reportLoad();
        this.controller = new DisplayController({
            getConfig: () => readDisplayConfig(key => this.settings.get(key)),
            getAutoRefreshInterval: () => readRefreshOptions(key => this.settings.get(key)).interval,
            isObserverEnabled: () => readRefreshOptions(key => this.settings.get(key)).observerEnabled,
            isFeatureEnabled: feature => this.proAccess.isFeatureEnabled(feature),
            openBlock: (blockId, openInSplit) => this.openBlock(blockId, openInSplit),
            openAsset: (path, openInSplit) => this.openAsset(path, openInSplit),
            hideField: fieldName => this.hideField(fieldName)
        });
        this.eventBus.on("switch-protyle", this.onSwitchProtyle);
        this.eventBus.on("loaded-protyle-dynamic", this.onLoaded);
        this.eventBus.on("loaded-protyle-static", this.onLoaded);
    }

    onLayoutReady(): void {
        this.applySettings();
        window.siyuan.ws.ws.addEventListener("message", this.onWebsocketMessage);
        this.themeObserver?.disconnect();
        this.themeObserver = new MutationObserver(() => this.controller?.scheduleRefresh(true));
        this.themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme-mode"] });
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
        void this.license.refresh(this.settings.get("pro-license")).then(() => this.controller?.scheduleRefresh(true));
        this.controller?.updateAutoRefresh();
        this.controller?.updateObserver();
        this.controller?.scheduleRefresh(true);
    }

    private handleWebsocketMessage(event: MessageEvent): void {
        try {
            const message = JSON.parse(event.data);
            if (message.cmd !== "transactions") return;
            const operations = message.data?.flatMap((item: { doOperations?: Array<Record<string, unknown>> }) => item.doOperations || []) || [];
            const relevant = operations.filter(operation =>
                typeof operation.action === "string" && operation.action.startsWith("updateAttrView")
            );
            if (relevant.length === 0) return;
            // 只关心与当前可见内容相关的属性视图，减少无关刷新
            const attributeViewIds: string[] = [];
            for (const operation of relevant) {
                const avID = operation.avID;
                if (typeof avID === "string" && avID && !attributeViewIds.includes(avID)) {
                    attributeViewIds.push(avID);
                }
            }
            this.controller.handleAttributeViewUpdate(attributeViewIds);
        } catch {
            // Ignore non-JSON websocket traffic.
        }
    }

    /**
     * 右键菜单"隐藏此字段"：合并新旧隐藏规则后写回设置。
     */
    private hideField(fieldName: string): void {
        if (!fieldName) return;
        const fieldRules = parseJsonObject<{ hidden?: string; force?: string }>(this.settings.get("field-rules"), {});
        const hidden = new Set([...parseCsv(fieldRules.hidden), ...parseCsv(this.settings.get("hidden-fields")), fieldName]);
        fieldRules.hidden = [...hidden].join(",");
        void this.settings.setAndSave("field-rules", JSON.stringify(fieldRules)).then(() => {
            showMessage(t("common.fieldHidden", { name: fieldName }), 3000, "info");
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
