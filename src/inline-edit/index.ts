/**
 * 直接编辑模式 - 根据字段类型分发到对应的编辑处理器（伪直接编辑）。
 * 入口于此，编辑逻辑见 ./field-editors，弹出面板/调色板见 ./popup，输入值转换见 ./input-fields。
 */

import {
    handleTemplateEdit,
    handleCheckboxEdit,
    handleSelectEdit,
    handleMultiSelectEdit,
    handleRelationEdit,
    handleAssetEdit,
    handleDateEdit,
    handlePopupEdit
} from "./field-editors";
import { closeOpenPanel, closeOptionColorPalette, clearInlineEditPanels } from "./popup";
import { AttributeViewRelation } from "../core/types";

export interface InlineEditOptions {
    element: HTMLElement;
    avID: string;
    blockID: string;
    itemID: string;
    keyID: string;
    keyName: string;
    keyType: string;
    currentValue: any;
    template?: string;
    selectOptions?: any[];  // 添加选择选项（用于 select 和 mSelect）
    relation?: AttributeViewRelation;
    onSave?: (newValue: any) => void;
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