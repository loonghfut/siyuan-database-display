// 行内文本标记的 style 白名单校验。
// 复刻思源 app/src/protyle/render/av/richTextValue.ts:712-871。
// 只有思源「外观」工具栏能产出的声明才允许留存：内置/自定义前景背景色、字号、字体族、
// 镂空字、立体字与书写方向。其余（含任意 CSS）一律丢弃，避免样式串成为注入通道。

import { FONT_FAMILY_PATTERN, getInlineFontFamilyName, getInlineFontFamilyStyle } from "./font-family";

/** 内置前景/背景色各有 13 档（--b3-font-color1..13 / --b3-font-background1..13）。 */
const BUILTIN_INLINE_COLOR_COUNT = 13;
/** 字体族名的码点上限，超出视为异常值。 */
const MAX_INLINE_FONT_FAMILY_LENGTH = 256;

type AVRichTextStyleProperty = "color" | "background-color";

/** 「镂空字」的两个声明，必须同时出现才生效。 */
const HOLLOW_STROKE = "0.2px var(--b3-theme-on-background)";
const HOLLOW_FILL = "transparent";
/** 「立体字」的固定 text-shadow 取值。 */
const TEXT_SHADOW = "1px 1px var(--b3-theme-surface-lighter), " +
    "2px 2px var(--b3-theme-surface-lighter), 3px 3px var(--b3-theme-surface-lighter), " +
    "4px 4px var(--b3-theme-surface-lighter)";

/**
 * 拆分 style 串为声明数组。引号与括号内的分号不算分隔符；
 * 结构不闭合（未配对括号/引号、以反斜杠结尾）时整体判为非法，返回空数组。
 */
function splitAVRichTextStyleDeclarations(style: string): string[] {
    const declarations: string[] = [];
    let start = 0;
    let quote = "";
    let escaped = false;
    let parentheses = 0;
    for (let index = 0; index < style.length; index++) {
        const character = style[index];
        if (escaped) {
            escaped = false;
            continue;
        }
        if (character === "\\") {
            escaped = true;
            continue;
        }
        if (quote) {
            if (character === quote) {
                quote = "";
            }
            continue;
        }
        if (character === "'" || character === "\"") {
            quote = character;
        } else if (character === "(") {
            parentheses++;
        } else if (character === ")") {
            if (parentheses === 0) {
                return [];
            }
            parentheses--;
        } else if (character === ";" && parentheses === 0) {
            declarations.push(style.slice(start, index));
            start = index + 1;
        }
    }
    if (escaped || quote || parentheses !== 0) {
        return [];
    }
    declarations.push(style.slice(start));
    return declarations;
}

/** 校验前景/背景色：只接受内置色档、内置语义色与自定义色三种 var() 写法。 */
function normalizeAVRichTextInlineStyleValue(property: AVRichTextStyleProperty, value: string): string {
    const builtinColor = value.match(/^var\(--b3-font-(color|background)(\d+)\)$/);
    if (builtinColor) {
        const index = Number(builtinColor[2]);
        if (Number.isInteger(index) && 1 <= index && index <= BUILTIN_INLINE_COLOR_COUNT &&
            (property === "color" && builtinColor[1] === "color" ||
                property === "background-color" && builtinColor[1] === "background")) {
            return `var(--b3-font-${builtinColor[1]}${index})`;
        }
        return "";
    }

    const builtinStyle = value.match(
        /^var\(--b3-inline-builtin-(error|warning|info|success)-(color|background-color),\s*var\(--b3-card-(error|warning|info|success)-(color|background)\)\)$/
    );
    if (builtinStyle) {
        const expectedStyleProperty = property === "color" ? "color" : "background-color";
        const expectedLegacyProperty = property === "color" ? "color" : "background";
        if (builtinStyle[1] === builtinStyle[3] && builtinStyle[2] === expectedStyleProperty &&
            builtinStyle[4] === expectedLegacyProperty) {
            return `var(--b3-inline-builtin-${builtinStyle[1]}-${expectedStyleProperty}, ` +
                `var(--b3-card-${builtinStyle[1]}-${expectedLegacyProperty}))`;
        }
        return "";
    }

    const customStyle = value.match(
        /^var\(--b3-inline-style-([0-9]{14}-[a-z0-9]{7})-(color|background-color),\s*(#[0-9A-Fa-f]{6})\)$/
    );
    const expectedCustomProperty = property === "color" ? "color" : "background-color";
    if (customStyle && customStyle[2] === expectedCustomProperty) {
        return `var(--b3-inline-style-${customStyle[1]}-${expectedCustomProperty}, ${customStyle[3].toLowerCase()})`;
    }
    return "";
}

/** 校验字号：整数 px（9-72）或 em（0.56-4.5），其余丢弃。 */
function normalizeAVRichTextFontSize(value: string): string {
    const match = value.match(/^(\d+)(?:\.0{1,2})?px$/);
    if (match) {
        const size = Number(match[1]);
        return 9 <= size && size <= 72 ? `${size}px` : "";
    }
    const emMatch = value.match(/^(?:(\d+)(?:\.(\d{1,2}))?|\.(\d{1,2}))em$/);
    if (!emMatch) {
        return "";
    }
    const size = Number(value.slice(0, -2));
    return 0.56 <= size && size <= 4.5 ? `${size}em` : "";
}

/** 校验字体族：必须是思源骨架写法，族名解码后不超过码点上限。 */
function normalizeAVRichTextFontFamily(value: string): string {
    if (value.length > 2048 || !FONT_FAMILY_PATTERN.test(value)) {
        return "";
    }
    const family = getInlineFontFamilyName(value);
    if (!family || Array.from(family).length > MAX_INLINE_FONT_FAMILY_LENGTH) {
        return "";
    }
    return getInlineFontFamilyStyle(family);
}

/**
 * 归一化行内 style：按固定顺序输出白名单内的声明，其余丢弃。
 * 返回空串表示该 span 不该带 style 属性。
 */
export function sanitizeAVRichTextInlineStyle(style: unknown): string {
    if (typeof style !== "string") {
        return "";
    }
    const values = new Map<string, string>();
    splitAVRichTextStyleDeclarations(style).forEach(declaration => {
        const match = declaration.match(/^\s*([-a-z]+)\s*:\s*([\s\S]*?)\s*$/);
        if (!match) {
            return;
        }
        const property = match[1];
        const value = match[2];
        if (property === "color" || property === "background-color") {
            const normalized = normalizeAVRichTextInlineStyleValue(property, value);
            if (normalized) {
                values.set(property, normalized);
            }
        } else if (property === "font-size") {
            const normalized = normalizeAVRichTextFontSize(value);
            if (normalized) {
                values.set(property, normalized);
            }
        } else if (property === "font-family") {
            const normalized = normalizeAVRichTextFontFamily(value);
            if (normalized) {
                values.set(property, normalized);
            }
        } else if (property === "-webkit-text-stroke" && value === HOLLOW_STROKE ||
            property === "-webkit-text-fill-color" && value === HOLLOW_FILL ||
            property === "text-shadow" && value === TEXT_SHADOW ||
            property === "direction" && (value === "ltr" || value === "rtl") ||
            property === "unicode-bidi" && value === "isolate") {
            values.set(property, value);
        }
    });
    // 镂空字与书写方向都是成对声明，缺一即整组丢弃，避免留下半截效果
    if (!values.has("-webkit-text-stroke") || !values.has("-webkit-text-fill-color")) {
        values.delete("-webkit-text-stroke");
        values.delete("-webkit-text-fill-color");
    }
    if (!values.has("direction") || !values.has("unicode-bidi")) {
        values.delete("direction");
        values.delete("unicode-bidi");
    }
    return [
        "color",
        "background-color",
        "font-size",
        "font-family",
        "-webkit-text-stroke",
        "-webkit-text-fill-color",
        "text-shadow",
        "direction",
        "unicode-bidi"
    ].map(property => values.has(property) ? `${property}: ${values.get(property)};` : "")
        .filter(Boolean).join(" ");
}
