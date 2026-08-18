import { NetworkClient } from "@/network/network-client";

declare const __DATABASE_DISPLAY_TRIAL_DAYS__: number;
declare const __DATABASE_DISPLAY_TRIAL_WEBHOOK_URL__: string;

export interface TrialRecord {
    userId: string;
    userName: string;
    activatedAt: string;
    expiresAt: string;
}

export type TrialStatus =
    | { state: "available" }
    | { state: "active"; record: TrialRecord }
    | { state: "used"; record: TrialRecord }
    | { state: "missing-profile" }
    | { state: "unavailable" };

interface TrialServiceOptions {
    getRecords: () => unknown;
    saveRecords: (value: string) => Promise<void>;
    networkClient?: NetworkClient;
}

function currentProfile(): { userId: string; userName: string } {
    return {
        userId: window.siyuan?.user?.userId?.trim() || "",
        userName: window.siyuan?.user?.userName?.trim() || ""
    };
}

function parseRecords(value: unknown): TrialRecord[] {
    if (typeof value !== "string" || !value.trim()) return [];
    try {
        const parsed = JSON.parse(value);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter((record): record is TrialRecord => record && typeof record === "object" &&
            typeof record.userId === "string" && typeof record.userName === "string" &&
            typeof record.activatedAt === "string" && typeof record.expiresAt === "string");
    } catch {
        return [];
    }
}

function formatLocalTime(date: Date): string {
    const parts = [date.getFullYear(), date.getMonth() + 1, date.getDate()]
        .map(part => String(part).padStart(2, "0"));
    const time = [date.getHours(), date.getMinutes(), date.getSeconds()]
        .map(part => String(part).padStart(2, "0"));
    return `${parts.join("-")} ${time.join(":")}`;
}

export class TrialService {
    private readonly networkClient: NetworkClient;

    constructor(private readonly options: TrialServiceOptions) {
        this.networkClient = options.networkClient || new NetworkClient({ serverUrl: "" });
    }

    getStatus(now = Date.now()): TrialStatus {
        // 先检查构建期配置：试用功能是否可用属于构建级事实，应先于用户识别判断
        if (!__DATABASE_DISPLAY_TRIAL_WEBHOOK_URL__ || !Number.isFinite(__DATABASE_DISPLAY_TRIAL_DAYS__) || __DATABASE_DISPLAY_TRIAL_DAYS__ <= 0) {
            return { state: "unavailable" };
        }
        const { userId, userName } = currentProfile();
        if (!userId || !userName) return { state: "missing-profile" };
        const record = parseRecords(this.options.getRecords()).find(item => item.userId === userId);
        if (!record) return { state: "available" };
        return Date.parse(record.expiresAt) > now ? { state: "active", record } : { state: "used", record };
    }

    hasActiveTrial(): boolean {
        return this.getStatus().state === "active";
    }

    async start(): Promise<TrialStatus> {
        const status = this.getStatus();
        if (status.state !== "available") return status;
        const { userId, userName } = currentProfile();
        const activated = new Date();
        const expires = new Date(activated.getTime() + __DATABASE_DISPLAY_TRIAL_DAYS__ * 86400000);
        const record: TrialRecord = {
            userId,
            userName,
            activatedAt: activated.toISOString(),
            expiresAt: expires.toISOString()
        };

        await this.sendReport({
            userid: userId,
            name: userName,
            time: formatLocalTime(activated),
            event: "start",
            trialState: "active",
            expiresAt: record.expiresAt,
        });
        const records = parseRecords(this.options.getRecords());
        records.push(record);
        await this.options.saveRecords(JSON.stringify(records));
        return { state: "active", record };
    }

    /**
     * 试用账户每次加载插件时上报 webhook（含已过期但仍保留试用记录的账户）。
     * 思源账号档案（window.siyuan.user）由内核 getCloudUser 异步填充，插件 onload
     * 阶段尚不可用，故先等待其就绪（未登录用户也会在请求返回后立即结束等待），
     * 超时或无法识别用户则跳过；上报失败不影响插件加载。
     */
    async reportLoad(timeoutMs = 20000): Promise<void> {
        await this.waitForUserProfile(timeoutMs);
        const status = this.getStatus();
        if (status.state !== "active" && status.state !== "used") return;
        const { userId, userName } = currentProfile();
        await this.sendReport({
            userid: userId,
            name: userName,
            time: formatLocalTime(new Date()),
            event: "load",
            trialState: status.state,
            expiresAt: status.record.expiresAt,
        });
    }

    /**
     * 轮询等待 window.siyuan.user 被内核填充（getCloudUser 返回即赋值，未登录时为 null，
     * 此时可立即结束等待）。超时后放弃，避免调用方被长期阻塞。
     */
    private async waitForUserProfile(timeoutMs: number): Promise<void> {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            if (window.siyuan?.user !== undefined) return;
            await new Promise<void>(resolve => setTimeout(resolve, 250));
        }
    }

    private async sendReport(body: Record<string, unknown>): Promise<void> {
        try {
            await this.networkClient.request({
                method: "POST",
                path: __DATABASE_DISPLAY_TRIAL_WEBHOOK_URL__,
                contentType: "application/json",
                body: JSON.stringify(body),
            });
        } catch {
            // A reporting failure must not prevent an otherwise eligible local trial.
        }
    }
}
