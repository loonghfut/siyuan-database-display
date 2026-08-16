/**
 * Promise 化的确认对话框，基于 SiYuan Dialog。
 * 用于需要用户确认的破坏性操作（例如整列模板表达式修改）。
 */

import { Dialog } from "siyuan";

function escapeHtml(value: string): string {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function confirmDialog(title: string, content: string, width = "420px"): Promise<boolean> {
    return new Promise(resolve => {
        const dialog = new Dialog({
            title,
            content: `<div class="b3-dialog__content"><div class="ft__breakword">${escapeHtml(content)}</div></div>
<div class="b3-dialog__action">
    <button class="b3-button b3-button--cancel">${window.siyuan.languages.cancel}</button><div class="fn__space"></div>
    <button class="b3-button b3-button--text" id="confirmDialogConfirmBtn">${window.siyuan.languages.confirm}</button>
</div>`,
            width
        });
        const buttons = dialog.element.querySelectorAll<HTMLButtonElement>(".b3-button");
        const finish = (result: boolean): void => {
            dialog.destroy();
            resolve(result);
        };
        buttons[0]?.addEventListener("click", () => finish(false));
        buttons[1]?.addEventListener("click", () => finish(true));
    });
}
