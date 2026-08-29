import { Menu } from "siyuan";
import { PinnedDatabase } from "@/config/pinned-databases";
import { AttributeViewSearchItem } from "@/core/types";
import { escapeHtml } from "@/libs/dom";

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

/**
 * 数据库选择弹层：常用数据库置顶，底部提供「搜索更多数据库…」入口打开完整搜索。
 *
 * 原生 openSearchAV（protyle/render/av/relation.ts）未对插件导出，这里用 Menu +
 * /api/av/searchAttributeView 复刻同样的交互（输入防抖、上下键导航、回车选中）。
 */
export function openDatabasePicker(options: DatabasePickerOptions): void {
    // 菜单打开后事件会继续冒到 window，被全局监听当成"点击菜单外"而关闭
    options.event?.stopPropagation();
    const menu = new Menu();
    let requestSequence = 0;
    let searchTimer: ReturnType<typeof setTimeout> | undefined;

    const searchAllHTML = (): string => `<div class="b3-list-item b3-list-item--narrow" data-action="${SEARCH_ALL_ACTION}">
    <svg class="b3-list-item__graphic"><use xlink:href="#iconSearch"></use></svg>
    <span class="b3-list-item__text">${escapeHtml(options.text.searchAll)}</span>
</div>`;

    menu.addItem({
        iconHTML: "",
        type: "empty",
        label: `<div class="fn__flex-column b3-menu__filter db-database-picker" style="width: 320px">
    <input class="b3-text-field fn__flex-shrink" placeholder="${escapeHtml(options.text.placeholder)}"/>
    <div class="fn__hr"></div>
    <div class="b3-list fn__flex-1 b3-list--background">${emptyHTML(options.text.loading)}</div>
</div>`,
        bind(element) {
            const inputElement = element.querySelector("input") as HTMLInputElement;
            const listElement = element.querySelector(".b3-list") as HTMLElement;
            if (!inputElement || !listElement) return;

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
    menu.element.querySelector(".b3-menu__items")?.setAttribute("style", "overflow: initial");
    const rect = options.target.getBoundingClientRect();
    menu.open({ x: rect.left, y: rect.bottom, h: rect.height });
}
