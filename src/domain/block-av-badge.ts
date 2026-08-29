// 块数据库角标（.protyle-attr--av）的就地修补。
//
// 角标由前端在 updateAttrs 事务里渲染（protyle/wysiwyg/transaction.ts:857），
// Lute 不生成该节点，因此块被重建后需要靠那条事务补回。斜杠命令会先后发出
// update 与 updateAttrs 两条事务，顺序无保证时角标就会被冲掉。调用方已用
// block-transaction-sync 定序，这里只作兜底：DOM 已是最新时直接跳过。

const BADGE_CLASS = "protyle-attr--av";
const DATABASE_ICON = "iconDatabase";
const POPOVER_URL = "/api/av/getMirrorDatabaseBlocks";

function attributeContainer(block: HTMLElement): HTMLElement | undefined {
    return [...block.children].find(child => child.classList.contains("protyle-attr")) as HTMLElement | undefined;
}

function ensureBadge(block: HTMLElement): HTMLElement | undefined {
    const container = attributeContainer(block);
    if (!container) return undefined;
    const existing = [...container.children]
        .find(child => child.classList.contains(BADGE_CLASS)) as HTMLElement | undefined;
    if (existing) return existing;
    const badge = document.createElement("div");
    badge.className = BADGE_CLASS;
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttribute("href", `#${DATABASE_ICON}`);
    use.setAttribute("xlink:href", `#${DATABASE_ICON}`);
    icon.appendChild(use);
    badge.appendChild(icon);
    container.appendChild(badge);
    return badge;
}

/**
 * 确保 blockID 的角标包含指定数据库。
 *
 * 只在 DOM 缺失时补齐：属性和角标节点都没有该 avID 才动手，避免与思源自己的
 * 渲染结果重复。补上的值与内核一致（内核此时已完成绑定）。
 */
export function repairDatabaseBadge(blockID: string, avID: string, avName: string): void {
    if (!blockID || !avID) return;
    const selector = `[data-av-id="${CSS.escape(avID)}"]`;
    // 同一块可同时出现在多个 protyle 中，故仍需取全部；但条件要写进选择器，
    // 否则会先把整个 DOM 的块节点捞出来再在 JS 里过滤
    document.querySelectorAll<HTMLElement>(`[data-node-id="${CSS.escape(blockID)}"]`).forEach(block => {
        const avIDs = (block.getAttribute("custom-avs") || "").split(",").filter(Boolean);
        if (!avIDs.includes(avID)) {
            avIDs.push(avID);
            block.setAttribute("custom-avs", avIDs.join(","));
        }
        const badge = ensureBadge(block);
        if (!badge || badge.querySelector(selector)) return;
        const entry = document.createElement("span");
        entry.dataset.avId = avID;
        entry.dataset.popoverUrl = POPOVER_URL;
        entry.className = "popover__block";
        entry.textContent = avName;
        // 与思源一致，多项之间用 &nbsp; 分隔
        if (badge.lastElementChild) badge.appendChild(document.createTextNode("\u00a0"));
        badge.appendChild(entry);
    });
}
