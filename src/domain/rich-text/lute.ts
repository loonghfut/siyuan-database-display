// 富文本专用的 Lute 引擎工厂。
//
// 数据库里存的是稳定的 Kramdown 片段，解析不能跟随用户「设置 → 编辑器 → Markdown 语法」
// 的开关变化，否则同一条记录在不同人的思源里会渲染出不同结果。因此这里复刻思源
// getAgentLute（app/src/protyle/render/setLute.ts:37）的做法：行内语法全部硬编码启用，
// 再叠加 configureAVRichTextLute（app/src/protyle/render/av/richTextValue.ts:257）的
// 数据库字段专用取舍。

import type { Lute } from "siyuan";

/** SDK 未声明的配置方法，运行时由页面的 lute.min.js 提供。 */
type ExtendedLute = Lute & {
    SetEmoji: (enabled: boolean) => void;
    SetCustomBlock: (enabled: boolean) => void;
    SetGitConflict: (enabled: boolean) => void;
    SetFullWidthStrikethrough: (enabled: boolean) => void;
    SetTabs: (enabled: boolean) => void;
};

/**
 * 运行时的 Lute 由思源页面注入到 window（lute.min.js）。
 * require("siyuan") 只导出 Protyle/ProtyleMethod 等，没有 Lute，只能取全局对象。
 */
function luteClass(): typeof Lute {
    return window.Lute;
}

/** 复刻 getAgentLute：不读 config.editor.markdown 的语法开关，行内语法一律启用。 */
function createStandaloneLute(): Lute {
    const lute = luteClass().New() as ExtendedLute;
    lute.SetSpellcheck(false);
    lute.SetProtyleMarkNetImg(false);
    lute.SetFileAnnotationRef(true);
    lute.SetHTMLTag2TextMark(true);
    lute.SetTextMark(true);
    lute.SetHeadingID(false);
    lute.SetYamlFrontMatter(false);
    // 富文本源里不出现 emoji 短代码，置空表避免把 :xxx: 误解析成表情
    lute.PutEmojis({});
    lute.SetEmojiSite("/emojis");
    lute.SetHeadingAnchor(false);
    lute.SetInlineMathAllowDigitAfterOpenMarker(true);
    lute.SetToC(false);
    lute.SetIndentCodeBlock(false);
    lute.SetParagraphBeginningSpace(true);
    lute.SetChineseParagraphBeginningSpace(true);
    lute.SetSetext(false);
    lute.SetFootnotes(false);
    lute.SetLinkRef(false);
    lute.SetSanitize(true);
    lute.SetRenderListStyle(false);
    lute.SetImgPathAllowSpace(true);
    lute.SetKramdownIAL(true);
    lute.SetSuperBlock(true);
    lute.SetCallout(true);
    lute.SetTabs(true);
    lute.SetInlineAsterisk(true);
    lute.SetInlineUnderscore(true);
    lute.SetSup(true);
    lute.SetSub(true);
    lute.SetTag(true);
    lute.SetInlineMath(true);
    lute.SetGFMStrikethrough1(false);
    lute.SetGFMStrikethrough(true);
    lute.SetMark(true);
    lute.SetSpin(true);
    lute.SetProtyleWYSIWYG(true);
    lute.SetBlockRef(true);
    lute.SetUnorderedListMarker("-");
    lute.SetDataTask(true);
    lute.SetExportNormalizeTaskListMarker(true);
    lute.SetArbitraryTaskListItemMarker(true);
    lute.SetEnsureListItemParagraph(true);
    return lute;
}

/**
 * 数据库字段专用配置：关闭 emoji 短代码，开启自定义块 / Git 冲突标记 / 全角删除线。
 * 同时作为 Protyle 的 restoreLuteMarkdownSyntax 回调 —— 粘贴等路径会把 Lute 的
 * 语法开关重置为默认值，需要按这里的取舍再校正一遍。
 */
export function configureAVRichTextLute(lute: Lute): Lute {
    const fixedLute = lute as ExtendedLute;
    fixedLute.SetEmoji(false);
    fixedLute.SetCustomBlock(true);
    fixedLute.SetGitConflict(true);
    fixedLute.SetInlineAsterisk(true);
    fixedLute.SetInlineUnderscore(true);
    fixedLute.SetGFMStrikethrough1(false);
    fixedLute.SetGFMStrikethrough(true);
    fixedLute.SetSup(true);
    fixedLute.SetSub(true);
    fixedLute.SetTag(true);
    fixedLute.SetInlineMath(true);
    fixedLute.SetMark(true);
    fixedLute.SetFullWidthStrikethrough(true);
    fixedLute.SetExportNormalizeTaskListMarker(false);
    return lute;
}

let richTextLute: Lute | undefined;

/** 获取（首次调用时创建）富文本共享 Lute 单例。 */
export function getAVRichTextLute(): Lute {
    if (!richTextLute) {
        richTextLute = configureAVRichTextLute(createStandaloneLute());
    }
    return richTextLute;
}
