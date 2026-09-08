// 富文本预览 HTML 的生成与后处理渲染。
// 复刻思源 app/src/protyle/render/av/richText.ts:292-408。
// 预览走 BlockDOM2HTML 而不是直接用编辑器的 BlockDOM：后者带 contenteditable、
// 拖拽按钮等编辑态结构，塞进只读展示区会带来无意义的可交互元素。

import { ProtyleMethod } from "siyuan";
import { escapeHtml } from "@/libs/dom";
import {
    AV_RICH_TEXT_CLASS,
    AV_RICH_TEXT_PREVIEW_SANITIZE_OPTIONS,
    AV_RICH_TEXT_PREVIEW_TEXT_ONLY_TAGS
} from "./constants";
import { getAVRichTextLute } from "./lute";
import { sanitizeAVRichTextInlineStyle } from "./inline-style";
import { cleanAVRichTextBlockDOMStructure } from "./sanitize";
import { getAVRichTextBlockDOM } from "./serialize";
import { getAVRichTextSafeURL } from "./text-safety";

/** 预览结果按 Kramdown 源串缓存，上限 256 条，超出时淘汰最久未使用的一条。 */
const previewCache = new Map<string, string>();
const PREVIEW_CACHE_LIMIT = 256;

/** 去掉预览里不该出现的编辑态结构（代码块语言菜单等 .protyle-action）。 */
function getAVRichTextPreviewBlockDOM(blockDOM: string): string {
    const template = document.createElement("template");
    template.innerHTML = cleanAVRichTextBlockDOMStructure(blockDOM);
    template.content.querySelectorAll(".protyle-action").forEach(element => element.remove());
    return (template.innerHTML || "").trim();
}

/**
 * 把 BlockDOM2HTML 的产物收敛成安全且能被思源样式表正确渲染的预览 HTML：
 * - 公式块还原成 render-node 占位，交给 mathRender 渲染；
 * - 代码块补上 .code-block 与 data-language，交给 highlightRender 渲染；
 * - 复选框保留但置为 disabled，其余表单元素移除；
 * - 链接统一走安全 URL 校验，并补上 data-type="a" 以复用思源的链接样式。
 */
function prepareAVRichTextPreviewHTML(html: string): string {
    const template = document.createElement("template");
    const purify = window.DOMPurify;
    // DOMPurify 缺失时（极端环境）降级为纯转义，宁可丢排版也不能引入未净化的 HTML
    template.innerHTML = purify
        ? purify.sanitize(html, AV_RICH_TEXT_PREVIEW_SANITIZE_OPTIONS)
        : escapeHtml(html);
    template.content.querySelectorAll<HTMLElement>(AV_RICH_TEXT_PREVIEW_TEXT_ONLY_TAGS.join(","))
        .forEach(element => {
            // BlockDOM2HTML 用 sup 输出备注内容；这里只保留文本，避免备注伪造可交互标记
            element.textContent = element.textContent || "";
        });
    template.content.querySelectorAll<HTMLElement>("div.language-math").forEach(element => {
        const content = element.textContent || "";
        element.className = "render-node";
        element.dataset.subtype = "math";
        element.dataset.content = content;
        element.textContent = "";
    });
    template.content.querySelectorAll<HTMLElement>("pre > code").forEach(element => {
        const languageClass = Array.from(element.classList).find(className => className.startsWith("language-"));
        if (!element.parentElement) return;
        element.parentElement.className = "code-block";
        element.parentElement.dataset.language = languageClass?.slice("language-".length) || "plaintext";
    });
    template.content.querySelectorAll<HTMLElement>("*").forEach(element => {
        ["id", "data-node-id", "data-node-index", "updated", "contenteditable", "spellcheck", "draggable"]
            .forEach(attribute => element.removeAttribute(attribute));
        const types = (element.dataset.type || "").split(" ").filter(Boolean);
        const style = element.tagName === "SPAN" && types.includes("text") ?
            sanitizeAVRichTextInlineStyle(element.getAttribute("style")) : "";
        if (style) {
            element.setAttribute("style", style);
        } else {
            element.removeAttribute("style");
        }
    });
    template.content.querySelectorAll<HTMLInputElement>("input").forEach(element => {
        if (element.type !== "checkbox") {
            element.remove();
            return;
        }
        element.disabled = true;
    });
    template.content.querySelectorAll<HTMLElement>("[data-href], a[href]").forEach(element => {
        const href = getAVRichTextSafeURL(element.getAttribute("href") || element.dataset.href);
        if (!href) {
            element.removeAttribute("href");
            element.removeAttribute("data-href");
            return;
        }
        element.setAttribute("href", href);
        element.dataset.href = href;
    });
    template.content.querySelectorAll<HTMLElement>("[data-type~=\"file-annotation-ref\"][data-id]")
        .forEach(element => {
            if (!getAVRichTextSafeURL(element.dataset.id)) {
                element.removeAttribute("data-id");
            }
        });
    template.content.querySelectorAll<HTMLAnchorElement>("a[href]").forEach(element => {
        const types = new Set((element.dataset.type || "").split(" ").filter(Boolean));
        types.add("a");
        element.dataset.type = Array.from(types).join(" ");
    });
    return template.innerHTML;
}

/**
 * 库里的 Kramdown → 只读预览 HTML。
 * 结果可直接 innerHTML 注入；公式与代码高亮需要随后调用 renderAVRichTextElements。
 * 生成失败时降级为转义后的原文，保证不丢内容也不引入 HTML。
 */
export function getAVRichTextPreviewHTML(markdown: string): string {
    if (!markdown) {
        return "";
    }
    const cached = previewCache.get(markdown);
    if (typeof cached === "string") {
        // 命中即重新插入，把 Map 的插入顺序维护成 LRU
        previewCache.delete(markdown);
        previewCache.set(markdown, cached);
        return cached;
    }
    try {
        const lute = getAVRichTextLute();
        const blockDOM = getAVRichTextBlockDOM(markdown);
        const previewBlockDOM = getAVRichTextPreviewBlockDOM(blockDOM);
        const html = previewBlockDOM ? prepareAVRichTextPreviewHTML(lute.BlockDOM2HTML(previewBlockDOM)) : "";
        previewCache.set(markdown, html);
        if (previewCache.size > PREVIEW_CACHE_LIMIT) {
            const oldestKey = previewCache.keys().next().value;
            if (oldestKey !== undefined) {
                previewCache.delete(oldestKey);
            }
        }
        return html;
    } catch (error) {
        console.error("[DatabaseDisplay] Failed to render rich text preview", error);
        return escapeHtml(markdown);
    }
}

/**
 * 对已注入的富文本预览补做公式与代码高亮渲染。
 * 用 data-rich-rendered 打标避免同一节点被重复渲染（渲染会替换 DOM，重复执行会闪烁）。
 */
export function renderAVRichTextElements(root: Element): void {
    const selector = `.${AV_RICH_TEXT_CLASS}:not([data-rich-rendered="true"])`;
    const elements: HTMLElement[] = [];
    if (root.matches(selector)) {
        elements.push(root as HTMLElement);
    }
    elements.push(...root.querySelectorAll<HTMLElement>(selector));
    if (elements.length === 0) {
        return;
    }
    elements.forEach(element => {
        element.dataset.richRendered = "true";
    });
    elements.forEach(element => {
        ProtyleMethod.mathRender(element);
        ProtyleMethod.highlightRender(element);
    });
}
