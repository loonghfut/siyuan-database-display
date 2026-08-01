import { FieldType } from "@/core/types";
import { requiredFeaturesForField } from "@/licensing";
import { SettingsPanelText } from "./types";

export function createFieldTypeLabel(type: FieldType, text: SettingsPanelText, showProBadge = true): HTMLElement {
    const label = document.createElement("span");
    label.className = "db-settings__field-label";
    label.append(document.createTextNode(text.fieldTypes[type]));
    if (!showProBadge || requiredFeaturesForField(type).length === 0) return label;

    const badge = document.createElement("span");
    badge.className = "db-settings__pro-badge";
    badge.textContent = text.fieldTypes.pro;
    badge.hidden = !showProBadge;
    badge.title = text.fieldTypes.proTooltip;
    badge.setAttribute("aria-label", text.fieldTypes.proTooltip);
    badge.setAttribute("role", "img");
    label.append(badge);
    return label;
}

export function setProBadgeVisibility(visible: boolean): void {
    document.querySelectorAll<HTMLElement>(".db-settings__pro-badge").forEach(badge => {
        badge.hidden = !visible;
    });
}
