// 等待块的事务在前端落地，用于给跨请求的广播定序。
//
// 内核对不同 HTTP 请求的事务广播没有顺序保证（各自 Broadcast，见
// kernel/util/websocket.go PushEvent）。斜杠命令会先后发出改写块文本的
// update（kernel/api/block_op.go broadcastTransactions）与绑定数据库的
// updateAttrs（kernel/model/blockial.go pushBlockAttrs），update 晚到时会
// 重建块 DOM，把先到的 updateAttrs 刚渲染的角标冲掉。

const DEFAULT_TIMEOUT_MS = 150;

interface TransactionMessage {
    cmd?: string;
    data?: Array<{ doOperations?: Array<{ action?: string; id?: string }> }>;
}

/**
 * 等待涉及 blockID 的指定事务经 ws 到达前端。
 *
 * 超时不会抛错，按最坏情况继续——调用方仍需能容忍乱序。
 */
export function waitForBlockTransaction(
    blockID: string,
    actions: readonly string[],
    timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<void> {
    const socket = window.siyuan?.ws?.ws;
    if (!socket || !blockID) return Promise.resolve();
    return new Promise(resolve => {
        let settled = false;
        const finish = () => {
            if (settled) return;
            settled = true;
            window.clearTimeout(timer);
            socket.removeEventListener("message", listener);
            resolve();
        };
        const timer = window.setTimeout(finish, timeoutMs);
        const listener = (event: MessageEvent) => {
            // 插件主监听（index.ts）已对每条消息做过一次 JSON.parse，这里先用字符串
            // 预筛掉绝大多数无关消息，避免为每条广播再付一次完整解析的代价
            if (typeof event.data !== "string" || !event.data.includes(blockID)) return;
            let payload: TransactionMessage;
            try {
                payload = JSON.parse(event.data) as TransactionMessage;
            } catch {
                return;
            }
            if (payload.cmd !== "transactions" || !Array.isArray(payload.data)) return;
            const hit = payload.data.some(transaction =>
                (transaction.doOperations || []).some(operation =>
                    operation.id === blockID && actions.includes(operation.action || "")));
            if (hit) finish();
        };
        socket.addEventListener("message", listener);
    });
}
