import {
    DatabaseFieldRules,
    EMPTY_FIELD_RULES,
    FieldRuleSet,
    SETTING_KEY_FIELD_RULES,
    parseFieldRules,
    serializeFieldRules
} from "@/config/field-rules";
import { AttributeViewField } from "@/core/types";
import { attributeViewRepository } from "@/data/attribute-view-repository";
import { t } from "@/i18n";
import { openDatabasePicker } from "@/ui/database-picker";
import { openFieldPicker } from "@/ui/field-picker";
import { createPanel, createTextInput } from "../components/controls";
import { AddPanel, SettingsPanelText } from "../types";

type FieldRuleText = SettingsPanelText["fieldRules"];

/** 按数据库配置时的字段来源：拉取该数据库的字段供「添加」时直接挑选。 */
interface FieldSource {
    load: () => Promise<AttributeViewField[]>;
    text: FieldRuleText;
    labelType: (type: string) => string;
}

interface RuleSection {
    rules: string[];
    list: HTMLElement;
    placeholder: string;
}

function renderRuleRow(section: RuleSection, index: number, removeLabel: string, onRemove: () => void): void {
    const row = document.createElement("div");
    row.className = "db-settings__value-rule db-settings__field-rule";
    const name = createTextInput(section.rules[index], section.placeholder);
    name.dataset.ruleName = "true";
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "db-settings__remove-rule";
    remove.setAttribute("aria-label", removeLabel);
    remove.addEventListener("click", () => {
        section.rules.splice(index, 1);
        onRemove();
    });
    name.addEventListener("change", () => {
        section.rules[index] = name.value.trim();
    });
    row.append(name, remove);
    section.list.append(row);
}

function renderSection(section: RuleSection, removeLabel: string, onChanged: () => void): void {
    section.list.replaceChildren();
    section.rules.forEach((_, index) => renderRuleRow(section, index, removeLabel, () => {
        renderSection(section, removeLabel, onChanged);
        onChanged();
    }));
}

/** 一组「隐藏字段 / 强制显示」输入区：全局规则与按数据库的规则共用同一套渲染。 */
function createRuleGroup(
    state: FieldRuleSet,
    text: FieldRuleText,
    onChanged: () => void,
    source?: FieldSource
): HTMLElement {
    const group = document.createElement("div");
    group.className = "db-settings__rule-group";

    const appendRules = (title: string, rules: string[], placeholder: string, addLabel: string): void => {
        const section = document.createElement("div");
        section.className = "db-settings__value-rules";
        const heading = document.createElement("strong");
        heading.textContent = title;
        const list = document.createElement("div");
        list.className = "db-settings__value-rules-list";
        const add = document.createElement("button");
        add.type = "button";
        add.className = "b3-button b3-button--outline db-settings__add-rule";
        add.textContent = `+ ${addLabel}`;
        const data: RuleSection = { rules, list, placeholder };
        add.addEventListener("click", event => {
            // 按数据库配置时已知字段范围，直接列出供挑选；全局规则没有字段上下文，仍用空输入框
            if (source) {
                openFieldPicker({
                    target: add,
                    event,
                    text: {
                        loading: source.text.fieldPickerLoading,
                        noResult: source.text.fieldPickerNoResult,
                        loadFailed: source.text.fieldPickerFailed,
                        allExcluded: source.text.fieldPickerAllAdded
                    },
                    load: source.load,
                    exclude: rules,
                    labelType: source.labelType,
                    onPick: pick => {
                        if (rules.includes(pick.name)) return;
                        rules.push(pick.name);
                        renderSection(data, text.removeRule, onChanged);
                        onChanged();
                    }
                });
                return;
            }
            rules.push("");
            renderSection(data, text.removeRule, onChanged);
            onChanged();
            const inputs = list.querySelectorAll<HTMLInputElement>(".b3-text-field");
            inputs[inputs.length - 1]?.focus();
        });
        renderSection(data, text.removeRule, onChanged);
        section.append(heading, list, add);
        group.append(section);
    };

    appendRules(text.hidden, state.hidden, text.hiddenPlaceholder, text.addHidden);
    appendRules(text.force, state.force, text.forcePlaceholder, text.addForce);
    return group;
}

/**
 * 「字段例外」面板：全局规则 + 按数据库的规则。
 * 按数据库的规则与全局规则取并集，只影响所选数据库。
 */
export function addFieldRulesPanel(addPanel: AddPanel, text: SettingsPanelText): void {
    const panelText = text.fieldRules;
    addPanel(SETTING_KEY_FIELD_RULES, EMPTY_FIELD_RULES, panelText.title, panelText.description, (value, commit) => {
        const state = parseFieldRules(value);
        const panel = createPanel("db-settings--rules");

        const save = (): void => {
            const nextValue = serializeFieldRules(state);
            panel.dataset.value = nextValue;
            commit(nextValue);
        };

        const globalSection = document.createElement("section");
        globalSection.className = "db-settings__value-rules";
        const globalTitle = document.createElement("strong");
        globalTitle.textContent = panelText.global;
        globalSection.append(globalTitle, createRuleGroup(state.global, panelText, save));

        const databaseSection = document.createElement("section");
        databaseSection.className = "db-settings__value-rules";
        const databaseTitle = document.createElement("strong");
        databaseTitle.textContent = panelText.perDatabase;
        const databaseHint = document.createElement("p");
        databaseHint.className = "db-settings__hint";
        databaseHint.textContent = panelText.perDatabaseHint;
        const databaseList = document.createElement("div");
        databaseList.className = "db-settings__database-rules";
        const addDatabase = document.createElement("button");
        addDatabase.type = "button";
        addDatabase.className = "b3-button b3-button--outline db-settings__add-rule";
        addDatabase.textContent = `+ ${panelText.addDatabase}`;

        const createDatabaseRule = (database: DatabaseFieldRules): HTMLElement => {
            const block = document.createElement("div");
            block.className = "db-settings__database-rule";
            const head = document.createElement("div");
            head.className = "db-settings__database-rule-head";
            const name = document.createElement("span");
            name.className = "db-settings__pinned-name";
            name.textContent = database.name || panelText.unnamed;
            const remove = document.createElement("button");
            remove.type = "button";
            remove.className = "db-settings__remove-rule";
            remove.title = panelText.removeDatabase;
            remove.setAttribute("aria-label", panelText.removeDatabase);
            remove.addEventListener("click", () => {
                state.databases = state.databases.filter(item => item !== database);
                renderDatabases();
                save();
            });
            head.append(name, remove);
            const source: FieldSource = {
                load: () => attributeViewRepository.getFields(database.avID),
                text: panelText,
                labelType: type => (text.fieldTypes as Record<string, string>)[type] || ""
            };
            block.append(head, createRuleGroup(database, panelText, save, source));
            return block;
        };

        const renderDatabases = (): void => {
            databaseList.replaceChildren();
            if (state.databases.length === 0) {
                const empty = document.createElement("div");
                empty.className = "b3-label__text";
                empty.textContent = panelText.empty;
                databaseList.append(empty);
                return;
            }
            state.databases.forEach(database => databaseList.append(createDatabaseRule(database)));
        };

        addDatabase.addEventListener("click", event => {
            openDatabasePicker({
                target: addDatabase,
                event,
                pinned: [],
                // 已配置的数据库不再列出，避免同一数据库重复添加
                exclude: state.databases.map(database => database.avID),
                text: {
                    placeholder: t("slash.pickerPlaceholder"),
                    searchAll: t("slash.searchAll"),
                    noResult: t("slash.noResult"),
                    allExcluded: t("slash.allAdded"),
                    loading: t("slash.loading"),
                    searchFailed: t("slash.searchFailed")
                },
                search: keyword => attributeViewRepository.searchAttributeView(keyword),
                onPick: (pick): void => {
                    if (state.databases.some(item => item.avID === pick.avID)) return;
                    state.databases.push({ avID: pick.avID, name: pick.name, hidden: [], force: [] });
                    renderDatabases();
                    save();
                }
            });
        });

        renderDatabases();
        databaseSection.append(databaseTitle, databaseHint, databaseList, addDatabase);
        panel.addEventListener("change", save);
        panel.append(globalSection, databaseSection);
        return panel;
    });
}
