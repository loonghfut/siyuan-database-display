/**
 * 直接编辑模式 - 在字段周围弹出小窗口编辑（伪直接编辑）
 */

import { showMessage } from "siyuan";
import { AVManager } from "./db_pro";
import { setAttributeViewValue } from "./db_interface";

export interface InlineEditOptions {
    element: HTMLElement;
    avID: string;
    blockID: string;
    itemID: string;
    keyID: string;
    keyName: string;
    keyType: string;
    currentValue: any;
    selectOptions?: any[];  // 添加选择选项（用于 select 和 mSelect）
    onSave?: (newValue: any) => void;
    onCancel?: () => void;
}

// 存储当前打开的弹窗引用
let currentPopup: HTMLElement | null = null;

/**
 * 启用直接编辑模式 - 根据字段类型使用不同的编辑方式
 */
export function enableInlineEdit(options: InlineEditOptions) {
    // 如果已有弹窗打开，先关闭
    if (currentPopup) {
        currentPopup.remove();
        currentPopup = null;
    }
    
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
        case 'date':
            // 日期：显示日期选择器
            handleDateEdit(options);
            break;
        default:
            // 其他类型：显示弹窗编辑
            handlePopupEdit(options);
            break;
    }
}

/**
 * 处理复选框直接切换
 */
async function handleCheckboxEdit(options: InlineEditOptions) {
    const { avID, blockID, itemID, keyName, currentValue, onSave } = options;
    
    // 直接切换状态
    const newValue = !Boolean(currentValue);
    
    try {
        const avManager = new AVManager();
        const value = convertToAVValue('checkbox', newValue);
        
        await avManager.setBlockAttribute(avID, keyName, itemID, value, blockID);
        
        showMessage('保存成功', 2000, 'info');
        
        if (onSave) {
            onSave(newValue);
        }
    } catch (error) {
        console.error('保存失败:', error);
        showMessage('保存失败: ' + error.message, 5000, 'error');
    }
}

/**
 * 处理单选下拉菜单
 */
function handleSelectEdit(options: InlineEditOptions) {
    const { element, avID, blockID, itemID, keyName, currentValue, selectOptions, onSave, onCancel } = options;
    
    // 创建下拉菜单容器
    const dropdown = document.createElement('div');
    dropdown.className = 'inline-edit-dropdown';
    currentPopup = dropdown;
    
    // 创建选项列表
    const optionsList = document.createElement('div');
    optionsList.className = 'inline-edit-dropdown-list';
    
    // 添加空选项
    const emptyOption = createDropdownOption('', '-- 清空 --', currentValue === '' || !currentValue);
    optionsList.appendChild(emptyOption);
    
    // 添加备选项
    (selectOptions || []).forEach(option => {
        // 选项值：优先使用 name，然后 id，最后 content
        const optionId = option.name || option.id || option.content;
        const optionText = option.name || option.content || option.id;
        const isSelected = (optionId === currentValue);
        
        const optionElement = createDropdownOption(optionId, optionText, isSelected);
        optionsList.appendChild(optionElement);
    });
    
    dropdown.appendChild(optionsList);
    document.body.appendChild(dropdown);
    
    // 定位下拉菜单
    positionDropdown(dropdown, element);
    
    // 保存函数
    const save = async (selectedValue: string) => {
        try {
            const avManager = new AVManager();
            const value = convertToAVValue('select', selectedValue);
            
            await avManager.setBlockAttribute(avID, keyName, itemID, value, blockID);
            
            closeDropdown(dropdown);
            showMessage('保存成功', 2000, 'info');
            
            if (onSave) {
                onSave(selectedValue);
            }
        } catch (error) {
            console.error('保存失败:', error);
            showMessage('保存失败: ' + error.message, 5000, 'error');
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
        if (!dropdown.contains(target) && !element.contains(target)) {
            closeDropdown(dropdown);
            if (onCancel) onCancel();
        }
    };
    
    setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside);
    }, 100);
}

/**
 * 处理多选下拉菜单
 */
function handleMultiSelectEdit(options: InlineEditOptions) {
    const { element, avID, blockID, itemID, keyName, currentValue, selectOptions, onSave, onCancel } = options;
    
    // 创建多选容器
    const dropdown = document.createElement('div');
    dropdown.className = 'inline-edit-dropdown inline-edit-dropdown--multi';
    currentPopup = dropdown;
    
    // 当前选中的值
    const selectedValues = new Set(Array.isArray(currentValue) ? currentValue : (currentValue ? [currentValue] : []));
    
    // 创建选项列表
    const optionsList = document.createElement('div');
    optionsList.className = 'inline-edit-dropdown-list';
    
    // 添加备选项（带复选框）
    (selectOptions || []).forEach(option => {
        // 选项值：优先使用 name，然后 id，最后 content
        const optionId = option.name || option.id || option.content;
        const optionText = option.name || option.content || option.id;
        const isSelected = selectedValues.has(optionId);
        
        const optionElement = createMultiSelectOption(optionId, optionText, isSelected);
        optionsList.appendChild(optionElement);
        
        // 点击切换选中状态
        optionElement.addEventListener('click', (e) => {
            e.stopPropagation();
            const checkbox = optionElement.querySelector('input[type="checkbox"]') as HTMLInputElement;
            checkbox.checked = !checkbox.checked;
            
            if (checkbox.checked) {
                selectedValues.add(optionId);
            } else {
                selectedValues.delete(optionId);
            }
        });
    });
    
    dropdown.appendChild(optionsList);
    
    // 添加按钮区域
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'inline-edit-dropdown-buttons';
    
    const saveButton = document.createElement('button');
    saveButton.className = 'inline-edit-dropdown-button inline-edit-dropdown-button--primary';
    saveButton.textContent = '保存';
    
    const cancelButton = document.createElement('button');
    cancelButton.className = 'inline-edit-dropdown-button';
    cancelButton.textContent = '取消';
    
    buttonContainer.appendChild(cancelButton);
    buttonContainer.appendChild(saveButton);
    dropdown.appendChild(buttonContainer);
    
    document.body.appendChild(dropdown);
    
    // 定位下拉菜单
    positionDropdown(dropdown, element);
    
    // 保存函数
    const save = async () => {
        try {
            const values = Array.from(selectedValues);
            const avManager = new AVManager();
            const value = convertToAVValue('mSelect', values);
            
            await avManager.setBlockAttribute(avID, keyName, itemID, value, blockID);
            
            closeDropdown(dropdown);
            showMessage('保存成功', 2000, 'info');
            
            if (onSave) {
                onSave(values);
            }
        } catch (error) {
            console.error('保存失败:', error);
            showMessage('保存失败: ' + error.message, 5000, 'error');
        }
    };
    
    // 按钮事件
    saveButton.addEventListener('click', (e) => {
        e.stopPropagation();
        save();
    });
    
    cancelButton.addEventListener('click', (e) => {
        e.stopPropagation();
        closeDropdown(dropdown);
        if (onCancel) onCancel();
    });
    
    // 点击外部关闭
    const handleClickOutside = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        if (!dropdown.contains(target) && !element.contains(target)) {
            closeDropdown(dropdown);
            if (onCancel) onCancel();
        }
    };
    
    setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside);
    }, 100);
}

/**
 * 处理日期编辑
 */
function handleDateEdit(options: InlineEditOptions) {
    const { element, avID, blockID, itemID, keyName, currentValue, onSave, onCancel } = options;
    
    // 创建日期选择容器
    const datePicker = document.createElement('div');
    datePicker.className = 'inline-edit-datepicker';
    currentPopup = datePicker;
    
    // 创建日期输入框
    const dateInput = document.createElement('input');
    dateInput.type = 'datetime-local';
    dateInput.value = timestampToDateInput(currentValue);
    dateInput.className = 'inline-edit-datepicker-input';
    
    datePicker.appendChild(dateInput);
    
    // 创建按钮区域
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'inline-edit-datepicker-buttons';
    
    const saveButton = document.createElement('button');
    saveButton.className = 'inline-edit-datepicker-button inline-edit-datepicker-button--primary';
    saveButton.textContent = '保存';
    
    const cancelButton = document.createElement('button');
    cancelButton.className = 'inline-edit-datepicker-button';
    cancelButton.textContent = '取消';
    
    buttonContainer.appendChild(cancelButton);
    buttonContainer.appendChild(saveButton);
    datePicker.appendChild(buttonContainer);
    
    document.body.appendChild(datePicker);
    
    // 定位日期选择器
    positionDropdown(datePicker, element);
    
    // 聚焦日期输入框
    setTimeout(() => {
        dateInput.focus();
    }, 10);
    
    // 保存函数
    const save = async () => {
        try {
            const timestamp = dateInput.value ? new Date(dateInput.value).getTime() : null;
            const avManager = new AVManager();
            const value = convertToAVValue('date', timestamp);
            
            await avManager.setBlockAttribute(avID, keyName, itemID, value, blockID);
            
            closeDropdown(datePicker);
            showMessage('保存成功', 2000, 'info');
            
            if (onSave) {
                onSave(timestamp);
            }
        } catch (error) {
            console.error('保存失败:', error);
            showMessage('保存失败: ' + error.message, 5000, 'error');
        }
    };
    
    // 按钮事件
    saveButton.addEventListener('click', (e) => {
        e.stopPropagation();
        save();
    });
    
    cancelButton.addEventListener('click', (e) => {
        e.stopPropagation();
        closeDropdown(datePicker);
        if (onCancel) onCancel();
    });
    
    // 键盘事件
    dateInput.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            save();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            closeDropdown(datePicker);
            if (onCancel) onCancel();
        }
    });
    
    // 点击外部关闭
    const handleClickOutside = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        if (!datePicker.contains(target) && !element.contains(target)) {
            closeDropdown(datePicker);
            if (onCancel) onCancel();
        }
    };
    
    setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside);
    }, 100);
}

/**
 * 处理弹窗编辑（文本、数字等）
 */
function handlePopupEdit(options: InlineEditOptions) {
    const { element, avID, blockID, itemID, keyName, keyType, currentValue, onSave, onCancel } = options;
    
    // 创建弹窗容器
    const popup = document.createElement('div');
    popup.className = 'inline-edit-popup';
    currentPopup = popup;
    
    // 创建弹窗内容
    const popupContent = document.createElement('div');
    popupContent.className = 'inline-edit-popup-content';
    
    // 添加标题
    const title = document.createElement('div');
    title.className = 'inline-edit-popup-title';
    title.textContent = `编辑：${keyName}`;
    popupContent.appendChild(title);
    
    // 创建输入区域
    const inputContainer = document.createElement('div');
    inputContainer.className = 'inline-edit-popup-input';
    
    // 根据字段类型创建输入元素
    let inputElement: HTMLInputElement;
    
    switch (keyType) {
        case 'number':
            inputElement = createNumberInput(currentValue);
            break;
        case 'url':
        case 'email':
        case 'phone':
        case 'text':
        default:
            inputElement = createTextInput(currentValue, keyType);
            break;
    }
    
    styleInputElement(inputElement, keyType);
    inputContainer.appendChild(inputElement);
    popupContent.appendChild(inputContainer);
    
    // 创建按钮区域
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'inline-edit-popup-buttons';
    
    const saveButton = document.createElement('button');
    saveButton.className = 'inline-edit-popup-button inline-edit-popup-button--primary';
    saveButton.textContent = '保存';
    
    const cancelButton = document.createElement('button');
    cancelButton.className = 'inline-edit-popup-button inline-edit-popup-button--secondary';
    cancelButton.textContent = '取消';
    
    buttonContainer.appendChild(cancelButton);
    buttonContainer.appendChild(saveButton);
    popupContent.appendChild(buttonContainer);
    
    popup.appendChild(popupContent);
    document.body.appendChild(popup);
    
    // 定位弹窗
    positionPopup(popup, element);
    
    // 聚焦输入框
    setTimeout(() => {
        inputElement.focus();
        if (inputElement.type === 'text') {
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
            const avManager = new AVManager();
            const value = convertToAVValue(keyType, newValue);
            
            await avManager.setBlockAttribute(avID, keyName, itemID, value, blockID);
            
            // 关闭弹窗
            closePopup();
            
            showMessage('保存成功', 2000, 'info');
            
            if (onSave) {
                onSave(newValue);
            }
        } catch (error) {
            console.error('保存失败:', error);
            showMessage('保存失败: ' + error.message, 5000, 'error');
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
        if (popup && popup.parentNode) {
            popup.remove();
        }
        if (currentPopup === popup) {
            currentPopup = null;
        }
        document.removeEventListener('mousedown', handleClickOutside);
    };
    
    // 事件监听
    saveButton.addEventListener('click', (e) => {
        e.stopPropagation();
        save();
    });
    
    cancelButton.addEventListener('click', (e) => {
        e.stopPropagation();
        cancel();
    });
    
    inputElement.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
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
    setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside);
    }, 100);
}

/**
 * 定位弹窗到元素附近
 */
function positionPopup(popup: HTMLElement, target: HTMLElement) {
    const rect = target.getBoundingClientRect();
    const popupRect = popup.getBoundingClientRect();
    
    // 默认显示在元素下方
    let top = rect.bottom + 5;
    let left = rect.left;
    
    // 检查是否超出视口底部
    if (top + popupRect.height > window.innerHeight) {
        // 显示在元素上方
        top = rect.top - popupRect.height - 5;
    }
    
    // 检查是否超出视口右侧
    if (left + popupRect.width > window.innerWidth) {
        left = window.innerWidth - popupRect.width - 10;
    }
    
    // 检查是否超出视口左侧
    if (left < 10) {
        left = 10;
    }
    
    popup.style.top = `${top}px`;
    popup.style.left = `${left}px`;
}

/**
 * 定位下拉菜单
 */
function positionDropdown(dropdown: HTMLElement, target: HTMLElement) {
    const rect = target.getBoundingClientRect();
    const dropdownRect = dropdown.getBoundingClientRect();
    
    // 默认显示在元素下方
    let top = rect.bottom + 2;
    let left = rect.left;
    
    // 检查是否超出视口底部
    if (top + dropdownRect.height > window.innerHeight) {
        // 显示在元素上方
        top = rect.top - dropdownRect.height - 2;
    }
    
    // 检查是否超出视口右侧
    if (left + dropdownRect.width > window.innerWidth) {
        left = window.innerWidth - dropdownRect.width - 10;
    }
    
    // 检查是否超出视口左侧
    if (left < 10) {
        left = 10;
    }
    
    dropdown.style.top = `${top}px`;
    dropdown.style.left = `${left}px`;
}

/**
 * 关闭下拉菜单
 */
function closeDropdown(dropdown: HTMLElement) {
    if (dropdown && dropdown.parentNode) {
        dropdown.remove();
    }
    if (currentPopup === dropdown) {
        currentPopup = null;
    }
}

/**
 * 创建下拉选项元素
 */
function createDropdownOption(value: string, text: string, isSelected: boolean): HTMLElement {
    const option = document.createElement('div');
    option.className = 'inline-edit-dropdown-option' + (isSelected ? ' inline-edit-dropdown-option--selected' : '');
    option.dataset.value = value;
    option.textContent = text;
    return option;
}

/**
 * 创建多选下拉选项元素
 */
function createMultiSelectOption(value: string, text: string, isSelected: boolean): HTMLElement {
    const option = document.createElement('label');
    option.className = 'inline-edit-dropdown-option inline-edit-dropdown-option--multi';
    
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = isSelected;
    checkbox.dataset.value = value;
    
    const label = document.createElement('span');
    label.textContent = text;
    
    option.appendChild(checkbox);
    option.appendChild(label);
    
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

/**
 * 创建数字输入框
 */
function createNumberInput(value: any): HTMLInputElement {
    const input = document.createElement('input');
    input.type = 'number';
    input.value = String(value || '0');
    input.className = 'inline-edit-input';
    return input;
}

/**
 * 设置输入元素样式
 */
function styleInputElement(element: HTMLInputElement | HTMLSelectElement, keyType?: string) {
    // 复选框特殊处理
    if (keyType === 'checkbox') {
        element.style.width = 'auto';
        element.style.minWidth = 'auto';
        element.style.padding = '0';
    }
}

/**
 * 获取输入框的值
 */
function getInputValue(element: HTMLInputElement | HTMLSelectElement, keyType: string): any {
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
    
    return '';
}

/**
 * 转换为数据库格式
 */
function convertToAVValue(keyType: string, value: any): setAttributeViewValue {
    switch (keyType) {
        case 'text':
            return { text: { content: String(value || '') } };
        case 'number':
            return { number: { content: Number(value) || 0 } };
        case 'date':
            return { date: { content: Number(value), isNotTime: false } };
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
