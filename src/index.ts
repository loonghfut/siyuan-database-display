import { Plugin } from "siyuan";
import "@/index.scss";
import { readDisplayConfig, readRefreshOptions } from "@/config/display-config";
import { DisplayController } from "@/services/display-controller";
import { setI18n } from "@/i18n";
import { SettingUtils } from "@/libs/setting-utils";
import { addSettings, migrateLegacySettings } from "@/settings";
import { LicenseService, TrialService } from "@/licensing";

export default class DatabaseDisplay extends Plugin {
    private settings!: SettingUtils;
    private controller!: DisplayController;
    private license!: LicenseService;
    private trial!: TrialService;
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
        addSettings(this.settings, () => this.applySettings(), this.license, this.trial);
        const savedSettings = await this.settings.load();
        if (migrateLegacySettings(this.settings, savedSettings)) await this.settings.save();
        await this.license.refresh(this.settings.get("pro-license"));
        this.controller = new DisplayController({
            getConfig: () => readDisplayConfig(key => this.settings.get(key)),
            getAutoRefreshInterval: () => readRefreshOptions(key => this.settings.get(key)).interval,
            isObserverEnabled: () => readRefreshOptions(key => this.settings.get(key)).observerEnabled,
            canInlineEdit: () => this.license.hasFeature("inline-edit") || this.trial.hasActiveTrial()
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
            const operations = message.data?.flatMap((item: { doOperations?: Array<{ action?: string }> }) => item.doOperations || []) || [];
            if (operations.some((operation: { action?: string }) => operation.action?.startsWith("updateAttrView"))) this.controller.scheduleRefresh(true);
        } catch {
            // Ignore non-JSON websocket traffic.
        }
    }
}
