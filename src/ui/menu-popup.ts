/**
 * 基于思源 Menu 的弹层摆放与限高。
 *
 * 数据库选择弹层与字段选择弹层都是「Menu + 列表」，共用这套定位：
 * 高度必须在定位前定下来，否则思源 popup() 会按"溢出后的高度"摆放，
 * 再给 .b3-menu__items 算出 maxHeight，与列表自身的滚动叠出两条滚动条。
 */
import { getFrontend, Menu } from "siyuan";

const VIEWPORT_MARGIN = 8;
const MIN_LIST_HEIGHT = 120;
/** 输入框 + 分隔线 + 菜单内边距的估算高度，从可用空间里扣减。 */
const PANEL_CHROME_HEIGHT = 80;

/** 仅在移动端前端生效（App 与移动端浏览器）。 */
export function isMobileFrontend(): boolean {
    const frontend = getFrontend();
    return frontend === "mobile" || frontend === "browser-mobile";
}

/**
 * 桌面端定位与限高：优先在锚点下方展开，下方放不下时翻到锚点上方。
 *
 * 先按估算的输入区高度定位，再用实测值重排一次：既消除估算误差，
 * 也让菜单紧贴锚点（向上展开时不会盖住按钮）。
 */
export function placeMenuBelow(menu: Menu, target: HTMLElement, list?: HTMLElement): void {
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
export function releaseMenuScrollLimit(menu: Menu): void {
    const items = menu.element.lastElementChild as HTMLElement | null;
    if (!items) return;
    items.style.setProperty("overflow", "initial");
    items.style.setProperty("max-height", "none");
}

/** 移动端列表限高：抽屉高度由思源 setSheetHeight 定为 56vh，扣掉标题栏与输入区即为可用高度。 */
export function mobileListHeight(): number {
    return Math.max(MIN_LIST_HEIGHT, Math.round(window.innerHeight * 0.56) - PANEL_CHROME_HEIGHT - 24);
}
