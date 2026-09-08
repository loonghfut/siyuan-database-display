// BlockDOM 白名单净化：把编辑器产出的 DOM 收敛到数据库字段支持的子集。
// 复刻思源 app/src/protyle/render/av/richText.ts:97-216。
// 净化是幂等的，序列化流程会对结果再净化一次取不动点（见 serialize.ts）。

import {
    ALLOWED_BLOCK_TYPES,
    ALLOWED_INLINE_TYPES,
    AV_RICH_TEXT_EDITOR_ALLOWED_ATTRIBUTES,
    isAVRichTextEditorAllowedTag,
    isAVRichTextExecutableCodeLanguage
} from "./constants";
import { sanitizeAVRichTextInlineStyle } from "./inline-style";
import { getAVRichTextSafeURL, sanitizeAVRichTextInlineMemoContent } from "./text-safety";

function replaceWithText(element: Element): void {
    element.replaceWith(document.createTextNode(element.textContent || ""));
}

/**
 * 移除块级元素上数据库字段不支持的属性：自定义属性、书签、备注、别名与 style。
 * style 只允许出现在行内 text span 上，块级留着会被内核判为非法节点。
 */
function removeUnsupportedBlockAttributes(element: HTMLElement): void {
    Array.from(element.attributes).forEach(attribute => {
        if (attribute.name.startsWith("custom-") || attribute.name === "bookmark" ||
            attribute.name === "memo" || attribute.name === "name" || attribute.name === "style") {
            element.removeAttribute(attribute.name);
        }
    });
}

/**
 * 净化 BlockDOM：
 * 1. 块级只留段落/标题/列表/列表项/引用/代码块/公式块，可执行代码块整体移除；
 * 2. 图片、媒体、表单与脚本类标签整体移除；
 * 3. 非白名单标签降级为纯文本（保留文字，去掉标记）；
 * 4. 行内 span 的 data-type 必须全在白名单内，style 走白名单归一化；
 * 5. 链接 / 块引用 / 文件标注引用的目标必须安全，否则摘掉对应属性。
 */
export function sanitizeAVRichTextBlockDOM(blockDOM: string): string {
    const template = document.createElement("template");
    template.innerHTML = blockDOM;
    template.content.querySelectorAll<HTMLElement>("[data-type^=\"Node\"]").forEach(element => {
        const type = element.dataset.type;
        if (type === "NodeCodeBlock" && (element.classList.contains("render-node") ||
            isAVRichTextExecutableCodeLanguage(element.dataset.subtype || ""))) {
            element.remove();
            return;
        }
        if (type === "NodeHeading") {
            const subtype = element.dataset.subtype || "";
            if (!/^h[1-6]$/.test(subtype)) {
                element.remove();
                return;
            }
            element.className = subtype;
        }
        if (type && ALLOWED_BLOCK_TYPES.has(type)) {
            removeUnsupportedBlockAttributes(element);
            return;
        }
        element.remove();
    });
    template.content.querySelectorAll(
        ".img, img, iframe, audio, video, object, embed, script, style, link, meta, form, input, button, textarea, select"
    ).forEach(element => {
        element.remove();
    });
    template.content.querySelectorAll<HTMLElement>("*").forEach(element => {
        if (!isAVRichTextEditorAllowedTag(element.tagName)) {
            replaceWithText(element);
        }
    });
    template.content.querySelectorAll<HTMLElement>("span[data-type]").forEach(element => {
        const types = (element.dataset.type || "").split(" ").filter(Boolean);
        if (types.some(type => !ALLOWED_INLINE_TYPES.has(type))) {
            replaceWithText(element);
            return;
        }
        const style = types.includes("text") ? sanitizeAVRichTextInlineStyle(element.getAttribute("style")) : "";
        if (style) {
            element.setAttribute("style", style);
        } else {
            element.removeAttribute("style");
        }
        if (types.includes("inline-memo")) {
            element.dataset.inlineMemoContent = sanitizeAVRichTextInlineMemoContent(
                element.dataset.inlineMemoContent || "");
        }
    });
    template.content.querySelectorAll<HTMLElement>("*").forEach(element => {
        Array.from(element.attributes).forEach(attribute => {
            const name = attribute.name.toLowerCase();
            if (!AV_RICH_TEXT_EDITOR_ALLOWED_ATTRIBUTES.includes(name) ||
                name === "xlink:href" && !attribute.value.startsWith("#icon")) {
                element.removeAttribute(attribute.name);
            }
        });
    });
    template.content.querySelectorAll<HTMLElement>("[data-type~=\"a\"][data-href]").forEach(element => {
        const href = getAVRichTextSafeURL(element.dataset.href);
        if (href) {
            element.dataset.href = href;
        } else {
            element.removeAttribute("data-href");
        }
    });
    template.content.querySelectorAll<HTMLElement>("[data-type~=\"file-annotation-ref\"][data-id]")
        .forEach(element => {
            if (!getAVRichTextSafeURL(element.dataset.id)) {
                element.removeAttribute("data-id");
            }
        });
    // 块引用 ID 必须是「14 位时间戳-7 位随机串」，否则引用无法解析
    template.content.querySelectorAll<HTMLElement>("[data-type~=\"block-ref\"][data-id]").forEach(element => {
        if (!/^\d{14}-[a-z0-9]{7}$/.test(element.dataset.id || "")) {
            element.removeAttribute("data-id");
        }
    });
    template.content.querySelectorAll<HTMLElement>("[style]:not(span[data-type])")
        .forEach(element => element.removeAttribute("style"));
    return (template.innerHTML || "").trim();
}

/**
 * 去掉编辑器附带的结构与运行期痕迹：拖拽/菜单按钮容器、块 ID、块序号与更新时间。
 * 这些属性写进 Kramdown 会让同一内容每次序列化都不同，破坏「未修改则不写库」的判定。
 */
export function cleanAVRichTextBlockDOMStructure(blockDOM: string): string {
    const template = document.createElement("template");
    template.innerHTML = blockDOM;
    template.content.querySelectorAll(".protyle-attr, .protyle-icons").forEach(element => element.remove());
    template.content.querySelectorAll<HTMLElement>("*").forEach(element => {
        ["data-node-id", "data-node-index", "updated"].forEach(attribute => {
            element.removeAttribute(attribute);
        });
    });
    return (template.innerHTML || "").trim();
}
