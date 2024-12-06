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

export async function getAVreferenceid(currentDocId) {//暂时先这样，只查询段落块
    const sqlStr = `SELECT id
    FROM blocks
    WHERE root_id = '${currentDocId}'
    // AND id != '${currentDocId}'
    AND type = 'p'
    AND ial LIKE '%custom-avs%';`;
    const res = await sql(sqlStr);
    // console.log(res.map(item => item.id));
    return res.map(item => item.id);
}
