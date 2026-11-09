import { describe, it, expect, vi } from "vitest";
import { openChipMenu } from "@/ui/chip-menu";
import type { DisplayItem } from "@/core/types";

describe("openChipMenu", () => {
    it("configures menu items for standard chip", () => {
        const item: DisplayItem = {
            type: "text",
            text: "Hello",
            avID: "av-1",
            keyID: "k-1",
            keyName: "Remark",
            keyType: "text",
            rawValue: "Hello"
        };

        const onEdit = vi.fn();
        const onHideField = vi.fn();
        const onNavigate = vi.fn();

        const event = { clientX: 100, clientY: 200 } as MouseEvent;
        openChipMenu(item, event, {
            canEdit: true,
            onEdit,
            onHideField,
            onNavigate
        });

        // Test hide current db callback
        onHideField(item, true);
        expect(onHideField).toHaveBeenCalledWith(item, true);
    });

    it("handles map and url navigation targets appropriately", () => {
        const mapItem: DisplayItem = {
            type: "location",
            text: "北京",
            avID: "av-1",
            keyID: "k-2",
            keyName: "Location",
            keyType: "location",
            rawValue: null,
            navigation: { kind: "map", latitude: 39.9, longitude: 116.4, name: "北京" }
        };

        const onOpenLocation = vi.fn();
        const onNavigate = vi.fn();

        openChipMenu(mapItem, { clientX: 0, clientY: 0 } as MouseEvent, {
            canEdit: false,
            onEdit: vi.fn(),
            onHideField: vi.fn(),
            onNavigate,
            onOpenLocation
        });

        onOpenLocation(mapItem);
        expect(onOpenLocation).toHaveBeenCalledWith(mapItem);
    });
});
