// 块数据库角标（.protyle-attr--av）的就地修补与绑定标记对账。
//
// 角标由前端在 updateAttrs 事务里渲染（protyle/wysiwyg/transaction.ts:857），
// Lute 不生成该节点，因此块被重建后需要靠那条事务补回。斜杠命令已改为先绑定
// 再擦除命令文本（擦除捕获的 HTML 携带绑定后的 custom-avs），绑定被后续事务
// 覆盖的窗口在源头消除；渲染管线仍每轮用 getKeys 的内核数据对账
// （reconcileBlockDatabaseBinding）——内核随任意 update 落库 200ms 后的属性补发
// （kernel/model/transaction.go:1970）可能携带过期 IAL 回滚其他来源的绑定变更，
// 回滚后下一轮刷新即被纠正。

const BADGE_CLASS = "protyle-attr--av";
const DATABASE_ICON = "iconDatabase";
const POPOVER_URL = "/api/av/getMirrorDatabaseBlocks";

/** 一条绑定事实：avID 必填；name 用于补写角标条目，未知时只补 custom-avs。 */
export interface DatabaseBinding {
    avID: string;
    name?: string;
}

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
 * 按内核数据对账块 DOM 的绑定标记：custom-avs 里缺哪些 avID 就补哪些（只增不删，
 * 解除绑定由思源自己的 updateAttrs 回放负责），角标条目仅在数据库名已知时补写。
 *
 * 文档标题不参与：标题元素不带 custom-avs（思源由标题组件从内核 ial 单独渲染
 * 角标，见 protyle/header/Title.ts，项目约定见 block-context.ts），写入会让标题
 * 命中绑定块选择器，被渲染管线同时当作文档与普通块两路竞争渲染。
 *
 * 只处理传入的块元素，不做全文档查询；调用方（渲染管线）已持有该块的全部可见元素。
 * 元素已带全部 avID 且角标齐全时不动 DOM，重复调用无副作用。
 */
export function reconcileBlockDatabaseBinding(parents: readonly HTMLElement[], bindings: readonly DatabaseBinding[]): void {
    if (bindings.length === 0) return;
    for (const block of parents) {
        if (!block.isConnected || block.classList.contains("protyle-title")) continue;
        const current = (block.getAttribute("custom-avs") || "").split(",").filter(Boolean);
        const missing = bindings.filter(binding => !current.includes(binding.avID));
        if (missing.length > 0) {
            block.setAttribute("custom-avs", [...current, ...missing.map(binding => binding.avID)].join(","));
        }
        const badge = ensureBadge(block);
        if (!badge) continue;
        for (const binding of bindings) {
            if (badge.querySelector(`[data-av-id="${CSS.escape(binding.avID)}"]`)) continue;
            if (!binding.name) continue;
            appendBadgeEntry(badge, binding.avID, binding.name);
        }
    }
}

function appendBadgeEntry(badge: HTMLElement, avID: string, avName: string): void {
    const entry = document.createElement("span");
    entry.dataset.avId = avID;
    entry.dataset.popoverUrl = POPOVER_URL;
    entry.className = "popover__block";
    entry.textContent = avName;
    // 与思源一致，多项之间用 &nbsp; 分隔
    if (badge.lastElementChild) badge.appendChild(document.createTextNode("\u00a0"));
    badge.appendChild(entry);
}
