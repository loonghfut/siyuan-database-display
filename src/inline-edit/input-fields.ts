// 输入元素创建与值转换：把 DOM 输入转换成可写回内核的数据库（AV）值。

import { AttributeViewWriteValue } from "../core/types";

/**
 * 创建文本输入框
 */
export function createTextInput(value: any, type: string): HTMLInputElement {
    const input = document.createElement('input');
    input.type = getInputType(type);
    input.value = String(value || '');
    input.className = 'inline-edit-input';
    return input;
}

export function createTextArea(value: unknown): HTMLTextAreaElement {
    const textarea = document.createElement('textarea');
    textarea.value = String(value ?? '');
    textarea.rows = 1;
    textarea.className = 'inline-edit-input inline-edit-textarea';
    return textarea;
}

/**
 * 创建数字输入框
 */
export function createNumberInput(value: any): HTMLInputElement {
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
export function styleInputElement(element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, keyType?: string) {
    // 复选框特殊处理
    if (keyType === 'checkbox') {
        element.style.width = 'auto';
        element.style.minWidth = 'auto';
        element.style.padding = '0';
    }
}

export function sizeInputToContent(input: HTMLInputElement): void {
    if (input.type === "datetime-local") return;
    input.size = Math.min(32, Math.max(8, input.value.length + 1));
}

export function sizeTextAreaToContent(textarea: HTMLTextAreaElement): void {
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 144)}px`;
    textarea.style.overflowY = textarea.scrollHeight > 144 ? 'auto' : 'hidden';
}

/**
 * 获取输入框的值
 */
export function getInputValue(element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, keyType: string): any {
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
/** 归一化选项值：支持字符串或 { content, color }，颜色为空时由内核按可见内置色取用。 */
function toSelectEntry(value: unknown): { content: string; color: string } {
    if (value && typeof value === 'object') {
        const entry = value as { content?: unknown; color?: unknown };
        return { content: String(entry.content ?? ''), color: String(entry.color ?? '') };
    }
    return { content: String(value ?? ''), color: '' };
}

export function convertToAVValue(keyType: string, value: any): AttributeViewWriteValue {
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
                // 结束时间为空/无效时不写 content2，避免把 null 归一成 0（1970 年）
                const content2 = hasEndDate && value.content2 !== null && value.content2 !== undefined
                    ? Number(value.content2)
                    : undefined;
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
            return { mSelect: value ? [toSelectEntry(value)] : [] };
        case 'mSelect':
            // 多选返回数组，元素可以是字符串或 { content, color }
            const values = Array.isArray(value) ? value : [value];
            return { mSelect: values.filter(v => v).map(toSelectEntry) };
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
export function timestampToDateInput(timestamp: number): string {
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