import { fetchSyncPost, IWebSocketData } from "siyuan";

export function getVisibleAttributeBlockParents(): Map<string, HTMLElement[]> {
    const parentsByBlockId = new Map<string, HTMLElement[]>();
    document.querySelectorAll<HTMLElement>("[custom-avs][data-node-id]").forEach(element => {
        const blockId = element.dataset.nodeId;
        if (!blockId) return;
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
