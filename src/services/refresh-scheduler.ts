/** 单次刷新请求：blockIds 缺省表示全量刷新。 */
export interface RefreshRequest {
    readonly force: boolean;
    readonly blockIds?: ReadonlySet<string>;
    /** 是否在前台块完成后安排全文的低优先级补全。 */
    readonly includeBackground?: boolean;
}

export interface RefreshSchedulerOptions {
    /** 去抖窗口：窗口内的请求合并为一次执行。 */
    debounceMs?: number;
    /** 编辑静默窗口：等待思源编辑事务停止后再恢复展示。 */
    quietDelayMs?: number;
}

/**
 * 刷新调度器：把短时间内的多次刷新请求合并为一次执行（force 与全量请求优先），
 * 在途刷新期间到达的请求排队，待当前执行结束后再次调度。
 *
 * 同时维护刷新周期编号：execute 开始时取一次编号，异步步骤中用 isCurrent
 * 校验结果是否已过期（期间又有新刷新或已 dispose）。dispose 后不再调度，
 * 在途异步结果全部过期。
 */
export class RefreshScheduler {
    private readonly debounceMs: number;
    private readonly quietDelayMs: number;
    private timer: ReturnType<typeof setTimeout> | undefined;
    private quietTimer: ReturnType<typeof setTimeout> | undefined;
    private forcePending = false;
    private includeBackgroundPending = false;
    private allPending = false;
    private readonly blockIdsPending = new Set<string>();
    private inFlight = false;
    private afterInFlight = false;
    private forceAfterInFlight = false;
    private includeBackgroundAfterInFlight = false;
    private allAfterInFlight = false;
    private readonly blockIdsAfterInFlight = new Set<string>();
    private version = 0;
    private disposed = false;

    constructor(
        private readonly execute: (request: RefreshRequest) => Promise<void>,
        options: RefreshSchedulerOptions = {}
    ) {
        this.debounceMs = options.debounceMs ?? 20;
        this.quietDelayMs = options.quietDelayMs ?? 300;
    }

    /** 开始一个新的刷新周期，返回周期编号；编号过期的周期应尽快返回。 */
    beginCycle(): number {
        return ++this.version;
    }

    isCurrent(cycle: number): boolean {
        return cycle === this.version;
    }

    /**
     * 立即让当前周期过期。网络请求本身无法取消，但 worker 会在发起下一项前
     * 检查周期，因此切换文档或收到强制更新时不会继续耗尽旧队列。
     */
    cancelCurrent(): void {
        if (!this.disposed) this.version++;
    }

    /**
     * 丢弃尚未执行及在途任务之后排队的刷新，并让当前周期失效。
     * 用于切换文档：新文档 ID 尚在解析时，旧文档的去抖/静默任务不能继续发起
     * 数据库请求。已经开始的请求无法取消，但其结果会因周期号过期而被丢弃。
     */
    cancelPending(): void {
        if (this.disposed) return;
        this.cancelCurrent();
        if (this.timer) clearTimeout(this.timer);
        if (this.quietTimer) clearTimeout(this.quietTimer);
        this.timer = undefined;
        this.quietTimer = undefined;
        this.forcePending = false;
        this.includeBackgroundPending = false;
        this.allPending = false;
        this.blockIdsPending.clear();
        this.afterInFlight = false;
        this.forceAfterInFlight = false;
        this.includeBackgroundAfterInFlight = false;
        this.allAfterInFlight = false;
        this.blockIdsAfterInFlight.clear();
    }

    schedule(force = false, blockIds?: ReadonlySet<string>, includeBackground = false): void {
        if (this.disposed) return;
        this.forcePending ||= force;
        this.includeBackgroundPending ||= includeBackground;
        if (blockIds === undefined) {
            this.allPending = true;
            this.blockIdsPending.clear();
        } else if (!this.allPending) {
            blockIds.forEach(blockId => this.blockIdsPending.add(blockId));
        }
        if (this.timer) clearTimeout(this.timer);
        this.timer = setTimeout(() => {
            this.timer = undefined;
            // 先快照并清空 pending，再触发执行：execute 的同步前奏期间
            // 到达的新请求才能正确合入下一轮，而不是被本轮清空。
            const request: RefreshRequest = {
                force: this.forcePending,
                blockIds: this.allPending ? undefined : new Set(this.blockIdsPending),
                includeBackground: this.includeBackgroundPending
            };
            this.forcePending = false;
            this.includeBackgroundPending = false;
            this.allPending = false;
            this.blockIdsPending.clear();
            this.refresh(request);
        }, this.debounceMs);
    }

    /**
     * 编辑静默后再恢复的刷新：思源编辑事务会频繁替换块 DOM（注入容器随之消失），
     * 立即恢复会造成"消失-恢复"闪烁，因此聚合到编辑停止后一次性恢复。
     */
    scheduleQuiet(): void {
        if (this.quietTimer) clearTimeout(this.quietTimer);
        this.quietTimer = setTimeout(() => {
            this.quietTimer = undefined;
            this.schedule(false);
        }, this.quietDelayMs);
    }

    private refresh(request: RefreshRequest): void {
        if (this.disposed) return;
        if (this.inFlight) {
            this.afterInFlight = true;
            this.forceAfterInFlight ||= request.force;
            this.includeBackgroundAfterInFlight ||= request.includeBackground;
            if (request.blockIds === undefined) {
                this.allAfterInFlight = true;
                this.blockIdsAfterInFlight.clear();
            } else if (!this.allAfterInFlight) {
                request.blockIds.forEach(blockId => this.blockIdsAfterInFlight.add(blockId));
            }
            return;
        }
        this.inFlight = true;
        void this.execute(request).finally(() => {
            this.inFlight = false;
            if (this.disposed || !this.afterInFlight) return;
            const queued: RefreshRequest = {
                force: this.forceAfterInFlight,
                blockIds: this.allAfterInFlight ? undefined : new Set(this.blockIdsAfterInFlight),
                includeBackground: this.includeBackgroundAfterInFlight
            };
            this.afterInFlight = false;
            this.forceAfterInFlight = false;
            this.includeBackgroundAfterInFlight = false;
            this.allAfterInFlight = false;
            this.blockIdsAfterInFlight.clear();
            this.schedule(queued.force, queued.blockIds, queued.includeBackground);
        });
    }

    dispose(): void {
        this.disposed = true;
        // 让所有在途异步步骤的周期编号失效
        this.version++;
        if (this.timer) clearTimeout(this.timer);
        if (this.quietTimer) clearTimeout(this.quietTimer);
        this.timer = undefined;
        this.quietTimer = undefined;
        this.forcePending = false;
        this.includeBackgroundPending = false;
        this.allPending = false;
        this.blockIdsPending.clear();
        this.afterInFlight = false;
        this.forceAfterInFlight = false;
        this.includeBackgroundAfterInFlight = false;
        this.allAfterInFlight = false;
        this.blockIdsAfterInFlight.clear();
    }
}
