/**
 * 通用 DOM 工具：SVG 图标、图标按钮、弹层定位、剪贴板。
 * 供 attribute-renderer / content-popover / relation-editor / inline-edit 等 UI 模块复用。
 */

export function iconElement(iconName: string): SVGSVGElement {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttribute("href", `#${iconName}`);
    use.setAttribute("xlink:href", `#${iconName}`);
    svg.appendChild(use);
    return svg;
}

export function createIconButton(icon: string, label: string, className: string): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `${className} ariaLabel`;
    button.title = label;
    button.setAttribute("aria-label", label);
    button.appendChild(iconElement(icon));
    return button;
}

/**
 * 将弹层定位到锚点元素附近：优先显示在下方，空间不足时翻转到上方，
 * 并保证不超出视口（左右留 8px 边距）。
 */
export function positionPanelNear(panel: HTMLElement, anchor: HTMLElement, offset = 4): void {
    const anchorRect = anchor.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    let top = anchorRect.bottom + offset;
    let left = anchorRect.left;
    if (top + panelRect.height > window.innerHeight) {
        top = anchorRect.top - panelRect.height - offset;
    }
    if (left + panelRect.width > window.innerWidth) {
        left = window.innerWidth - panelRect.width - 8;
    }
    panel.style.top = `${Math.max(8, Math.min(top, window.innerHeight - panelRect.height - 8))}px`;
    panel.style.left = `${Math.max(8, left)}px`;
}

export async function copyText(text: string): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        // 非安全上下文或剪贴板权限被拒时降级
    }
    try {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        const ok = document.execCommand("copy");
        textarea.remove();
        return ok;
    } catch {
        return false;
    }
}
