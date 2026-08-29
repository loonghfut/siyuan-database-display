/**
 * websocket 变更信号解析：把内核推送的 transactions / refreshAttributeView 消息
 * 转换为可直接驱动定向刷新的属性视图变更信号（纯函数，无副作用）。
 */

/** 属性视图变更信号：描述一次内核变更涉及的属性视图与块。 */
export interface AttributeViewUpdateSignal {
    /** 事务涉及的属性视图 ID。 */
    readonly attributeViewIds: string[];
    /**
     * 事务直接指明的块 ID（insertAttrViewBlock 的 srcs[].id、
     * removeAttrViewBlock 的 srcIDs 等）。
     *
     * 刚加入数据库的块还没有渲染记录，不会出现在"属性视图 → 可见块"映射里，
     * 只按 avID 匹配会漏掉它们，表现为"块加入数据库后属性不显示"。
     */
    readonly blockIds: ReadonlySet<string>;
}

interface TransactionOperation {
    action?: string;
    id?: string;
    avID?: string;
    blockID?: string;
    srcIDs?: string[];
    srcs?: Array<{ id?: string }>;
}

const NO_BLOCK_IDS: ReadonlySet<string> = new Set();

/**
 * 解析 websocket 消息。返回 undefined 表示与属性视图无关，无需刷新。
 *
 * 编辑器每产生一次事务都会推送一条消息，本函数因此处于热路径上：单次遍历完成
 * 匹配与收集，不构造中间数组。
 */
export function parseAttributeViewUpdateSignal(message: unknown): AttributeViewUpdateSignal | undefined {
    if (!message || typeof message !== "object") return undefined;
    const { cmd, data } = message as { cmd?: unknown; data?: unknown };
    // /api/av/* 直写端点（含本插件写入的 setValue）通过 refreshAttributeView 广播变更
    if (cmd === "refreshAttributeView") {
        const avID = (data as { id?: unknown } | undefined)?.id;
        if (typeof avID !== "string" || !avID) return undefined;
        return { attributeViewIds: [avID], blockIds: NO_BLOCK_IDS };
    }
    if (cmd !== "transactions" || !Array.isArray(data)) return undefined;
    const attributeViewIds: string[] = [];
    const blockIds = new Set<string>();
    let matched = false;
    for (const transaction of data) {
        const doOperations = (transaction as { doOperations?: unknown } | null)?.doOperations;
        if (!Array.isArray(doOperations)) continue;
        for (const operation of doOperations as TransactionOperation[]) {
            // 与内核 shouldBroadcastAttrViewTransactions 的判定对齐：action 含
            // "attrview" 的事务（updateAttrViewCell、insertAttrViewBlock、
            // setAttrView* 等）会广播给包括发起方在内的所有客户端。
            if (typeof operation?.action !== "string" || !operation.action.toLowerCase().includes("attrview")) {
                continue;
            }
            matched = true;
            if (typeof operation.avID === "string" && operation.avID && !attributeViewIds.includes(operation.avID)) {
                attributeViewIds.push(operation.avID);
            }
            collectBlockIds(operation, blockIds);
        }
    }
    // 命中属性视图事务但拿不到 avID 与块 ID 时（如 setAttrViewName）仍需刷新，
    // 交由控制器退化为全量刷新。
    return matched ? { attributeViewIds, blockIds } : undefined;
}

/**
 * 收集事务直接指明的块 ID。无法保证每个字段都是块 ID（可能是视图/列/行 ID），
 * 但刷新时按当前 DOM 中的可见块过滤，多余 ID 会被自然丢弃。
 */
function collectBlockIds(operation: TransactionOperation, blockIds: Set<string>): void {
    collectBlockId(operation.id, blockIds);
    collectBlockId(operation.blockID, blockIds);
    if (Array.isArray(operation.srcIDs)) operation.srcIDs.forEach(id => collectBlockId(id, blockIds));
    if (Array.isArray(operation.srcs)) operation.srcs.forEach(src => collectBlockId(src?.id, blockIds));
}

function collectBlockId(value: unknown, blockIds: Set<string>): void {
    if (typeof value === "string" && value) blockIds.add(value);
}
