import { getI18n } from "@/i18n";
import { SettingUtils } from "@/libs/setting-utils";
import { addAppearancePanel } from "./panels/appearance";
import { addDisplayFieldsPanel } from "./panels/display-fields";
import { addDisplayFormatPanel } from "./panels/display-format";
import { addFieldRulesPanel } from "./panels/field-rules";
import { addRefreshPanel } from "./panels/refresh";
import { addLicensePanel } from "./panels/license";
import { LicenseService, TrialService } from "@/licensing";
import type { ProFeature } from "@/licensing";
import { AddPanel } from "./types";
import { installSettingsHeaderNavigation } from "./header-navigation";
import { setProBadgeVisibility } from "./field-type-label";

export { migrateLegacySettings } from "./migration";

export function addSettings(
    settings: SettingUtils,
    onChanged: () => void,
    license: LicenseService,
    trial: TrialService,
    isFeatureEnabled: (feature: ProFeature) => boolean
): void {
    settings.addData("pro-trial-records", "[]");
    settings.addData("show-pro-badge", true);
    const i18n = getI18n();
    const shouldShowProBadge = (): boolean => settings.get("show-pro-badge") !== false;
    const saveShowProBadge = (value: boolean): void => {
        void settings.setAndSave("show-pro-badge", value).then(() => {
            setProBadgeVisibility(value);
            onChanged();
        });
    };
    const addPanel: AddPanel = (key, value, title, description, render) => {
        settings.addItem({
            key,
            value,
            type: "custom",
            title,
            description,
            direction: "row",
            createElement: current => {
                const panel = render(String(current || value), next => {
                    settings.set(key, next);
                    void settings.save().then(onChanged);
                });
                panel.dataset.value = String(current || value);
                return panel;
            },
            getEleVal: element => element?.dataset.value || value,
            setEleVal: (element, next) => {
                if (element) element.dataset.value = String(next || value);
            }
        });
    };
    addDisplayFieldsPanel(addPanel, i18n.settings.panel, shouldShowProBadge, isFeatureEnabled);
    addFieldRulesPanel(addPanel, i18n.settings.panel);
    addDisplayFormatPanel(addPanel, i18n.settings.panel, i18n);
    addAppearancePanel(addPanel, i18n.settings.panel, shouldShowProBadge);
    addRefreshPanel(addPanel, i18n.settings.panel);
    addLicensePanel(addPanel, i18n.settings.panel, license, trial, onChanged, shouldShowProBadge, saveShowProBadge);
    installSettingsHeaderNavigation(settings, [
        { key: "display-fields", title: i18n.settings.panel.displayFields.title },
        { key: "field-rules", title: i18n.settings.panel.fieldRules.title },
        { key: "format", title: i18n.settings.panel.format.title },
        { key: "appearance", title: i18n.settings.panel.appearance.title },
        { key: "refresh", title: i18n.settings.panel.refresh.title },
        { key: "license", title: i18n.settings.panel.license.title }
    ]);
}
