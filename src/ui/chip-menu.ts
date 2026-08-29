/**
 * 属性 chip 的右键菜单：复制值 / 隐藏字段 / 编辑 / 在分屏打开。
 * 使用思源原生 Menu API，由 DisplayController 注入动作回调。
 */

import { Menu } from "siyuan";
import { DisplayItem, DisplayNavigationTarget } from "@/core/types";
import { t } from "@/i18n";
import { copyText } from "@/libs/dom";
import { notify } from "@/libs/notify";

export interface ChipMenuOptions {
    canEdit: boolean;
    onEdit: (item: DisplayItem) => void;
    onHideField: (item: DisplayItem) => void;
    onNavigate: (target: DisplayNavigationTarget) => void;
}

export function openChipMenu(item: DisplayItem, event: MouseEvent, options: ChipMenuOptions): void {
    const menu = new Menu();
    menu.addItem({
        icon: "iconCopy",
        label: t("common.copyValue"),
        click: () => {
            void copyText(item.text).then(ok => {
                if (ok) {
                    notify(t("common.valueCopied"), 2000, "info");
                } else {
                    notify(t("common.copyFailed"), 3000, "error");
                }
            });
        }
    });
    menu.addItem({
        icon: "iconEyeoff",
        label: t("common.hideField"),
        click: () => options.onHideField(item)
    });
    if (options.canEdit) {
        menu.addItem({
            icon: "iconEdit",
            label: t("common.edit"),
            click: () => options.onEdit(item)
        });
    }
    if (item.navigation) {
        menu.addItem({
            icon: "iconLayoutRight",
            label: t("common.openInSplit"),
            click: () => options.onNavigate(item.navigation!)
        });
    }
    menu.open({ x: event.clientX, y: event.clientY });
}
