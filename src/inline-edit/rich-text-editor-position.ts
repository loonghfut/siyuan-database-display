// 富文本编辑面板的定位。
// 复刻思源 app/src/protyle/render/av/richTextEditorPosition.ts，以及它调用的
// util/setPosition.ts（非粘滞分支）与 layout/getTopBarHeight.ts。
//
// 单独成模块与思源同构，也为的是可测：这三个函数只依赖 getBoundingClientRect 与
// window.innerWidth/innerHeight，不碰 Protyle、i18n 与内核接口，
// 用桩矩形就能覆盖「低行向上翻、放得下就向下开、窗口变窄后保持边距」等边界。
// 定位算错的后果是面板出屏或压住顶栏，属于用户一眼能看见的故障。

/** 面板与视口边缘的间距，同原生 AV_RICH_TEXT_EDITOR_MARGIN。 */
export const EDITOR_MARGIN = 8;

/** 复刻 util/functions.ts:9 的 isMobile：移动端布局才有 #sidebar。 */
export function isMobile(): boolean {
    return Boolean(document.getElementById("sidebar"));
}

/**
 * 复刻 layout/getTopBarHeight.ts：顶栏存在时面板不能压到它上面。
 * 原生末段是 document.querySelector(".layout-tab-bar").clientHeight（无可选链），
 * 这里补上 ?. 与 || 0 —— 桌面端该元素恒在，补了只是让极端环境下不至于抛错。
 */
export function getTopBarHeight(): number {
    if (document.getElementById("sidebar")) return 0;
    return document.getElementById("toolbar")?.clientHeight
        || document.querySelector<HTMLElement>(".layout-tab-bar")?.clientHeight
        || 0;
}

/**
 * 复刻 av/richTextEditorPosition.ts + util/setPosition.ts 的非粘滞分支：
 * 宽度不小于 420px（锚点更宽则跟随锚点），下方放不下就翻到上方，两侧留 8px。
 *
 * 与原生的一处实现差异：原生水平溢出判定复用向上/向下调整前量到的那个 rect，
 * 这里调整完 top 后重新量一次。两次之间只有 top 变化，left/width 未动，
 * 因此 right/width/left 三个值完全相同，结果一致（重量一次只是更直白）。
 */
export function positionEditorPanel(panelElement: HTMLElement, anchorElement: HTMLElement): void {
    const anchorRect = anchorElement.getBoundingClientRect();
    const width = Math.min(Math.max(anchorRect.width, 420), window.innerWidth - EDITOR_MARGIN * 2);
    const maxHeight = Math.max(240, Math.min(480, window.innerHeight - EDITOR_MARGIN * 2));
    const left = Math.min(Math.max(anchorRect.left, EDITOR_MARGIN),
        window.innerWidth - width - EDITOR_MARGIN);
    panelElement.style.width = `${width}px`;
    panelElement.style.maxHeight = `${maxHeight}px`;

    const top = anchorRect.bottom;
    panelElement.style.top = `${top}px`;
    panelElement.style.left = `${left}px`;
    const rect = panelElement.getBoundingClientRect();
    const topBarHeight = getTopBarHeight();
    if (rect.top < topBarHeight) {
        panelElement.style.top = `${topBarHeight}px`;
    } else if (rect.bottom > window.innerHeight) {
        // 上方放得下就翻到锚点上方；上下都不够则贴着窗口底，同时不越过顶栏
        const flipped = top - rect.height - anchorRect.height;
        if (flipped > topBarHeight && (flipped + rect.height) < window.innerHeight) {
            panelElement.style.top = `${flipped}px`;
        } else {
            panelElement.style.top = `${Math.max(topBarHeight, window.innerHeight - rect.height)}px`;
        }
    }
    const placed = panelElement.getBoundingClientRect();
    if (placed.right > window.innerWidth) {
        panelElement.style.left = `${window.innerWidth - placed.width - EDITOR_MARGIN}px`;
    } else if (placed.left < 0) {
        panelElement.style.left = "0";
    }
}

/**
 * 面板定位（同原生 setPanelPosition，richTextEditor.ts:81-88）：
 * 移动端改成铺满下半屏的底栏形态（样式由 business/_av.scss:303-309 的
 * .av__richtext-editor--mobile 提供），桌面端才按锚点贴边。
 */
export function setPanelPosition(panelElement: HTMLElement, anchorElement: HTMLElement, mobile: boolean): void {
    if (mobile) {
        panelElement.classList.add("av__richtext-editor--mobile");
        panelElement.removeAttribute("style");
        return;
    }
    positionEditorPanel(panelElement, anchorElement);
}
