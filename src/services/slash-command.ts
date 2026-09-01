import { ICommand, IProtyle, Protyle } from "siyuan";
import { PinnedDatabase } from "@/config/pinned-databases";
import { attributeViewRepository } from "@/data/attribute-view-repository";
import { repairDatabaseBadge } from "@/domain/block-av-badge";
import { eraseSlashCommandText, resolveSlashTargetBlock } from "@/domain/slash-target";
import { escapeHtml } from "@/libs/dom";
import { toErrorMessage } from "@/libs/error-utils";
import { notify } from "@/libs/notify";
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

/** 添加目标：斜杠命令与快捷键命令共用同一份添加逻辑。 */
interface AddTarget {
    /** 插件公开的 Protyle 实例：斜杠命令用它回写擦除事务，快捷键命令不需要。 */
    protyle: Protyle | undefined;
    /** 思源内部编辑器实例：用于取光标 range。 */
    editor: IProtyle | undefined;
    nodeElement: HTMLElement;
    /** 斜杠命令需要擦除 "/命令" 文本；快捷键命令没有命令文本可擦。 */
    eraseCommand: boolean;
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
                void addToPinnedDatabase({
                    protyle,
                    editor: protyle?.protyle as IProtyle | undefined,
                    nodeElement,
                    eraseCommand: true
                }, database, options.onAdded);
            }
        };
    });
}

/**
 * 为常用数据库注册思源快捷键命令，命令名即数据库名。
 *
 * 不设置默认快捷键（hotkey 为空），用户可在「设置 → 快捷键 → 插件」中为每个
 * 数据库自行绑定；设置里增删数据库后由 index 同步 this.commands，无需重载插件。
 */
export function createDatabaseCommands(options: DatabaseSlashOptions): ICommand[] {
    if (options.databases.length === 0) {
        return [];
    }
    return options.databases.map(database => ({
        // langKey 同时作为快捷键设置的持久化键，用 avID 保证数据库改名后仍复用用户配置
        langKey: databaseCommandKey(database.avID),
        langText: t("slash.addTo", { name: database.name }),
        hotkey: "",
        editorCallback: (protyle: IProtyle) => {
            void addCurrentBlockToDatabase(protyle, database, options.onAdded);
        }
    }));
}

/** 快捷键命令 langKey 前缀，与斜杠命令 id 保持一致。 */
export const DATABASE_COMMAND_KEY_PREFIX = "addToDatabase-";

/** 判断 langKey 是否属于本插件管理的数据库命令。 */
export function isDatabaseCommandKey(langKey: string): boolean {
    return langKey.startsWith(DATABASE_COMMAND_KEY_PREFIX);
}

/** 快捷键命令在「设置 → 快捷键」中的键名，与斜杠命令 id 保持一致。 */
export function databaseCommandKey(avID: string): string {
    return `${DATABASE_COMMAND_KEY_PREFIX}${avID}`;
}

/** 尚未配置常用数据库时留一个引导项，避免用户以为命令没生效。 */
function createNotConfiguredCommand(): DatabaseSlashCommand {
    const label = t("slash.notConfigured");
    return {
        id: "addToDatabase-notConfigured",
        filter: [label, "database", "add to database", "shujuku", "sjk"],
        html: itemHTML(label),
        callback: () => {
            notify(t("slash.notConfiguredHint"), 5000, "info");
        }
    };
}

function itemHTML(label: string): string {
    return `<div class="b3-list-item__first"><svg class="b3-list-item__graphic"><use xlink:href="#iconDatabase"></use></svg><span class="b3-list-item__text">${escapeHtml(label)}</span></div>`;
}

/** 快捷键命令入口：从光标处解析目标块后复用同一份添加逻辑。 */
async function addCurrentBlockToDatabase(
    editor: IProtyle,
    database: PinnedDatabase,
    onAdded: (blockID: string) => void
): Promise<void> {
    const nodeElement = resolveEditorTargetBlock(editor);
    if (!nodeElement) {
        notify(t("common.missingBlockId"), 3000, "error");
        return;
    }
    await addToPinnedDatabase({ protyle: undefined, editor, nodeElement, eraseCommand: false }, database, onAdded);
}

/**
 * 从编辑器选区解析目标块：取光标所在块元素。
 * 与思源内置实现一致（protyle/toolbar/InlineMemo.ts:14），用 range.startContainer
 * 向上找带 data-node-id 的最近元素；容器块包裹逻辑交给 resolveSlashTargetBlock。
 */
function resolveEditorTargetBlock(editor: IProtyle): HTMLElement | undefined {
    const startContainer = editor?.toolbar?.range?.startContainer;
    if (!startContainer) return undefined;
    const base = startContainer.nodeType === Node.TEXT_NODE ? startContainer.parentElement : startContainer as HTMLElement;
    return base?.closest<HTMLElement>("[data-node-id]") ?? undefined;
}

async function addToPinnedDatabase(
    target: AddTarget,
    database: PinnedDatabase,
    onAdded: (blockID: string) => void
): Promise<void> {
    if (!target.nodeElement) return;
    const targetBlock = resolveSlashTargetBlock(target.nodeElement);
    const blockID = targetBlock?.dataset.nodeId;
    if (!blockID) {
        notify(t("common.missingBlockId"), 3000, "error");
        return;
    }
    // 等擦除事务落库后再绑定：事务里带的块 HTML 还没有 custom-avs，晚于绑定到达
    // 会覆盖掉刚写入的绑定属性。
    if (target.eraseCommand) {
        const erasedBlockID = eraseCommandText(target.protyle, target.editor, target.nodeElement);
        if (erasedBlockID) await waitForBlockTransaction(erasedBlockID, ["update"]);
    }
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
        notify(t("slash.added", { name: database.name }), 3000, "info");
    } catch (error) {
        notify(t("slash.addFailed", { message: toErrorMessage(error) }), 5000, "error");
    }
}

/**
 * 原生 fill() 的 plugin 分支不会删除 "/xxx"，需自行擦除并把结果回写内核，
 * 返回被改写的块 id（无改动时为 undefined）。
 *
 * 回写走思源自身的本地编辑路径（Protyle#updateTransactionElement，插件公开
 * API）：本地 DOM 改好后由它比对新旧 HTML 生成 update 事务，并给块打上编辑标记，
 * 事务在发起方不再回放，块 DOM 不会被整体替换，光标得以留在命令文本的起始处。
 *
 * 若改用 /api/block/updateBlock，事务会广播给所有会话，当前编辑器同样会用新
 * HTML 替换块 DOM（protyle/wysiwyg/transaction.ts:599 updateBlock，非撤销分支
 * 不还原光标），命令执行后光标就被丢到块首。
 */
function eraseCommandText(protyle: Protyle | undefined, editor: IProtyle | undefined, nodeElement: HTMLElement): string | undefined {
    const erased = eraseSlashCommandText(editor?.toolbar?.range, nodeElement);
    if (!erased?.changed) return undefined;
    protyle?.updateTransactionElement(nodeElement, erased.previousHTML);
    return nodeElement.dataset.nodeId;
}
