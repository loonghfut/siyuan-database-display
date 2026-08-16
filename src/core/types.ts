export const FIELD_TYPES = ["mSelect", "number", "date", "text", "template", "mAsset", "relation", "rollup", "block", "lineNumber", "checkbox", "phone", "url", "email", "created", "updated"] as const;

export type FieldType = typeof FIELD_TYPES[number];
export type CheckboxStyle = "emoji" | "symbol" | "text";
export type DateFormat = "YYYY-MM-DD" | "YYYY/MM/DD" | "MM/DD/YYYY" | "DD/MM/YYYY" | "full" | "relative";

const READ_ONLY_FIELD_TYPES: readonly FieldType[] = ["block", "rollup", "lineNumber", "mAsset", "created", "updated"];

export function isInlineEditableField(type: FieldType): boolean {
    return !READ_ONLY_FIELD_TYPES.includes(type);
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
    color?: string;
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
    text?: { content?: string };
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
 * 多选字段的单个选项片段：文本 + 思源调色板颜色索引（1-14，见内核 FilterColorValue）。
 */
export interface DisplaySegment {
    text: string;
    color?: string;
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
}

export type AttributeViewWriteValue =
    | { text: { content: string } }
    | { number: { content: number; isNotEmpty?: boolean } }
    | { date: { content: number; isNotTime?: boolean; hasEndDate?: boolean; content2?: number } }
    | { mSelect: Array<{ content: string; color?: string }> }
    | { checkbox: { checked: boolean } }
    | { url: { content: string } }
    | { email: { content: string } }
    | { phone: { content: string } }
    | { relation: { blockIDs: string[]; contents: RelationContent[] } }
    | { mAsset: AssetReference[] };
