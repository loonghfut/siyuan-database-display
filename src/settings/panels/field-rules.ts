import { bindCommit, createLabel, createPanel, createTextInput, parseObject } from "../components/controls";
import { AddPanel, SettingsPanelText } from "../types";

export function addFieldRulesPanel(addPanel: AddPanel, text: SettingsPanelText): void {
    addPanel("field-rules", JSON.stringify({ hidden: "", force: "" }), text.fieldRules.title, text.fieldRules.description, (value, commit) => {
        const state = parseObject<{ hidden?: string; force?: string }>(value, {});
        const panel = createPanel("db-settings--rules");
        const hidden = createTextInput(state.hidden || "", text.fieldRules.hiddenPlaceholder);
        const force = createTextInput(state.force || "", text.fieldRules.forcePlaceholder);
        panel.append(createLabel(text.fieldRules.hidden, hidden), createLabel(text.fieldRules.force, force));
        bindCommit(panel, () => {
            const nextValue = JSON.stringify({ hidden: hidden.value, force: force.value });
            panel.dataset.value = nextValue;
            commit(nextValue);
        });
        return panel;
    });
}
