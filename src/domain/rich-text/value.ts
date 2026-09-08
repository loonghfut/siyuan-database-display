// 文本字段的读写取值：富文本源的识别与写入值的构造。
// 复刻思源 app/src/protyle/render/av/richTextValue.ts:873-924。
//
// 内核契约（kernel/model/attribute_view.go:8205-8213、kernel/av/value.go:2130）：
// - ValueText{Content, Rich *ValueTextRich}，Rich 的 JSON 标签是 omitempty，读出时纯文本值没有 rich 键；
// - 旧值有 rich、请求 JSON 未显式包含 text.rich 键、且 content 变化 → 内核自动清除 rich；
// - 清除必须显式传 rich:null；
// - 写入后内核用 rich.content 重算并覆盖 content，所以 content 只是投影，源永远是 rich。

import { AttributeViewTextRich, AttributeViewTextValue, AttributeViewWriteValue } from "@/core/types";
import { AV_RICH_TEXT_FORMAT, AV_RICH_TEXT_SPEC } from "./constants";

/** 文本字段的编辑源：富文本时 content 是 Kramdown，纯文本时是原文。 */
export interface AVTextSource {
    kind: "plain" | "rich";
    content: string;
}

/**
 * 取编辑源。spec/format 必须与内核常量完全一致（IsRich 的判定条件），
 * 否则按纯文本处理，避免把不认识的载荷当 Kramdown 解析出乱码。
 */
export function getAVTextSource(text?: AttributeViewTextValue | null): AVTextSource {
    const rich = text?.rich;
    if (rich && rich.spec === AV_RICH_TEXT_SPEC && rich.format === AV_RICH_TEXT_FORMAT &&
        typeof rich.content === "string") {
        return { kind: "rich", content: rich.content };
    }
    return { kind: "plain", content: typeof text?.content === "string" ? text.content : "" };
}

/** 取纯文本投影，用于列表展示、复制与 aria-label。 */
export function getAVTextPlainContent(text?: AttributeViewTextValue | null): string {
    return typeof text?.content === "string" ? text.content : "";
}

/** 携带富文本源的文本写入值，可直接当作 AttributeViewWriteValue 传给仓储。 */
export interface AVRichTextWriteValue {
    text: { content: string; rich: AttributeViewTextRich };
}

/** 富文本写入值：spec/format 缺一不可，否则内核判为非富文本。 */
export function createAVRichTextValue(markdown: string, plainText: string): AVRichTextWriteValue {
    const rich: AttributeViewTextRich = {
        spec: AV_RICH_TEXT_SPEC,
        format: AV_RICH_TEXT_FORMAT,
        content: markdown
    };
    return { text: { content: plainText, rich } };
}

/**
 * 纯文本写入值。clearRich 为真时显式传 rich:null 清除富文本；
 * 为假时不带 rich 键，与原生 createAVPlainTextValue(content, source, false) 一致
 * —— 此时若 content 发生变化，内核会自行清除 rich。
 */
export function createAVPlainTextValue(content: string, clearRich = false): AttributeViewWriteValue {
    return { text: clearRich ? { content, rich: null } : { content } };
}
