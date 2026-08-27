export interface IdleTaskQueueOptions {
    /** 同时进行的低优先级异步任务数。 */
    concurrency?: number;
    /** requestIdleCallback 不可用时的轮询间隔。 */
    fallbackDelayMs?: number;
}

interface IdleDeadlineLike {
    didTimeout: boolean;
    timeRemaining(): number;
}

/**
 * 在浏览器空闲时间执行低优先级异步任务。队列可被新刷新周期清空，已启动的
 * 任务由调用方的周期校验负责丢弃结果；因此不会阻塞首屏刷新或编辑输入。
 */
export class IdleTaskQueue {
    private readonly concurrency: number;
    private readonly fallbackDelayMs: number;
    private readonly tasks: Array<() => Promise<void>> = [];
    private running = 0;
    private handle: number | undefined;
    private handleIsIdleCallback = false;
    private generation = 0;
    private disposed = false;

    constructor(options: IdleTaskQueueOptions = {}) {
        this.concurrency = Math.max(1, Math.floor(options.concurrency ?? 2));
        this.fallbackDelayMs = Math.max(16, options.fallbackDelayMs ?? 50);
    }

    enqueue(tasks: Array<() => Promise<void>>): void {
        if (this.disposed || tasks.length === 0) return;
        this.tasks.push(...tasks);
        this.schedule();
    }

    /** 丢弃尚未启动的任务，并使当前 generation 的结果失效。 */
    clear(): void {
        this.generation++;
        this.tasks.splice(0);
        this.cancelScheduledCallback();
    }

    dispose(): void {
        this.disposed = true;
        this.clear();
    }

    private schedule(): void {
        if (this.disposed || this.handle !== undefined || this.tasks.length === 0 || this.running >= this.concurrency) return;
        const callback = (deadline: IdleDeadlineLike): void => {
            this.handle = undefined;
            this.drain(deadline);
        };
        if (typeof requestIdleCallback === "function") {
            this.handleIsIdleCallback = true;
            this.handle = requestIdleCallback(callback, { timeout: 1000 });
        } else {
            this.handleIsIdleCallback = false;
            this.handle = window.setTimeout(() => callback({
                didTimeout: true,
                timeRemaining: () => 8
            }), this.fallbackDelayMs);
        }
    }

    private drain(deadline: IdleDeadlineLike): void {
        const generation = this.generation;
        while (!this.disposed && this.tasks.length > 0 && this.running < this.concurrency &&
            (deadline.didTimeout || deadline.timeRemaining() > 2)) {
            const task = this.tasks.shift()!;
            this.running++;
            void task().catch(error => {
                console.warn("[DatabaseDisplay] Background render failed", error);
            }).finally(() => {
                this.running--;
                // A clear() may have started a newer generation. Running tasks are
                // still allowed to finish, but must not schedule stale work.
                if (generation === this.generation) this.schedule();
            });
        }
        this.schedule();
    }

    private cancelScheduledCallback(): void {
        if (this.handle === undefined) return;
        if (this.handleIsIdleCallback) cancelIdleCallback(this.handle);
        else clearTimeout(this.handle);
        this.handle = undefined;
    }
}
