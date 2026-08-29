import { getI18n } from "@/i18n";
import { SettingUtils } from "@/libs/setting-utils";
import { addAppearancePanel } from "./panels/appearance";
import { addDisplayFieldsPanel } from "./panels/display-fields";
import { addDisplayFormatPanel } from "./panels/display-format";
import { addFieldRulesPanel } from "./panels/field-rules";
import { addPinnedDatabasesPanel } from "./panels/pinned-databases";
import { addLicensePanel } from "./panels/license";
import { LicenseService, TrialService } from "@/licensing";
import type { ProFeature } from "@/licensing";
import { AddPanel } from "./types";
import { installSettingsHeaderNavigation } from "./header-navigation";
import { installMobileSettingsSheet, isMobileFrontend } from "./mobile-sheet";
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
    addDisplayFormatPanel(addPanel, i18n.settings.panel, i18n, shouldShowProBadge, isFeatureEnabled);
    addAppearancePanel(addPanel, i18n.settings.panel, shouldShowProBadge);
    addPinnedDatabasesPanel(addPanel, i18n.settings.panel);
    addLicensePanel(addPanel, i18n.settings.panel, license, trial, onChanged, shouldShowProBadge, saveShowProBadge);
    installMobileSettingsSheet(settings);
    // 匹配面板项用完整 title；移动端导航空间有限，按钮文案用两字短标题，避免被把手遮挡
    const compact = isMobileFrontend();
    installSettingsHeaderNavigation(settings, [
        { key: "display-fields", title: i18n.settings.panel.displayFields.title, label: compact ? i18n.settings.panel.displayFields.shortTitle : undefined },
        { key: "field-rules", title: i18n.settings.panel.fieldRules.title, label: compact ? i18n.settings.panel.fieldRules.shortTitle : undefined },
        { key: "format", title: i18n.settings.panel.format.title, label: compact ? i18n.settings.panel.format.shortTitle : undefined },
        { key: "appearance", title: i18n.settings.panel.appearance.title, label: compact ? i18n.settings.panel.appearance.shortTitle : undefined },
        { key: "pinned-databases", title: i18n.settings.panel.pinnedDatabases.title, label: compact ? i18n.settings.panel.pinnedDatabases.shortTitle : undefined },
        { key: "license", title: i18n.settings.panel.license.title, label: compact ? i18n.settings.panel.license.shortTitle : undefined }
    ]);
}
