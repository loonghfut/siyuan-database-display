const ATTRIBUTE_BLOCK_SELECTOR = "[custom-avs][data-node-id]";
// 预取前后各两个视口的内容：连续滚动时有更充足的请求提前量，仍避免打开文档时请求全文。
const PREFETCH_VIEWPORTS = 2;

export interface ViewportBlockObserverOptions {
    /** 块进入视口或预取区时触发。 */
    onEnter: (blockIds: ReadonlySet<string>) => void;
    /** 已在预取区的块真正进入视口时触发，用于重新提升其请求优先级。 */
    onVisible?: (blockIds: ReadonlySet<string>) => void;
    /** 块完全离开预取区时触发。 */
    onLeave: (blockIds: ReadonlySet<string>) => void;
}

/**
 * 管理拥有数据库属性的块，并用视口交叉状态作为请求优先级。
 *
 * IntersectionObserver 的 rootMargin 负责滚动期间的增量激活。支持该 API 的
 * 环境不主动读取每个块的几何信息，避免大文档首次扫描触发 N 次布局计算。
 */
export class ViewportBlockObserver {
    private observer: IntersectionObserver | undefined;
    private visibleObserver: IntersectionObserver | undefined;
    private readonly observedElements = new Set<HTMLElement>();
    private readonly blockIdByElement = new WeakMap<HTMLElement, string>();
    private readonly parentsByBlockId = new Map<string, Set<HTMLElement>>();
    private readonly activeElements = new Set<HTMLElement>();
    private readonly visibleElements = new Set<HTMLElement>();
    private readonly visibleStatusInitialized = new Set<HTMLElement>();
    private readonly activeCountsByBlockId = new Map<string, number>();
    private fallbackFrameId: number | undefined;
    private fallbackUsesAnimationFrame = false;
    private initialized = false;
    private disposed = false;
    private readonly onFallbackViewportChange = () => this.scheduleFallbackSync();

    constructor(private readonly options: ViewportBlockObserverOptions) {}

    /** 重新扫描当前页面，通常在布局就绪或观察设置变更后调用。 */
    rebuild(): void {
        if (this.disposed) return;
        this.observer?.disconnect();
        this.visibleObserver?.disconnect();
        this.stopFallbackListener();
        const prefetchMargin = Math.max(400, this.viewportHeight() * PREFETCH_VIEWPORTS);
        this.observer = typeof IntersectionObserver === "undefined"
            ? undefined
            : new IntersectionObserver(entries => this.handleEntries(entries), {
                rootMargin: `${prefetchMargin}px 0px ${prefetchMargin}px 0px`
            });
        this.visibleObserver = typeof IntersectionObserver === "undefined"
            ? undefined
            : new IntersectionObserver(entries => this.handleVisibleEntries(entries));
        if (!this.observer) this.startFallbackListener();
        this.observedElements.clear();
        this.parentsByBlockId.clear();
        this.activeElements.clear();
        this.visibleElements.clear();
        this.visibleStatusInitialized.clear();
        this.activeCountsByBlockId.clear();
        this.initialized = true;
        this.discover(false);
    }

    /** 首次使用前保证已建立观察器。 */
    ensureObserved(): void {
        if (!this.initialized) this.rebuild();
    }

    /** 文档/Protyle 新加载完成时扫描一次新增候选块。 */
    discover(notify = true): void {
        this.observeNodes([document.documentElement], notify);
    }

    /** 同步当前 DOM 与几何状态；全量刷新前调用可避免等待异步 IO 回调。 */
    sync(notify = true): void {
        if (this.disposed) return;
        this.discover(false);
        const entered = new Set<string>();
        const visibleEntered = new Set<string>();
        const left = new Set<string>();
        this.pruneDisconnected(left);
        for (const element of this.observedElements) {
            this.setActive(element, this.isWithinPrefetchRange(element), entered, left);
            this.setVisible(element, this.isWithinViewport(element), visibleEntered);
        }
        if (notify && left.size > 0) this.options.onLeave(left);
        if (notify && entered.size > 0) this.options.onEnter(entered);
        if (notify && visibleEntered.size > 0) this.options.onVisible?.(visibleEntered);
    }

    /**
     * 登记新增 DOM 中的属性块。传入 false 时仅更新内部状态，不触发刷新回调。
     */
    observeNodes(nodes: Iterable<Node>, notify = true): void {
        if (this.disposed) return;
        const candidates = new Set<HTMLElement>();
        for (const node of nodes) this.collectCandidates(node, candidates);

        const entered = new Set<string>();
        for (const element of candidates) {
            if (!this.register(element)) continue;
            // 现代思源（Electron/Chromium）由 IO 给出初始交叉状态；这样不会在
            // 长文档登记时对每个块调用 getBoundingClientRect。旧环境才同步回退。
            if (!this.observer && this.isWithinPrefetchRange(element)) {
                this.setActive(element, true, entered, new Set<string>());
                this.setVisible(element, this.isWithinViewport(element), new Set<string>());
            }
        }
        if (notify && entered.size > 0) this.options.onEnter(entered);
    }

    /** 从被移除的 DOM 子树中解除观察，避免长文档会话累积失效元素。 */
    unobserveNodes(nodes: Iterable<Node>): void {
        if (this.disposed) return;
        const candidates = new Set<HTMLElement>();
        for (const node of nodes) this.collectObservedCandidates(node, candidates);
        const left = new Set<string>();
        for (const element of candidates) this.unregister(element, left);
        if (left.size > 0) this.options.onLeave(left);
    }

    /** 同步清理失效 DOM，并返回当前视口/预取区内的块 ID。 */
    getActiveBlockIds(): Set<string> {
        return new Set(this.activeCountsByBlockId.keys());
    }

    /**
     * 返回请求目标的宿主节点，并按到视口的距离排序。
     * activeOnly 用于滚动触发的任务：若用户已滚过该块，则不再补渲染旧位置。
     */
    getPrioritizedParents(blockIds?: ReadonlySet<string>, activeOnly = false): Map<string, HTMLElement[]> {
        const ids = blockIds ? [...blockIds] : [...this.parentsByBlockId.keys()];
        const entries: Array<[string, HTMLElement[]]> = [];
        for (const blockId of ids) {
            if (activeOnly && !this.activeCountsByBlockId.has(blockId)) continue;
            const parents = [...(this.parentsByBlockId.get(blockId) || [])]
                .filter(element => this.isRenderableElement(element));
            if (parents.length > 0) entries.push([blockId, parents]);
        }
        if (activeOnly) entries.sort(([, left], [, right]) => this.viewportDistance(left) - this.viewportDistance(right));
        return new Map(entries);
    }

    /**
     * 返回未处于活跃窗口的挂载块。这里不读取几何信息，供空闲队列后台补全，
     * 避免为了排后台任务而再次对整篇文档触发布局计算。
     */
    getBackgroundParents(excludedBlockIds: ReadonlySet<string>): Map<string, HTMLElement[]> {
        const entries: Array<[string, HTMLElement[]]> = [];
        for (const [blockId, elements] of this.parentsByBlockId) {
            if (excludedBlockIds.has(blockId)) continue;
            const parents = [...elements].filter(element => this.isMountedCandidate(element));
            if (parents.length > 0) entries.push([blockId, parents]);
        }
        return new Map(entries);
    }

    /** 返回当前仍在预取区内的单个块宿主。 */
    getActiveParents(blockId: string): HTMLElement[] {
        if (!this.activeCountsByBlockId.has(blockId)) return [];
        return [...(this.parentsByBlockId.get(blockId) || [])].filter(element => this.isRenderableElement(element));
    }

    /** 返回当前仍挂载且不在隐藏标签页内的单个块宿主。 */
    getMountedParents(blockId: string): HTMLElement[] {
        return [...(this.parentsByBlockId.get(blockId) || [])].filter(element => this.isMountedCandidate(element));
    }

    /** 当前块仍在视口或预取区内时才提交异步请求的渲染结果。 */
    isActive(blockId: string): boolean {
        return this.activeCountsByBlockId.has(blockId);
    }

    dispose(): void {
        this.disposed = true;
        this.observer?.disconnect();
        this.observer = undefined;
        this.visibleObserver?.disconnect();
        this.visibleObserver = undefined;
        this.stopFallbackListener();
        this.observedElements.clear();
        this.parentsByBlockId.clear();
        this.activeElements.clear();
        this.visibleElements.clear();
        this.visibleStatusInitialized.clear();
        this.activeCountsByBlockId.clear();
        this.initialized = false;
    }

    private collectCandidates(node: Node, candidates: Set<HTMLElement>): void {
        if (!(node instanceof Element)) return;
        if (node instanceof HTMLElement && node.matches(ATTRIBUTE_BLOCK_SELECTOR)) candidates.add(node);
        node.querySelectorAll<HTMLElement>(ATTRIBUTE_BLOCK_SELECTOR).forEach(element => candidates.add(element));
    }

    private collectObservedCandidates(node: Node, candidates: Set<HTMLElement>): void {
        if (!(node instanceof Element)) return;
        if (node instanceof HTMLElement && this.observedElements.has(node)) candidates.add(node);
        node.querySelectorAll<HTMLElement>(ATTRIBUTE_BLOCK_SELECTOR).forEach(element => {
            if (this.observedElements.has(element)) candidates.add(element);
        });
    }

    private register(element: HTMLElement): boolean {
        const blockId = element.dataset.nodeId;
        if (!blockId || this.observedElements.has(element)) return false;
        this.observedElements.add(element);
        this.blockIdByElement.set(element, blockId);
        const parents = this.parentsByBlockId.get(blockId) || new Set<HTMLElement>();
        parents.add(element);
        this.parentsByBlockId.set(blockId, parents);
        this.observer?.observe(element);
        this.visibleObserver?.observe(element);
        return true;
    }

    private handleEntries(entries: IntersectionObserverEntry[]): void {
        if (this.disposed) return;
        const entered = new Set<string>();
        const left = new Set<string>();
        for (const entry of entries) {
            if (!(entry.target instanceof HTMLElement) || !this.observedElements.has(entry.target)) continue;
            if (!entry.target.isConnected) {
                this.unregister(entry.target, left);
                continue;
            }
            // 隐藏标签页中的元素可能保留在 DOM 中，不能因过期的 IO 条目而被请求。
            const active = entry.isIntersecting && this.isRenderableElement(entry.target);
            this.setActive(entry.target, active, entered, left);
        }
        if (left.size > 0) this.options.onLeave(left);
        if (entered.size > 0) this.options.onEnter(entered);
    }

    private handleVisibleEntries(entries: IntersectionObserverEntry[]): void {
        if (this.disposed) return;
        const entered = new Set<string>();
        for (const entry of entries) {
            if (!(entry.target instanceof HTMLElement) || !this.observedElements.has(entry.target)) continue;
            const visible = entry.isIntersecting && this.isRenderableElement(entry.target);
            // 首轮可见回调与预取 observer 的首轮回调重复；由后者负责启动首屏。
            // 之后从预取区进入真实视口时才触发重新排序。
            if (!this.visibleStatusInitialized.has(entry.target)) {
                this.visibleStatusInitialized.add(entry.target);
                this.setVisible(entry.target, visible, new Set<string>());
                continue;
            }
            this.setVisible(entry.target, visible, entered);
        }
        if (entered.size > 0) this.options.onVisible?.(entered);
    }

    private setActive(element: HTMLElement, active: boolean, entered: Set<string>, left: Set<string>): void {
        const wasActive = this.activeElements.has(element);
        if (wasActive === active) return;
        const blockId = this.blockIdByElement.get(element);
        if (!blockId) return;

        if (active) {
            this.activeElements.add(element);
            const previous = this.activeCountsByBlockId.get(blockId) || 0;
            this.activeCountsByBlockId.set(blockId, previous + 1);
            if (previous === 0) entered.add(blockId);
            return;
        }

        this.activeElements.delete(element);
        const next = Math.max(0, (this.activeCountsByBlockId.get(blockId) || 1) - 1);
        if (next > 0) {
            this.activeCountsByBlockId.set(blockId, next);
        } else {
            this.activeCountsByBlockId.delete(blockId);
            left.add(blockId);
        }
    }

    private setVisible(element: HTMLElement, visible: boolean, entered: Set<string>): void {
        const wasVisible = this.visibleElements.has(element);
        if (wasVisible === visible) return;
        if (visible) {
            this.visibleElements.add(element);
            const blockId = this.blockIdByElement.get(element);
            if (blockId) entered.add(blockId);
        } else {
            this.visibleElements.delete(element);
        }
    }

    private pruneDisconnected(left?: Set<string>): void {
        const removedBlockIds = left || new Set<string>();
        for (const element of [...this.observedElements]) {
            if (element.isConnected && element.matches(ATTRIBUTE_BLOCK_SELECTOR)) continue;
            this.unregister(element, removedBlockIds);
        }
        if (!left && removedBlockIds.size > 0) this.options.onLeave(removedBlockIds);
    }

    private unregister(element: HTMLElement, left: Set<string>): void {
        if (!this.observedElements.has(element)) return;
        this.observer?.unobserve(element);
        this.visibleObserver?.unobserve(element);
        this.setActive(element, false, new Set<string>(), left);
        this.visibleElements.delete(element);
        this.visibleStatusInitialized.delete(element);
        this.observedElements.delete(element);
        const blockId = this.blockIdByElement.get(element);
        if (!blockId) return;
        const parents = this.parentsByBlockId.get(blockId);
        parents?.delete(element);
        if (parents?.size === 0) this.parentsByBlockId.delete(blockId);
    }

    private isWithinPrefetchRange(element: HTMLElement): boolean {
        if (!this.isRenderableElement(element)) return false;
        const rect = element.getBoundingClientRect();
        const height = this.viewportHeight();
        const width = this.viewportWidth();
        if (height <= 0 || width <= 0) return false;
        const verticalMargin = height * PREFETCH_VIEWPORTS;
        return rect.bottom >= -verticalMargin && rect.top <= height + verticalMargin &&
            rect.right >= 0 && rect.left <= width;
    }

    private isWithinViewport(element: HTMLElement): boolean {
        if (!this.isRenderableElement(element)) return false;
        const rect = element.getBoundingClientRect();
        const height = this.viewportHeight();
        const width = this.viewportWidth();
        return rect.bottom >= 0 && rect.top <= height && rect.right >= 0 && rect.left <= width;
    }

    private isRenderableElement(element: HTMLElement): boolean {
        return this.isMountedCandidate(element) && element.getClientRects().length > 0;
    }

    private isMountedCandidate(element: HTMLElement): boolean {
        return element.isConnected && element.matches(ATTRIBUTE_BLOCK_SELECTOR) && !element.closest(".fn__none");
    }

    private viewportDistance(parents: HTMLElement[]): number {
        const height = this.viewportHeight();
        const width = this.viewportWidth();
        let distance = Number.POSITIVE_INFINITY;
        for (const parent of parents) {
            const rect = parent.getBoundingClientRect();
            const vertical = rect.bottom < 0 ? -rect.bottom : rect.top > height ? rect.top - height : 0;
            const horizontal = rect.right < 0 ? -rect.right : rect.left > width ? rect.left - width : 0;
            distance = Math.min(distance, Math.hypot(vertical, horizontal));
        }
        return distance;
    }

    private viewportHeight(): number {
        return window.innerHeight || document.documentElement.clientHeight || 0;
    }

    private viewportWidth(): number {
        return window.innerWidth || document.documentElement.clientWidth || 0;
    }

    private startFallbackListener(): void {
        window.addEventListener("scroll", this.onFallbackViewportChange, true);
        window.addEventListener("resize", this.onFallbackViewportChange);
    }

    private stopFallbackListener(): void {
        window.removeEventListener("scroll", this.onFallbackViewportChange, true);
        window.removeEventListener("resize", this.onFallbackViewportChange);
        if (this.fallbackFrameId !== undefined) {
            if (this.fallbackUsesAnimationFrame) cancelAnimationFrame(this.fallbackFrameId);
            else clearTimeout(this.fallbackFrameId);
        }
        this.fallbackFrameId = undefined;
    }

    private scheduleFallbackSync(): void {
        if (this.disposed || this.observer || this.fallbackFrameId !== undefined) return;
        if (typeof requestAnimationFrame === "function") {
            this.fallbackUsesAnimationFrame = true;
            this.fallbackFrameId = requestAnimationFrame(() => {
                this.fallbackFrameId = undefined;
                this.sync();
            });
        } else {
            this.fallbackUsesAnimationFrame = false;
            this.fallbackFrameId = window.setTimeout(() => {
                this.fallbackFrameId = undefined;
                this.sync();
            }, 0);
        }
    }
}
