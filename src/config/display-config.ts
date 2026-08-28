import { CheckboxStyle, DateFormat, FIELD_TYPES, FieldType } from "@/core/types";

export interface ColorRule {
    color?: string;
    bg?: string;
}

export interface AppearanceTheme {
    types?: Record<string, ColorRule>;
    values?: Record<string, unknown>;
}

/** 属性布局：above/below = 纵向列表；inline = 思源原生右上角横排 */
export type DisplayLayout = "inline" | "above" | "below";
export type ListLayoutStyle = "grid" | "waterfall";
/** 列表项样式：plain = 纯文字；capsule = 胶囊徽章；accent = 彩色强调条 */
export type ListItemStyle = "plain" | "capsule" | "accent";
export type EditTrigger = "click" | "dblclick";

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
    listFontSize: number;
    listMultiColumn: boolean;
    listLayoutStyle: ListLayoutStyle;
    listItemStyle: ListItemStyle;
    cardEnabled: boolean;
    editTrigger: EditTrigger;
    layout: DisplayLayout;
    fieldColors: Record<string, string>;
    fieldBackgrounds: Record<string, string>;
    valueColors: Record<string, string | ColorRule>;
}

const fieldTypeSet = new Set<string>(FIELD_TYPES);

export const DEFAULT_FIELD_COLORS: Record<string, string> = {
    mSelect: "#4338ca", number: "#1d4ed8", date: "#047857", text: "#334155", template: "#7e22ce", mAsset: "#6d28d9", relation: "#0e7490",
    rollup: "#a16207", block: "#c2410c", lineNumber: "#475569", checkbox: "#047857", phone: "#0f766e", url: "#a16207", email: "#be185d", created: "#475569", updated: "#475569"
};

export const DEFAULT_FIELD_BACKGROUNDS: Record<string, string> = {
    mSelect: "#e0e7ff", number: "#dbeafe", date: "#d1fae5", text: "#e2e8f0", template: "#f3e8ff", mAsset: "#ede9fe", relation: "#cffafe",
    rollup: "#fef3c7", block: "#ffedd5", lineNumber: "#e2e8f0", checkbox: "#d1fae5", phone: "#ccfbf1", url: "#fef3c7", email: "#fce7f3", created: "#e2e8f0", updated: "#e2e8f0"
};

export const DEFAULT_DARK_FIELD_COLORS: Record<string, string> = {
    mSelect: "#c7d2fe", number: "#bfdbfe", date: "#a7f3d0", text: "#e2e8f0", template: "#e9d5ff", mAsset: "#ddd6fe", relation: "#a5f3fc",
    rollup: "#fde68a", block: "#fed7aa", lineNumber: "#cbd5e1", checkbox: "#a7f3d0", phone: "#99f6e4", url: "#fde68a", email: "#fbcfe8", created: "#cbd5e1", updated: "#cbd5e1"
};

export const DEFAULT_DARK_FIELD_BACKGROUNDS: Record<string, string> = {
    mSelect: "#292756", number: "#18345f", date: "#143f33", text: "#293545", template: "#40235d", mAsset: "#322654", relation: "#123e4b",
    rollup: "#4a3a18", block: "#4a2d1d", lineNumber: "#2c3848", checkbox: "#124438", phone: "#10443f", url: "#4a3a18", email: "#4a2039", created: "#2c3848", updated: "#2c3848"
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

export function parseJsonObject<T extends object>(value: unknown, fallback: T): T {
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
    const formatSettings = parseJsonObject<Partial<{ dateFormat: DateFormat; includeTime: boolean; checkboxStyle: CheckboxStyle; maxDisplayLength: number; showFieldNames: boolean; listFontSize: number; listMultiColumn: boolean; listLayoutStyle: ListLayoutStyle; listItemStyle: ListItemStyle; cardEnabled: boolean; editTrigger: EditTrigger; layout: DisplayLayout }>>(get("display-format"), {});
    const appearance = parseJsonObject<AppearanceTheme & { light?: AppearanceTheme; dark?: AppearanceTheme }>(get("display-appearance"), {});
    const themeMode = typeof document !== "undefined" && document.documentElement.dataset.themeMode === "dark" ? "dark" : "light";
    const themeAppearance = appearance[themeMode] || appearance;
    const defaultColors = themeMode === "dark" ? DEFAULT_DARK_FIELD_COLORS : DEFAULT_FIELD_COLORS;
    const defaultBackgrounds = themeMode === "dark" ? DEFAULT_DARK_FIELD_BACKGROUNDS : DEFAULT_FIELD_BACKGROUNDS;
    const max = Number(get("max-display-length"));
    const configuredMax = Number(formatSettings.maxDisplayLength ?? max);
    const dateFormat = formatSettings.dateFormat ?? get("date-format");
    const checkboxStyle = formatSettings.checkboxStyle ?? get("checkbox-style");
    const typeColors = themeAppearance.types || {};
    const colors = Object.fromEntries(Object.entries(typeColors).flatMap(([type, rule]) => isSafeColor(rule?.color) ? [[type, rule.color]] : []));
    const backgrounds = Object.fromEntries(Object.entries(typeColors).flatMap(([type, rule]) => isSafeColor(rule?.bg) ? [[type, rule.bg]] : []));
    return {
        documentFields: parseFieldTypesOrDefault(fieldSettings.document ?? get("dis-show"), [...FIELD_TYPES]),
        blockFields: parseFieldTypesOrDefault(fieldSettings.block ?? get("dis-show-block"), ["mSelect", "text", "relation"]),
        hiddenFields: new Set(parseCsv(fieldRules.hidden ?? get("hidden-fields"))),
        forceShowFields: new Set(parseCsv(fieldRules.force ?? get("force-show-fields")).filter(name => name !== "*")),
        dateFormat: ["YYYY-MM-DD", "YYYY/MM/DD", "MM/DD/YYYY", "DD/MM/YYYY", "full", "relative"].includes(String(dateFormat)) ? dateFormat as DateFormat : "YYYY-MM-DD",
        includeTime: formatSettings.includeTime ?? Boolean(get("include-time")),
        // 旧的 emoji/symbol 样式已移除，读取时统一迁移为 icon
        checkboxStyle: checkboxStyle === "text" ? "text" : "icon",
        maxDisplayLength: Number.isFinite(configuredMax) ? Math.min(200, Math.max(10, configuredMax || 30)) : 30,
        showFieldNames: formatSettings.showFieldNames === true,
        listFontSize: Number.isFinite(Number(formatSettings.listFontSize))
            ? Math.min(24, Math.max(10, Number(formatSettings.listFontSize)))
            : 12,
        listMultiColumn: formatSettings.listMultiColumn !== false,
        listLayoutStyle: formatSettings.listLayoutStyle === "waterfall" ? "waterfall" : "grid",
        listItemStyle: formatSettings.listItemStyle === "capsule" ? "capsule" : formatSettings.listItemStyle === "accent" ? "accent" : "plain",
        cardEnabled: formatSettings.cardEnabled !== false,
        editTrigger: formatSettings.editTrigger === "dblclick" ? "dblclick" : "click",
        layout: formatSettings.layout === "inline"
                    ? "inline"
                    : formatSettings.layout === "above"
                        ? "above"
                        : "below",
        // 用户配色叠加在默认配色之上：只配置了部分类型（或旧版只迁移了部分类型）时，
        // 其余类型回落默认值，避免胶囊底色/字段文字色在未配置的字段上整组丢失
        fieldColors: { ...sanitizeColorMap(get("field-color-map"), defaultColors), ...colors },
        fieldBackgrounds: { ...sanitizeColorMap(get("field-bg-color-map"), defaultBackgrounds), ...backgrounds },
        valueColors: Object.keys(themeAppearance.values || {}).length ? sanitizeValueColors(JSON.stringify(themeAppearance.values)) : sanitizeValueColors(get("field-value-color-map"))
    };
}

export function serializeColorMap(colors: Record<string, string>): string {
    return JSON.stringify(colors, null, 2);
}
