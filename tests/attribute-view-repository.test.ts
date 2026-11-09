import { describe, it, expect, vi, beforeEach } from "vitest";
import { AttributeViewRepository } from "@/data/attribute-view-repository";
import type { AttributeViewTable } from "@/core/types";

// ─────────────────────────── mock siyuan ───────────────────────────
// vitest 的 moduleNameMapper 已把 "siyuan" 指向 tests/mocks/siyuan.ts，
// 这里直接在全局注入 __avStub 覆盖具体请求。

type StubHandler = (url: string, data: unknown) => Promise<{ code: number; msg: string; data: unknown }>;

function makeOkResponse(data: unknown) {
    return Promise.resolve({ code: 0, msg: "", data });
}

function installStub(handler: StubHandler) {
    (globalThis as Record<string, unknown>).__avStub = handler;
}

function removeStub() {
    delete (globalThis as Record<string, unknown>).__avStub;
}

// ─────────────────────────── helpers ───────────────────────────

function emptyTable(avID: string): AttributeViewTable {
    return { avID, keyValues: [], blockIDs: ["block-1"] };
}

// ─────────────────────────── tests ───────────────────────────

describe("AttributeViewRepository", () => {
    let repo: AttributeViewRepository;

    beforeEach(() => {
        repo = new AttributeViewRepository();
        removeStub();
    });

    // ── getKeys 缓存基础行为 ────────────────────────────────────────

    describe("getKeys — 缓存命中", () => {
        it("第一次请求内核，第二次命中缓存（请求数 = 1）", async () => {
            let callCount = 0;
            installStub(async (url) => {
                if (url.endsWith("getAttributeViewKeys")) callCount++;
                return makeOkResponse([emptyTable("av1")]);
            });

            await repo.getKeys("block-1");
            await repo.getKeys("block-1");
            expect(callCount).toBe(1);
        });

        it("force=true 跳过缓存，每次都请求内核", async () => {
            let callCount = 0;
            installStub(async (url) => {
                if (url.endsWith("getAttributeViewKeys")) callCount++;
                return makeOkResponse([emptyTable("av1")]);
            });

            await repo.getKeys("block-1", false);  // 建缓存
            await repo.getKeys("block-1", true);   // 跳过缓存
            expect(callCount).toBe(2);
        });
    });

    // ── invalidateBlock 精确失效 ────────────────────────────────────

    describe("invalidateBlock", () => {
        it("失效后下次请求重新走内核", async () => {
            let callCount = 0;
            installStub(async (url) => {
                if (url.endsWith("getAttributeViewKeys")) callCount++;
                return makeOkResponse([emptyTable("av1")]);
            });

            await repo.getKeys("block-1");   // 缓存
            repo.invalidateBlock("block-1");
            await repo.getKeys("block-1");   // 缓存已失效，再走内核
            expect(callCount).toBe(2);
        });

        it("失效 block-1 不影响 block-2 的缓存", async () => {
            let block1Calls = 0;
            let block2Calls = 0;
            installStub(async (url, data) => {
                const id = (data as Record<string, string>).id;
                if (url.endsWith("getAttributeViewKeys")) {
                    if (id === "block-1") block1Calls++;
                    if (id === "block-2") block2Calls++;
                }
                return makeOkResponse([emptyTable("av1")]);
            });

            await repo.getKeys("block-1");
            await repo.getKeys("block-2");
            repo.invalidateBlock("block-1");
            await repo.getKeys("block-1");   // 重新请求
            await repo.getKeys("block-2");   // 仍命中缓存

            expect(block1Calls).toBe(2);
            expect(block2Calls).toBe(1);
        });
    });

    // ── invalidateAttributeView 精确失效 ────────────────────────────

    describe("invalidateAttributeView", () => {
        it("写入后相关 block 的缓存失效", async () => {
            let callCount = 0;
            installStub(async (url) => {
                if (url.endsWith("getAttributeViewKeys")) callCount++;
                return makeOkResponse([emptyTable("av1")]);
            });

            // 建立 block → av1 的映射
            await repo.getKeys("block-1");
            // 写入 av1 触发失效
            repo.invalidateAttributeView("av1");
            // 再次获取应重新请求
            await repo.getKeys("block-1");
            expect(callCount).toBe(2);
        });

        it("失效 av1 不影响只使用 av2 的 block", async () => {
            let callCount = 0;
            installStub(async (url) => {
                if (url.endsWith("getAttributeViewKeys")) callCount++;
                return makeOkResponse([emptyTable("av2")]);
            });

            await repo.getKeys("block-2");
            repo.invalidateAttributeView("av1"); // av1 与 block-2 无关
            await repo.getKeys("block-2");
            expect(callCount).toBe(1);           // 仍命中缓存
        });
    });

    // ── 并发请求合并 ────────────────────────────────────────────────

    describe("并发请求去重", () => {
        it("同时发起的多个相同 blockId 请求只产生一次内核调用", async () => {
            let callCount = 0;
            installStub(async (url) => {
                if (url.endsWith("getAttributeViewKeys")) callCount++;
                // 模拟轻微延迟确保真正并发
                await new Promise(r => setTimeout(r, 1));
                return makeOkResponse([emptyTable("av1")]);
            });

            await Promise.all([
                repo.getKeys("block-1"),
                repo.getKeys("block-1"),
                repo.getKeys("block-1")
            ]);
            expect(callCount).toBe(1);
        });
    });

    // ── 失效纪元：写入前的旧请求不回填 ────────────────────────────

    describe("失效纪元", () => {
        it("写入后先于失效发起的旧请求不回填缓存", async () => {
            let resolveOld!: (v: { code: number; msg: string; data: unknown }) => void;
            let callCount = 0;

            installStub(async (url) => {
                callCount++;
                if (callCount === 1) {
                    // 第一次请求挂起
                    return new Promise<{ code: number; msg: string; data: unknown }>(resolve => { resolveOld = resolve; });
                }
                return makeOkResponse([emptyTable("av1-new")]);
            });

            // 发起第一次请求（挂起中）
            const firstPromise = repo.getKeys("block-1");
            // 失效（递增 epoch）
            repo.invalidateBlock("block-1");
            // 让旧请求完成（携带旧数据）
            resolveOld({ code: 0, msg: "", data: [emptyTable("av1-old")] });
            await firstPromise;

            // 再次请求，应得到新数据（旧请求的回填被 epoch 检查拦截）
            const result = await repo.getKeys("block-1");
            expect(result[0]?.avID).toBe("av1-new");
        });
    });

    // ── getFields 独立缓存 ──────────────────────────────────────────

    describe("getFields", () => {
        it("按 avID 缓存，重复调用只请求一次", async () => {
            let callCount = 0;
            installStub(async (url) => {
                if (url.endsWith("getAttributeViewKeysByAvID")) callCount++;
                return makeOkResponse([{ id: "k1", name: "状态" }]);
            });

            await repo.getFields("av1");
            await repo.getFields("av1");
            expect(callCount).toBe(1);
        });
    });

    // ── 空 blockId 的防御性处理 ────────────────────────────────────

    describe("防御性处理", () => {
        it("空 blockId 返回空数组，不发请求", async () => {
            let callCount = 0;
            installStub(async () => { callCount++; return makeOkResponse([]); });

            const result = await repo.getKeys("");
            expect(result).toEqual([]);
            expect(callCount).toBe(0);
        });

        it("空 avID 的 getFields 返回空数组，不发请求", async () => {
            let callCount = 0;
            installStub(async () => { callCount++; return makeOkResponse([]); });

            const result = await repo.getFields("");
            expect(result).toEqual([]);
            expect(callCount).toBe(0);
        });
    });
});
