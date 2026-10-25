/**
 * 逆地理编码（坐标 → 地名）：选点后自动填充位置名称用。
 *
 * 提供方按精度依次降级，任何一个返回结果即采用：
 * 1. 高德「Web 服务」：配置了 Key（用户自配优先，其次插件构建期内置）时使用，精度最高
 *    （门牌/楼宇级）。浏览器直连优先——接口响应带 Access-Control-Allow-Origin: *，
 *    不经过内核即不受工作区角色限制；直连被高德以「Key 平台类型不匹配」为由拒绝时，
 *    改走内核 /api/network/forwardProxy（服务端发起、不带 Origin，Web 服务 Key 可被接受），
 *    代价是该内核接口带 model.CheckAdminRole，非管理员工作区用不了。
 * 2. Photon（komoot 公共实例）：免 Key、跨域可用，OSM 数据，街道级精度；
 *    公开实例按公平使用限速，且 OSM 在华乡村覆盖稀疏。
 * 3. BigDataCloud 免 Key 客户端接口：跨域可用，全球行政区划库，
 *    在 Photon 无结果（乡村、海外稀疏区）时兜底。
 *
 * 本模块不向调用方抛异常：失败以「可重试」（无 reason）或「重试无意义」（带 reason）
 * 两种结果返回，由调用方决定是否提示用户。
 */

import { NetworkClient } from "@/network/network-client";
import { wgs84ToGcj02 } from "./map-links";

/** 插件构建期注入的高德 Web 服务 Key（.license/amap-config.json） */
declare const __DATABASE_DISPLAY_AMAP_KEY__: string;

/** 单次请求超时（毫秒） */
const REQUEST_TIMEOUT = 5000;
/** 缓存坐标精度（小数位）：约 1m 内的坐标视为同一地点 */
const CACHE_PRECISION = 5;
/** 缓存条目上限 */
const CACHE_LIMIT = 100;

export interface GeocodeOutcome {
    /** 解析出的地名；无结果时为空 */
    address?: string;
    /** 服务端明确报错的原因（如 Key 无效）；非空表示重试无意义 */
    reason?: string;
    /** 降级提示：主提供方失败但兜底成功（如 Key 无效，已改用免 Key 服务） */
    warning?: string;
}

interface AmapRegeoResponse {
    status?: string;
    info?: string;
    regeocode?: { formatted_address?: string };
}

interface PhotonResponse {
    features?: Array<{ properties?: Record<string, unknown> }>;
}

interface BigDataCloudResponse {
    countryName?: string;
    principalSubdivision?: string;
    city?: string;
    locality?: string;
}

/** 解析结果缓存：同一坐标反复解析会白耗服务配额 */
const resultCache = new Map<string, GeocodeOutcome>();

/** 内核代理客户端：serverUrl 留空即直连内核转发接口 */
const proxyClient = new NetworkClient({ serverUrl: "" });

function cacheKeyOf(chain: string, latitude: number, longitude: number): string {
    return `${chain}:${latitude.toFixed(CACHE_PRECISION)},${longitude.toFixed(CACHE_PRECISION)}`;
}

function readCache(key: string): GeocodeOutcome | undefined {
    return resultCache.get(key);
}

function writeCache(key: string, outcome: GeocodeOutcome): void {
    if (resultCache.size >= CACHE_LIMIT) {
        const oldest = resultCache.keys().next().value;
        if (oldest !== undefined) resultCache.delete(oldest);
    }
    resultCache.set(key, outcome);
}

/** 浏览器直连请求：自带超时，失败一律返回 undefined 而不抛出 */
async function fetchJson(url: string): Promise<unknown> {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
    try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) return undefined;
        return await response.json();
    } catch {
        return undefined;
    } finally {
        window.clearTimeout(timer);
    }
}

/**
 * 内核代理取文本：受工作区管理员角色限制。
 * 失败一律返回 undefined，提示交由调用方给出可操作文案。
 */
async function forwardGet(url: string): Promise<string | undefined> {
    try {
        const response = await proxyClient.request({ method: "GET", path: url, timeout: REQUEST_TIMEOUT });
        // NetworkClient 把上游真实状态码映射为 Response.status：非 2xx 一律判失败
        if (!response.ok) return undefined;
        return await response.text();
    } catch {
        return undefined;
    }
}

function parseJson(raw: string | undefined): unknown {
    if (!raw) return undefined;
    try {
        return JSON.parse(raw);
    } catch {
        return undefined;
    }
}

/** 插件内置的高德 Key：未配置时返回空串 */
function builtInAmapKey(): string {
    return typeof __DATABASE_DISPLAY_AMAP_KEY__ === "string" ? __DATABASE_DISPLAY_AMAP_KEY__.trim() : "";
}

/** 高德响应解析：status 为 "1" 才算成功，错误原因取 info */
function parseAmap(raw: unknown): GeocodeOutcome {
    if (typeof raw !== "object" || raw === null) return {};
    const result = raw as AmapRegeoResponse;
    if (result.status !== "1") return { reason: result.info || "AMAP_ERROR" };
    const address = result.regeocode?.formatted_address?.trim();
    // 高德对无法识别的坐标会返回空串或方括号占位
    if (!address || address === "[]") return {};
    return { address };
}

/**
 * 高德逆地理编码：先浏览器直连，再在必要时退回内核代理。
 * 代理路径只在直连拿到明确业务错误时才试：业务错误是秒回的（代价低），
 * 而浏览器被 CORS/网络挡住时代理同样无望，不值得再等一个超时。
 */
async function geocodeByAmap(apiKey: string, latitude: number, longitude: number): Promise<GeocodeOutcome> {
    const [gcjLat, gcjLng] = wgs84ToGcj02(latitude, longitude);
    const url = `https://restapi.amap.com/v3/geocode/regeo?key=${encodeURIComponent(apiKey)}&location=${gcjLng.toFixed(6)},${gcjLat.toFixed(6)}`;
    const direct = parseAmap(await fetchJson(url));
    if (direct.address) return direct;
    if (!direct.reason) return {};
    const proxied = parseAmap(parseJson(await forwardGet(url)));
    if (proxied.address) return proxied;
    return direct;
}

/**
 * Photon 逆地理编码：返回 GeoJSON，取最靠前的要素。
 * 公开实例只接受 lang=en/default（传 zh 会 400），但要素字段本身即为本地语言名，
 * 故不传 lang 以免踩到实例的语言白名单。
 */
async function geocodeByPhoton(latitude: number, longitude: number): Promise<GeocodeOutcome> {
    const url = `https://photon.komoot.io/reverse?lat=${latitude.toFixed(6)}&lon=${longitude.toFixed(6)}`;
    const raw = await fetchJson(url);
    if (typeof raw !== "object" || raw === null) return {};
    const properties = (raw as PhotonResponse).features?.[0]?.properties;
    if (!properties) return {};
    const address = formatPhotonAddress(properties);
    return address ? { address } : {};
}

/** Photon 要素字段：POI/建筑名 → 街道 → 行政区 → 城市 */
function formatPhotonAddress(properties: Record<string, unknown>): string | undefined {
    const text = (key: string): string => {
        const value = properties[key];
        return typeof value === "string" ? value.trim() : "";
    };
    const name = text("name");
    const street = text("street");
    const district = text("district");
    const city = text("city");
    const country = text("country");
    // 纯数字的 name 是门牌号，信息量低于街道 + 行政区
    const usableName = name && !/^\d+$/.test(name) ? name : "";
    const parts = [usableName, street, district, city].filter(Boolean);
    if (!parts.length) return country || undefined;
    if (!city && !district && country) parts.push(country);
    return parts.join(" ");
}

/**
 * BigDataCloud 逆地理编码：全球行政区划库，Photon 无结果时兜底。
 * localityLanguage=zh-Hans 取简体（传 zh 会返回繁体区名）。
 */
async function geocodeByBigDataCloud(latitude: number, longitude: number): Promise<GeocodeOutcome> {
    const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?localityLanguage=zh-Hans&latitude=${latitude.toFixed(6)}&longitude=${longitude.toFixed(6)}`;
    const raw = await fetchJson(url);
    if (typeof raw !== "object" || raw === null) return {};
    const address = formatBigDataCloudAddress(raw as BigDataCloudResponse);
    return address ? { address } : {};
}

/** BigDataCloud 字段：省 → 市 → 区/县；直辖市省市同名时去重 */
function formatBigDataCloudAddress(result: BigDataCloudResponse): string | undefined {
    const clean = (value: string | undefined): string => (value || "").trim();
    const city = clean(result.city);
    const province = clean(result.principalSubdivision);
    const parts = [city, clean(result.locality)].filter(Boolean);
    if (province && province !== city) parts.unshift(province);
    if (!parts.length) return clean(result.countryName) || undefined;
    return parts.join(" ");
}

/** 一个逆地理编码提供方 */
type GeocodeProvider = (latitude: number, longitude: number) => Promise<GeocodeOutcome>;

/**
 * 自动路由的逆地理编码：按提供方链依次尝试，任一返回结果即采用。
 * Key 来源优先级：用户自配 > 插件构建期内置；都没有则直接用免 Key 服务。
 * 任何失败都以 GeocodeOutcome 返回，本函数不会 reject。
 */
export async function reverseGeocode(userKey: string, latitude: number, longitude: number): Promise<GeocodeOutcome> {
    const key = (userKey || "").trim() || builtInAmapKey();
    const chain = key ? "amap" : "free";
    const cacheKey = cacheKeyOf(chain, latitude, longitude);
    const cached = readCache(cacheKey);
    if (cached) return cached;

    const providers: GeocodeProvider[] = [];
    if (key) providers.push((lat, lng) => geocodeByAmap(key, lat, lng));
    providers.push(geocodeByPhoton, geocodeByBigDataCloud);

    let reason: string | undefined;
    for (const provider of providers) {
        const outcome = await provider(latitude, longitude);
        if (outcome.address) {
            const result: GeocodeOutcome = { address: outcome.address };
            // 高德失败但兜底成功：把原因一并带出，调用方可提示「Key 不可用，已降级」
            if (reason) result.warning = reason;
            writeCache(cacheKey, result);
            return result;
        }
        if (outcome.reason && !reason) reason = outcome.reason;
    }
    return reason ? { reason } : {};
}
