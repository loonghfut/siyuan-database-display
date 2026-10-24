/**
 * 位置字段的地图对话框：应用内展示坐标（WGS84，与内核存储一致），编辑模式下
 * 支持拖拽标记 / 点击地图 / 手输经纬度三种方式选点，保存回调交由 display-controller
 * 写回内核。
 *
 * 瓦片源默认高德（国内 CDN 直连可用），坐标空间 GCJ-02：与地图的一切交互都在
 * 瓦片坐标系进行，进出一律经过转换，输入框/保存/外链始终持有 WGS84 原值。
 * 瓦片加载失败（如直连 OSM 不可达）时自动切换备用源。
 */

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Dialog } from "siyuan";
import { t } from "@/i18n";
import { notify } from "@/libs/notify";
import {
    gcj02ToWgs84,
    MapService,
    MAP_TILE_SOURCE_DEFINITIONS,
    MapTileSource,
    openMapLink,
    wgs84ToGcj02
} from "@/libs/map-links";

interface LocationMapOptions {
    latitude: number;
    longitude: number;
    name?: string;
    /** 编辑模式：标记可拖拽、点击地图选点，显示名称与经纬度输入框及保存按钮 */
    editable: boolean;
    /** 对话框内「外部地图打开」按钮使用的服务 */
    mapService: MapService;
    /** 应用内瓦片源；加载失败时自动切换到另一源 */
    tileSource: MapTileSource;
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

export function showLocationMap(options: LocationMapOptions): void {
    const initialWgsLat = clampCoordinate(options.latitude, -90, 90) ?? 0;
    const initialWgsLng = clampCoordinate(options.longitude, -180, 180) ?? 0;
    // 保存后走正常关闭路径，不再触发 onCancel
    let saved = false;

    const canvas = document.createElement("div");
    canvas.className = "db-location-map__canvas";
    const fields = document.createElement("div");
    fields.className = "db-location-map__fields";
    const footer = document.createElement("div");
    footer.className = "db-location-map__footer";

    const name = createField(t("locationMap.name"), options.name || "");
    const latitude = createField(t("locationMap.latitude"), String(initialWgsLat), "number");
    const longitude = createField(t("locationMap.longitude"), String(initialWgsLng), "number");

    let map: L.Map | undefined;
    let marker: L.Marker | undefined;
    let tileLayer: L.TileLayer | undefined;
    let tileSource: MapTileSource = options.tileSource;
    // 唯一数据源：字段值永远是 WGS84；渲染时按当前瓦片源转换
    let wgsLat = initialWgsLat;
    let wgsLng = initialWgsLng;

    const toDisplay = (lat: number, lng: number): [number, number] =>
        MAP_TILE_SOURCE_DEFINITIONS[tileSource].coordSpace === "gcj02" ? wgs84ToGcj02(lat, lng) : [lat, lng];
    const fromDisplay = (lat: number, lng: number): [number, number] =>
        MAP_TILE_SOURCE_DEFINITIONS[tileSource].coordSpace === "gcj02" ? gcj02ToWgs84(lat, lng) : [lat, lng];

    const renderState = (): void => {
        const [lat, lng] = toDisplay(wgsLat, wgsLng);
        marker?.setLatLng([lat, lng]);
    };

    const setState = (lat: number, lng: number): void => {
        wgsLat = lat;
        wgsLng = lng;
        latitude.input.value = String(lat);
        longitude.input.value = String(lng);
        latitude.input.classList.remove("db-location-map__input--invalid");
        longitude.input.classList.remove("db-location-map__input--invalid");
        renderState();
    };

    const readCoordinateInputs = (): [number, number] | undefined => {
        const lat = clampCoordinate(Number(latitude.input.value), -90, 90);
        const lng = clampCoordinate(Number(longitude.input.value), -180, 180);
        return lat === undefined || lng === undefined ? undefined : [lat, lng];
    };

    const dialog = new Dialog({
        title: options.name || t("locationMap.title"),
        content: "",
        width: options.editable ? "min(680px, 92vw)" : "min(520px, 92vw)",
        destroyCallback: () => {
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
        hint.textContent = t("locationMap.hint");
        fields.append(hint, name.row, latitude.row, longitude.row);
        for (const input of [latitude.input, longitude.input]) {
            input.addEventListener("change", () => {
                const coords = readCoordinateInputs();
                if (coords) setState(coords[0], coords[1]);
            });
        }
    }

    const openExternal = document.createElement("button");
    openExternal.className = "b3-button b3-button--text";
    openExternal.textContent = t("locationMap.openExternal");
    openExternal.addEventListener("click", () => {
        const coords = readCoordinateInputs() ?? [wgsLat, wgsLng];
        openMapLink({ latitude: coords[0], longitude: coords[1], name: name.input.value.trim() || undefined }, options.mapService);
    });
    footer.append(openExternal);

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

    root.append(canvas, fields, footer);

    const applyTileSource = (source: MapTileSource): void => {
        tileSource = source;
        const definition = MAP_TILE_SOURCE_DEFINITIONS[source];
        if (tileLayer) tileLayer.remove();
        tileLayer = L.tileLayer(definition.url, {
            maxZoom: definition.maxZoom,
            subdomains: definition.subdomains,
            attribution: definition.attribution
        });
        tileLayer.addTo(map!);
        renderState();
    };

    map = L.map(canvas, { zoomControl: true, attributionControl: true });
    applyTileSource(tileSource);
    map.setView(toDisplay(initialWgsLat, initialWgsLng), 16);
    marker = L.marker(toDisplay(initialWgsLat, initialWgsLng), { draggable: options.editable, icon: MARKER_ICON, keyboard: false }).addTo(map);
    if (options.name) marker.bindPopup(options.name); // 点击图钉弹出名称，不自动展开遮挡图钉

    if (options.editable) {
        marker.on("dragend", () => {
            const position = marker!.getLatLng();
            const [lat, lng] = fromDisplay(position.lat, position.lng);
            setState(lat, lng);
        });
        map.on("click", event => {
            const [lat, lng] = fromDisplay(event.latlng.lat, event.latlng.lng);
            setState(lat, lng);
        });
    }

    // 瓦片连不上时自动切换备用源；仅在低倍级别判瓦片断供（高倍下个别 404 属正常）
    let tileErrors = 0;
    map.on("tileerror", () => {
        if (saved || map!.getZoom() > 13) return;
        tileErrors += 1;
        if (tileErrors < 4) return;
        tileErrors = 0;
        const fallback: MapTileSource = tileSource === "amap" ? "osm" : "amap";
        applyTileSource(fallback);
        notify(t("locationMap.tileFallback", { name: MAP_TILE_SOURCE_DEFINITIONS[fallback].attribution }), 4000, "info");
    });

    // 对话框有展开动画，容器尺寸就绪后需要让 Leaflet 重新测量
    setTimeout(() => map?.invalidateSize(), 180);
}
