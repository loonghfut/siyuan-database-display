// 各字段类型的直接编辑处理器：按字段类型弹出对应的编辑界面并写回内核。

import { fetchSyncPost, IWebSocketData } from "siyuan";
import { attributeViewRepository } from "../data/attribute-view-repository";
import { AssetReference, AttributeViewWriteValue, SelectOption } from "../core/types";
import { t } from "../i18n";
import { toErrorMessage } from "../libs/error-utils";
import { notify } from "../libs/notify";
import { openRelationEditor, RelationEditorHandle } from "../ui/relation-editor";
import { assetLabel } from "../ui/asset-utils";
import { createIconButton, iconElement } from "../libs/dom";
import {
    ICONS,
    prepareEditorPanel,
    createPanelHeader,
    appendHeaderAction,
    positionPopup,
    positionDropdown,
    closeDropdown,
    closeEditorPanel,
    closeOpenPanel,
    bindOutsideDismiss,
    bindEscapeDismiss,
    combineCleanup,
    setOpenPanel,
    setOpenPanelCleanup
} from "./popup";
import { openSelectEditor } from "./select-editor";
import {
    createTextInput,
    createTextArea,
    createNumberInput,
    styleInputElement,
    sizeInputToContent,
    sizeTextAreaToContent,
    getInputValue,
    convertToAVValue,
    normalizeTimestamp
} from "./input-fields";
import type { InlineEditOptions } from "./index";

function handleTemplateEdit(options: InlineEditOptions): void {
    handlePopupEdit({ ...options, currentValue: options.template ?? '' });
}

// 复选框写请求在途集合：快速连点同一复选框时基于同一旧值并发翻转会造成竞态回弹；
// 按条目粒度记录，不影响其他字段的并发切换
const checkboxWritesInFlight = new Set<string>();

/**
 * 处理复选框直接切换
 */
async function handleCheckboxEdit(options: InlineEditOptions) {
    const { avID, itemID, currentValue, onSave } = options;
    const writeKey = `${avID}:${options.keyID}:${itemID}`;
    if (checkboxWritesInFlight.has(writeKey)) return;
    checkboxWritesInFlight.add(writeKey);

    // 直接切换状态
    const newValue = !Boolean(currentValue);

    try {
        const value = convertToAVValue('checkbox', newValue);
        await attributeViewRepository.setValue(avID, options.keyID, itemID, value);

        notify(t('common.saveSuccess'), 2000, 'info');

        if (onSave) {
            onSave(newValue);
        }
    } catch (error) {
        const message = toErrorMessage(error);
        console.error(t('common.saveFailed', { message }), error);
        notify(t('common.saveFailed', { message }), 5000, 'error');
    } finally {
        checkboxWritesInFlight.delete(writeKey);
    }
}

/**
 * 单选/多选的共用入口：搜索、直接创建新选项、选项配色编辑都在 select-editor 实现。
 */
function openSelectOptionsEditor(options: InlineEditOptions, multi: boolean): void {
    const { element, avID, itemID, selectOptions, onSave } = options;
    const initial = (Array.isArray(options.currentValue)
        ? options.currentValue
        : (options.currentValue ? [options.currentValue] : []))
        .map(value => String(value ?? ""))
        .filter(Boolean);

    void openSelectEditor({
        element,
        avID,
        keyID: options.keyID,
        keyName: options.keyName,
        multi,
        columnOptions: (selectOptions || []) as SelectOption[],
        initialSelected: multi ? initial : initial.slice(0, 1),
        async onSave(entries) {
            try {
                // 每个值都带上颜色：内核对已存在的选项会忽略传入色，
                // 对新建选项则采用它，避免随机取色
                const value: AttributeViewWriteValue = { mSelect: entries };
                await attributeViewRepository.setValue(avID, options.keyID, itemID, value);
                closeOpenPanel();
                notify(t("common.saveSuccess"), 2000, "info");
                onSave?.(multi ? entries.map(entry => entry.content) : (entries[0]?.content ?? ""));
            } catch (error) {
                const message = toErrorMessage(error);
                console.error(t("common.saveFailed", { message }), error);
                notify(t("common.saveFailed", { message }), 5000, "error");
                // 抛回给面板解锁 isSaving，便于修正后重试
                throw error;
            }
        },
        onRefresh() {
            // 选项配色等列级变更已落库，用原值触发正文重渲染
            onSave?.(multi ? initial : (initial[0] ?? ""));
        },
        onCancel: () => options.onCancel?.()
    });
}

/**
 * 处理单选下拉菜单
 */
function handleSelectEdit(options: InlineEditOptions): void {
    openSelectOptionsEditor(options, false);
}

/**
 * 处理多选下拉菜单
 */
function handleMultiSelectEdit(options: InlineEditOptions): void {
    openSelectOptionsEditor(options, true);
}

function handleRelationEdit(options: InlineEditOptions): void {
    let editor: RelationEditorHandle | undefined;
    editor = openRelationEditor({
        element: options.element,
        avID: options.avID,
        itemID: options.itemID,
        keyID: options.keyID,
        keyName: options.keyName,
        relation: options.relation,
        currentValue: options.currentValue,
        onSave: newValue => options.onSave?.(newValue),
        onCancel: () => options.onCancel?.(),
        onClose: () => {
            if (editor) closeEditorPanel(editor.panel);
        }
    });
    if (!editor) return;
    setOpenPanel(editor.panel);
    setOpenPanelCleanup(editor.cleanup);
}

/**
 * 处理资源（mAsset）编辑：列出当前资源，支持移除与上传新增
 */
function handleAssetEdit(options: InlineEditOptions): void {
    const { element, avID, itemID, keyName, currentValue, onSave, onCancel } = options;
    const assets: AssetReference[] = Array.isArray(currentValue)
        ? currentValue.map(asset => ({ ...asset }))
        : [];

    const popup = document.createElement('div');
    popup.className = 'inline-edit-popup inline-edit-asset';
    prepareEditorPanel(popup, keyName);
    setOpenPanel(popup);

    const header = createPanelHeader(keyName, () => {
        closePopup();
        onCancel?.();
    });
    const saveButton = createIconButton(ICONS.check, t('common.save'), 'inline-edit-action inline-edit-action--primary');
    appendHeaderAction(header, saveButton);
    popup.appendChild(header);

    const list = document.createElement('div');
    list.className = 'inline-edit-asset__list';
    const renderList = () => {
        list.replaceChildren();
        if (!assets.length) {
            const empty = document.createElement('span');
            empty.className = 'inline-edit-asset__empty';
            empty.textContent = t('common.noAssets');
            list.appendChild(empty);
            return;
        }
        assets.forEach((asset, index) => {
            const row = document.createElement('div');
            row.className = 'inline-edit-asset__row';
            const icon = iconElement(asset.type === 'image' ? ICONS.image : ICONS.file);
            icon.classList.add('inline-edit-asset__icon');
            const name = document.createElement('span');
            name.className = 'inline-edit-asset__name';
            name.textContent = assetLabel(asset);
            const remove = createIconButton(ICONS.clear, t('common.removeAsset'), 'inline-edit-asset__remove');
            remove.addEventListener('click', event => {
                event.stopPropagation();
                assets.splice(index, 1);
                renderList();
            });
            row.append(icon, name, remove);
            list.appendChild(row);
        });
    };
    renderList();

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.className = 'inline-edit-asset__file';
    fileInput.setAttribute('aria-label', t('common.addAsset'));
    const addButton = createIconButton(ICONS.add, t('common.addAsset'), 'inline-edit-action inline-edit-action--primary inline-edit-asset__add');
    addButton.addEventListener('click', event => {
        event.stopPropagation();
        fileInput.click();
    });
    fileInput.addEventListener('change', () => {
        const file = fileInput.files?.[0];
        fileInput.value = '';
        if (!file) return;
        void uploadAsset(file).then(asset => {
            assets.push(asset);
            renderList();
        }).catch(error => {
            const message = toErrorMessage(error);
            console.error(t('common.saveFailed', { message }), error);
            notify(t('common.saveFailed', { message }), 5000, 'error');
        });
    });
    const addRow = document.createElement('div');
    addRow.className = 'inline-edit-asset__add-row';
    addRow.append(fileInput, addButton);
    popup.append(list, addRow);

    document.body.appendChild(popup);
    positionPopup(popup, element);

    let isSaving = false;
    const save = async () => {
        if (isSaving) return;
        isSaving = true;
        try {
            const value: AttributeViewWriteValue = { mAsset: assets };
            await attributeViewRepository.setValue(avID, options.keyID, itemID, value);
            closePopup();
            notify(t('common.saveSuccess'), 2000, 'info');
            onSave?.(assets);
        } catch (error) {
            const message = toErrorMessage(error);
            console.error(t('common.saveFailed', { message }), error);
            notify(t('common.saveFailed', { message }), 5000, 'error');
            isSaving = false;
        }
    };
    saveButton.addEventListener('click', event => {
        event.stopPropagation();
        void save();
    });

    const closePopup = () => closeEditorPanel(popup);
    const cancel = () => {
        closePopup();
        onCancel?.();
    };
    const handleClickOutside = (event: MouseEvent) => {
        const target = event.target as Node;
        if (!popup.contains(target) && !element.contains(target)) cancel();
    };
    setOpenPanelCleanup(combineCleanup(
        bindOutsideDismiss(handleClickOutside),
        bindEscapeDismiss(cancel)
    ));
}

async function uploadAsset(file: File): Promise<AssetReference> {
    const formData = new FormData();
    formData.append('file', file);
    const response = await fetchSyncPost('/api/asset/upload', formData) as IWebSocketData;
    if (response.code !== 0) throw new Error(response.msg || 'Asset upload failed');
    const data = response.data as { path?: string } | undefined;
    const path = data?.path;
    if (!path) throw new Error('Asset upload returned no path');
    return {
        name: file.name,
        content: path,
        type: file.type.startsWith('image/') ? 'image' : 'file'
    };
}

/** 日期快捷项相对今天的偏移天数。 */
const DATE_PRESET_OFFSETS: Record<string, number> = {
    today: 0, tomorrow: 1, yesterday: -1, in7Days: 7, in30Days: 30
};
/** 时段快捷项对应的整点：早上 9 点、中午 12 点、下午 3 点、晚上 9 点。 */
const TIME_PRESET_HOURS: Record<string, number> = { morning: 9, noon: 12, afternoon: 15, evening: 21 };
const DATE_PRESET_KEYS = ["now", "today", "tomorrow", "yesterday", "in7Days", "in30Days"] as const;
const TIME_PRESET_KEYS = ["morning", "noon", "afternoon", "evening"] as const;

/** 自绘日期面板内部的时间分量（month 为 0 基，与 Date 一致）。 */
interface DateTimeParts {
    year: number;
    month: number;
    day: number;
    hours: number;
    minutes: number;
}

function partsFromTimestamp(timestamp: number): DateTimeParts {
    const date = new Date(timestamp);
    return {
        year: date.getFullYear(),
        month: date.getMonth(),
        day: date.getDate(),
        hours: date.getHours(),
        minutes: date.getMinutes()
    };
}

function partsToTimestamp(parts: DateTimeParts): number {
    return new Date(parts.year, parts.month, parts.day, parts.hours, parts.minutes).getTime();
}

/** 周一开头的星期短标签，随界面语言本地化（2024-01-01 恰好是周一）。 */
function weekdayLabels(): string[] {
    return Array.from({ length: 7 }, (_, index) =>
        new Date(2024, 0, 1 + index).toLocaleDateString(undefined, { weekday: "narrow" }));
}

/**
 * 处理日期编辑：自绘日历面板，不再依赖浏览器原生日期控件。
 *
 * 面板内容：目标切换（开始/结束）、月历、时/分下拉、
 * 「包含结束时间」「包含具体时间」开关、快捷预设与清除/保存。
 * 日历与快捷预设作用于当前选中的目标，开始与结束在同一面板内即可设置完整时间段。
 */
function handleDateEdit(options: InlineEditOptions) {
    const { element, avID, itemID, currentValue, onSave, onCancel } = options;

    const current = (currentValue && typeof currentValue === 'object')
        ? currentValue as { content?: number; content2?: number; hasEndDate?: boolean; isNotTime?: boolean }
        : { content: typeof currentValue === 'number' ? currentValue : null };

    // 已存值保留其"是否含时间"的设定；新值默认含时间
    let includeTime = current.isNotTime !== true;
    const hasStoredEnd = Boolean(current.hasEndDate && current.content2);
    let hasEnd = hasStoredEnd;
    const start = partsFromTimestamp(current.content ? normalizeTimestamp(current.content) : Date.now());
    const end: DateTimeParts = hasStoredEnd
        ? partsFromTimestamp(normalizeTimestamp(current.content2 as number))
        : { ...start };
    // 日历当前编辑的目标；切到结束时若尚未设置，日历跳到开始所在月份
    let target: "start" | "end" = "start";
    let viewYear = start.year;
    let viewMonth = start.month;

    const datePicker = document.createElement('div');
    datePicker.className = 'inline-edit-datepicker';
    prepareEditorPanel(datePicker, options.keyName);
    setOpenPanel(datePicker);

    const close = () => {
        closeDropdown(datePicker);
        onCancel?.();
    };
    // 目标切换（开始 / 结束）芯片放在面板标题中间，与标题同行
    const targetsRow = document.createElement('div');
    targetsRow.className = 'inline-edit-datepicker-targets';
    const header = createPanelHeader(options.keyName, close, { center: () => targetsRow });
    datePicker.appendChild(header);

    // ---- 月历导航 ----
    const navRow = document.createElement('div');
    navRow.className = 'inline-edit-datepicker-nav';
    const prevButton = document.createElement('button');
    prevButton.type = 'button';
    prevButton.className = 'inline-edit-datepicker-nav-button';
    prevButton.setAttribute('aria-label', t('inlineEdit.prevMonth'));
    prevButton.textContent = '‹';
    const monthLabel = document.createElement('span');
    monthLabel.className = 'inline-edit-datepicker-month';
    const nextButton = document.createElement('button');
    nextButton.type = 'button';
    nextButton.className = 'inline-edit-datepicker-nav-button';
    nextButton.setAttribute('aria-label', t('inlineEdit.nextMonth'));
    nextButton.textContent = '›';
    const shiftMonth = (delta: number): void => {
        const anchor = new Date(viewYear, viewMonth + delta, 1);
        viewYear = anchor.getFullYear();
        viewMonth = anchor.getMonth();
        renderCalendar();
    };
    prevButton.addEventListener('click', () => shiftMonth(-1));
    nextButton.addEventListener('click', () => shiftMonth(1));
    navRow.append(prevButton, monthLabel, nextButton);

    const weekdayRow = document.createElement('div');
    weekdayRow.className = 'inline-edit-datepicker-weekdays';
    weekdayLabels().forEach(label => {
        const cell = document.createElement('span');
        cell.textContent = label;
        weekdayRow.append(cell);
    });

    const grid = document.createElement('div');
    grid.className = 'inline-edit-datepicker-grid';

    const renderCalendar = (): void => {
        monthLabel.textContent = new Date(viewYear, viewMonth, 1)
            .toLocaleDateString(undefined, { year: 'numeric', month: 'long' });
        grid.replaceChildren();
        const active = target === 'start' ? start : end;
        const today = new Date();
        // 周一开头：getDay() 周日为 0，折算成 6；周一为 1，折算成 0
        const leading = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7;
        const startTs = new Date(start.year, start.month, start.day).getTime();
        const endTs = new Date(end.year, end.month, end.day).getTime();
        // 固定 6 行 42 格，首尾由上月/下月日期补齐，与常规日期选择面板一致；
        // Date 构造自动归一化溢出的日号（如 -1 → 上月倒数第二天）
        for (let index = 0; index < 42; index++) {
            const cellDate = new Date(viewYear, viewMonth, index - leading + 1);
            const cellYear = cellDate.getFullYear();
            const cellMonth = cellDate.getMonth();
            const day = cellDate.getDate();
            const cell = document.createElement('button');
            cell.type = 'button';
            cell.className = 'inline-edit-datepicker-day';
            if (cellMonth !== viewMonth) {
                cell.classList.add('inline-edit-datepicker-day--outside');
            }
            cell.textContent = String(day);
            if (today.getFullYear() === cellYear && today.getMonth() === cellMonth && today.getDate() === day) {
                cell.classList.add('inline-edit-datepicker-day--today');
            }
            if (active.year === cellYear && active.month === cellMonth && active.day === day) {
                cell.classList.add('inline-edit-datepicker-day--selected');
            } else if (hasEnd) {
                // 起止之间的日期淡显，方便确认时间段跨度（含跨月的补齐格）
                const cellTs = cellDate.getTime();
                if (cellTs > Math.min(startTs, endTs) && cellTs < Math.max(startTs, endTs)) {
                    cell.classList.add('inline-edit-datepicker-day--range');
                }
            }
            cell.addEventListener('click', () => {
                active.year = cellYear;
                active.month = cellMonth;
                active.day = day;
                // 点选上/下月日期时顺带翻页到对应月份，与常规日期选择面板一致
                if (cellMonth !== viewMonth) {
                    viewYear = cellYear;
                    viewMonth = cellMonth;
                }
                renderCalendar();
            });
            grid.append(cell);
        }
    };

    // ---- 时 / 分下拉 ----
    const timeRows = document.createElement('div');
    timeRows.className = 'inline-edit-datepicker-times';

    /**
     * 自绘的时/分下拉：原生 select 的弹出列表由浏览器渲染，无法限高，
     * 60 个分钟项会顶满半屏。这里用按钮 + 面板内绝对定位的滚动列表复刻，
     * max-height 收敛在 150px 左右。
     */
    const createTimeSelect = (values: number[], selected: number, title: string, onPick: (value: number) => void): HTMLElement => {
        const wrap = document.createElement('div');
        wrap.className = 'inline-edit-time-picker';

        const pad = (value: number): string => String(value).padStart(2, '0');
        let current = selected;

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'inline-edit-time-picker__button';
        button.title = title;
        button.setAttribute('aria-label', title);
        button.textContent = pad(current);

        const list = document.createElement('div');
        list.className = 'inline-edit-time-picker__list';
        list.setAttribute('role', 'listbox');

        const options = values.map(value => {
            const option = document.createElement('button');
            option.type = 'button';
            option.className = 'inline-edit-time-picker__option';
            option.setAttribute('role', 'option');
            option.textContent = pad(value);
            option.addEventListener('click', event => {
                event.stopPropagation();
                current = value;
                onPick(value);
                button.textContent = pad(value);
                closeList();
            });
            list.append(option);
            return { value, option };
        });

        const closeList = (): void => {
            list.classList.remove('inline-edit-time-picker__list--open');
            button.classList.remove('inline-edit-time-picker__button--open');
        };
        button.addEventListener('click', event => {
            event.stopPropagation();
            // 打开前先关掉同面板里的其他时间下拉，避免叠层
            timeRows.querySelectorAll('.inline-edit-time-picker__list--open').forEach(open => open.classList.remove('inline-edit-time-picker__list--open'));
            timeRows.querySelectorAll('.inline-edit-time-picker__button--open').forEach(open => open.classList.remove('inline-edit-time-picker__button--open'));
            const willOpen = !list.classList.contains('inline-edit-time-picker__list--open');
            list.classList.toggle('inline-edit-time-picker__list--open', willOpen);
            button.classList.toggle('inline-edit-time-picker__button--open', willOpen);
            if (willOpen) {
                const match = options.find(option => option.value === current);
                match?.option.scrollIntoView({ block: 'center' });
            }
        });

        wrap.append(button, list);
        return wrap;
    };

    const renderTimes = (): void => {
        timeRows.replaceChildren();
        if (!includeTime) return;
        const appendRow = (labelText: string, parts: DateTimeParts): void => {
            const row = document.createElement('div');
            row.className = 'inline-edit-datepicker-time';
            const label = document.createElement('span');
            label.className = 'inline-edit-datepicker-label';
            label.textContent = labelText;
            row.append(
                label,
                createTimeSelect([...Array(24).keys()], parts.hours, t('inlineEdit.hour'), value => { parts.hours = value; }),
                createTimeSelect([...Array(60).keys()], parts.minutes, t('inlineEdit.minute'), value => { parts.minutes = value; })
            );
            timeRows.append(row);
        };
        appendRow(t('inlineEdit.start'), start);
        if (hasEnd) appendRow(t('inlineEdit.end'), end);
    };

    // ---- 开关 ----
    const createToggle = (labelText: string, checked: boolean, onChange: (next: boolean) => void): { row: HTMLElement; checkbox: HTMLInputElement } => {
        const row = document.createElement('div');
        row.className = 'inline-edit-datepicker-row inline-edit-datepicker-row--single';
        const label = document.createElement('label');
        label.className = 'inline-edit-datepicker-label inline-edit-datepicker-label--checkbox';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = checked;
        label.append(checkbox, document.createTextNode(' ' + labelText));
        checkbox.addEventListener('change', () => onChange(checkbox.checked));
        row.appendChild(label);
        return { row, checkbox };
    };

    const renderTargets = (): void => {
        targetsRow.replaceChildren();
        const addChip = (key: "start" | "end", labelText: string): void => {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'inline-edit-datepicker-target' + (target === key ? ' inline-edit-datepicker-target--active' : '');
            chip.textContent = labelText;
            chip.addEventListener('click', () => {
                target = key;
                const parts = key === 'start' ? start : end;
                viewYear = parts.year;
                viewMonth = parts.month;
                renderAll();
            });
            targetsRow.append(chip);
        };
        addChip('start', t('inlineEdit.start'));
        if (hasEnd) addChip('end', t('inlineEdit.end'));
    };

    const endToggle = createToggle(t('inlineEdit.hasEnd'), hasStoredEnd, next => {
        hasEnd = next;
        if (next) {
            // 启用结束时以开始为起点，随后再单独调整
            Object.assign(end, start);
        } else if (target === 'end') {
            target = 'start';
            viewYear = start.year;
            viewMonth = start.month;
        }
        renderAll();
    });
    const timeToggle = createToggle(t('inlineEdit.includeTime'), includeTime, next => {
        includeTime = next;
        renderTimes();
    });

    // ---- 快捷预设：直接嵌入面板，作用于当前目标 ----
    const presetsRow = document.createElement('div');
    presetsRow.className = 'inline-edit-datepicker-presets';

    const applyPreset = (key: string): void => {
        const active = target === 'start' ? start : end;
        const nowDate = new Date();

        const hour = TIME_PRESET_HOURS[key];
        if (hour !== undefined) {
            // 选了时段就说明要精确到时间，顺带打开"包含具体时间"，否则时间会被截断
            if (!includeTime) {
                includeTime = true;
                timeToggle.checkbox.checked = true;
            }
            active.hours = hour;
            active.minutes = 0;
            renderTimes();
            return;
        }
        if (key === 'now') {
            Object.assign(active, partsFromTimestamp(nowDate.getTime()));
            viewYear = active.year;
            viewMonth = active.month;
            renderAll();
            return;
        }
        const offset = DATE_PRESET_OFFSETS[key];
        if (offset === undefined) return;
        // 日期类只改日期，时间部分沿用当前值；跨月跨年由 Date 自动折算
        const shifted = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate() + offset);
        active.year = shifted.getFullYear();
        active.month = shifted.getMonth();
        active.day = shifted.getDate();
        viewYear = active.year;
        viewMonth = active.month;
        renderCalendar();
    };

    const addPresetChip = (key: string, labelText: string): void => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'b3-button b3-button--outline inline-edit-datepicker-preset';
        chip.textContent = labelText;
        chip.addEventListener('click', event => {
            event.stopPropagation();
            applyPreset(key);
        });
        presetsRow.append(chip);
    };
    DATE_PRESET_KEYS.forEach(key => addPresetChip(key, t(`inlineEdit.${key}`)));
    TIME_PRESET_KEYS.forEach(key => addPresetChip(key, t(`inlineEdit.${key}`)));

    const renderAll = (): void => {
        renderTargets();
        renderCalendar();
        renderTimes();
    };
    renderAll();

    datePicker.append(
        navRow,
        weekdayRow,
        grid,
        timeRows,
        endToggle.row,
        timeToggle.row,
        presetsRow
    );

    const buildValue = () => {
        const startTs = partsToTimestamp(start);
        const endTs = hasEnd ? partsToTimestamp(end) : 0;
        return {
            value: convertToAVValue('date', {
                content: startTs,
                isNotEmpty: true,
                content2: endTs,
                isNotEmpty2: hasEnd,
                hasEndDate: hasEnd,
                isNotTime: !includeTime
            }),
            startTs,
            endTs,
            hasEndDate: hasEnd
        };
    };

    const write = async (payload: ReturnType<typeof buildValue>): Promise<void> => {
        await attributeViewRepository.setValue(avID, options.keyID, itemID, payload.value);
        closeDropdown(datePicker);
        notify(t('common.saveSuccess'), 2000, 'info');
        onSave?.({
            content: payload.startTs ?? 0,
            hasEndDate: payload.hasEndDate,
            content2: payload.endTs ?? 0,
            isNotTime: !includeTime
        });
    };

    const save = (): void => {
        void write(buildValue()).catch((error: unknown) => {
            const message = toErrorMessage(error);
            console.error(t('common.saveFailed', { message }), error);
            notify(t('common.saveFailed', { message }), 5000, 'error');
        });
    };

    const clear = (): void => {
        void write({
            value: convertToAVValue('date', {
                content: 0, isNotEmpty: false, content2: 0, isNotEmpty2: false, hasEndDate: false, isNotTime: !includeTime
            }),
            startTs: null,
            endTs: null,
            hasEndDate: false
        }).catch((error: unknown) => {
            const message = toErrorMessage(error);
            console.error(t('common.saveFailed', { message }), error);
            notify(t('common.saveFailed', { message }), 5000, 'error');
        });
    };

    const saveButton = createIconButton(ICONS.check, t('common.save'), 'inline-edit-action inline-edit-action--primary');
    saveButton.addEventListener('click', event => {
        event.stopPropagation();
        save();
    });
    const clearButton = createIconButton(ICONS.clear, t('inlineEdit.clearDate'), 'inline-edit-action');
    clearButton.addEventListener('click', event => {
        event.stopPropagation();
        clear();
    });
    appendHeaderAction(header, clearButton);
    appendHeaderAction(header, saveButton);

    document.body.appendChild(datePicker);
    positionDropdown(datePicker, element);

    // 面板内点击其他区域（日历、开关等）时收起已展开的时/分下拉
    datePicker.addEventListener('click', () => {
        timeRows.querySelectorAll('.inline-edit-time-picker__list--open').forEach(open => open.classList.remove('inline-edit-time-picker__list--open'));
        timeRows.querySelectorAll('.inline-edit-time-picker__button--open').forEach(open => open.classList.remove('inline-edit-time-picker__button--open'));
    });

    // Enter 保存：日历格/下拉等控件自身的 Enter 走默认行为，不在此拦截
    datePicker.addEventListener('keydown', (event: KeyboardEvent) => {
        if (event.key !== 'Enter') return;
        const source = event.target as HTMLElement | null;
        if (source?.closest('button, select, input')) return;
        event.preventDefault();
        save();
    });

    // 点击外部关闭 + Esc 关闭
    const handleClickOutside = (event: MouseEvent) => {
        const target = event.target as Node;
        if (datePicker.contains(target) || element.contains(target)) return;
        close();
    };

    setOpenPanelCleanup(combineCleanup(
        bindOutsideDismiss(handleClickOutside),
        bindEscapeDismiss(close)
    ));
}

/**
 * 处理弹窗编辑（文本、数字等）
 */
function handlePopupEdit(options: InlineEditOptions) {
    const { element, avID, itemID, keyName, keyType, currentValue, onSave, onCancel } = options;

    // 创建弹窗容器
    const popup = document.createElement('div');
    popup.className = 'inline-edit-popup';
    prepareEditorPanel(popup, keyName);
    setOpenPanel(popup);

    // 创建弹窗内容
    const popupContent = document.createElement('div');
    popupContent.className = 'inline-edit-popup-content';

    // 添加标题
    const header = createPanelHeader(keyName, () => {
        closePopup();
        onCancel?.();
    });
    popupContent.appendChild(header);

    // 创建输入区域
    const inputContainer = document.createElement('div');
    inputContainer.className = 'inline-edit-popup-input';

    // 根据字段类型创建输入元素
    let inputElement: HTMLInputElement | HTMLTextAreaElement;

    switch (keyType) {
        case 'number':
            inputElement = createNumberInput(currentValue);
            break;
        case 'text':
            inputElement = createTextArea(currentValue);
            break;
        case 'template':
            inputElement = createTextArea(currentValue);
            inputElement.classList.add('inline-edit-template__input');
            break;
        case 'url':
        case 'email':
        case 'phone':
        default:
            inputElement = createTextInput(currentValue, keyType);
            break;
    }

    styleInputElement(inputElement, keyType);
    if (inputElement instanceof HTMLTextAreaElement) {
        inputElement.addEventListener("input", () => sizeTextAreaToContent(inputElement));
    } else {
        sizeInputToContent(inputElement);
        inputElement.addEventListener("input", () => sizeInputToContent(inputElement));
    }
    inputContainer.appendChild(inputElement);
    popupContent.appendChild(inputContainer);

    const saveButton = createIconButton(ICONS.check, t('common.save'), 'inline-edit-action inline-edit-action--primary');
    appendHeaderAction(header, saveButton);

    popup.appendChild(popupContent);
    document.body.appendChild(popup);

    // 定位弹窗
    positionPopup(popup, element);

    // 聚焦输入框
    setTimeout(() => {
        inputElement.focus();
        if (inputElement instanceof HTMLTextAreaElement) {
            sizeTextAreaToContent(inputElement);
        } else if (inputElement.type === 'text') {
            inputElement.select();
        }
    }, 10);

    // 标记正在编辑
    let isSaving = false;

    // 保存函数
    const save = async () => {
        if (isSaving) return;
        isSaving = true;

        const newValue = getInputValue(inputElement, keyType);

        try {
            // 对于数字类型，需要同时传递 isNotEmpty 标记，保持 onSave 回调传回原始数值以保持兼容
            let avInput: any = newValue;
            if (keyType === 'number') {
                const isNotEmpty = (inputElement instanceof HTMLInputElement) ? (inputElement.value.trim() !== '') : Boolean(newValue);
                avInput = { content: newValue, isNotEmpty };
            }

            if (keyType === 'template') {
                await attributeViewRepository.updateTemplate(avID, options.keyID, String(newValue));
            } else {
                const value = convertToAVValue(keyType, avInput);
                await attributeViewRepository.setValue(avID, options.keyID, itemID, value);
            }

            // 关闭弹窗
            closePopup();

            notify(t('common.saveSuccess'), 2000, 'info');

            if (onSave) {
                onSave(newValue);
            }
        } catch (error) {
            const message = toErrorMessage(error);
            console.error(t('common.saveFailed', { message }), error);
            notify(t('common.saveFailed', { message }), 5000, 'error');
            isSaving = false;
        }
    };

    // 取消函数
    const cancel = () => {
        closePopup();
        if (onCancel) {
            onCancel();
        }
    };

    // 关闭弹窗函数
    const closePopup = () => {
        closeEditorPanel(popup);
    };

    // 事件监听
    saveButton.addEventListener('click', (e) => {
        e.stopPropagation();
        save();
    });

    inputElement.addEventListener('keydown', (e: KeyboardEvent) => {
        const isTextArea = inputElement instanceof HTMLTextAreaElement;
        if (e.key === 'Enter' && (isTextArea ? (e.ctrlKey || e.metaKey) : !e.shiftKey)) {
            e.preventDefault();
            if (!isSaving) {
                save();
            }
        } else if (e.key === 'Escape') {
            e.preventDefault();
            cancel();
        }
    });

    // 点击弹窗外部关闭 + Esc 关闭（输入框内已有 Esc 处理，此处覆盖焦点在按钮上的场景）
    const handleClickOutside = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        if (!popup.contains(target) && !element.contains(target)) {
            cancel();
        }
    };

    // 延迟添加点击外部监听器
    setOpenPanelCleanup(combineCleanup(
        bindOutsideDismiss(handleClickOutside),
        bindEscapeDismiss(cancel)
    ));
}

export {
    handleTemplateEdit,
    handleCheckboxEdit,
    handleSelectEdit,
    handleMultiSelectEdit,
    handleRelationEdit,
    handleAssetEdit,
    handleDateEdit,
    handlePopupEdit
};