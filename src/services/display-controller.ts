import { showMessage } from "siyuan";
import { DisplayConfig } from "@/config/display-config";
import { getCurrentDocumentId, getVisibleAttributeBlockIds, resolveDocumentId } from "@/data/block-context";
import { AttributeViewRepository } from "@/data/attribute-view-repository";
import { extractDisplayItems } from "@/domain/content-extractor";
import { enableInlineEdit } from "@/inline-edit";
import { toErrorMessage } from "@/libs/error-utils";
import { DisplayItem } from "@/core/types";
import { AttributeRenderer } from "@/ui/attribute-renderer";
import { t } from "@/i18n";

export interface DisplayControllerOptions {
    getConfig: () => DisplayConfig;
    getAutoRefreshInterval: () => number;
    isObserverEnabled: () => boolean;
    canInlineEdit: () => boolean;
}

export class DisplayController {
    private readonly repository = new AttributeViewRepository();
    private readonly renderer = new AttributeRenderer();
    private documentId = "";
    private refreshTimer: ReturnType<typeof setTimeout> | undefined;
    private autoTimer: ReturnType<typeof setInterval> | undefined;
    private observer: MutationObserver | undefined;
    private refreshVersion = 0;

    constructor(private readonly options: DisplayControllerOptions) {}

    async switchDocument(detail: unknown): Promise<void> {
        const blockId = getCurrentDocumentId(detail);
        if (!blockId) return;
        this.documentId = await resolveDocumentId(blockId);
        this.scheduleRefresh(true);
    }

    scheduleRefresh(force = false): void {
        if (this.refreshTimer) clearTimeout(this.refreshTimer);
        this.refreshTimer = setTimeout(() => {
            this.refreshTimer = undefined;
            void this.refresh(force);
        }, 20);
    }

    async refresh(force = false): Promise<void> {
        if (!this.documentId) return;
        const version = ++this.refreshVersion;
        const blockIds = getVisibleAttributeBlockIds();
        if (force) {
            this.repository.invalidateBlock(this.documentId);
            blockIds.forEach(blockId => this.repository.invalidateBlock(blockId));
        }
        await Promise.all([
            this.renderDocument(this.documentId, version),
            this.renderBlocks(blockIds, version)
        ]);
    }

    updateAutoRefresh(): void {
        if (this.autoTimer) clearInterval(this.autoTimer);
        this.autoTimer = undefined;
        const seconds = Math.max(0, Number(this.options.getAutoRefreshInterval()) || 0);
        if (seconds >= 5) this.autoTimer = setInterval(() => this.scheduleRefresh(false), seconds * 1000);
    }

    updateObserver(): void {
        this.observer?.disconnect();
        this.observer = undefined;
        if (!this.options.isObserverEnabled()) return;
        this.observer = new MutationObserver(records => {
            const requiresRefresh = records.some(record => [...record.addedNodes].some(node => node instanceof HTMLElement &&
                (node.matches("[custom-avs], .protyle-title") || Boolean(node.querySelector("[custom-avs], .protyle-title")))));
            if (requiresRefresh) this.scheduleRefresh(false);
        });
        this.observer.observe(document.body, { childList: true, subtree: true });
    }

    dispose(): void {
        if (this.refreshTimer) clearTimeout(this.refreshTimer);
        if (this.autoTimer) clearInterval(this.autoTimer);
        this.observer?.disconnect();
        this.refreshTimer = undefined;
        this.autoTimer = undefined;
        this.observer = undefined;
    }

    private async renderDocument(blockId: string, version: number): Promise<void> {
        const parents = [...document.querySelectorAll<HTMLElement>(".protyle-title[data-node-id]")]
            .filter(element => element.dataset.nodeId === blockId && !element.classList.contains("fn__none"));
        await this.render(blockId, parents, "document", version);
    }

    private async renderBlocks(blockIds: string[], version: number): Promise<void> {
        const tasks = blockIds.map(blockId => async () => {
            const parents = [...document.querySelectorAll<HTMLElement>(`[custom-avs][data-node-id="${CSS.escape(blockId)}"]`)];
            await this.render(blockId, parents, "block", version);
        });
        await this.runWithConcurrency(tasks, 4);
    }

    private async render(blockId: string, parents: HTMLElement[], scope: "document" | "block", version: number): Promise<void> {
        if (!blockId || parents.length === 0) return;
        try {
            const config = this.options.getConfig();
            const tables = await this.repository.getKeys(blockId);
            if (version !== this.refreshVersion) return;
            const items = extractDisplayItems(tables, scope === "document" ? config.documentFields : config.blockFields, config);
            parents.forEach(parent => this.renderer.render(parent, items, {
                blockId,
                config,
                canInlineEdit: this.options.canInlineEdit(),
                onEdit: (item, element) => this.edit(blockId, item, element)
            }));
        } catch (error) {
            console.warn("[DatabaseDisplay] Failed to render attribute values", error);
        }
    }

    private edit(blockId: string, item: DisplayItem, element: HTMLElement): void {
        void this.openEditor(blockId, item, element);
    }

    private async openEditor(blockId: string, item: DisplayItem, element: HTMLElement): Promise<void> {
        try {
            const itemID = await this.repository.getItemId(item.avID, blockId);
            if (!itemID) {
                showMessage(t("common.missingRowId"), 3000, "error");
                return;
            }
            enableInlineEdit({
                element,
                avID: item.avID,
                blockID: blockId,
                itemID,
                keyID: item.keyID,
                keyName: item.keyName,
                keyType: item.keyType,
                currentValue: item.rawValue,
                selectOptions: item.selectOptions,
                onSave: () => this.scheduleRefresh(true)
            });
        } catch (error) {
            const message = toErrorMessage(error);
            showMessage(t("common.fetchRowIdFailed", { message }), 5000, "error");
        }
    }

    private async runWithConcurrency(tasks: Array<() => Promise<void>>, limit: number): Promise<void> {
        let cursor = 0;
        const worker = async () => {
            while (cursor < tasks.length) {
                const task = tasks[cursor++];
                await task();
            }
        };
        await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
    }
}
