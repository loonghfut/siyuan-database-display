import { describe, it, expect, beforeEach } from "vitest";
import { extractDisplayItems } from "@/domain/content-extractor";
import type { AttributeViewTable, DisplayConfig } from "@/core/types";

// ─────────────────────────── helpers ───────────────────────────

function makeConfig(overrides: Partial<DisplayConfig> = {}): DisplayConfig {
    return {
        documentFields: ["mSelect", "number", "date", "text", "template", "mAsset", "relation", "rollup", "block", "lineNumber", "checkbox", "phone", "url", "email", "location", "created", "updated"],
        blockFields: ["mSelect", "text", "relation"],
        globalFieldRules: { hidden: new Set(), force: new Set() },
        databaseFieldRules: new Map(),
        dateFormat: "YYYY-MM-DD",
        includeTime: false,
        checkboxStyle: "icon",
        maxDisplayLength: 30,
        showFieldNames: false,
        listFontSize: 12,
        listMultiColumn: true,
        listLayoutStyle: "grid",
        listItemStyle: "plain",
        listLineHeight: "normal",
        listRowGap: "normal",
        listValueLines: "unlimited",
        listItemRadius: "auto",
        alignFieldNames: true,
        cardEnabled: true,
        cardRadius: "auto",
        cardPadding: "normal",
        editTrigger: "click",
        layout: "below",
        amapApiKey: "",
        fieldColors: {},
        fieldBackgrounds: {},
        valueColors: {},
        ...overrides
    } as DisplayConfig;
}

function makeTable(avID: string, fields: Array<{ id: string; name: string; type: string; value: unknown }>): AttributeViewTable {
    return {
        avID,
        avName: `Database ${avID}`,
        keyValues: fields.map(f => ({
            key: { id: f.id, name: f.name, type: f.type },
            values: [{ type: f.type, [f.type === "select" ? "mSelect" : f.type]: f.value } as unknown]
        })),
        blockIDs: ["block-1"]
    } as AttributeViewTable;
}

// ─────────────────────────── extractDisplayItems ───────────────────────────

describe("extractDisplayItems", () => {
    describe("空值过滤", () => {
        it("空文本字段不渲染", () => {
            const table = makeTable("av1", [{ id: "k1", name: "备注", type: "text", value: { content: "" } }]);
            const items = extractDisplayItems([table], ["text"], makeConfig());
            expect(items).toHaveLength(0);
        });

        it("有文本内容时正常渲染", () => {
            const table = makeTable("av1", [{ id: "k1", name: "备注", type: "text", value: { content: "Hello" } }]);
            const items = extractDisplayItems([table], ["text"], makeConfig());
            expect(items).toHaveLength(1);
            expect(items[0].text).toBe("Hello");
            expect(items[0].keyName).toBe("备注");
        });

        it("空 mSelect 不渲染", () => {
            const table: AttributeViewTable = {
                avID: "av1",
                keyValues: [{
                    key: { id: "k1", name: "标签", type: "mSelect" },
                    values: [{ type: "mSelect", mSelect: [] }]
                }],
                blockIDs: ["block-1"]
            };
            const items = extractDisplayItems([table], ["mSelect"], makeConfig());
            expect(items).toHaveLength(0);
        });

        it("有选项时渲染 mSelect 片段", () => {
            const table: AttributeViewTable = {
                avID: "av1",
                keyValues: [{
                    key: { id: "k1", name: "标签", type: "mSelect", options: [{ name: "重要", color: "1" }] },
                    values: [{ type: "mSelect", mSelect: [{ content: "重要", color: "1" }] }]
                }],
                blockIDs: ["block-1"]
            };
            const items = extractDisplayItems([table], ["mSelect"], makeConfig());
            expect(items).toHaveLength(1);
            expect(items[0].segments).toBeDefined();
            expect(items[0].segments![0].text).toBe("重要");
        });
    });

    describe("字段类型过滤", () => {
        it("仅显示 blockFields 中的类型", () => {
            const table: AttributeViewTable = {
                avID: "av1",
                keyValues: [
                    { key: { id: "k1", name: "标签", type: "mSelect" }, values: [{ type: "mSelect", mSelect: [{ content: "A" }] }] },
                    { key: { id: "k2", name: "日期", type: "date" }, values: [{ type: "date", date: { content: 1700000000000, isNotEmpty: true } }] }
                ],
                blockIDs: ["block-1"]
            };
            // 只展示 mSelect，不展示 date
            const items = extractDisplayItems([table], ["mSelect"], makeConfig());
            expect(items.every(i => i.type === "mSelect")).toBe(true);
            expect(items.some(i => i.type === "date")).toBe(false);
        });
    });

    describe("globalFieldRules — hidden", () => {
        it("hidden 规则隐藏指定字段名", () => {
            const table: AttributeViewTable = {
                avID: "av1",
                keyValues: [
                    { key: { id: "k1", name: "密码" }, values: [{ type: "text", text: { content: "secret" } }] },
                    { key: { id: "k2", name: "备注" }, values: [{ type: "text", text: { content: "visible" } }] }
                ],
                blockIDs: ["block-1"]
            };
            const config = makeConfig({
                globalFieldRules: { hidden: new Set(["密码"]), force: new Set() }
            });
            const items = extractDisplayItems([table], ["text"], config);
            expect(items.some(i => i.keyName === "密码")).toBe(false);
            expect(items.some(i => i.keyName === "备注")).toBe(true);
        });

        it("force 规则使空字段占位显示", () => {
            const table: AttributeViewTable = {
                avID: "av1",
                keyValues: [
                    { key: { id: "k1", name: "状态", type: "text" }, values: [{ type: "text", text: { content: "" } }] }
                ],
                blockIDs: ["block-1"]
            };
            const config = makeConfig({
                globalFieldRules: { hidden: new Set(), force: new Set(["状态"]) }
            });
            const items = extractDisplayItems([table], ["text"], config);
            expect(items).toHaveLength(1);
            // 强制显示时 text 为字段名本身
            expect(items[0].text).toBe("状态");
        });
    });

    describe("databaseFieldRules — 按数据库隐藏", () => {
        it("仅对指定 avID 生效，不影响其他库", () => {
            const tableA: AttributeViewTable = {
                avID: "av-a",
                keyValues: [{ key: { id: "k1", name: "备注", type: "text" }, values: [{ type: "text", text: { content: "A库内容" } }] }],
                blockIDs: ["block-1"]
            };
            const tableB: AttributeViewTable = {
                avID: "av-b",
                keyValues: [{ key: { id: "k2", name: "备注", type: "text" }, values: [{ type: "text", text: { content: "B库内容" } }] }],
                blockIDs: ["block-1"]
            };
            const config = makeConfig({
                databaseFieldRules: new Map([
                    ["av-a", { hidden: new Set(["备注"]), force: new Set() }]
                ])
            });
            const items = extractDisplayItems([tableA, tableB], ["text"], config);
            // A 库的"备注"被隐藏，B 库的"备注"仍然显示
            expect(items.some(i => i.avID === "av-a")).toBe(false);
            expect(items.some(i => i.avID === "av-b")).toBe(true);
        });
    });

    describe("多数据库场景", () => {
        it("来自不同数据库的字段都渲染，各自携带正确的 avID 和 avName", () => {
            const tableA: AttributeViewTable = {
                avID: "av-a",
                avName: "任务库",
                keyValues: [{ key: { id: "k1", name: "状态", type: "text" }, values: [{ type: "text", text: { content: "进行中" } }] }],
                blockIDs: ["block-1"]
            };
            const tableB: AttributeViewTable = {
                avID: "av-b",
                avName: "属性库",
                keyValues: [{ key: { id: "k2", name: "优先级", type: "text" }, values: [{ type: "text", text: { content: "高" } }] }],
                blockIDs: ["block-1"]
            };
            const items = extractDisplayItems([tableA, tableB], ["text"], makeConfig());
            expect(items).toHaveLength(2);
            expect(items.find(i => i.keyName === "状态")?.avID).toBe("av-a");
            expect(items.find(i => i.keyName === "状态")?.avName).toBe("任务库");
            expect(items.find(i => i.keyName === "优先级")?.avID).toBe("av-b");
            expect(items.find(i => i.keyName === "优先级")?.avName).toBe("属性库");
        });
    });

    describe("checkbox 字段", () => {
        it("已勾选渲染正确的 rawValue", () => {
            const table: AttributeViewTable = {
                avID: "av1",
                keyValues: [{ key: { id: "k1", name: "完成", type: "checkbox" }, values: [{ type: "checkbox", checkbox: { checked: true } }] }],
                blockIDs: ["block-1"]
            };
            const items = extractDisplayItems([table], ["checkbox"], makeConfig());
            expect(items).toHaveLength(1);
            expect(items[0].rawValue).toBe(true);
        });

        it("未勾选（false）也渲染（checkbox 有值即显示）", () => {
            const table: AttributeViewTable = {
                avID: "av1",
                keyValues: [{ key: { id: "k1", name: "完成", type: "checkbox" }, values: [{ type: "checkbox", checkbox: { checked: false } }] }],
                blockIDs: ["block-1"]
            };
            const items = extractDisplayItems([table], ["checkbox"], makeConfig());
            expect(items).toHaveLength(1);
            expect(items[0].rawValue).toBe(false);
        });
    });

    describe("date 格式化", () => {
        it("YYYY-MM-DD 格式正确", () => {
            const ts = new Date("2024-01-15T00:00:00").getTime();
            const table: AttributeViewTable = {
                avID: "av1",
                keyValues: [{ key: { id: "k1", name: "截止", type: "date" }, values: [{ type: "date", date: { content: ts, isNotEmpty: true } }] }],
                blockIDs: ["block-1"]
            };
            const items = extractDisplayItems([table], ["date"], makeConfig({ dateFormat: "YYYY-MM-DD" }));
            expect(items).toHaveLength(1);
            expect(items[0].text).toMatch(/2024-01-15/);
        });
    });

    describe("lineNumber 字段", () => {
        it("blockId 在 blockIDs 中时显示行号", () => {
            const table: AttributeViewTable = {
                avID: "av1",
                keyValues: [{ key: { id: "k1", name: "#", type: "lineNumber" }, values: [{ type: "lineNumber" }] }],
                blockIDs: ["block-1", "block-2"]
            };
            const items = extractDisplayItems([table], ["lineNumber"], makeConfig(), "block-2");
            expect(items).toHaveLength(1);
            expect(items[0].text).toBe("2");
        });

        it("blockId 不在 blockIDs 中时不显示行号", () => {
            const table: AttributeViewTable = {
                avID: "av1",
                keyValues: [{ key: { id: "k1", name: "#", type: "lineNumber" }, values: [{ type: "lineNumber" }] }],
                blockIDs: ["block-1"]
            };
            const items = extractDisplayItems([table], ["lineNumber"], makeConfig(), "block-99");
            expect(items).toHaveLength(0);
        });
    });

    describe("relation 合并去重", () => {
        it("同一关联字段多个 value 合并为一个 DisplayItem 组", () => {
            const table: AttributeViewTable = {
                avID: "av1",
                keyValues: [{
                    key: { id: "k1", name: "关联", type: "relation" },
                    values: [
                        { type: "relation", relation: { blockIDs: ["b1", "b2"], contents: [{ type: "block", block: { id: "b1", content: "块A" } }, { type: "block", block: { id: "b2", content: "块B" } }] } }
                    ]
                }],
                blockIDs: ["block-1"]
            };
            const items = extractDisplayItems([table], ["relation"], makeConfig());
            // 两个关联目标 → 两个 DisplayItem，同一 keyID
            expect(items).toHaveLength(2);
            expect(items.every(i => i.keyID === "k1")).toBe(true);
            expect(items.map(i => i.text)).toContain("块A");
            expect(items.map(i => i.text)).toContain("块B");
        });
    });
});
