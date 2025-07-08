import { outLog } from "./index";

/**
 * 日期格式化选项
 */
export interface DateFormatOptions {
    format?: 'YYYY-MM-DD' | 'YYYY/MM/DD' | 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'full' | 'relative';
    includeTime?: boolean;
    locale?: string;
}

/**
 * 格式化日期的辅助函数
 * @param timestamp 时间戳（秒或毫秒）
 * @param options 格式化选项
 * @returns 格式化后的日期字符串
 */
export function formatDate(timestamp: number, options: DateFormatOptions = {}): string {
    const {
        format = 'YYYY-MM-DD',
        includeTime = false,
        locale = 'zh-CN'
    } = options;

    try {
        // 判断时间戳的类型（秒或毫秒）
        const date = new Date(timestamp > 10000000000 ? timestamp : timestamp * 1000);
        
        // 检查日期是否有效
        if (isNaN(date.getTime())) {
            return `无效日期: ${timestamp}`;
        }

        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');

        let dateStr = '';
        switch (format) {
            case 'YYYY-MM-DD':
                dateStr = `${year}-${month}-${day}`;
                break;
            case 'YYYY/MM/DD':
                dateStr = `${year}/${month}/${day}`;
                break;
            case 'MM/DD/YYYY':
                dateStr = `${month}/${day}/${year}`;
                break;
            case 'DD/MM/YYYY':
                dateStr = `${day}/${month}/${year}`;
                break;
            case 'full':
                dateStr = date.toLocaleDateString(locale, {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    weekday: 'long'
                });
                break;
            case 'relative':
                const now = new Date();
                const diffMs = now.getTime() - date.getTime();
                const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                
                if (diffDays === 0) {
                    dateStr = '今天';
                } else if (diffDays === 1) {
                    dateStr = '昨天';
                } else if (diffDays === -1) {
                    dateStr = '明天';
                } else if (diffDays > 0) {
                    dateStr = `${diffDays} 天前`;
                } else {
                    dateStr = `${Math.abs(diffDays)} 天后`;
                }
                break;
            default:
                dateStr = `${year}-${month}-${day}`;
        }

        if (includeTime && format !== 'relative') {
            dateStr += ` ${hours}:${minutes}:${seconds}`;
        }

        return dateStr;
    } catch (error) {
        return `日期错误: ${timestamp}`;
    }
}

/**
 * 创建一个带有隐藏字段功能的内容提取器
 * @param hiddenFields 要隐藏的字段名称数组
 * @param dateOptions 日期格式化选项
 * @returns 返回一个配置好的提取函数
 */
export function createContentExtractor(hiddenFields: string[] = [], dateOptions?: DateFormatOptions) {
    return function(data, conditions: string[] = ['mSelect', 'number', 'date', 'text', 'mAsset', 'checkbox', 'phone', 'url', 'email']) {
        return extractContents(data, conditions, hiddenFields, dateOptions);
    };
}

/**
 * 检查字段是否应该被隐藏
 * @param fieldName 字段名称
 * @param hiddenFields 隐藏字段列表
 * @returns 如果字段应该被隐藏返回 true，否则返回 false
 */
export function isFieldHidden(fieldName: string, hiddenFields: string[]): boolean {
    return hiddenFields.includes(fieldName);
}

export function extractContents(
    data, 
    conditions: string[] = ['mSelect', 'number', 'date', 'text', 'mAsset', 'checkbox', 'phone', 'url', 'email'], 
    hiddenFields: string[] = [],
    dateOptions?: DateFormatOptions
) {
    const contents = [];

    data.forEach(item => {
        item.keyValues.forEach(keyValue => {
            // 检查字段名称是否在隐藏列表中
            if (hiddenFields.includes(keyValue.key?.name)) {
                outLog(`字段 "${keyValue.key?.name}" 已被隐藏，跳过处理`);
                return; // 跳过这个字段的处理
            }

            keyValue.values.forEach(value => {
                conditions.forEach(condition => {
                    handleCondition(value, condition, contents, dateOptions);
                });
            });
        });
    });

    return contents;
}

export function handleCondition(value, condition, contents, dateOptions?: DateFormatOptions) {
    switch (condition) {
        case 'mSelect':
            handleMSelect(value, contents);
            break;
        case 'number':
            handleNumber(value, contents);
            break;
        case 'date':
            handleDate(value, contents, dateOptions);
            break;
        case 'text':
            handleText(value, contents);
            break;
        case 'mAsset':
            handleMAsset(value, contents);
            break;
        case 'checkbox':
            handleCheckbox(value, contents);
            break;
        case 'phone':
            handlePhone(value, contents);
            break;
        case 'url':
            handleUrl(value, contents);
            break;
        case 'email':
            handleEmail(value, contents);
            break;
        default:
            break;
    }
}


export function handleMSelect(value, contents) {
    if (value.mSelect) {
        outLog("mSelect");
        value.mSelect.forEach(select => {
            contents.push(select.content);
        });
    }
}

export function handleNumber(value, contents) {
    if (value.number?.content) {
        outLog("number");
        contents.push(value.number.content);
    }
}

export function handleDate(value, contents, options: DateFormatOptions = {}) {
    if (value.date?.content) {
        outLog("date");
        const timestamp = value.date.content;
        const formattedDate = formatDate(timestamp, options);
        contents.push(formattedDate);
        outLog(`日期格式化: ${timestamp} -> ${formattedDate}`);
    }
}

export function handleText(value, contents) {
    if (value.text?.content) {
        outLog("text");
        contents.push(value.text.content);
    }
}

export function handleMAsset(value, contents) {
    if (value.mAsset) {
        outLog("mAsset");
        value.mAsset.forEach(asset => {
            contents.push(asset.name);
        });
    }
}

export function handleCheckbox(value, contents) {
    if (value.checkbox) {
        outLog("checkbox");
        contents.push(value.checkbox.checked);
    }
}

export function handlePhone(value, contents) {
    if (value.phone?.content) {
        outLog("phone");
        contents.push(value.phone.content);
    }
}

export function handleUrl(value, contents) {
    if (value.url?.content) {
        outLog("url");
        contents.push(value.url.content);
    }
}

export function handleEmail(value, contents) {
    if (value.email?.content) {
        outLog("email");
        contents.push(value.email.content);
    }
}

/**
 * 验证隐藏字段设置
 * @param hiddenFieldsString 隐藏字段字符串（逗号分隔）
 * @returns 验证结果和清理后的字段数组
 */
export function validateHiddenFields(hiddenFieldsString: string): { 
    isValid: boolean; 
    fields: string[]; 
    errors: string[] 
} {
    const errors: string[] = [];
    const fields: string[] = [];
    
    if (!hiddenFieldsString || hiddenFieldsString.trim() === '') {
        return { isValid: true, fields: [], errors: [] };
    }
    
    const rawFields = hiddenFieldsString.split(',');
    
    for (const field of rawFields) {
        const trimmedField = field.trim();
        if (trimmedField === '') {
            errors.push('发现空字段名称');
            continue;
        }
        
        if (trimmedField.length > 50) {
            errors.push(`字段名称过长: "${trimmedField.substring(0, 20)}..."`);
            continue;
        }
        
        if (fields.includes(trimmedField)) {
            errors.push(`重复的字段名称: "${trimmedField}"`);
            continue;
        }
        
        fields.push(trimmedField);
    }
    
    return {
        isValid: errors.length === 0,
        fields,
        errors
    };
}

/**
 * 使用示例：
 * 
 * // 基本使用 - 隐藏特定字段
 * const data = [...]; // 您的数据
 * const hiddenFields = ['密码', '私人信息', '内部备注']; // 要隐藏的字段名称
 * const contents = extractContents(data, undefined, hiddenFields);
 * 
 * // 使用创建器模式
 * const extractor = createContentExtractor(['密码', '私人信息']);
 * const contents = extractor(data);
 * 
 * // 使用自定义日期格式
 * const dateOptions = { format: 'YYYY/MM/DD', includeTime: true };
 * const contentsWithTime = extractContents(data, undefined, [], dateOptions);
 * 
 * // 使用相对时间格式
 * const relativeOptions = { format: 'relative' };
 * const contentsRelative = extractContents(data, undefined, [], relativeOptions);
 * 
 * // 检查字段是否被隐藏
 * if (isFieldHidden('密码', hiddenFields)) {
 *     console.log('该字段已被隐藏');
 * }
 * 
 * // 验证隐藏字段设置
 * const validation = validateHiddenFields('密码,私人信息,内部备注');
 * if (validation.isValid) {
 *     console.log('隐藏字段设置有效:', validation.fields);
 * } else {
 *     console.error('隐藏字段设置错误:', validation.errors);
 * }
 * 
 * // 直接格式化日期
 * const formattedDate = formatDate(1672531200000, { format: 'full', locale: 'zh-CN' });
 * console.log(formattedDate); // 输出：2023年1月1日星期日
 */