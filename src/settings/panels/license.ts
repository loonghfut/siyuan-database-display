import { showMessage } from "siyuan";
import { LicenseService } from "@/licensing";
import { AddPanel, SettingsPanelText } from "../types";

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

export function addLicensePanel(addPanel: AddPanel, text: SettingsPanelText, license: LicenseService): void {
    addPanel("pro-license", "", text.license.title, text.license.description, (value, commit) => {
        const panel = document.createElement("div");
        panel.className = "db-settings--license";
        const userId = window.siyuan?.user?.userId || "";

        const status = document.createElement("span");
        status.className = "db-license__status";
        status.setAttribute("role", "status");
        status.setAttribute("aria-live", "polite");
        const updateStatus = async () => {
            const next = await license.refresh(licenseInput.value);
            if ("reason" in next) {
                status.classList.remove("db-license__status--active");
                status.classList.add("db-license__status--inactive");
                status.textContent = text.license.status[next.reason];
                return next;
            }
            status.classList.add("db-license__status--active");
            status.classList.remove("db-license__status--inactive");
            status.textContent = text.license.status.active;
            return next;
        };

        const statusRow = document.createElement("div");
        statusRow.className = "db-settings__row";
        const statusLabel = document.createElement("span");
        statusLabel.textContent = text.license.statusLabel;
        statusRow.append(statusLabel, status);

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

        panel.append(statusRow, idRow, licenseDetails);
        void updateStatus();
        return panel;
    });
}
