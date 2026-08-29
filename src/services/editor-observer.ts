const RELEVANT_NODE_SELECTOR = "[custom-avs], .protyle-title";
const PROTYLE_SELECTOR = ".protyle";
export const DISPLAY_CONTAINER_SELECTOR = ".my-protyle-attr--av";

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
 * 记录块的数据库绑定变化（custom-avs 写入）。块加入/移出数据库时，思源通过
 * updateAttrs 事务改写块元素上的 custom-avs，这是"哪些块需要展示属性"的最终
 * 事实来源。该事务与属性视图事务（insertAttrViewBlock 等）是内核分两次推送的，
 * 且编辑器与插件监听在不同的 websocket 连接上，到达顺序无保证；直接观察 DOM
 * 属性的写入，可以在任意顺序下都及时刷新，不依赖推送时序。
 *
 * 注意：updateAttrs 会把 data.new 里的全部 IAL 重新 setAttribute 一遍
 * （transaction.ts 先 removeAttribute 全部旧键、再 setAttribute 全部新键），
 * 因此改动备注/别名等无关属性时，已绑定块上的 custom-avs 会被原值重写一次，
 * MutationObserver 照样产生记录。这里比对上一次观察到的取值，值没变就不刷新，
 * 避免每次块属性编辑都触发一次强制取数。
 */
function collectReboundBlockId(
    record: MutationRecord,
    blockIds: Set<string>,
    lastValues: WeakMap<HTMLElement, string | null>
): void {
    const target = record.target instanceof HTMLElement ? record.target : undefined;
    const blockId = target?.dataset.nodeId;
    if (!target || !blockId) return;
    const current = target.getAttribute("custom-avs");
    // 首次观察到某个块元素时没有基线，按"已变化"处理并建立基线
    if (lastValues.get(target) === current) return;
    lastValues.set(target, current);
    blockIds.add(blockId);
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
    /** 清理无效展示容器，返回需要常规刷新恢复的块 id。 */
    clearInvalidContainers(containers: Iterable<HTMLElement>, invalidParents?: Map<HTMLElement, boolean>): Set<string>;
    /** 容器随旧 DOM 消失后，用最近一次渲染的数据同步恢复到新块。 */
    restoreLostContainers(lostBlockIds: Set<string>, newBlockElements: Map<string, HTMLElement[]>): void;
    scheduleRefresh(force?: boolean, blockIds?: ReadonlySet<string>): void;
    scheduleQuietRefresh(): void;
}

/**
 * 编辑器 DOM 观察器：body 层只发现新增/移除的 protyle 根，每个 protyle 根上
 * 挂子树观察负责内容变化。观察回调把变化分类为四类处置：
 * 复制残留清理、容器丢失恢复（内存态同步恢复 + 静默刷新兜底）、新块补充渲染、
 * 数据库绑定变化（custom-avs）定向刷新。
 */
export class EditorObserver {
    private bodyObserver: MutationObserver | undefined;
    private readonly contentObservers = new Map<HTMLElement, MutationObserver>();
    private readonly observedRoots = new Set<HTMLElement>();
    // 块元素 → 上次观察到的 custom-avs 取值，用于过滤"原值重写"产生的噪声记录
    private customAvsValues = new WeakMap<HTMLElement, string | null>();

    constructor(private readonly options: EditorObserverOptions) {}

    /** 重建全部观察（设置变更后调用）：先断开旧的，再按当前 DOM 重新挂载。 */
    rebuild(): void {
        this.dispose();

        const scheduleForRelevantNodes = (records: MutationRecord[]): void => {
            const invalidDisplayParents = findInvalidDisplayContainerParentsFromRecords(records);
            const repairBlockIds = this.options.clearInvalidContainers(invalidDisplayParents.keys(), invalidDisplayParents);
            const lostBlockIds = findLostContainerBlockIds(records);
            let relevantAdded = false;
            // 从本次事务涉及的节点中收集新块，避免整篇文档查询：
            // - 块替换（updateBlock 插新删旧）：新块在 addedNodes 中
            // - .protyle-attr 内部重建（updateAttrs）：块元素本身没变，从 target 向上取
            const newBlockElements = new Map<string, HTMLElement[]>();
            const reboundBlockIds = new Set<string>();
            for (const record of records) {
                if (record.type === "attributes") {
                    collectReboundBlockId(record, reboundBlockIds, this.customAvsValues);
                    continue;
                }
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
                this.options.restoreLostContainers(lostBlockIds, newBlockElements);
                this.options.scheduleQuietRefresh();
            } else if (repairBlockIds.size > 0) {
                this.options.scheduleRefresh(false, repairBlockIds);
            } else if (relevantAdded) {
                this.options.scheduleRefresh(false);
            }
            // 绑定变化与上面的 DOM 重建相互独立，必须单独处理：
            // 新绑定的块此前没有容器，不会走进任何一条分支。
            if (reboundBlockIds.size > 0) {
                this.options.scheduleRefresh(true, reboundBlockIds);
            }
        };
        const observeProtyle = (root: HTMLElement): void => {
            if (this.observedRoots.has(root)) return;
            this.observedRoots.add(root);
            const observer = new MutationObserver(scheduleForRelevantNodes);
            // 同时观察 custom-avs：块的数据库绑定变化只体现在这个属性上，
            // 不伴随任何新增节点，仅靠 childList 观察不到。
            observer.observe(root, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ["custom-avs"]
            });
            this.contentObservers.set(root, observer);
        };

        document.querySelectorAll<HTMLElement>(PROTYLE_SELECTOR).forEach(observeProtyle);
        this.bodyObserver = new MutationObserver(records => {
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
                        if (hasRelevantNode(node)) requiresRefresh = true;
                    }
                }
            }
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
        // 重新挂载后块元素的绑定基线重新建立
        this.customAvsValues = new WeakMap();
        this.bodyObserver = undefined;
    }
}
