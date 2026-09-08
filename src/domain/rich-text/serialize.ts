// Kramdown 稳定序列化：BlockDOM ⇄ Markdown 的往返，以及纯文本投影。
// 复刻思源 app/src/protyle/render/av/richText.ts:206-290 与 richTextValue.ts:603。
//
// 「稳定」是关键要求：同一段内容多次序列化必须得到逐字节相同的 Markdown，
// 否则「未修改则不写库」的判定会失效，每次打开面板再关闭都会产生一次无意义写入。
// 做法是把 Markdown 再解析回 BlockDOM 并重新净化，取到不动点后才作为最终结果。

import type { Lute } from "siyuan";
import { getAVRichTextLute } from "./lute";
import { cleanAVRichTextBlockDOMStructure, sanitizeAVRichTextBlockDOM } from "./sanitize";
import {
    createAVRichTextStyleBackslashEncoding,
    createAVRichTextStyleEntityReplacer,
    protectAVRichTextKramdownStyleEntities,
    type AVRichTextStyleEntityProtection
} from "./style-entities";

/** 序列化前把 style 里的反斜杠/反引号换成哨兵，避免 Lute 把它们当转义符处理。 */
function protectAVRichTextStyleBackslashes(
    blockDOM: string,
    encoding: ReturnType<typeof createAVRichTextStyleBackslashEncoding>
): string {
    const template = document.createElement("template");
    template.innerHTML = blockDOM;
    template.content.querySelectorAll<HTMLElement>("span[data-type~=\"text\"][style]").forEach(element => {
        element.setAttribute("style", encoding.protectStyle(element.getAttribute("style") || ""));
    });
    return (template.innerHTML || "").trim();
}

/**
 * 解析后把哨兵 token 还原：style 属性写回字面值，代码块/行内代码与公式的
 * data-content 写回原始实体写法（这些位置的内容是字面量，不该被二次解码）。
 * 有 token 未被消费说明源串构造异常，直接抛错而不是留下哨兵污染正文。
 */
function restoreAVRichTextBlockDOMStyleEntities(
    blockDOM: string,
    protections: AVRichTextStyleEntityProtection[]
): string {
    if (protections.length === 0) {
        return blockDOM;
    }
    const template = document.createElement("template");
    template.innerHTML = blockDOM;
    const restored = new Set<string>();
    const replaceProtections = createAVRichTextStyleEntityReplacer(protections);
    template.content.querySelectorAll<HTMLElement>("span[data-type~=\"text\"][style]").forEach(element => {
        const style = element.getAttribute("style") || "";
        element.setAttribute("style", replaceProtections(style, true, restored));
    });
    const restoreLiteralText = (element: Element) => {
        const visit = (node: Node) => {
            if (node.nodeType === Node.TEXT_NODE) {
                node.nodeValue = replaceProtections(node.nodeValue || "", false, restored);
                return;
            }
            node.childNodes.forEach(visit);
        };
        visit(element);
    };
    template.content.querySelectorAll("[data-type=\"NodeCodeBlock\"], span[data-type~=\"code\"]")
        .forEach(restoreLiteralText);
    template.content.querySelectorAll<HTMLElement>(
        "[data-type=\"NodeMathBlock\"][data-content], [data-type=\"NodeMathBlock\"] [data-content], " +
        "span[data-type~=\"inline-math\"][data-content]"
    ).forEach(element => {
        element.setAttribute("data-content",
            replaceProtections(element.getAttribute("data-content") || "", false, restored));
    });
    if (protections.some(protection => !restored.has(protection.token))) {
        throw new Error("Invalid attribute view rich text style entity");
    }
    return (template.innerHTML || "").trim();
}

/** Kramdown → BlockDOM，含 style 实体的保护与还原。 */
function parseAVRichTextKramdown(markdown: string, lute: Lute = getAVRichTextLute()): string {
    const protectedStyle = protectAVRichTextKramdownStyleEntities(markdown);
    return restoreAVRichTextBlockDOMStyleEntities(lute.Md2BlockDOM(protectedStyle.content),
        protectedStyle.protections);
}

/**
 * 把块级纯文本投影拼成多行文本：每个段落/标题/代码块/公式块一行，去掉尾部空行。
 * 一个块都没匹配上时回落到整段的 BlockDOM2Content 结果。
 */
export function projectAVRichTextPlainBlocks(blocks: string[], fallback = ""): string {
    return blocks.length === 0 ? fallback :
        blocks.map(block => block.replace(/\n+$/, "")).join("\n").replace(/\n+$/, "");
}

/** 取 BlockDOM 的纯文本投影，写回 text.content 供列表视图/搜索等场景使用。 */
function getAVRichTextPlainContent(blockDOM: string, lute: Lute): string {
    const template = document.createElement("template");
    template.innerHTML = blockDOM;
    const blocks = Array.from(template.content.querySelectorAll<HTMLElement>(
        "[data-type=\"NodeParagraph\"], [data-type=\"NodeHeading\"], [data-type=\"NodeCodeBlock\"], " +
        "[data-type=\"NodeMathBlock\"]"
    )).map(element => lute.BlockDOM2Content(element.outerHTML));
    return projectAVRichTextPlainBlocks(blocks, lute.BlockDOM2Content(blockDOM));
}

export interface AVRichTextSerialized {
    /** 归一化（不动点）后的 BlockDOM */
    blockDOM: string;
    /** 写入 text.rich.content 的稳定 Kramdown */
    markdown: string;
    /** 写入 text.content 的纯文本投影 */
    plainText: string;
}

/**
 * 编辑器 BlockDOM → 可入库的稳定 Kramdown。
 * 净化 → 清结构 → 保护 style → BlockDOM2Md → 编码回实体 → 回环再净化取不动点。
 * 注意用的是 BlockDOM2Md（保留 Kramdown IAL），不是 BlockDOM2StdMd（标准 Markdown，会丢样式）。
 */
export function serializeAVRichTextBlockDOM(blockDOM: string, lute: Lute = getAVRichTextLute()): AVRichTextSerialized {
    const sanitizedBlockDOM = sanitizeAVRichTextBlockDOM(blockDOM);
    const cleanBlockDOM = cleanAVRichTextBlockDOMStructure(sanitizedBlockDOM);
    const styleBackslashEncoding = createAVRichTextStyleBackslashEncoding(cleanBlockDOM);
    const protectedBlockDOM = protectAVRichTextStyleBackslashes(cleanBlockDOM, styleBackslashEncoding);
    const markdown = protectedBlockDOM ?
        styleBackslashEncoding.encodeMarkdown(lute.BlockDOM2Md(protectedBlockDOM).trim()) : "";
    const normalizedBlockDOM = markdown ? sanitizeAVRichTextBlockDOM(parseAVRichTextKramdown(markdown, lute)) : "";
    return {
        blockDOM: normalizedBlockDOM,
        markdown,
        plainText: normalizedBlockDOM ? getAVRichTextPlainContent(normalizedBlockDOM, lute) : ""
    };
}

/** 库里的 Kramdown → 可直接塞进编辑器 wysiwyg 的净化 BlockDOM；空源返回空串。 */
export function getAVRichTextBlockDOM(markdown: string): string {
    return markdown ? sanitizeAVRichTextBlockDOM(parseAVRichTextKramdown(markdown)) : "";
}
