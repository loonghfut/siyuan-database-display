/**
 * 位置字段的地图对话框：应用内展示坐标（WGS84，与内核存储一致），编辑模式下
 * 支持拖拽标记 / 点击地图 / 手输经纬度三种方式选点，保存回调交由 display-controller
 * 写回内核。
 *
 * 瓦片固定走高德（国内 CDN 直连可用，无需 Key），坐标空间 GCJ-02：与地图的一切交互
 * 都在瓦片坐标系进行，进出一律经过转换，输入框/保存/外链始终持有 WGS84 原值。
 *
 * 位置字段可以只有名称而没有坐标（导入数据、或用户只填了地名）：此时对话框不落钉，
 * 坐标输入框留空，用户点选地图补录；有名称时会先用正向地理编码把视野聚焦到该地。
 */

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Dialog } from "siyuan";
import { t } from "@/i18n";
import { iconElement } from "@/libs/dom";
import { notify } from "@/libs/notify";
import { forwardGeocode, reverseGeocode } from "@/libs/amap-geocode";
import { gcj02ToWgs84, openAmapLink, wgs84ToGcj02 } from "@/libs/map-links";

/** 高德矢量瓦片模板；{s} 取 1~4 号 CDN 分片。 */
const AMAP_TILE_URL = "https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}";
const AMAP_TILE_SUBDOMAINS = ["1", "2", "3", "4"];
const AMAP_TILE_ATTRIBUTION = "© 高德地图";
const AMAP_TILE_MAX_ZOOM = 18;
/** 无坐标且名称也无法解析时的默认视野：国内视角，便于先缩放到所在城市 */
const DEFAULT_CENTER: [number, number] = [36.0, 104.0];
const DEFAULT_ZOOM = 4;
/** 名称解析成功后聚焦的缩放级别 */
const FOCUS_ZOOM = 15;

interface LocationMapOptions {
    /** 初始坐标（WGS84）；缺省表示该位置尚未选点，需在地图上点选 */
    latitude?: number;
    longitude?: number;
    name?: string;
    /** 编辑模式：标记可拖拽、点击地图选点，显示名称与经纬度输入框及保存按钮 */
    editable: boolean;
    /** 高德 Web 服务 Key；配置后选点自动回填位置名称 */
    amapApiKey: string;
    onSave?: (value: { name: string; latitude: number; longitude: number }) => void;
    /** 对话框被关闭（未保存）时回调；保存路径不触发 */
    onCancel?: () => void;
}

/** 自绘 SVG 图钉，避免依赖 Leaflet 自带的位图标记资源 */
const MARKER_ICON = L.divIcon({
    className: "db-location-map__marker",
    html: `<svg viewBox="0 0 24 24" width="30" height="30"><path fill="#f55b5b" stroke="#fff" stroke-width="1.2" d="M12 1.5c-4.1 0-7.5 3.4-7.5 7.5 0 5.6 7.5 13.5 7.5 13.5s7.5-7.9 7.5-13.5c0-4.1-3.4-7.5-7.5-7.5zm0 10.2a2.7 2.7 0 1 1 0-5.4 2.7 2.7 0 0 1 0 5.4z"/></svg>`,
    iconSize: [30, 30],
    iconAnchor: [15, 29]
});

function clampCoordinate(value: number, min: number, max: number): number | undefined {
    return Number.isFinite(value) && value >= min && value <= max ? value : undefined;
}

function createField(label: string, value: string, type = "text"): { row: HTMLElement; input: HTMLInputElement } {
    const row = document.createElement("label");
    row.className = "db-location-map__field";
    const caption = document.createElement("span");
    caption.className = "db-location-map__field-label";
    caption.textContent = label;
    const input = document.createElement("input");
    input.className = "b3-text-field";
    input.type = type;
    input.value = value;
    row.append(caption, input);
    return { row, input };
}

/** 加载指示：思源 #iconRefresh 图标 + 插件自有的旋转动画（保证绕图标自身中心旋转） */
function createSpinner(): HTMLElement {
    const spinner = document.createElement("span");
    spinner.className = "db-location-map__spinner";
    spinner.append(iconElement("iconRefresh"));
    return spinner;
}

export function showLocationMap(options: LocationMapOptions): void {
    const initialWgsLat = typeof options.latitude === "number" ? clampCoordinate(options.latitude, -90, 90) : undefined;
    const initialWgsLng = typeof options.longitude === "number" ? clampCoordinate(options.longitude, -180, 180) : undefined;
    /** 已有坐标 = 该位置已选点；否则是待补录状态 */
    const hasInitialPosition = initialWgsLat !== undefined && initialWgsLng !== undefined;
    // 保存后走正常关闭路径，不再触发 onCancel
    let saved = false;
    // 对话框关闭后不再回写任何状态
    let disposed = false;

    const canvas = document.createElement("div");
    canvas.className = "db-location-map__canvas";
    // 地图外套一层：定位徽标覆盖在地图上，但不拦截地图本身的交互
    const mapWrap = document.createElement("div");
    mapWrap.className = "db-location-map__map-wrap";
    const locating = document.createElement("div");
    locating.className = "db-location-map__locating";
    locating.hidden = true;
    const locatingText = document.createElement("span");
    locatingText.textContent = t("locationMap.locating");
    locating.append(createSpinner(), locatingText);
    mapWrap.append(canvas, locating);
    const fields = document.createElement("div");
    fields.className = "db-location-map__fields";
    const footer = document.createElement("div");
    footer.className = "db-location-map__footer";

    const name = createField(t("locationMap.name"), options.name || "");
    // 名称旁的加载指示：解释「名称为何迟迟没有填上」
    const nameSpinner = createSpinner();
    nameSpinner.hidden = true;
    nameSpinner.title = t("locationMap.resolving");
    name.row.append(nameSpinner);
    const latitude = createField(t("locationMap.latitude"), hasInitialPosition ? String(initialWgsLat) : "", "number");
    const longitude = createField(t("locationMap.longitude"), hasInitialPosition ? String(initialWgsLng) : "", "number");

    let map: L.Map | undefined;
    let marker: L.Marker | undefined;
    /** 外链按钮：尚无坐标时禁用（无从生成外链），选点后启用 */
    let externalButton: HTMLButtonElement | undefined;
    // 唯一数据源：字段值永远是 WGS84；瓦片坐标系固定为 GCJ-02，交互时按需换算
    let wgsLat = initialWgsLat ?? DEFAULT_CENTER[0];
    let wgsLng = initialWgsLng ?? DEFAULT_CENTER[1];

    const toDisplay = (lat: number, lng: number): [number, number] => wgs84ToGcj02(lat, lng);
    const fromDisplay = (lat: number, lng: number): [number, number] => gcj02ToWgs84(lat, lng);

    const renderState = (): void => {
        const [lat, lng] = toDisplay(wgsLat, wgsLng);
        marker?.setLatLng([lat, lng]);
    };

    /** 按需落钉：尚无坐标时，用户首次点选地图才创建图钉 */
    const ensureMarker = (lat: number, lng: number): L.Marker | undefined => {
        if (!map) return undefined;
        if (!marker) {
            marker = L.marker(toDisplay(lat, lng), { draggable: options.editable, icon: MARKER_ICON, keyboard: false }).addTo(map);
            if (options.name) marker.bindPopup(options.name); // 点击图钉弹出名称，不自动展开遮挡图钉
            if (options.editable) {
                marker.on("dragend", () => {
                    const position = marker!.getLatLng();
                    const [dragLat, dragLng] = fromDisplay(position.lat, position.lng);
                    setState(dragLat, dragLng);
                    scheduleRegeo();
                });
            }
        }
        return marker;
    };

    const setState = (lat: number, lng: number): void => {
        wgsLat = lat;
        wgsLng = lng;
        latitude.input.value = String(lat);
        longitude.input.value = String(lng);
        latitude.input.classList.remove("db-location-map__input--invalid");
        longitude.input.classList.remove("db-location-map__input--invalid");
        ensureMarker(lat, lng);
        renderState();
        if (externalButton) externalButton.disabled = false;
    };

    /** 选点后防抖回填位置名称：有 Key 走高德，无 Key 尝试免 Key 服务；
     *  连续失败 2 次后本次对话内停止尝试（服务不可达时不给每次选点徒增等待） */
    let regeoTimer: number | undefined;
    let regeoFails = 0;
    /** 服务端明确报错（如 Key 无效）后重试无意义，本次对话不再尝试 */
    let regeoStopped = false;
    /** 用户在本对话框内手输过名称：自动回填不再覆盖 */
    let nameEdited = false;
    /** 主提供方失败已降级：只提示一次 */
    let fallbackWarned = false;
    /** 名称解析中：显示名称旁的加载指示 */
    const setResolving = (resolving: boolean): void => {
        nameSpinner.hidden = !resolving;
    };
    const scheduleRegeo = (): void => {
        if (regeoStopped || regeoFails >= 2) return;
        window.clearTimeout(regeoTimer);
        // 立刻给出反馈：请求本身还有防抖 + 网络往返，用户不该面对「点了没反应」
        setResolving(true);
        // 固定本次请求的坐标：回调时标记若已移走，丢弃过期结果
        const lat = wgsLat;
        const lng = wgsLng;
        regeoTimer = window.setTimeout(() => {
            reverseGeocode(options.amapApiKey, lat, lng).then(outcome => {
                setResolving(false);
                if (disposed) return;
                // 选点后用户又移动了标记：旧地名不能盖到新位置上
                if (lat !== wgsLat || lng !== wgsLng) return;
                if (outcome.address) {
                    regeoFails = 0;
                    if (outcome.warning && !fallbackWarned) {
                        fallbackWarned = true;
                        notify(t("locationMap.geocodeFallback", { message: outcome.warning }), 5000, "info");
                    }
                    if (nameEdited) return;
                    name.input.value = outcome.address;
                    marker?.setPopupContent(outcome.address);
                } else if (outcome.reason) {
                    // 服务端明确拒绝（如 Key 无效、配额超限）：重试无意义
                    regeoStopped = true;
                    notify(t("locationMap.geocodeFailed", { message: outcome.reason }), 5000, "error");
                } else {
                    regeoFails += 1;
                    // 连续失败说明服务整体不可达（网络受限），给出一次提示
                    if (regeoFails === 2) {
                        notify(t("locationMap.geocodeUnavailable"), 6000, "info");
                    }
                }
            }).catch(() => {
                setResolving(false);
                regeoFails += 1;
            });
        }, 500);
    };

    const readCoordinateInputs = (): [number, number] | undefined => {
        const latText = latitude.input.value.trim();
        const lngText = longitude.input.value.trim();
        // 空串不能当作 0：Number("") 会得到 0，把未选点的位置误存成 (0, 0)
        if (!latText || !lngText) return undefined;
        const lat = clampCoordinate(Number(latText), -90, 90);
        const lng = clampCoordinate(Number(lngText), -180, 180);
        return lat === undefined || lng === undefined ? undefined : [lat, lng];
    };

    const dialog = new Dialog({
        title: options.name || t("locationMap.title"),
        content: "",
        width: options.editable ? "min(680px, 92vw)" : "min(520px, 92vw)",
        destroyCallback: () => {
            disposed = true;
            window.clearTimeout(regeoTimer);
            map?.remove();
            if (!saved) options.onCancel?.();
        }
    });

    // 思源 3.8.x 起内容容器为 b3-dialog__body，旧版为 b3-dialog__content，两者都兜住
    const root = dialog.element.querySelector(".b3-dialog__body") as HTMLElement
        || dialog.element.querySelector(".b3-dialog__content") as HTMLElement | null;
    if (!root) {
        dialog.destroy();
        notify(t("locationMap.openFailed"), 3000, "error");
        return;
    }
    root.classList.add("db-location-map");

    if (options.editable) {
        const hint = document.createElement("p");
        hint.className = "db-location-map__hint";
        hint.textContent = hasInitialPosition ? t("locationMap.hint") : t("locationMap.hintEmpty");
        fields.append(hint, name.row, latitude.row, longitude.row);
        // 程序化回填不触发 input 事件，故此处只记录用户手输
        name.input.addEventListener("input", () => { nameEdited = true; });
        for (const input of [latitude.input, longitude.input]) {
            input.addEventListener("change", () => {
                const coords = readCoordinateInputs();
                if (!coords) {
                    input.classList.add("db-location-map__input--invalid");
                    return;
                }
                setState(coords[0], coords[1]);
                // 手输坐标与拖拽/点击等价，同样触发地名回填
                scheduleRegeo();
            });
        }
    }

    const openExternal = document.createElement("button");
    openExternal.className = "b3-button b3-button--text";
    openExternal.textContent = t("locationMap.openExternal");
    // 没有选点就无从生成外链
    openExternal.disabled = !hasInitialPosition;
    openExternal.addEventListener("click", () => {
        const coords = readCoordinateInputs();
        if (!coords) return;
        openAmapLink({ latitude: coords[0], longitude: coords[1], name: name.input.value.trim() || undefined });
    });
    footer.append(openExternal);
    externalButton = openExternal;

    if (options.editable) {
        const cancel = document.createElement("button");
        cancel.className = "b3-button b3-button--cancel";
        cancel.textContent = window.siyuan.languages.cancel;
        cancel.addEventListener("click", () => dialog.destroy());
        const save = document.createElement("button");
        save.className = "b3-button b3-button--text";
        save.textContent = window.siyuan.languages.confirm;
        save.addEventListener("click", () => {
            const coords = readCoordinateInputs();
            if (!coords) {
                latitude.input.classList.add("db-location-map__input--invalid");
                longitude.input.classList.add("db-location-map__input--invalid");
                return;
            }
            saved = true;
            options.onSave?.({ name: name.input.value.trim(), latitude: coords[0], longitude: coords[1] });
            dialog.destroy();
        });
        footer.append(cancel, save);
    }

    root.append(mapWrap, fields, footer);

    map = L.map(canvas, { zoomControl: true, attributionControl: true });
    L.tileLayer(AMAP_TILE_URL, {
        maxZoom: AMAP_TILE_MAX_ZOOM,
        subdomains: AMAP_TILE_SUBDOMAINS,
        attribution: AMAP_TILE_ATTRIBUTION
    }).addTo(map);
    if (hasInitialPosition) {
        map.setView(toDisplay(initialWgsLat, initialWgsLng), 16);
        ensureMarker(initialWgsLat, initialWgsLng);
    } else {
        // 尚无坐标：先给一个可导航的默认视野，名称解析成功后自动聚焦
        map.setView(toDisplay(DEFAULT_CENTER[0], DEFAULT_CENTER[1]), DEFAULT_ZOOM);
    }

    if (options.editable) {
        map.on("click", event => {
            const [lat, lng] = fromDisplay(event.latlng.lat, event.latlng.lng);
            setState(lat, lng);
            scheduleRegeo();
        });
    }

    // 仅有名称没有坐标时，用正向地理编码把视野聚焦到该地：只移动视野不落钉，
    // 落点仍由用户点选，避免把机器解析结果直接当成用户选点
    if (!hasInitialPosition && options.name) {
        locating.hidden = false;
        void forwardGeocode(options.amapApiKey, options.name).then(outcome => {
            locating.hidden = true;
            if (disposed) return;
            if (typeof outcome.latitude !== "number" || typeof outcome.longitude !== "number") return;
            map?.setView(toDisplay(outcome.latitude, outcome.longitude), FOCUS_ZOOM);
        });
    }

    // 对话框有展开动画，容器尺寸就绪后需要让 Leaflet 重新测量
    setTimeout(() => map?.invalidateSize(), 180);
}
