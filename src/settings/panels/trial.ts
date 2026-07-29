import { showMessage } from "siyuan";
import { TrialService } from "@/licensing";
import { AddPanel, SettingsPanelText } from "../types";

function formatExpiry(value: string): string {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export function addTrialPanel(addPanel: AddPanel, text: SettingsPanelText, trial: TrialService, onChanged: () => void): void {
    addPanel("pro-trial", "", text.trial.title, text.trial.description, () => {
        const panel = document.createElement("div");
        panel.className = "db-settings--trial";
        const status = document.createElement("span");
        status.className = "db-license__status";
        status.setAttribute("role", "status");
        status.setAttribute("aria-live", "polite");
        const start = document.createElement("button");
        start.type = "button";
        start.className = "b3-button b3-button--outline";
        start.textContent = text.trial.start;

        const render = () => {
            const current = trial.getStatus();
            const available = current.state === "available";
            start.disabled = !available;
            status.classList.toggle("db-license__status--active", current.state === "active");
            status.classList.toggle("db-license__status--inactive", current.state !== "active");
            if (current.state === "active") {
                status.textContent = text.trial.active.replace("${expiresAt}", formatExpiry(current.record.expiresAt));
            } else {
                status.textContent = text.trial.status[current.state];
            }
        };

        start.addEventListener("click", () => {
            start.disabled = true;
            start.textContent = text.trial.starting;
            void trial.start().then(next => {
                onChanged();
                render();
                showMessage(next.state === "active" ? text.trial.started : text.trial.failed, 3000, next.state === "active" ? "info" : "error");
            }).finally(() => { start.textContent = text.trial.start; });
        });

        const row = document.createElement("div");
        row.className = "db-settings__row";
        const label = document.createElement("span");
        label.textContent = text.trial.statusLabel;
        row.append(label, status);
        panel.append(row, start);
        render();
        return panel;
    });
}
