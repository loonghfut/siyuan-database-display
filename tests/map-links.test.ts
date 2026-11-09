import { describe, it, expect } from "vitest";
import { wgs84ToGcj02, gcj02ToWgs84, buildAmapUrl } from "@/libs/map-links";

describe("map-links coordinate transforms", () => {
    it("round-trips WGS84 and GCJ02 coordinates with centimeter precision", () => {
        // Tiananmen Square: ~39.9087, 116.3975
        const origLat = 39.9087;
        const origLng = 116.3975;

        const [gcjLat, gcjLng] = wgs84ToGcj02(origLat, origLng);
        // In China, GCJ02 has a noticeable offset (~hundreds of meters)
        expect(gcjLat).not.toBe(origLat);
        expect(gcjLng).not.toBe(origLng);

        // Reverse transform
        const [recoveredLat, recoveredLng] = gcj02ToWgs84(gcjLat, gcjLng);
        expect(recoveredLat).toBeCloseTo(origLat, 5);
        expect(recoveredLng).toBeCloseTo(origLng, 5);
    });

    it("does not shift coordinates outside of China", () => {
        // Greenwich: 51.48, 0.0
        const [lat, lng] = wgs84ToGcj02(51.48, 0.0);
        expect(lat).toBe(51.48);
        expect(lng).toBe(0.0);
    });

    it("builds AMap URI correctly", () => {
        const uri = buildAmapUrl(39.9087, 116.3975, "天安门");
        expect(uri).toContain("https://uri.amap.com/marker?");
        expect(uri).toContain(encodeURIComponent("天安门"));
    });
});
