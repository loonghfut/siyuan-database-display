import { outLog } from "./index";

export function extractContents(data, conditions: string[] = ['mSelect', 'number', 'date', 'text', 'mAsset', 'checkbox', 'phone', 'url', 'email']) {
    const contents = [];

    data.forEach(item => {
        item.keyValues.forEach(keyValue => {
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