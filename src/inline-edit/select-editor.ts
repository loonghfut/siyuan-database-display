// 单选/多选的共用选项面板：搜索过滤、直接创建新选项、选项配色编辑。
// 新建的选项不需要单独的"添加选项"接口：保存单元格时由内核自动登记为列选项，
// 并采用随值提交的颜色（见 kernel/model/attribute_view.go 的 updateAttributeViewValue0）。

import { showMessage } from "siyuan";
import { AVResolvedColor, SelectOption } from "../core/types";
import { attributeViewRepository } from "../data/attribute-view-repository";
import { t } from "../i18n";
import { createIconButton, iconElement } from "../libs/dom";
import { toErrorMessage } from "../libs/error-utils";
import { getAVResolvedColor, getNextAVOptionColor, loadAVPalette } from "../domain/option-color";
import {
    ICONS,
    appendHeaderAction,
    bindEscapeDismiss,
    bindOutsideDismiss,
    closeEditorPanel,
    combineCleanup,
    createDropdownOption,
    createMultiSelectOption,
    createOptionColorSwatch,
    createPanelHeader,
    isWithinPalette,
    openOptionColorPalette,
    OptionColorRef,
    positionDropdown,
    prepareEditorPanel,
    setOpenPanel,
    setOpenPanelCleanup
} from "./popup";

/** 提交给内核的一个选项值。color 为空时内核会随机取色，因此始终显式带上。 */
export interface SelectValueEntry {
    content: string;
    color: string;
}

export interface SelectEditorOptions {
    element: HTMLElement;
    avID: string;
    keyID: string;
    keyName: string;
    /** 多选：可勾多个并需点保存；单选：点选后立即提交。 */
    multi: boolean;
    /** 列已存在的选项（含颜色）。 */
    columnOptions: SelectOption[];
    /** 初始选中的选项名。 */
    initialSelected: string[];
    /** 提交选中值；空数组表示清空。 */
    onSave: (entries: SelectValueEntry[]) => Promise<void>;
    /** 选项颜色等列级变更已落库，用于触发正文刷新。 */
    onRefresh?: () => void;
    onCancel?: () => void;
}

interface EditableOption {
    name: string;
    color: string;
    resolvedColor?: AVResolvedColor;
    /** 本次会话新建、尚未写入内核的选项。 */
    pending: boolean;
}

const optionName = (option: SelectOption): string => String(option.name || option.content || "");

const colorRef = (option: EditableOption): OptionColorRef => ({
    color: option.color,
    resolvedColor: option.resolvedColor
});

// 打开序号：载入配色期间若又打开了别的字段，丢弃本次已过期的面板
let openToken = 0;

export async function openSelectEditor(options: SelectEditorOptions): Promise<void> {
    const token = ++openToken;
    // 自定义色与隐藏内置色需要先载入，否则调色板条目和新建选项的颜色都会取错
    await loadAVPalette().catch(() => undefined);
    if (token !== openToken) return;

    const { element, avID, keyID, keyName, multi } = options;

    const allOptions: EditableOption[] = [];
    const seen = new Set<string>();
    (options.columnOptions || []).forEach(item => {
        const name = optionName(item);
        if (!name || seen.has(name)) return;
        seen.add(name);
        allOptions.push({
            name,
            color: String(item.color || ""),
            resolvedColor: item.resolvedColor,
            pending: false
        });
    });

    const selected = new Set<string>(
        multi ? options.initialSelected : options.initialSelected.slice(0, 1)
    );
    // 已选中但列里没有对应选项（选项被删、值来自粘贴等）也要列出，
    // 否则用户看不到它处于选中状态；保存时按新选项处理，由内核登记
    selected.forEach(name => {
        if (seen.has(name)) return;
        seen.add(name);
        allOptions.push({ name, color: "", resolvedColor: undefined, pending: true });
    });

    const dropdown = document.createElement("div");
    dropdown.className = "inline-edit-dropdown" + (multi ? " inline-edit-dropdown--multi" : "");
    prepareEditorPanel(dropdown, keyName);
    setOpenPanel(dropdown);

    const close = () => {
        closeEditorPanel(dropdown);
        options.onCancel?.();
    };

    const header = createPanelHeader(keyName, close);
    dropdown.appendChild(header);

    // 搜索 + 新建入口：输入即过滤，无完全匹配时提供"创建"行
    const search = document.createElement("div");
    search.className = "inline-edit-select__search";
    const input = document.createElement("input");
    input.type = "text";
    input.className = "b3-text-field inline-edit-select__input";
    input.placeholder = t("inlineEdit.searchOrCreate");
    input.setAttribute("aria-label", keyName);
    search.appendChild(input);
    dropdown.appendChild(search);

    const list = document.createElement("div");
    list.className = "inline-edit-dropdown-list";
    dropdown.appendChild(list);

    let saveButton: HTMLButtonElement | undefined;
    if (multi) {
        saveButton = createIconButton(ICONS.check, t("common.save"), "inline-edit-action inline-edit-action--primary");
        appendHeaderAction(header, saveButton);
        saveButton.addEventListener("click", event => {
            event.stopPropagation();
            void save();
        });
    }

    let isSaving = false;
    const save = async () => {
        if (isSaving) return;
        isSaving = true;
        const entries: SelectValueEntry[] = Array.from(selected).map(name => {
            const option = allOptions.find(item => item.name === name);
            return { content: name, color: option ? option.color : "" };
        });
        try {
            await options.onSave(entries);
        } catch {
            // 写库失败的原因已由调用方提示，这里只解锁以便重试
        } finally {
            isSaving = false;
        }
    };

    // 列表高亮：索引指向 rowElements，等于 rowElements.length 时指向创建行
    let rowElements: HTMLElement[] = [];
    let createRow: HTMLElement | null = null;
    let highlighted = -1;

    const matches = (keyword: string): EditableOption[] => {
        if (!keyword) return allOptions;
        const lower = keyword.toLowerCase();
        return allOptions.filter(item =>
            lower.includes(item.name.toLowerCase()) || item.name.toLowerCase().includes(lower));
    };

    const applyHighlight = () => {
        const createIndex = rowElements.length;
        // 未键盘导航时默认高亮第一项，与思源原生一致
        const active = highlighted < 0 ? 0 : highlighted;
        rowElements.forEach((row, index) =>
            row.classList.toggle("inline-edit-dropdown-option--current", index === active));
        createRow?.classList.toggle("inline-edit-dropdown-option--current", active === createIndex);
        const current = active === createIndex ? createRow : rowElements[active];
        current?.scrollIntoView({ block: "nearest" });
    };

    const moveHighlight = (delta: number) => {
        const total = rowElements.length + (createRow ? 1 : 0);
        if (!total) return;
        highlighted += delta;
        if (highlighted < 0) highlighted = total - 1;
        if (highlighted >= total) highlighted = 0;
        applyHighlight();
    };

    const toggle = (name: string) => {
        if (!multi) {
            selected.clear();
            selected.add(name);
            void save();
            return;
        }
        if (selected.has(name)) selected.delete(name);
        else selected.add(name);
        renderOptions();
        input.focus();
    };

    const createOption = (rawName: string) => {
        const name = rawName.trim();
        if (!name || allOptions.some(item => item.name === name)) return;
        allOptions.push({
            name,
            color: getNextAVOptionColor(allOptions.length),
            resolvedColor: undefined,
            pending: true
        });
        if (!multi) selected.clear();
        selected.add(name);
        input.value = "";
        renderOptions();
        input.focus();
        if (!multi) void save();
    };

    const editColor = (option: EditableOption, swatch: HTMLElement) => {
        openOptionColorPalette({
            swatch,
            avID,
            keyID,
            optionName: option.name,
            color: option.color,
            onApplied: newColor => {
                if (option.pending) {
                    // 新选项还没进内核，改本地即可，保存时随值一起提交
                    option.color = newColor;
                    option.resolvedColor = undefined;
                    renderOptions();
                    return;
                }
                void (async () => {
                    try {
                        await attributeViewRepository.updateSelectOptionColor(
                            avID, keyID, option.name, option.color, newColor);
                        option.color = newColor;
                        option.resolvedColor = getAVResolvedColor(newColor);
                        renderOptions();
                        showMessage(t("common.saveSuccess"), 2000, "info");
                        options.onRefresh?.();
                    } catch (error) {
                        const message = toErrorMessage(error);
                        console.error(t("common.saveFailed", { message }), error);
                        showMessage(t("common.saveFailed", { message }), 5000, "error");
                    }
                })();
            }
        });
    };

    const createCreateRow = (name: string): HTMLElement => {
        const row = document.createElement("button");
        row.type = "button";
        row.className = "inline-edit-dropdown-option inline-edit-select__create";

        const addIcon = iconElement(ICONS.add);
        addIcon.classList.add("inline-edit-select__create-icon");

        // 预览新建选项的颜色：与正常选项一致使用小色块，视觉更统一
        const color = getNextAVOptionColor(allOptions.length);
        const swatch = createOptionColorSwatch(color);
        swatch.classList.add("inline-edit-select__create-swatch");

        const label = document.createElement("span");
        label.className = "inline-edit-dropdown-option__label";
        label.textContent = name;

        const hint = document.createElement("span");
        hint.className = "inline-edit-select__create-hint";
        hint.textContent = t("inlineEdit.enterToCreate");

        row.append(addIcon, swatch, label, hint);
        row.addEventListener("click", event => {
            event.preventDefault();
            event.stopPropagation();
            createOption(name);
        });
        return row;
    };

    const renderOptions = () => {
        const keyword = input.value.trim();
        const visible = matches(keyword);
        list.replaceChildren();
        rowElements = [];
        createRow = null;

        if (!multi) {
            const clearRow = createDropdownOption("", t("common.clear"), selected.size === 0);
            clearRow.addEventListener("click", event => {
                event.preventDefault();
                event.stopPropagation();
                selected.clear();
                void save();
            });
            list.appendChild(clearRow);
            rowElements.push(clearRow);
        }

        visible.forEach(option => {
            const isSelected = selected.has(option.name);
            const row = multi
                ? createMultiSelectOption(option.name, option.name, isSelected, colorRef(option),
                    swatch => editColor(option, swatch))
                : createDropdownOption(option.name, option.name, isSelected, colorRef(option),
                    swatch => editColor(option, swatch));
            row.addEventListener("click", event => {
                event.preventDefault();
                event.stopPropagation();
                toggle(option.name);
            });
            list.appendChild(row);
            rowElements.push(row);
        });

        // 与思源一致：只有不存在同名选项时才提供新建入口
        if (keyword && !allOptions.some(item => item.name === keyword)) {
            createRow = createCreateRow(keyword);
            list.appendChild(createRow);
        }

        if (!visible.length && !createRow) {
            const empty = document.createElement("div");
            empty.className = "inline-edit-select__empty";
            empty.textContent = keyword ? t("inlineEdit.noMatchOption") : t("inlineEdit.noOption");
            list.appendChild(empty);
        }
        applyHighlight();
    };

    input.addEventListener("input", () => {
        highlighted = -1;
        renderOptions();
    });
    input.addEventListener("compositionend", () => {
        highlighted = -1;
        renderOptions();
    });
    input.addEventListener("keydown", (event: KeyboardEvent) => {
        if (event.isComposing) return;
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            moveHighlight(event.key === "ArrowDown" ? 1 : -1);
            return;
        }
        if (event.key !== "Enter") return;
        event.preventDefault();
        // 回车优先创建新选项，与思源原生一致；否则触发当前高亮项（未导航时取第一项）
        if (createRow) {
            createOption(input.value.trim());
            return;
        }
        rowElements[highlighted < 0 ? 0 : highlighted]?.click();
    });

    const handleClickOutside = (event: MouseEvent) => {
        const target = event.target as HTMLElement;
        if (isWithinPalette(target)) return;
        if (!dropdown.contains(target) && !element.contains(target)) close();
    };

    setOpenPanelCleanup(combineCleanup(
        bindOutsideDismiss(handleClickOutside),
        bindEscapeDismiss(close)
    ));

    document.body.appendChild(dropdown);
    renderOptions();
    positionDropdown(dropdown, element);
    input.focus();
}
