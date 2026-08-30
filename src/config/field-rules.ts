/**
 * 字段例外（隐藏字段 / 强制显示）的配置。
 *
 * 分两层：全局规则作用于所有数据库，按数据库的规则在其之上追加生效
 * （取并集，无法用按数据库的规则取消全局隐藏）。
 *
 * 以 JSON 存放在设置项 field-rules 中：
 * {
 *   "hidden": "密码, 备注",
 *   "force": "状态",
 *   "databases": [{ "avID": "20240101000000-abcdef", "name": "任务库", "hidden": "备注", "force": "" }]
 * }
 */

/** 一组规则：字段名列表（已去重、去空）。 */
export interface FieldRuleSet {
    hidden: string[];
    force: string[];
}

/** 单个数据库的规则；name 仅用于设置面板展示，缺失时回落到 avID。 */
export interface DatabaseFieldRules extends FieldRuleSet {
    avID: string;
    name?: string;
}

export interface FieldRulesState {
    global: FieldRuleSet;
    databases: DatabaseFieldRules[];
}

/** 渲染层使用的只读视图：集合形式，避免逐字段线性查找。 */
export interface ResolvedFieldRules {
    hidden: ReadonlySet<string>;
    force: ReadonlySet<string>;
}

export const SETTING_KEY_FIELD_RULES = "field-rules";

export const EMPTY_FIELD_RULES = JSON.stringify({ hidden: "", force: "", databases: [] });

function emptyState(): FieldRulesState {
    return { global: { hidden: [], force: [] }, databases: [] };
}

function parseList(value: unknown): string[] {
    if (typeof value !== "string") return [];
    return [...new Set(value.split(",").map(item => item.trim()).filter(Boolean))];
}

/** "*" 是早期版本"强制显示全部字段"的通配写法，现已移除，读取时丢弃。 */
function parseForce(value: unknown): string[] {
    return parseList(value).filter(name => name !== "*");
}

function parseDatabaseRules(value: unknown): DatabaseFieldRules[] {
    if (!Array.isArray(value)) return [];
    const seen = new Set<string>();
    const databases: DatabaseFieldRules[] = [];
    for (const entry of value) {
        if (!entry || typeof entry !== "object") continue;
        const { avID, name, hidden, force } = entry as Record<string, unknown>;
        if (typeof avID !== "string" || !avID || seen.has(avID)) continue;
        seen.add(avID);
        databases.push({
            avID,
            name: typeof name === "string" && name ? name : avID,
            hidden: parseList(hidden),
            force: parseForce(force)
        });
    }
    return databases;
}

/** 容错解析：设置项缺失或内容损坏时返回空规则，不影响其余配置。 */
export function parseFieldRules(value: unknown): FieldRulesState {
    if (typeof value !== "string" || !value.trim()) return emptyState();
    let parsed: unknown;
    try {
        parsed = JSON.parse(value);
    } catch {
        return emptyState();
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return emptyState();
    const source = parsed as Record<string, unknown>;
    return {
        global: { hidden: parseList(source.hidden), force: parseForce(source.force) },
        databases: parseDatabaseRules(source.databases)
    };
}

export function serializeFieldRules(state: FieldRulesState): string {
    const global = state.global;
    const databases = state.databases.map(database => ({
        avID: database.avID,
        name: database.name || database.avID,
        hidden: database.hidden.join(", "),
        force: database.force.join(", ")
    }));
    return JSON.stringify({
        hidden: global.hidden.join(", "),
        force: global.force.join(", "),
        databases
    });
}

/**
 * 合并全局规则与指定数据库的规则。
 *
 * 同一字段在两层都出现时取并集；数据库自身没有配置时直接复用全局集合，
 * 避免每次渲染都为每个表新建集合。
 */
export function resolveFieldRules(
    global: ResolvedFieldRules,
    databases: ReadonlyMap<string, ResolvedFieldRules>,
    avID?: string
): ResolvedFieldRules {
    const scoped = avID ? databases.get(avID) : undefined;
    if (!scoped || (scoped.hidden.size === 0 && scoped.force.size === 0)) return global;
    return {
        hidden: new Set([...global.hidden, ...scoped.hidden]),
        force: new Set([...global.force, ...scoped.force])
    };
}
