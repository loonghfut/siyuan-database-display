import { showMessage } from "siyuan";
import { DisplayConfig } from "@/config/display-config";
import { getCurrentDocumentId, getVisibleAttributeBlockParents, resolveDocumentId } from "@/data/block-context";
import { AttributeViewRepository } from "@/data/attribute-view-repository";
import { extractDisplayItems } from "@/domain/content-extractor";
import { enableInlineEdit } from "@/inline-edit";
import { toErrorMessage } from "@/libs/error-utils";
import { DisplayItem } from "@/core/types";
import { AttributeRenderer } from "@/ui/attribute-renderer";
import { t } from "@/i18n";
import { PRO_FEATURE_KEYS, ProFeature, requiredFeaturesForField } from "@/licensing";

const RELEVANT_NODE_SELECTOR = "[custom-avs], .protyle-title";
const PROTYLE_SELECTOR = ".protyle";

function hasRelevantNode(node: Node): boolean {
    if (!(node instanceof HTMLElement)) return false;
    return node.matches(RELEVANT_NODE_SELECTOR) || Boolean(node.querySelector(RELEVANT_NODE_SELECTOR));
}

export interface DisplayControllerOptions {
    getConfig: () => DisplayConfig;
    getAutoRefreshInterval: () => number;
    isObserverEnabled: () => boolean;
    isFeatureEnabled: (feature: ProFeature) => boolean;
}

export class DisplayController {
    private readonly repository = new AttributeViewRepository();
    private readonly renderer = new AttributeRenderer();
    private documentId = "";
    private refreshTimer: ReturnType<typeof setTimeout> | undefined;
    private autoTimer: ReturnType<typeof setInterval> | undefined;
    private observer: MutationObserver | undefined;
    private contentObservers: MutationObserver[] = [];
    private refreshVersion = 0;
    private refreshForcePending = false;
    private refreshInFlight = false;
    private refreshAfterInFlight = false;
    private refreshForceAfterInFlight = false;
    private disposed = false;

    constructor(private readonly options: DisplayControllerOptions) {}

    async switchDocument(detail: unknown): Promise<void> {
        const blockId = getCurrentDocumentId(detail);
        if (!blockId) return;
        this.documentId = await resolveDocumentId(blockId);
        this.scheduleRefresh(true);
    }

    scheduleRefresh(force = false): void {
        if (this.disposed) return;
        this.refreshForcePending ||= force;
        if (this.refreshTimer) clearTimeout(this.refreshTimer);
        this.refreshTimer = setTimeout(() => {
            this.refreshTimer = undefined;
            const requestedForce = this.refreshForcePending;
            this.refreshForcePending = false;
            void this.refresh(requestedForce);
        }, 20);
    }

    async refresh(force = false): Promise<void> {
        if (this.disposed || !this.documentId) return;
        if (this.refreshInFlight) {
            this.refreshAfterInFlight = true;
            this.refreshForceAfterInFlight ||= force;
            return;
        }

        this.refreshInFlight = true;
        try {
            await this.performRefresh(force);
        } finally {
            this.refreshInFlight = false;
            if (!this.disposed && this.refreshAfterInFlight) {
                const requestedForce = this.refreshForceAfterInFlight;
                this.refreshAfterInFlight = false;
                this.refreshForceAfterInFlight = false;
                this.scheduleRefresh(requestedForce);
            }
        }
    }

    private async performRefresh(force: boolean): Promise<void> {
        if (this.disposed || !this.documentId) return;
        const version = ++this.refreshVersion;
        const documentId = this.documentId;
        const blockParents = getVisibleAttributeBlockParents();
        const blockIds = [...blockParents.keys()];
        let config: DisplayConfig;
        let enabledFeatures: ReadonlySet<ProFeature>;
        try {
            config = this.options.getConfig();
            enabledFeatures = new Set(PRO_FEATURE_KEYS.filter(feature => this.options.isFeatureEnabled(feature)));
        } catch (error) {
            console.warn("[DatabaseDisplay] Failed to read display configuration", error);
            return;
        }
        if (force) {
            this.repository.invalidateBlock(documentId);
            blockIds.forEach(blockId => this.repository.invalidateBlock(blockId));
        }
        await Promise.all([
            this.renderDocument(documentId, version, config, enabledFeatures),
            this.renderBlocks(blockParents, version, config, enabledFeatures)
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
        this.contentObservers.forEach(observer => observer.disconnect());
        this.contentObservers = [];
        this.observer = undefined;
        if (!this.options.isObserverEnabled()) return;

        const observedRoots = new Set<HTMLElement>();
        const scheduleForRelevantNodes = (records: MutationRecord[]): void => {
            for (const record of records) {
                for (const node of record.addedNodes) {
                    if (hasRelevantNode(node)) {
                        this.scheduleRefresh(false);
                        return;
                    }
                }
            }
        };
        const observeProtyle = (root: HTMLElement): void => {
            if (observedRoots.has(root)) return;
            observedRoots.add(root);
            const observer = new MutationObserver(scheduleForRelevantNodes);
            observer.observe(root, { childList: true, subtree: true });
            this.contentObservers.push(observer);
        };

        document.querySelectorAll<HTMLElement>(PROTYLE_SELECTOR).forEach(observeProtyle);
        this.observer = new MutationObserver(records => {
            let requiresRefresh = false;
            for (const record of records) {
                const target = record.target instanceof HTMLElement ? record.target : undefined;
                const insideProtyle = Boolean(target?.closest(PROTYLE_SELECTOR));
                for (const node of record.addedNodes) {
                    if (!(node instanceof HTMLElement)) continue;
                    // Content observers handle changes inside an existing Protyle.
                    // The body observer only discovers new roots and top-level content.
                    if (!insideProtyle) {
                        if (node.matches(PROTYLE_SELECTOR)) observeProtyle(node);
                        node.querySelectorAll<HTMLElement>(PROTYLE_SELECTOR).forEach(observeProtyle);
                        if (hasRelevantNode(node)) requiresRefresh = true;
                    }
                }
            }
            if (requiresRefresh) this.scheduleRefresh(false);
        });
        // Keep this watcher lightweight: detailed subtree observation is attached
        // to each Protyle, while this watcher only discovers new roots.
        this.observer.observe(document.body, { childList: true, subtree: true });
    }

    dispose(): void {
        this.disposed = true;
        this.refreshVersion++;
        if (this.refreshTimer) clearTimeout(this.refreshTimer);
        if (this.autoTimer) clearInterval(this.autoTimer);
        this.observer?.disconnect();
        this.contentObservers.forEach(observer => observer.disconnect());
        this.contentObservers = [];
        this.refreshTimer = undefined;
        this.autoTimer = undefined;
        this.observer = undefined;
        this.refreshForcePending = false;
        this.refreshAfterInFlight = false;
        this.refreshForceAfterInFlight = false;
    }

    private async renderDocument(blockId: string, version: number, config: DisplayConfig, enabledFeatures: ReadonlySet<ProFeature>): Promise<void> {
        const parents = [...document.querySelectorAll<HTMLElement>(".protyle-title[data-node-id]")]
            .filter(element => element.dataset.nodeId === blockId && !element.classList.contains("fn__none"));
        await this.render(blockId, parents, "document", version, config, enabledFeatures);
    }

    private async renderBlocks(parentsByBlockId: Map<string, HTMLElement[]>, version: number, config: DisplayConfig, enabledFeatures: ReadonlySet<ProFeature>): Promise<void> {
        const tasks = [...parentsByBlockId].map(([blockId, parents]) => async () => {
            await this.render(blockId, parents, "block", version, config, enabledFeatures);
        });
        await this.runWithConcurrency(tasks, 4);
    }

    private async render(blockId: string, parents: HTMLElement[], scope: "document" | "block", version: number, config: DisplayConfig, enabledFeatures: ReadonlySet<ProFeature>): Promise<void> {
        if (!blockId || parents.length === 0) return;
        try {
            const tables = await this.repository.getKeys(blockId);
            if (version !== this.refreshVersion) return;
            const fields = scope === "document" ? config.documentFields : config.blockFields;
            const visibleFields = fields.filter(type =>
                requiredFeaturesForField(type).every(feature => enabledFeatures.has(feature))
            );
            const items = extractDisplayItems(tables, visibleFields, config);
            parents.forEach(parent => this.renderer.render(parent, items, {
                blockId,
                config,
                canInlineEdit: enabledFeatures.has("inline-edit"),
                onEdit: (item, element) => this.edit(blockId, item, element)
            }));
        } catch (error) {
            console.warn("[DatabaseDisplay] Failed to render attribute values", error);
        }
    }

    private edit(blockId: string, item: DisplayItem, element: HTMLElement): void {
        if (!this.canEditItem(item)) return;
        void this.openEditor(blockId, item, element);
    }

    private async openEditor(blockId: string, item: DisplayItem, element: HTMLElement): Promise<void> {
        if (!this.canEditItem(item)) return;
        try {
            if (item.type === "template") {
                enableInlineEdit({
                    element,
                    avID: item.avID,
                    blockID: blockId,
                    itemID: "",
                    keyID: item.keyID,
                    keyName: item.keyName,
                    keyType: item.keyType,
                    currentValue: item.rawValue,
                    template: item.template,
                    selectOptions: item.selectOptions,
                    relation: item.relation,
                    onSave: () => this.scheduleRefresh(true)
                });
                return;
            }
            const itemID = await this.repository.getItemId(item.avID, blockId);
            if (!itemID) {
                showMessage(t("common.missingRowId"), 3000, "error");
                return;
            }
            if (!this.canEditItem(item)) return;
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
                relation: item.relation,
                onSave: () => this.scheduleRefresh(true)
            });
        } catch (error) {
            const message = toErrorMessage(error);
            showMessage(t("common.fetchRowIdFailed", { message }), 5000, "error");
        }
    }

    private canEditItem(item: DisplayItem): boolean {
        return this.options.isFeatureEnabled("inline-edit") &&
            requiredFeaturesForField(item.type).every(feature => this.options.isFeatureEnabled(feature));
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
