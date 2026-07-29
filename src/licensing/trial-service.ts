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
    constructor(private readonly options: TrialServiceOptions) {}

    getStatus(now = Date.now()): TrialStatus {
        const { userId, userName } = currentProfile();
        if (!userId || !userName) return { state: "missing-profile" };
        if (!__DATABASE_DISPLAY_TRIAL_WEBHOOK_URL__ || !Number.isFinite(__DATABASE_DISPLAY_TRIAL_DAYS__) || __DATABASE_DISPLAY_TRIAL_DAYS__ <= 0) {
            return { state: "unavailable" };
        }
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

        await this.notify(userId, userName, activated);
        const records = parseRecords(this.options.getRecords());
        records.push(record);
        await this.options.saveRecords(JSON.stringify(records));
        return { state: "active", record };
    }

    private async notify(userId: string, userName: string, time: Date): Promise<void> {
        try {
            await fetch(__DATABASE_DISPLAY_TRIAL_WEBHOOK_URL__, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userid: userId, name: userName, time: formatLocalTime(time) }),
                credentials: "omit"
            });
        } catch {
            // A reporting failure must not prevent an otherwise eligible local trial.
        }
    }
}
