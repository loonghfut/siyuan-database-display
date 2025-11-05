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
    checkboxOptions?: { style?: 'emoji' | 'symbol' | 'text' },
    forceShowFields: string[] = []
): ContentWithMeta[] {
    const results: ContentWithMeta[] = [];
    const forceShowSet = new Set(forceShowFields.map(name => name.trim()).filter(name => name.length > 0));

    if (!data || !Array.isArray(data)) {
        return results;
    }

    data.forEach(item => {
        const avID = item.avID || '';
        const keyValues = Array.isArray(item.keyValues) ? item.keyValues : [];

        keyValues.forEach(keyValue => {
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
            const values = Array.isArray(keyValue.values) ? keyValue.values : [];
            let hasDisplayedValue = false;

            values.forEach(value => {
                conditions.forEach(condition => {
                    // 检查当前值是否匹配此条件类型
                    if (!valueMatchesCondition(value, condition)) {
                        return;
                    }

                    const texts = getConditionTexts(value, condition, dateOptions, checkboxOptions);
                    if (texts && texts.length) {
                        texts.forEach(t => {
                            if (t !== undefined && t !== null && t !== '') {
                                hasDisplayedValue = true;
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

            if (!hasDisplayedValue && forceShowSet.has(keyName)) {
                const placeholderType = pickConditionForKeyType(keyType, conditions);
                if (placeholderType) {
                    results.push({
                        type: placeholderType,
                        text: keyName,
                        avID,
                        keyID,
                        keyName,
                        keyType,
                        rawValue: null,
                        selectOptions: (keyType === 'select' || keyType === 'mSelect') ? selectOptions : undefined
                    });
                }
            }
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

function pickConditionForKeyType(keyType: string, conditions: string[]): string | undefined {
    if (!keyType || !conditions || !conditions.length) {
        return undefined;
    }
    const normalizedKeyType = String(keyType).toLowerCase();
    const candidates: string[] = [];
    switch (normalizedKeyType) {
        case 'mselect':
        case 'select':
            candidates.push('mSelect');
            break;
        case 'text':
            candidates.push('text');
            break;
        case 'number':
            candidates.push('number');
            break;
        case 'date':
            candidates.push('date');
            break;
        case 'masset':
        case 'asset':
            candidates.push('mAsset');
            break;
        case 'checkbox':
            candidates.push('checkbox');
            break;
        case 'phone':
            candidates.push('phone');
            break;
        case 'url':
            candidates.push('url');
            break;
        case 'email':
            candidates.push('email');
            break;
        case 'created':
            candidates.push('created');
            break;
        case 'updated':
            candidates.push('updated');
            break;
        default:
            candidates.push(keyType);
            break;
    }

    const lowerCandidates = candidates.map(c => c.toLowerCase());
    const matched = conditions.find(condition => lowerCandidates.includes(condition.toLowerCase()));
    return matched;
}
