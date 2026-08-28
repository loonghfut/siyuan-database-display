import { DEFAULT_FIELD_BACKGROUNDS, DEFAULT_FIELD_COLORS, parseCsv } from "@/config/display-config";
import { FIELD_TYPES } from "@/core/types";
import { SettingUtils } from "@/libs/setting-utils";
import { parseObject } from "./components/controls";

function withoutTimestamps(value: unknown): string {
    const selected = typeof value === "string" && value.trim() ? parseCsv(value) : [...FIELD_TYPES];
    return selected.filter(type => type !== "created" && type !== "updated").join(",");
}

function legacyFields(value: unknown, fallback: string, showTimestamps: boolean): string {
    const selected = typeof value === "string" && value.trim() ? value : fallback;
    return showTimestamps ? selected : withoutTimestamps(selected);
}

export function migrateLegacySettings(settings: SettingUtils, saved: unknown): boolean {
    const data = saved as Record<string, unknown> | null;
    if (!data) return false;
    let changed = false;
    const migrate = (key: string, value: unknown) => {
        if (Object.prototype.hasOwnProperty.call(data, key)) return;
        settings.set(key, JSON.stringify(value));
        changed = true;
    };

    const showTimestamps = data["show-timestamps"] !== false;
    const legacyDocumentFields = legacyFields(data["dis-show"], FIELD_TYPES.join(","), showTimestamps);
    const legacyBlockFields = legacyFields(data["dis-show-block"], "mSelect,text,relation", showTimestamps);
    migrate("display-fields", { document: legacyDocumentFields, block: legacyBlockFields });
    migrate("field-rules", { hidden: data["hidden-fields"] || "", force: data["force-show-fields"] || "" });
    migrate("display-format", { dateFormat: data["date-format"] || "YYYY-MM-DD", includeTime: Boolean(data["include-time"]), checkboxStyle: data["checkbox-style"] === "text" ? "text" : "icon", maxDisplayLength: data["max-display-length"] || 30, showFieldNames: false, cardEnabled: true });
    migrate("display-appearance", {
        types: Object.fromEntries(FIELD_TYPES.map(type => [type, {
            color: parseObject<Record<string, string>>(data["field-color-map"], DEFAULT_FIELD_COLORS)[type] || DEFAULT_FIELD_COLORS[type],
            bg: parseObject<Record<string, string>>(data["field-bg-color-map"], DEFAULT_FIELD_BACKGROUNDS)[type] || DEFAULT_FIELD_BACKGROUNDS[type]
        }])),
        values: parseObject<Record<string, unknown>>(data["field-value-color-map"], {})
    });
    const format = parseObject<Record<string, unknown>>(settings.get("display-format"), {});
    if (Object.prototype.hasOwnProperty.call(format, "showTimestamps")) {
        const enabled = format.showTimestamps !== false;
        delete format.showTimestamps;
        settings.set("display-format", JSON.stringify(format));
        if (!enabled) {
            const fields = parseObject<{ document?: string; block?: string }>(settings.get("display-fields"), {});
            settings.set("display-fields", JSON.stringify({ document: withoutTimestamps(fields.document), block: withoutTimestamps(fields.block) }));
        }
        changed = true;
    }

    const fields = parseObject<{ document?: string; block?: string }>(settings.get("display-fields"), {});
    if (fields.document === "" || fields.block === "") {
        settings.set("display-fields", JSON.stringify({
            document: fields.document === "" ? FIELD_TYPES.join(",") : fields.document,
            block: fields.block === "" ? FIELD_TYPES.join(",") : fields.block
        }));
        changed = true;
    }

    const appearance = parseObject<{ types?: Record<string, unknown>; values?: Record<string, unknown>; light?: unknown; dark?: unknown }>(settings.get("display-appearance"), {});
    if (!appearance.light || !appearance.dark) {
        const legacyAppearance = { types: appearance.types || {}, values: appearance.values || {} };
        settings.set("display-appearance", JSON.stringify({ light: legacyAppearance, dark: JSON.parse(JSON.stringify(legacyAppearance)) }));
        changed = true;
    }
    return changed;
}
