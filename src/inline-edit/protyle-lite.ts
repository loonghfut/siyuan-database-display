// Protyle Lite 片段编辑器：在一个宿主元素里挂一个不联网、不落库的迷你所见即所得编辑器。
// 复刻思源 app/src/protyle/lite/fragmentEditor.ts（该模块未导出到插件 SDK）。
//
// 之所以能在插件里跑通：require("siyuan").Protyle 就是 app/src/protyle/index.ts 里
// 那个可构造的编辑器类本体（plugin/API.ts:415 导出），不是 window.Protyle 那套
// 纯静态渲染方法。构造函数的第 4 参 runtimeCapabilities（protyle/index.ts:124）
// 未在 SDK 类型里声明，但运行时存在，用来关掉上传 / websocket / 其他插件的 protyleOptions。

import { Constants, Protyle } from "siyuan";
import type { App, IProtyle, IProtyleOptions, Lute } from "siyuan";

/** 宿主元素标记类，思源样式表据此收敛 lite 片段内的菜单按钮（protyle/_protyle.scss:6）。 */
export const PROTYLE_LITE_FRAGMENT_CLASS = "protyle-lite-fragment";
/** 提示浮层的 lite 覆盖类，避免被面板裁剪（business/_ai_agent.scss:1224 定义了定位规则）。 */
export const PROTYLE_LITE_HINT_OVERLAY_CLASS = "protyle-hint--lite-overlay";

/** Constants.ZWSP 未在 SDK 类型里声明，值为零宽空格（app/src/constants.ts:927），运行时存在。 */
const ZWSP: string = (Constants as unknown as { ZWSP?: string }).ZWSP || "\u200b";

/**
 * runtimeCapabilities 的结构见 app/src/protyle/runtimeCapabilities.ts:3-12。
 * 它是个纯对象，插件可以自由构造，不需要任何 webpack hack。
 */
export interface ProtyleRuntimeCapabilities {
    /** false → 禁用上传（protyle/index.ts:138-143、167-169） */
    upload?: boolean;
    /** false → 跳过 new Model({app}) 与 ws.connect（protyle/index.ts:223） */
    websocket?: boolean;
    /** 指定专用 Lute，不共用编辑器的实例（protyle/index.ts:222 → 613） */
    lute?: Lute;
    /**
     * 锁定 toolbar / hint 配置。不传 toolbar 的话，工具栏刷新时会回落到
     * getDefaultToolbar(isMobile())（toolbar/index.ts:202），也就是含图片、上传、
     * 块插入的完整文档工具栏 —— 数据库字段里不该出现这些。
     */
    lockedOptions?: Partial<Pick<IProtyleOptions, "hint" | "toolbar">>;
    /** false → 不合并其他插件注册的 protyleOptions（protyle/index.ts:128） */
    pluginExtensions?: boolean;
    /** false → 不注册自定义块渲染（protyle/index.ts:207） */
    customBlockRender?: boolean;
    /** 粘贴时的 BlockDOM 净化钩子（protyle/paste.ts:621 消费） */
    sanitizeBlockDOM?: (blockDOM: string) => string;
    /** 粘贴后把 Lute 的语法开关校正回本编辑器的取舍（protyle/paste.ts:331） */
    restoreLuteMarkdownSyntax?: (lute: Lute) => void;
}

export interface ProtyleLiteFragmentOptions {
    app?: App;
    /** 初始内容三选一，优先级 BlockHTML > Markdown > PlainText；都缺省时挂一个空段落 */
    initialBlockHTML?: string;
    initialPlainText?: string;
    placeholder?: string;
    /** 内容为空时给 wysiwyg 追加的类，供 CSS 显示 placeholder */
    emptyClass?: string;
    protyleOptions?: Partial<IProtyleOptions>;
    runtimeCapabilities?: ProtyleRuntimeCapabilities;
    onChange?: () => void;
    afterSetContent?: (protyle: IProtyle, element: HTMLElement) => void;
}

export interface ProtyleLiteFragment {
    instance: Protyle;
    protyle: IProtyle;
    wysiwyg: HTMLElement;
    hintElement: HTMLElement;
    destroy: () => void;
    focus: (toEnd?: boolean) => void;
    getBlockHTML: () => string;
    isEmpty: () => boolean;
}

/** 复刻 block/util.ts:482 的 genEmptyElement(false, false)：不带零宽空格与 wbr 的空段落。 */
function genEmptyElement(): HTMLElement {
    const element = document.createElement("div");
    element.setAttribute("data-node-id", window.Lute.NewNodeID());
    element.setAttribute("data-type", "NodeParagraph");
    element.classList.add("p");
    element.innerHTML =
        `<div contenteditable="true" spellcheck="${window.siyuan.config.editor.spellcheck}"></div>` +
        `<div class="protyle-attr" contenteditable="false">${ZWSP}</div>`;
    return element;
}

/** 复刻 protyle/ui/initUI.ts:347 的 removeLoading：摘掉加载态标记与占位节点。 */
function removeLoading(protyle: IProtyle): void {
    protyle.element.setAttribute("data-loading", "finished");
    protyle.element.querySelectorAll(".wysiwygLoading").forEach(item => item.remove());
}

/** 去掉零宽空格后仍无可见字符即视为空，与原生 isEmptyContent 一致。 */
function isEmptyContent(element: HTMLElement): boolean {
    return (element.textContent || "").replace(new RegExp(ZWSP, "g"), "").trim() === "";
}

/** 取 App 实例：调用方未传时回落到主窗口 websocket 模型上的 app（layout/Model.ts:33）。 */
function resolveApp(app?: App): App {
    return app || (window.siyuan.ws?.app as App);
}

export function mountProtyleLiteFragment(host: HTMLElement,
                                         options: ProtyleLiteFragmentOptions = {}): ProtyleLiteFragment {
    host.classList.add(PROTYLE_LITE_FRAGMENT_CLASS);
    // SDK 只声明了 3 参构造函数，第 4 参 runtimeCapabilities 运行时存在，故整体断言
    const ProtyleConstructor = Protyle as unknown as new (
        app: App, element: HTMLElement, options: IProtyleOptions,
        runtimeCapabilities?: ProtyleRuntimeCapabilities
    ) => Protyle;
    const instance = new ProtyleConstructor(resolveApp(options.app), host, {
        lite: true,
        blockId: "",
        render: {
            gutter: false,
            breadcrumb: false,
            scroll: false,
            background: false,
            title: false
        },
        ...options.protyleOptions
    } as IProtyleOptions, options.runtimeCapabilities);
    const protyle = instance.protyle;
    const wysiwyg = protyle.wysiwyg!.element;
    const hintElement = protyle.hint!.element;
    hintElement.classList.add(PROTYLE_LITE_HINT_OVERLAY_CLASS);
    // 提示浮层挪到 body：面板为了裁剪内容带 overflow，留在里面会被切掉
    document.body.appendChild(hintElement);
    wysiwyg.setAttribute("data-readonly", "false");
    protyle.toolbar!.subElement.setAttribute("data-position-boundary", "viewport");

    const updateEmptyState = (): boolean => {
        const empty = isEmptyContent(wysiwyg);
        if (options.emptyClass) {
            wysiwyg.classList.toggle(options.emptyClass, empty);
        }
        return empty;
    };
    const afterSetContent = () => {
        options.afterSetContent?.(protyle, wysiwyg);
        updateEmptyState();
    };
    // 原生在此调用 invalidateTrackedRanges（util/trackedRange.ts:1292）。它遍历的是
    // 内部 WeakMap 里本 protyle 已登记的高亮区间，而这里只在挂载阶段设置内容、
    // 此前从未登记过任何区间，恒为空操作，故省去对内部模块的依赖。
    const resetContent = () => {
        wysiwyg.innerHTML = "";
    };
    const setEmptyContent = () => {
        resetContent();
        const emptyElement = genEmptyElement();
        emptyElement.firstElementChild?.classList.add("protyle-wysiwyg--empty");
        if (options.placeholder) {
            emptyElement.firstElementChild?.setAttribute("placeholder", options.placeholder);
        }
        wysiwyg.appendChild(emptyElement);
        afterSetContent();
    };
    const setBlockHTML = (blockHTML: string) => {
        if (!blockHTML) {
            setEmptyContent();
            return;
        }
        resetContent();
        wysiwyg.innerHTML = blockHTML;
        afterSetContent();
    };
    /** 纯文本按行拆成多个段落块，与原生 setPlainText 一致（保留用户原有的换行结构）。 */
    const setPlainText = (plainText: string) => {
        if (!plainText) {
            setEmptyContent();
            return;
        }
        resetContent();
        plainText.replace(/\r\n?/g, "\n").split("\n").forEach(line => {
            const blockElement = genEmptyElement();
            const editElement = blockElement.querySelector<HTMLElement>("[contenteditable=\"true\"]");
            if (editElement) editElement.textContent = line;
            wysiwyg.appendChild(blockElement);
        });
        afterSetContent();
    };

    if (typeof options.initialBlockHTML === "string" && options.initialBlockHTML) {
        setBlockHTML(options.initialBlockHTML);
    } else if (typeof options.initialPlainText === "string" && options.initialPlainText) {
        setPlainText(options.initialPlainText);
    } else {
        setEmptyContent();
    }
    removeLoading(protyle);

    const contentObserver = new MutationObserver(() => {
        updateEmptyState();
        options.onChange?.();
    });
    contentObserver.observe(wysiwyg, { childList: true, characterData: true, subtree: true });

    return {
        instance,
        protyle,
        wysiwyg,
        hintElement,
        destroy: () => {
            contentObserver.disconnect();
            instance.destroy();
            hintElement.remove();
            host.classList.remove(PROTYLE_LITE_FRAGMENT_CLASS);
        },
        focus: (toEnd = false) => {
            const lastBlock = wysiwyg.lastElementChild;
            // SDK 的 focusBlock(element, toStart) 等价于内部 focusBlock(element, undefined, toStart)；
            // 少了 parentElement 只在「找不到可编辑节点」的兜底分支才有差别，空段落不会走到那里
            if (!toEnd || !lastBlock || !instance.focusBlock(lastBlock, false)) {
                instance.focus();
            }
        },
        getBlockHTML: () => (wysiwyg.cloneNode(true) as HTMLElement).innerHTML,
        isEmpty: () => isEmptyContent(wysiwyg)
    };
}
