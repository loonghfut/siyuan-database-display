import { DEFAULT_DARK_FIELD_BACKGROUNDS, DEFAULT_DARK_FIELD_COLORS, DEFAULT_FIELD_BACKGROUNDS, DEFAULT_FIELD_COLORS } from "@/config/display-config";
import { FIELD_TYPES } from "@/core/types";
import { createColorControl, readColorControl } from "../components/color-picker";
import { createCheckbox, createPanel, createTextInput, parseObject } from "../components/controls";
import { AddPanel, SettingsPanelText } from "../types";

type ThemeName = "light" | "dark";

interface ThemeAppearance {
    types: Record<string, { color?: string; bg?: string }>;
    values: Record<string, unknown>;
}

interface AppearanceState {
    light: ThemeAppearance;
    dark: ThemeAppearance;
}

function defaultTheme(colors: Record<string, string>, backgrounds: Record<string, string>): ThemeAppearance {
    return {
        types: Object.fromEntries(FIELD_TYPES.map(type => [type, { color: colors[type], bg: backgrounds[type] }])),
        values: {}
    };
}

function defaultAppearance(): AppearanceState {
    return {
        light: defaultTheme(DEFAULT_FIELD_COLORS, DEFAULT_FIELD_BACKGROUNDS),
        dark: defaultTheme(DEFAULT_DARK_FIELD_COLORS, DEFAULT_DARK_FIELD_BACKGROUNDS)
    };
}

function normalizeTheme(value: unknown, fallback: ThemeAppearance): ThemeAppearance {
    const source = value && typeof value === "object" && !Array.isArray(value) ? value as Partial<ThemeAppearance> : {};
    return { types: source.types || fallback.types, values: source.values || {} };
}

function normalizeAppearance(value: unknown): AppearanceState {
    const defaults = defaultAppearance();
    const source = value && typeof value === "object" && !Array.isArray(value) ? value as Partial<AppearanceState & ThemeAppearance> : {};
    const legacy = { types: source.types, values: source.values };
    return {
        light: normalizeTheme(source.light || legacy, defaults.light),
        dark: normalizeTheme(source.dark || legacy, defaults.dark)
    };
}

function activeTheme(): ThemeName {
    return document.documentElement.dataset.themeMode === "dark" ? "dark" : "light";
}

export function addAppearancePanel(addPanel: AddPanel, text: SettingsPanelText): void {
    addPanel("display-appearance", JSON.stringify(defaultAppearance()), text.appearance.title, text.appearance.description, (value, commit) => {
        const state = normalizeAppearance(parseObject<object>(value, {}));
        const panel = createPanel("db-settings--appearance");
        const tabs = document.createElement("div");
        tabs.className = "db-settings__theme-tabs";
        const editor = document.createElement("div");
        let theme = activeTheme();

        const save = () => {
            const types: Record<string, { color: string; bg: string }> = {};
            editor.querySelectorAll<HTMLElement>("[data-type]").forEach(trigger => {
                const type = trigger.dataset.type || "";
                const kind = trigger.dataset.kind as "color" | "bg";
                types[type] ||= { color: "", bg: "" };
                types[type][kind] = readColorControl(trigger) || "#000000";
            });
            const values: Record<string, { color: string; bg?: string }> = {};
            editor.querySelectorAll<HTMLElement>(".db-settings__value-rule").forEach(row => {
                const name = row.querySelector<HTMLInputElement>("[data-rule-name]")?.value.trim();
                const color = readColorControl(row.querySelector<HTMLElement>("[data-rule-color]"));
                const backgroundEnabled = row.querySelector<HTMLInputElement>("[data-rule-background-enabled]")?.checked;
                const background = readColorControl(row.querySelector<HTMLElement>("[data-rule-background]"));
                if (name && color) values[name] = backgroundEnabled && background ? { color, bg: background } : { color };
            });
            state[theme] = { types, values };
            const nextValue = JSON.stringify(state);
            panel.dataset.value = nextValue;
            commit(nextValue);
        };

        const renderEditor = () => {
            const current = state[theme];
            editor.replaceChildren();
            const grid = document.createElement("div");
            grid.className = "db-settings__palette";
            const defaults = theme === "dark"
                ? { colors: DEFAULT_DARK_FIELD_COLORS, backgrounds: DEFAULT_DARK_FIELD_BACKGROUNDS }
                : { colors: DEFAULT_FIELD_COLORS, backgrounds: DEFAULT_FIELD_BACKGROUNDS };
            FIELD_TYPES.forEach(type => {
                const row = document.createElement("label");
                row.className = "db-settings__palette-row";
                row.append(document.createTextNode(text.fieldTypes[type]));
                (["color", "bg"] as const).forEach(kind => {
                    const control = createColorControl(
                        current.types[type]?.[kind],
                        kind === "color" ? defaults.colors[type] : defaults.backgrounds[type],
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
            const title = document.createElement("strong");
            title.textContent = text.appearance.valueRules;
            const list = document.createElement("div");
            list.className = "db-settings__value-rules-list";
            const addRule = document.createElement("button");
            addRule.type = "button";
            addRule.className = "b3-button b3-button--outline db-settings__add-rule";
            addRule.textContent = `+ ${text.appearance.addValueRule}`;
            const rules = Object.entries(current.values).map(([name, raw]) => {
                if (typeof raw === "string") return { name, color: raw, background: "" };
                const rule = raw as { color?: string; bg?: string };
                return { name, color: rule.color || "#000000", background: rule.bg || "" };
            });
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
                    remove.title = text.appearance.removeValueRule;
                    remove.setAttribute("aria-label", text.appearance.removeValueRule);
                    backgroundEnabled.addEventListener("change", () => background.element.classList.toggle("fn__none", !backgroundEnabled.checked));
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
            renderRules();
            valueRules.append(title, list, addRule);
            editor.append(grid, valueRules);
            tabs.querySelectorAll<HTMLButtonElement>("button").forEach(button => button.classList.toggle("db-settings__theme-tab--active", button.dataset.theme === theme));
        };

        (["light", "dark"] as const).forEach(name => {
            const tab = document.createElement("button");
            tab.type = "button";
            tab.className = "b3-button b3-button--outline db-settings__theme-tab";
            tab.dataset.theme = name;
            tab.textContent = name === "light" ? text.appearance.lightTheme : text.appearance.darkTheme;
            tab.addEventListener("click", () => {
                if (theme === name) return;
                save();
                theme = name;
                renderEditor();
            });
            tabs.append(tab);
        });
        editor.addEventListener("change", save);
        renderEditor();
        panel.append(tabs, editor);
        return panel;
    });
}
