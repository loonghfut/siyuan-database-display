// 数据库选项配色：复刻思源 protyle/render/av/color.ts 的只读逻辑，支持
//   - 内置色 1-14（用户可在设置里隐藏，隐藏后不再参与新建与调色板）
//   - 工作空间自定义色 15-78（明暗两套取值，直接以 light-dark() 直出）
//   - 工作空间自定义的调色板排序
// 内核侧对应实现见 kernel/av/color.go、kernel/model/inline_style.go。
// 该模块同时被行内编辑（src/inline-edit）与正文展示（src/ui）使用，故放在 domain 层。

import { fetchSyncPost } from "siyuan";
import { AVCustomColor, AVResolvedColor, AVPaletteEntry } from "../core/types";

/** 内置选项色数量：1-14 由主题提供 CSS 变量，15 起为自定义色。 */
export const AV_BUILTIN_COLOR_COUNT = 14;
const AV_CUSTOM_COLOR_MIN = 15;
const AV_CUSTOM_COLOR_MAX = 78;
const AV_CUSTOM_COLOR_LIMIT = 64;

const EMPTY_STYLES: InlineStylesResponse = {};
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

interface InlineStyleAV {
    colors?: AVCustomColor[];
    order?: string[];
}

interface InlineStylesResponse {
    av?: InlineStyleAV;
    builtin?: { hidden?: { av?: number[] } };
}

let paletteCache: InlineStylesResponse | null = null;
let paletteLoading: Promise<InlineStylesResponse> | null = null;

/**
 * 载入工作空间配色（/api/storage/getInlineStyles）。
 * 重复调用复用同一请求；失败时回落为空配置（只有内置色生效），不阻断编辑。
 */
export function loadAVPalette(force = false): Promise<InlineStylesResponse> {
    if (!force && paletteCache) return Promise.resolve(paletteCache);
    if (!force && paletteLoading) return paletteLoading;
    paletteLoading = fetchSyncPost("/api/storage/getInlineStyles", {})
        .then(response => {
            paletteCache = (response as InlineStylesResponse) || EMPTY_STYLES;
            return paletteCache;
        })
        .catch(error => {
            console.warn("Load inline styles failed, fallback to builtin palette", error);
            paletteCache = EMPTY_STYLES;
            return paletteCache;
        })
        .finally(() => {
            paletteLoading = null;
        });
    return paletteLoading;
}

/** 已载入的工作空间配色；未载入时返回空配置。 */
function cachedStyles(): InlineStylesResponse {
    return paletteCache || EMPTY_STYLES;
}

const normalizeCustomColors = (colors?: AVCustomColor[]): AVCustomColor[] => (colors || [])
    .filter(item => !!item && Number.isInteger(item.index) &&
        item.index >= AV_CUSTOM_COLOR_MIN && item.index <= AV_CUSTOM_COLOR_MAX)
    .sort((a, b) => a.index - b.index)
    .slice(0, AV_CUSTOM_COLOR_LIMIT);

/** 工作空间自定义色（按索引升序、截断到上限）。 */
export function getAVCustomColors(): AVCustomColor[] {
    return normalizeCustomColors(cachedStyles().av?.colors);
}

const defaultColorOrder = (customColors: AVCustomColor[]): string[] => [
    ...Array.from({ length: AV_BUILTIN_COLOR_COUNT }, (_, index) => (index + 1).toString()),
    ...customColors.map(item => item.index.toString())
];

/** 调色板顺序：用户自定义顺序在前，其余按默认顺序补齐。 */
export function getAVColorOrder(customColors: AVCustomColor[] = getAVCustomColors()): string[] {
    const allowed = new Set(defaultColorOrder(customColors));
    const result: string[] = [];
    const seen = new Set<string>();
    (cachedStyles().av?.order || []).forEach(key => {
        if (typeof key !== "string" || !allowed.has(key) || seen.has(key)) return;
        seen.add(key);
        result.push(key);
    });
    defaultColorOrder(customColors).forEach(key => {
        if (!seen.has(key)) result.push(key);
    });
    return result;
}

export function isBuiltinColorVisible(index: number): boolean {
    return !(cachedStyles().builtin?.hidden?.av || []).includes(index);
}

/** 未被用户隐藏的内置色索引。 */
export function getVisibleBuiltinColorIndexes(): number[] {
    return Array.from({ length: AV_BUILTIN_COLOR_COUNT }, (_, index) => index + 1)
        .filter(index => isBuiltinColorVisible(index));
}

/** 非法/越界的颜色索引一律回落到最后一个内置色。 */
export function normalizeAVColorIndex(color: string | number | undefined): number {
    const value = typeof color === "number" ? color.toString() : (color ?? "").trim();
    if (!/^\d+$/.test(value)) return AV_BUILTIN_COLOR_COUNT;
    const index = Number(value);
    return Number.isInteger(index) && index >= 1 && index <= AV_CUSTOM_COLOR_MAX
        ? index
        : AV_BUILTIN_COLOR_COUNT;
}

/** 自定义色需明暗两套、四项取值齐全才能用于 light-dark()。 */
function isResolvedColor(color?: AVResolvedColor): boolean {
    return !!color &&
        HEX_COLOR.test(color.light?.color || "") &&
        HEX_COLOR.test(color.light?.backgroundColor || "") &&
        HEX_COLOR.test(color.dark?.color || "") &&
        HEX_COLOR.test(color.dark?.backgroundColor || "");
}

const modeColor = (light?: string, dark?: string) => `light-dark(${light}, ${dark})`;
const cssVarsForIndex = (index: number) =>
    `background-color:var(--b3-font-background${index});color:var(--b3-font-color${index})`;

/**
 * 生成选项色块的行内样式：自定义色用 light-dark() 直出，索引色回落到主题 CSS 变量。
 */
export function getAVColorStyle(color?: string, resolvedColor?: AVResolvedColor): string {
    if (isResolvedColor(resolvedColor)) {
        return `background-color:${modeColor(resolvedColor.light?.backgroundColor, resolvedColor.dark?.backgroundColor)};` +
            `color:${modeColor(resolvedColor.light?.color, resolvedColor.dark?.color)}`;
    }
    let index = normalizeAVColorIndex(color || AV_BUILTIN_COLOR_COUNT);
    if (index > AV_BUILTIN_COLOR_COUNT &&
        !getAVCustomColors().some(item => item.index === index)) {
        // 索引指向不存在的自定义色（例如跨工作空间的数据），回落到最后一个内置色
        index = AV_BUILTIN_COLOR_COUNT;
    }
    return cssVarsForIndex(index);
}

/** 新建选项应使用的颜色：按可见内置色循环取用，与思源新建选项一致。 */
export function getNextAVOptionColor(optionCount: number): string {
    const colors = getVisibleBuiltinColorIndexes();
    if (colors.length === 0) return AV_BUILTIN_COLOR_COUNT.toString();
    return colors[Math.max(0, optionCount) % colors.length].toString();
}

/** 取某个调色板索引对应的工作空间自定义色，内置色返回 undefined。 */
export function getAVResolvedColor(color?: string): AVCustomColor | undefined {
    const index = normalizeAVColorIndex(color);
    return getAVCustomColors().find(item => item.index === index);
}

/** 调色板条目：可见内置色 + 未隐藏的自定义色，按工作空间排序。 */
export function getAVPaletteEntries(): AVPaletteEntry[] {
    const customColors = getAVCustomColors();
    const customByIndex = new Map(customColors.map(item => [item.index.toString(), item]));
    const entries: AVPaletteEntry[] = [];
    getAVColorOrder(customColors).forEach(key => {
        const index = Number(key);
        if (index >= 1 && index <= AV_BUILTIN_COLOR_COUNT) {
            if (isBuiltinColorVisible(index)) entries.push({ color: key });
            return;
        }
        const custom = customByIndex.get(key);
        if (custom && !custom.hidden) {
            entries.push({ color: custom.index.toString(), resolvedColor: custom });
        }
    });
    return entries;
}

const mountedVars = new WeakMap<HTMLElement, number[]>();

/**
 * 把工作空间自定义色以 CSS 变量挂到元素上，供 var(--b3-font-background{N}) 解析。
 * 内置色的变量由主题全局提供，不需要注入。
 */
export function applyAVColorVars(element: HTMLElement): void {
    mountedVars.get(element)?.forEach(index => {
        element.style.removeProperty(`--b3-font-color${index}`);
        element.style.removeProperty(`--b3-font-background${index}`);
    });
    const indexes: number[] = [];
    getAVCustomColors().forEach(item => {
        if (!isResolvedColor(item)) return;
        indexes.push(item.index);
        element.style.setProperty(`--b3-font-color${item.index}`,
            modeColor(item.light?.color, item.dark?.color));
        element.style.setProperty(`--b3-font-background${item.index}`,
            modeColor(item.light?.backgroundColor, item.dark?.backgroundColor));
    });
    mountedVars.set(element, indexes);
}
