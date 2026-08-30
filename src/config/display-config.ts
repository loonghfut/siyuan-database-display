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
/** 列表行高倍率：normal 与内置版式一致，compact/relaxed 为可选密度 */
export type ListLineHeight = "compact" | "normal" | "relaxed";
/** 列表行间距（网格 row-gap）：normal 与内置版式一致 */
export type ListRowGap = "tight" | "normal" | "relaxed";
/** 列表字段值最大行数：unlimited 与内置行为一致（不截断） */
export type ListValueLines = "unlimited" | "one" | "two" | "three";
/** 胶囊圆角：auto 沿用内置圆角（随字号缩放），其余为固定像素 */
export type ListItemRadius = "auto" | "none" | "small" | "medium" | "pill";
/** 卡片圆角：auto 跟随思源主题圆角 */
export type CardRadius = "auto" | "none" | "small" | "medium" | "large";
/** 卡片内边距（同时决定属性列表与卡片边缘的间距） */
export type CardPadding = "tight" | "normal" | "loose";

export const LIST_LINE_HEIGHTS: Record<ListLineHeight, number> = { compact: 1.25, normal: 1.35, relaxed: 1.6 };
export const LIST_ROW_GAPS: Record<ListRowGap, number> = { tight: 0, normal: 2, relaxed: 6 };
export const LIST_VALUE_LINES: Record<ListValueLines, number> = { unlimited: 0, one: 1, two: 2, three: 3 };
/** null = 不写入变量，回落样式表内置圆角 */
export const LIST_ITEM_RADII: Record<ListItemRadius, string | null> = { auto: null, none: "0px", small: "3px", medium: "6px", pill: "999px" };
export const CARD_RADII: Record<CardRadius, string | null> = { auto: null, none: "0px", small: "4px", medium: "8px", large: "12px" };
export const CARD_PADDINGS: Record<CardPadding, number> = { tight: 4, normal: 8, loose: 14 };

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
    listLineHeight: ListLineHeight;
    listRowGap: ListRowGap;
    listValueLines: ListValueLines;
    listItemRadius: ListItemRadius;
    /** 列表模式下是否把字段名统一为最长字段名宽度；关闭后字段名紧跟其值 */
    alignFieldNames: boolean;
    cardEnabled: boolean;
    cardRadius: CardRadius;
    cardPadding: CardPadding;
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

/** 枚举型设置：值不在已知键中时回落默认值，避免旧版本/手改 JSON 写入无效值。 */
function parseEnum<T extends string>(value: unknown, options: Record<T, unknown>, fallback: T): T {
    return typeof value === "string" && value in options ? value as T : fallback;
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
    const formatSettings = parseJsonObject<Partial<{ dateFormat: DateFormat; includeTime: boolean; checkboxStyle: CheckboxStyle; maxDisplayLength: number; showFieldNames: boolean; listFontSize: number; listMultiColumn: boolean; listLayoutStyle: ListLayoutStyle; listItemStyle: ListItemStyle; listLineHeight: ListLineHeight; listRowGap: ListRowGap; listValueLines: ListValueLines; listItemRadius: ListItemRadius; alignFieldNames: boolean; cardEnabled: boolean; cardRadius: CardRadius; cardPadding: CardPadding; editTrigger: EditTrigger; layout: DisplayLayout }>>(get("display-format"), {});
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
        // 可选的样式微调项均为枚举值，缺省时与内置版式一致
        listLineHeight: parseEnum(formatSettings.listLineHeight, LIST_LINE_HEIGHTS, "normal"),
        listRowGap: parseEnum(formatSettings.listRowGap, LIST_ROW_GAPS, "normal"),
        listValueLines: parseEnum(formatSettings.listValueLines, LIST_VALUE_LINES, "unlimited"),
        listItemRadius: parseEnum(formatSettings.listItemRadius, LIST_ITEM_RADII, "auto"),
        alignFieldNames: formatSettings.alignFieldNames !== false,
        cardEnabled: formatSettings.cardEnabled !== false,
        cardRadius: parseEnum(formatSettings.cardRadius, CARD_RADII, "auto"),
        cardPadding: parseEnum(formatSettings.cardPadding, CARD_PADDINGS, "normal"),
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
