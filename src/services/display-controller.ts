import { showMessage } from "siyuan";
import { DisplayConfig } from "@/config/display-config";
import { getCurrentDocumentId, resolveDocumentId } from "@/data/block-context";
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
import { FrameRenderQueue } from "./frame-render-queue";
import { IdleTaskQueue } from "./idle-task-queue";
import { RefreshScheduler } from "./refresh-scheduler";
import { DISPLAY_CONTAINER_SELECTOR, EditorObserver, findInvalidDisplayContainerParents } from "./editor-observer";
import { ViewportBlockObserver } from "./viewport-block-observer";

// 刷新请求的去抖窗口（毫秒）
const REFRESH_DEBOUNCE_MS = 20;
// 思源编辑块内容时会替换整个块 DOM，注入的属性容器随旧块一起消失。
// 立即恢复会造成"消失-恢复"闪烁，延迟到编辑静默后再恢复。
const QUIET_REFRESH_DELAY = 300;
const MAX_RENDER_STATES = 512;
const BACKGROUND_RESUME_DELAY = 400;
type RenderScope = "document" | "block" | "background";

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
    private readonly scheduler: RefreshScheduler;
    private readonly editorObserver: EditorObserver;
    private readonly viewportObserver: ViewportBlockObserver;
    private readonly renderQueue = new FrameRenderQueue();
    // 后台补全始终只占一个请求位，滚动后的首屏队列不会被它明显挤占。
    private readonly backgroundQueue = new IdleTaskQueue({ concurrency: 1 });
    private documentId = "";
    // 文档切换序号：快速连续切换时丢弃慢响应的旧结果，避免覆盖新文档 ID
    private switchVersion = 0;
    private autoTimer: ReturnType<typeof setInterval> | undefined;
    private backgroundResumeTimer: ReturnType<typeof setTimeout> | undefined;
    private visibleAttributeViewIds = new Set<string>();
    private readonly visibleBlockIdsByAttributeViewId = new Map<string, Set<string>>();
    private lastRenderState = new Map<string, { items: DisplayItem[]; config: DisplayConfig; canInlineEdit: boolean }>();
    private needsFullContainerCleanup = true;
    private disposed = false;

    constructor(private readonly options: DisplayControllerOptions) {
        this.popover = new ContentPopover({
            onNavigate: (target, openInSplit) => this.navigate(target, openInSplit),
            onEditAsset: (item, element) => this.editAsset(item, element)
        });
        this.scheduler = new RefreshScheduler(request => this.performRefresh(request.force, request.blockIds, request.includeBackground), {
            debounceMs: REFRESH_DEBOUNCE_MS,
            quietDelayMs: QUIET_REFRESH_DELAY
        });
        this.viewportObserver = new ViewportBlockObserver({
            onEnter: blockIds => this.scheduleViewportRefresh(blockIds),
            onVisible: blockIds => this.scheduleViewportRefresh(blockIds),
            onLeave: blockIds => blockIds.forEach(blockId => this.untrackBlockAttributeViews(blockId))
        });
        this.editorObserver = new EditorObserver({
            isRefreshObservationEnabled: () => this.options.isObserverEnabled(),
            clearInvalidContainers: (containers, invalidParents) => this.clearInvalidDisplayContainers(containers, invalidParents),
            restoreLostContainers: (lostBlockIds, newBlockElements) => this.restoreLostContainers(lostBlockIds, newBlockElements),
            observeRelevantNodes: nodes => this.viewportObserver.observeNodes(nodes),
            removeRelevantNodes: nodes => this.viewportObserver.unobserveNodes(nodes),
            scheduleRefresh: (force, blockIds) => this.scheduleRefresh(force, blockIds),
            scheduleQuietRefresh: () => this.scheduleQuietRefresh()
        });
    }

    async switchDocument(detail: unknown): Promise<void> {
        const blockId = getCurrentDocumentId(detail);
        if (!blockId) return;
        const version = ++this.switchVersion;
        // The new document is more important than every queued block of the old one.
        this.scheduler.cancelPending();
        this.renderQueue.discardStale();
        this.backgroundQueue.clear();
        this.clearBackgroundResume();
        let documentId: string;
        try {
            documentId = await resolveDocumentId(blockId);
        } catch (error) {
            // fetchSyncPost 在内核不可达时会 reject；保留旧文档 ID，避免未处理 rejection
            console.warn("[DatabaseDisplay] Failed to resolve document id", error);
            return;
        }
        if (this.disposed || version !== this.switchVersion) return;
        this.documentId = documentId;
        this.viewportObserver.discover(false);
        this.scheduleRefresh(true, undefined, true);
    }

    scheduleRefresh(force = false, blockIds?: ReadonlySet<string>, includeBackground = false): void {
        this.clearBackgroundResume();
        // 任意新刷新都不应让旧的低优先级补全继续占用空闲时间。
        this.backgroundQueue.clear();
        // Full and data-forced refreshes supersede the old work immediately. A
        // viewport-enter request is additive, so it must not cancel visible work.
        if (force || blockIds === undefined) {
            this.scheduler.cancelCurrent();
            this.renderQueue.discardStale();
        }
        this.scheduler.schedule(force, blockIds, includeBackground);
    }

    /** 配置、主题等展示变化只需重绘当前视口，不应主动失效数据库缓存。 */
    refreshPresentation(): void {
        this.scheduleRefresh(false, undefined, true);
    }

    /** Protyle 加载完成后只登记候选块；实际取数仍由活跃视口决定。 */
    handleProtyleLoaded(): void {
        this.viewportObserver.ensureObserved();
        this.viewportObserver.discover(false);
        this.needsFullContainerCleanup = true;
        this.scheduleRefresh(false, undefined, true);
    }

    /** 编辑静默刷新保留当前前台任务，但立即放弃尚未开始的后台补全。 */
    private scheduleQuietRefresh(): void {
        this.clearBackgroundResume();
        this.backgroundQueue.clear();
        this.scheduler.scheduleQuiet();
    }

    /**
     * 滚动进入新区域时重排整个活跃窗口，而不是把新块追加到旧的低优先级队尾。
     * 这会让旧周期失效；已在途的少量请求无法取消，但不会继续启动其余旧任务。
     */
    private scheduleViewportRefresh(blockIds: ReadonlySet<string>): void {
        if (blockIds.size === 0) return;
        this.scheduleRefresh(false);
        this.scheduleBackgroundResume();
    }

    private scheduleBackgroundResume(): void {
        this.backgroundResumeTimer = setTimeout(() => {
            this.backgroundResumeTimer = undefined;
            // 用户停止滚动后再做一次候选快照，后台队列随后在 idle 时间逐步补全。
            this.scheduleRefresh(false, undefined, true);
        }, BACKGROUND_RESUME_DELAY);
    }

    private clearBackgroundResume(): void {
        if (this.backgroundResumeTimer) clearTimeout(this.backgroundResumeTimer);
        this.backgroundResumeTimer = undefined;
    }

    private async performRefresh(force: boolean, targetBlockIds?: ReadonlySet<string>, includeBackground = false): Promise<void> {
        if (this.disposed || !this.documentId) return;
        const version = this.scheduler.beginCycle();
        const documentId = this.documentId;
        // 首次打开时已在 Protyle 加载/观察器重建阶段登记候选块；滚动期间由
        // IntersectionObserver 增量加入，刷新时无需重新扫描整篇文档。
        this.viewportObserver.ensureObserved();
        const isFullRefresh = targetBlockIds === undefined;
        if (isFullRefresh) {
            // 可见属性视图集合随全量刷新重建，用于过滤无关 websocket 事务；
            // 数据强制刷新才丢弃渲染快照；滚动重排时保留它，供思源替换块 DOM
            // 时同步恢复，也避免后台块较多时反复清空大 Map。
            this.visibleAttributeViewIds.clear();
            this.visibleBlockIdsByAttributeViewId.clear();
            if (force) this.lastRenderState.clear();
        } else {
            targetBlockIds!.forEach(blockId => this.forgetBlockRenderState(blockId));
        }
        const activeBlockIds = this.viewportObserver.getActiveBlockIds();
        const blockParents = isFullRefresh
            ? this.viewportObserver.getPrioritizedParents(activeBlockIds, true)
            : this.viewportObserver.getPrioritizedParents(targetBlockIds, true);
        const backgroundParents = isFullRefresh && includeBackground
            ? this.viewportObserver.getBackgroundParents(new Set(blockParents.keys()))
            : new Map<string, HTMLElement[]>();
        // 首次/新 Protyle 加载时保留一次全局清理，保证关闭自动观察后也能修复
        // 已复制的残留节点；普通滚动刷新只检查活跃块，避免后台全部渲染后每次
        // 滚动都再次扫描整篇文档。
        if (this.needsFullContainerCleanup) {
            this.clearInvalidDisplayContainers(document.querySelectorAll<HTMLElement>(DISPLAY_CONTAINER_SELECTOR));
            this.needsFullContainerCleanup = false;
        } else {
            this.clearInvalidDisplayContainers(this.getDisplayContainers(blockParents));
        }
        const refreshDocument = isFullRefresh || targetBlockIds!.has(documentId);
        const refreshedBlockIds = new Set(blockParents.keys());
        if (refreshDocument) refreshedBlockIds.add(documentId);
        let config: DisplayConfig;
        let enabledFeatures: ReadonlySet<ProFeature>;
        try {
            config = this.options.getConfig();
            enabledFeatures = new Set(PRO_FEATURE_KEYS.filter(feature => this.options.isFeatureEnabled(feature)));
            // List layouts are a Pro feature. Keep stored settings intact, but
            // render them as inline for users without the feature.
            if (!enabledFeatures.has("list-layout") && config.layout !== "inline") {
                config = { ...config, layout: "inline" };
            }
        } catch (error) {
            console.warn("[DatabaseDisplay] Failed to read display configuration", error);
            return;
        }
        if (force) {
            if (isFullRefresh) this.repository.invalidateAll();
            else refreshedBlockIds.forEach(blockId => this.repository.invalidateBlock(blockId));
        }
        await Promise.all([
            refreshDocument ? this.renderDocument(documentId, version, config, enabledFeatures) : Promise.resolve(),
            this.renderBlocks(blockParents, version, config, enabledFeatures)
        ]);
        if (isFullRefresh && includeBackground && this.scheduler.isCurrent(version)) {
            this.renderBackgroundBlocks(backgroundParents, version, config, enabledFeatures);
        }
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
        if (attributeViewIds.length === 0) {
            this.scheduleRefresh(true);
            return;
        }
        // 延迟加载过的块可能仍命中 30 秒缓存。先按属性视图失效，之后滚入
        // 视口时会获得新值；当前活跃块仍只做定向刷新。
        attributeViewIds.forEach(attributeViewId => this.repository.invalidateAttributeView(attributeViewId));
        const affectedBlockIds = new Set<string>();
        for (const attributeViewId of attributeViewIds) {
            if (!this.visibleAttributeViewIds.has(attributeViewId)) continue;
            const blockIds = this.visibleBlockIdsByAttributeViewId.get(attributeViewId);
            // Mapping can be absent during the initial render; preserve the
            // old conservative behavior rather than missing an update.
            if (!blockIds?.size) {
                this.scheduleRefresh(true);
                return;
            }
            blockIds.forEach(blockId => affectedBlockIds.add(blockId));
        }
        if (affectedBlockIds.size > 0) {
            this.scheduleRefresh(true, affectedBlockIds);
        }
    }

    updateObserver(): void {
        this.needsFullContainerCleanup = true;
        this.viewportObserver.rebuild();
        this.editorObserver.rebuild();
    }

    dispose(): void {
        this.disposed = true;
        this.scheduler.dispose();
        this.editorObserver.dispose();
        this.viewportObserver.dispose();
        this.renderQueue.dispose();
        this.backgroundQueue.dispose();
        if (this.autoTimer) clearInterval(this.autoTimer);
        this.autoTimer = undefined;
        this.clearBackgroundResume();
        this.visibleAttributeViewIds.clear();
        this.visibleBlockIdsByAttributeViewId.clear();
        this.lastRenderState.clear();
        closeInlineEdit();
        this.popover.dispose();
        this.renderer.dispose();
    }

    private async renderDocument(blockId: string, version: number, config: DisplayConfig, enabledFeatures: ReadonlySet<ProFeature>): Promise<void> {
        const parents = [...document.querySelectorAll<HTMLElement>(".protyle-title[data-node-id]")]
            .filter(element => element.dataset.nodeId === blockId && !element.closest(".fn__none"));
        await this.render(blockId, parents, "document", version, config, enabledFeatures);
    }

    private async renderBlocks(parentsByBlockId: Map<string, HTMLElement[]>, version: number, config: DisplayConfig, enabledFeatures: ReadonlySet<ProFeature>): Promise<void> {
        const tasks = [...parentsByBlockId].map(([blockId, parents]) => async () => {
            await this.render(blockId, parents, "block", version, config, enabledFeatures);
        });
        await this.runWithConcurrency(tasks, 4, () => this.isRenderCurrent("", "document", version));
    }

    /** 首屏/预取区完成后，利用空闲时间逐步填充其余已挂载块。 */
    private renderBackgroundBlocks(parentsByBlockId: Map<string, HTMLElement[]>, version: number, config: DisplayConfig, enabledFeatures: ReadonlySet<ProFeature>): void {
        this.backgroundQueue.enqueue([...parentsByBlockId].map(([blockId, parents]) => async () => {
            await this.render(blockId, parents, "background", version, config, enabledFeatures);
        }));
    }

    private async render(blockId: string, parents: HTMLElement[], scope: RenderScope, version: number, config: DisplayConfig, enabledFeatures: ReadonlySet<ProFeature>): Promise<void> {
        if (!blockId || parents.length === 0 || !this.isRenderCurrent(blockId, scope, version)) return;
        try {
            const tables = await this.repository.getKeys(blockId);
            if (!this.isRenderCurrent(blockId, scope, version)) return;
            const fields = scope === "document" ? config.documentFields : config.blockFields;
            const visibleFields = fields.filter(type =>
                requiredFeaturesForField(type).every(feature => enabledFeatures.has(feature))
            );
            const canInlineEdit = enabledFeatures.has("inline-edit");
            await this.renderQueue.enqueue(() => {
                const currentParents = scope === "block"
                    ? this.viewportObserver.getActiveParents(blockId)
                    : scope === "background"
                        ? this.viewportObserver.getMountedParents(blockId)
                        : parents.filter(parent => parent.isConnected && !parent.closest(".fn__none"));
                if (currentParents.length === 0) return;
                if (scope !== "background") {
                    tables.forEach(table => {
                        this.visibleAttributeViewIds.add(table.avID);
                        const blockIds = this.visibleBlockIdsByAttributeViewId.get(table.avID) || new Set<string>();
                        blockIds.add(blockId);
                        this.visibleBlockIdsByAttributeViewId.set(table.avID, blockIds);
                    });
                }
                const items = extractDisplayItems(tables, visibleFields, config, blockId);
                const context = this.createRenderContext(blockId, config, canInlineEdit);
                currentParents.forEach(parent => this.renderer.render(parent, items, context));
                // 保存最近一次渲染结果：块被思源替换时，同一帧内用它快速恢复显示
                this.rememberRenderState(blockId, { items, config, canInlineEdit });
            }, () => this.isRenderCurrent(blockId, scope, version));
        } catch (error) {
            console.warn("[DatabaseDisplay] Failed to render attribute values", error);
        }
    }

    private isRenderCurrent(blockId: string, scope: RenderScope, version: number): boolean {
        return !this.disposed && this.scheduler.isCurrent(version) &&
            (scope === "document" || scope === "background" || this.viewportObserver.isActive(blockId));
    }

    private createRenderContext(blockId: string, config: DisplayConfig, canInlineEdit: boolean): RenderContext {
        return {
            blockId,
            config,
            canInlineEdit,
            onEdit: (item, element) => this.edit(blockId, item, element),
            onInlineEditLocked: () => showMessage(t("common.inlineEditRequiresPro"), 3000, "info"),
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
     *
     * 恢复前必须重新校验宿主仍满足容器的所有权条件：文档标题或其普通块仍拥有
     * custom-avs。若宿主已失去数据库绑定（例如用户从数据库属性面板解除绑定，
     * 思源重建 .protyle-attr 导致容器消失），则该消失是目标后像而非意外丢失，
     * 应丢弃旧缓存而非恢复，否则会触发"恢复→判定无效→删除→再次恢复"的死循环。
     */
    private restoreLostContainers(lostBlockIds: Set<string>, newBlockElements: Map<string, HTMLElement[]>): void {
        for (const blockId of lostBlockIds) {
            const state = this.lastRenderState.get(blockId);
            const parents = newBlockElements.get(blockId);
            if (!state || !parents?.length) continue;

            const validParents = parents.filter(parent =>
                parent.classList.contains("protyle-title") ||
                parent.hasAttribute("custom-avs")
            );

            if (validParents.length === 0) {
                this.forgetBlockRenderState(blockId);
                continue;
            }

            const context = this.createRenderContext(blockId, state.config, state.canInlineEdit);
            validParents.forEach(parent => this.renderer.render(parent, state.items, context));
        }
    }

    /** Removes copied or stale display containers and returns valid hosts to re-render. */
    private clearInvalidDisplayContainers(
        containers: Iterable<HTMLElement>,
        invalidParents = findInvalidDisplayContainerParents(containers)
    ): Set<string> {
        const repairBlockIds = new Set<string>();
        for (const [parent, needsRefresh] of invalidParents) {
            const blockId = parent.dataset.nodeId;
            this.renderer.clear(parent);
            if (needsRefresh && blockId) repairBlockIds.add(blockId);
        }
        return repairBlockIds;
    }

    private getDisplayContainers(parentsByBlockId: Map<string, HTMLElement[]>): HTMLElement[] {
        const containers: HTMLElement[] = [];
        for (const parents of parentsByBlockId.values()) {
            parents.forEach(parent => {
                const container = parent.querySelector<HTMLElement>(`:scope > .protyle-attr > ${DISPLAY_CONTAINER_SELECTOR}`);
                if (container) containers.push(container);
            });
        }
        return containers;
    }

    private rememberRenderState(blockId: string, state: { items: DisplayItem[]; config: DisplayConfig; canInlineEdit: boolean }): void {
        // Map 的插入顺序可作为 LRU 顺序；保留最近的状态足够覆盖编辑器 DOM 替换，
        // 又不会因为后台流式补全而无界增长。
        this.lastRenderState.delete(blockId);
        this.lastRenderState.set(blockId, state);
        while (this.lastRenderState.size > MAX_RENDER_STATES) {
            const oldestBlockId = this.lastRenderState.keys().next().value;
            if (!oldestBlockId) break;
            this.lastRenderState.delete(oldestBlockId);
        }
    }

    /** Removes the cached render payload and its AV-to-block mappings. */
    private forgetBlockRenderState(blockId: string): void {
        this.lastRenderState.delete(blockId);
        this.untrackBlockAttributeViews(blockId);
    }

    /** 离开视口预取区后不再因 WebSocket 更新而主动刷新该块。 */
    private untrackBlockAttributeViews(blockId: string): void {
        for (const [attributeViewId, blockIds] of this.visibleBlockIdsByAttributeViewId) {
            if (!blockIds.delete(blockId)) continue;
            if (blockIds.size === 0) {
                this.visibleBlockIdsByAttributeViewId.delete(attributeViewId);
                this.visibleAttributeViewIds.delete(attributeViewId);
            }
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
        // 保存后仅定向强制刷新被编辑的块；同列其他块的更新由 websocket 广播
        // （transactions / refreshAttributeView）触发，避免每次编辑保存都使
        // 全部可见块的缓存失效（N+1 请求放大）。
        const onEdited = () => this.scheduleRefresh(true, new Set([blockId]));
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
                    onSave: onEdited
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
                onSave: onEdited
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

    private async runWithConcurrency(tasks: Array<() => Promise<void>>, limit: number, shouldContinue: () => boolean): Promise<void> {
        let cursor = 0;
        const worker = async () => {
            while (shouldContinue() && cursor < tasks.length) {
                const task = tasks[cursor++];
                await task();
            }
        };
        await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
    }
}
