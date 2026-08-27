const RELEVANT_NODE_SELECTOR = "[custom-avs], .protyle-title";
const PROTYLE_SELECTOR = ".protyle";
export const DISPLAY_CONTAINER_SELECTOR = ".my-protyle-attr--av";

function hasRelevantNode(node: Node): boolean {
    if (!(node instanceof HTMLElement)) return false;
    return node.matches(RELEVANT_NODE_SELECTOR) || Boolean(node.querySelector(RELEVANT_NODE_SELECTOR));
}

function hasDocumentTitle(node: Node): boolean {
    if (!(node instanceof HTMLElement)) return false;
    return node.matches(".protyle-title") || Boolean(node.querySelector(".protyle-title"));
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
 * 复制块时，思源可能会把 .protyle-attr 内的临时展示节点一并带入新块；
 * 但新块并不一定继承数据库属性。展示节点若残留在这种块中，会被编辑器
 * 当作普通内容处理，进而有机会转换为 HTML 块。
 *
 * 这里只检查本次新增的 DOM，避免每次编辑都遍历全文。文档标题的属性容器
 * 不带 custom-avs 属性，由标题组件单独维护，因此不参与本项块级校验。
 */
export function findInvalidDisplayContainerParents(nodes: Iterable<Node>): Map<HTMLElement, boolean> {
    const invalidParents = new Map<HTMLElement, boolean>();
    const inspect = (container: HTMLElement): void => {
        const parent = container.closest<HTMLElement>("[data-node-id]");
        if (!parent) {
            container.remove();
            return;
        }
        if (parent.classList.contains("protyle-title")) return;
        const hasDatabaseAttributes = parent.hasAttribute("custom-avs");
        const belongsToParent = !container.dataset.blockId || container.dataset.blockId === parent.dataset.nodeId;
        if (!hasDatabaseAttributes || !belongsToParent) {
            // true means the host still has attributes and needs a normal refresh
            // after stale copied content has been removed.
            invalidParents.set(parent, hasDatabaseAttributes);
        }
    };
    const inspectNode = (node: Node): void => {
        if (!(node instanceof HTMLElement)) return;
        if (node.matches(DISPLAY_CONTAINER_SELECTOR)) inspect(node);
        node.querySelectorAll<HTMLElement>(DISPLAY_CONTAINER_SELECTOR).forEach(inspect);
    };
    for (const node of nodes) inspectNode(node);
    return invalidParents;
}

function findInvalidDisplayContainerParentsFromRecords(records: MutationRecord[]): Map<HTMLElement, boolean> {
    const addedNodes: Node[] = [];
    records.forEach(record => {
        if (record.type === "childList") addedNodes.push(...record.addedNodes);
    });
    return findInvalidDisplayContainerParents(addedNodes);
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

export interface EditorObserverOptions {
    /** 是否启用会触发数据库读取/渲染的自动补充观察（复制残留清理始终启用）。 */
    isRefreshObservationEnabled(): boolean;
    /** 清理无效展示容器，返回需要常规刷新恢复的块 id。 */
    clearInvalidContainers(containers: Iterable<HTMLElement>, invalidParents?: Map<HTMLElement, boolean>): Set<string>;
    /** 容器随旧 DOM 消失后，用最近一次渲染的数据同步恢复到新块。 */
    restoreLostContainers(lostBlockIds: Set<string>, newBlockElements: Map<string, HTMLElement[]>): void;
    /** 登记新增的属性块，由视口观察器决定是否需要请求数据。 */
    observeRelevantNodes(nodes: Iterable<Node>): void;
    /** 移除已离开 DOM 的属性块观察记录。 */
    removeRelevantNodes?(nodes: Iterable<Node>): void;
    scheduleRefresh(force?: boolean, blockIds?: ReadonlySet<string>): void;
    scheduleQuietRefresh(): void;
}

/**
 * 编辑器 DOM 观察器：body 层只发现新增/移除的 protyle 根，每个 protyle 根上
 * 挂子树观察负责内容变化。观察回调把变化分类为三类处置：
 * 复制残留清理、容器丢失恢复（内存态同步恢复 + 静默刷新兜底）、新块补充渲染。
 */
export class EditorObserver {
    private bodyObserver: MutationObserver | undefined;
    private readonly contentObservers = new Map<HTMLElement, MutationObserver>();
    private readonly observedRoots = new Set<HTMLElement>();

    constructor(private readonly options: EditorObserverOptions) {}

    /** 重建全部观察（设置变更后调用）：先断开旧的，再按当前 DOM 重新挂载。 */
    rebuild(): void {
        this.dispose();
        // 即使用户关闭自动刷新，仍保留仅用于移除复制残留 DOM 的轻量观察；
        // 这属于编辑器稳定性保护，不会触发数据库读取或常规渲染。
        const refreshObservationEnabled = this.options.isRefreshObservationEnabled();

        const scheduleForRelevantNodes = (records: MutationRecord[]): void => {
            const invalidDisplayParents = findInvalidDisplayContainerParentsFromRecords(records);
            const repairBlockIds = this.options.clearInvalidContainers(invalidDisplayParents.keys(), invalidDisplayParents);
            const removedNodes = records.flatMap(record => record.type === "childList" ? [...record.removedNodes] : []);
            if (removedNodes.length > 0) this.options.removeRelevantNodes?.(removedNodes);
            if (!refreshObservationEnabled) return;
            const lostBlockIds = findLostContainerBlockIds(records);
            const relevantAddedNodes: Node[] = [];
            let documentTitleAdded = false;
            // 从本次事务涉及的节点中收集新块，避免整篇文档查询：
            // - 块替换（updateBlock 插新删旧）：新块在 addedNodes 中
            // - .protyle-attr 内部重建（updateAttrs）：块元素本身没变，从 target 向上取
            const newBlockElements = new Map<string, HTMLElement[]>();
            for (const record of records) {
                if (record.type !== "childList") continue;
                for (const node of record.addedNodes) {
                    if (hasRelevantNode(node)) relevantAddedNodes.push(node);
                    if (hasDocumentTitle(node)) documentTitleAdded = true;
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
            // 新块不再触发整篇文档刷新；进入视口/预取区后才由观察器安排定向请求。
            if (relevantAddedNodes.length > 0) this.options.observeRelevantNodes(relevantAddedNodes);
            if (lostBlockIds.size > 0) {
                // 容器随旧 DOM 消失：同一帧内用内存数据同步恢复（避免闪烁），
                // 再安排静默刷新兜底（拉取最新数据 + 覆盖未命中内存状态的块）。
                this.options.restoreLostContainers(lostBlockIds, newBlockElements);
                this.options.scheduleQuietRefresh();
            } else if (repairBlockIds.size > 0) {
                this.options.scheduleRefresh(false, repairBlockIds);
            } else if (documentTitleAdded) {
                this.options.scheduleRefresh(false);
            }
        };
        const observeProtyle = (root: HTMLElement): void => {
            if (this.observedRoots.has(root)) return;
            this.observedRoots.add(root);
            const observer = new MutationObserver(scheduleForRelevantNodes);
            observer.observe(root, { childList: true, subtree: true });
            this.contentObservers.set(root, observer);
        };

        document.querySelectorAll<HTMLElement>(PROTYLE_SELECTOR).forEach(observeProtyle);
        this.bodyObserver = new MutationObserver(records => {
            const relevantAddedNodes: Node[] = [];
            const removedNodes: Node[] = [];
            let requiresRefresh = false;
            for (const record of records) {
                if (record.type === "childList") {
                    removedNodes.push(...record.removedNodes);
                    for (const node of record.removedNodes) {
                        if (!(node instanceof HTMLElement)) continue;
                        const removedRoots = node.matches(PROTYLE_SELECTOR)
                            ? [node]
                            : [...node.querySelectorAll<HTMLElement>(PROTYLE_SELECTOR)];
                        removedRoots.forEach(root => {
                            const observer = this.contentObservers.get(root);
                            observer?.disconnect();
                            this.contentObservers.delete(root);
                            this.observedRoots.delete(root);
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
                        if (hasRelevantNode(node)) relevantAddedNodes.push(node);
                        if (hasDocumentTitle(node)) requiresRefresh = true;
                    }
                }
            }
            if (removedNodes.length > 0) this.options.removeRelevantNodes?.(removedNodes);
            if (!refreshObservationEnabled) return;
            if (relevantAddedNodes.length > 0) this.options.observeRelevantNodes(relevantAddedNodes);
            if (requiresRefresh) this.options.scheduleRefresh(false);
        });
        // Keep this watcher lightweight: detailed subtree observation is attached
        // to each Protyle, while this watcher only discovers new roots.
        this.bodyObserver.observe(document.body, { childList: true, subtree: true });
    }

    dispose(): void {
        this.bodyObserver?.disconnect();
        this.contentObservers.forEach(observer => observer.disconnect());
        this.contentObservers.clear();
        this.observedRoots.clear();
        this.bodyObserver = undefined;
    }
}
