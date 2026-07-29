import { DEFAULT_FIELD_BACKGROUNDS, DEFAULT_FIELD_COLORS } from "@/config/display-config";
import { FIELD_TYPES } from "@/core/types";
import { createColorControl, readColorControl } from "../components/color-picker";
import { createCheckbox, createPanel, createTextInput, parseObject } from "../components/controls";
import { AddPanel, SettingsPanelText } from "../types";

function defaultAppearance(): string {
    const types = Object.fromEntries(FIELD_TYPES.map(type => [type, { color: DEFAULT_FIELD_COLORS[type], bg: DEFAULT_FIELD_BACKGROUNDS[type] }]));
    return JSON.stringify({ types, values: {} });
}

export function addAppearancePanel(addPanel: AddPanel, text: SettingsPanelText): void {
    addPanel("display-appearance", defaultAppearance(), text.appearance.title, text.appearance.description, (value, commit) => {
        const state = parseObject<{ types?: Record<string, { color?: string; bg?: string }>; values?: Record<string, unknown> }>(value, {});
        const panel = createPanel("db-settings--appearance");
        const grid = document.createElement("div");
        grid.className = "db-settings__palette";
        FIELD_TYPES.forEach(type => {
            const row = document.createElement("label");
            row.className = "db-settings__palette-row";
            row.append(document.createTextNode(text.fieldTypes[type]));
            (["color", "bg"] as const).forEach(kind => {
                const control = createColorControl(
                    state.types?.[type]?.[kind],
                    kind === "color" ? DEFAULT_FIELD_COLORS[type] : DEFAULT_FIELD_BACKGROUNDS[type],
                    kind === "color" ? text.appearance.textColor : text.appearance.backgroundColor,
                    text.appearance.opacity
                );
                control.trigger.dataset.type = type;
                control.trigger.dataset.kind = kind;
                row.append(control.element);
            });
            grid.append(row);
        });

        const valueRules = document.createElement("section");
        valueRules.className = "db-settings__value-rules";
        const valueRulesTitle = document.createElement("strong");
        valueRulesTitle.textContent = text.appearance.valueRules;
        const list = document.createElement("div");
        list.className = "db-settings__value-rules-list";
        const addRule = document.createElement("button");
        addRule.type = "button";
        addRule.className = "b3-button b3-button--outline db-settings__add-rule";
        addRule.textContent = `+ ${text.appearance.addValueRule}`;
        const rules = Object.entries(state.values || {}).map(([name, raw]) => {
            if (typeof raw === "string") return { name, color: raw, background: "" };
            const rule = raw as { color?: string; bg?: string };
            return { name, color: rule.color || "#000000", background: rule.bg || "" };
        });

        const save = () => {
            const types: Record<string, { color: string; bg: string }> = {};
            grid.querySelectorAll<HTMLElement>("[data-type]").forEach(trigger => {
                const type = trigger.dataset.type || "";
                const kind = trigger.dataset.kind as "color" | "bg";
                types[type] ||= { color: "", bg: "" };
                types[type][kind] = readColorControl(trigger) || "#000000";
            });
            const values: Record<string, { color: string; bg?: string }> = {};
            list.querySelectorAll<HTMLElement>(".db-settings__value-rule").forEach(row => {
                const name = row.querySelector<HTMLInputElement>("[data-rule-name]")?.value.trim();
                const color = readColorControl(row.querySelector<HTMLElement>("[data-rule-color]"));
                const backgroundEnabled = row.querySelector<HTMLInputElement>("[data-rule-background-enabled]")?.checked;
                const background = readColorControl(row.querySelector<HTMLElement>("[data-rule-background]"));
                if (name && color) values[name] = backgroundEnabled && background ? { color, bg: background } : { color };
            });
            const nextValue = JSON.stringify({ types, values });
            panel.dataset.value = nextValue;
            commit(nextValue);
        };

        const renderRules = () => {
            list.replaceChildren();
            rules.forEach(rule => {
                const row = document.createElement("div");
                row.className = "db-settings__value-rule";
                const name = createTextInput(rule.name, text.appearance.valueName);
                name.dataset.ruleName = "true";
                const color = createColorControl(rule.color, "#000000", text.appearance.textColor, text.appearance.opacity);
                color.trigger.dataset.ruleColor = "true";
                const backgroundEnabled = createCheckbox(Boolean(rule.background));
                backgroundEnabled.title = text.appearance.enableBackground;
                backgroundEnabled.dataset.ruleBackgroundEnabled = "true";
                const background = createColorControl(rule.background, "#ffffff", text.appearance.backgroundColor, text.appearance.opacity);
                background.element.classList.toggle("fn__none", !rule.background);
                background.trigger.dataset.ruleBackground = "true";
                const remove = document.createElement("button");
                remove.type = "button";
                remove.className = "db-settings__remove-rule";
                remove.textContent = "×";
                remove.title = text.appearance.removeValueRule;
                backgroundEnabled.addEventListener("change", () => {
                    background.element.classList.toggle("fn__none", !backgroundEnabled.checked);
                    save();
                });
                remove.addEventListener("click", () => {
                    rules.splice(rules.indexOf(rule), 1);
                    renderRules();
                    save();
                });
                row.append(name, color.element, backgroundEnabled, background.element, remove);
                list.append(row);
            });
        };

        addRule.addEventListener("click", () => {
            rules.push({ name: text.appearance.newValue, color: "#000000", background: "" });
            renderRules();
            save();
        });
        grid.addEventListener("change", save);
        list.addEventListener("change", save);
        renderRules();
        valueRules.append(valueRulesTitle, list, addRule);
        panel.append(grid, valueRules);
        return panel;
    });
}
