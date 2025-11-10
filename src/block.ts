//获取id的方法
import { sql } from "./api";


export function getCursorBlockId() {
    //console.log("getCursorBlockId");
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount) return null;

    const range = selection.getRangeAt(0);
    let container = range.startContainer;

    // 如果 startContainer 是文本节点，则获取其父元素
    if (container.nodeType === Node.TEXT_NODE) {
        container = container.parentElement;
    }

    // 确保 container 是一个元素节点
    if (!(container instanceof Element)) {
        return null;
    }

    const blockElement = container.closest('.protyle-wysiwyg [data-node-id]');

    if (blockElement) {
        return blockElement.getAttribute('data-node-id');
    } else {
        return null;
    }
}

export async function getAVreferenceid(_currentDocId?: string) { // 不再使用传入的 currentDocId，返回所有带 custom-avs 的块 id
    const resultIds = new Set<string>();
    const candidates: NodeListOf<HTMLElement> = document.querySelectorAll('[custom-avs][data-node-id]');
    candidates.forEach(el => {
        const blockId = el.getAttribute('data-node-id');
        if (blockId) resultIds.add(blockId);
    });
    return Array.from(resultIds);
}

export async function reConfirmedDocId(DocId) {//兼容通过数据库点击后获取id会获取到聚焦块的id
    const sqlStr = `SELECT root_id
    FROM blocks
    WHERE id = '${DocId}'
    `;
    const res = await sql(sqlStr);
    // console.log(res[0].root_id, "reConfirmedDocId");
    return res[0].root_id;
}