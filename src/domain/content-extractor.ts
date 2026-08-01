import { AttributeViewTable, AttributeViewValue, CheckboxStyle, DateFormat, DisplayItem, FieldType, RelationValue } from "@/core/types";
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

function normalizeRelation(value: AttributeViewValue): RelationValue {
    const relation = value.relation as unknown;
    if (Array.isArray(relation)) {
        const legacy = relation as Array<{ blockID?: unknown; content?: unknown }>;
        const blockIDs = legacy.map(item => String(item?.blockID || "")).filter(Boolean);
        const contents = legacy.map(item => ({
            type: "block" as const,
            block: { id: String(item?.blockID || ""), content: String(item?.content || "") },
            isDetached: true
        }));
        return { blockIDs, contents };
    }
    if (!relation || typeof relation !== "object") return { blockIDs: [], contents: [] };
    const current = relation as RelationValue;
    return {
        blockIDs: Array.isArray(current.blockIDs) ? current.blockIDs.filter(Boolean) : [],
        contents: Array.isArray(current.contents) ? current.contents : []
    };
}

function relationTexts(relation: RelationValue): string[] {
    const blockIDs = relation.blockIDs || [];
    const contents = relation.contents || [];
    const length = Math.max(blockIDs.length, contents.length);
    return Array.from({ length }, (_, index) => contents[index]?.block?.content || blockIDs[index] || "")
        .filter(Boolean);
}

function mergeRelations(values: AttributeViewValue[]): RelationValue {
    const blockIDs: string[] = [];
    const contents: NonNullable<RelationValue["contents"]> = [];
    values.forEach(value => {
        const relation = normalizeRelation(value);
        (relation.blockIDs || []).forEach(blockID => {
            if (!blockIDs.includes(blockID)) blockIDs.push(blockID);
        });
        contents.push(...(relation.contents || []));
    });
    return { blockIDs, contents };
}

function rawValue(value: AttributeViewValue, type: FieldType): unknown {
    if (type === "mSelect") return value.mSelect?.map(item => item.content).filter(Boolean) || [];
    if (type === "checkbox") return Boolean(value.checkbox?.checked);
    if (type === "date") return value.date ? { ...value.date } : null;
    if (type === "relation") return normalizeRelation(value);
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
        case "relation": return relationTexts(normalizeRelation(value));
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
    if (type === "relation") {
        const relation = normalizeRelation(value);
        return Boolean(relation.blockIDs?.length || relation.contents?.length);
    }
    return Boolean((value[type as keyof AttributeViewValue] as { content?: unknown } | undefined)?.content);
}

function displayType(keyType: string, types: FieldType[]): FieldType | undefined {
    const normalized = keyType === "select" ? "mSelect" : keyType;
    return types.find(type => type.toLowerCase() === normalized.toLowerCase());
}

function isSelectKey(keyType: string): boolean {
    return keyType === "select" || keyType === "mSelect";
}

export function extractDisplayItems(tables: AttributeViewTable[], types: FieldType[], config: DisplayConfig): DisplayItem[] {
    const result: DisplayItem[] = [];
    for (const table of tables || []) {
        for (const keyValue of table.keyValues || []) {
            const key = keyValue.key;
            if (!key || config.hiddenFields.has(key.name)) continue;

            // Select values are represented by one database property, even when
            // multiple options are selected. Keep that relationship intact so
            // rendering and editing both operate on one independent item.
            if (isSelectKey(key.type)) {
                const selected = (keyValue.values || [])
                    .flatMap(value => texts(value, "mSelect", config));
                if (types.includes("mSelect") && selected.length > 0) {
                    result.push({
                        type: "mSelect",
                        text: selected.join("、"),
                        avID: table.avID,
                        keyID: key.id,
                        keyName: key.name,
                        keyType: key.type,
                        rawValue: selected,
                        selectOptions: key.options
                    });
                } else if (config.forceShowFields.has(key.name) && types.includes("mSelect")) {
                    result.push({ type: "mSelect", text: key.name, avID: table.avID, keyID: key.id, keyName: key.name, keyType: key.type, rawValue: [], selectOptions: key.options });
                }
                continue;
            }

            if (key.type === "relation") {
                const relation = mergeRelations(keyValue.values || []);
                const selected = relationTexts(relation);
                if (types.includes("relation") && selected.length > 0) {
                    result.push({
                        type: "relation",
                        text: selected.join("、"),
                        avID: table.avID,
                        keyID: key.id,
                        keyName: key.name,
                        keyType: key.type,
                        rawValue: relation,
                        relation: key.relation
                    });
                } else if (config.forceShowFields.has(key.name) && types.includes("relation")) {
                    result.push({
                        type: "relation",
                        text: key.name,
                        avID: table.avID,
                        keyID: key.id,
                        keyName: key.name,
                        keyType: key.type,
                        rawValue: { blockIDs: [], contents: [] },
                        relation: key.relation
                    });
                }
                continue;
            }

            let shown = false;
            for (const value of keyValue.values || []) {
                for (const type of types) {
                    if (!matches(value, type)) continue;
                    for (const text of texts(value, type, config)) {
                        shown = true;
                        result.push({ type, text, avID: table.avID, keyID: key.id, keyName: key.name, keyType: key.type, rawValue: rawValue(value, type), selectOptions: key.options, relation: key.relation });
                    }
                }
            }
            if (!shown && config.forceShowFields.has(key.name)) {
                const type = displayType(key.type, types);
                if (type) result.push({ type, text: key.name, avID: table.avID, keyID: key.id, keyName: key.name, keyType: key.type, rawValue: null, selectOptions: key.options, relation: key.relation });
            }
        }
    }
    return result;
}
