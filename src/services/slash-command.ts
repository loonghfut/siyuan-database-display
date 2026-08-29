import { IProtyle, Protyle, showMessage } from "siyuan";
import { PinnedDatabase } from "@/config/pinned-databases";
import { attributeViewRepository } from "@/data/attribute-view-repository";
import { repairDatabaseBadge } from "@/domain/block-av-badge";
import { eraseSlashCommandText, resolveSlashTargetBlock } from "@/domain/slash-target";
import { escapeHtml } from "@/libs/dom";
import { toErrorMessage } from "@/libs/error-utils";
import { waitForBlockTransaction } from "@/services/block-transaction-sync";
import { t } from "@/i18n";

export interface DatabaseSlashCommand {
    id: string;
    filter: string[];
    html: string;
    callback(protyle: Protyle, nodeElement: HTMLElement): void;
}

export interface DatabaseSlashOptions {
    databases: readonly PinnedDatabase[];
    /** 添加成功后定向强制刷新该块。 */
    onAdded: (blockID: string) => void;
}

/**
 * 为常用数据库逐一注册斜杠命令：选中即把块加入对应数据库，不再二次选择。
 *
 * 思源每次打开 / 面板都会重新遍历 plugin.protyleSlash（hint/extend.ts:416-428），
 * 因此在设置里增删数据库后原地更新数组即可生效，无需重载插件。命令项可在
 * 「设置 → 编辑器 → 斜杠命令」中隐藏或排序。
 */
export function createDatabaseSlashCommands(options: DatabaseSlashOptions): DatabaseSlashCommand[] {
    if (options.databases.length === 0) {
        return [createNotConfiguredCommand()];
    }
    return options.databases.map(database => {
        const label = t("slash.addTo", { name: database.name });
        return {
            id: `addToDatabase-${database.avID}`,
            // 同时匹配命令全名与数据库名，输入任一即可命中
            filter: [label, database.name],
            html: itemHTML(label),
            callback: (protyle: Protyle, nodeElement: HTMLElement) => {
                void addToPinnedDatabase(protyle, nodeElement, database, options.onAdded);
            }
        };
    });
}

/** 尚未配置常用数据库时留一个引导项，避免用户以为命令没生效。 */
function createNotConfiguredCommand(): DatabaseSlashCommand {
    const label = t("slash.notConfigured");
    return {
        id: "addToDatabase-notConfigured",
        filter: [label, "database", "add to database", "shujuku", "sjk"],
        html: itemHTML(label),
        callback: () => {
            showMessage(t("slash.notConfiguredHint"), 5000, "info");
        }
    };
}

function itemHTML(label: string): string {
    return `<div class="b3-list-item__first"><svg class="b3-list-item__graphic"><use xlink:href="#iconDatabase"></use></svg><span class="b3-list-item__text">${escapeHtml(label)}</span></div>`;
}

async function addToPinnedDatabase(
    protyle: Protyle,
    nodeElement: HTMLElement,
    database: PinnedDatabase,
    onAdded: (blockID: string) => void
): Promise<void> {
    // 回调收到的是 Protyle 实例，protyle.protyle 才是思源内部的 IProtyle
    const editor = protyle?.protyle as IProtyle | undefined;
    if (!nodeElement) return;
    const targetBlock = resolveSlashTargetBlock(nodeElement);
    const blockID = targetBlock?.dataset.nodeId;
    if (!blockID) {
        showMessage(t("common.missingBlockId"), 3000, "error");
        return;
    }
    await eraseCommandText(editor, nodeElement);
    // 等改写块文本的 update 事务落地后再绑定：该事务会重建块 DOM，若晚于
    // updateAttrs 到达，会把刚渲染的数据库角标冲掉（表现为角标闪一下就没了）
    await waitForBlockTransaction(blockID, ["update"]);
    try {
        await attributeViewRepository.addBlocksToDatabase({
            avID: database.avID,
            viewID: database.viewID,
            blockIDs: [blockID],
            databaseBlockID: database.blockID
        });
        // 主动刷新而非等广播：内核的 refreshAttributeView 只发给 protyle 连接
        // （kernel/model/push_reload.go:523），插件监听的主 ws 是 main 类型，收不到。
        onAdded(blockID);
        // 等绑定产生的 updateAttrs 落地，再兜底校验角标（DOM 已是最新时直接跳过）
        await waitForBlockTransaction(blockID, ["updateAttrs"]);
        repairDatabaseBadge(blockID, database.avID, database.name);
        showMessage(t("slash.added", { name: database.name }), 3000, "info");
    } catch (error) {
        showMessage(t("slash.addFailed", { message: toErrorMessage(error) }), 5000, "error");
    }
}

/** 原生 fill() 的 plugin 分支不会删除 "/xxx"，需自行擦除并把结果回写内核。 */
async function eraseCommandText(editor: IProtyle | undefined, nodeElement: HTMLElement): Promise<void> {
    const newHTML = eraseSlashCommandText(editor?.toolbar?.range, nodeElement);
    const blockID = nodeElement.dataset.nodeId;
    if (!newHTML || !blockID) return;
    try {
        await attributeViewRepository.updateBlockHTML(blockID, newHTML);
    } catch (error) {
        console.warn("[DatabaseDisplay] Failed to erase slash command text", error);
    }
}
