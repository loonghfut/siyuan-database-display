// 行内字体族样式串的解析与重建。
// 复刻思源 app/src/protyle/toolbar/fontFamilyCore.ts —— 该模块未导出到插件 SDK，
// 但 sanitizeAVRichTextInlineStyle 需要用它校验 font-family 声明，否则带字体标记的
// 文本会在序列化往返中被丢弃。

const INLINE_FONT_FAMILY_PREFIX = "var(--b3-font-family-emoji-reset)";
const INLINE_FONT_FAMILY_SUFFIX = "var(--b3-font-family-editor), var(--b3-font-family)";

/** 思源生成 font-family 样式串的固定骨架，用于识别「这是思源写的字体标记」。 */
export const FONT_FAMILY_PATTERN =
    /^var\(--b3-font-family-emoji-reset\)\s*,\s*(?:'(?:\\[\s\S]|[^'\\])*'|"(?:\\[\s\S]|[^"\\])*")\s*,\s*var\(--b3-font-family-editor\)\s*,\s*var\(--b3-font-family\)$/;

function escapeCSSString(value: string): string {
    return Array.from(value).map(character => {
        const codePoint = character.codePointAt(0);
        if (character === "\"") {
            return "\\22 ";
        }
        if (character === "'" || character === "\\") {
            return `\\${character}`;
        }
        if ((codePoint !== undefined && codePoint < 32) || codePoint === 127) {
            return `\\${(codePoint ?? 0).toString(16)} `;
        }
        return character;
    }).join("");
}

/**
 * 解码 CSS 字符串里的转义序列。
 * 非法码点（0 或超出 Unicode 上限）必须回退成 U+FFFD 替换字符，与思源逐字节一致：
 * 解码结果会被 getInlineFontFamilyStyle 重新编码进 style 串，再进序列化后的 Kramdown，
 * 用别的占位符（如 "?"）会让同一条记录在插件与思源之间来回改写。
 */
function unescapeCSSString(value: string): string {
    return value.replace(/\\([0-9a-fA-F]{1,6})(?:\s)?|\\([\s\S])/g,
        (_match, hex: string, escaped: string) => {
            if (!hex) {
                return escaped;
            }
            const codePoint = parseInt(hex, 16);
            return codePoint === 0 || codePoint > 0x10FFFF ? "\uFFFD" : String.fromCodePoint(codePoint);
        });
}

/** 由字体族名重建思源样式的 font-family 声明；名字为空时返回空串。 */
export function getInlineFontFamilyStyle(family?: string): string {
    return family ?
        `${INLINE_FONT_FAMILY_PREFIX}, '${escapeCSSString(family)}', ${INLINE_FONT_FAMILY_SUFFIX}` :
        "";
}

/**
 * 从 font-family 声明里取出真正的字体族名：跳过 Emojis 相关的占位族、
 * CSS 关键字与 var() 引用，返回第一个有意义的族名。
 */
export function getInlineFontFamilyName(fontFamily?: string): string | undefined {
    const value = fontFamily?.trim();
    if (!value) {
        return undefined;
    }
    const families: string[] = [];
    let escaped = false;
    let parentheses = 0;
    let quote = "";
    let start = 0;
    for (let index = 0; index < value.length; index++) {
        const character = value[index];
        if (escaped) {
            escaped = false;
        } else if (character === "\\") {
            escaped = true;
        } else if (quote) {
            if (character === quote) {
                quote = "";
            }
        } else if (character === "\"" || character === "'") {
            quote = character;
        } else if (character === "(") {
            parentheses++;
        } else if (character === ")") {
            parentheses = Math.max(0, parentheses - 1);
        } else if (character === "," && parentheses === 0) {
            families.push(value.slice(start, index));
            start = index + 1;
        }
    }
    families.push(value.slice(start));
    for (const item of families) {
        let family = item.trim();
        if (family.length > 1 && ((family.startsWith("\"") && family.endsWith("\"")) ||
            (family.startsWith("'") && family.endsWith("'")))) {
            family = family.slice(1, -1);
        }
        family = unescapeCSSString(family);
        const normalized = family.toLowerCase();
        if (family && normalized !== "emojis additional" && normalized !== "emojis reset" &&
            !["inherit", "initial", "revert", "revert-layer", "unset"].includes(normalized) &&
            !normalized.startsWith("var(")) {
            return family;
        }
    }
    return undefined;
}
