// 文本字段的快捷编辑面板：挂载思源同款的 Protyle Lite 所见即所得编辑器。
// 复刻 app/src/protyle/render/av/richTextEditor.ts（该模块未导出到插件 SDK）。
// 面板定位单独放在 ./rich-text-editor-position，与思源拆出 richTextEditorPosition.ts 同构。
//
// 与原生的一致点：面板结构用 .av__mask / .av__richtext-editor / .av__richtext-host
// （直接吃思源 business/_av.scss:288-342 的样式），工具栏与 hint 走同一套裁剪，
// 保存走「序列化后与初始值比对，未变化则不写库」，Esc / 点击面板外 = 提交。
// 与原生的差异只有两处，都是插件环境的必要适配：
//   1. 面板头部沿用本插件其他编辑器的标题栏（字段名 + 保存 + 取消），原生桌面端没有头部；
//   2. 存活判定盯的是承载 chip 的块而不是 chip 本身 —— 插件会在每次刷新时重建 chip，
//      盯 chip 会让本插件自己的刷新把正在编辑的内容丢掉。

import { ProtyleMethod } from "siyuan";
import type { App, IProtyle, IProtyleOptions } from "siyuan";
import { attributeViewRepository } from "@/data/attribute-view-repository";
import { AttributeViewTextValue } from "@/core/types";
import {
    configureAVRichTextLute,
    createAVRichTextValue,
    getAVRichTextBlockDOM,
    getAVRichTextLute,
    getAVTextSource,
    sanitizeAVRichTextBlockDOM,
    serializeAVRichTextBlockDOM
} from "@/domain/rich-text";
import { t } from "@/i18n";
import { toErrorMessage } from "@/libs/error-utils";
import { notify } from "@/libs/notify";
import { createIconButton, escapeHtml } from "@/libs/dom";
import {
    appendHeaderAction,
    createPanelHeader,
    ICONS,
    releaseOpenPanel,
    setOpenPanel,
    setOpenPanelCleanup
} from "./popup";
import { mountProtyleLiteFragment, type ProtyleLiteFragment } from "./protyle-lite";
import { isMobile, setPanelPosition } from "./rich-text-editor-position";

/**
 * 斜杠菜单里允许出现的条目。数据库字段只支持段落/标题/列表/引用/代码块/公式块，
 * 其余（图片、资源、模板、小组件、表格、超级块…）插进去也会在保存净化时被整块删掉，
 * 与其让用户丢内容，不如一开始就不给。与原生 richTextEditor.ts:20-46 同一份清单。
 */
const SAFE_SLASH_IDS = new Set([
    "ref",
    "heading1", "heading2", "heading3", "heading4", "heading5", "heading6",
    "list", "orderedList", "check",
    "quote", "code", "math", "link",
    "bold", "italic", "underline", "strike", "mark", "sup", "sub",
    "inlineCode", "kbd", "tag", "inlineMath"
]);

/** 桌面端工具栏，对应原生 getDefaultToolbar(false)（toolbar/defaults.ts:20-101）。 */
const DESKTOP_TOOLBAR: Array<string | { name: string; icon: string }> = [
    "block-ref", "a", "ai", "|",
    "text", "strong", "em", "u", "s", "mark", "sup", "sub",
    "code", "kbd", "tag", "inline-math", "inline-memo", "|",
    "format-painter", { name: "clear", icon: "iconEraser" }
];

/** 移动端工具栏，对应原生 getDefaultToolbar(true)（toolbar/defaults.ts:120-137）。 */
const MOBILE_TOOLBAR: string[] = [
    "block-ref", "a", "ai", "|",
    "text", "strong", "em", "u", "clear", "|",
    "code", "tag", "inline-math", "inline-memo"
];

type HintOptions = NonNullable<IProtyleOptions["hint"]>;
type HintExtendEntry = NonNullable<HintOptions["extend"]>[number];
type HintFunction = NonNullable<HintExtendEntry["hint"]>;
type HintData = ReturnType<HintFunction>[number];

export interface RichTextEditorOptions {
    /** Protyle 构造需要的 App；缺省时回落到 window.siyuan.ws.app。 */
    app?: App;
    /** 触发编辑的 chip，作为面板定位锚点。 */
    element: HTMLElement;
    avID: string;
    keyID: string;
    itemID: string;
    keyName: string;
    /** 当前的 text 值（含 rich），由 rawValue 原样传入。 */
    currentValue: unknown;
    onSave?: (value: AttributeViewTextValue) => void;
    onCancel?: () => void;
}

/**
 * 打开文本字段的富文本编辑面板。
 *
 * 面板是全屏遮罩 + 悬浮编辑器：遮罩吃掉了「点击外部」的判定（只有点中遮罩本身才算外部），
 * 因此工具栏、hint 浮层、取色对话框这些挂在 body 上的子面板都不会误触关闭。
 */
export function openRichTextEditor(options: RichTextEditorOptions): void {
    const anchorElement = options.element;
    // 存活判定盯承载 chip 的块：插件刷新会重建 chip，盯 chip 会误杀正在编辑的内容
    const ownerElement = anchorElement.closest<HTMLElement>("[data-node-id]") || anchorElement;
    const mobile = isMobile();

    const maskElement = document.createElement("div");
    // 复用思源的遮罩类名：popover.ts:416 对 .av__mask 内的鼠标目标会保留承载浮窗，
    // 锚点 chip 位于浮窗内时编辑期间浮窗不会被 hidePopover 销毁
    maskElement.className = "av__mask av__richtext-mask db-display-richtext__mask";
    maskElement.style.zIndex = String(++window.siyuan.zIndex);

    const panelElement = document.createElement("div");
    panelElement.className = "av__richtext-editor";
    panelElement.setAttribute("role", "dialog");
    panelElement.setAttribute("aria-label", options.keyName);

    let finished = false;
    // 取消意图单独记一笔：保存路径要 await 输入法 flush，其间面板可能被外部关掉
    // （切换字段走 closeOpenPanel、宿主块被移除），那时必须放弃写库
    let cancelled = false;
    const header = createPanelHeader(options.keyName, () => void finish(false));
    const saveButton = createIconButton(ICONS.check, t("common.save"),
        "inline-edit-action inline-edit-action--primary");
    saveButton.addEventListener("click", event => {
        event.stopPropagation();
        void finish(true);
    });
    appendHeaderAction(header, saveButton);

    const hostElement = document.createElement("div");
    hostElement.className = "av__richtext-host";
    // mathRender / chartRender / processRender 据此走受限渲染，不执行图表与外部命令
    hostElement.dataset.protyleLiteRender = "safe";
    panelElement.append(header, hostElement);

    if (mobile) {
        const actions = document.createElement("div");
        actions.className = "av__richtext-actions";
        actions.innerHTML =
            `<button type="button" class="b3-button b3-button--cancel" data-type="cancel">${escapeHtml(t("common.cancel"))}</button>` +
            `<button type="button" class="b3-button b3-button--text" data-type="save">${escapeHtml(t("common.save"))}</button>`;
        panelElement.appendChild(actions);
    }
    maskElement.appendChild(panelElement);
    document.body.appendChild(maskElement);
    // 登记到内联编辑的面板单例：切换字段、插件卸载时都会经由它收口
    setOpenPanel(maskElement, anchorElement);
    setPanelPosition(panelElement, anchorElement, mobile);

    const source = getAVTextSource(
        (options.currentValue && typeof options.currentValue === "object"
            ? options.currentValue
            : { content: typeof options.currentValue === "string" ? options.currentValue : ""
        }) as AttributeViewTextValue
    );
    const toolbar = (mobile ? MOBILE_TOOLBAR : DESKTOP_TOOLBAR) as IProtyleOptions["toolbar"];
    // 笔记本 id 供 (( 块引用候选缩小检索范围（加密笔记本下 hintRef 必传，
    // 见 protyle/hint/extend.ts:555-561），取宿主块所在编辑器上的 data-notebook-id
    const notebookId = ownerElement.closest<HTMLElement>(".protyle")?.dataset.notebookId;

    const fragment: ProtyleLiteFragment = mountProtyleLiteFragment(hostElement, {
        app: options.app,
        initialBlockHTML: source.kind === "rich" ? getAVRichTextBlockDOM(source.content) : undefined,
        initialPlainText: source.kind === "plain" ? source.content : undefined,
        placeholder: window.siyuan.languages.empty,
        // 不传 hint：先让 Protyle 用默认配置构造，随后再从默认表里取出思源自己的
        // hintRef / hintSlash 做裁剪（见 restrictHintExtend）。这两个函数是内部模块，
        // 插件无法 import，但构造完成后它们已经躺在 protyle.options.hint.extend 里。
        protyleOptions: { notebookId, toolbar },
        runtimeCapabilities: {
            upload: false,
            websocket: false,
            lute: getAVRichTextLute(),
            // 锁住 toolbar：不锁的话 Toolbar.update() 会回落到 getDefaultToolbar，
            // 把图片、上传、块插入等数据库字段不支持的按钮放进来
            lockedOptions: { toolbar },
            pluginExtensions: false,
            customBlockRender: false,
            sanitizeBlockDOM: sanitizeAVRichTextBlockDOM,
            restoreLuteMarkdownSyntax: configureAVRichTextLute
        },
        afterSetContent: (protyle, element) => {
            ProtyleMethod.mathRender(element);
            ProtyleMethod.highlightRender(element);
            protyle.undo?.clear();
        }
    });
    restrictHintExtend(fragment.protyle);
    setPanelPosition(panelElement, anchorElement, mobile);

    // 初始内容经同一套序列化算出的 Kramdown 作为基准：保存时逐字节比对，
    // 相同就不发写请求（原生 richTextEditor.ts:148、180 同款判定）
    const initialMarkdown = serializeAVRichTextBlockDOM(fragment.getBlockHTML()).markdown;

    let tornDown = false;
    const teardown = (): void => {
        if (tornDown) return;
        tornDown = true;
        ownerObserver.disconnect();
        panelResizeObserver?.disconnect();
        window.removeEventListener("resize", reposition);
        maskElement.removeEventListener("mousedown", handleMaskMouseDown);
        panelElement.removeEventListener("keydown", handleKeyDown, true);
        fragment.destroy();
        releaseOpenPanel(maskElement);
        maskElement.remove();
    };

    const isOwnerConnected = (): boolean => ownerElement.isConnected;

    const finish = async (save: boolean): Promise<void> => {
        // 先记取消意图再判重入：正在保存时收到的取消调用会被 finished 挡掉，
        // 但它的意图要传给在途的那次保存（同原生 richTextEditor.ts:166-178）
        if (!save) cancelled = true;
        if (finished) return;
        finished = true;
        try {
            if (!save) {
                options.onCancel?.();
                return;
            }
            // 输入法候选、行内标记等输入事件是去抖提交的，不 flush 会漏掉最后一段
            await (fragment.protyle.wysiwyg as unknown as { flushPendingInput: () => Promise<void> })
                .flushPendingInput();
            // flush 是异步的，其间面板可能已被取消或宿主块已被移除
            if (cancelled || !isOwnerConnected()) return;
            const serialized = serializeAVRichTextBlockDOM(fragment.getBlockHTML());
            if (serialized.markdown === initialMarkdown) return;
            // rich 必须显式携带：内核在「请求无 text.rich 键且 content 变化」时会清掉富文本
            const value = createAVRichTextValue(serialized.markdown, serialized.plainText);
            await attributeViewRepository.setValue(options.avID, options.keyID, options.itemID, value);
            notify(t("common.saveSuccess"), 2000, "info");
            // 回传新值供上层做乐观刷新；实际重渲染仍由 scheduleRefresh 拉取写后数据
            options.onSave?.(value.text);
        } catch (error) {
            const message = toErrorMessage(error);
            console.error(t("common.saveFailed", { message }), error);
            notify(t("common.saveFailed", { message }), 5000, "error");
        } finally {
            teardown();
        }
    };

    // 单例 cleanup：enableInlineEdit 切换字段、closeInlineEdit（onunload）都经此收口。
    // 与原生「关闭即取消」一致 —— 需要提交请点保存按钮或按 Esc。
    setOpenPanelCleanup(() => void finish(false));

    const reposition = (): void => setPanelPosition(panelElement, anchorElement, mobile);
    window.addEventListener("resize", reposition);
    // 面板高度随内容变化（ Protyle 撑开 / 折叠），需要跟着重新贴边
    const panelResizeObserver = typeof ResizeObserver === "undefined"
        ? undefined
        : new ResizeObserver(reposition);
    panelResizeObserver?.observe(panelElement);
    // 宿主块被移除（切文档、块被删）时丢弃编辑，避免写回一个已不存在的行
    const ownerObserver = new MutationObserver(() => {
        if (!isOwnerConnected()) void finish(false);
    });
    ownerObserver.observe(document.body, { childList: true, subtree: true });

    const handleMaskMouseDown = (event: MouseEvent): void => {
        // 只有点中遮罩本身才算「点击外部」；工具栏、hint、对话框都挂在 body 上，
        // 它们的目标不是遮罩，不会误关面板（同原生 richTextEditor.ts:199-203）
        if (event.target === maskElement) void finish(true);
    };
    maskElement.addEventListener("mousedown", handleMaskMouseDown);

    panelElement.querySelector('[data-type="cancel"]')?.addEventListener("click", () => void finish(false));
    panelElement.querySelector('[data-type="save"]')?.addEventListener("click", () => void finish(true));

    const handleKeyDown = (event: KeyboardEvent): void => {
        // Ctrl/Cmd+Enter 提交，与本插件其他编辑面板一致
        if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            event.stopPropagation();
            void finish(true);
            return;
        }
        // Esc 提交（原生桌面端同款语义）；hint / 工具栏 / 二级面板展开时让位给它们，
        // 否则选中块引用候选会被 Esc 打断
        if (event.key === "Escape" && fragment.hintElement.classList.contains("fn__none") &&
            fragment.protyle.toolbar!.element.classList.contains("fn__none") &&
            fragment.protyle.toolbar!.subElement.classList.contains("fn__none")) {
            event.preventDefault();
            event.stopPropagation();
            void finish(true);
        }
    };
    panelElement.addEventListener("keydown", handleKeyDown, true);

    fragment.focus(true);
}

/**
 * 把默认的 hint 扩展裁剪成数据库字段允许的子集。
 *
 * hintRef（(( 块引用补全）与 hintSlash（/ 斜杠菜单）是思源的内部模块，插件 import 不到，
 * 但 Protyle 构造完成后它们已经在 protyle.options.hint.extend 里了 —— Hint.render 每次
 * 按键都重新读这个数组（hint/index.ts:255、296、326），所以构造后改写即可生效。
 *
 * 同时按原生 richTextEditor.ts:71-79 做两件事：斜杠结果按 SAFE_SLASH_IDS 过滤；
 * 提示浮层弹出前抬一次 z-index（浮层挂在 body 上，需要盖住本面板）。
 */
function restrictHintExtend(protyle: IProtyle): void {
    const hint = protyle.options.hint;
    if (!hint) return;
    const defaults = hint.extend || [];
    const prepareHint = () => {
        const element = protyle.hint?.element;
        if (element && element.classList.contains("fn__none")) {
            element.style.zIndex = String(++window.siyuan.zIndex);
        }
    };
    const wrap = (target: HintFunction | undefined, filter?: (items: HintData[]) => HintData[]) => {
        if (!target) return undefined;
        const wrapped: HintFunction = (key, targetProtyle, source) => {
            prepareHint();
            const items = target(key, targetProtyle, source);
            return filter ? filter(items) : items;
        };
        return wrapped;
    };
    const blockRefHint = wrap(defaults.find(item => item.key === "((")?.hint);
    const slashHint = wrap(defaults.find(item => item.key === "/")?.hint,
        items => items.filter(item => item.id && SAFE_SLASH_IDS.has(item.id)));

    const extend: HintExtendEntry[] = [];
    if (blockRefHint) {
        ["((", "【【", "（（", "[["].forEach(key => extend.push({ key, hint: blockRefHint }));
    }
    if (slashHint) {
        ["/", "、"].forEach(key => extend.push({ key, hint: slashHint }));
    }
    // emoji 触发项（{key: ":"}，无 hint 函数）保留，否则 :smile: 这类补全会失效
    const emojiEntry = defaults.find(item => item.key === ":" && !item.hint);
    if (emojiEntry) extend.push(emojiEntry);
    hint.extend = extend;
}
