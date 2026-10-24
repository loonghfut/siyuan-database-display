/**
 * 位置字段的地图跳转：按用户选择的地图服务生成外链并打开。
 *
 * 内核存的是 WGS84 坐标（kernel/av/value_location.go 的 [WGS84] 标注），
 * 高德使用 GCJ-02、百度使用 BD-09，直接展示会偏移数百米，跳转前需转换；
 * Google Maps 与 geo: 协议消费 WGS84 原值。
 * 转换公式为公开的通用算法（WGS84 ⇄ GCJ-02 ⇄ BD-09），纯函数无外部调用。
 */

export type MapService = "amap" | "baidu" | "google" | "geo";

export const MAP_SERVICES: readonly MapService[] = ["amap", "baidu", "google", "geo"];

/**
 * 应用内地图的瓦片源。高德瓦片走国内 CDN（无需 Key，坐标空间为 GCJ-02），
 * OpenStreetMap 为 WGS84。默认高德：国内网络直连 OSM 常不可达（实测）。
 */
export type MapTileSource = "amap" | "osm";

export const MAP_TILE_SOURCES: readonly MapTileSource[] = ["amap", "osm"];

export interface MapTileSourceDefinition {
    /** Leaflet 瓦片 URL 模板 */
    url: string;
    subdomains?: string[];
    attribution: string;
    maxZoom: number;
    /** 瓦片坐标系：标记/中心点需转换到该坐标系再交给 Leaflet */
    coordSpace: "gcj02" | "wgs84";
}

export const MAP_TILE_SOURCE_DEFINITIONS: Record<MapTileSource, MapTileSourceDefinition> = {
    amap: {
        url: "https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}",
        subdomains: ["1", "2", "3", "4"],
        attribution: "© 高德地图",
        maxZoom: 18,
        coordSpace: "gcj02"
    },
    osm: {
        url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        attribution: "© OpenStreetMap",
        maxZoom: 19,
        coordSpace: "wgs84"
    }
};

const X_PI = (Math.PI * 3000) / 180;
const GCJ_A = 6378245;
const GCJ_EE = 0.00669342162296594323;

/** 中国境外（含远海）没有 GCJ-02 偏移，原样返回。 */
function outOfChina(latitude: number, longitude: number): boolean {
    return longitude < 72.004 || longitude > 137.8347 || latitude < 0.8293 || latitude > 55.8271;
}

function transformLatitude(x: number, y: number): number {
    let result = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
    result += (20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2 / 3;
    result += (20 * Math.sin(y * Math.PI) + 40 * Math.sin(y / 3 * Math.PI)) * 2 / 3;
    result += (160 * Math.sin(y / 12 * Math.PI) + 320 * Math.sin(y * Math.PI / 30)) * 2 / 3;
    return result;
}

function transformLongitude(x: number, y: number): number {
    let result = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
    result += (20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2 / 3;
    result += (20 * Math.sin(x * Math.PI) + 40 * Math.sin(x / 3 * Math.PI)) * 2 / 3;
    result += (150 * Math.sin(x / 12 * Math.PI) + 300 * Math.sin(x / 30 * Math.PI)) * 2 / 3;
    return result;
}

export function wgs84ToGcj02(latitude: number, longitude: number): [number, number] {
    if (outOfChina(latitude, longitude)) return [latitude, longitude];
    const dLat = transformLatitude(longitude - 105, latitude - 35);
    const dLng = transformLongitude(longitude - 105, latitude - 35);
    const radLat = latitude / 180 * Math.PI;
    let magic = Math.sin(radLat);
    magic = 1 - GCJ_EE * magic * magic;
    const sqrtMagic = Math.sqrt(magic);
    const offsetLat = (dLat * 180) / ((GCJ_A * (1 - GCJ_EE)) / (magic * sqrtMagic) * Math.PI);
    const offsetLng = (dLng * 180) / (GCJ_A / sqrtMagic * Math.cos(radLat) * Math.PI);
    return [latitude + offsetLat, longitude + offsetLng];
}

/** GCJ-02 → WGS84 近似逆变换：两次差分迭代，误差厘米级，远小于手动选点精度 */
export function gcj02ToWgs84(latitude: number, longitude: number): [number, number] {
    let wgsLat = latitude;
    let wgsLng = longitude;
    for (let index = 0; index < 2; index++) {
        const [gLat, gLng] = wgs84ToGcj02(wgsLat, wgsLng);
        wgsLat += latitude - gLat;
        wgsLng += longitude - gLng;
    }
    return [wgsLat, wgsLng];
}

function gcj02ToBd09(latitude: number, longitude: number): [number, number] {
    const z = Math.sqrt(longitude * longitude + latitude * latitude) + 0.00002 * Math.sin(latitude * X_PI);
    const theta = Math.atan2(latitude, longitude) + 0.000003 * Math.cos(longitude * X_PI);
    return [z * Math.sin(theta) + 0.006, z * Math.cos(theta) + 0.0065];
}

/** 6 位小数约 0.1 米精度，远超地图链接需要，且规避科学计数法输出。 */
function formatCoordinate(value: number): string {
    return value.toFixed(6);
}

export function buildMapUrl(service: MapService, latitude: number, longitude: number, name?: string): string {
    switch (service) {
        case "amap": {
            const [lat, lng] = wgs84ToGcj02(latitude, longitude);
            // 高德 marker 接口坐标为「经度,纬度」次序
            const params = new URLSearchParams({ position: `${formatCoordinate(lng)},${formatCoordinate(lat)}` });
            if (name) params.set("name", name);
            return `https://uri.amap.com/marker?${params.toString()}`;
        }
        case "baidu": {
            const [gcjLat, gcjLng] = wgs84ToGcj02(latitude, longitude);
            const [lat, lng] = gcj02ToBd09(gcjLat, gcjLng);
            // 百度 marker 接口坐标为「纬度,经度」次序，title/content 必填
            const label = name || "位置";
            const params = new URLSearchParams({
                location: `${formatCoordinate(lat)},${formatCoordinate(lng)}`,
                title: label,
                content: label,
                output: "html",
                src: "webapp.siyuandatabasedisplay"
            });
            return `https://api.map.baidu.com/marker?${params.toString()}`;
        }
        case "google":
            return `https://www.google.com/maps/search/?api=1&query=${formatCoordinate(latitude)},${formatCoordinate(longitude)}`;
        case "geo":
            return `geo:${formatCoordinate(latitude)},${formatCoordinate(longitude)}`;
    }
}

/** 新窗口打开地图链接；geo: 等自定义协议同样经锚点触发，交给系统处理。 */
export function openMapLink(target: { latitude: number; longitude: number; name?: string }, service: MapService): void {
    const anchor = document.createElement("a");
    anchor.href = buildMapUrl(service, target.latitude, target.longitude, target.name);
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
}
