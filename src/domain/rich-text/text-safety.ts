// 富文本源里可疑字符串的校验：Unicode 合法性、HTML 实体解码、URL 白名单、备注内容。
// 复刻思源 app/src/protyle/render/av/richTextValue.ts:63-255。
// 这些字符串最终会落到 href / data-id / data-inline-memo-content 上，
// 校验失败一律降级为空，不做「尽力修复」。

/** Unicode 格式控制字符（Cf），与零宽字符同属不可见的注入载体。 */
const AV_RICH_TEXT_FORMAT_CHARACTER = /\p{Cf}/u;

function isAVRichTextControlOrFormatCharacter(character: string): boolean {
    const codePoint = character.codePointAt(0) || 0;
    return codePoint <= 0x1F || 0x7F <= codePoint && codePoint <= 0x9F ||
        AV_RICH_TEXT_FORMAT_CHARACTER.test(character);
}

/** URL 里出现反斜杠或控制/格式字符即视为不安全：前者可绕过协议解析，后者不可见。 */
function hasUnsafeAVRichTextURLCharacter(value: string): boolean {
    return Array.from(value).some(character =>
        character === "\\" || isAVRichTextControlOrFormatCharacter(character));
}

/** 校验 UTF-16 代理对是否成对出现，拦下被截断的 emoji 等畸形串。 */
function hasValidAVRichTextUnicode(value: string): boolean {
    for (let index = 0; index < value.length; index++) {
        const code = value.charCodeAt(index);
        if (0xD800 <= code && code <= 0xDBFF) {
            if (index + 1 >= value.length) {
                return false;
            }
            const next = value.charCodeAt(++index);
            if (next < 0xDC00 || 0xDFFF < next) {
                return false;
            }
        } else if (0xDC00 <= code && code <= 0xDFFF) {
            return false;
        }
    }
    return true;
}

/** 反转义一层 HTML 实体，Lute 可用时走它（与思源完全一致），否则用内置表兜底。 */
function unescapeAVRichTextHTML(value: string): string {
    if (window.Lute) {
        return window.Lute.UnEscapeHTMLStr(value);
    }
    return value.replace(/&(?:amp|apos|colon|gt|lt|newline|quot|rlm|tab|zerowidthspace|zwj|zwnj|#(?:x[0-9a-f]+|\d+));/gi,
        entity => {
            const named: Record<string, string> = {
                "&amp;": "&", "&colon;": ":", "&gt;": ">", "&lt;": "<", "&quot;": "\"", "&apos;": "'",
                "&newline;": "\n", "&rlm;": "\u200F", "&tab;": "\t", "&zerowidthspace;": "\u200B",
                "&zwj;": "\u200D", "&zwnj;": "\u200C"
            };
            const normalized = entity.toLowerCase();
            if (named[normalized]) {
                return named[normalized];
            }
            const numeric = normalized.match(/^&#(x[0-9a-f]+|\d+);$/);
            const codePoint = numeric?.[1].startsWith("x") ? Number.parseInt(numeric[1].slice(1), 16) :
                Number.parseInt(numeric?.[1] || "", 10);
            return Number.isInteger(codePoint) && 0 < codePoint && codePoint <= 0x10FFFF ?
                String.fromCodePoint(codePoint) : entity;
        });
}

/**
 * 反复反转义直到不动点。最多 8 层；层数用尽仍未收敛说明是多层嵌套编码，
 * 返回 undefined 交由调用方判定为不安全。
 */
function decodeAVRichTextHTMLEntities(value: string): string | undefined {
    let decoded = value;
    for (let depth = 0; depth < 8; depth++) {
        const next = unescapeAVRichTextHTML(decoded);
        if (next === decoded) {
            return decoded;
        }
        decoded = next;
    }
    return unescapeAVRichTextHTML(decoded) === decoded ? decoded : undefined;
}

/**
 * 校验行内备注内容：允许换行/制表，其余控制字符一律拒绝；
 * 解码到不动点后仍出现「像标签起始」的尖括号也拒绝，避免备注里藏 HTML。
 * 通过校验时返回原值（不是解码值），保留用户看到的原始编码形态。
 */
export function sanitizeAVRichTextInlineMemoContent(value: string): string {
    const hasDisallowedControl = (candidate: string) => Array.from(candidate).some(character => {
        const codePoint = character.codePointAt(0) || 0;
        return (codePoint <= 0x1F || 0x7F <= codePoint && codePoint <= 0x9F) &&
            codePoint !== 0x09 && codePoint !== 0x0A && codePoint !== 0x0D;
    });
    if (!hasValidAVRichTextUnicode(value) || hasDisallowedControl(value)) {
        return "";
    }

    let decoded = value;
    let stable = false;
    for (let depth = 0; depth < 8; depth++) {
        const next = unescapeAVRichTextHTML(decoded);
        if (!hasValidAVRichTextUnicode(next) || hasDisallowedControl(next)) {
            return "";
        }
        if (next === decoded) {
            stable = true;
            break;
        }
        decoded = next;
    }
    if (!stable) {
        return "";
    }

    for (let start = decoded.indexOf("<"); start >= 0; start = decoded.indexOf("<", start + 1)) {
        let index = start + 1;
        if (decoded[index] === "/") {
            index++;
            if (/[A-Za-z]/.test(decoded[index] || "")) {
                return "";
            }
            continue;
        }
        if (/[A-Za-z!?]/.test(decoded[index] || "")) {
            return "";
        }
    }
    return value;
}

/** assets/ 路径必须已经是最简形式，拦下用 ../ 越出资源目录的写法。 */
function isCleanAVRichTextAssetPath(value: string): boolean {
    const path = value.split(/[?#]/, 1)[0];
    const relativePath = path.startsWith("/") ? path.slice(1) : path;
    if (!relativePath.startsWith("assets/")) {
        return true;
    }
    const segments = path.split("/");
    const cleanSegments: string[] = [];
    segments.forEach(segment => {
        if (!segment || segment === ".") {
            return;
        }
        if (segment === "..") {
            cleanSegments.pop();
        } else {
            cleanSegments.push(segment);
        }
    });
    const cleanPath = `${path.startsWith("/") ? "/" : ""}${cleanSegments.join("/")}` || ".";
    return cleanPath === path;
}

/**
 * 取安全 URL：协议限定 http/https/siyuan/web+siyuan/mailto/tel，
 * 相对路径不得含冒号（防 javascript: 变体），资源路径不得越界。
 * 不安全时返回空串，调用方据此移除对应属性。
 */
export function getAVRichTextSafeURL(value?: string | null): string {
    const original = value || "";
    if (!original) {
        return "";
    }
    if (original.trim() !== original || !hasValidAVRichTextUnicode(original)) {
        return "";
    }
    const url = decodeAVRichTextHTMLEntities(original);
    if (typeof url !== "string" || hasUnsafeAVRichTextURLCharacter(url)) {
        return "";
    }
    let percentDecoded: string;
    try {
        percentDecoded = decodeURIComponent(url);
    } catch {
        return "";
    }
    if (!hasValidAVRichTextUnicode(percentDecoded) || hasUnsafeAVRichTextURLCharacter(percentDecoded)) {
        return "";
    }
    const scheme = url.match(/^([a-z][a-z0-9+.-]*):/i)?.[1].toLowerCase();
    if (scheme) {
        if (scheme === "mailto" || scheme === "tel") {
            const opaque = url.slice(scheme.length + 1);
            return opaque && !opaque.startsWith("/") ? url : "";
        }
        if (scheme !== "http" && scheme !== "https" && scheme !== "siyuan" && scheme !== "web+siyuan") {
            return "";
        }
        if (!url.toLowerCase().startsWith(`${scheme}://`)) {
            return "";
        }
        const authority = url.slice(scheme.length + 3).split(/[/?#]/, 1)[0];
        if (!authority) {
            return "";
        }
        try {
            const parsed = new URL(url);
            return parsed.host && parsed.protocol === `${scheme}:` ? url : "";
        } catch {
            return "";
        }
    }
    if (url.startsWith("//")) {
        const authority = url.slice(2).split(/[/?#]/, 1)[0];
        if (!authority) {
            return "";
        }
        try {
            if (!new URL(`https:${url}`).host) {
                return "";
            }
        } catch {
            return "";
        }
    } else {
        const firstPathSegment = percentDecoded.replace(/^\/+/, "").split(/[/?#]/, 1)[0];
        if (firstPathSegment.includes(":")) {
            return "";
        }
    }
    return isCleanAVRichTextAssetPath(percentDecoded) ? url : "";
}
