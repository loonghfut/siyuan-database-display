/**
 * 直接编辑模式 - 根据字段类型分发到对应的编辑处理器（伪直接编辑）。
 * 入口于此，编辑逻辑见 ./field-editors，弹出面板/调色板见 ./popup，输入值转换见 ./input-fields。
 */

import {
    handleTemplateEdit,
    handleTextEdit,
    handleCheckboxEdit,
    handleSelectEdit,
    handleMultiSelectEdit,
    handleRelationEdit,
    handleAssetEdit,
    handleDateEdit,
    handlePopupEdit
} from "./field-editors";
import { closeOpenPanel, closeOptionColorPalette, clearInlineEditPanels } from "./popup";
import type { App } from "siyuan";
import {
    AssetReference,
    AttributeViewRelation,
    AttributeViewTextValue,
    RelationValue,
    SelectOption,
} from "../core/types";

/**
 * 各字段类型的 currentValue 类型联合。
 * rawValue 由 content-extractor 按字段类型提取，各路径详见 rawValue() 函数。
 */
export type InlineEditCurrentValue =
    | AttributeViewTextValue          // text
    | { content: number; isNotEmpty?: boolean }  // number
    | number                          // raw number
    | { content: number; content2?: number | null; hasEndDate?: boolean; isNotEmpty?: boolean; isNotTime?: boolean }  // date
    | string[]                        // mSelect / select（已选选项名数组）
    | boolean                         // checkbox
    | RelationValue                   // relation
    | AssetReference[]                // mAsset
    | string                          // url / email / phone / template / popup
    | { content?: string }            // block / rollup
    | null;

export interface InlineEditOptions {
    element: HTMLElement;
    avID: string;
    blockID: string;
    itemID: string;
    keyID: string;
    keyName: string;
    keyType: string;
    currentValue: InlineEditCurrentValue;
    template?: string;
    /** 单选/多选列的候选选项（select / mSelect 字段使用）。 */
    selectOptions?: SelectOption[];
    relation?: AttributeViewRelation;
    /**
     * 构造 Protyle 编辑器实例需要的 App（文本字段的 Protyle Lite 面板用）。
     * 缺省时编辑器回落到 window.siyuan.ws.app。
     */
    app?: App;
    /** 保存后的回调；newValue 类型与字段类型对应，编辑器层负责保证正确性。 */
    onSave?: (newValue: InlineEditCurrentValue) => void;
    onCancel?: () => void;
}

/**
 * 启用直接编辑模式 - 根据字段类型使用不同的编辑方式
 */
export function enableInlineEdit(options: InlineEditOptions) {
    // 如果已有弹窗打开，先关闭
    closeOpenPanel();
    closeOptionColorPalette();

    // 根据字段类型选择编辑方式
    switch (options.keyType) {
        case 'text':
            // 文本：思源同款的 Protyle Lite 所见即所得面板（3.8.3 起支持富文本）
            handleTextEdit(options);
            break;
        case 'checkbox':
            // 复选框：直接切换状态
            handleCheckboxEdit(options);
            break;
        case 'select':
            // 单选：显示下拉菜单
            handleSelectEdit(options);
            break;
        case 'mSelect':
            // 多选：显示多选下拉菜单
            handleMultiSelectEdit(options);
            break;
        case 'relation':
            // 关联：使用思源原生关联候选接口
            handleRelationEdit(options);
            break;
        case 'mAsset':
            // 资源：列表增删 + 上传
            handleAssetEdit(options);
            break;
        case 'date':
            // 日期：显示开始/结束时间选择器
            handleDateEdit(options);
            break;
        case 'template':
            // 模板字段编辑的是整列模板表达式，不是当前行的计算结果
            handleTemplateEdit(options);
            break;
        default:
            // 其他类型：显示弹窗编辑
            handlePopupEdit(options);
            break;
    }
}

/**
 * 关闭当前打开的编辑弹窗，并清理残留的关闭动画节点。
 * 供插件卸载（onunload）时调用，避免弹窗泄漏。
 */
export function closeInlineEdit(): void {
    clearInlineEditPanels();
}
