import { CheckboxStyle, DateFormat, FIELD_TYPES, FieldType } from "@/core/types";

export interface ColorRule {
    color?: string;
    bg?: string;
}

export interface DisplayConfig {
    documentFields: FieldType[];
    blockFields: FieldType[];
    hiddenFields: Set<string>;
    forceShowFields: Set<string>;
    dateFormat: DateFormat;
    includeTime: boolean;
    checkboxStyle: CheckboxStyle;
    maxDisplayLength: number;
    showFieldNames: boolean;
    fieldColors: Record<string, string>;
    fieldBackgrounds: Record<string, string>;
    valueColors: Record<string, string | ColorRule>;
}

export interface RefreshOptions {
    interval: number;
    observerEnabled: boolean;
}

const fieldTypeSet = new Set<string>(FIELD_TYPES);

export const DEFAULT_FIELD_COLORS: Record<string, string> = {
    mSelect: "#4f46e5", number: "#2563eb", date: "#15803d", text: "#374151", mAsset: "#7c3aed",
    checkbox: "#047857", phone: "#0f766e", url: "#b45309", email: "#be185d", created: "#64748b", updated: "#64748b"
};

export const DEFAULT_FIELD_BACKGROUNDS: Record<string, string> = {
    mSelect: "#eef2ff", number: "#eff6ff", date: "#f0fdf4", text: "#f8fafc", mAsset: "#f5f3ff",
    checkbox: "#ecfdf5", phone: "#f0fdfa", url: "#fffbeb", email: "#fdf2f8", created: "#f8fafc", updated: "#f8fafc"
};

export function parseCsv(value: unknown): string[] {
    if (typeof value !== "string") return [];
    return [...new Set(value.split(",").map(item => item.trim()).filter(Boolean))];
}

function parseFieldTypes(value: unknown): FieldType[] {
    const requested = parseCsv(value);
    return requested.filter((item): item is FieldType => fieldTypeSet.has(item));
}

function parseFieldTypesOrDefault(value: unknown, fallback: FieldType[]): FieldType[] {
    if (typeof value !== "string") return fallback;
    return parseFieldTypes(value);
}

function parseJsonObject<T extends object>(value: unknown, fallback: T): T {
    if (typeof value !== "string" || !value.trim()) return fallback;
    try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as T : fallback;
    } catch {
        return fallback;
    }
}

export function isSafeColor(value: unknown): value is string {
    return typeof value === "string" && (/^#[\da-f]{3,8}$/i.test(value) || /^rgb(a)?\([^)]*\)$/i.test(value) || /^var\(--[\w-]+\)$/.test(value));
}

function sanitizeColorMap(value: unknown, fallback: Record<string, string>): Record<string, string> {
    const source = parseJsonObject<Record<string, unknown>>(value, fallback);
    return Object.fromEntries(Object.entries(source).filter(([, color]) => isSafeColor(color))) as Record<string, string>;
}

function sanitizeValueColors(value: unknown): Record<string, string | ColorRule> {
    const source = parseJsonObject<Record<string, unknown>>(value, {});
    const result: Record<string, string | ColorRule> = {};
    for (const [name, rule] of Object.entries(source)) {
        if (isSafeColor(rule)) {
            result[name] = rule;
            continue;
        }
        if (!rule || typeof rule !== "object" || Array.isArray(rule)) continue;
        const colorRule = rule as ColorRule;
        const sanitized: ColorRule = {};
        if (isSafeColor(colorRule.color)) sanitized.color = colorRule.color;
        if (isSafeColor(colorRule.bg)) sanitized.bg = colorRule.bg;
        if (Object.keys(sanitized).length) result[name] = sanitized;
    }
    return result;
}

export function readDisplayConfig(get: (key: string) => unknown): DisplayConfig {
    const fieldSettings = parseJsonObject<{ document?: string; block?: string }>(get("display-fields"), {});
    const fieldRules = parseJsonObject<{ hidden?: string; force?: string }>(get("field-rules"), {});
    const formatSettings = parseJsonObject<Partial<{ dateFormat: DateFormat; includeTime: boolean; checkboxStyle: CheckboxStyle; maxDisplayLength: number; showFieldNames: boolean }>>(get("display-format"), {});
    const appearance = parseJsonObject<{ types?: Record<string, ColorRule>; values?: Record<string, unknown> }>(get("display-appearance"), {});
    const max = Number(get("max-display-length"));
    const configuredMax = Number(formatSettings.maxDisplayLength ?? max);
    const dateFormat = formatSettings.dateFormat ?? get("date-format");
    const checkboxStyle = formatSettings.checkboxStyle ?? get("checkbox-style");
    const typeColors = appearance.types || {};
    const colors = Object.fromEntries(Object.entries(typeColors).flatMap(([type, rule]) => isSafeColor(rule?.color) ? [[type, rule.color]] : []));
    const backgrounds = Object.fromEntries(Object.entries(typeColors).flatMap(([type, rule]) => isSafeColor(rule?.bg) ? [[type, rule.bg]] : []));
    return {
        documentFields: parseFieldTypesOrDefault(fieldSettings.document ?? get("dis-show"), [...FIELD_TYPES]),
        blockFields: parseFieldTypesOrDefault(fieldSettings.block ?? get("dis-show-block"), ["mSelect", "text"]),
        hiddenFields: new Set(parseCsv(fieldRules.hidden ?? get("hidden-fields"))),
        forceShowFields: new Set(parseCsv(fieldRules.force ?? get("force-show-fields")).filter(name => name !== "*")),
        dateFormat: ["YYYY-MM-DD", "YYYY/MM/DD", "MM/DD/YYYY", "DD/MM/YYYY", "full", "relative"].includes(String(dateFormat)) ? dateFormat as DateFormat : "YYYY-MM-DD",
        includeTime: formatSettings.includeTime ?? Boolean(get("include-time")),
        checkboxStyle: ["emoji", "symbol", "text"].includes(String(checkboxStyle)) ? checkboxStyle as CheckboxStyle : "emoji",
        maxDisplayLength: Number.isFinite(configuredMax) ? Math.min(200, Math.max(10, configuredMax || 30)) : 30,
        showFieldNames: formatSettings.showFieldNames === true,
        fieldColors: Object.keys(colors).length ? colors : sanitizeColorMap(get("field-color-map"), DEFAULT_FIELD_COLORS),
        fieldBackgrounds: Object.keys(backgrounds).length ? backgrounds : sanitizeColorMap(get("field-bg-color-map"), DEFAULT_FIELD_BACKGROUNDS),
        valueColors: Object.keys(appearance.values || {}).length ? sanitizeValueColors(JSON.stringify(appearance.values)) : sanitizeValueColors(get("field-value-color-map"))
    };
}

export function readRefreshOptions(get: (key: string) => unknown): RefreshOptions {
    const settings = parseJsonObject<Partial<RefreshOptions>>(get("refresh-options"), {});
    const value = Number(settings.interval ?? get("auto-loaded-interval"));
    return {
        interval: !Number.isFinite(value) || value <= 0 ? 0 : Math.max(5, value),
        observerEnabled: settings.observerEnabled ?? Boolean(get("enable-av-observer"))
    };
}

export function serializeColorMap(colors: Record<string, string>): string {
    return JSON.stringify(colors, null, 2);
}
