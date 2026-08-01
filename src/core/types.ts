export const FIELD_TYPES = ["mSelect", "number", "date", "text", "template", "mAsset", "relation", "checkbox", "phone", "url", "email", "created", "updated"] as const;

export type FieldType = typeof FIELD_TYPES[number];
export type CheckboxStyle = "emoji" | "symbol" | "text";
export type DateFormat = "YYYY-MM-DD" | "YYYY/MM/DD" | "MM/DD/YYYY" | "DD/MM/YYYY" | "full" | "relative";

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

export interface RelationContent {
    type?: "block" | string;
    block?: { id?: string; content?: string };
    isDetached?: boolean;
}

export interface RelationValue {
    blockIDs?: string[];
    contents?: RelationContent[];
}

export interface RelationCandidateValue extends AttributeViewValue {
    type?: string;
    block?: { id?: string; content?: string };
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
    text?: { content?: string };
    number?: { content?: number };
    date?: { content?: number; content2?: number; hasEndDate?: boolean; isNotTime?: boolean };
    checkbox?: { checked?: boolean };
    url?: { content?: string };
    email?: { content?: string };
    phone?: { content?: string };
    template?: { content?: string };
    mSelect?: Array<{ content?: string; color?: string }>;
    mAsset?: Array<{ name?: string }>;
    relation?: RelationValue;
    created?: { content?: number };
    updated?: { content?: number };
}

export interface AttributeViewTable {
    avID: string;
    keyValues: Array<{ key: AttributeViewKey; values: AttributeViewValue[] }>;
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
    | { relation: { blockIDs: string[]; contents: RelationContent[] } };
