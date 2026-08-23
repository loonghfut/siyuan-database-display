// 弹出面板 / 下拉 / 调色板的共用状态、构建与定位工具。
// 内联编辑的各个字段编辑器共享这里的"当前打开弹窗"单例状态。

import { createIconButton, positionPanelNear } from "../libs/dom";
import { t } from "../i18n";

export const ICONS = {
    cancel: 'iconClose',
    check: 'iconCheck',
    clear: 'iconTrashcan',
    edit: 'iconEdit',
    selected: 'iconSelect',
    add: 'iconAdd',
    file: 'iconFile',
    image: 'iconImage'
} as const;

// 当前打开的编辑弹窗面板及其清理函数（模块级单例）
let openPanel: HTMLElement | null = null;
let openPanelCleanup: (() => void) | null = null;

// 当前打开的选项调色板浮层
let palette: HTMLElement | null = null;
let paletteCleanup: (() => void) | null = null;

export function setOpenPanel(panel: HTMLElement | null): void {
    openPanel = panel;
}

export function setOpenPanelCleanup(cleanup: (() => void) | null): void {
    openPanelCleanup = cleanup;
}

/** 在当前打开的编辑弹窗打开前，先关闭它（enableInlineEdit 切换字段类型时调用）。 */
export function closeOpenPanel(): void {
    openPanelCleanup?.();
    openPanelCleanup = null;
    if (openPanel) {
        openPanel.remove();
        openPanel = null;
    }
    closeOptionColorPalette();
}

/** 关闭所有编辑弹窗并清理残留的关闭动画节点，供插件卸载（onunload）时调用。 */
export function clearInlineEditPanels(): void {
    closeOpenPanel();
    document.querySelectorAll('.inline-edit-panel--closing').forEach(element => element.remove());
}

/** 当前是否点击在调色板浮层内（避免点击选项色块时误关闭弹窗）。 */
export function isWithinPalette(node: Node): boolean {
    return !!palette && palette.contains(node);
}

/**
 * 定位弹窗到元素附近
 */
export function positionPopup(popup: HTMLElement, target: HTMLElement) {
    positionPanelNear(popup, target, 5);
}

/**
 * 定位下拉菜单
 */
export function positionDropdown(dropdown: HTMLElement, target: HTMLElement) {
    positionPanelNear(dropdown, target, 2);
}

/**
 * 关闭下拉菜单
 */
export function closeDropdown(dropdown: HTMLElement) {
    closeEditorPanel(dropdown);
}

export function closeEditorPanel(panel: HTMLElement) {
    // 面板可能已被思源移出 DOM：此时仍需复位单例状态并清理外部监听，
    // 否则 bindOutsideDismiss 注册的 document 监听会残留。
    if (openPanel === panel) {
        openPanelCleanup?.();
        openPanelCleanup = null;
        openPanel = null;
    }
    closeOptionColorPalette();
    if (!panel.parentNode) return;
    panel.classList.add('inline-edit-panel--closing');
    window.setTimeout(() => panel.remove(), 120);
}

/**
 * 关闭当前打开的选项调色板浮层
 */
export function closeOptionColorPalette(): void {
    paletteCleanup?.();
    paletteCleanup = null;
    palette?.remove();
    palette = null;
}

/**
 * 打开选项调色板（思源 14 色调色板，与原生 color__square 一致），
 * 选择后回调应用新颜色并关闭。
 */
export function openOptionColorPalette(options: {
    swatch: HTMLElement;
    avID: string;
    keyID: string;
    optionName: string;
    color: string;
    onApplied: (newColor: string) => void;
}): void {
    closeOptionColorPalette();
    const paletteElement = document.createElement('div');
    paletteElement.className = 'inline-edit-palette';
    paletteElement.setAttribute('role', 'dialog');
    paletteElement.setAttribute('aria-label', t('inlineEdit.optionColor'));
    for (let index = 1; index <= 14; index++) {
        const square = document.createElement('button');
        square.type = 'button';
        square.className = 'inline-edit-palette__swatch' + (String(index) === options.color ? ' inline-edit-palette__swatch--current' : '');
        square.dataset.color = String(index);
        square.style.color = `var(--b3-font-color${index})`;
        square.style.backgroundColor = `var(--b3-font-background${index})`;
        square.textContent = 'A';
        square.setAttribute('aria-label', t('inlineEdit.optionColor') + ` ${index}`);
        square.addEventListener('click', event => {
            event.stopPropagation();
            const newColor = square.dataset.color || '';
            if (newColor !== options.color) {
                options.onApplied(newColor);
            }
            closeOptionColorPalette();
        });
        paletteElement.appendChild(square);
    }
    document.body.appendChild(paletteElement);
    positionPanelNear(paletteElement, options.swatch, 4);
    palette = paletteElement;
    paletteCleanup = combineCleanup(
        bindOutsideDismiss((event: MouseEvent) => {
            const target = event.target as Node;
            if (!paletteElement.contains(target) && !options.swatch.contains(target)) {
                closeOptionColorPalette();
            }
        }),
        bindEscapeDismiss(() => closeOptionColorPalette())
    );
}

export function bindOutsideDismiss(handler: (event: MouseEvent) => void): () => void {
    const timer = window.setTimeout(() => document.addEventListener('mousedown', handler), 100);
    return () => {
        window.clearTimeout(timer);
        document.removeEventListener('mousedown', handler);
    };
}

/** 注册 Esc 关闭（捕获阶段，面板内无输入框时也能响应），返回清理函数。 */
export function bindEscapeDismiss(handler: () => void): () => void {
    const listener = (event: KeyboardEvent) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        handler();
    };
    document.addEventListener('keydown', listener, true);
    return () => document.removeEventListener('keydown', listener, true);
}

/** 合并多个清理函数为一个，便于存入单例 cleanup 槽位。 */
export function combineCleanup(...cleanups: Array<() => void>): () => void {
    return () => cleanups.forEach(cleanup => cleanup());
}

export function prepareEditorPanel(panel: HTMLElement, label: string): void {
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', label);
}

export function createPanelHeader(titleText: string, onClose: () => void): HTMLElement {
    const header = document.createElement('header');
    header.className = 'inline-edit-panel__header';

    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.classList.add('inline-edit-panel__field-icon');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', `#${ICONS.edit}`);
    use.setAttribute('xlink:href', `#${ICONS.edit}`);
    icon.appendChild(use);

    const title = document.createElement('strong');
    title.textContent = titleText;
    const actions = document.createElement('span');
    actions.className = 'inline-edit-panel__actions';
    const close = createIconButton(ICONS.cancel, t('common.cancel'), 'inline-edit-panel__close');
    close.addEventListener('click', event => {
        event.stopPropagation();
        onClose();
    });
    actions.appendChild(close);
    header.append(icon, title, actions);
    return header;
}

export function appendHeaderAction(header: HTMLElement, action: HTMLButtonElement): void {
    header.querySelector<HTMLElement>('.inline-edit-panel__actions')?.appendChild(action);
}

/**
 * 创建选项色块：显示选项颜色（思源调色板索引），点击时回调打开调色板编辑。
 */
export function createOptionColorSwatch(color: string | undefined, onColorEdit?: (swatch: HTMLElement) => void): HTMLElement {
    const swatch = document.createElement('span');
    swatch.className = 'inline-edit-option-color';
    if (/^[1-9]$|^1[0-4]$/.test(color || '')) {
        swatch.style.backgroundColor = `var(--b3-font-color${color})`;
    } else {
        swatch.classList.add('inline-edit-option-color--none');
    }
    swatch.title = t('inlineEdit.optionColor');
    swatch.setAttribute('aria-label', t('inlineEdit.optionColor'));
    if (onColorEdit) {
        swatch.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            onColorEdit(swatch);
        });
    }
    return swatch;
}

/**
 * 创建下拉选项元素
 */
export function createDropdownOption(value: string, text: string, isSelected: boolean, color?: string, onColorEdit?: (swatch: HTMLElement) => void): HTMLElement {
    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'inline-edit-dropdown-option' + (isSelected ? ' inline-edit-dropdown-option--selected' : '');
    option.dataset.value = value;
    if (onColorEdit) option.appendChild(createOptionColorSwatch(color, onColorEdit));
    const label = document.createElement('span');
    label.className = 'inline-edit-dropdown-option__label';
    label.textContent = text;
    const iconName = value ? (isSelected ? ICONS.selected : ICONS.check) : ICONS.clear;
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', `#${iconName}`);
    use.setAttribute('xlink:href', `#${iconName}`);
    icon.appendChild(use);
    option.append(label, icon);
    return option;
}

/**
 * 创建多选下拉选项元素
 */
export function createMultiSelectOption(value: string, text: string, isSelected: boolean, color?: string, onColorEdit?: (swatch: HTMLElement) => void): HTMLElement {
    const option = document.createElement('label');
    option.className = 'inline-edit-dropdown-option inline-edit-dropdown-option--multi' + (isSelected ? ' inline-edit-dropdown-option--selected' : '');

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = isSelected;
    checkbox.dataset.value = value;

    if (onColorEdit) option.appendChild(createOptionColorSwatch(color, onColorEdit));

    const label = document.createElement('span');
    label.className = 'inline-edit-dropdown-option__label';
    label.textContent = text;

    const mark = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', `#${ICONS.selected}`);
    use.setAttribute('xlink:href', `#${ICONS.selected}`);
    mark.appendChild(use);

    option.appendChild(checkbox);
    option.append(label, mark);

    return option;
}