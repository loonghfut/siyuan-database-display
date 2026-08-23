import { Constants, fetchSyncPost, IWebSocketData } from "siyuan";
import { AttributeViewTable, AttributeViewWriteValue, RelationCandidatesPage } from "@/core/types";

interface CacheEntry<T> {
    value: T;
    expiresAt: number;
    accessedAt: number;
}

const MAX_CACHE_ENTRIES = 512;
// keys 缓存有效期。数据变更会经 websocket 广播（transactions / refreshAttributeView）
// 触发受影响块的强制刷新，因此周期自动刷新（≥5s）可以放心命中缓存，
// 避免每轮对每个可见块重复请求内核。
const KEYS_TTL_MS = 30_000;

export class AttributeViewRepository {
    private readonly cache = new Map<string, CacheEntry<unknown>>();
    private readonly pending = new Map<string, Promise<unknown>>();
    // avID → 使用该属性视图的块集合，用于写入后精确失效对应的 keys 缓存
    private readonly blocksByAttributeView = new Map<string, Set<string>>();
    // 失效纪元：任何缓存失效时递增。写入前发起的旧请求完成时据此跳过回填，
    // 避免把写前数据重新写进缓存（在 TTL 内持续读到旧值）。
    private invalidationEpoch = 0;

    async getKeys(blockId: string, force = false): Promise<AttributeViewTable[]> {
        if (!blockId) return [];
        const tables = await this.getCached(`keys:${blockId}`, KEYS_TTL_MS, force,
            () => this.post<AttributeViewTable[]>("getAttributeViewKeys", { id: blockId }));
        this.indexBlockKeys(blockId, tables);
        return tables;
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

    /**
     * 修改 select/mSelect 列的某个选项颜色（作用于整列，影响所有行）。
     * 颜色为思源调色板索引 1-14 或空字符串。
     */
    async updateSelectOptionColor(avID: string, keyID: string, optionName: string, oldColor: string, newColor: string): Promise<void> {
        const response = await fetchSyncPost("/api/transactions", {
            reqId: Date.now(),
            session: Constants.SIYUAN_APPID,
            app: Constants.SIYUAN_APPID,
            transactions: [{
                doOperations: [{
                    action: "updateAttrViewColOption",
                    id: keyID,
                    avID,
                    data: {
                        oldName: optionName,
                        newName: optionName,
                        oldColor,
                        newColor,
                        newDesc: ""
                    }
                }]
            }]
        }) as IWebSocketData;
        if (response.code !== 0) throw new Error(response.msg || "Select option color update failed");
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
        this.invalidationEpoch++;
        this.dropPending(`keys:${blockId}`);
        this.dropCacheKey(`keys:${blockId}`);
        this.forgetBlock(blockId);
    }

    /**
     * 写入后失效该属性视图相关缓存：仅清掉已知使用该视图的块的 keys 缓存
     * 与该视图的 item 映射缓存，不影响其他属性视图（避免全清导致的请求放大）。
     */
    invalidateAttributeView(avID: string): void {
        this.invalidationEpoch++;
        for (const blockId of this.blocksByAttributeView.get(avID) || []) {
            this.dropPending(`keys:${blockId}`);
            this.dropCacheKey(`keys:${blockId}`);
        }
        this.blocksByAttributeView.delete(avID);
        for (const key of [...this.cache.keys(), ...this.pending.keys()]) {
            if (key.startsWith(`item:${avID}:`)) {
                this.dropCacheKey(key);
                this.dropPending(key);
            }
        }
    }

    /** 维护 avID → 块的反向索引，同步剔除块已不再使用的属性视图。 */
    private indexBlockKeys(blockId: string, tables: AttributeViewTable[]): void {
        const avIDs = new Set(tables.map(table => table.avID).filter(Boolean));
        for (const [avID, blocks] of this.blocksByAttributeView) {
            if (avIDs.has(avID)) continue;
            blocks.delete(blockId);
            if (!blocks.size) this.blocksByAttributeView.delete(avID);
        }
        for (const avID of avIDs) {
            const blocks = this.blocksByAttributeView.get(avID) || new Set<string>();
            blocks.add(blockId);
            this.blocksByAttributeView.set(avID, blocks);
        }
    }

    private forgetBlock(blockId: string): void {
        for (const [avID, blocks] of this.blocksByAttributeView) {
            if (!blocks.delete(blockId)) continue;
            if (!blocks.size) this.blocksByAttributeView.delete(avID);
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
        // 请求发起后若发生过缓存失效（写入），完成时不再回填缓存，
        // 由失效后的新请求取到写后数据。
        const epoch = this.invalidationEpoch;
        const request = load().then(value => {
            if (epoch === this.invalidationEpoch) {
                this.pruneCache();
                const timestamp = Date.now();
                this.cache.set(key, { value, expiresAt: timestamp + ttl, accessedAt: timestamp });
            }
            return value;
        }).finally(() => {
            // 失效清理可能已把本 key 的 pending 换成新请求，只移除仍属于自己的条目
            if (this.pending.get(key) === request) this.pending.delete(key);
        });
        this.pending.set(key, request);
        return request;
    }

    /** 移除在途请求登记：失效后新调用应发起新请求，而不是加入写前的旧在途请求。 */
    private dropPending(key: string): void {
        this.pending.delete(key);
    }

    private pruneCache(): void {
        const now = Date.now();
        for (const [key, entry] of this.cache) {
            if (entry.expiresAt <= now) this.dropCacheKey(key);
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
            this.dropCacheKey(leastRecentlyUsedKey);
        }
    }

    /** 删除缓存条目时同步清理反向索引，避免长会话中索引随淘汰条目累积。 */
    private dropCacheKey(key: string): void {
        this.cache.delete(key);
        if (key.startsWith("keys:")) this.forgetBlock(key.slice("keys:".length));
    }

    private async post<T>(endpoint: string, data: unknown): Promise<T> {
        const response = await fetchSyncPost(`/api/av/${endpoint}`, data) as IWebSocketData;
        if (response.code !== 0) throw new Error(response.msg || `Attribute view request failed: ${endpoint}`);
        return response.data as T;
    }
}

/**
 * 全局共享的仓储实例：显示控制器与各编辑器共用同一缓存，
 * 写入后的缓存失效对所有调用方生效。
 */
export const attributeViewRepository = new AttributeViewRepository();
