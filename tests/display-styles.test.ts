import { describe, it, expect } from "vitest";
import { readDisplayConfig, ListItemStyle, CardStyle, LIST_ITEM_STYLES, CARD_STYLES } from "@/config/display-config";

describe("display-styles and configuration", () => {
    it("has all newly supported ListItemStyles in LIST_ITEM_STYLES registry", () => {
        const expected: ListItemStyle[] = ["plain", "capsule", "badge", "bordered", "dot", "underline", "accent"];
        for (const item of expected) {
            expect(LIST_ITEM_STYLES[item]).toBe(true);
        }
    });

    it("parses all ListItemStyles correctly", () => {
        const validStyles: ListItemStyle[] = ["plain", "capsule", "badge", "bordered", "dot", "underline", "accent"];
        for (const style of validStyles) {
            const config = readDisplayConfig(key => {
                if (key === "display-format") return JSON.stringify({ listItemStyle: style });
                return null;
            });
            expect(config.listItemStyle).toBe(style);
        }
    });

    it("falls back safely to 'plain' for unknown listItemStyle", () => {
        const fallbackConfig = readDisplayConfig(key => {
            if (key === "display-format") return JSON.stringify({ listItemStyle: "fancy_neon_3d" });
            return null;
        });
        expect(fallbackConfig.listItemStyle).toBe("plain");
    });

    it("has all newly supported CardStyles in CARD_STYLES registry", () => {
        const expected: CardStyle[] = ["border", "shadow", "flat", "left-bar", "glass"];
        for (const item of expected) {
            expect(CARD_STYLES[item]).toBe(true);
        }
    });

    it("parses all CardStyles correctly", () => {
        const validStyles: CardStyle[] = ["border", "shadow", "flat", "left-bar", "glass"];
        for (const style of validStyles) {
            const config = readDisplayConfig(key => {
                if (key === "display-format") return JSON.stringify({ cardStyle: style });
                return null;
            });
            expect(config.cardStyle).toBe(style);
        }
    });

    it("falls back safely to 'border' for unknown cardStyle", () => {
        const fallbackConfig = readDisplayConfig(key => {
            if (key === "display-format") return JSON.stringify({ cardStyle: "cyberpunk_hologram" });
            return null;
        });
        expect(fallbackConfig.cardStyle).toBe("border");
    });

    it("retains cardEnabled default as true and respects user override", () => {
        const defaultConfig = readDisplayConfig(() => null);
        expect(defaultConfig.cardEnabled).toBe(true);
        expect(defaultConfig.cardStyle).toBe("border");

        const disabledConfig = readDisplayConfig(key => {
            if (key === "display-format") return JSON.stringify({ cardEnabled: false });
            return null;
        });
        expect(disabledConfig.cardEnabled).toBe(false);
    });
});
