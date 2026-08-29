/**
 * 斜杠命令「添加到数据库」的常用数据库配置。
 * 以 JSON 数组形式存放在设置项 pinned-databases 中。
 */

export interface PinnedDatabase {
    avID: string;
    name: string;
    /** 数据库所在块，用于刷新数据库的 updated。数据库块被删除后可能缺失。 */
    blockID?: string;
    /** 固定到具体视图时，新行按该视图的列模板填充。 */
    viewID?: string;
}

export const SETTING_KEY_PINNED_DATABASES = "pinned-databases";

export const EMPTY_PINNED_DATABASES = "[]";

export function parsePinnedDatabases(value: unknown): PinnedDatabase[] {
    if (typeof value !== "string" || !value.trim()) return [];
    let parsed: unknown;
    try {
        parsed = JSON.parse(value);
    } catch {
        return [];
    }
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    const databases: PinnedDatabase[] = [];
    for (const entry of parsed) {
        if (!entry || typeof entry !== "object") continue;
        const { avID, name, blockID, viewID } = entry as Record<string, unknown>;
        if (typeof avID !== "string" || !avID || seen.has(avID)) continue;
        seen.add(avID);
        databases.push({
            avID,
            name: typeof name === "string" && name ? name : avID,
            ...(typeof blockID === "string" && blockID ? { blockID } : {}),
            ...(typeof viewID === "string" && viewID ? { viewID } : {})
        });
    }
    return databases;
}

export function serializePinnedDatabases(databases: readonly PinnedDatabase[]): string {
    return JSON.stringify(databases.map(database => ({
        avID: database.avID,
        name: database.name,
        ...(database.blockID ? { blockID: database.blockID } : {}),
        ...(database.viewID ? { viewID: database.viewID } : {})
    })));
}
