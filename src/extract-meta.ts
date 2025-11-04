/**
 * 从 viewKeys 数据中提取带有完整元数据的内容
 */

import { outLog } from "./index";
import { DateFormatOptions, getConditionTexts } from "./handleKey";

export interface ContentWithMeta {
    type: string;
    text: string;
    // 数据库相关参数
    avID: string;
    keyID: string;
    keyName: string;
    keyType: string;
    // 原始值（用于编辑）
    rawValue: any;
    // 选择选项（用于 select 和 mSelect）
    selectOptions?: any[];
}

/**
 * 从 viewKeys 中提取内容及其完整的元数据
 * @param data viewKeys 数据
 * @param conditions 要提取的字段类型
 * @param hiddenFields 隐藏的字段列表
 * @param dateOptions 日期格式选项
 * @param checkboxOptions 复选框选项
 * @param blockID 当前块 ID
 * @returns 包含元数据的内容数组
 */
export function extractContentsWithMeta(
    data: any,
    conditions: string[],
    hiddenFields: string[],
    dateOptions?: DateFormatOptions,
    checkboxOptions?: { style?: 'emoji' | 'symbol' | 'text' }
): ContentWithMeta[] {
    const results: ContentWithMeta[] = [];

    if (!data || !Array.isArray(data)) {
        return results;
    }

    data.forEach(item => {
        const avID = item.avID || '';
        
        if (!item.keyValues || !Array.isArray(item.keyValues)) {
            return;
        }

        item.keyValues.forEach(keyValue => {
            const key = keyValue.key;
            if (!key) return;

            // 检查字段是否被隐藏
            if (hiddenFields.includes(key.name)) {
                outLog(`字段 "${key.name}" 已被隐藏，跳过处理`);
                return;
            }

            const keyID = key.id;
            const keyName = key.name;
            const keyType = key.type;
            const selectOptions = key.options || [];  // 获取选择选项

            if (!keyValue.values || !Array.isArray(keyValue.values)) {
                return;
            }

            keyValue.values.forEach(value => {
                conditions.forEach(condition => {
                    // 检查当前值是否匹配此条件类型
                    if (!valueMatchesCondition(value, condition)) {
                        return;
                    }

                    const texts = getConditionTexts(value, condition, dateOptions, checkboxOptions);
                    if (texts && texts.length) {
                        texts.forEach(t => {
                            if (t !== undefined && t !== null && t !== '') {
                                results.push({
                                    type: condition,
                                    text: String(t),
                                    avID,
                                    keyID,
                                    keyName,
                                    keyType,
                                    rawValue: extractRawValue(value, condition),
                                    selectOptions: (keyType === 'select' || keyType === 'mSelect') ? selectOptions : undefined
                                });
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
 * 检查值是否匹配条件类型
 */
function valueMatchesCondition(value: any, condition: string): boolean {
    switch (condition) {
        case 'mSelect':
            return !!value.mSelect;
        case 'number':
            return value.number?.content !== undefined;
        case 'date':
            return !!value.date?.content;
        case 'text':
            return !!value.text?.content;
        case 'mAsset':
            return !!value.mAsset;
        case 'checkbox':
            return !!value.checkbox;
        case 'phone':
            return !!value.phone?.content;
        case 'url':
            return !!value.url?.content;
        case 'email':
            return !!value.email?.content;
        case 'created':
            return !!value.created?.content;
        case 'updated':
            return !!value.updated?.content;
        default:
            return false;
    }
}

/**
 * 提取原始值（用于编辑时回填）
 */
function extractRawValue(value: any, condition: string): any {
    switch (condition) {
        case 'text':
            return value.text?.content || '';
        case 'number':
            return value.number?.content || 0;
        case 'date':
            if (value.date) {
                return {
                    content: value.date.content ?? null,
                    hasEndDate: value.date.hasEndDate ?? false,
                    isNotTime: value.date.isNotTime ?? false,
                    content2: value.date.content2 ?? null
                };
            }
            return null;
        case 'url':
            return value.url?.content || '';
        case 'email':
            return value.email?.content || '';
        case 'phone':
            return value.phone?.content || '';
        case 'checkbox':
            return value.checkbox?.checked || false;
        case 'mSelect':
            if (value.mSelect && Array.isArray(value.mSelect)) {
                return value.mSelect.map((s: any) => s.content);
            }
            return [];
        case 'created':
            return value.created?.content || null;
        case 'updated':
            return value.updated?.content || null;
        default:
            return null;
    }
}
