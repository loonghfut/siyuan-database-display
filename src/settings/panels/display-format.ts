import { I18nDictionary } from "@/i18n";
import { bindCommit, createCheckbox, createLabel, createPanel, createSelect, parseObject } from "../components/controls";
import { AddPanel, SettingsPanelText } from "../types";

export function addDisplayFormatPanel(addPanel: AddPanel, text: SettingsPanelText, i18n: I18nDictionary): void {
    addPanel("display-format", JSON.stringify({ dateFormat: "YYYY-MM-DD", includeTime: false, checkboxStyle: "emoji", maxDisplayLength: 30, showFieldNames: false }), text.format.title, text.format.description, (value, commit) => {
        const state = parseObject<{ dateFormat?: string; includeTime?: boolean; checkboxStyle?: string; maxDisplayLength?: number; showFieldNames?: boolean }>(value, {});
        const panel = createPanel("db-settings--format");
        const date = createSelect(i18n.settings.dateFormat.options, state.dateFormat || "YYYY-MM-DD");
        const checkbox = createSelect(i18n.settings.checkboxStyle.options, state.checkboxStyle || "emoji");
        const includeTime = createCheckbox(Boolean(state.includeTime));
        const showFieldNames = createCheckbox(state.showFieldNames === true);
        const length = document.createElement("input");
        length.type = "number";
        length.className = "b3-text-field";
        length.min = "10";
        length.max = "200";
        length.value = String(state.maxDisplayLength || 30);
        panel.append(createLabel(text.format.date, date), createLabel(text.format.checkbox, checkbox), createLabel(text.format.time, includeTime), createLabel(text.format.fieldNames, showFieldNames), createLabel(text.format.maxLength, length));
        bindCommit(panel, () => {
            const nextValue = JSON.stringify({ dateFormat: date.value, checkboxStyle: checkbox.value, includeTime: includeTime.checked, maxDisplayLength: Math.min(200, Math.max(10, Number(length.value) || 30)), showFieldNames: showFieldNames.checked });
            panel.dataset.value = nextValue;
            commit(nextValue);
        });
        return panel;
    });
}
