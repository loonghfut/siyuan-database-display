// 等待块的事务在前端落地，用于给跨请求的广播定序。
//
// 内核对不同 HTTP 请求的事务广播没有顺序保证（各自 Broadcast，见
// kernel/util/websocket.go PushEvent）。斜杠命令先后发出两笔写入：擦除命令文本的
// update（Protyle#updateTransactionElement）与绑定数据库的 updateAttrs
// （kernel/model/blockial.go pushBlockAttrs）。
// - update 要先落库：它携带的块 HTML 生成于绑定之前，没有 custom-avs，晚于绑定
//   到达会把刚写入的绑定属性覆盖掉；
// - updateAttrs 会用 innerHTML 重建 .protyle-attr（protyle/wysiwyg/
//   transaction.ts:963），清掉插件注入的展示节点，因此要等它落地后再补渲染。

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
