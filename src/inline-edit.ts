/**
 * 直接编辑模式 - 在字段周围弹出小窗口编辑（伪直接编辑）
 */

import { fetchSyncPost, IWebSocketData, showMessage } from "siyuan";
import { attributeViewRepository } from "./data/attribute-view-repository";
import { AssetReference, AttributeViewRelation, AttributeViewWriteValue } from "./core/types";
import { t } from "./i18n";
import { toErrorMessage } from "./libs/error-utils";
import { openRelationEditor, RelationEditorHandle } from "./ui/relation-editor";
import { assetLabel } from "./ui/asset-utils";
import { createIconButton, iconElement, positionPanelNear } from "./libs/dom";

export interface InlineEditOptions {
    element: HTMLElement;
    avID: string;
    blockID: string;
    itemID: string;
    keyID: string;
    keyName: string;
    keyType: string;
    currentValue: any;
    template?: string;
    selectOptions?: any[];  // 添加选择选项（用于 select 和 mSelect）
    relation?: AttributeViewRelation;
    onSave?: (newValue: any) => void;
    onCancel?: () => void;
}

// 存储当前打开的弹窗引用
let currentPopup: HTMLElement | null = null;
let currentPopupCleanup: (() => void) | null = null;

// 当前打开的选项调色板浮层
let currentPalette: HTMLElement | null = null;
let currentPaletteCleanup: (() => void) | null = null;

const ICONS = {
    cancel: 'iconClose',
    check: 'iconCheck',
    clear: 'iconTrashcan',
    edit: 'iconEdit',
    selected: 'iconSelect',
    add: 'iconAdd',
    file: 'iconFile',
    image: 'iconImage'
} as const;

/**
 * 启用直接编辑模式 - 根据字段类型使用不同的编辑方式
 */
export function enableInlineEdit(options: InlineEditOptions) {
    // 如果已有弹窗打开，先关闭
    if (currentPopup) {
        currentPopupCleanup?.();
        currentPopup.remove();
        currentPopup = null;
        currentPopupCleanup = null;
    }
    closeOptionColorPalette();
    
    // 根据字段类型选择编辑方式
    switch (options.keyType) {
        case 'checkbox':
            // 复选框：直接切换状态
            handleCheckboxEdit(options);
            break;
        case 'select':
            // 单选：显示下拉菜单
            handleSelectEdit(options);
            break;
        case 'mSelect':
            // 多选：显示多选下拉菜单
            handleMultiSelectEdit(options);
            break;
        case 'relation':
            // 关联：使用思源原生关联候选接口
            handleRelationEdit(options);
            break;
        case 'mAsset':
            // 资源：列表增删 + 上传
            handleAssetEdit(options);
            break;
        case 'date':
            // 日期：显示开始/结束时间选择器
            handleDateEdit(options);
            break;
        case 'template':
            // 模板字段编辑的是整列模板表达式，不是当前行的计算结果
            handleTemplateEdit(options);
            break;
        default:
            // 其他类型：显示弹窗编辑
            handlePopupEdit(options);
            break;
    }
}

/**
 * 关闭当前打开的编辑弹窗，并清理残留的关闭动画节点。
 * 供插件卸载（onunload）时调用，避免弹窗泄漏。
 */
export function closeInlineEdit(): void {
    currentPopupCleanup?.();
    currentPopupCleanup = null;
    if (currentPopup) {
        currentPopup.remove();
        currentPopup = null;
    }
    closeOptionColorPalette();
    document.querySelectorAll('.inline-edit-panel--closing').forEach(element => element.remove());
}

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
    currentPopup = dropdown;

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
        if (currentPalette?.contains(target)) return;
        if (!dropdown.contains(target) && !element.contains(target)) {
            closeDropdown(dropdown);
            if (onCancel) onCancel();
        }
    };

    currentPopupCleanup = bindOutsideDismiss(handleClickOutside);
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
    currentPopup = dropdown;

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
        if (currentPalette?.contains(target)) return;
        if (!dropdown.contains(target) && !element.contains(target)) {
            closeDropdown(dropdown);
            if (onCancel) onCancel();
        }
    };

    currentPopupCleanup = bindOutsideDismiss(handleClickOutside);
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
    currentPopup = editor.panel;
    currentPopupCleanup = editor.cleanup;
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
    currentPopup = popup;

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
    currentPopupCleanup = bindOutsideDismiss(handleClickOutside);
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
    currentPopup = datePicker;

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

    currentPopupCleanup = bindOutsideDismiss(handleClickOutside);
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
    currentPopup = popup;
    
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
    currentPopupCleanup = bindOutsideDismiss(handleClickOutside);
}

/**
 * 定位弹窗到元素附近
 */
function positionPopup(popup: HTMLElement, target: HTMLElement) {
    positionPanelNear(popup, target, 5);
}

/**
 * 定位下拉菜单
 */
function positionDropdown(dropdown: HTMLElement, target: HTMLElement) {
    positionPanelNear(dropdown, target, 2);
}

/**
 * 关闭下拉菜单
 */
function closeDropdown(dropdown: HTMLElement) {
    closeEditorPanel(dropdown);
}

function closeEditorPanel(panel: HTMLElement) {
    if (!panel.parentNode) return;
    if (currentPopup === panel) {
        currentPopupCleanup?.();
        currentPopupCleanup = null;
        currentPopup = null;
    }
    closeOptionColorPalette();
    panel.classList.add('inline-edit-panel--closing');
    window.setTimeout(() => panel.remove(), 120);
}

/**
 * 关闭当前打开的选项调色板浮层
 */
function closeOptionColorPalette(): void {
    currentPaletteCleanup?.();
    currentPaletteCleanup = null;
    currentPalette?.remove();
    currentPalette = null;
}

/**
 * 打开选项调色板（思源 14 色调色板，与原生 color__square 一致），
 * 选择后回调应用新颜色并关闭。
 */
function openOptionColorPalette(options: {
    swatch: HTMLElement;
    avID: string;
    keyID: string;
    optionName: string;
    color: string;
    onApplied: (newColor: string) => void;
}): void {
    closeOptionColorPalette();
    const palette = document.createElement('div');
    palette.className = 'inline-edit-palette';
    palette.setAttribute('role', 'dialog');
    palette.setAttribute('aria-label', t('inlineEdit.optionColor'));
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
        palette.appendChild(square);
    }
    document.body.appendChild(palette);
    positionPanelNear(palette, options.swatch, 4);
    currentPalette = palette;
    currentPaletteCleanup = bindOutsideDismiss((event: MouseEvent) => {
        const target = event.target as Node;
        if (!palette.contains(target) && !options.swatch.contains(target)) {
            closeOptionColorPalette();
        }
    });
}

function bindOutsideDismiss(handler: (event: MouseEvent) => void): () => void {
    const timer = window.setTimeout(() => document.addEventListener('mousedown', handler), 100);
    return () => {
        window.clearTimeout(timer);
        document.removeEventListener('mousedown', handler);
    };
}

function prepareEditorPanel(panel: HTMLElement, label: string): void {
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', label);
}

function createPanelHeader(titleText: string, onClose: () => void): HTMLElement {
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

function appendHeaderAction(header: HTMLElement, action: HTMLButtonElement): void {
    header.querySelector<HTMLElement>('.inline-edit-panel__actions')?.appendChild(action);
}

/**
 * 创建选项色块：显示选项颜色（思源调色板索引），点击时回调打开调色板编辑。
 */
function createOptionColorSwatch(color: string | undefined, onColorEdit?: (swatch: HTMLElement) => void): HTMLElement {
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
function createDropdownOption(value: string, text: string, isSelected: boolean, color?: string, onColorEdit?: (swatch: HTMLElement) => void): HTMLElement {
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
function createMultiSelectOption(value: string, text: string, isSelected: boolean, color?: string, onColorEdit?: (swatch: HTMLElement) => void): HTMLElement {
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

/**
 * 创建文本输入框
 */
function createTextInput(value: any, type: string): HTMLInputElement {
    const input = document.createElement('input');
    input.type = getInputType(type);
    input.value = String(value || '');
    input.className = 'inline-edit-input';
    return input;
}

function createTextArea(value: unknown): HTMLTextAreaElement {
    const textarea = document.createElement('textarea');
    textarea.value = String(value ?? '');
    textarea.rows = 1;
    textarea.className = 'inline-edit-input inline-edit-textarea';
    return textarea;
}

/**
 * 创建数字输入框
 */
function createNumberInput(value: any): HTMLInputElement {
    const input = document.createElement('input');
    input.type = 'number';
    // 支持传入原始数字或对象 { content, isNotEmpty }
    if (value && typeof value === 'object' && 'content' in value) {
        input.value = String(value.content ?? '');
    } else if (value !== null && value !== undefined) {
        input.value = String(value);
    } else {
        input.value = '';
    }
    input.className = 'inline-edit-input';
    return input;
}

/**
 * 设置输入元素样式
 */
function styleInputElement(element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, keyType?: string) {
    // 复选框特殊处理
    if (keyType === 'checkbox') {
        element.style.width = 'auto';
        element.style.minWidth = 'auto';
        element.style.padding = '0';
    }
}

function sizeInputToContent(input: HTMLInputElement): void {
    if (input.type === "datetime-local") return;
    input.size = Math.min(32, Math.max(8, input.value.length + 1));
}

function sizeTextAreaToContent(textarea: HTMLTextAreaElement): void {
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 144)}px`;
    textarea.style.overflowY = textarea.scrollHeight > 144 ? 'auto' : 'hidden';
}

/**
 * 获取输入框的值
 */
function getInputValue(element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, keyType: string): any {
    if (element instanceof HTMLSelectElement) {
        if (keyType === 'mSelect') {
            // 多选：返回所有选中的值数组
            const selected = Array.from(element.selectedOptions).map(opt => opt.value);
            return selected;
        } else {
            // 单选：返回选中的值
            return element.value;
        }
    }
    
    if (element instanceof HTMLInputElement) {
        switch (keyType) {
            case 'checkbox':
                return element.checked;
            case 'number':
                return parseFloat(element.value) || 0;
            case 'date':
                return element.value ? new Date(element.value).getTime() : null;
            default:
                return element.value;
        }
    }

    if (element instanceof HTMLTextAreaElement) {
        return element.value;
    }
    
    return '';
}

/**
 * 转换为数据库格式
 */
function convertToAVValue(keyType: string, value: any): AttributeViewWriteValue {
    switch (keyType) {
        case 'text':
            return { text: { content: String(value || '') } };
        case 'number':
            // 支持传入对象 { content, isNotEmpty } 或原始值
            if (value && typeof value === 'object') {
                const content = Number(value.content ?? 0);
                const isNotEmpty = Boolean(value.isNotEmpty);
                return { number: { content: content || 0, isNotEmpty } } as any;
            }
            const content = Number(value) || 0;
            const isNotEmpty = (value !== '' && value !== null && value !== undefined);
            return { number: { content, isNotEmpty } } as any;
        case 'date': {
            // 兼容数值与对象两种输入
            if (value && typeof value === 'object') {
                const content = Number(value.content ?? 0);
                const hasEndDate = Boolean(value.hasEndDate);
                const content2 = hasEndDate ? Number(value.content2 ?? 0) : undefined;
                return { date: { content, isNotTime: Boolean(value.isNotTime) || false, hasEndDate, content2 } } as any;
            }
            return { date: { content: Number(value ?? 0), isNotTime: false } };
        }
        case 'url':
            return { url: { content: String(value || '') } };
        case 'email':
            return { email: { content: String(value || '') } };
        case 'phone':
            return { phone: { content: String(value || '') } };
        case 'checkbox':
            return { checkbox: { checked: Boolean(value) } };
        case 'select':
            // 单选也使用 mSelect 格式（单个元素的数组）
            return { mSelect: value ? [{ content: String(value), color: '' }] : [] };
        case 'mSelect':
            // 多选返回数组
            const values = Array.isArray(value) ? value : [value];
            return { mSelect: values.filter(v => v).map(v => ({ content: String(v), color: '' })) };
        default:
            return { text: { content: String(value || '') } };
    }
}

/**
 * 获取 input type
 */
function getInputType(keyType: string): string {
    switch (keyType) {
        case 'url':
            return 'url';
        case 'email':
            return 'email';
        case 'phone':
            return 'tel';
        default:
            return 'text';
    }
}

/**
 * 时间戳转换为 datetime-local 格式
 */
function timestampToDateInput(timestamp: number): string {
    if (!timestamp) return '';
    
    const ts = timestamp > 10000000000 ? timestamp : timestamp * 1000;
    const date = new Date(ts);
    
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    
    return `${year}-${month}-${day}T${hours}:${minutes}`;
}
