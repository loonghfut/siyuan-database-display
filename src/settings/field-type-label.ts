import { FieldType } from "@/core/types";
import { requiredFeaturesForField } from "@/licensing";
import { SettingsPanelText } from "./types";

export function fieldTypeLabel(type: FieldType, text: SettingsPanelText): string {
    return requiredFeaturesForField(type).length
        ? `${text.fieldTypes[type]} ${text.fieldTypes.pro}`
        : text.fieldTypes[type];
}
