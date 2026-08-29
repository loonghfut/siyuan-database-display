import { getFrontend, Menu } from "siyuan";
import { PinnedDatabase } from "@/config/pinned-databases";
import { AttributeViewSearchItem } from "@/core/types";
import { escapeHtml } from "@/libs/dom";

const SEARCH_DEBOUNCE_MS = 200;
const SEARCH_ALL_ACTION = "search-all";
const VIEWPORT_MARGIN = 8;
const MIN_LIST_HEIGHT = 120;
/** 输入框 + 分隔线 + 菜单内边距的估算高度，从可用空间里扣减。 */
const PANEL_CHROME_HEIGHT = 80;

/** 选中的目标数据库。 */
export interface DatabasePick {
    avID: string;
    name: string;
    blockID?: string;
}

export interface DatabasePickerText {
    placeholder: string;
    searchAll: string;
    noResult: string;
    loading: string;
    searchFailed: string;
}

export interface DatabasePickerOptions {
    /** 弹层定位锚点。 */
    target: HTMLElement;
    /**
     * 触发打开的事件。思源在 window 的 click 监听里关闭公共菜单
     * （boot/globalEvent/click.ts:13-22），而插件 Menu 复用的正是公共菜单
     * （plugin/Menu.ts:23）；不阻止冒泡的话菜单会在打开的同一轮事件里被关掉，
     * 表现为"点击没有反应"。
     */
    event?: MouseEvent;
    pinned: readonly PinnedDatabase[];
    text: DatabasePickerText;
    search: (keyword: string) => Promise<AttributeViewSearchItem[]>;
    onPick: (pick: DatabasePick) => void;
}

interface PickEntry {
    avID: string;
    name: string;
    blockID?: string;
    hPath?: string;
}

function entryHTML(entry: PickEntry): string {
    const meta = entry.hPath
        ? `<div class="b3-list-item__meta b3-list-item__showall">${escapeHtml(entry.hPath)}</div>`
        : "";
    return `<div class="b3-list-item b3-list-item--narrow" data-av-id="${escapeHtml(entry.avID)}" data-block-id="${escapeHtml(entry.blockID || "")}" data-name="${escapeHtml(entry.name)}">
    <svg class="b3-list-item__graphic"><use xlink:href="#iconDatabase"></use></svg>
    <div class="b3-list-item--two fn__flex-1">
        <div class="b3-list-item__first"><span class="b3-list-item__text">${escapeHtml(entry.name)}</span></div>
        ${meta}
    </div>
</div>`;
}

function emptyHTML(message: string): string {
    return `<div class="b3-list--empty">${escapeHtml(message)}</div>`;
}

function isMobileFrontend(): boolean {
    const frontend = getFrontend();
    return frontend === "mobile" || frontend === "browser-mobile";
}

/**
 * 桌面端定位与限高：优先在锚点下方展开，下方放不下时翻到锚点上方。
 *
 * 高度必须在定位前定下来。若完全交给思源的 setPosition，它会按"溢出后的高度"
 * 摆放，再由 popup() 给 .b3-menu__items 算出 maxHeight（menus/Menu.ts:427），
 * 这个上限与列表自身的滚动会叠出两条滚动条。
 *
 * 先按估算的输入区高度定位，再用实测值重排一次：既消除估算误差，
 * 也让菜单紧贴锚点（向上展开时不会盖住按钮）。
 */
function placeDesktop(menu: Menu, target: HTMLElement, list: HTMLElement | undefined): void {
    const rect = target.getBoundingClientRect();
    const desired = Math.round(window.innerHeight * 0.45);
    const spaceBelow = window.innerHeight - rect.bottom - VIEWPORT_MARGIN;
    const spaceAbove = rect.top - VIEWPORT_MARGIN;
    // 下方放得下就用下方；放不下时取空间更大的一侧
    const useBelow = spaceBelow - PANEL_CHROME_HEIGHT >= MIN_LIST_HEIGHT || spaceBelow >= spaceAbove;
    const space = useBelow ? spaceBelow : spaceAbove;

    if (!list) {
        menu.open({ x: rect.left, y: rect.bottom, h: rect.height });
        return;
    }
    list.style.maxHeight = `${Math.max(MIN_LIST_HEIGHT, Math.min(desired, space - PANEL_CHROME_HEIGHT))}px`;
    menu.open({
        x: rect.left,
        y: useBelow ? rect.bottom : Math.max(VIEWPORT_MARGIN, rect.top - MIN_LIST_HEIGHT - PANEL_CHROME_HEIGHT),
        h: rect.height
    });
    // 实测输入区高度后重排：此时菜单尺寸已确定，可以直接算出精确位置
    const chrome = menu.element.getBoundingClientRect().height - list.getBoundingClientRect().height;
    const listHeight = Math.max(MIN_LIST_HEIGHT, Math.min(desired, space - chrome));
    list.style.maxHeight = `${listHeight}px`;
    const top = useBelow ? rect.bottom : Math.max(VIEWPORT_MARGIN, rect.top - listHeight - chrome);
    menu.element.style.top = `${top}px`;
}

/**
 * 只保留列表自己的滚动条：popup() 给 .b3-menu__items 设的 maxHeight 配上默认
 * overflow 会在列表之外再叠一条滚动条。高度已由本模块收敛，放开即可。
 *
 * 同时把 .b3-menu__items 的 max-height 也放开：否则向上弹出后我增大列表高度时，
 * 背景只渲染到旧的 maxHeight，内容会溢出到背景外面。
 */
function useSingleScrollbar(menu: Menu): void {
    const items = menu.element.lastElementChild as HTMLElement | null;
    if (!items) return;
    items.style.setProperty("overflow", "initial");
    items.style.setProperty("max-height", "none");
}

/**
 * 移动端列表限高。抽屉高度由思源 setSheetHeight 定为 56vh
 * （menus/Menu.ts:352-358），扣掉标题栏与输入区后即为列表可用高度，
 * 使列表在抽屉内滚动而不是把内容撑出抽屉。
 */
function mobileListHeight(): number {
    return Math.max(MIN_LIST_HEIGHT, Math.round(window.innerHeight * 0.56) - PANEL_CHROME_HEIGHT - 24);
}

/**
 * 数据库选择弹层：常用数据库置顶，底部提供「搜索更多数据库…」入口打开完整搜索。
 *
 * 原生 openSearchAV（protyle/render/av/relation.ts）未对插件导出，这里用 Menu +
 * /api/av/searchAttributeView 复刻同样的交互（输入防抖、上下键导航、回车选中）。
 */
/**
 * 上一个弹层的 resize 监听回收函数。思源的公共菜单复用同一个 DOM，关闭方式也
 * 不止一种，监听难以在关闭当下就摘掉；这里留一个回收入口，由下一次打开顺带清理，
 * 保证同一时刻最多只有一份残留。
 */
let activePickerCleanup: (() => void) | undefined;

export function openDatabasePicker(options: DatabasePickerOptions): void {
    // 菜单打开后事件会继续冒到 window，被全局监听当成"点击菜单外"而关闭
    options.event?.stopPropagation();
    activePickerCleanup?.();
    const menu = new Menu();
    let requestSequence = 0;
    let searchTimer: ReturnType<typeof setTimeout> | undefined;
    // bind 由 addItem 同步调用，open 前即可拿到列表引用
    let pickerList: HTMLElement | undefined;

    const searchAllHTML = (): string => `<div class="b3-list-item b3-list-item--narrow" data-action="${SEARCH_ALL_ACTION}">
    <svg class="b3-list-item__graphic"><use xlink:href="#iconSearch"></use></svg>
    <span class="b3-list-item__text">${escapeHtml(options.text.searchAll)}</span>
</div>`;

    menu.addItem({
        iconHTML: "",
        type: "empty",
        label: `<div class="fn__flex-column b3-menu__filter db-display__picker">
    <input class="b3-text-field fn__flex-shrink" placeholder="${escapeHtml(options.text.placeholder)}"/>
    <div class="fn__hr"></div>
    <div class="b3-list fn__flex-1 b3-list--background db-display__picker-list">${emptyHTML(options.text.loading)}</div>
</div>`,
        bind(element) {
            const inputElement = element.querySelector("input") as HTMLInputElement;
            const listElement = element.querySelector<HTMLElement>(".db-display__picker-list");
            if (!inputElement || !listElement) return;
            pickerList = listElement;

            const focusableItems = (): HTMLElement[] =>
                [...listElement.querySelectorAll<HTMLElement>(".b3-list-item")];

            const focusFirst = (): void => {
                const items = focusableItems();
                if (items.length === 0) return;
                items[0].classList.add("b3-list-item--focus");
            };

            const moveFocus = (delta: number): void => {
                const items = focusableItems();
                if (items.length === 0) return;
                const current = items.findIndex(item => item.classList.contains("b3-list-item--focus"));
                const next = current < 0
                    ? (delta > 0 ? 0 : items.length - 1)
                    : Math.min(items.length - 1, Math.max(0, current + delta));
                items.forEach(item => item.classList.remove("b3-list-item--focus"));
                items[next].classList.add("b3-list-item--focus");
                items[next].scrollIntoView({ block: "nearest" });
            };

            // 旋转屏幕/软键盘/窗口缩放都会改变可用高度，重新收敛限高。
            // 思源的公共菜单是复用的同一个 DOM：别的调用方接管后我们的列表节点会
            // 脱离文档，据此判定本次弹层已失效并注销监听。
            let resizeFrame = 0;
            const disposeResize = (): void => {
                if (resizeFrame) window.cancelAnimationFrame(resizeFrame);
                resizeFrame = 0;
                window.removeEventListener("resize", onResize);
                if (activePickerCleanup === disposeResize) activePickerCleanup = undefined;
            };
            const onResize = (): void => {
                // placeDesktop 读写交替会强制同步布局，而拖拽窗口时 resize 每秒触发
                // 数十次，先按帧合并再执行
                if (resizeFrame) return;
                resizeFrame = window.requestAnimationFrame(() => {
                    resizeFrame = 0;
                    const stale = !menu.element.contains(listElement)
                        || menu.element.classList.contains("fn__none");
                    if (stale) {
                        disposeResize();
                        return;
                    }
                    if (isMobileFrontend()) {
                        listElement.style.maxHeight = `${mobileListHeight()}px`;
                        return;
                    }
                    placeDesktop(menu, options.target, listElement);
                });
            };
            window.addEventListener("resize", onResize);
            activePickerCleanup = disposeResize;

            const renderPinned = (): void => {
                listElement.innerHTML = options.pinned.map(database => entryHTML({
                    avID: database.avID,
                    name: database.name,
                    blockID: database.blockID
                })).join("") + searchAllHTML();
                focusFirst();
            };

            const load = async (keyword: string): Promise<void> => {
                const sequence = ++requestSequence;
                listElement.innerHTML = emptyHTML(options.text.loading);
                try {
                    const results = await options.search(keyword);
                    if (sequence !== requestSequence) return;
                    if (results.length === 0) {
                        listElement.innerHTML = emptyHTML(options.text.noResult);
                        return;
                    }
                    listElement.innerHTML = results.map(item => entryHTML({
                        avID: item.avID,
                        name: item.avName || item.avID,
                        blockID: item.blockID,
                        hPath: item.hPath
                    })).join("");
                    focusFirst();
                } catch {
                    if (sequence !== requestSequence) return;
                    listElement.innerHTML = emptyHTML(options.text.searchFailed);
                }
            };

            /** 关键词为空时显示常用数据库（未配置时直接列出全部），否则走搜索。 */
            const render = (): void => {
                const keyword = inputElement.value.trim();
                if (keyword) {
                    void load(keyword);
                    return;
                }
                if (options.pinned.length === 0) {
                    void load("");
                    return;
                }
                renderPinned();
            };

            const select = (target?: HTMLElement | null): void => {
                if (!target) return;
                if (target.dataset.action === SEARCH_ALL_ACTION) {
                    void load(inputElement.value.trim());
                    inputElement.focus();
                    return;
                }
                const avID = target.dataset.avId;
                if (!avID) return;
                options.onPick({
                    avID,
                    name: target.dataset.name || avID,
                    ...(target.dataset.blockId ? { blockID: target.dataset.blockId } : {})
                });
                // 走的是明确的关闭路径，直接注销监听，不必等下一次 resize 判定失效
                disposeResize();
                menu.close();
            };

            inputElement.addEventListener("keydown", (event: KeyboardEvent) => {
                if (event.isComposing) return;
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                    event.preventDefault();
                    moveFocus(event.key === "ArrowDown" ? 1 : -1);
                    return;
                }
                if (event.key === "Enter") {
                    event.preventDefault();
                    event.stopPropagation();
                    select(listElement.querySelector(".b3-list-item--focus"));
                    return;
                }
                if (event.key === "Escape") {
                    event.preventDefault();
                    disposeResize();
                    menu.close();
                }
            });
            inputElement.addEventListener("input", (event: Event) => {
                event.stopPropagation();
                if ((event as InputEvent).isComposing) return;
                clearTimeout(searchTimer);
                searchTimer = setTimeout(render, SEARCH_DEBOUNCE_MS);
            });
            inputElement.addEventListener("compositionend", render);
            listElement.addEventListener("click", (event: MouseEvent) => {
                event.preventDefault();
                event.stopPropagation();
                select((event.target as HTMLElement)?.closest<HTMLElement>(".b3-list-item"));
            });

            render();
        }
    });
    if (isMobileFrontend()) {
        // 移动端用思源自带的底部抽屉，比小屏上的浮层更好操作
        if (pickerList) {
            pickerList.style.maxHeight = `${mobileListHeight()}px`;
        }
        menu.fullscreen();
        useSingleScrollbar(menu);
        return;
    }
    placeDesktop(menu, options.target, pickerList);
    useSingleScrollbar(menu);
}
