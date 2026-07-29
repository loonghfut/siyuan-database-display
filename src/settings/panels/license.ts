import { LicenseService } from "@/licensing";
import { AddPanel, SettingsPanelText } from "../types";

function statusText(text: SettingsPanelText["license"], reason: string | undefined): string {
    if (!reason) return text.free;
    return text.status[reason as keyof typeof text.status] || text.free;
}

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
        const userIdInput = document.createElement("input");
        userIdInput.className = "b3-text-field";
        userIdInput.value = userId;
        userIdInput.readOnly = true;
        const copy = document.createElement("button");
        copy.type = "button";
        copy.className = "b3-button b3-button--outline";
        copy.textContent = text.license.copyUserId;
        copy.disabled = !userId;
        copy.addEventListener("click", () => void copyText(userId));

        const userRow = document.createElement("div");
        userRow.className = "fn__flex";
        userRow.append(userIdInput, copy);

        const licenseInput = document.createElement("textarea");
        licenseInput.className = "b3-text-field fn__block";
        licenseInput.rows = 5;
        licenseInput.placeholder = text.license.placeholder;
        licenseInput.value = value;
        const status = document.createElement("div");
        status.className = "b3-label__text";

        const updateStatus = async () => {
            const next = await license.verify(licenseInput.value, userId);
            if (!("reason" in next)) {
                status.textContent = statusText(text.license, "active");
                return;
            }
            status.textContent = statusText(text.license, next.reason);
        };
        licenseInput.addEventListener("change", () => {
            panel.dataset.value = licenseInput.value;
            commit(licenseInput.value);
            void updateStatus();
        });
        void updateStatus();

        const idLabel = document.createElement("label");
        idLabel.textContent = text.license.userId;
        idLabel.append(userRow);
        const licenseLabel = document.createElement("label");
        licenseLabel.textContent = text.license.license;
        licenseLabel.append(licenseInput);
        panel.append(idLabel, licenseLabel, status);
        return panel;
    });
}
