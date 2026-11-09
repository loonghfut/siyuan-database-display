import { describe, it, expect } from "vitest";
import { extractDisplayItems } from "@/domain/content-extractor";
import { FIELD_TYPES, type AttributeViewTable, type DisplayConfig } from "@/core/types";

const config = {
    dateFormat: "YYYY-MM-DD",
    includeTime: false,
    globalFieldRules: { hidden: new Set(), force: new Set() },
    databaseFieldRules: new Map()
} as unknown as DisplayConfig;

function tableWith(key: { id: string; name: string; type: string }, values: unknown[]): AttributeViewTable[] {
    return [{
        avID: "av-1",
        avName: "测试库",
        blockIDs: ["item-1"],
        keyValues: [{ key, values }]
    } as unknown as AttributeViewTable];
}

describe("extractDisplayItems", () => {
    it("handles polluted text values without creating phantom chips", () => {
        const pollutedTextValue = {
            id: "20260908143349-3ecgq1q",
            keyID: "key-text",
            blockID: "item-1",
            type: "text",
            createdAt: 1788849229421,
            updatedAt: 1788849492006,
            block: { content: "" },
            text: { content: "啊大家安徽省的咯技术的", rich: { spec: 1, format: "kramdown", content: "啊大家安徽省的咯技术的" } },
            number: { content: 0, isNotEmpty: false, format: "", formattedContent: "" },
            date: { content: 0, isNotEmpty: false, hasEndDate: false, isNotTime: false, content2: 0, isNotEmpty2: false, formattedContent: "" },
            url: { content: "" },
            email: { content: "" },
            phone: { content: "" },
            template: { content: "" },
            created: { content: 0, isNotEmpty: false, content2: 0, isNotEmpty2: false, formattedContent: "" },
            updated: { content: 0, isNotEmpty: false, content2: 0, isNotEmpty2: false, formattedContent: "" },
            checkbox: { checked: false },
            relation: { blockIDs: [], contents: [] },
            rollup: { contents: [] }
        };

        const polluted = extractDisplayItems(
            tableWith({ id: "key-text", name: "描述", type: "text" }, [pollutedTextValue]),
            [...FIELD_TYPES], config, "item-1");

        expect(polluted.length).toBe(1);
        expect(polluted[0]?.type).toBe("text");
        expect(polluted[0]?.richText).toBe("啊大家安徽省的咯技术的");
        expect(polluted[0]?.text).toBe("啊大家安徽省的咯技术的");
    });

    it("displays number 0 and unchecked checkboxes correctly", () => {
        const numberZero = extractDisplayItems(
            tableWith({ id: "key-num", name: "数量", type: "number" },
                [{ id: "v2", keyID: "key-num", blockID: "item-1", type: "number", number: { content: 0, isNotEmpty: true } }]),
            [...FIELD_TYPES], config, "item-1");

        expect(numberZero.length).toBe(1);
        expect(numberZero[0].text).toBe("0");
    });
});
