/**
 * 斜杠命令「添加到数据库」的目标块解析与命令文本清理。
 */

// 与思源 protyle/wysiwyg/getBlock.ts 的 isContainerBlock 保持一致：
// 列表、列表项、超级块、引述块、callout 都算容器块。
const CONTAINER_BLOCK_CLASSES = ["list", "li", "sb", "bq", "callout"];

function isContainerBlock(element: HTMLElement): boolean {
    return CONTAINER_BLOCK_CLASSES.some(className => element.classList.contains(className));
}

/**
 * 解析作用目标：默认为当前块；若当前块被容器块包裹，则取往外的第一个容器块。
 *
 * 容器块必须带 data-node-id 才能作为数据库绑定目标，因此无 id 的包裹层会被跳过。
 */
export function resolveSlashTargetBlock(blockElement: HTMLElement): HTMLElement {
    let current = blockElement?.parentElement;
    while (current && !current.classList.contains("protyle-wysiwyg") && !current.classList.contains("protyle")) {
        if (isContainerBlock(current) && current.dataset.nodeId) {
            return current;
        }
        current = current.parentElement;
    }
    return blockElement;
}

/**
 * 删除块里的斜杠命令文本（如 "/添加到数据库"），返回删除后的块 HTML；
 * 未发生实际变化时返回 undefined。
 *
 * 思源在 hint/index.ts 的 fill() 中已把 range 起点回退到触发符处，但 plugin
 * 分支只调用回调就 return，不会替插件删除这段文本，需自行清理并回写内核。
 */
export function eraseSlashCommandText(range: Range | undefined, blockElement: HTMLElement): string | undefined {
    if (!range || range.collapsed) return undefined;
    const oldHTML = blockElement.outerHTML;
    range.deleteContents();
    const newHTML = blockElement.outerHTML;
    return oldHTML === newHTML ? undefined : newHTML;
}
