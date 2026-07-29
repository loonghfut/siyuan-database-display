export interface ColorControl {
    element: HTMLElement;
    trigger: HTMLButtonElement;
}

function normalizeHex(value: string): string | undefined {
    const match = value.trim().match(/^#([\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i);
    if (!match) return undefined;
    const hex = match[1];
    return hex.length <= 4 ? `#${hex.slice(0, 3).split("").map(char => char + char).join("")}` : `#${hex.slice(0, 6)}`;
}

function parseColor(value: string | undefined, fallback: string): { hex: string; opacity: number } {
    const source = value?.trim() || fallback;
    const hex = normalizeHex(source);
    if (hex) {
        const alpha = source.length === 5 ? source.slice(4) : source.length === 9 ? source.slice(7) : "ff";
        return { hex, opacity: Math.round(parseInt(alpha, 16) / 255 * 100) };
    }
    const rgba = source.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)$/i);
    if (rgba) {
        const toHex = (part: string) => Math.min(255, Number(part)).toString(16).padStart(2, "0");
        return { hex: `#${toHex(rgba[1])}${toHex(rgba[2])}${toHex(rgba[3])}`, opacity: Math.round(Math.min(1, Number(rgba[4] ?? 1)) * 100) };
    }
    return { hex: normalizeHex(fallback) || "#000000", opacity: 100 };
}

function colorValue(color: string, opacity: number): string {
    if (opacity >= 100) return color;
    const hex = color.slice(1);
    const red = parseInt(hex.slice(0, 2), 16);
    const green = parseInt(hex.slice(2, 4), 16);
    const blue = parseInt(hex.slice(4, 6), 16);
    return `rgba(${red}, ${green}, ${blue}, ${Math.max(0, opacity) / 100})`;
}

function hexToRgb(hex: string): [number, number, number] {
    return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

function rgbToHsv(red: number, green: number, blue: number): [number, number, number] {
    const r = red / 255;
    const g = green / 255;
    const b = blue / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    let hue = 0;
    if (delta) {
        if (max === r) hue = 60 * (((g - b) / delta) % 6);
        else if (max === g) hue = 60 * ((b - r) / delta + 2);
        else hue = 60 * ((r - g) / delta + 4);
    }
    return [(hue + 360) % 360, max ? delta / max * 100 : 0, max * 100];
}

function hsvToHex(hue: number, saturation: number, brightness: number): string {
    const chroma = brightness / 100 * saturation / 100;
    const second = chroma * (1 - Math.abs((hue / 60) % 2 - 1));
    const match = brightness / 100 - chroma;
    const [r, g, b] = hue < 60 ? [chroma, second, 0] : hue < 120 ? [second, chroma, 0] : hue < 180 ? [0, chroma, second] : hue < 240 ? [0, second, chroma] : hue < 300 ? [second, 0, chroma] : [chroma, 0, second];
    const channel = (value: number) => Math.round((value + match) * 255).toString(16).padStart(2, "0");
    return `#${channel(r)}${channel(g)}${channel(b)}`;
}

let closeColorPicker: (() => void) | undefined;

function openColorPicker(trigger: HTMLButtonElement, initialValue: string, colorTitle: string, opacityTitle: string, onChange: (value: string, commit: boolean) => void): void {
    closeColorPicker?.();
    const initial = parseColor(initialValue, "#000000");
    let [hue, saturation, brightness] = rgbToHsv(...hexToRgb(initial.hex));
    let opacity = initial.opacity;
    const picker = document.createElement("div");
    picker.className = "db-color-picker";
    picker.setAttribute("role", "dialog");
    picker.setAttribute("aria-label", colorTitle);
    const close = document.createElement("button");
    close.type = "button";
    close.className = "db-color-picker__close";
    close.textContent = "×";
    const field = document.createElement("div");
    field.className = "db-color-picker__field";
    const cursor = document.createElement("span");
    cursor.className = "db-color-picker__field-cursor";
    field.append(cursor);
    const hueInput = document.createElement("input");
    hueInput.type = "range";
    hueInput.className = "db-color-picker__hue";
    hueInput.min = "0";
    hueInput.max = "360";
    hueInput.value = String(hue);
    const alphaInput = document.createElement("input");
    alphaInput.type = "range";
    alphaInput.className = "db-color-picker__alpha";
    alphaInput.min = "0";
    alphaInput.max = "100";
    alphaInput.value = String(opacity);
    alphaInput.title = opacityTitle;
    const hexInput = document.createElement("input");
    hexInput.className = "b3-text-field db-color-picker__hex";
    const alphaLabel = document.createElement("output");
    const update = (commit = false) => {
        const hex = hsvToHex(hue, saturation, brightness);
        field.style.backgroundColor = `hsl(${hue}, 100%, 50%)`;
        cursor.style.left = `${saturation}%`;
        cursor.style.top = `${100 - brightness}%`;
        alphaInput.style.background = `linear-gradient(to right, transparent, ${hex})`;
        hexInput.value = hex.toUpperCase();
        alphaLabel.textContent = `${opacity}%`;
        onChange(colorValue(hex, opacity), commit);
    };
    const setFieldPosition = (event: PointerEvent) => {
        const rect = field.getBoundingClientRect();
        saturation = Math.max(0, Math.min(100, (event.clientX - rect.left) / rect.width * 100));
        brightness = Math.max(0, Math.min(100, 100 - (event.clientY - rect.top) / rect.height * 100));
        update();
    };
    field.addEventListener("pointerdown", event => {
        field.setPointerCapture(event.pointerId);
        setFieldPosition(event);
    });
    field.addEventListener("pointermove", event => {
        if (event.buttons) setFieldPosition(event);
    });
    field.addEventListener("pointerup", () => update(true));
    hueInput.addEventListener("input", () => {
        hue = Number(hueInput.value);
        update();
    });
    hueInput.addEventListener("change", () => update(true));
    alphaInput.addEventListener("input", () => {
        opacity = Number(alphaInput.value);
        update();
    });
    alphaInput.addEventListener("change", () => update(true));
    hexInput.addEventListener("change", () => {
        const next = parseColor(hexInput.value, hsvToHex(hue, saturation, brightness));
        [hue, saturation, brightness] = rgbToHsv(...hexToRgb(next.hex));
        opacity = next.opacity;
        hueInput.value = String(hue);
        alphaInput.value = String(opacity);
        update(true);
    });
    picker.append(close, field, hueInput, alphaInput, alphaLabel, hexInput);
    document.body.append(picker);
    const rect = trigger.getBoundingClientRect();
    picker.style.left = `${Math.min(window.innerWidth - 270, Math.max(12, rect.left))}px`;
    picker.style.top = `${Math.min(window.innerHeight - 300, rect.bottom + 8)}px`;
    const dismiss = (event: MouseEvent | KeyboardEvent) => {
        if (event instanceof KeyboardEvent && event.key !== "Escape") return;
        if (event instanceof MouseEvent && (picker.contains(event.target as Node) || trigger.contains(event.target as Node))) return;
        cleanup();
    };
    const cleanup = () => {
        picker.remove();
        document.removeEventListener("mousedown", dismiss);
        document.removeEventListener("keydown", dismiss);
        if (closeColorPicker === cleanup) closeColorPicker = undefined;
    };
    close.addEventListener("click", cleanup);
    setTimeout(() => document.addEventListener("mousedown", dismiss), 0);
    document.addEventListener("keydown", dismiss);
    closeColorPicker = cleanup;
    update();
}

export function createColorControl(value: string | undefined, fallback: string, colorTitle: string, opacityTitle: string): ColorControl {
    const state = parseColor(value, fallback);
    const element = document.createElement("div");
    element.className = "db-color-control";
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "db-color-control__trigger";
    trigger.title = colorTitle;
    const valueLabel = document.createElement("output");
    const setValue = (next: string, emitChange = false) => {
        const parsed = parseColor(next, fallback);
        trigger.dataset.colorValue = next;
        trigger.style.setProperty("--db-color", parsed.hex);
        trigger.style.setProperty("--db-opacity", String(parsed.opacity / 100));
        valueLabel.textContent = parsed.opacity < 100 ? `${parsed.opacity}%` : "";
        if (emitChange) trigger.dispatchEvent(new Event("change", { bubbles: true }));
    };
    trigger.addEventListener("click", () => openColorPicker(trigger, trigger.dataset.colorValue || colorValue(state.hex, state.opacity), colorTitle, opacityTitle, setValue));
    element.append(trigger, valueLabel);
    setValue(colorValue(state.hex, state.opacity));
    return { element, trigger };
}

export function readColorControl(trigger: HTMLElement | null): string | undefined {
    return trigger?.dataset.colorValue;
}
