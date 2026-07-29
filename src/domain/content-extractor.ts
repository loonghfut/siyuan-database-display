import { AttributeViewTable, AttributeViewValue, CheckboxStyle, DateFormat, DisplayItem, FieldType } from "@/core/types";
import { DisplayConfig } from "@/config/display-config";

function formatDate(value: number, format: DateFormat, includeTime: boolean, isNotTime = false): string {
    const date = new Date(value > 10000000000 ? value : value * 1000);
    if (Number.isNaN(date.getTime())) return "";
    if (format === "relative") {
        const days = Math.floor((new Date().getTime() - date.getTime()) / 86400000);
        if (days === 0) return "今天";
        if (days === 1) return "昨天";
        if (days === -1) return "明天";
        return days > 0 ? `${days} 天前` : `${Math.abs(days)} 天后`;
    }
    const parts = { year: String(date.getFullYear()), month: String(date.getMonth() + 1).padStart(2, "0"), day: String(date.getDate()).padStart(2, "0") };
    const content = format === "YYYY/MM/DD" ? `${parts.year}/${parts.month}/${parts.day}`
        : format === "MM/DD/YYYY" ? `${parts.month}/${parts.day}/${parts.year}`
            : format === "DD/MM/YYYY" ? `${parts.day}/${parts.month}/${parts.year}`
                : format === "full" ? date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric", weekday: "long" })
                    : `${parts.year}-${parts.month}-${parts.day}`;
    return includeTime && !isNotTime ? `${content} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}:${String(date.getSeconds()).padStart(2, "0")}` : content;
}

function checkboxText(checked: boolean, style: CheckboxStyle): string {
    if (style === "symbol") return checked ? "☑" : "☐";
    if (style === "text") return checked ? "已选中" : "未选中";
    return checked ? "✅" : "❌";
}

function rawValue(value: AttributeViewValue, type: FieldType): unknown {
    if (type === "mSelect") return value.mSelect?.map(item => item.content).filter(Boolean) || [];
    if (type === "checkbox") return Boolean(value.checkbox?.checked);
    if (type === "date") return value.date ? { ...value.date } : null;
    const field = value[type as keyof AttributeViewValue] as { content?: unknown } | undefined;
    return field?.content ?? "";
}

function texts(value: AttributeViewValue, type: FieldType, config: DisplayConfig): string[] {
    switch (type) {
        case "mSelect": return value.mSelect?.map(item => item.content || "").filter(Boolean) || [];
        case "number": return value.number?.content !== undefined ? [String(value.number.content)] : [];
        case "date": {
            if (!value.date?.content) return [];
            const start = formatDate(value.date.content, config.dateFormat, config.includeTime, value.date.isNotTime);
            const end = value.date.hasEndDate && value.date.content2 ? formatDate(value.date.content2, config.dateFormat, config.includeTime, value.date.isNotTime) : "";
            return [end ? `${start} ~ ${end}` : start].filter(Boolean);
        }
        case "text": return value.text?.content ? [value.text.content] : [];
        case "mAsset": return value.mAsset?.map(item => item.name || "").filter(Boolean) || [];
        case "checkbox": return value.checkbox ? [checkboxText(Boolean(value.checkbox.checked), config.checkboxStyle)] : [];
        case "phone": return value.phone?.content ? [value.phone.content] : [];
        case "url": return value.url?.content ? [value.url.content] : [];
        case "email": return value.email?.content ? [value.email.content] : [];
        case "created": return value.created?.content ? [formatDate(value.created.content, config.dateFormat, config.includeTime)] : [];
        case "updated": return value.updated?.content ? [formatDate(value.updated.content, config.dateFormat, config.includeTime)] : [];
    }
}

function matches(value: AttributeViewValue, type: FieldType): boolean {
    if (type === "number") return value.number?.content !== undefined;
    if (type === "checkbox") return Boolean(value.checkbox);
    if (type === "mSelect" || type === "mAsset") return Boolean(value[type]);
    return Boolean((value[type as keyof AttributeViewValue] as { content?: unknown } | undefined)?.content);
}

function displayType(keyType: string, types: FieldType[]): FieldType | undefined {
    const normalized = keyType === "select" ? "mSelect" : keyType;
    return types.find(type => type.toLowerCase() === normalized.toLowerCase());
}

export function extractDisplayItems(tables: AttributeViewTable[], types: FieldType[], config: DisplayConfig): DisplayItem[] {
    const visibleTypes = config.showTimestamps ? types : types.filter(type => type !== "created" && type !== "updated");
    const result: DisplayItem[] = [];
    for (const table of tables || []) {
        for (const keyValue of table.keyValues || []) {
            const key = keyValue.key;
            if (!key || config.hiddenFields.has(key.name)) continue;
            let shown = false;
            for (const value of keyValue.values || []) {
                for (const type of visibleTypes) {
                    if (!matches(value, type)) continue;
                    for (const text of texts(value, type, config)) {
                        shown = true;
                        result.push({ type, text, avID: table.avID, keyID: key.id, keyName: key.name, keyType: key.type, rawValue: rawValue(value, type), selectOptions: key.options });
                    }
                }
            }
            if (!shown && config.forceShowFields.has(key.name)) {
                const type = displayType(key.type, visibleTypes);
                if (type) result.push({ type, text: key.name, avID: table.avID, keyID: key.id, keyName: key.name, keyType: key.type, rawValue: null, selectOptions: key.options });
            }
        }
    }
    return result;
}
