import { ICommand, IProtyle, Protyle } from "siyuan";
import { PinnedDatabase } from "@/config/pinned-databases";
import { attributeViewRepository } from "@/data/attribute-view-repository";
import { reconcileBlockDatabaseBinding } from "@/domain/block-av-badge";
import { eraseSlashCommandText, resolveSlashTargetBlock } from "@/domain/slash-target";
import { escapeHtml } from "@/libs/dom";
import { toErrorMessage } from "@/libs/error-utils";
import { notify } from "@/libs/notify";
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
 * 从编辑器选区起点向上解析带 data-node-id 的最近块元素
 * （与思源 protyle/toolbar/InlineMemo.ts:14 的取法一致）。
 */
function blockFromRangeStart(startContainer: Node | undefined): HTMLElement | undefined {
    if (!startContainer) return undefined;
    const base = startContainer.nodeType === Node.TEXT_NODE ? startContainer.parentElement : startContainer as HTMLElement;
    return base?.closest<HTMLElement>("[data-node-id]") ?? undefined;
}

/**
 * 从编辑器当前光标解析目标块：取光标所在块元素；容器块包裹逻辑交给
 * resolveSlashTargetBlock。
 *
 * 不能读 editor.toolbar.range：它只是缓存，思源仅在特定流程同步它（click 处理
 * protyle/wysiwyg/index.ts:3555、斜杠 hint/index.ts:223、粘贴、撤销、页签切换等），
 * 纯键盘移动光标（方向键、回车）不经过任何同步点，且快捷键分发（protyle/wysiwyg/
 * commonHotkey.ts:116）也不先刷新——直接用它只会拿到上次鼠标点击或斜杠触发的
 * 旧位置。因此优先实时读 window.getSelection()：光标无论以何种方式移动，选区
 * 都已随 selectionchange 更新，取到的就是当前位置。
 *
 * 实时选区可能残留在其他编辑器（浮窗、其他页签），解析出的块须归属本编辑器
 * （editor.element 是含标题与正文的 .protyle 根）；不归属时退回 toolbar.range
 * 并做同样校验。
 */
function resolveEditorTargetBlock(editor: IProtyle): HTMLElement | undefined {
    const root = editor?.element;
    if (!root) return undefined;
    const selection = window.getSelection();
    const fromSelection = selection && selection.rangeCount > 0
        ? blockFromRangeStart(selection.getRangeAt(0).startContainer)
        : undefined;
    if (fromSelection && root.contains(fromSelection)) return fromSelection;
    const fromCache = blockFromRangeStart(editor.toolbar?.range?.startContainer);
    return fromCache && root.contains(fromCache) ? fromCache : undefined;
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
    // 擦除命令文本的 update 事务携带整块 HTML，其 IAL 会整体覆盖内核里的块属性，
    // 且内核随 update 落库 200ms 后的属性补发（kernel/model/transaction.go:1970）
    // 读取的是该事务的节点快照。因此必须先绑定再擦除：擦除捕获的 HTML 已带上
    // custom-avs，事务无论何时落库都不会洗掉绑定，补发推送的也是绑定后的属性——
    // 旧顺序（先擦后绑）里补发携带绑定前 IAL，正是角标闪烁/丢失的根源。
    // 擦除事务的范围在回调开始时快照：绑定与等待期间用户可能继续输入或点击，
    // editor.toolbar.range 会被新选区覆盖，届时擦除会因 range 塌陷而静默失配。
    // Range 对象本身是活的，边界随 DOM 变动自动调整，快照引用始终框住命令文本。
    const eraseRange = target.editor?.toolbar?.range;
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
        // 等绑定标记经 updateAttrs 回放（或渲染对账）落到绑定目标块的 DOM 上，
        // 再擦除：目标块与光标所在块相同时，擦除事务捕获的整块 HTML 才会带上
        // custom-avs；被容器块包裹时两者不同，擦除本就不触及绑定块的属性。
        await waitForBlockBinding(targetBlock, database.avID);
        reconcileBlockDatabaseBinding([targetBlock], [{ avID: database.avID, name: database.name }]);
        notify(t("slash.added", { name: database.name }), 3000, "info");
    } catch (error) {
        notify(t("slash.addFailed", { message: toErrorMessage(error) }), 5000, "error");
    }
    // 绑定失败也照常擦除：命令文本已被消费；此时块未绑定，擦除事务没有绑定可洗。
    if (target.eraseCommand) eraseCommandText(target.protyle, target.nodeElement, eraseRange);
}

/**
 * 等待绑定标记（custom-avs 含 avID）出现在绑定目标块的元素上。
 *
 * 绑定的 updateAttrs 广播会回放给包括发起方在内的所有客户端
 * （kernel/model/blockial.go:542 PushModeBroadcast），渲染对账也可能先行补写；
 * 两者任一发生即可。超时按未就绪继续，由调用方的 reconcile 兜底。
 */
async function waitForBlockBinding(blockElement: HTMLElement, avID: string, timeoutMs = 1500): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const avIDs = (blockElement.getAttribute("custom-avs") || "").split(",").filter(Boolean);
        if (avIDs.includes(avID)) return;
        await new Promise(resolve => window.setTimeout(resolve, 50));
    }
}

/**
 * 原生 fill() 的 plugin 分支不会删除 "/xxx"，需自行擦除并把结果回写内核。
 * 调用时机在数据库绑定成功之后（见 addToPinnedDatabase）：捕获的整块 HTML
 * 已携带绑定后的 custom-avs，事务落库顺序不再影响绑定。range 由调用方在
 * 回调开始时快照传入，避免等待期间被用户新选区覆盖。
 *
 * 回写走思源自身的本地编辑路径（Protyle#updateTransactionElement，插件公开
 * API）：本地 DOM 改好后由它比对新旧 HTML 生成 update 事务，并给块打上编辑标记，
 * 事务在发起方不再回放，块 DOM 不会被整体替换，光标得以留在命令文本的起始处。
 *
 * 若改用 /api/block/updateBlock，事务会广播给所有会话，当前编辑器同样会用新
 * HTML 替换块 DOM（protyle/wysiwyg/transaction.ts:599 updateBlock，非撤销分支
 * 不还原光标），命令执行后光标就被丢到块首。
 */
function eraseCommandText(protyle: Protyle | undefined, nodeElement: HTMLElement, range: Range | undefined): void {
    const erased = eraseSlashCommandText(range, nodeElement);
    if (!erased?.changed) return;
    protyle?.updateTransactionElement(nodeElement, erased.previousHTML);
}
