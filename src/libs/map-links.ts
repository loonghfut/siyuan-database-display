/**
 * 位置字段的地图相关纯函数：WGS84 ⇄ GCJ-02 坐标换算与高德外链生成。
 *
 * 内核存的是 WGS84 坐标（kernel/av/value_location.go 的 [WGS84] 标注），
 * 高德使用 GCJ-02，直接展示会偏移数百米，渲染与跳转前需转换；
 * 转换公式为公开的通用算法（WGS84 ⇄ GCJ-02），纯函数无外部调用。
 */

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
    result += (20 * Math.sin(y * Math.PI) + 40 * Math.sin(y / 3 * Math.PI)) * 2 / 3;
    result += (150 * Math.sin(y / 12 * Math.PI) + 300 * Math.sin(y * Math.PI / 30)) * 2 / 3;
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

/** 6 位小数约 0.1 米精度，远超地图链接需要，且规避科学计数法输出。 */
function formatCoordinate(value: number): string {
    return value.toFixed(6);
}

/** 高德 marker 接口坐标为「经度,纬度」次序。 */
export function buildAmapUrl(latitude: number, longitude: number, name?: string): string {
    const [lat, lng] = wgs84ToGcj02(latitude, longitude);
    const params = new URLSearchParams({ position: `${formatCoordinate(lng)},${formatCoordinate(lat)}` });
    if (name) params.set("name", name);
    return `https://uri.amap.com/marker?${params.toString()}`;
}

/** 新窗口打开高德地图链接；经锚点触发，交给系统默认浏览器处理。 */
export function openAmapLink(target: { latitude: number; longitude: number; name?: string }): void {
    const anchor = document.createElement("a");
    anchor.href = buildAmapUrl(target.latitude, target.longitude, target.name);
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    anchor.style.display = "none";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
}
