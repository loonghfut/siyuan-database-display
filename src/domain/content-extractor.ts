import {
    AssetReference,
    AttributeViewKey,
    AttributeViewTable,
    AttributeViewValue,
    BlockReference,
    DateFormat,
    DisplayItem,
    DisplayNavigationTarget,
    DisplaySegment,
    DisplaySource,
    FIELD_TYPES,
    FieldType,
    RelationContent,
    RelationValue,
    SelectOption
} from "@/core/types";
import { DisplayConfig } from "@/config/display-config";
import { resolveFieldRules } from "@/config/field-rules";
import { getAVTextSource } from "@/domain/rich-text";
import { t } from "@/i18n";

function formatDate(value: number, format: DateFormat, includeTime: boolean, isNotTime = false): string {
    const date = new Date(value > 10000000000 ? value : value * 1000);
    if (Number.isNaN(date.getTime())) return "";
    if (format === "relative") {
        const days = Math.floor((new Date().getTime() - date.getTime()) / 86400000);
        if (days === 0) return t("common.today");
        if (days === 1) return t("common.yesterday");
        if (days === -1) return t("common.tomorrow");
        return days > 0 ? t("common.daysAgo", { days }) : t("common.daysLater", { days: Math.abs(days) });
    }
    const parts = { year: String(date.getFullYear()), month: String(date.getMonth() + 1).padStart(2, "0"), day: String(date.getDate()).padStart(2, "0") };
    const content = format === "YYYY/MM/DD" ? `${parts.year}/${parts.month}/${parts.day}`
        : format === "MM/DD/YYYY" ? `${parts.month}/${parts.day}/${parts.year}`
            : format === "DD/MM/YYYY" ? `${parts.day}/${parts.month}/${parts.year}`
                : format === "full" ? date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric", weekday: "long" })
                    : `${parts.year}-${parts.month}-${parts.day}`;
    return includeTime && !isNotTime ? `${content} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}:${String(date.getSeconds()).padStart(2, "0")}` : content;
}

/**
 * 复选框的文字表示：text 样式直接显示；icon 样式仅作为无障碍提示与纯文本回退，
 * 视觉由渲染层替换为思源原生图标（iconCheck/iconUncheck）。
 */
function checkboxText(checked: boolean): string {
    return checked ? t("common.checked") : t("common.unchecked");
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

interface RelationEntry {
    text: string;
    target?: DisplayNavigationTarget;
    icon?: string;
}

function relationEntries(relation: RelationValue): RelationEntry[] {
    const blockIDs = relation.blockIDs || [];
    const contents = relation.contents || [];
    const length = Math.max(blockIDs.length, contents.length);
    return Array.from({ length }, (_, index): RelationEntry | undefined => {
        const content = contents[index];
        const rowID = blockIDs[index] || "";
        const blockID = content?.block?.id || rowID;
        const text = content?.block?.content || rowID || blockID;
        if (!text) return undefined;
        return {
            text,
            icon: content?.block?.icon,
            target: !content?.isDetached && blockID ? { kind: "block", blockId: blockID } : undefined
        };
    }).filter((entry): entry is RelationEntry => Boolean(entry));
}

function mergeRelations(values: AttributeViewValue[]): RelationValue {
    const entries = new Map<string, RelationContent | undefined>();
    values.forEach(value => {
        const relation = normalizeRelation(value);
        const length = Math.max(relation.blockIDs?.length || 0, relation.contents?.length || 0);
        for (let index = 0; index < length; index++) {
            const content = relation.contents?.[index];
            const rowID = relation.blockIDs?.[index] || content?.block?.id;
            if (!rowID) continue;
            const existing = entries.get(rowID);
            const shouldReplace = !existing?.block?.content && Boolean(content?.block?.content);
            if (!entries.has(rowID) || shouldReplace) entries.set(rowID, content);
        }
    });
    return {
        blockIDs: [...entries.keys()],
        contents: [...entries.values()]
    };
}

function blockTarget(block: BlockReference | undefined, isDetached = false): DisplayNavigationTarget | undefined {
    if (!block?.id || isDetached) return undefined;
    return { kind: "block", blockId: block.id };
}

function assetTarget(asset: AssetReference): DisplayNavigationTarget | undefined {
    if (!asset.content) return undefined;
    return { kind: "asset", path: asset.content };
}

function normalizeFieldType(type: string | undefined): FieldType | undefined {
    const normalized = type === "select" ? "mSelect" : type;
    return FIELD_TYPES.find(fieldType => fieldType.toLowerCase() === normalized?.toLowerCase());
}

const MAX_ROLLUP_DEPTH = 7;

function rollupSources(value: AttributeViewValue, config: DisplayConfig): DisplaySource[] {
    return expandRollupSources(value, config, 0);
}

function expandRollupSources(value: AttributeViewValue, config: DisplayConfig, depth: number): DisplaySource[] {
    if (depth > MAX_ROLLUP_DEPTH) return [];
    return (value.rollup?.contents || []).flatMap(source => {
        const type = normalizeFieldType(source.type);
        if (!type) return [];
        return sourceItems(source, type, config, depth);
    });
}

function sourceItems(value: AttributeViewValue, type: FieldType, config: DisplayConfig, depth = 0): DisplaySource[] {
    if (type === "rollup") return expandRollupSources(value, config, depth + 1);
    if (type === "relation") {
        return relationEntries(normalizeRelation(value)).map(entry => ({ text: entry.text, type, target: entry.target }));
    }
    if (type === "block") {
        const text = value.block?.content || value.block?.id || "";
        return text ? [{ text, type, target: blockTarget(value.block, value.isDetached) }] : [];
    }
    if (type === "mAsset") {
        return (value.mAsset || []).map(asset => ({
            text: asset.name || asset.content || "",
            type,
            target: assetTarget(asset)
        })).filter(source => Boolean(source.text));
    }
    return texts(value, type, config).map(text => ({ text, type }));
}

function rawValue(value: AttributeViewValue, type: FieldType): unknown {
    if (type === "mSelect") return value.mSelect?.map(item => item.content).filter(Boolean) || [];
    if (type === "checkbox") return Boolean(value.checkbox?.checked);
    if (type === "date") return value.date ? { ...value.date } : null;
    // text 返回整个值对象而不是纯字符串：富文本字段的编辑面板需要 rich 源，
    // 只给 content 会让编辑器把 Kramdown 当普通文本改坏（见 inline-edit/rich-text-editor）
    if (type === "text") return value.text ? { ...value.text } : null;
    if (type === "relation") return normalizeRelation(value);
    if (type === "mAsset") return value.mAsset ? [...value.mAsset] : [];
    if (type === "block") return value.block ? { ...value.block } : null;
    if (type === "rollup") return value.rollup ? { ...value.rollup } : null;
    const field = value[type as keyof AttributeViewValue] as { content?: unknown } | undefined;
    return field?.content ?? "";
}

function texts(value: AttributeViewValue, type: FieldType, config: DisplayConfig): string[] {
    switch (type) {
        case "mSelect": return value.mSelect?.map(item => item.content || "").filter(Boolean) || [];
        case "number": return value.number?.content !== undefined ? [String(value.number.content)] : [];
        case "date": {
            if (value.date?.content === undefined) return [];
            const start = formatDate(value.date.content, config.dateFormat, config.includeTime, value.date.isNotTime);
            const end = value.date.hasEndDate && value.date.content2 !== undefined ? formatDate(value.date.content2, config.dateFormat, config.includeTime, value.date.isNotTime) : "";
            return [end ? `${start} ~ ${end}` : start].filter(Boolean);
        }
        case "text": return value.text?.content ? [value.text.content] : [];
        case "template": return typeof value.template?.content === "string" && value.template.content ? [value.template.content] : [];
        case "mAsset": return value.mAsset?.map(item => item.name || item.content || "").filter(Boolean) || [];
        case "block": return value.block?.content || value.block?.id ? [value.block.content || value.block.id || ""] : [];
        case "rollup": {
            const content = rollupSources(value, config).map(source => source.text).filter(Boolean).join(", ");
            return content ? [content] : [];
        }
        case "relation": return relationEntries(normalizeRelation(value)).map(entry => entry.text);
        case "checkbox": return value.checkbox ? [checkboxText(Boolean(value.checkbox.checked))] : [];
        case "phone": return value.phone?.content ? [value.phone.content] : [];
        case "url": return value.url?.content ? [value.url.content] : [];
        case "email": return value.email?.content ? [value.email.content] : [];
        case "created": return value.created?.content ? [formatDate(value.created.content, config.dateFormat, config.includeTime)] : [];
        case "updated": return value.updated?.content ? [formatDate(value.updated.content, config.dateFormat, config.includeTime)] : [];
        case "lineNumber": return [];
    }
}

function matches(value: AttributeViewValue, type: FieldType): boolean {
    if (type === "number") return value.number?.content !== undefined;
    if (type === "checkbox") return Boolean(value.checkbox);
    if (type === "template") return typeof value.template?.content === "string";
    if (type === "mSelect") return Boolean(value.mSelect?.length);
    if (type === "mAsset") return Boolean(value.mAsset?.length);
    if (type === "block") return Boolean(value.block?.content || value.block?.id);
    if (type === "rollup") return Boolean(value.rollup?.contents?.length);
    if (type === "lineNumber") return false;
    if (type === "relation") {
        const relation = normalizeRelation(value);
        return Boolean(relation.blockIDs?.length || relation.contents?.length);
    }
    return Boolean((value[type as keyof AttributeViewValue] as { content?: unknown } | undefined)?.content);
}

function displayType(keyType: string, types: ReadonlySet<FieldType>): FieldType | undefined {
    const normalized = normalizeFieldType(keyType);
    return normalized && types.has(normalized) ? normalized : undefined;
}

/**
 * 一条 value 只属于一个类型：以内核写入的 value.type 为准（内核在
 * attribute_view.go:8159 强制 value.Type = key.Type），缺失时回落到列类型。
 *
 * 不能对每个显示类型都试探一遍 matches：历史数据里存在携带全部类型字段零值的
 * value（number.content=0、checkbox={checked:false}、date/url 全空等，
 * 由早期写入方把完整对象整体回传造成），试探会把同一条 value 渲染成
 * 「0」「未勾选」等多个幻影 chip，夹在真实字段前后。思源原生按 cellValue.type
 * 单分支渲染（av/cell.ts:1210 起的一串 else if），这里与之对齐。
 */
function valueTypeOf(value: AttributeViewValue, key: AttributeViewKey,
                     showTypes: ReadonlySet<FieldType>): FieldType | undefined {
    return displayType(value.type, showTypes) || displayType(key.type, showTypes);
}

function isSelectKey(keyType: string): boolean {
    return keyType === "select" || keyType === "mSelect";
}

function createDisplayItem(
    table: AttributeViewTable,
    key: AttributeViewKey,
    value: AttributeViewValue,
    type: FieldType,
    text: string,
    config: DisplayConfig,
    raw = rawValue(value, type)
): DisplayItem {
    const item: DisplayItem = {
        type,
        text,
        avID: table.avID,
        keyID: key.id,
        keyName: key.name,
        keyType: key.type,
        rawValue: raw,
        template: key.template,
        selectOptions: key.options,
        relation: key.relation
    };
    if (type === "block") item.navigation = blockTarget(value.block, value.isDetached);
    if (type === "block") item.icon = value.block?.icon;
    if (type === "rollup") item.sources = rollupSources(value, config);
    if (type === "text") {
        // 富文本字段带上 Kramdown 源，展示层据此渲染与思源单元格一致的预览；
        // item.text 仍是内核算好的纯文本投影，供 aria-label、截断判定与复制使用
        const source = getAVTextSource(value.text);
        if (source.kind === "rich") item.richText = source.content;
    }
    return item;
}

function lineNumber(table: AttributeViewTable, blockId: string): number | undefined {
    if (!blockId) return undefined;
    const index = table.blockIDs?.indexOf(blockId) ?? -1;
    return index >= 0 ? index + 1 : undefined;
}

export function extractDisplayItems(tables: AttributeViewTable[], types: FieldType[], config: DisplayConfig, blockId = ""): DisplayItem[] {
    const result: DisplayItem[] = [];
    // 每个字段都要判多次类型归属，转成 Set 免去重复的线性扫描
    const showTypes = new Set(types || []);
    for (const table of tables || []) {
        // 隐藏/强制显示按数据库解析：一个块可能同时属于多个数据库，各表各取一套规则
        const rules = resolveFieldRules(config.globalFieldRules, config.databaseFieldRules, table.avID);
        for (const keyValue of table.keyValues || []) {
            const key = keyValue.key;
            if (!key || rules.hidden.has(key.name)) continue;

            if (isSelectKey(key.type)) {
                if (!showTypes.has("mSelect")) continue;
                // 每个选中选项一个分段。配色优先取列选项：整列改色后单元格值里
                // 可能残留旧颜色，以列选项为准（与思源 getSelectHTML 一致）
                const segments: DisplaySegment[] = [];
                // 选项按名建索引，避免每个选中项都线性扫描一遍选项表；
                // 惰性创建，字段没有选中值时不必为它建表
                let optionsByName: Map<string, SelectOption> | undefined;
                for (const value of keyValue.values || []) {
                    for (const item of value.mSelect || []) {
                        const name = String(item.content || "");
                        if (!name) continue;
                        if (!optionsByName) {
                            optionsByName = new Map((key.options || [])
                                .map(option => [String(option.name || option.content || ""), option]));
                        }
                        const option = optionsByName.get(name);
                        segments.push({
                            text: name,
                            color: option?.color ?? item.color,
                            resolvedColor: option?.resolvedColor
                        });
                    }
                }
                if (segments.length > 0) {
                    const selected = segments.map(segment => segment.text);
                    result.push({
                        type: "mSelect",
                        text: selected.join("、"),
                        avID: table.avID,
                        keyID: key.id,
                        keyName: key.name,
                        keyType: key.type,
                        rawValue: selected,
                        selectOptions: key.options,
                        segments
                    });
                } else if (rules.force.has(key.name)) {
                    result.push({ type: "mSelect", text: key.name, avID: table.avID, keyID: key.id, keyName: key.name, keyType: key.type, rawValue: [], selectOptions: key.options });
                }
                continue;
            }

            if (key.type === "relation") {
                const relation = mergeRelations(keyValue.values || []);
                const entries = relationEntries(relation);
                if (showTypes.has("relation") && entries.length > 0) {
                    entries.forEach(entry => {
                        result.push({
                            type: "relation",
                            text: entry.text,
                            avID: table.avID,
                            keyID: key.id,
                            keyName: key.name,
                            keyType: key.type,
                            rawValue: relation,
                            relation: key.relation,
                            navigation: entry.target,
                            icon: entry.icon
                        });
                    });
                } else if (rules.force.has(key.name) && showTypes.has("relation")) {
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

            if (key.type === "mAsset") {
                let shown = false;
                if (showTypes.has("mAsset")) {
                    for (const value of keyValue.values || []) {
                        const allAssets = value.mAsset ? [...value.mAsset] : [];
                        for (const asset of allAssets) {
                            const text = asset.name || asset.content || "";
                            if (!text) continue;
                            shown = true;
                            result.push({
                                type: "mAsset",
                                text,
                                avID: table.avID,
                                keyID: key.id,
                                keyName: key.name,
                                keyType: key.type,
                                rawValue: allAssets,
                                asset,
                                navigation: assetTarget(asset)
                            });
                        }
                    }
                }
                if (!shown && rules.force.has(key.name) && showTypes.has("mAsset")) {
                    result.push({ type: "mAsset", text: key.name, avID: table.avID, keyID: key.id, keyName: key.name, keyType: key.type, rawValue: null });
                }
                continue;
            }

            if (key.type === "lineNumber") {
                const value = lineNumber(table, blockId);
                if (showTypes.has("lineNumber") && value !== undefined) {
                    result.push({
                        type: "lineNumber",
                        text: String(value),
                        avID: table.avID,
                        keyID: key.id,
                        keyName: key.name,
                        keyType: key.type,
                        rawValue: value
                    });
                } else if (rules.force.has(key.name) && showTypes.has("lineNumber")) {
                    result.push({ type: "lineNumber", text: key.name, avID: table.avID, keyID: key.id, keyName: key.name, keyType: key.type, rawValue: null });
                }
                continue;
            }

            let shown = false;
            for (const value of keyValue.values || []) {
                const type = valueTypeOf(value, key, showTypes);
                if (!type || !matches(value, type)) continue;
                for (const text of texts(value, type, config)) {
                    shown = true;
                    result.push(createDisplayItem(table, key, value, type, text, config));
                }
            }
            if (!shown && rules.force.has(key.name)) {
                const type = displayType(key.type, showTypes);
                if (type) result.push({ type, text: key.name, avID: table.avID, keyID: key.id, keyName: key.name, keyType: key.type, rawValue: null, template: key.template, selectOptions: key.options, relation: key.relation });
            }
        }
    }
    return result;
}
