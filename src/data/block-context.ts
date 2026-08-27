import { fetchSyncPost, IWebSocketData } from "siyuan";

export function getVisibleAttributeBlockParents(): Map<string, HTMLElement[]> {
    const parentsByBlockId = new Map<string, HTMLElement[]>();
    document.querySelectorAll<HTMLElement>("[custom-avs][data-node-id]").forEach(element => {
        const blockId = element.dataset.nodeId;
        // Hidden tabs/docks keep their Protyle DOM mounted. They are not candidates
        // for the current document and would otherwise add needless requests.
        if (!blockId || element.closest(".fn__none")) return;
        const parents = parentsByBlockId.get(blockId);
        if (parents) {
            parents.push(element);
        } else {
            parentsByBlockId.set(blockId, [element]);
        }
    });
    return parentsByBlockId;
}

export function getVisibleAttributeBlockIds(): string[] {
    return [...getVisibleAttributeBlockParents().keys()];
}

// 块 ID 白名单：思源默认 ID 为时间戳-字母数字，用户也可自定义含 CJK 的 ID，
// 因此允许任意文字/数字；排除引号等字符后再拼接 SQL（与转义互为兜底）
const SAFE_BLOCK_ID = /^[\p{L}\p{N}_-]+$/u;

export async function resolveDocumentId(blockId: string): Promise<string> {
    if (!blockId) return "";
    if (!SAFE_BLOCK_ID.test(blockId)) return blockId;
    const escapedId = blockId.replace(/'/g, "''");
    const response = await fetchSyncPost("/api/query/sql", { stmt: `SELECT root_id FROM blocks WHERE id = '${escapedId}'` }) as IWebSocketData;
    if (response.code !== 0 || !Array.isArray(response.data)) return blockId;
    return response.data[0]?.root_id || blockId;
}

export function getCurrentDocumentId(detail: unknown): string {
    const eventDetail = detail as { protyle?: { block?: { id?: string } } };
    return eventDetail?.protyle?.block?.id || "";
}
