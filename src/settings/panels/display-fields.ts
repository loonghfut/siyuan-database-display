import { parseCsv } from "@/config/display-config";
import { FIELD_TYPES } from "@/core/types";
import { bindCommit, createCheckbox, createPanel, parseObject } from "../components/controls";
import { AddPanel, SettingsPanelText } from "../types";

export function addDisplayFieldsPanel(addPanel: AddPanel, text: SettingsPanelText): void {
    addPanel("display-fields", JSON.stringify({ document: FIELD_TYPES.join(","), block: "mSelect,text,relation" }), text.displayFields.title, text.displayFields.description, (value, commit) => {
        const state = parseObject<{ document?: string; block?: string }>(value, {});
        const panel = createPanel("db-settings--fields");
        const selected = { document: new Set(parseCsv(state.document)), block: new Set(parseCsv(state.block)) };
        (["document", "block"] as const).forEach(scope => {
            const section = document.createElement("section");
            const heading = document.createElement("strong");
            heading.textContent = scope === "document" ? text.displayFields.document : text.displayFields.block;
            const chips = document.createElement("div");
            chips.className = "db-settings__chips";
            FIELD_TYPES.forEach(type => {
                const label = document.createElement("label");
                label.className = "db-settings__check";
                const input = createCheckbox(selected[scope].has(type), true);
                input.dataset.scope = scope;
                input.dataset.type = type;
                label.append(input, document.createTextNode(text.fieldTypes[type]));
                chips.append(label);
            });
            section.append(heading, chips);
            panel.append(section);
        });
        bindCommit(panel, () => {
            const next = { document: [] as string[], block: [] as string[] };
            panel.querySelectorAll<HTMLInputElement>("input[data-scope]").forEach(input => {
                if (input.checked) next[input.dataset.scope as "document" | "block"].push(input.dataset.type || "");
            });
            const nextValue = JSON.stringify({ document: next.document.join(","), block: next.block.join(",") });
            panel.dataset.value = nextValue;
            commit(nextValue);
        });
        return panel;
    });
}
