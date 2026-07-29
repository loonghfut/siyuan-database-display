import { CheckboxStyle, DateFormat, FIELD_TYPES, FieldType } from "@/core/types";

export interface ColorRule {
    color?: string;
    bg?: string;
}

export interface AppearanceTheme {
    types?: Record<string, ColorRule>;
    values?: Record<string, unknown>;
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

export const DEFAULT_DARK_FIELD_COLORS: Record<string, string> = {
    mSelect: "#a5b4fc", number: "#93c5fd", date: "#86efac", text: "#e5e7eb", mAsset: "#c4b5fd",
    checkbox: "#6ee7b7", phone: "#5eead4", url: "#fdba74", email: "#f9a8d4", created: "#94a3b8", updated: "#94a3b8"
};

export const DEFAULT_DARK_FIELD_BACKGROUNDS: Record<string, string> = {
    mSelect: "rgba(99, 102, 241, 0.32)", number: "rgba(59, 130, 246, 0.32)", date: "rgba(34, 197, 94, 0.28)", text: "rgba(148, 163, 184, 0.2)", mAsset: "rgba(139, 92, 246, 0.3)",
    checkbox: "rgba(16, 185, 129, 0.28)", phone: "rgba(20, 184, 166, 0.28)", url: "rgba(245, 158, 11, 0.28)", email: "rgba(236, 72, 153, 0.28)", created: "rgba(100, 116, 139, 0.25)", updated: "rgba(100, 116, 139, 0.25)"
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
    const appearance = parseJsonObject<AppearanceTheme & { light?: AppearanceTheme; dark?: AppearanceTheme }>(get("display-appearance"), {});
    const themeMode = typeof document !== "undefined" && document.documentElement.dataset.themeMode === "dark" ? "dark" : "light";
    const themeAppearance = appearance[themeMode] || appearance;
    const max = Number(get("max-display-length"));
    const configuredMax = Number(formatSettings.maxDisplayLength ?? max);
    const dateFormat = formatSettings.dateFormat ?? get("date-format");
    const checkboxStyle = formatSettings.checkboxStyle ?? get("checkbox-style");
    const typeColors = themeAppearance.types || {};
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
        fieldColors: Object.keys(colors).length ? colors : sanitizeColorMap(get("field-color-map"), themeMode === "dark" ? DEFAULT_DARK_FIELD_COLORS : DEFAULT_FIELD_COLORS),
        fieldBackgrounds: Object.keys(backgrounds).length ? backgrounds : sanitizeColorMap(get("field-bg-color-map"), themeMode === "dark" ? DEFAULT_DARK_FIELD_BACKGROUNDS : DEFAULT_FIELD_BACKGROUNDS),
        valueColors: Object.keys(themeAppearance.values || {}).length ? sanitizeValueColors(JSON.stringify(themeAppearance.values)) : sanitizeValueColors(get("field-value-color-map"))
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
