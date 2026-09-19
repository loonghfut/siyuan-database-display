import {
    DEFAULT_SLASH_TIMINGS,
    SETTING_KEY_SLASH_TIMINGS,
    SlashTimings,
    parseSlashTimings,
    serializeSlashTimings
} from "@/config/slash-timings";
import { bindCommit, createLabel, createPanel } from "../components/controls";
import { AddPanel, SettingsPanelText } from "../types";

/**
 * 「斜杠命令时序」面板：配置擦除前延时参数。
 */
export function addSlashTimingsPanel(addPanel: AddPanel, text: SettingsPanelText): void {
    const panelText = text.slashTimings;
    addPanel(SETTING_KEY_SLASH_TIMINGS, serializeSlashTimings(DEFAULT_SLASH_TIMINGS), panelText.title, panelText.description, (value, commit) => {
        const panel = createPanel("db-settings--slash-timings");
        const timings = parseSlashTimings(value);

        const fields: Array<{ key: keyof SlashTimings; label: string; hint: string; min: number; max: number; step: number }> = [
            { key: "preEraseDelayMs", label: panelText.preEraseDelay, hint: panelText.preEraseDelayHint, min: 0, max: 2000, step: 50 },
        ];

        const inputs = new Map<keyof SlashTimings, HTMLInputElement>();

        for (const field of fields) {
            const input = document.createElement("input");
            input.type = "number";
            input.className = "b3-text-field";
            input.min = String(field.min);
            input.max = String(field.max);
            input.step = String(field.step);
            input.value = String(timings[field.key]);

            const row = createLabel(field.label, input);
            row.title = field.hint;
            panel.append(row);

            // 可见范围提示（移动端友好）
            const rangeHint = document.createElement("p");
            rangeHint.className = "db-settings__hint";
            rangeHint.textContent = field.hint;
            panel.append(rangeHint);

            inputs.set(field.key, input);
        }

        // 调参建议
        const tipsSection = document.createElement("div");
        tipsSection.className = "db-settings__list-options";
        const tipsTitle = document.createElement("strong");
        tipsTitle.textContent = panelText.tuningTips;
        tipsSection.append(tipsTitle);
        panelText.tuningTipsContent.split("\n").forEach(line => {
            const hint = document.createElement("p");
            hint.className = "db-settings__hint";
            hint.textContent = line;
            tipsSection.append(hint);
        });
        panel.append(tipsSection);

        const save = (): void => {
            // 复用 parseSlashTimings 进行归一化 + clamp，确保写入值合法
            const raw = JSON.stringify({
                preEraseDelayMs: inputs.get("preEraseDelayMs")!.value,
            });
            const normalized = parseSlashTimings(raw);
            // 将 clamp 后的实际生效值回写 input，保持 UI 与运行时一致
            inputs.get("preEraseDelayMs")!.value = String(normalized.preEraseDelayMs);
            const serialized = serializeSlashTimings(normalized);
            panel.dataset.value = serialized;
            commit(serialized);
        };

        // 恢复默认值按钮
        const restoreBtn = document.createElement("button");
        restoreBtn.type = "button";
        restoreBtn.className = "b3-button b3-button--outline db-settings__restore-defaults";
        restoreBtn.textContent = panelText.restoreDefaults;
        restoreBtn.addEventListener("click", () => {
            inputs.get("preEraseDelayMs")!.value = String(DEFAULT_SLASH_TIMINGS.preEraseDelayMs);
            save();
        });
        panel.append(restoreBtn);

        bindCommit(panel, save);
        return panel;
    });
}
