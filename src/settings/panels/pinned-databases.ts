import {
    EMPTY_PINNED_DATABASES,
    PinnedDatabase,
    SETTING_KEY_PINNED_DATABASES,
    parsePinnedDatabases,
    serializePinnedDatabases
} from "@/config/pinned-databases";
import { attributeViewRepository } from "@/data/attribute-view-repository";
import { t } from "@/i18n";
import { openDatabasePicker } from "@/ui/database-picker";
import { createPanel } from "../components/controls";
import { AddPanel, SettingsPanelText } from "../types";

/**
 * 「斜杠命令数据库」面板：维护 / 命令优先列出的数据库。
 * 选择数据库时复用与 / 命令同一个弹层，只是这里不传常用列表，直接列出全部。
 */
export function addPinnedDatabasesPanel(addPanel: AddPanel, text: SettingsPanelText): void {
    const panelText = text.pinnedDatabases;
    addPanel(SETTING_KEY_PINNED_DATABASES, EMPTY_PINNED_DATABASES, panelText.title, panelText.description, (value, commit) => {
        const panel = createPanel("db-settings--pinned-databases");
        let databases = parsePinnedDatabases(value);

        const list = document.createElement("div");
        list.className = "db-settings__value-rules-list";

        const add = document.createElement("button");
        add.type = "button";
        add.className = "b3-button b3-button--outline db-settings__add-rule";
        add.textContent = `+ ${panelText.add}`;

        const save = (): void => {
            const next = serializePinnedDatabases(databases);
            panel.dataset.value = next;
            commit(next);
        };

        const render = (): void => {
            list.replaceChildren();
            if (databases.length === 0) {
                const empty = document.createElement("div");
                empty.className = "b3-label__text";
                empty.textContent = panelText.empty;
                list.append(empty);
                return;
            }
            databases.forEach((database, index) => {
                const row = document.createElement("div");
                row.className = "db-settings__value-rule db-settings__pinned-row";
                const name = document.createElement("span");
                name.className = "db-settings__pinned-name";
                name.textContent = database.name || panelText.unnamed;
                const remove = document.createElement("button");
                remove.type = "button";
                remove.className = "db-settings__remove-rule";
                remove.title = panelText.remove;
                remove.setAttribute("aria-label", panelText.remove);
                remove.addEventListener("click", () => {
                    databases.splice(index, 1);
                    render();
                    save();
                });
                row.append(name, remove);
                list.append(row);
            });
        };

        add.addEventListener("click", event => {
            openDatabasePicker({
                target: add,
                event,
                pinned: [],
                text: {
                    placeholder: t("slash.pickerPlaceholder"),
                    searchAll: t("slash.searchAll"),
                    noResult: t("slash.noResult"),
                    loading: t("slash.loading"),
                    searchFailed: t("slash.searchFailed")
                },
                search: keyword => attributeViewRepository.searchAttributeView(keyword),
                onPick: (pick): void => {
                    if (databases.some(item => item.avID === pick.avID)) return;
                    const database: PinnedDatabase = {
                        avID: pick.avID,
                        name: pick.name,
                        ...(pick.blockID ? { blockID: pick.blockID } : {})
                    };
                    databases.push(database);
                    render();
                    save();
                }
            });
        });

        render();
        panel.append(list, add);
        return panel;
    });
}
