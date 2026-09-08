export const FIELD_TYPES = ["mSelect", "number", "date", "text", "template", "mAsset", "relation", "rollup", "block", "lineNumber", "checkbox", "phone", "url", "email", "created", "updated"] as const;

export type FieldType = typeof FIELD_TYPES[number];
export type CheckboxStyle = "icon" | "text";
export type DateFormat = "YYYY-MM-DD" | "YYYY/MM/DD" | "MM/DD/YYYY" | "DD/MM/YYYY" | "full" | "relative";

const READ_ONLY_FIELD_TYPES: readonly FieldType[] = ["block", "rollup", "lineNumber", "mAsset", "created", "updated"];

export function isInlineEditableField(type: FieldType): boolean {
    return !READ_ONLY_FIELD_TYPES.includes(type);
}

/** /api/av/getAttributeViewKeysByAvID 返回的字段条目（av.Key 的子集）。 */
export interface AttributeViewField {
    id: string;
    name: string;
    type?: string;
    icon?: string;
}

export interface AttributeViewKey {
    id: string;
    name: string;
    type: string;
    template?: string;
    options?: SelectOption[];
    relation?: AttributeViewRelation;
}

export interface SelectOption {
    id?: string;
    name?: string;
    content?: string;
    /** 调色板索引：1-14 为内置色，15-78 为自定义色。 */
    color?: string;
    desc?: string;
    /** 内核解析出的自定义色明暗取值，存在时优先用于渲染。 */
    resolvedColor?: AVResolvedColor;
}

/** 明暗主题下的一套前景/背景色，取值为 #rrggbb。 */
export interface AVColorTheme {
    color?: string;
    backgroundColor?: string;
}

export interface AVResolvedColor {
    light?: AVColorTheme;
    dark?: AVColorTheme;
}

/** 工作空间自定义色：索引落在 15-78，可被单独隐藏。 */
export interface AVCustomColor extends AVResolvedColor {
    index: number;
    hidden?: boolean;
}

/** 调色板条目：内置色只有索引，自定义色附带明暗取值。 */
export interface AVPaletteEntry {
    color: string;
    resolvedColor?: AVResolvedColor;
}

export interface AttributeViewRelation {
    avID?: string;
    backKeyID?: string;
    isTwoWay?: boolean;
}

export interface BlockReference {
    id?: string;
    content?: string;
    icon?: string;
}

export interface AssetReference {
    content?: string;
    name?: string;
    type?: "file" | "image" | string;
}

export interface RelationContent {
    type?: "block" | string;
    block?: BlockReference;
    isDetached?: boolean;
}

/**
 * 文本字段的富文本源，对应内核 av.ValueTextRich。
 * 思源 3.8.3 起 text 字段支持富文本，content 从「唯一数据源」降级为 rich 的纯文本投影。
 */
export interface AttributeViewTextRich {
    /** 规格版本，内核 ValueTextRichSpec = 1；不符则整条 rich 被当作不存在。 */
    spec?: number;
    /** 源格式，内核 ValueTextRichFormatKramdown = "kramdown"。 */
    format?: string;
    /** SiYuan Kramdown 片段。 */
    content?: string;
}

export interface AttributeViewTextValue {
    content?: string;
    /**
     * 读出时纯文本值不带该键（内核 JSON 标签是 rich,omitempty）。
     * 写入时语义有别：显式 null 表示清除富文本，缺省表示不改动
     * —— 但缺省且 content 变化时内核会自动清除 rich，见 rich-text/value.ts 顶部说明。
     */
    rich?: AttributeViewTextRich | null;
}

export interface RelationValue {
    blockIDs?: string[];
    contents?: RelationContent[];
}

export interface RelationCandidateValue extends AttributeViewValue {
    type?: string;
    block?: BlockReference;
    isDetached?: boolean;
}

export interface RelationCandidateRow {
    id: string;
    cells?: Array<{ id?: string; value?: RelationCandidateValue }>;
}

export interface RelationCandidatesPage {
    name?: string;
    blockIDs?: string[];
    notebookID?: string;
    selectedRows?: RelationCandidateRow[];
    rows?: RelationCandidateRow[];
    total?: number;
}

export interface AttributeViewValue {
    type?: string;
    blockID?: string;
    id?: string;
    isDetached?: boolean;
    text?: AttributeViewTextValue;
    number?: { content?: number };
    date?: { content?: number; content2?: number; hasEndDate?: boolean; isNotTime?: boolean };
    checkbox?: { checked?: boolean };
    url?: { content?: string };
    email?: { content?: string };
    phone?: { content?: string };
    template?: { content?: string };
    mSelect?: Array<{ content?: string; color?: string }>;
    mAsset?: AssetReference[];
    block?: BlockReference;
    rollup?: { contents?: AttributeViewValue[] };
    relation?: RelationValue;
    created?: { content?: number };
    updated?: { content?: number };
}

export interface AttributeViewTable {
    avID: string;
    /** 数据库名，内核 getAttributeViewKeys（BlockAttributeViewKeys.avName）随条目返回。 */
    avName?: string;
    keyValues: Array<{ key: AttributeViewKey; values: AttributeViewValue[] }>;
    blockIDs?: string[];
}

export type DisplayNavigationTarget =
    | { kind: "block"; blockId: string }
    | { kind: "asset"; path: string };

export interface DisplaySource {
    text: string;
    type?: string;
    target?: DisplayNavigationTarget;
}

/**
 * 多选字段的单个选项片段：文本 + 选项配色。
 * 颜色优先取列选项的 resolvedColor，其次才是调色板索引（见内核 FilterColorValue）。
 */
export interface DisplaySegment {
    text: string;
    color?: string;
    resolvedColor?: AVResolvedColor;
}

export interface DisplayItem {
    type: FieldType;
    text: string;
    avID: string;
    keyID: string;
    keyName: string;
    keyType: string;
    rawValue: unknown;
    template?: string;
    selectOptions?: SelectOption[];
    relation?: AttributeViewRelation;
    navigation?: DisplayNavigationTarget;
    asset?: AssetReference;
    sources?: DisplaySource[];
    /** 多选字段的分段显示数据（每个选项一个色点+文本） */
    segments?: DisplaySegment[];
    /** 目标块图标（unicode 码点串或资源路径），用于 relation/block 字段 */
    icon?: string;
    /**
     * 文本字段的富文本 Kramdown 源。存在时展示层渲染成与思源单元格一致的
     * 富文本预览（此时 text 是它的纯文本投影，仅供 aria-label / 截断判定 / 复制使用）。
     */
    richText?: string;
}

export type AttributeViewWriteValue =
    // rich 键必须按内核契约显式携带：保留富文本传完整对象，清除传 null，见 rich-text/value.ts
    | { text: { content: string; rich?: AttributeViewTextRich | null } }
    | { number: { content: number; isNotEmpty?: boolean } }
    // isNotEmpty / isNotEmpty2 决定内核是否保留对应的时间：缺失即视为空值（kernel/model/attribute_view.go:7831）
    | { date: { content: number; isNotEmpty?: boolean; isNotTime?: boolean; hasEndDate?: boolean; content2?: number; isNotEmpty2?: boolean } }
    | { mSelect: Array<{ content: string; color?: string }> }
    | { checkbox: { checked: boolean } }
    | { url: { content: string } }
    | { email: { content: string } }
    | { phone: { content: string } }
    | { relation: { blockIDs: string[]; contents: RelationContent[] } }
    | { mAsset: AssetReference[] };

/**
 * /api/av/searchAttributeView 的返回条目。顶层条目是数据库，
 * children 是 includeViewMatches 为真时附带的匹配视图。
 */
export interface AttributeViewSearchItem {
    avID: string;
    avName: string;
    blockID: string;
    hPath: string;
    matched?: boolean;
    viewName?: string;
    viewID?: string;
    viewLayout?: string;
    children?: AttributeViewSearchItem[];
}
