import { showMessage } from "siyuan";
import { LicenseService, TrialService } from "@/licensing";
import { createCheckbox, createLabel } from "../components/controls";
import { AddPanel, SettingsPanelText } from "../types";

// Fill this in when the Pro application page is ready.
const PRO_APPLICATION_URL = "https://www.kdocs.cn/l/cqkfx6NVc2BE?linkname=Diz87RtY2M";

async function copyText(value: string): Promise<void> {
    if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        return;
    }
    const input = document.createElement("textarea");
    input.value = value;
    document.body.append(input);
    input.select();
    document.execCommand("copy");
    input.remove();
}

function formatExpiry(value: string): string {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function addApplicationButton(panel: HTMLElement, label: string): void {
    queueMicrotask(() => {
        const configItem = panel.closest<HTMLElement>(".config-item");
        configItem?.classList.add("config-item--has-license");
        const title = configItem?.querySelector<HTMLElement>(".config-name");
        if (!title || title.querySelector(".db-license__apply")) return;

        const apply = document.createElement("button");
        apply.type = "button";
        apply.className = "b3-button b3-button--outline db-license__apply";
        apply.textContent = label;
        apply.addEventListener("click", () => {
            if (PRO_APPLICATION_URL) window.open(PRO_APPLICATION_URL, "_blank", "noopener,noreferrer");
        });
        title.append(apply);
    });
}

export function addLicensePanel(
    addPanel: AddPanel,
    text: SettingsPanelText,
    license: LicenseService,
    trial: TrialService,
    onChanged: () => void,
    shouldShowProBadge: () => boolean,
    onShowProBadgeChanged: (value: boolean) => void
): void {
    addPanel("pro-license", "", text.license.title, text.license.description, (value, commit) => {
        const panel = document.createElement("div");
        panel.className = "db-settings--license";
        addApplicationButton(panel, text.license.apply);
        const userId = window.siyuan?.user?.userId || "";

        const status = document.createElement("span");
        status.className = "db-license__status";
        status.setAttribute("role", "status");
        status.setAttribute("aria-live", "polite");
        const startTrial = document.createElement("button");
        startTrial.type = "button";
        startTrial.className = "b3-button b3-button--outline";
        startTrial.classList.add("fn__none");
        startTrial.textContent = text.trial.start;

        const renderStatus = (next = license.getStatus()) => {
            const trialStatus = trial.getStatus();
            const trialActive = !next.valid && trialStatus.state === "active";
            const canStartTrial = !next.valid && trialStatus.state === "available";
            // Use SiYuan's visibility utility class so it remains effective after
            // the settings framework adds its layout classes.
            startTrial.classList.toggle("fn__none", !canStartTrial);

            if (trialActive) {
                status.classList.add("db-license__status--active");
                status.classList.remove("db-license__status--inactive");
                status.textContent = text.trial.active.replace("${expiresAt}", formatExpiry(trialStatus.record.expiresAt));
                return;
            }
            if ("reason" in next) {
                status.classList.remove("db-license__status--active");
                status.classList.add("db-license__status--inactive");
                status.textContent = text.license.status[next.reason];
                return;
            }
            status.classList.add("db-license__status--active");
            status.classList.remove("db-license__status--inactive");
            status.textContent = text.license.status.active;
        };
        const updateStatus = async () => {
            const next = await license.refresh(licenseInput.value);
            renderStatus(next);
            return next;
        };

        startTrial.addEventListener("click", () => {
            startTrial.disabled = true;
            startTrial.textContent = text.trial.starting;
            void trial.start().then(next => {
                onChanged();
                renderStatus();
                showMessage(next.state === "active" ? text.trial.started : text.trial.failed, 3000, next.state === "active" ? "info" : "error");
            }).catch(() => {
                renderStatus();
                showMessage(text.trial.failed, 3000, "error");
            }).finally(() => {
                startTrial.disabled = false;
                startTrial.textContent = text.trial.start;
            });
        });

        const statusRow = document.createElement("div");
        statusRow.className = "db-settings__row";
        const statusLabel = document.createElement("span");
        statusLabel.textContent = text.license.statusLabel;
        const statusActions = document.createElement("div");
        statusActions.className = "db-license__status-actions";
        statusActions.append(status, startTrial);
        statusRow.append(statusLabel, statusActions);

        const userIdInput = document.createElement("input");
        userIdInput.className = "b3-text-field";
        userIdInput.value = userId;
        userIdInput.readOnly = true;
        const copy = document.createElement("button");
        copy.type = "button";
        copy.className = "b3-button b3-button--outline";
        copy.textContent = text.license.copyUserId;
        copy.disabled = !userId;
        copy.addEventListener("click", () => {
            void copyText(userId).then(() => {
                copy.textContent = text.license.copiedUserId;
                window.setTimeout(() => { copy.textContent = text.license.copyUserId; }, 1500);
            }).catch(() => undefined);
        });
        const userRow = document.createElement("div");
        userRow.className = "fn__flex";
        userRow.append(userIdInput, copy);
        const idRow = document.createElement("label");
        idRow.className = "db-settings__row";
        const idLabel = document.createElement("span");
        idLabel.textContent = text.license.userId;
        idRow.append(idLabel, userRow);

        const showProBadge = createCheckbox(shouldShowProBadge());
        showProBadge.addEventListener("change", () => onShowProBadgeChanged(showProBadge.checked));
        const showProBadgeRow = createLabel(text.license.showProBadge, showProBadge);

        const licenseInput = document.createElement("input");
        licenseInput.id = "db-pro-license-input";
        licenseInput.className = "b3-text-field fn__block";
        licenseInput.type = "text";
        licenseInput.placeholder = text.license.placeholder;
        licenseInput.value = value;

        const verify = document.createElement("button");
        verify.type = "button";
        verify.className = "b3-button b3-button--outline";
        verify.textContent = text.license.verify;

        const clear = document.createElement("button");
        clear.type = "button";
        clear.className = "b3-button b3-button--outline";
        clear.textContent = text.license.clear;
        clear.disabled = !licenseInput.value;

        const saveAndVerify = async (clearing = false) => {
            panel.dataset.value = licenseInput.value;
            commit(licenseInput.value);
            verify.disabled = true;
            verify.textContent = text.license.verifying;
            const next = await updateStatus();
            verify.disabled = false;
            verify.textContent = text.license.verify;
            clear.disabled = !licenseInput.value;
            if (clearing) {
                licenseDetails.open = false;
                showMessage(text.license.cleared, 3000, "info");
                return;
            }
            showMessage("reason" in next ? text.license.verifyFailed : text.license.verifySuccess, 3000, "reason" in next ? "error" : "info");
        };
        verify.addEventListener("click", () => void saveAndVerify());
        clear.addEventListener("click", () => {
            licenseInput.value = "";
            void saveAndVerify(true);
        });
        licenseInput.addEventListener("input", () => { clear.disabled = !licenseInput.value; });

        const actions = document.createElement("div");
        actions.className = "db-license__actions";
        actions.append(verify, clear);
        const licenseDetails = document.createElement("details");
        licenseDetails.className = "db-license__license-group";
        const licenseSummary = document.createElement("summary");
        licenseSummary.textContent = text.license.license;
        const licenseContent = document.createElement("div");
        licenseContent.className = "db-license__license-content";
        licenseContent.append(licenseInput, actions);
        licenseDetails.append(licenseSummary, licenseContent);

        panel.append(statusRow, showProBadgeRow, idRow, licenseDetails);
        void updateStatus();
        return panel;
    });
}
