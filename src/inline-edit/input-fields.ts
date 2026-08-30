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
                const content = Number(value.content ?? 0) || 0;
                const content2 = Number(value.content2 ?? 0) || 0;
                // isNotEmpty 决定内核是否保留时间：内核 UpdateAttributeViewCell 里
                // isNotEmpty 为假时会把 content 清零，缺了这个标记写入的日期会被抹掉。
                // 调用方未显式给出时按 content 是否为 0 推断。
                const isNotEmpty = typeof value.isNotEmpty === 'boolean' ? value.isNotEmpty : content !== 0;
                const isNotEmpty2 = typeof value.isNotEmpty2 === 'boolean' ? value.isNotEmpty2 : content2 !== 0;
                return {
                    date: {
                        content,
                        isNotEmpty,
                        content2,
                        isNotEmpty2,
                        hasEndDate: Boolean(value.hasEndDate),
                        isNotTime: Boolean(value.isNotTime)
                    }
                };
            }
            const content = Number(value ?? 0) || 0;
            return { date: { content, isNotEmpty: content !== 0, content2: 0, isNotEmpty2: false, isNotTime: false } };
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
 * 时间戳归一到毫秒。
 * 内核统一按毫秒存（time.UnixMilli），但历史上出现过秒级值，这里一并兼容。
 */
export function normalizeTimestamp(timestamp: number): number {
    if (!timestamp) return 0;
    return timestamp > 10000000000 ? timestamp : timestamp * 1000;
}

function padTimePart(value: number): string {
    return String(value).padStart(2, '0');
}

/** 毫秒时间戳 → "YYYY-MM-DDTHH:mm"，datetime-local 的输入格式。 */
export function toDateTimeLocal(timestamp: number): string {
    const date = new Date(timestamp);
    return `${date.getFullYear()}-${padTimePart(date.getMonth() + 1)}-${padTimePart(date.getDate())}`
        + `T${padTimePart(date.getHours())}:${padTimePart(date.getMinutes())}`;
}

/** 时间戳转换为 datetime-local 格式，0 与空值得到空串。 */
export function timestampToDateInput(timestamp: number): string {
    return timestamp ? toDateTimeLocal(normalizeTimestamp(timestamp)) : '';
}