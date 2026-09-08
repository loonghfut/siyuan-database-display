// 数据库文本字段富文本（思源 3.8.3 引入的 text.rich）的领域层出口。
//
// 移植自思源 app/src/protyle/render/av/ 下的 richText.ts / richTextValue.ts，
// 这两个模块没有导出到插件 SDK，但其依赖（Lute、Protyle、DOMPurify、b3 样式表）
// 在插件运行时都可用，因此按原实现逐段复刻而非另起一套简化逻辑 ——
// 简化版会与思源原生产出不一致的 Kramdown，导致同一条记录在两边来回改写。
//
// 分层：
//   constants      白名单与规格常量
//   lute           独立 Lute 引擎（不跟随用户的 Markdown 语法开关）
//   font-family    字体族样式串解析（sanitizeAVRichTextInlineStyle 的依赖）
//   inline-style   行内 style 白名单归一化
//   text-safety    Unicode / HTML 实体 / URL / 备注内容的可疑串校验
//   style-entities Kramdown 里 style 实体的哨兵保护与还原
//   sanitize       BlockDOM 白名单净化
//   serialize      BlockDOM ⇄ Kramdown 的稳定往返与纯文本投影
//   preview        只读预览 HTML 生成与公式/代码高亮
//   value          读写取值与写入值构造

export {
    ALLOWED_BLOCK_TYPES,
    ALLOWED_INLINE_TYPES,
    AV_RICH_TEXT_CLASS,
    AV_RICH_TEXT_EDITOR_ALLOWED_ATTRIBUTES,
    AV_RICH_TEXT_EDITOR_ALLOWED_TAGS,
    AV_RICH_TEXT_FORMAT,
    AV_RICH_TEXT_PREVIEW_ALLOWED_ATTRIBUTES,
    AV_RICH_TEXT_PREVIEW_ALLOWED_TAGS,
    AV_RICH_TEXT_PREVIEW_SANITIZE_OPTIONS,
    AV_RICH_TEXT_PREVIEW_TEXT_ONLY_TAGS,
    AV_RICH_TEXT_SPEC,
    isAVRichTextEditorAllowedTag,
    isAVRichTextExecutableCodeLanguage
} from "./constants";
export { configureAVRichTextLute, getAVRichTextLute } from "./lute";
export { getAVRichTextPreviewHTML, renderAVRichTextElements } from "./preview";
export { cleanAVRichTextBlockDOMStructure, sanitizeAVRichTextBlockDOM } from "./sanitize";
export {
    getAVRichTextBlockDOM,
    projectAVRichTextPlainBlocks,
    serializeAVRichTextBlockDOM,
    type AVRichTextSerialized
} from "./serialize";
export { sanitizeAVRichTextInlineStyle } from "./inline-style";
export {
    createAVRichTextStyleBackslashEncoding,
    createAVRichTextStyleEntityReplacer,
    protectAVRichTextKramdownStyleEntities,
    type AVRichTextStyleEntityProtection
} from "./style-entities";
export { getAVRichTextSafeURL, sanitizeAVRichTextInlineMemoContent } from "./text-safety";
export {
    createAVPlainTextValue,
    createAVRichTextValue,
    getAVTextPlainContent,
    getAVTextSource,
    type AVRichTextWriteValue,
    type AVTextSource
} from "./value";
