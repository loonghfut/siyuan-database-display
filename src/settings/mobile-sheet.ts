/** 移动端半屏底部弹窗：将插件设置 Dialog 适配为 bottom sheet 形态（下拉把手可关闭）。 */
import { getFrontend } from "siyuan";
import { SettingUtils } from "@/libs/setting-utils";
import { t } from "@/i18n";

/** 思源 Setting 在运行时持有 dialog 实例，但类型定义未暴露，这里做最小声明。 */
type SettingWithDialog = {
    open: (name: string) => void;
    dialog?: { element: HTMLElement; destroy: () => void };
};

const SHEET_HEIGHT = "min(64vh, 640px)";
const DISMISS_DISTANCE = 96; // 下拉超过该像素距离时关闭
const DISMISS_VELOCITY = 0.6; // 或快速下拉速度阈值（px/ms）

/** 仅在移动端前端生效（App 与移动端浏览器）。 */
export function isMobileFrontend(): boolean {
    const frontend = getFrontend();
    return frontend === "mobile" || frontend === "browser-mobile";
}

/** 拦截 Setting.open：移动端把弹出的设置 Dialog 改造为半屏底部弹窗。 */
export function installMobileSettingsSheet(settings: SettingUtils): void {
    if (!isMobileFrontend()) return;
    const setting = settings.plugin.setting as unknown as SettingWithDialog;
    const open = setting.open.bind(setting);

    setting.open = (name: string) => {
        open(name);
        const dialog = setting.dialog;
        if (dialog) adaptToBottomSheet(dialog.element, () => dialog.destroy());
    };
}

function adaptToBottomSheet(wrapper: HTMLElement, close: () => void): void {
    const container = wrapper.querySelector<HTMLElement>(".b3-dialog__container");
    const header = wrapper.querySelector<HTMLElement>(".b3-dialog__header");
    if (!container || !header) return;

    // b3-dialog--open 加在 wrapper 上，db-sheet 同样加 wrapper 才能参与级联
    wrapper.classList.add("db-sheet");
    // 覆盖 Setting 传入的内联尺寸（移动端默认 92vw × 80vh）
    container.style.width = "100vw";
    container.style.height = SHEET_HEIGHT;

    const handle = document.createElement("div");
    handle.className = "db-sheet__handle";
    handle.setAttribute("role", "button");
    handle.setAttribute("aria-label", t("settings.sheetDragHandle"));
    container.prepend(handle);

    attachDragToDismiss(handle, wrapper, container, close);
}

/** 把手下拉关闭：跟手位移 + 超阈值/快速甩动时销毁弹窗。 */
function attachDragToDismiss(
    handle: HTMLElement,
    wrapper: HTMLElement,
    container: HTMLElement,
    close: () => void
): void {
    let dragging = false;
    let startY = 0;
    let offset = 0;
    let lastY = 0;
    let lastTime = 0;
    let velocity = 0;

    handle.addEventListener("pointerdown", event => {
        dragging = true;
        startY = lastY = event.clientY;
        offset = 0;
        velocity = 0;
        lastTime = performance.now();
        container.style.transition = "none";
        handle.setPointerCapture(event.pointerId);
    });

    handle.addEventListener("pointermove", event => {
        if (!dragging) return;
        offset = Math.max(0, event.clientY - startY);
        const now = performance.now();
        velocity = (event.clientY - lastY) / Math.max(1, now - lastTime);
        lastY = event.clientY;
        lastTime = now;
        container.style.transform = `translateY(${offset}px)`;
    });

    const release = () => {
        if (!dragging) return;
        dragging = false;
        container.style.transition = "";
        if (offset > DISMISS_DISTANCE || velocity > DISMISS_VELOCITY) {
            // destroy 会移除 b3-dialog--open，容器按 CSS 过渡滑回底部
            container.style.transform = "translateY(100%)";
            wrapper.classList.remove("b3-dialog--open");
            window.setTimeout(close, 200);
        } else {
            container.style.transform = "";
        }
        offset = 0;
    };

    handle.addEventListener("pointerup", release);
    handle.addEventListener("pointercancel", release);
}
