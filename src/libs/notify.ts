// 消息提示的统一入口：设置中关闭"显示消息提示"后，插件的所有操作反馈不再弹出思源 toast。
// 避免在各模块散落 showMessage 调用并逐个判断开关，这里集中控制。

import { showMessage } from "siyuan";

let showNotifications = true;

export function setShowNotifications(enabled: boolean): void {
    showNotifications = enabled;
}

/** 与 siyuan.showMessage 同签名；开关关闭时静默跳过。 */
export function notify(text: string, timeout?: number, type?: "info" | "error", id?: string): void {
    if (!showNotifications) return;
    showMessage(text, timeout, type, id);
}
