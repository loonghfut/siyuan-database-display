// Kramdown 里 style 属性的实体保护与还原。
// 复刻思源 app/src/protyle/render/av/richTextValue.ts:279-707。
//
// 为什么需要：Lute 的 Md2BlockDOM / BlockDOM2Md 往返会对 style 串里的 `&` 与反引号
// 做转义或吞掉，导致带颜色/字号标记的文本在「读出 → 编辑 → 写回」后样式漂移。
// 做法是先把这些字符替换成私有区哨兵 token 再交给 Lute，解析完成后按 token 还原。

export interface AVRichTextStyleEntityProtection {
    token: string;
    /** 源串里的原始写法（如 &amp; 或 `） */
    encoded: string;
    /** 还原到 DOM 属性时应有的字面值（如 & 或 `） */
    decoded: string;
}

function escapeAVRichTextRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 造一个源串中不可能自然出现的哨兵前缀：私有区字符包裹，后缀用 36 进制递增避开已占用的。
 */
function createAVRichTextStyleSentinel(source: string): string {
    const used = new Set<string>();
    const sentinelPattern = /\uE000av-rich-text-style-([0-9a-z]+)\uF8FF/g;
    for (let match = sentinelPattern.exec(source); match; match = sentinelPattern.exec(source)) {
        used.add(match[1]);
    }
    let index = 0;
    while (used.has(index.toString(36))) {
        index++;
    }
    return `\uE000av-rich-text-style-${index.toString(36)}\uF8FF`;
}

/**
 * 序列化方向的保护：把 DOM style 属性里的反斜杠与反引号换成哨兵，
 * 待 Lute 输出 Markdown 后再把哨兵写回 HTML 数字实体（&#92; / &#96;），
 * 使它们在 Kramdown 里既不会被当转义符也不会开启代码段。
 */
export function createAVRichTextStyleBackslashEncoding(source: string) {
    const sentinel = createAVRichTextStyleSentinel(source);
    const backslashSentinel = `${sentinel}\uE003`;
    const backtickSentinel = `${sentinel}\uE004`;
    return {
        sentinel,
        protectStyle: (style: string) => style.replace(/[\\`]/g,
            character => character === "\\" ? backslashSentinel : backtickSentinel),
        encodeMarkdown: (markdown: string) => markdown
            .split(backslashSentinel).join("&#92;")
            .split(backtickSentinel).join("&#96;")
    };
}

/**
 * 从 start 向后找未被引号包裹、未被反斜杠转义的终止符位置，找不到返回 -1。
 * 用于在 Markdown 源串里手工定位标签结尾与 IAL 结尾。
 */
function findAVRichTextQuotedEnd(content: string, start: number, end: number, terminator: string): number {
    let quote = "";
    let escaped = false;
    for (let index = start; index < end; index++) {
        const character = content[index];
        if (escaped) {
            escaped = false;
        } else if (character === "\\") {
            escaped = true;
        } else if (quote) {
            if (character === quote) {
                quote = "";
            }
        } else if (character === "'" || character === "\"") {
            quote = character;
        } else if (character === terminator) {
            return index;
        }
    }
    return -1;
}

/**
 * 在一段标签/IAL 文本里取指定属性名的带引号取值。
 * 跳过 .class / #id 简写与无引号取值（后者不参与实体保护）。
 */
function getAVRichTextQuotedAttribute(content: string, start: number, end: number, expected: string)
    : { start: number; end: number; value: string } | undefined {
    let index = start;
    while (index < end) {
        while (index < end && /\s/.test(content[index])) {
            index++;
        }
        if (content[index] === "." || content[index] === "#") {
            while (index < end && !/\s/.test(content[index])) {
                index++;
            }
            continue;
        }
        const nameStart = index;
        while (index < end && /[-:\w]/.test(content[index])) {
            index++;
        }
        if (nameStart === index) {
            index++;
            continue;
        }
        const name = content.slice(nameStart, index);
        while (index < end && /\s/.test(content[index])) {
            index++;
        }
        if (content[index] !== "=") {
            continue;
        }
        index++;
        while (index < end && /\s/.test(content[index])) {
            index++;
        }
        const quote = content[index];
        if (quote !== "'" && quote !== "\"") {
            while (index < end && !/\s/.test(content[index])) {
                index++;
            }
            continue;
        }
        const valueStart = ++index;
        let escaped = false;
        while (index < end) {
            const character = content[index];
            if (escaped) {
                escaped = false;
            } else if (character === "\\") {
                escaped = true;
            } else if (character === quote) {
                break;
            }
            index++;
        }
        if (index >= end) {
            return undefined;
        }
        if (name === expected) {
            return { start: valueStart, end: index, value: content.slice(valueStart, index) };
        }
        index++;
    }
    return undefined;
}

/** 剥掉行首的容器标记（引用尖括号、无序列表短横/加号/星号、有序列表数字加点），得到参与围栏判定的结构内容。 */
function getAVRichTextMarkdownContainerContent(line: string): string {
    let index = 0;
    while (index < line.length) {
        while (index < line.length && (line[index] === " " || line[index] === "\t")) {
            index++;
        }
        if (line[index] === ">") {
            index++;
            if (line[index] === " " || line[index] === "\t") {
                index++;
            }
            continue;
        }
        const list = line.slice(index).match(/^(?:[-+*]|\d+[.)])[ \t]+/);
        if (list) {
            index += list[0].length;
            continue;
        }
        break;
    }
    return line.slice(index);
}

/** 从 index 起连续出现 character 的个数。 */
function getAVRichTextDelimiterRun(content: string, index: number, character: string): number {
    let end = index;
    while (content[end] === character) {
        end++;
    }
    return end - index;
}

interface AVRichTextLiteralRange {
    start: number;
    end: number;
}

/**
 * 找出所有「块级字面量」区间：代码围栏（``` / ~~~）与数学公式块（$$）。
 * 这些区间里的反引号不是行内代码定界符，必须整段跳过。未闭合的围栏延伸到串尾。
 */
function getAVRichTextLiteralBlockRanges(markdown: string): AVRichTextLiteralRange[] {
    const ranges: AVRichTextLiteralRange[] = [];
    let open: { start: number; character: string; length: number; math: boolean } | undefined;
    for (let lineStart = 0; lineStart <= markdown.length;) {
        let lineEnd = markdown.indexOf("\n", lineStart);
        if (lineEnd < 0) {
            lineEnd = markdown.length;
        }
        const contentEnd = lineEnd > lineStart && markdown[lineEnd - 1] === "\r" ? lineEnd - 1 : lineEnd;
        const structuralContent = getAVRichTextMarkdownContainerContent(markdown.slice(lineStart, contentEnd));
        const nextLine = lineEnd < markdown.length ? lineEnd + 1 : markdown.length;
        if (open?.math) {
            if (structuralContent.trim() === "$$") {
                ranges.push({ start: open.start, end: nextLine });
                open = undefined;
            }
        } else if (open) {
            const closingRun = getAVRichTextDelimiterRun(structuralContent, 0, open.character);
            if (closingRun >= open.length && structuralContent.slice(closingRun).trim() === "") {
                ranges.push({ start: open.start, end: nextLine });
                open = undefined;
            }
        } else {
            const fence = structuralContent.match(/^(`{3,}|~{3,})/);
            if (fence && (fence[1][0] !== "`" || !structuralContent.slice(fence[1].length).includes("`"))) {
                open = { start: lineStart, character: fence[1][0], length: fence[1].length, math: false };
            } else if (structuralContent.trim() === "$$") {
                open = { start: lineStart, character: "$", length: 2, math: true };
            }
        }
        if (lineEnd === markdown.length) {
            break;
        }
        lineStart = nextLine;
    }
    if (open) {
        ranges.push({ start: open.start, end: markdown.length });
    }
    return ranges;
}

/**
 * 找出所有需要整段跳过的字面量区间：块级围栏 + 行内代码段。
 * 行内代码按「同长度反引号串就近配对」计算，跨段落空行与块级区间会打断配对；
 * 标签与 IAL（{: ...}）内部的反引号不算定界符。
 */
function getAVRichTextLiteralRanges(markdown: string): AVRichTextLiteralRange[] {
    const blockRanges = getAVRichTextLiteralBlockRanges(markdown);
    const ranges = [...blockRanges];
    const escaped = new Uint8Array(markdown.length);
    let backslashes = 0;
    for (let index = 0; index < markdown.length; index++) {
        escaped[index] = backslashes % 2;
        backslashes = markdown[index] === "\\" ? backslashes + 1 : 0;
    }
    const paragraphBreaks: AVRichTextLiteralRange[] = [];
    const paragraphBreakPattern = /\r?\n[ \t]*(?:\r?\n|$)/g;
    for (let match = paragraphBreakPattern.exec(markdown); match; match = paragraphBreakPattern.exec(markdown)) {
        paragraphBreaks.push({ start: match.index, end: match.index + match[0].length });
    }
    let runs: { start: number; end: number; length: number }[] = [];
    // 把已收集的反引号串按长度就近配对，配对成功的整段作为字面量区间
    const flushRuns = () => {
        const nextByLength = new Map<number, number>();
        const nextSame = new Array<number>(runs.length).fill(-1);
        for (let index = runs.length - 1; index >= 0; index--) {
            nextSame[index] = nextByLength.get(runs[index].length) ?? -1;
            nextByLength.set(runs[index].length, index);
        }
        for (let index = 0; index < runs.length;) {
            const closing = nextSame[index];
            if (closing < 0) {
                index++;
                continue;
            }
            ranges.push({ start: runs[index].start, end: runs[closing].end });
            index = closing + 1;
        }
        runs = [];
    };
    let blockIndex = 0;
    let breakIndex = 0;
    for (let index = 0; index < markdown.length;) {
        while (blockIndex < blockRanges.length && blockRanges[blockIndex].end <= index) {
            blockIndex++;
        }
        const block = blockRanges[blockIndex];
        if (block && block.start <= index) {
            flushRuns();
            index = block.end;
            continue;
        }
        while (breakIndex < paragraphBreaks.length && paragraphBreaks[breakIndex].end <= index) {
            breakIndex++;
        }
        const paragraphBreak = paragraphBreaks[breakIndex];
        if (paragraphBreak && paragraphBreak.start <= index) {
            flushRuns();
            index = paragraphBreak.end;
            continue;
        }
        if (markdown[index] === "<") {
            const tagEnd = findAVRichTextQuotedEnd(markdown, index + 1,
                Math.min(block?.start ?? markdown.length, paragraphBreak?.start ?? markdown.length), ">");
            if (tagEnd >= 0) {
                index = tagEnd + 1;
                continue;
            }
        } else if (markdown.startsWith("{:", index)) {
            const ialEnd = findAVRichTextQuotedEnd(markdown, index + 2,
                Math.min(block?.start ?? markdown.length, paragraphBreak?.start ?? markdown.length), "}");
            if (ialEnd >= 0) {
                index = ialEnd + 1;
                continue;
            }
        }
        if (markdown[index] !== "`" || escaped[index]) {
            index++;
            continue;
        }
        const run = getAVRichTextDelimiterRun(markdown, index, "`");
        runs.push({ start: index, end: index + run, length: run });
        index += run;
    }
    flushRuns();
    return ranges.sort((left, right) => left.start - right.start);
}

/** 解码 style 里可能出现的实体；不支持的实体返回 undefined（保持原样）。 */
function decodeAVRichTextStyleEntity(entity: string): string | undefined {
    const named: Record<string, string> = {
        "&amp;": "&",
        "&apos;": "'",
        "&gt;": ">",
        "&lt;": "<",
        "&quot;": "\""
    };
    if (typeof named[entity] === "string") {
        return named[entity];
    }
    const numeric = entity.match(/^&#(x[0-9a-f]+|\d+);$/i);
    if (!numeric) {
        return undefined;
    }
    const codePoint = numeric[1][0].toLowerCase() === "x" ?
        Number.parseInt(numeric[1].slice(1), 16) : Number.parseInt(numeric[1], 10);
    if (!Number.isInteger(codePoint) || codePoint <= 0 || codePoint > 0x10FFFF ||
        0xD800 <= codePoint && codePoint <= 0xDFFF) {
        return undefined;
    }
    return String.fromCodePoint(codePoint);
}

/**
 * 造一个 token 替换器。useDecodedValue 为真时写入字面值（还原到 DOM 属性），
 * 为假时写入原始实体写法（还原到 Markdown 源串）。
 * restored 集合用于事后校验「所有 token 都被消费」，防止哨兵残留在正文里。
 */
export function createAVRichTextStyleEntityReplacer(protections: AVRichTextStyleEntityProtection[]) {
    const entities = new Map(protections.map(protection => [protection.token, protection]));
    const sentinelEnd = protections[0]?.token.indexOf("\uF8FF") ?? -1;
    const sentinel = sentinelEnd < 0 ? "" : protections[0].token.slice(0, sentinelEnd + 1);
    const tokenPattern = sentinel ? new RegExp(`${escapeAVRichTextRegExp(sentinel)}[0-9a-z]+\uE002`, "g") : undefined;
    return (
        value: string,
        useDecodedValue: boolean,
        restored?: Set<string>
    ): string => {
        if (!tokenPattern) {
            return value;
        }
        tokenPattern.lastIndex = 0;
        return value.replace(tokenPattern, token => {
            const entity = entities.get(token);
            if (!entity) {
                return token;
            }
            restored?.add(token);
            return useDecodedValue ? entity.decoded : entity.encoded;
        });
    };
}

/**
 * 解析方向的保护：扫描 Kramdown 源串，把 `</span>{: style="..."}` 里 style 取值中的
 * HTML 实体与反引号替换成 token，并登记还原表。
 * 代码段/公式块等字面量区间与嵌套在 code 内的 text span 会被跳过。
 */
export function protectAVRichTextKramdownStyleEntities(markdown: string)
    : { content: string; protections: AVRichTextStyleEntityProtection[] } {
    const sentinel = createAVRichTextStyleSentinel(markdown);
    const protections: AVRichTextStyleEntityProtection[] = [];
    const replacements: { start: number; end: number; value: string }[] = [];
    const spanStack: { text: boolean; literal: boolean }[] = [];
    const literalRanges = getAVRichTextLiteralRanges(markdown);
    let literalIndex = 0;
    for (let index = 0; index < markdown.length;) {
        while (literalIndex < literalRanges.length && literalRanges[literalIndex].end <= index) {
            literalIndex++;
        }
        const literalRange = literalRanges[literalIndex];
        if (literalRange && literalRange.start <= index) {
            index = literalRange.end;
            continue;
        }
        if (markdown[index] !== "<") {
            index++;
            continue;
        }
        if (markdown.startsWith("<span", index) && /[\s/>]/.test(markdown[index + 5] || "")) {
            const tagEnd = findAVRichTextQuotedEnd(markdown, index + 5, markdown.length, ">");
            if (tagEnd < 0) {
                index++;
                continue;
            }
            const dataType = getAVRichTextQuotedAttribute(markdown, index + 5, tagEnd, "data-type");
            if (markdown[tagEnd - 1] !== "/") {
                const types = dataType?.value.split(/\s+/) || [];
                const parent = spanStack.length > 0 ? spanStack[spanStack.length - 1] : undefined;
                spanStack.push({
                    text: types.includes("text"),
                    // code 内部的内容按字面量处理，不参与实体保护
                    literal: types.includes("code") || parent?.literal === true
                });
            }
            index = tagEnd + 1;
            continue;
        }
        if (!markdown.startsWith("</span", index) || !/[\s>]/.test(markdown[index + 6] || "")) {
            index++;
            continue;
        }
        const tagEnd = findAVRichTextQuotedEnd(markdown, index + 6, markdown.length, ">");
        if (tagEnd < 0) {
            index++;
            continue;
        }
        const span = spanStack.pop();
        const isText = span?.text === true && !span.literal;
        const ialStart = tagEnd + 1;
        if (!isText || !markdown.startsWith("{:", ialStart)) {
            index = tagEnd + 1;
            continue;
        }
        const ialEnd = findAVRichTextQuotedEnd(markdown, ialStart + 2, markdown.length, "}");
        if (ialEnd < 0) {
            index = tagEnd + 1;
            continue;
        }
        const style = getAVRichTextQuotedAttribute(markdown, ialStart + 2, ialEnd, "style");
        if (style) {
            for (let entityStart = style.start; entityStart < style.end;) {
                if (markdown[entityStart] === "`") {
                    const token = `${sentinel}${protections.length.toString(36)}\uE002`;
                    protections.push({ token, encoded: "`", decoded: "`" });
                    replacements.push({ start: entityStart, end: entityStart + 1, value: token });
                    entityStart++;
                    continue;
                }
                if (markdown[entityStart] !== "&") {
                    entityStart++;
                    continue;
                }
                const semicolon = markdown.indexOf(";", entityStart + 1);
                if (semicolon < 0 || semicolon >= style.end) {
                    entityStart++;
                    continue;
                }
                const encoded = markdown.slice(entityStart, semicolon + 1);
                const decoded = decodeAVRichTextStyleEntity(encoded);
                if (typeof decoded !== "string") {
                    entityStart++;
                    continue;
                }
                const token = `${sentinel}${protections.length.toString(36)}\uE002`;
                protections.push({ token, encoded, decoded });
                replacements.push({ start: entityStart, end: semicolon + 1, value: token });
                entityStart = semicolon + 1;
            }
        }
        index = ialEnd + 1;
    }
    if (replacements.length === 0) {
        return { content: markdown, protections };
    }
    let content = "";
    let start = 0;
    replacements.forEach(replacement => {
        content += markdown.slice(start, replacement.start) + replacement.value;
        start = replacement.end;
    });
    return { content: content + markdown.slice(start), protections };
}
