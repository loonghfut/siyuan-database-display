import { Menu } from "siyuan";
import { PinnedDatabase } from "@/config/pinned-databases";
import { AttributeViewSearchItem } from "@/core/types";
import { escapeHtml } from "@/libs/dom";
import { isMobileFrontend, mobileListHeight, placeMenuBelow, releaseMenuScrollLimit } from "./menu-popup";

const SEARCH_DEBOUNCE_MS = 200;
const SEARCH_ALL_ACTION = "search-all";

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
    /** 结果被 exclude 全部过滤掉时的提示，缺省回落到 noResult。 */
    allExcluded?: string;
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
    /**
     * 不参与展示的数据库 avID。设置面板用它过滤掉已经添加过的数据库，
     * 避免重复添加同一项。
     */
    exclude?: readonly string[];
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
    const excluded = new Set((options.exclude ?? []).filter(Boolean));
    let requestSequence = 0;
    let searchTimer: ReturnType<typeof setTimeout> | undefined;
    // bind 由 addItem 同步调用，open 前即可拿到列表引用
    let pickerList: HTMLElement | undefined;

    /** 结果被排除项过滤后为空时，给出区别于"搜不到"的提示。 */
    const emptyListHTML = (hasExcluded: boolean): string =>
        emptyHTML(hasExcluded ? options.text.allExcluded || options.text.noResult : options.text.noResult);

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
                    placeMenuBelow(menu, options.target, listElement);
                });
            };
            window.addEventListener("resize", onResize);
            activePickerCleanup = disposeResize;

            const renderPinned = (): void => {
                const visible = options.pinned.filter(database => !excluded.has(database.avID));
                // 常用项被过滤空时只剩搜索入口，还有东西可点，不必提示为空
                listElement.innerHTML = visible.map(database => entryHTML({
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
                    const visible = results.filter(item => !excluded.has(item.avID));
                    if (visible.length === 0) {
                        listElement.innerHTML = emptyListHTML(results.length > 0);
                        return;
                    }
                    listElement.innerHTML = visible.map(item => entryHTML({
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
        releaseMenuScrollLimit(menu);
        return;
    }
    placeMenuBelow(menu, options.target, pickerList);
    releaseMenuScrollLimit(menu);
}
