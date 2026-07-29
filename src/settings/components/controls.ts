export type CommitValue = (value: string) => void;

export function parseObject<T extends object>(value: unknown, fallback: T): T {
    if (typeof value !== "string") return fallback;
    try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as T : fallback;
    } catch {
        return fallback;
    }
}

export function createPanel(className: string): HTMLElement {
    const panel = document.createElement("div");
    panel.className = `db-settings ${className}`;
    return panel;
}

export function createLabel(text: string, control: HTMLElement): HTMLElement {
    const label = document.createElement("label");
    label.className = "db-settings__row";
    const title = document.createElement("span");
    title.textContent = text;
    label.append(title, control);
    return label;
}

export function createTextInput(value: string, placeholder: string): HTMLInputElement {
    const input = document.createElement("input");
    input.className = "b3-text-field";
    input.value = value;
    input.placeholder = placeholder;
    return input;
}

export function createSelect(options: Record<string, string>, value: string): HTMLSelectElement {
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

export function createCheckbox(checked: boolean, compact = false): HTMLInputElement {
    const input = document.createElement("input");
    input.type = "checkbox";
    input.className = compact ? "db-settings__check-input" : "b3-switch";
    input.checked = checked;
    return input;
}

export function bindCommit(panel: HTMLElement, commit: () => void): void {
    panel.addEventListener("change", commit);
    panel.addEventListener("blur", event => {
        if (event.target instanceof HTMLInputElement && event.target.type !== "checkbox") commit();
    }, true);
}
