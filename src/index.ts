import { Plugin } from "siyuan";
import "@/index.scss";
import { readDisplayConfig, readRefreshOptions } from "@/config/display-config";
import { DisplayController } from "@/services/display-controller";
import { setI18n } from "@/i18n";
import { SettingUtils } from "@/libs/setting-utils";
import { addSettings, migrateLegacySettings } from "@/settings";

export default class DatabaseDisplay extends Plugin {
    private settings!: SettingUtils;
    private controller!: DisplayController;
    private readonly onSwitchProtyle = (event: CustomEvent) => void this.controller.switchDocument(event.detail);
    private readonly onLoaded = () => this.controller.scheduleRefresh(false);
    private readonly onWebsocketMessage = (event: MessageEvent) => this.handleWebsocketMessage(event);

    async onload(): Promise<void> {
        setI18n(this.i18n as Record<string, unknown>);
        this.settings = new SettingUtils({ plugin: this, name: "DatabaseDisplay" });
        addSettings(this.settings, () => this.applySettings());
        const savedSettings = await this.settings.load();
        if (migrateLegacySettings(this.settings, savedSettings)) await this.settings.save();
        this.controller = new DisplayController({
            getConfig: () => readDisplayConfig(key => this.settings.get(key)),
            getAutoRefreshInterval: () => readRefreshOptions(key => this.settings.get(key)).interval,
            isObserverEnabled: () => readRefreshOptions(key => this.settings.get(key)).observerEnabled
        });
        this.eventBus.on("switch-protyle", this.onSwitchProtyle);
        this.eventBus.on("loaded-protyle-dynamic", this.onLoaded);
        this.eventBus.on("loaded-protyle-static", this.onLoaded);
    }

    onLayoutReady(): void {
        this.applySettings();
        window.siyuan.ws.ws.addEventListener("message", this.onWebsocketMessage);
    }

    onunload(): void {
        this.eventBus.off("switch-protyle", this.onSwitchProtyle);
        this.eventBus.off("loaded-protyle-dynamic", this.onLoaded);
        this.eventBus.off("loaded-protyle-static", this.onLoaded);
        window.siyuan.ws.ws.removeEventListener("message", this.onWebsocketMessage);
        this.controller?.dispose();
    }

    private applySettings(): void {
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
