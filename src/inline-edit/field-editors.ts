// 各字段类型的直接编辑处理器：按字段类型弹出对应的编辑界面并写回内核。

import { fetchSyncPost, IWebSocketData, showMessage } from "siyuan";
import { attributeViewRepository } from "../data/attribute-view-repository";
import { AssetReference, AttributeViewWriteValue } from "../core/types";
import { t } from "../i18n";
import { toErrorMessage } from "../libs/error-utils";
import { openRelationEditor, RelationEditorHandle } from "../ui/relation-editor";
import { assetLabel } from "../ui/asset-utils";
import { createIconButton, iconElement } from "../libs/dom";
import {
    ICONS,
    prepareEditorPanel,
    createPanelHeader,
    appendHeaderAction,
    createDropdownOption,
    createMultiSelectOption,
    openOptionColorPalette,
    positionPopup,
    positionDropdown,
    closeDropdown,
    closeEditorPanel,
    bindOutsideDismiss,
    setOpenPanel,
    setOpenPanelCleanup,
    isWithinPalette
} from "./popup";
import {
    createTextInput,
    createTextArea,
    createNumberInput,
    styleInputElement,
    sizeInputToContent,
    sizeTextAreaToContent,
    getInputValue,
    convertToAVValue,
    timestampToDateInput
} from "./input-fields";
import type { InlineEditOptions } from "./index";

function handleTemplateEdit(options: InlineEditOptions): void {
    handlePopupEdit({ ...options, currentValue: options.template ?? '' });
}

/**
 * 处理复选框直接切换
 */
async function handleCheckboxEdit(options: InlineEditOptions) {
    const { avID, itemID, currentValue, onSave } = options;

    // 直接切换状态
    const newValue = !Boolean(currentValue);

    try {
        const value = convertToAVValue('checkbox', newValue);
        await attributeViewRepository.setValue(avID, options.keyID, itemID, value);

        showMessage(t('common.saveSuccess'), 2000, 'info');

        if (onSave) {
            onSave(newValue);
        }
    } catch (error) {
        const message = toErrorMessage(error);
        console.error(t('common.saveFailed', { message }), error);
        showMessage(t('common.saveFailed', { message }), 5000, 'error');
    }
}

/**
 * 处理单选下拉菜单
 */
function handleSelectEdit(options: InlineEditOptions) {
    const { element, avID, itemID, currentValue, selectOptions, onSave, onCancel } = options;
    const selectedValue = Array.isArray(currentValue) ? currentValue[0] : currentValue;

    // 创建下拉菜单容器
    const dropdown = document.createElement('div');
    dropdown.className = 'inline-edit-dropdown';
    prepareEditorPanel(dropdown, options.keyName);
    setOpenPanel(dropdown);

    // 创建选项列表
    const optionsList = document.createElement('div');
    optionsList.className = 'inline-edit-dropdown-list';

    const header = createPanelHeader(options.keyName, () => {
        closeDropdown(dropdown);
        onCancel?.();
    });
    dropdown.appendChild(header);

    // 修改选项颜色：写回内核并刷新选项列表与文档显示
    const editOptionColor = (option: any) => (swatch: HTMLElement) => {
        const optionName = String(option.name || option.content || option.id || '');
        openOptionColorPalette({
            swatch,
            avID,
            keyID: options.keyID,
            optionName,
            color: String(option.color || ''),
            onApplied: (newColor) => {
                void (async () => {
                    try {
                        await attributeViewRepository.updateSelectOptionColor(avID, options.keyID, optionName, String(option.color || ''), newColor);
                        option.color = newColor;
                        renderOptions();
                        showMessage(t('common.saveSuccess'), 2000, 'info');
                        onSave?.(selectedValue);
                    } catch (error) {
                        const message = toErrorMessage(error);
                        console.error(t('common.saveFailed', { message }), error);
                        showMessage(t('common.saveFailed', { message }), 5000, 'error');
                    }
                })();
            }
        });
    };

    const renderOptions = () => {
        optionsList.replaceChildren();
        // 添加空选项
        const emptyOption = createDropdownOption('', t('common.clear'), selectedValue === '' || !selectedValue);
        optionsList.appendChild(emptyOption);
        // 添加备选项
        (selectOptions || []).forEach(option => {
            // 选项值：优先使用 name，然后 id，最后 content
            const optionId = option.name || option.id || option.content;
            const optionText = option.name || option.content || option.id;
            const isSelected = (optionId === selectedValue);
            const optionElement = createDropdownOption(optionId, optionText, isSelected, option.color, editOptionColor(option));
            optionsList.appendChild(optionElement);
        });
    };
    renderOptions();

    dropdown.appendChild(optionsList);
    document.body.appendChild(dropdown);

    // 定位下拉菜单
    positionDropdown(dropdown, element);

    // 保存函数
    const save = async (selectedValue: string) => {
        try {
            const value = convertToAVValue('select', selectedValue);
            await attributeViewRepository.setValue(avID, options.keyID, itemID, value);

            closeDropdown(dropdown);
            showMessage(t('common.saveSuccess'), 2000, 'info');

            if (onSave) {
                onSave(selectedValue);
            }
        } catch (error) {
            const message = toErrorMessage(error);
            console.error(t('common.saveFailed', { message }), error);
            showMessage(t('common.saveFailed', { message }), 5000, 'error');
        }
    };

    // 点击选项事件
    optionsList.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const optionElement = target.closest('.inline-edit-dropdown-option') as HTMLElement;
        if (optionElement) {
            const value = optionElement.dataset.value || '';
            save(value);
        }
    });

    // 点击外部关闭
    const handleClickOutside = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        if (isWithinPalette(target)) return;
        if (!dropdown.contains(target) && !element.contains(target)) {
            closeDropdown(dropdown);
            if (onCancel) onCancel();
        }
    };

    setOpenPanelCleanup(bindOutsideDismiss(handleClickOutside));
}

/**
 * 处理多选下拉菜单
 */
function handleMultiSelectEdit(options: InlineEditOptions) {
    const { element, avID, itemID, currentValue, selectOptions, onSave, onCancel } = options;

    // 创建多选容器
    const dropdown = document.createElement('div');
    dropdown.className = 'inline-edit-dropdown inline-edit-dropdown--multi';
    prepareEditorPanel(dropdown, options.keyName);
    setOpenPanel(dropdown);

    // 当前选中的值
    const selectedValues = new Set(Array.isArray(currentValue) ? currentValue : (currentValue ? [currentValue] : []));

    // 创建选项列表
    const optionsList = document.createElement('div');
    optionsList.className = 'inline-edit-dropdown-list';

    const header = createPanelHeader(options.keyName, () => {
        closeDropdown(dropdown);
        onCancel?.();
    });
    dropdown.appendChild(header);

    // 修改选项颜色：写回内核并刷新选项列表与文档显示
    const editOptionColor = (option: any) => (swatch: HTMLElement) => {
        const optionName = String(option.name || option.content || option.id || '');
        openOptionColorPalette({
            swatch,
            avID,
            keyID: options.keyID,
            optionName,
            color: String(option.color || ''),
            onApplied: (newColor) => {
                void (async () => {
                    try {
                        await attributeViewRepository.updateSelectOptionColor(avID, options.keyID, optionName, String(option.color || ''), newColor);
                        option.color = newColor;
                        renderOptions();
                        showMessage(t('common.saveSuccess'), 2000, 'info');
                        onSave?.(Array.from(selectedValues));
                    } catch (error) {
                        const message = toErrorMessage(error);
                        console.error(t('common.saveFailed', { message }), error);
                        showMessage(t('common.saveFailed', { message }), 5000, 'error');
                    }
                })();
            }
        });
    };

    // 添加备选项（带复选框）
    const renderOptions = () => {
        optionsList.replaceChildren();
        (selectOptions || []).forEach(option => {
            // 选项值：优先使用 name，然后 id，最后 content
            const optionId = option.name || option.id || option.content;
            const optionText = option.name || option.content || option.id;
            const isSelected = selectedValues.has(optionId);

            const optionElement = createMultiSelectOption(optionId, optionText, isSelected, option.color, editOptionColor(option));
            optionsList.appendChild(optionElement);

            // 点击切换选中状态
            optionElement.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const checkbox = optionElement.querySelector('input[type="checkbox"]') as HTMLInputElement;
                checkbox.checked = !checkbox.checked;
                optionElement.classList.toggle('inline-edit-dropdown-option--selected', checkbox.checked);

                if (checkbox.checked) {
                    selectedValues.add(optionId);
                } else {
                    selectedValues.delete(optionId);
                }
            });
        });
    };
    renderOptions();

    dropdown.appendChild(optionsList);

    const saveButton = createIconButton(ICONS.check, t('common.save'), 'inline-edit-action inline-edit-action--primary');
    appendHeaderAction(header, saveButton);

    document.body.appendChild(dropdown);

    // 定位下拉菜单
    positionDropdown(dropdown, element);

    // 保存函数
    const save = async () => {
        try {
            const values = Array.from(selectedValues);
            const value = convertToAVValue('mSelect', values);
            await attributeViewRepository.setValue(avID, options.keyID, itemID, value);

            closeDropdown(dropdown);
            showMessage(t('common.saveSuccess'), 2000, 'info');

            if (onSave) {
                onSave(values);
            }
        } catch (error) {
            const message = toErrorMessage(error);
            console.error(t('common.saveFailed', { message }), error);
            showMessage(t('common.saveFailed', { message }), 5000, 'error');
        }
    };

    // 按钮事件
    saveButton.addEventListener('click', (e) => {
        e.stopPropagation();
        save();
    });

    // 点击外部关闭
    const handleClickOutside = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        if (isWithinPalette(target)) return;
        if (!dropdown.contains(target) && !element.contains(target)) {
            closeDropdown(dropdown);
            if (onCancel) onCancel();
        }
    };

    setOpenPanelCleanup(bindOutsideDismiss(handleClickOutside));
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
        onSave: () => options.onSave?.(options.currentValue),
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
            showMessage(t('common.saveFailed', { message }), 5000, 'error');
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
            showMessage(t('common.saveSuccess'), 2000, 'info');
            onSave?.(assets);
        } catch (error) {
            const message = toErrorMessage(error);
            console.error(t('common.saveFailed', { message }), error);
            showMessage(t('common.saveFailed', { message }), 5000, 'error');
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
    setOpenPanelCleanup(bindOutsideDismiss(handleClickOutside));
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

/**
 * 处理日期编辑
 */
function handleDateEdit(options: InlineEditOptions) {
    const { element, avID, itemID, currentValue, onSave, onCancel } = options;

    // 归一化当前值
    const current = (currentValue && typeof currentValue === 'object')
        ? currentValue
        : { content: currentValue ?? null, hasEndDate: false, content2: null, isNotTime: false };

    // 创建日期选择容器
    const datePicker = document.createElement('div');
    datePicker.className = 'inline-edit-datepicker';
    prepareEditorPanel(datePicker, options.keyName);
    setOpenPanel(datePicker);

    const header = createPanelHeader(options.keyName, () => {
        closeDropdown(datePicker);
        onCancel?.();
    });
    datePicker.appendChild(header);

    // 开始时间
    const startWrap = document.createElement('div');
    startWrap.className = 'inline-edit-datepicker-row';
    const startLabel = document.createElement('label');
    startLabel.className = 'inline-edit-datepicker-label';
    startLabel.textContent = t('inlineEdit.start') || 'Start';
    const startInput = document.createElement('input');
    startInput.type = 'datetime-local';
    startInput.value = timestampToDateInput(current.content);
    startInput.className = 'inline-edit-datepicker-input';
    startWrap.appendChild(startLabel);
    startWrap.appendChild(startInput);

    // 是否有结束时间
    const rangeWrap = document.createElement('div');
    rangeWrap.className = 'inline-edit-datepicker-row inline-edit-datepicker-row--single';
    const rangeLabel = document.createElement('label');
    rangeLabel.className = 'inline-edit-datepicker-label inline-edit-datepicker-label--checkbox';
    const rangeCheckbox = document.createElement('input');
    rangeCheckbox.type = 'checkbox';
    rangeCheckbox.checked = Boolean(current.hasEndDate && current.content2);
    rangeLabel.appendChild(rangeCheckbox);
    rangeLabel.appendChild(document.createTextNode(' ' + (t('inlineEdit.hasEnd') || 'Has end')));
    rangeWrap.appendChild(rangeLabel);

    // 结束时间
    const endWrap = document.createElement('div');
    endWrap.className = 'inline-edit-datepicker-row';
    const endLabel = document.createElement('label');
    endLabel.className = 'inline-edit-datepicker-label';
    endLabel.textContent = t('inlineEdit.end') || 'End';
    const endInput = document.createElement('input');
    endInput.type = 'datetime-local';
    endInput.value = timestampToDateInput(current.content2);
    endInput.className = 'inline-edit-datepicker-input';
    endWrap.style.display = rangeCheckbox.checked ? '' : 'none';
    endWrap.appendChild(endLabel);
    endWrap.appendChild(endInput);

    // 同步禁用状态
    rangeCheckbox.addEventListener('change', () => {
        endWrap.style.display = rangeCheckbox.checked ? '' : 'none';
    });

    datePicker.appendChild(startWrap);
    datePicker.appendChild(rangeWrap);
    datePicker.appendChild(endWrap);

    const saveButton = createIconButton(ICONS.check, t('common.save'), 'inline-edit-action inline-edit-action--primary');
    appendHeaderAction(header, saveButton);

    document.body.appendChild(datePicker);

    // 定位日期选择器
    positionDropdown(datePicker, element);

    // 聚焦开始时间
    setTimeout(() => {
        startInput.focus();
    }, 10);

    // 保存函数
    const save = async () => {
        try {
            const startTs = startInput.value ? new Date(startInput.value).getTime() : null;
            const hasEnd = rangeCheckbox.checked;
            const endTs = hasEnd && endInput.value ? new Date(endInput.value).getTime() : null;

            const value = convertToAVValue('date', { content: startTs, hasEndDate: hasEnd, content2: endTs, isNotTime: false });
            await attributeViewRepository.setValue(avID, options.keyID, itemID, value);

            closeDropdown(datePicker);
            showMessage(t('common.saveSuccess'), 2000, 'info');

            if (onSave) {
                onSave({ content: startTs, hasEndDate: hasEnd, content2: endTs });
            }
        } catch (error) {
            const message = toErrorMessage(error);
            console.error(t('common.saveFailed', { message }), error);
            showMessage(t('common.saveFailed', { message }), 5000, 'error');
        }
    };

    // 按钮事件
    saveButton.addEventListener('click', (e) => {
        e.stopPropagation();
        save();
    });

    // 键盘事件
    [startInput, endInput].forEach(input => {
        input.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                save();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                closeDropdown(datePicker);
                if (onCancel) onCancel();
            }
        });
    });

    // 点击外部关闭
    const handleClickOutside = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        if (!datePicker.contains(target) && !element.contains(target)) {
            closeDropdown(datePicker);
            if (onCancel) onCancel();
        }
    };

    setOpenPanelCleanup(bindOutsideDismiss(handleClickOutside));
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

            showMessage(t('common.saveSuccess'), 2000, 'info');

            if (onSave) {
                onSave(newValue);
            }
        } catch (error) {
            const message = toErrorMessage(error);
            console.error(t('common.saveFailed', { message }), error);
            showMessage(t('common.saveFailed', { message }), 5000, 'error');
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

    // 点击弹窗外部关闭
    const handleClickOutside = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        if (!popup.contains(target) && !element.contains(target)) {
            cancel();
        }
    };

    // 延迟添加点击外部监听器
    setOpenPanelCleanup(bindOutsideDismiss(handleClickOutside));
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