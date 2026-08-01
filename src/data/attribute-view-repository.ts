import { Constants, fetchSyncPost, IWebSocketData } from "siyuan";
import { AttributeViewTable, AttributeViewWriteValue, RelationCandidatesPage } from "@/core/types";

interface CacheEntry<T> {
    value: T;
    expiresAt: number;
    accessedAt: number;
}

const MAX_CACHE_ENTRIES = 512;

export class AttributeViewRepository {
    private readonly cache = new Map<string, CacheEntry<unknown>>();
    private readonly pending = new Map<string, Promise<unknown>>();

    async getKeys(blockId: string, force = false): Promise<AttributeViewTable[]> {
        if (!blockId) return [];
        return this.getCached(`keys:${blockId}`, 1500, force, () => this.post<AttributeViewTable[]>("getAttributeViewKeys", { id: blockId }));
    }

    async getItemId(avID: string, blockID: string): Promise<string | undefined> {
        if (!avID || !blockID) return undefined;
        const result = await this.getCached(`item:${avID}:${blockID}`, 15000, false, async () => {
            const mapping = await this.post<Record<string, string>>("getAttributeViewItemIDsByBoundIDs", { avID, blockIDs: [blockID] });
            return mapping[blockID];
        });
        return result || undefined;
    }

    async setValue(avID: string, keyID: string, itemID: string, value: AttributeViewWriteValue): Promise<void> {
        await this.post("setAttributeViewBlockAttr", { avID, keyID, itemID, value });
        this.invalidateAttributeView(avID);
    }

    async updateTemplate(avID: string, keyID: string, template: string): Promise<void> {
        const response = await fetchSyncPost("/api/transactions", {
            reqId: Date.now(),
            session: Constants.SIYUAN_APPID,
            app: Constants.SIYUAN_APPID,
            transactions: [{
                doOperations: [{
                    action: "updateAttrViewColTemplate",
                    id: keyID,
                    avID,
                    data: template,
                    type: "template"
                }]
            }]
        }) as IWebSocketData;
        if (response.code !== 0) throw new Error(response.msg || "Template update failed");
        this.invalidateAttributeView(avID);
    }

    async getRelationCandidates(
        avID: string,
        keyID: string,
        keyword: string,
        selectedBlockIDs: string[],
        page = 1,
        pageSize = 16
    ): Promise<RelationCandidatesPage> {
        return this.post<RelationCandidatesPage>("getAttributeViewRelationCandidates", {
            avID,
            keyID,
            keyword,
            page,
            pageSize,
            selectedBlockIDs
        });
    }

    invalidateBlock(blockId: string): void {
        this.cache.delete(`keys:${blockId}`);
    }

    invalidateAttributeView(avID: string): void {
        for (const key of this.cache.keys()) {
            if (key.includes(`:${avID}:`) || key.startsWith(`keys:`)) this.cache.delete(key);
        }
    }

    private async getCached<T>(key: string, ttl: number, force: boolean, load: () => Promise<T>): Promise<T> {
        const now = Date.now();
        const cached = this.cache.get(key) as CacheEntry<T> | undefined;
        if (!force && cached && cached.expiresAt > now) {
            cached.accessedAt = now;
            return cached.value;
        }
        const existing = this.pending.get(key) as Promise<T> | undefined;
        if (existing) return existing;
        const request = load().then(value => {
            this.pruneCache();
            const timestamp = Date.now();
            this.cache.set(key, { value, expiresAt: timestamp + ttl, accessedAt: timestamp });
            return value;
        }).finally(() => this.pending.delete(key));
        this.pending.set(key, request);
        return request;
    }

    private pruneCache(): void {
        const now = Date.now();
        for (const [key, entry] of this.cache) {
            if (entry.expiresAt <= now) this.cache.delete(key);
        }
        while (this.cache.size >= MAX_CACHE_ENTRIES) {
            let leastRecentlyUsedKey: string | undefined;
            let leastRecentlyUsedAt = Number.POSITIVE_INFINITY;
            for (const [key, entry] of this.cache) {
                if (entry.accessedAt < leastRecentlyUsedAt) {
                    leastRecentlyUsedAt = entry.accessedAt;
                    leastRecentlyUsedKey = key;
                }
            }
            if (!leastRecentlyUsedKey) break;
            this.cache.delete(leastRecentlyUsedKey);
        }
    }

    private async post<T>(endpoint: string, data: unknown): Promise<T> {
        const response = await fetchSyncPost(`/api/av/${endpoint}`, data) as IWebSocketData;
        if (response.code !== 0) throw new Error(response.msg || `Attribute view request failed: ${endpoint}`);
        return response.data as T;
    }
}
