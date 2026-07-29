import { fetchSyncPost, IWebSocketData } from "siyuan";

export function getVisibleAttributeBlockIds(): string[] {
    return [...new Set([...document.querySelectorAll<HTMLElement>("[custom-avs][data-node-id]")]
        .map(element => element.dataset.nodeId)
        .filter((id): id is string => Boolean(id)))];
}

export async function resolveDocumentId(blockId: string): Promise<string> {
    if (!blockId) return "";
    const escapedId = blockId.replace(/'/g, "''");
    const response = await fetchSyncPost("/api/query/sql", { stmt: `SELECT root_id FROM blocks WHERE id = '${escapedId}'` }) as IWebSocketData;
    if (response.code !== 0 || !Array.isArray(response.data)) return blockId;
    return response.data[0]?.root_id || blockId;
}

export function getCurrentDocumentId(detail: unknown): string {
    const eventDetail = detail as { protyle?: { block?: { id?: string } } };
    return eventDetail?.protyle?.block?.id || "";
}
