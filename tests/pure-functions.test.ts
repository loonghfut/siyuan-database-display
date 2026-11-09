import { describe, it, expect } from "vitest";
import { convertToAVValue } from "@/inline-edit/input-fields";

describe("convertToAVValue", () => {
    it("handles date values correctly", () => {
        const cleared = convertToAVValue("date", { content: 1700000000000, hasEndDate: true, content2: null });
        expect((cleared as any).date.content2).toBe(0);
        expect((cleared as any).date.hasEndDate).toBe(true);

        const withEnd = convertToAVValue("date", { content: 1700000000000, hasEndDate: true, content2: 1700086400000 });
        expect((withEnd as any).date.content2).toBe(1700086400000);
        expect((withEnd as any).date.hasEndDate).toBe(true);

        const legacy = convertToAVValue("date", 1700000000000);
        expect((legacy as any).date.content).toBe(1700000000000);
    });

    it("handles number values and empty state", () => {
        const num = convertToAVValue("number", { content: 42, isNotEmpty: true });
        expect((num as any).number.content).toBe(42);
        expect((num as any).number.isNotEmpty).toBe(true);

        const emptyNum = convertToAVValue("number", { content: 0, isNotEmpty: false });
        expect((emptyNum as any).number.content).toBe(0);
        expect((emptyNum as any).number.isNotEmpty).toBe(false);
    });
});
