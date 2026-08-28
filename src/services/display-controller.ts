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
import { RefreshScheduler } from "./refresh-scheduler";
import { DISPLAY_CONTAINER_SELECTOR, EditorObserver, findInvalidDisplayContainerParents } from "./editor-observer";

// 刷新请求的去抖窗口（毫秒）
const REFRESH_DEBOUNCE_MS = 20;
// 思源编辑块内容时会替换整个块 DOM，注入的属性容器随旧块一起消失。
// 立即恢复会造成"消失-恢复"闪烁，延迟到编辑静默后再恢复。
const QUIET_REFRESH_DELAY = 300;

export interface DisplayControllerOptions {
    getConfig: () => DisplayConfig;
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
    private documentId = "";
    // 文档切换序号：快速连续切换时丢弃慢响应的旧结果，避免覆盖新文档 ID
    private switchVersion = 0;
    private visibleAttributeViewIds = new Set<string>();
    private readonly visibleBlockIdsByAttributeViewId = new Map<string, Set<string>>();
    private lastRenderState = new Map<string, { items: DisplayItem[]; config: DisplayConfig; canInlineEdit: boolean }>();
    private disposed = false;

    constructor(private readonly options: DisplayControllerOptions) {
        this.popover = new ContentPopover({
            onNavigate: (target, openInSplit) => this.navigate(target, openInSplit),
            onEditAsset: (item, element) => this.editAsset(item, element)
        });
        this.scheduler = new RefreshScheduler(request => this.performRefresh(request.force, request.blockIds), {
            debounceMs: REFRESH_DEBOUNCE_MS,
            quietDelayMs: QUIET_REFRESH_DELAY
        });
        this.editorObserver = new EditorObserver({
            clearInvalidContainers: (containers, invalidParents) => this.clearInvalidDisplayContainers(containers, invalidParents),
            restoreLostContainers: (lostBlockIds, newBlockElements) => this.restoreLostContainers(lostBlockIds, newBlockElements),
            scheduleRefresh: (force, blockIds) => this.scheduleRefresh(force, blockIds),
            scheduleQuietRefresh: () => this.scheduler.scheduleQuiet()
        });
        // 自动补充观察始终启用，构造完成后立即挂载
        this.editorObserver.rebuild();
    }

    async switchDocument(detail: unknown): Promise<void> {
        const blockId = getCurrentDocumentId(detail);
        if (!blockId) return;
        const version = ++this.switchVersion;
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
        this.scheduleRefresh(true);
    }

    scheduleRefresh(force = false, blockIds?: ReadonlySet<string>): void {
        this.scheduler.schedule(force, blockIds);
    }

    private async performRefresh(force: boolean, targetBlockIds?: ReadonlySet<string>): Promise<void> {
        if (this.disposed || !this.documentId) return;
        // 即使关闭了自动补充观察，也要在手动/定时刷新时清掉复制遗留的展示 DOM。
        this.clearInvalidDisplayContainers(document.querySelectorAll<HTMLElement>(DISPLAY_CONTAINER_SELECTOR));
        const version = this.scheduler.beginCycle();
        const documentId = this.documentId;
        const allBlockParents = getVisibleAttributeBlockParents();
        const isFullRefresh = targetBlockIds === undefined;
        if (isFullRefresh) {
            // 可见属性视图集合随全量刷新重建，用于过滤无关 websocket 事务；
            // 内存渲染状态同样重建，避免在长会话中累积。
            this.visibleAttributeViewIds.clear();
            this.visibleBlockIdsByAttributeViewId.clear();
            this.lastRenderState.clear();
        } else {
            targetBlockIds!.forEach(blockId => this.forgetBlockRenderState(blockId));
        }
        const blockParents = isFullRefresh
            ? allBlockParents
            : new Map([...allBlockParents].filter(([blockId]) => targetBlockIds!.has(blockId)));
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
            refreshedBlockIds.forEach(blockId => this.repository.invalidateBlock(blockId));
        }
        await Promise.all([
            refreshDocument ? this.renderDocument(documentId, version, config, enabledFeatures) : Promise.resolve(),
            this.renderBlocks(blockParents, version, config, enabledFeatures)
        ]);
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

    dispose(): void {
        this.disposed = true;
        this.scheduler.dispose();
        this.editorObserver.dispose();
        this.visibleAttributeViewIds.clear();
        this.visibleBlockIdsByAttributeViewId.clear();
        this.lastRenderState.clear();
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
            if (!this.scheduler.isCurrent(version)) return;
            tables.forEach(table => {
                this.visibleAttributeViewIds.add(table.avID);
                const blockIds = this.visibleBlockIdsByAttributeViewId.get(table.avID) || new Set<string>();
                blockIds.add(blockId);
                this.visibleBlockIdsByAttributeViewId.set(table.avID, blockIds);
            });
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

    /** Removes stale AV-to-block mappings before a targeted block refresh. */
    private forgetBlockRenderState(blockId: string): void {
        this.lastRenderState.delete(blockId);
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
