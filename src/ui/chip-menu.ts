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
    onHideField: (item: DisplayItem, currentDbOnly?: boolean) => void;
    onNavigate: (target: DisplayNavigationTarget) => void;
    onOpenLocation?: (item: DisplayItem) => void;
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

    if (item.avID) {
        menu.addItem({
            icon: "iconEyeoff",
            label: t("common.hideFieldCurrentDb"),
            click: () => options.onHideField(item, true)
        });
    }
    menu.addItem({
        icon: "iconEyeoff",
        label: t("common.hideFieldGlobal"),
        click: () => options.onHideField(item, false)
    });

    if (options.canEdit) {
        menu.addItem({
            icon: "iconEdit",
            label: t("common.edit"),
            click: () => options.onEdit(item)
        });
    }

    if (item.navigation?.kind === "map") {
        if (options.onOpenLocation) {
            menu.addItem({
                icon: "iconCompass",
                label: t("common.openMap"),
                click: () => options.onOpenLocation?.(item)
            });
        }
        if (typeof item.navigation.latitude === "number" && typeof item.navigation.longitude === "number") {
            menu.addItem({
                icon: "iconOpen",
                label: t("common.openInExternalMap"),
                click: () => options.onNavigate(item.navigation!)
            });
        }
    } else if (item.navigation) {
        menu.addItem({
            icon: "iconLayoutRight",
            label: t("common.openInSplit"),
            click: () => options.onNavigate(item.navigation!)
        });
    }

    if (item.keyType === "url" && typeof item.rawValue === "string" && item.rawValue) {
        menu.addItem({
            icon: "iconOpen",
            label: t("common.openUrl"),
            click: () => {
                window.open(String(item.rawValue), "_blank", "noopener,noreferrer");
            }
        });
    }

    menu.open({ x: event.clientX, y: event.clientY });
}
