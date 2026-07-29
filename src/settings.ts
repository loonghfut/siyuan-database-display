import { DEFAULT_FIELD_BACKGROUNDS, DEFAULT_FIELD_COLORS, parseCsv } from "@/config/display-config";
import { FIELD_TYPES } from "@/core/types";
import { SettingUtils } from "@/libs/setting-utils";
import { getI18n } from "@/i18n";

type OnSettingsChanged = () => void;
function parseObject<T extends object>(value: unknown, fallback: T): T {
    if (typeof value !== "string") return fallback;
    try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as T : fallback;
    } catch {
        return fallback;
    }
}

function createPanel(className: string): HTMLElement {
    const panel = document.createElement("div");
    panel.className = `db-settings ${className}`;
    return panel;
}

function createLabel(text: string, control: HTMLElement): HTMLElement {
    const label = document.createElement("label");
    label.className = "db-settings__row";
    const title = document.createElement("span");
    title.textContent = text;
    label.append(title, control);
    return label;
}

function createTextInput(value: string, placeholder: string): HTMLInputElement {
    const input = document.createElement("input");
    input.className = "b3-text-field";
    input.value = value;
    input.placeholder = placeholder;
    return input;
}

function createSelect(options: Record<string, string>, value: string): HTMLSelectElement {
    const select = document.createElement("select");
    select.className = "b3-select";
    Object.entries(options).forEach(([key, label]) => {
        const option = document.createElement("option");
        option.value = key;
        option.textContent = label;
        select.append(option);
    });
    select.value = value;
    return select;
}

function createCheckbox(checked: boolean): HTMLInputElement {
    const input = document.createElement("input");
    input.type = "checkbox";
    input.className = "b3-switch";
    input.checked = checked;
    return input;
}

function bindCommit(panel: HTMLElement, commit: () => void): void {
    panel.addEventListener("change", commit);
    panel.addEventListener("blur", event => {
        if (event.target instanceof HTMLInputElement && event.target.type !== "checkbox") commit();
    }, true);
}

export function addSettings(settings: SettingUtils, onChanged: OnSettingsChanged): void {
    const i18n = getI18n();
    const panelText = i18n.settings.panel;
    const addPanel = (key: string, value: string, title: string, description: string, render: (value: string, commit: (value: string) => void) => HTMLElement) => {
        settings.addItem({
            key,
            value,
            type: "custom",
            title,
            description,
            direction: "row",
            createElement: current => {
                const panel = render(String(current || value), next => {
                    settings.set(key, next);
                    void settings.save().then(onChanged);
                });
                panel.dataset.value = String(current || value);
                return panel;
            },
            getEleVal: element => element?.dataset.value || value,
            setEleVal: (element, next) => {
                if (element) element.dataset.value = String(next || value);
            }
        });
    };

    addPanel("display-fields", JSON.stringify({ document: "", block: "mSelect,text" }), panelText.displayFields.title, panelText.displayFields.description, (value, commit) => {
        const state = parseObject<{ document?: string; block?: string }>(value, {});
        const panel = createPanel("db-settings--fields");
        const selected = {
            document: new Set(parseCsv(state.document)),
            block: new Set(parseCsv(state.block))
        };
        (["document", "block"] as const).forEach(scope => {
            const section = document.createElement("section");
            const heading = document.createElement("strong");
            heading.textContent = scope === "document" ? panelText.displayFields.document : panelText.displayFields.block;
            const chips = document.createElement("div");
            chips.className = "db-settings__chips";
            FIELD_TYPES.forEach(type => {
                const label = document.createElement("label");
                label.className = "db-settings__check";
                const input = createCheckbox(selected[scope].has(type));
                input.dataset.scope = scope;
                input.dataset.type = type;
                label.append(input, document.createTextNode(panelText.fieldTypes[type]));
                chips.append(label);
            });
            section.append(heading, chips);
            panel.append(section);
        });
        bindCommit(panel, () => {
            const next = { document: [] as string[], block: [] as string[] };
            panel.querySelectorAll<HTMLInputElement>("input[data-scope]").forEach(input => {
                if (input.checked) next[input.dataset.scope as "document" | "block"].push(input.dataset.type || "");
            });
            const nextValue = JSON.stringify({ document: next.document.join(","), block: next.block.join(",") });
            panel.dataset.value = nextValue;
            commit(nextValue);
        });
        return panel;
    });

    addPanel("field-rules", JSON.stringify({ hidden: "", force: "" }), panelText.fieldRules.title, panelText.fieldRules.description, (value, commit) => {
        const state = parseObject<{ hidden?: string; force?: string }>(value, {});
        const panel = createPanel("db-settings--rules");
        const hidden = createTextInput(state.hidden || "", panelText.fieldRules.hiddenPlaceholder);
        const force = createTextInput(state.force || "", panelText.fieldRules.forcePlaceholder);
        panel.append(createLabel(panelText.fieldRules.hidden, hidden), createLabel(panelText.fieldRules.force, force));
        bindCommit(panel, () => {
            const nextValue = JSON.stringify({ hidden: hidden.value, force: force.value });
            panel.dataset.value = nextValue;
            commit(nextValue);
        });
        return panel;
    });

    addPanel("display-format", JSON.stringify({ dateFormat: "YYYY-MM-DD", includeTime: false, checkboxStyle: "emoji", showTimestamps: true, maxDisplayLength: 30 }), panelText.format.title, panelText.format.description, (value, commit) => {
        const state = parseObject<{ dateFormat?: string; includeTime?: boolean; checkboxStyle?: string; showTimestamps?: boolean; maxDisplayLength?: number }>(value, {});
        const panel = createPanel("db-settings--format");
        const date = createSelect(i18n.settings.dateFormat.options, state.dateFormat || "YYYY-MM-DD");
        const checkbox = createSelect(i18n.settings.checkboxStyle.options, state.checkboxStyle || "emoji");
        const includeTime = createCheckbox(Boolean(state.includeTime));
        const timestamps = createCheckbox(state.showTimestamps !== false);
        const length = document.createElement("input");
        length.type = "number";
        length.className = "b3-text-field";
        length.min = "10";
        length.max = "200";
        length.value = String(state.maxDisplayLength || 30);
        panel.append(createLabel(panelText.format.date, date), createLabel(panelText.format.checkbox, checkbox), createLabel(panelText.format.time, includeTime), createLabel(panelText.format.timestamps, timestamps), createLabel(panelText.format.maxLength, length));
        bindCommit(panel, () => {
            const nextValue = JSON.stringify({ dateFormat: date.value, checkboxStyle: checkbox.value, includeTime: includeTime.checked, showTimestamps: timestamps.checked, maxDisplayLength: Math.min(200, Math.max(10, Number(length.value) || 30)) });
            panel.dataset.value = nextValue;
            commit(nextValue);
        });
        return panel;
    });

    addPanel("display-appearance", JSON.stringify({ types: Object.fromEntries(FIELD_TYPES.map(type => [type, { color: DEFAULT_FIELD_COLORS[type], bg: DEFAULT_FIELD_BACKGROUNDS[type] }])), values: {} }), panelText.appearance.title, panelText.appearance.description, (value, commit) => {
        const state = parseObject<{ types?: Record<string, { color?: string; bg?: string }>; values?: Record<string, unknown> }>(value, {});
        const panel = createPanel("db-settings--appearance");
        const grid = document.createElement("div");
        grid.className = "db-settings__palette";
        FIELD_TYPES.forEach(type => {
            const row = document.createElement("label");
            row.className = "db-settings__palette-row";
            row.append(document.createTextNode(panelText.fieldTypes[type]));
            (["color", "bg"] as const).forEach(kind => {
                const input = document.createElement("input");
                input.type = "color";
                input.title = kind === "color" ? panelText.appearance.textColor : panelText.appearance.backgroundColor;
                input.dataset.type = type;
                input.dataset.kind = kind;
                input.value = state.types?.[type]?.[kind] || (kind === "color" ? DEFAULT_FIELD_COLORS[type] : DEFAULT_FIELD_BACKGROUNDS[type]);
                row.append(input);
            });
            grid.append(row);
        });
        const values = document.createElement("textarea");
        values.className = "b3-text-field db-settings__value-rules";
        values.placeholder = panelText.appearance.valuePlaceholder;
        values.value = Object.keys(state.values || {}).length ? JSON.stringify(state.values, null, 2) : "";
        panel.append(grid, values);
        bindCommit(panel, () => {
            let valueRules: Record<string, unknown> = {};
            try {
                valueRules = values.value.trim() ? JSON.parse(values.value) : {};
            } catch {
                values.classList.add("b3-text-field--error");
                return;
            }
            values.classList.remove("b3-text-field--error");
            const types: Record<string, { color: string; bg: string }> = {};
            grid.querySelectorAll<HTMLInputElement>("input[data-type]").forEach(input => {
                const type = input.dataset.type || "";
                const kind = input.dataset.kind as "color" | "bg";
                types[type] ||= { color: "", bg: "" };
                types[type][kind] = input.value;
            });
            const nextValue = JSON.stringify({ types, values: valueRules });
            panel.dataset.value = nextValue;
            commit(nextValue);
        });
        return panel;
    });

    addPanel("refresh-options", JSON.stringify({ interval: 0, observerEnabled: true }), panelText.refresh.title, panelText.refresh.description, (value, commit) => {
        const state = parseObject<{ interval?: number; observerEnabled?: boolean }>(value, {});
        const panel = createPanel("db-settings--refresh");
        const interval = document.createElement("input");
        interval.type = "number";
        interval.className = "b3-text-field";
        interval.min = "0";
        interval.value = String(state.interval || 0);
        const observer = createCheckbox(state.observerEnabled !== false);
        panel.append(createLabel(panelText.refresh.interval, interval), createLabel(panelText.refresh.observer, observer));
        bindCommit(panel, () => {
            const nextValue = JSON.stringify({ interval: Number(interval.value) > 0 ? Math.max(5, Number(interval.value)) : 0, observerEnabled: observer.checked });
            panel.dataset.value = nextValue;
            commit(nextValue);
        });
        return panel;
    });
}

export function migrateLegacySettings(settings: SettingUtils, saved: unknown): boolean {
    const data = saved as Record<string, unknown> | null;
    if (!data) return false;
    let changed = false;
    const migrate = (key: string, value: unknown) => {
        if (Object.prototype.hasOwnProperty.call(data, key)) return;
        settings.set(key, JSON.stringify(value));
        changed = true;
    };
    migrate("display-fields", { document: data["dis-show"] || "", block: data["dis-show-block"] || "mSelect,text" });
    migrate("field-rules", { hidden: data["hidden-fields"] || "", force: data["force-show-fields"] || "" });
    migrate("display-format", { dateFormat: data["date-format"] || "YYYY-MM-DD", includeTime: Boolean(data["include-time"]), checkboxStyle: data["checkbox-style"] || "emoji", showTimestamps: data["show-timestamps"] !== false, maxDisplayLength: data["max-display-length"] || 30 });
    migrate("display-appearance", {
        types: Object.fromEntries(FIELD_TYPES.map(type => [type, { color: parseObject<Record<string, string>>(data["field-color-map"], DEFAULT_FIELD_COLORS)[type] || DEFAULT_FIELD_COLORS[type], bg: parseObject<Record<string, string>>(data["field-bg-color-map"], DEFAULT_FIELD_BACKGROUNDS)[type] || DEFAULT_FIELD_BACKGROUNDS[type] }])),
        values: parseObject<Record<string, unknown>>(data["field-value-color-map"], {})
    });
    migrate("refresh-options", { interval: data["auto-loaded-interval"] || 0, observerEnabled: data["enable-av-observer"] !== false });
    return changed;
}
