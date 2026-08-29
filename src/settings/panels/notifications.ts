import { createCheckbox, createPanel } from "../components/controls";
import { AddPanel, SettingsPanelText } from "../types";

/** 是否弹出思源消息提示（保存成功、失败等操作反馈）。 */
export function addNotificationsPanel(addPanel: AddPanel, text: SettingsPanelText): void {
    addPanel("show-messages", "true", text.notifications.title, text.notifications.description, (value, commit) => {
        const panel = createPanel("db-settings--notifications");
        const enabled = String(value) !== "false";

        const checkbox = createCheckbox(enabled);
        checkbox.addEventListener("change", () => {
            panel.dataset.value = String(checkbox.checked);
            commit(panel.dataset.value);
        });

        const row = document.createElement("label");
        row.className = "db-settings__row";
        const title = document.createElement("span");
        title.textContent = text.notifications.show;
        row.append(title, checkbox);
        panel.append(row);
        return panel;
    });
}
