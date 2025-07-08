import { outLog } from "./index";

/**
 * 创建一个带有隐藏字段功能的内容提取器
 * @param hiddenFields 要隐藏的字段名称数组
 * @returns 返回一个配置好的提取函数
 */
export function createContentExtractor(hiddenFields: string[] = []) {
    return function(data, conditions: string[] = ['mSelect', 'number', 'date', 'text', 'mAsset', 'checkbox', 'phone', 'url', 'email']) {
        return extractContents(data, conditions, hiddenFields);
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

export function extractContents(data, conditions: string[] = ['mSelect', 'number', 'date', 'text', 'mAsset', 'checkbox', 'phone', 'url', 'email'], hiddenFields: string[] = []) {
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
                    handleCondition(value, condition, contents);
                });
            });
        });
    });

    return contents;
}

export function handleCondition(value, condition, contents) {
    switch (condition) {
        case 'mSelect':
            handleMSelect(value, contents);
            break;
        case 'number':
            handleNumber(value, contents);
            break;
        case 'date':
            handleDate(value, contents);
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

export function handleDate(value, contents) {
    if (value.date?.content) {
        outLog("date");
        const date = new Date(value.date.content);
        date.setDate(date.getDate() + 1); // 手动增加一天
        const formattedDate = date.toISOString().split('T')[0];
        contents.push(formattedDate);
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
 */