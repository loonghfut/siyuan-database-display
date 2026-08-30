import { I18nDictionary } from "@/i18n";
import type { ProFeature } from "@/licensing";
import { bindCommit, createCheckbox, createLabel, createPanel, createSelect, parseObject } from "../components/controls";
import { AddPanel, SettingsPanelText } from "../types";

export function addDisplayFormatPanel(
    addPanel: AddPanel,
    text: SettingsPanelText,
    i18n: I18nDictionary,
    shouldShowProBadge: () => boolean,
    isFeatureEnabled: (feature: ProFeature) => boolean
): void {
    addPanel("display-format", JSON.stringify({ dateFormat: "YYYY-MM-DD", includeTime: false, checkboxStyle: "icon", maxDisplayLength: 30, showFieldNames: false, listFontSize: 12, listMultiColumn: true, listLayoutStyle: "grid", listItemStyle: "plain", listLineHeight: "normal", listRowGap: "normal", listValueLines: "unlimited", listItemRadius: "auto", alignFieldNames: true, cardEnabled: true, cardRadius: "auto", cardPadding: "normal", editTrigger: "click", layout: "below" }), text.format.title, text.format.description, (value, commit) => {
        const state = parseObject<{ dateFormat?: string; includeTime?: boolean; checkboxStyle?: string; maxDisplayLength?: number; showFieldNames?: boolean; listFontSize?: number; listMultiColumn?: boolean; listLayoutStyle?: string; listItemStyle?: string; listLineHeight?: string; listRowGap?: string; listValueLines?: string; listItemRadius?: string; alignFieldNames?: boolean; cardEnabled?: boolean; cardRadius?: string; cardPadding?: string; editTrigger?: string; layout?: string }>(value, {});
        const panel = createPanel("db-settings--format");
        const layout = createSelect(text.format.layoutOptions, state.layout === "above" ? "above" : state.layout === "inline" ? "inline" : "below");
        const listLayoutStyle = createSelect(text.format.listLayoutStyleOptions, state.listLayoutStyle === "waterfall" ? "waterfall" : "grid");
        const listItemStyle = createSelect(text.format.listItemStyleOptions, state.listItemStyle === "capsule" ? "capsule" : state.listItemStyle === "accent" ? "accent" : "plain");
        const canUseListLayout = isFeatureEnabled("list-layout");
        if (!canUseListLayout) {
            layout.querySelectorAll<HTMLOptionElement>('option[value="above"], option[value="below"]').forEach(option => option.disabled = true);
            layout.value = "inline";
            layout.title = text.format.listProTooltip;
        }
        const editTrigger = createSelect(text.format.editTriggerOptions, state.editTrigger === "dblclick" ? "dblclick" : "click");
        const canUseInlineEdit = isFeatureEnabled("inline-edit");
        editTrigger.disabled = !canUseInlineEdit;
        if (!canUseInlineEdit) editTrigger.title = text.format.inlineEditProTooltip;
        const date = createSelect(i18n.settings.dateFormat.options, state.dateFormat || "YYYY-MM-DD");
        const checkbox = createSelect(i18n.settings.checkboxStyle.options, state.checkboxStyle === "text" ? "text" : "icon");
        const includeTime = createCheckbox(Boolean(state.includeTime));
        const showFieldNames = createCheckbox(state.showFieldNames === true);
        const cardEnabled = createCheckbox(state.cardEnabled !== false);
        const multiColumn = createCheckbox(state.listMultiColumn !== false);
        const alignFieldNames = createCheckbox(state.alignFieldNames !== false);
        const listLayoutStyleRow = createLabel(text.format.listLayoutStyle, listLayoutStyle);
        const multiColumnRow = createLabel(text.format.multiColumn, multiColumn);
        const fontSize = document.createElement("input");
        fontSize.type = "number";
        fontSize.className = "b3-text-field";
        fontSize.min = "10";
        fontSize.max = "24";
        fontSize.value = String(Math.min(24, Math.max(10, Number(state.listFontSize) || 12)));
        const length = document.createElement("input");
        length.type = "number";
        length.className = "b3-text-field";
        length.min = "10";
        length.max = "200";
        length.value = String(state.maxDisplayLength || 30);
        // 可选的列表版式微调：未改动时与内置版式一致
        const lineHeight = createSelect(text.format.listLineHeightOptions, state.listLineHeight === "compact" ? "compact" : state.listLineHeight === "relaxed" ? "relaxed" : "normal");
        const rowGap = createSelect(text.format.listRowGapOptions, state.listRowGap === "tight" ? "tight" : state.listRowGap === "relaxed" ? "relaxed" : "normal");
        const valueLines = createSelect(text.format.listValueLinesOptions, state.listValueLines === "one" ? "one" : state.listValueLines === "two" ? "two" : state.listValueLines === "three" ? "three" : "unlimited");
        const itemRadius = createSelect(text.format.listItemRadiusOptions, ["none", "small", "medium", "pill"].includes(state.listItemRadius || "") ? state.listItemRadius as string : "auto");
        const cardRadius = createSelect(text.format.cardRadiusOptions, ["none", "small", "medium", "large"].includes(state.cardRadius || "") ? state.cardRadius as string : "auto");
        const cardPadding = createSelect(text.format.cardPaddingOptions, state.cardPadding === "tight" ? "tight" : "normal");
        const listSettings = document.createElement("div");
        listSettings.className = "db-settings__list-options";
        const listHint = document.createElement("p");
        listHint.className = "db-settings__hint";
        listHint.textContent = text.format.listHint;
        const itemRadiusRow = createLabel(text.format.listItemRadius, itemRadius);
        listSettings.append(
            listHint,
            listLayoutStyleRow,
            createLabel(text.format.listItemStyle, listItemStyle),
            itemRadiusRow,
            createLabel(text.format.fontSize, fontSize),
            createLabel(text.format.listLineHeight, lineHeight),
            createLabel(text.format.listRowGap, rowGap),
            createLabel(text.format.listValueLines, valueLines),
            createLabel(text.format.alignFieldNames, alignFieldNames),
            multiColumnRow
        );
        const cardSettings = document.createElement("div");
        cardSettings.className = "db-settings__list-options";
        const cardHint = document.createElement("p");
        cardHint.className = "db-settings__hint";
        cardHint.textContent = text.format.cardHint;
        cardSettings.append(cardHint, createLabel(text.format.cardRadius, cardRadius), createLabel(text.format.cardPadding, cardPadding));
        const syncListSettingsVisibility = (): void => {
            const listVisible = canUseListLayout && layout.value !== "inline";
            listSettings.classList.toggle("fn__none", !listVisible);
            multiColumnRow.classList.toggle("fn__none", !listVisible || listLayoutStyle.value === "waterfall");
            // 圆角只对胶囊徽章生效，其他列表项样式下隐藏该行
            itemRadiusRow.classList.toggle("fn__none", listItemStyle.value !== "capsule");
        };
        const syncCardSettingsVisibility = (): void => {
            cardSettings.classList.toggle("fn__none", !cardEnabled.checked);
        };
        layout.addEventListener("change", syncListSettingsVisibility);
        listLayoutStyle.addEventListener("change", syncListSettingsVisibility);
        listItemStyle.addEventListener("change", syncListSettingsVisibility);
        cardEnabled.addEventListener("change", syncCardSettingsVisibility);
        syncListSettingsVisibility();
        syncCardSettingsVisibility();
        const layoutRow = createLabel(text.format.layout, layout);
        const layoutTitle = layoutRow.firstElementChild as HTMLElement;
        layoutTitle.classList.add("db-settings__field-label");
        if (shouldShowProBadge()) {
            const proBadge = document.createElement("span");
            proBadge.className = "db-settings__pro-badge";
            proBadge.textContent = text.fieldTypes.pro;
            proBadge.title = text.format.listProTooltip;
            layoutTitle.append(proBadge);
        }
        const betaBadge = document.createElement("span");
        betaBadge.className = "db-settings__beta-badge";
        betaBadge.textContent = text.format.beta;
        betaBadge.title = text.format.listProTooltip;
        layoutTitle.append(betaBadge);
        const editTriggerRow = createLabel(text.format.editTrigger, editTrigger);
        const editTriggerTitle = editTriggerRow.firstElementChild as HTMLElement;
        editTriggerTitle.classList.add("db-settings__field-label");
        if (shouldShowProBadge()) {
            const proBadge = document.createElement("span");
            proBadge.className = "db-settings__pro-badge";
            proBadge.textContent = text.fieldTypes.pro;
            proBadge.title = text.format.inlineEditProTooltip;
            editTriggerTitle.append(proBadge);
        }
        const cardRow = createLabel(text.format.card, cardEnabled);
        panel.append(layoutRow, listSettings, editTriggerRow, createLabel(text.format.date, date), createLabel(text.format.checkbox, checkbox), createLabel(text.format.time, includeTime), createLabel(text.format.fieldNames, showFieldNames), cardRow, cardSettings, createLabel(text.format.maxLength, length));
        bindCommit(panel, () => {
            const nextValue = JSON.stringify({ dateFormat: date.value, checkboxStyle: checkbox.value, includeTime: includeTime.checked, maxDisplayLength: Math.min(200, Math.max(10, Number(length.value) || 30)), showFieldNames: showFieldNames.checked, listFontSize: Math.min(24, Math.max(10, Number(fontSize.value) || 12)), listMultiColumn: multiColumn.checked, listLayoutStyle: listLayoutStyle.value === "waterfall" ? "waterfall" : "grid", listItemStyle: listItemStyle.value === "capsule" ? "capsule" : listItemStyle.value === "accent" ? "accent" : "plain", listLineHeight: lineHeight.value === "compact" ? "compact" : lineHeight.value === "relaxed" ? "relaxed" : "normal", listRowGap: rowGap.value === "tight" ? "tight" : rowGap.value === "relaxed" ? "relaxed" : "normal", listValueLines: valueLines.value === "one" ? "one" : valueLines.value === "two" ? "two" : valueLines.value === "three" ? "three" : "unlimited", listItemRadius: itemRadius.value === "none" ? "none" : itemRadius.value === "small" ? "small" : itemRadius.value === "medium" ? "medium" : itemRadius.value === "pill" ? "pill" : "auto", alignFieldNames: alignFieldNames.checked, cardEnabled: cardEnabled.checked, cardRadius: cardRadius.value === "none" ? "none" : cardRadius.value === "small" ? "small" : cardRadius.value === "medium" ? "medium" : cardRadius.value === "large" ? "large" : "auto", cardPadding: cardPadding.value === "tight" ? "tight" : cardPadding.value === "loose" ? "loose" : "normal", editTrigger: editTrigger.value === "dblclick" ? "dblclick" : "click", layout: layout.value === "above" ? "above" : layout.value === "inline" ? "inline" : "below" });
            panel.dataset.value = nextValue;
            commit(nextValue);
        });
        return panel;
    });
}
