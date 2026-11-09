export const Constants = { SIYUAN_APPID: "test-app" };

export async function fetchSyncPost(url: string, data: any) {
    const handler = (globalThis as any).__avStub;
    if (!handler) return { code: 0, msg: "", data: {} };
    return handler(url, data);
}

export class Plugin {
    i18n: Record<string, unknown> = {};
    app: any = {};
    commands: any[] = [];
    protyleSlash: any[] = [];
    eventBus = {
        on: () => {},
        off: () => {}
    };
    addCommand() {}
}

export class Menu {
    addItem() { return this; }
    open() {}
    close() {}
    fullscreen() {}
}

export class Dialog {
    destroy() {}
}

export async function openTab() {}
