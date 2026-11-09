import { describe, it, expect } from "vitest";
import { parseFieldRules, serializeFieldRules, resolveFieldRules } from "@/config/field-rules";

describe("field-rules", () => {
    it("parses empty or invalid input cleanly", () => {
        expect(parseFieldRules("")).toEqual({ global: { hidden: [], force: [] }, databases: [] });
        expect(parseFieldRules("not json")).toEqual({ global: { hidden: [], force: [] }, databases: [] });
    });

    it("parses global and database rules", () => {
        const json = JSON.stringify({
            hidden: "密码, 备注",
            force: "状态",
            databases: [
                { avID: "av-1", name: "任务库", hidden: "创建时间", force: "优先级" }
            ]
        });
        const parsed = parseFieldRules(json);
        expect(parsed.global.hidden).toEqual(["密码", "备注"]);
        expect(parsed.global.force).toEqual(["状态"]);
        expect(parsed.databases.length).toBe(1);
        expect(parsed.databases[0].avID).toBe("av-1");
        expect(parsed.databases[0].hidden).toEqual(["创建时间"]);
        expect(parsed.databases[0].force).toEqual(["优先级"]);
    });

    it("resolves rules for a specific database", () => {
        const globalRules = { hidden: new Set(["密码"]), force: new Set(["状态"]) };
        const dbMap = new Map([
            ["av-1", { hidden: new Set(["备注"]), force: new Set(["优先级"]) }]
        ]);

        const resolved = resolveFieldRules(globalRules, dbMap, "av-1");
        expect(resolved.hidden.has("密码")).toBe(true);
        expect(resolved.hidden.has("备注")).toBe(true);
        expect(resolved.force.has("状态")).toBe(true);
        expect(resolved.force.has("优先级")).toBe(true);
    });

    it("serializes rules correctly", () => {
        const state = {
            global: { hidden: ["a", "b"], force: ["c"] },
            databases: [{ avID: "av-1", name: "DB 1", hidden: ["d"], force: [] }]
        };
        const serialized = serializeFieldRules(state);
        const reparsed = parseFieldRules(serialized);
        expect(reparsed).toEqual(state);
    });
});
