import { showMessage } from "siyuan";
import { DisplayConfig } from "@/config/display-config";
import { getCurrentDocumentId, getVisibleAttributeBlockParents, resolveDocumentId } from "@/data/block-context";
import { attributeViewRepository, AttributeViewRepository } from "@/data/attribute-view-repository";
import { extractDisplayItems } from "@/domain/content-extractor";
import { closeInlineEdit, enableInlineEdit } from "@/inline-edit";
import { toErrorMessage } from "@/libs/error-utils";
import { DisplayItem, DisplayNavigationTarget, isInlineEditableField } from "@/core/types";
import { AttributeRenderer, RenderContext } from "@/ui/attribute-renderer";
import { ContentPopover } from "@/ui/content-popover";
import { openChipMenu } from "@/ui/chip-menu";
import { t } from "@/i18n";
import { PRO_FEATURE_KEYS, ProFeature, requiredFeaturesForField } from "@/licensing";

const RELEVANT_NODE_SELECTOR = "[custom-avs], .protyle-title";
const PROTYLE_SELECTOR = ".protyle";
// 思源编辑块内容时会替换整个块 DOM，注入的属性容器随旧块一起消失。
// 立即恢复会造成"消失-恢复"闪烁，延迟到编辑静默后再恢复。
const QUIET_REFRESH_DELAY = 300;

function hasRelevantNode(node: Node): boolean {
    if (!(node instanceof HTMLElement)) return false;
    return node.matches(RELEVANT_NODE_SELECTOR) || Boolean(node.querySelector(RELEVANT_NODE_SELECTOR));
}

/**
 * 收集被移除 DOM 中丢失的属性容器所属的块 id。
 * 思源替换块（updateBlock 插新删旧）或重建 .protyle-attr 内部（updateAttrs 的
 * innerHTML 替换）时，我们注入的容器随旧 DOM 一起消失，据此定位需要快速恢复的块。
 */
function findLostContainerBlockIds(records: MutationRecord[]): Set<string> {
    const blockIds = new Set<string>();
    const visit = (node: Node): void => {
        if (!(node instanceof HTMLElement)) return;
        if (node.classList.contains("my-protyle-attr--av")) {
            const blockId = node.dataset.blockId;
            if (blockId) blockIds.add(blockId);
        }
        node.querySelectorAll<HTMLElement>(".my-protyle-attr--av").forEach(container => {
            const blockId = container.dataset.blockId;
            if (blockId) blockIds.add(blockId);
        });
    };
    for (const record of records) {
        if (record.type !== "childList") continue;
        record.removedNodes.forEach(visit);
    }
    return blockIds;
}

/**
 * 收集新增 DOM 中的块元素（按 data-node-id 索引），用于快速恢复。
 * 只扫描本次事务实际涉及的节点，避免整篇文档的查询开销。
 */
function collectBlockElements(node: Node, byId: Map<string, HTMLElement[]>): void {
    if (!(node instanceof HTMLElement)) return;
    const add = (element: HTMLElement): void => {
        const blockId = element.dataset.nodeId;
        if (!blockId) return;
        const list = byId.get(blockId) || [];
        list.push(element);
        byId.set(blockId, list);
    };
    // querySelectorAll already returns every descendant; recursively querying
    // from each descendant made this scan quadratic for large inserted blocks.
    if (node.dataset.nodeId) add(node);
    node.querySelectorAll<HTMLElement>("[data-node-id]").forEach(add);
}

export interface DisplayControllerOptions {
    getConfig: () => DisplayConfig;
    getAutoRefreshInterval: () => number;
    isObserverEnabled: () => boolean;
    isFeatureEnabled: (feature: ProFeature) => boolean;
    openBlock: (blockId: string, openInSplit: boolean) => void;
    openAsset: (path: string, openInSplit: boolean) => void;
    hideField: (fieldName: string) => void;
}

export class DisplayController {
    private readonly repository: AttributeViewRepository = attributeViewRepository;
    private readonly renderer = new AttributeRenderer();
    private readonly popover: ContentPopover;
    private documentId = "";
    private refreshTimer: ReturnType<typeof setTimeout> | undefined;
    private quietRefreshTimer: ReturnType<typeof setTimeout> | undefined;
    private autoTimer: ReturnType<typeof setInterval> | undefined;
    private observer: MutationObserver | undefined;
    private contentObservers = new Map<HTMLElement, MutationObserver>();
    private refreshVersion = 0;
    private refreshForcePending = false;
    private refreshInFlight = false;
    private refreshAfterInFlight = false;
    private refreshForceAfterInFlight = false;
    private visibleAttributeViewIds = new Set<string>();
    private lastRenderState = new Map<string, { items: DisplayItem[]; config: DisplayConfig; canInlineEdit: boolean }>();
    private disposed = false;

    constructor(private readonly options: DisplayControllerOptions) {
        this.popover = new ContentPopover({
            onNavigate: (target, openInSplit) => this.navigate(target, openInSplit),
            onEditAsset: (item, element) => this.editAsset(item, element)
        });
    }

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

    /**
     * 编辑静默后再恢复的刷新：思源编辑事务会频繁替换块 DOM（注入容器随之消失），
     * 立即恢复会造成闪烁，因此聚合到编辑停止后一次性恢复。
     */
    private scheduleQuietRefresh(): void {
        if (this.quietRefreshTimer) clearTimeout(this.quietRefreshTimer);
        this.quietRefreshTimer = setTimeout(() => {
            this.quietRefreshTimer = undefined;
            this.scheduleRefresh(false);
        }, QUIET_REFRESH_DELAY);
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
        // 可见属性视图集合随每次刷新重建，用于过滤无关的 websocket 事务；
        // 内存渲染状态同样重建，避免在长会话中累积
        this.visibleAttributeViewIds.clear();
        this.lastRenderState.clear();
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

    /**
     * websocket 事务刷新入口：仅当事务涉及的属性视图与当前可见内容相关时才强制刷新。
     * 传入空数组时保持保守策略（无法判断相关性则刷新）。
     */
    handleAttributeViewUpdate(attributeViewIds: string[]): void {
        if (this.disposed || !this.documentId) return;
        if (attributeViewIds.length === 0 || attributeViewIds.some(id => this.visibleAttributeViewIds.has(id))) {
            this.scheduleRefresh(true);
        }
    }

    updateObserver(): void {
        this.observer?.disconnect();
        this.contentObservers.forEach(observer => observer.disconnect());
        this.contentObservers.clear();
        this.observer = undefined;
        if (!this.options.isObserverEnabled()) return;

        const observedRoots = new Set<HTMLElement>();
        const scheduleForRelevantNodes = (records: MutationRecord[]): void => {
            const lostBlockIds = findLostContainerBlockIds(records);
            let relevantAdded = false;
            // 从本次事务涉及的节点中收集新块，避免整篇文档查询：
            // - 块替换（updateBlock 插新删旧）：新块在 addedNodes 中
            // - .protyle-attr 内部重建（updateAttrs）：块元素本身没变，从 target 向上取
            const newBlockElements = new Map<string, HTMLElement[]>();
            for (const record of records) {
                if (record.type !== "childList") continue;
                for (const node of record.addedNodes) {
                    if (hasRelevantNode(node)) relevantAdded = true;
                    if (lostBlockIds.size > 0) collectBlockElements(node, newBlockElements);
                }
                if (lostBlockIds.size > 0 && record.target instanceof HTMLElement) {
                    const block = record.target.closest<HTMLElement>("[data-node-id]");
                    if (block?.dataset.nodeId) {
                        const list = newBlockElements.get(block.dataset.nodeId) || [];
                        if (!list.includes(block)) list.push(block);
                        newBlockElements.set(block.dataset.nodeId, list);
                    }
                }
            }
            if (lostBlockIds.size > 0) {
                // 容器随旧 DOM 消失：同一帧内用内存数据同步恢复（避免闪烁），
                // 再安排静默刷新兜底（拉取最新数据 + 覆盖未命中内存状态的块）。
                this.restoreLostContainers(lostBlockIds, newBlockElements);
                this.scheduleQuietRefresh();
            } else if (relevantAdded) {
                this.scheduleRefresh(false);
            }
        };
        const observeProtyle = (root: HTMLElement): void => {
            if (observedRoots.has(root)) return;
            observedRoots.add(root);
            const observer = new MutationObserver(scheduleForRelevantNodes);
            observer.observe(root, { childList: true, subtree: true });
            this.contentObservers.set(root, observer);
        };

        document.querySelectorAll<HTMLElement>(PROTYLE_SELECTOR).forEach(observeProtyle);
        this.observer = new MutationObserver(records => {
            let requiresRefresh = false;
            for (const record of records) {
                if (record.type === "childList") {
                    for (const node of record.removedNodes) {
                        if (!(node instanceof HTMLElement)) continue;
                        const removedRoots = node.matches(PROTYLE_SELECTOR)
                            ? [node]
                            : [...node.querySelectorAll<HTMLElement>(PROTYLE_SELECTOR)];
                        removedRoots.forEach(root => {
                            const observer = this.contentObservers.get(root);
                            observer?.disconnect();
                            this.contentObservers.delete(root);
                            observedRoots.delete(root);
                        });
                    }
                }
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
        if (this.quietRefreshTimer) clearTimeout(this.quietRefreshTimer);
        if (this.autoTimer) clearInterval(this.autoTimer);
        this.observer?.disconnect();
        this.contentObservers.forEach(observer => observer.disconnect());
        this.contentObservers.clear();
        this.refreshTimer = undefined;
        this.quietRefreshTimer = undefined;
        this.autoTimer = undefined;
        this.observer = undefined;
        this.refreshForcePending = false;
        this.refreshAfterInFlight = false;
        this.refreshForceAfterInFlight = false;
        closeInlineEdit();
        this.popover.dispose();
        this.renderer.dispose();
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
            tables.forEach(table => this.visibleAttributeViewIds.add(table.avID));
            const fields = scope === "document" ? config.documentFields : config.blockFields;
            const visibleFields = fields.filter(type =>
                requiredFeaturesForField(type).every(feature => enabledFeatures.has(feature))
            );
            const items = extractDisplayItems(tables, visibleFields, config, blockId);
            const canInlineEdit = enabledFeatures.has("inline-edit");
            parents.forEach(parent => this.renderer.render(parent, items, this.createRenderContext(blockId, config, canInlineEdit)));
            // 保存最近一次渲染结果：块被思源替换时，同一帧内用它快速恢复显示
            this.lastRenderState.set(blockId, { items, config, canInlineEdit });
        } catch (error) {
            console.warn("[DatabaseDisplay] Failed to render attribute values", error);
        }
    }

    private createRenderContext(blockId: string, config: DisplayConfig, canInlineEdit: boolean): RenderContext {
        return {
            blockId,
            config,
            canInlineEdit,
            onEdit: (item, element) => this.edit(blockId, item, element),
            onNavigate: (target, event) => this.navigate(target, event.ctrlKey || event.metaKey),
            onShowRollupSources: (item, element) => this.popover.showRollupSources(item, element),
            onPreviewAsset: (item, element) => this.popover.showAssetPreview(item, element, this.options.isFeatureEnabled("inline-edit")),
            onContextMenu: (item, element, event) => this.openChipMenu(item, element, event)
        };
    }

    /**
     * 一帧内快速恢复：容器随旧 DOM 消失后，用最近一次渲染的数据同步恢复到新块，
     * 避免"消失-恢复"闪烁。仅在 observer 微任务回调中调用（此时思源的回放已完成、
     * 新块已就位），不发起任何网络请求，也不做整篇文档查询。
     */
    private restoreLostContainers(lostBlockIds: Set<string>, newBlockElements: Map<string, HTMLElement[]>): void {
        for (const blockId of lostBlockIds) {
            const state = this.lastRenderState.get(blockId);
            const parents = newBlockElements.get(blockId);
            if (!state || !parents?.length) continue;
            const context = this.createRenderContext(blockId, state.config, state.canInlineEdit);
            parents.forEach(parent => this.renderer.render(parent, state.items, context));
        }
    }

    private openChipMenu(item: DisplayItem, element: HTMLElement, event: MouseEvent): void {
        openChipMenu(item, event, {
            canEdit: this.canEditItem(item),
            onEdit: () => this.edit(this.blockIdFor(element), item, element),
            onHideField: target => this.options.hideField(target.keyName),
            onNavigate: target => this.navigate(target, true)
        });
    }

    private blockIdFor(element: HTMLElement): string {
        return element.closest<HTMLElement>("[data-node-id]")?.dataset.nodeId || this.documentId;
    }

    private edit(blockId: string, item: DisplayItem, element: HTMLElement): void {
        if (!this.canEditItem(item)) return;
        void this.openEditor(blockId, item, element);
    }

    private editAsset(item: DisplayItem, element: HTMLElement): void {
        if (!this.options.isFeatureEnabled("inline-edit")) return;
        const blockId = this.blockIdFor(element);
        if (!blockId) {
            showMessage(t("common.missingBlockId"), 3000, "error");
            return;
        }
        void this.openEditor(blockId, item, element, true);
    }

    private async openEditor(blockId: string, item: DisplayItem, element: HTMLElement, allowReadOnlyField = false): Promise<void> {
        if (!this.canEditItem(item, allowReadOnlyField)) return;
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
            if (!this.canEditItem(item, allowReadOnlyField)) return;
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

    private canEditItem(item: DisplayItem, allowReadOnlyField = false): boolean {
        return (allowReadOnlyField || isInlineEditableField(item.type)) &&
            this.options.isFeatureEnabled("inline-edit") &&
            requiredFeaturesForField(item.type).every(feature => this.options.isFeatureEnabled(feature));
    }

    private navigate(target: DisplayNavigationTarget, openInSplit: boolean): void {
        if (target.kind === "block") {
            this.options.openBlock(target.blockId, openInSplit);
            return;
        }
        this.options.openAsset(target.path, openInSplit);
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
