interface PendingRender {
    run: () => void;
    isCurrent: () => boolean;
    resolve: () => void;
    reject: (reason: unknown) => void;
}

export interface FrameRenderQueueOptions {
    /** 单帧最多占用的主线程时间；单个块的渲染不会被拆开。 */
    frameBudgetMs?: number;
}

/**
 * 将独立块的 DOM 写入分散到多个动画帧，避免一批网络响应同时完成时阻塞输入与绘制。
 */
export class FrameRenderQueue {
    private readonly frameBudgetMs: number;
    private readonly pending: PendingRender[] = [];
    private frameId: number | undefined;
    private usesAnimationFrame = false;
    private disposed = false;

    constructor(options: FrameRenderQueueOptions = {}) {
        this.frameBudgetMs = options.frameBudgetMs ?? 8;
    }

    enqueue(run: () => void, isCurrent: () => boolean): Promise<void> {
        if (this.disposed) return Promise.resolve();
        return new Promise((resolve, reject) => {
            // A new refresh cycle can make a large background queue obsolete. Drop
            // those entries before appending an urgent render so stale work cannot
            // occupy several animation frames ahead of the visible block.
            this.discardStale();
            this.pending.push({ run, isCurrent, resolve, reject });
            this.schedule();
        });
    }

    /**
     * 立即移除已过期的帧任务。切换文档或滚动抢占时调用，避免等待下一次网络
     * 响应入队才清理旧任务；任务 promise 以正常完成的方式结束，让上层 worker
     * 能依据刷新周期自行停止。
     */
    discardStale(): void {
        for (let index = this.pending.length - 1; index >= 0; index--) {
            const stale = this.pending[index];
            if (!stale.isCurrent()) {
                this.pending.splice(index, 1);
                stale.resolve();
            }
        }
    }

    dispose(): void {
        this.disposed = true;
        if (this.frameId !== undefined) {
            if (this.usesAnimationFrame) cancelAnimationFrame(this.frameId);
            else clearTimeout(this.frameId);
        }
        this.frameId = undefined;
        this.pending.splice(0).forEach(task => task.resolve());
    }

    private schedule(): void {
        if (this.disposed || this.frameId !== undefined) return;
        if (typeof requestAnimationFrame === "function") {
            this.usesAnimationFrame = true;
            this.frameId = requestAnimationFrame(() => this.drain());
        } else {
            this.usesAnimationFrame = false;
            this.frameId = window.setTimeout(() => this.drain(), 0);
        }
    }

    private drain(): void {
        this.frameId = undefined;
        if (this.disposed) return;
        const startedAt = performance.now();
        while (this.pending.length > 0) {
            const task = this.pending.shift()!;
            if (task.isCurrent()) {
                try {
                    task.run();
                    task.resolve();
                } catch (error) {
                    task.reject(error);
                }
            } else {
                task.resolve();
            }
            if (performance.now() - startedAt >= this.frameBudgetMs) break;
        }
        if (this.pending.length > 0) this.schedule();
    }
}
