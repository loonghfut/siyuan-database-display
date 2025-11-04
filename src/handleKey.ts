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
 * @param checkboxOptions 复选框显示选项
 * @returns 返回一个配置好的提取函数
 */
export function createContentExtractor(
    hiddenFields: string[] = [], 
    dateOptions?: DateFormatOptions,
    checkboxOptions?: { style?: 'emoji' | 'symbol' | 'text' }
) {
    return function(data, conditions: string[] = ['mSelect', 'number', 'date', 'text', 'mAsset', 'checkbox', 'phone', 'url', 'email', 'created', 'updated']) {
        return extractContents(data, conditions, hiddenFields, dateOptions, checkboxOptions);
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
    conditions: string[] = ['mSelect', 'number', 'date', 'text', 'mAsset', 'checkbox', 'phone', 'url', 'email', 'created', 'updated'], 
    hiddenFields: string[] = [],
    dateOptions?: DateFormatOptions,
    checkboxOptions?: { style?: 'emoji' | 'symbol' | 'text' }
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
                    handleCondition(value, condition, contents, dateOptions, checkboxOptions);
                });
            });
        });
    });

    return contents;
}

/**
 * 新增：返回包含类型的内容数组，用于渲染时做配色等高级处理
 * @param data
 * @param conditions
 * @param hiddenFields
 * @param dateOptions
 * @param checkboxOptions
 * @returns Array<{type:string,text:string}>
 */
export function extractContentsWithTypes(
    data,
    conditions: string[] = ['mSelect', 'number', 'date', 'text', 'mAsset', 'checkbox', 'phone', 'url', 'email', 'created', 'updated'],
    hiddenFields: string[] = [],
    dateOptions?: DateFormatOptions,
    checkboxOptions?: { style?: 'emoji' | 'symbol' | 'text' }
): Array<{ type: string; text: string }> {
    const results: Array<{ type: string; text: string }> = [];

    data.forEach(item => {
        item.keyValues.forEach(keyValue => {
            if (hiddenFields.includes(keyValue.key?.name)) {
                return;
            }
            keyValue.values.forEach(value => {
                conditions.forEach(condition => {
                    const texts = getConditionTexts(value, condition, dateOptions, checkboxOptions);
                    if (texts && texts.length) {
                        texts.forEach(t => {
                            if (t !== undefined && t !== null && t !== '') {
                                results.push({ type: condition, text: String(t) });
                            }
                        });
                    }
                });
            });
        });
    });

    return results;
}

/**
 * 返回某个 condition 下该 value 产生的全部文本
 */
export function getConditionTexts(
    value,
    condition: string,
    dateOptions?: DateFormatOptions,
    checkboxOptions?: { style?: 'emoji' | 'symbol' | 'text' }
): string[] {
    switch (condition) {
        case 'mSelect':
            if (value.mSelect) return value.mSelect.map(s => s.content).filter(Boolean);
            return [];
        case 'number':
            return value.number?.content ? [value.number.content] : [];
        case 'date':
            if (value.date?.content) {
                const ts1 = value.date.content;
                const includeTime = (dateOptions?.includeTime ?? false) && !(value.date.isNotTime ?? false);
                const opt = { ...(dateOptions || {}), includeTime };
                // 如果有结束时间，显示范围
                if (value.date.hasEndDate && value.date.content2) {
                    const ts2 = value.date.content2;
                    return [`${formatDate(ts1, opt)} ~ ${formatDate(ts2, opt)}`];
                }
                return [formatDate(ts1, opt)];
            }
            return [];
        case 'text':
            return value.text?.content ? [value.text.content] : [];
        case 'mAsset':
            if (value.mAsset) return value.mAsset.map(a => a.name).filter(Boolean);
            return [];
        case 'checkbox':
            if (value.checkbox) {
                const isChecked = value.checkbox.checked;
                return [getCheckboxIcon(isChecked, checkboxOptions?.style)];
            }
            return [];
        case 'phone':
            return value.phone?.content ? [value.phone.content] : [];
        case 'url':
            return value.url?.content ? [value.url.content] : [];
        case 'email':
            return value.email?.content ? [value.email.content] : [];
        case 'created':
            if (value.created?.content) return [formatDate(value.created.content, dateOptions)];
            return [];
        case 'updated':
            if (value.updated?.content) return [formatDate(value.updated.content, dateOptions)];
            return [];
        default:
            return [];
    }
}

export function handleCondition(value, condition, contents, dateOptions?: DateFormatOptions, checkboxOptions?: { style?: 'emoji' | 'symbol' | 'text' }) {
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
            handleCheckbox(value, contents, checkboxOptions);
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
        case 'created':
            handleCreated(value, contents, dateOptions);
            break;
        case 'updated':
            handleUpdated(value, contents, dateOptions);
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

export function handleCheckbox(value, contents, options: { style?: 'emoji' | 'symbol' | 'text' } = {}) {
    if (value.checkbox) {
        outLog("checkbox");
        const isChecked = value.checkbox.checked;
        const style = options.style || 'emoji';
        const displayValue = getCheckboxIcon(isChecked, style);
        
        contents.push(displayValue);
        outLog(`复选框状态: ${isChecked} -> ${displayValue}`);
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

export function handleCreated(value, contents, options: DateFormatOptions = {}) {
    if (value.created?.content) {
        outLog("created");
        const timestamp = value.created.content;
        const formattedDate = formatDate(timestamp, options);
        contents.push(formattedDate);
        outLog(`创建时间格式化: ${timestamp} -> ${formattedDate}`);
    }
}

export function handleUpdated(value, contents, options: DateFormatOptions = {}) {
    if (value.updated?.content) {
        outLog("updated");
        const timestamp = value.updated.content;
        const formattedDate = formatDate(timestamp, options);
        contents.push(formattedDate);
        outLog(`更新时间格式化: ${timestamp} -> ${formattedDate}`);
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
 * 获取复选框图标
 * @param isChecked 是否选中
 * @param style 显示样式
 * @returns 对应的图标或文字
 */
export function getCheckboxIcon(isChecked: boolean, style: 'emoji' | 'symbol' | 'text' = 'emoji'): string {
    switch (style) {
        case 'emoji':
            return isChecked ? '✅' : '❌';
        case 'symbol':
            return isChecked ? '☑' : '☐';
        case 'text':
            return isChecked ? '已选中' : '未选中';
        default:
            return isChecked ? '✅' : '❌';
    }
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
 * // 使用自定义复选框样式
 * const checkboxOptions = { style: 'symbol' }; // ☑ / ☐
 * const contentsWithSymbols = extractContents(data, undefined, [], undefined, checkboxOptions);
 * 
 * // 包含时间戳字段的使用
 * const conditions = ['mSelect', 'text', 'date', 'created', 'updated'];
 * const contentsWithTimestamps = extractContents(data, conditions, []);
 * 
 * // 组合使用多种选项
 * const dateOptions = { format: 'YYYY-MM-DD', includeTime: false };
 * const checkboxOptions = { style: 'emoji' }; // ✅ / ❌
 * const hiddenFields = ['密码'];
 * const allConditions = ['mSelect', 'number', 'date', 'text', 'mAsset', 'checkbox', 'phone', 'url', 'email', 'created', 'updated'];
 * const contents = extractContents(data, allConditions, hiddenFields, dateOptions, checkboxOptions);
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