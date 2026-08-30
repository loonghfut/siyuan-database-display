/**
 * 字段选择弹层：列出指定数据库已有的字段，供设置面板「按数据库」快速添加规则，
 * 免去手工输入字段名（字段名含空格或生僻字时尤其容易输错）。
 *
 * 与数据库选择弹层同样基于思源 Menu + 列表，共用 menu-popup 的定位与限高。
 */
import { Menu } from "siyuan";
import { AttributeViewField } from "@/core/types";
import { escapeHtml } from "@/libs/dom";
import { isMobileFrontend, mobileListHeight, placeMenuBelow, releaseMenuScrollLimit } from "./menu-popup";

/** 选中的字段。 */
export interface FieldPick {
    name: string;
}

export interface FieldPickerText {
    loading: string;
    noResult: string;
    loadFailed: string;
    allExcluded: string;
}

export interface FieldPickerOptions {
    /** 弹层定位锚点。 */
    target: HTMLElement;
    /**
     * 触发打开的事件。思源在 window 的 click 监听里关闭公共菜单
     * （boot/globalEvent/click.ts:13-22），而插件 Menu 复用的正是公共菜单
     * （plugin/Menu.ts:23）；不阻止冒泡的话菜单会在打开的同一轮事件里被关掉，
     * 表现为"点击没有反应"。
     */
    event?: MouseEvent;
    text: FieldPickerText;
    /** 拉取字段列表，点击「添加」时调用，避免打开面板就发一堆请求。 */
    load: () => Promise<AttributeViewField[]>;
    /** 已在规则里的字段名，不再列出，避免重复添加。 */
    exclude?: readonly string[];
    /** 字段类型名的本地化，用于列表右侧的次要说明。 */
    labelType?: (type: string) => string;
    onPick: (pick: FieldPick) => void;
}

const LIST_CLASS = "db-display__field-picker-list";

function emptyHTML(message: string): string {
    return `<div class="b3-list--empty">${escapeHtml(message)}</div>`;
}

function entryHTML(field: AttributeViewField, typeLabel: string): string {
    const name = escapeHtml(field.name);
    if (!typeLabel) {
        return `<div class="b3-list-item b3-list-item--narrow" data-field-name="${name}">
    <span class="b3-list-item__text">${name}</span>
</div>`;
    }
    return `<div class="b3-list-item b3-list-item--narrow" data-field-name="${name}">
    <div class="b3-list-item--two fn__flex-1">
        <div class="b3-list-item__first"><span class="b3-list-item__text">${name}</span></div>
        <div class="b3-list-item__meta b3-list-item__showall">${escapeHtml(typeLabel)}</div>
    </div>
</div>`;
}

export function openFieldPicker(options: FieldPickerOptions): void {
    options.event?.stopPropagation();
    const menu = new Menu();
    const excluded = new Set((options.exclude ?? []).filter(Boolean));
    // bind 由 addItem 同步调用，open 前即可拿到列表引用
    let pickerList: HTMLElement | undefined;

    menu.addItem({
        iconHTML: "",
        type: "empty",
        label: `<div class="b3-list b3-list--background ${LIST_CLASS}">${emptyHTML(options.text.loading)}</div>`,
        bind(element) {
            const listElement = element.querySelector<HTMLElement>(`.${LIST_CLASS}`);
            if (!listElement) return;
            pickerList = listElement;

            const render = (fields: AttributeViewField[]): void => {
                const visible = fields.filter(field => field.name && !excluded.has(field.name));
                if (visible.length === 0) {
                    listElement.innerHTML = emptyHTML(fields.length > 0 ? options.text.allExcluded : options.text.noResult);
                    return;
                }
                listElement.innerHTML = visible.map(field => entryHTML(
                    field,
                    field.type ? options.labelType?.(field.type) || "" : ""
                )).join("");
            };

            listElement.addEventListener("click", event => {
                const item = (event.target as HTMLElement)?.closest<HTMLElement>(".b3-list-item");
                const name = item?.dataset.fieldName;
                if (!name) return;
                event.preventDefault();
                event.stopPropagation();
                options.onPick({ name });
                menu.close();
            });

            void options.load().then(render).catch(() => {
                listElement.innerHTML = emptyHTML(options.text.loadFailed);
            });
        }
    });

    if (isMobileFrontend()) {
        if (pickerList) pickerList.style.maxHeight = `${mobileListHeight()}px`;
        menu.fullscreen();
        releaseMenuScrollLimit(menu);
        return;
    }
    placeMenuBelow(menu, options.target, pickerList);
    releaseMenuScrollLimit(menu);
}
