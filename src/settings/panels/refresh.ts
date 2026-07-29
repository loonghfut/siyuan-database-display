import { bindCommit, createCheckbox, createLabel, createPanel, parseObject } from "../components/controls";
import { AddPanel, SettingsPanelText } from "../types";

export function addRefreshPanel(addPanel: AddPanel, text: SettingsPanelText): void {
    addPanel("refresh-options", JSON.stringify({ interval: 0, observerEnabled: true }), text.refresh.title, text.refresh.description, (value, commit) => {
        const state = parseObject<{ interval?: number; observerEnabled?: boolean }>(value, {});
        const panel = createPanel("db-settings--refresh");
        const interval = document.createElement("input");
        interval.type = "number";
        interval.className = "b3-text-field";
        interval.min = "0";
        interval.value = String(state.interval || 0);
        const observer = createCheckbox(state.observerEnabled !== false);
        panel.append(createLabel(text.refresh.interval, interval), createLabel(text.refresh.observer, observer));
        bindCommit(panel, () => {
            const nextValue = JSON.stringify({ interval: Number(interval.value) > 0 ? Math.max(5, Number(interval.value)) : 0, observerEnabled: observer.checked });
            panel.dataset.value = nextValue;
            commit(nextValue);
        });
        return panel;
    });
}
