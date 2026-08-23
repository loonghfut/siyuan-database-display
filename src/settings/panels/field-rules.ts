import { createPanel, createTextInput, parseObject } from "../components/controls";
import { AddPanel, SettingsPanelText } from "../types";

interface FieldRuleState {
    hidden: string;
    force: string;
}

function parseList(value: string): string[] {
    return value.split(",").map(s => s.trim()).filter(Boolean);
}

interface RuleSection {
    rules: string[];
    list: HTMLElement;
    placeholder: string;
}

function renderRuleRow(section: RuleSection, index: number, removeLabel: string, onRemove: () => void): void {
    const row = document.createElement("div");
    row.className = "db-settings__value-rule db-settings__field-rule";
    const name = createTextInput(section.rules[index], section.placeholder);
    name.dataset.ruleName = "true";
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "db-settings__remove-rule";
    remove.setAttribute("aria-label", removeLabel);
    remove.addEventListener("click", () => {
        section.rules.splice(index, 1);
        onRemove();
    });
    name.addEventListener("change", () => {
        section.rules[index] = name.value.trim();
    });
    row.append(name, remove);
    section.list.append(row);
}

function renderSection(section: RuleSection, removeLabel: string, onChanged: () => void): void {
    section.list.replaceChildren();
    section.rules.forEach((_, index) => renderRuleRow(section, index, removeLabel, () => {
        renderSection(section, removeLabel, onChanged);
        onChanged();
    }));
}

export function addFieldRulesPanel(addPanel: AddPanel, text: SettingsPanelText): void {
    addPanel("field-rules", JSON.stringify({ hidden: "", force: "" }), text.fieldRules.title, text.fieldRules.description, (value, commit) => {
        const state = parseObject<FieldRuleState>(value, { hidden: "", force: "" });
        const panel = createPanel("db-settings--rules");

        let hiddenRules = parseList(state.hidden);
        let forceRules = parseList(state.force);

        const save = () => {
            const nextValue = JSON.stringify({ hidden: hiddenRules.join(", "), force: forceRules.join(", ") });
            panel.dataset.value = nextValue;
            commit(nextValue);
        };

        const hiddenSection = document.createElement("section");
        hiddenSection.className = "db-settings__value-rules";
        const hiddenTitle = document.createElement("strong");
        hiddenTitle.textContent = text.fieldRules.hidden;
        const hiddenList = document.createElement("div");
        hiddenList.className = "db-settings__value-rules-list";
        const addHidden = document.createElement("button");
        addHidden.type = "button";
        addHidden.className = "b3-button b3-button--outline db-settings__add-rule";
        addHidden.textContent = `+ ${text.fieldRules.addHidden}`;
        const hiddenSectionData: RuleSection = { rules: hiddenRules, list: hiddenList, placeholder: text.fieldRules.hiddenPlaceholder };
        addHidden.addEventListener("click", () => {
            hiddenRules.push("");
            renderSection(hiddenSectionData, text.fieldRules.removeRule, save);
            save();
            const inputs = hiddenList.querySelectorAll<HTMLInputElement>(".b3-text-field");
            inputs[inputs.length - 1]?.focus();
        });
        renderSection(hiddenSectionData, text.fieldRules.removeRule, save);
        hiddenSection.append(hiddenTitle, hiddenList, addHidden);

        const forceSection = document.createElement("section");
        forceSection.className = "db-settings__value-rules";
        const forceTitle = document.createElement("strong");
        forceTitle.textContent = text.fieldRules.force;
        const forceList = document.createElement("div");
        forceList.className = "db-settings__value-rules-list";
        const addForce = document.createElement("button");
        addForce.type = "button";
        addForce.className = "b3-button b3-button--outline db-settings__add-rule";
        addForce.textContent = `+ ${text.fieldRules.addForce}`;
        const forceSectionData: RuleSection = { rules: forceRules, list: forceList, placeholder: text.fieldRules.forcePlaceholder };
        addForce.addEventListener("click", () => {
            forceRules.push("");
            renderSection(forceSectionData, text.fieldRules.removeRule, save);
            save();
            const inputs = forceList.querySelectorAll<HTMLInputElement>(".b3-text-field");
            inputs[inputs.length - 1]?.focus();
        });
        renderSection(forceSectionData, text.fieldRules.removeRule, save);
        forceSection.append(forceTitle, forceList, addForce);

        panel.addEventListener("change", save);
        panel.append(hiddenSection, forceSection);
        return panel;
    });
}
