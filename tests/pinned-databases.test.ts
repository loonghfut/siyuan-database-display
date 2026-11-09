import { describe, it, expect } from "vitest";
import { parsePinnedDatabases, serializePinnedDatabases } from "@/config/pinned-databases";

describe("parsePinnedDatabases", () => {
    it("returns empty array for invalid input", () => {
        expect(parsePinnedDatabases("")).toEqual([]);
        expect(parsePinnedDatabases("invalid json")).toEqual([]);
        expect(parsePinnedDatabases("{}")).toEqual([]);
    });

    it("parses valid databases and preserves viewID", () => {
        const input = JSON.stringify([
            { avID: "av-1", name: "DB 1", blockID: "b-1" },
            { avID: "av-1", name: "DB 1 View 2", blockID: "b-1", viewID: "v-2" },
            { avID: "av-2", name: "DB 2" }
        ]);
        const result = parsePinnedDatabases(input);
        expect(result.length).toBe(3);
        expect(result[0]).toEqual({ avID: "av-1", name: "DB 1", blockID: "b-1" });
        expect(result[1]).toEqual({ avID: "av-1", name: "DB 1 View 2", blockID: "b-1", viewID: "v-2" });
        expect(result[2]).toEqual({ avID: "av-2", name: "DB 2" });
    });

    it("deduplicates identical entries", () => {
        const input = JSON.stringify([
            { avID: "av-1", name: "DB 1" },
            { avID: "av-1", name: "Duplicate DB 1" }
        ]);
        const result = parsePinnedDatabases(input);
        expect(result.length).toBe(1);
        expect(result[0].name).toBe("DB 1");
    });

    it("serializes and roundtrips correctly", () => {
        const dbs = [
            { avID: "av-1", name: "DB 1", viewID: "v-1" },
            { avID: "av-2", name: "DB 2", blockID: "b-2" }
        ];
        const serialized = serializePinnedDatabases(dbs);
        const parsed = parsePinnedDatabases(serialized);
        expect(parsed).toEqual(dbs);
    });
});
