import { I18nDictionary } from "@/i18n";
import { bindCommit, createCheckbox, createLabel, createPanel, createSelect, parseObject } from "../components/controls";
import { AddPanel, SettingsPanelText } from "../types";

export function addDisplayFormatPanel(addPanel: AddPanel, text: SettingsPanelText, i18n: I18nDictionary): void {
    addPanel("display-format", JSON.stringify({ dateFormat: "YYYY-MM-DD", includeTime: false, checkboxStyle: "emoji", maxDisplayLength: 30, showFieldNames: false, listFontSize: 12, listMultiColumn: true, editTrigger: "click", layout: "below" }), text.format.title, text.format.description, (value, commit) => {
        const state = parseObject<{ dateFormat?: string; includeTime?: boolean; checkboxStyle?: string; maxDisplayLength?: number; showFieldNames?: boolean; listFontSize?: number; listMultiColumn?: boolean; editTrigger?: string; layout?: string }>(value, {});
        const panel = createPanel("db-settings--format");
        const layout = createSelect(text.format.layoutOptions, state.layout === "above" ? "above" : state.layout === "inline" ? "inline" : "below");
        const editTrigger = createSelect(text.format.editTriggerOptions, state.editTrigger === "dblclick" ? "dblclick" : "click");
        const date = createSelect(i18n.settings.dateFormat.options, state.dateFormat || "YYYY-MM-DD");
        const checkbox = createSelect(i18n.settings.checkboxStyle.options, state.checkboxStyle || "emoji");
        const includeTime = createCheckbox(Boolean(state.includeTime));
        const showFieldNames = createCheckbox(state.showFieldNames === true);
        const multiColumn = createCheckbox(state.listMultiColumn !== false);
        const fontSize = document.createElement("input");
        fontSize.type = "number";
        fontSize.className = "b3-text-field";
        fontSize.min = "10";
        fontSize.max = "24";
        fontSize.value = String(Math.min(24, Math.max(10, Number(state.listFontSize) || 12)));
        const length = document.createElement("input");
        length.type = "number";
        length.className = "b3-text-field";
        length.min = "10";
        length.max = "200";
        length.value = String(state.maxDisplayLength || 30);
        panel.append(createLabel(text.format.layout, layout), createLabel(text.format.editTrigger, editTrigger), createLabel(text.format.fontSize, fontSize), createLabel(text.format.multiColumn, multiColumn), createLabel(text.format.date, date), createLabel(text.format.checkbox, checkbox), createLabel(text.format.time, includeTime), createLabel(text.format.fieldNames, showFieldNames), createLabel(text.format.maxLength, length));
        bindCommit(panel, () => {
            const nextValue = JSON.stringify({ dateFormat: date.value, checkboxStyle: checkbox.value, includeTime: includeTime.checked, maxDisplayLength: Math.min(200, Math.max(10, Number(length.value) || 30)), showFieldNames: showFieldNames.checked, listFontSize: Math.min(24, Math.max(10, Number(fontSize.value) || 12)), listMultiColumn: multiColumn.checked, editTrigger: editTrigger.value === "dblclick" ? "dblclick" : "click", layout: layout.value === "above" ? "above" : layout.value === "inline" ? "inline" : "below" });
            panel.dataset.value = nextValue;
            commit(nextValue);
        });
        return panel;
    });
}
