// 数据库文本字段富文本的固定常量：规格标识、允许出现的标签/属性、行内节点类型。
// 与思源内核（kernel/av/value.go 的 isAllowedValueTextRichNode）及原生前端
// （app/src/protyle/render/av/richTextValue.ts）保持一致，改动前须同步核对两处。

/** 富文本规格版本，内核 ValueTextRichSpec。 */
export const AV_RICH_TEXT_SPEC = 1;
/** 富文本源格式，内核 ValueTextRichFormatKramdown。 */
export const AV_RICH_TEXT_FORMAT = "kramdown";

/** 预览 HTML 允许保留的标签，其余由 DOMPurify 剥离。 */
export const AV_RICH_TEXT_PREVIEW_ALLOWED_TAGS = [
    "a", "blockquote", "br", "code", "div", "em", "h1", "h2", "h3", "h4", "h5", "h6", "input", "kbd",
    "li", "mark", "ol", "p", "pre", "s", "span", "strong", "sub", "sup", "u", "ul"
];

/** 预览 HTML 允许保留的属性。 */
export const AV_RICH_TEXT_PREVIEW_ALLOWED_ATTRIBUTES = [
    "checked", "class", "data-content", "data-href", "data-id", "data-language", "data-subtype", "data-type",
    "disabled", "href", "style", "title", "type"
];

/** 只保留纯文本的标签：BlockDOM2HTML 用 sup 输出备注内容，避免备注伪造可交互标记。 */
export const AV_RICH_TEXT_PREVIEW_TEXT_ONLY_TAGS = ["sup"];

/** 编辑器 BlockDOM 中允许存在的标签，其余降级为纯文本。 */
export const AV_RICH_TEXT_EDITOR_ALLOWED_TAGS = ["br", "div", "span", "svg", "use", "wbr"];
const AV_RICH_TEXT_EDITOR_ALLOWED_TAG_SET = new Set(AV_RICH_TEXT_EDITOR_ALLOWED_TAGS);

export function isAVRichTextEditorAllowedTag(tagName: string): boolean {
    return AV_RICH_TEXT_EDITOR_ALLOWED_TAG_SET.has(tagName.toLowerCase());
}

/** 编辑器 BlockDOM 中允许保留的属性，其余一律移除。 */
export const AV_RICH_TEXT_EDITOR_ALLOWED_ATTRIBUTES = [
    "aria-label", "class", "contenteditable", "data-content", "data-href", "data-id", "data-inline-memo-content",
    "data-marker", "data-node-id", "data-node-index", "data-position", "data-subtype", "data-type", "draggable",
    "spellcheck", "spin", "style", "updated", "xlink:href"
];

/** 交给 window.DOMPurify 的预览净化配置。 */
export const AV_RICH_TEXT_PREVIEW_SANITIZE_OPTIONS = {
    ALLOWED_TAGS: AV_RICH_TEXT_PREVIEW_ALLOWED_TAGS,
    ALLOWED_ATTR: AV_RICH_TEXT_PREVIEW_ALLOWED_ATTRIBUTES,
    ALLOW_ARIA_ATTR: false,
    ALLOW_DATA_ATTR: false,
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|siyuan|tel|web\+siyuan):|[#/?]|\.\.?\/|[^a-z]|[a-z0-9._~-]+(?:[/?#]|$))/i
};

/** 富文本单元格预览的类名，与思源 .av__celltext--rich 同名以复用其排版样式。 */
export const AV_RICH_TEXT_CLASS = "av__celltext--rich";

/** 允许写入富文本的块类型，其余块在净化阶段整体移除。 */
export const ALLOWED_BLOCK_TYPES = new Set([
    "NodeParagraph",
    "NodeHeading",
    "NodeList",
    "NodeListItem",
    "NodeBlockquote",
    "NodeCodeBlock",
    "NodeMathBlock"
]);

/** 允许写入富文本的行内类型，其余降级为纯文本。 */
export const ALLOWED_INLINE_TYPES = new Set([
    "a",
    "block-ref",
    "code",
    "em",
    "file-annotation-ref",
    "inline-math",
    "inline-memo",
    "kbd",
    "mark",
    "s",
    "strong",
    "sub",
    "sup",
    "tag",
    "text",
    "u"
]);

/**
 * 会生成可执行渲染结果的代码块语言：这些块在数据库字段里不被支持，
 * 净化时连同内容一起移除（与内核 isAllowedValueTextRichNode 的取舍一致）。
 */
const EXECUTABLE_CODE_LANGUAGES = new Set([
    "abc",
    "echarts",
    "flowchart",
    "graphviz",
    "infographic",
    "mermaid",
    "mindmap",
    "plantuml"
]);

export function isAVRichTextExecutableCodeLanguage(info: string): boolean {
    return EXECUTABLE_CODE_LANGUAGES.has(info.trim().split(/\s+/, 1)[0].toLowerCase());
}
