/**
 * 内容浮层：汇总字段来源列表、图片资源预览（点击触发）。
 * 不包含块预览——主键/块字段的悬浮预览面板已移除。
 */

import { DisplayItem, DisplayNavigationTarget } from "@/core/types";
import { t } from "@/i18n";
import { assetLabel } from "@/ui/asset-utils";
import { createIconButton, positionPanelNear } from "@/libs/dom";

const HIDE_DELAY = 160;

interface ContentPopoverOptions {
    onNavigate: (target: DisplayNavigationTarget, openInSplit: boolean) => void;
    onEditAsset: (item: DisplayItem, element: HTMLElement) => void;
}

export class ContentPopover {
    private root: HTMLElement | undefined;
    private currentAnchor: HTMLElement | undefined;
    private hideTimer: number | undefined;
    private requestVersion = 0;

    constructor(private readonly options: ContentPopoverOptions) {}

    showRollupSources(item: DisplayItem, anchor: HTMLElement): void {
        this.cancelHide();
        this.requestVersion++;
        this.currentAnchor = anchor;

        const content = document.createElement("div");
        content.className = "db-display__popover-content";
        content.appendChild(this.createHeader(item.keyName));
        const list = document.createElement("div");
        list.className = "db-display__popover-list";
        const sources = item.sources || [];
        if (!sources.length) {
            const empty = document.createElement("span");
            empty.className = "db-display__popover-empty";
            empty.textContent = t("common.noSourceValues");
            list.appendChild(empty);
        }
        sources.forEach(source => {
            const sourceElement = document.createElement(source.target ? "button" : "span");
            sourceElement.className = "db-display__popover-source";
            sourceElement.textContent = source.text;
            if (sourceElement instanceof HTMLButtonElement && source.target) {
                sourceElement.type = "button";
                sourceElement.title = source.target.kind === "block" ? t("common.openBlock") : t("common.openFile");
                sourceElement.addEventListener("click", event => {
                    event.stopPropagation();
                    this.options.onNavigate(source.target!, event.ctrlKey || event.metaKey);
                    this.hideImmediately();
                });
            }
            list.appendChild(sourceElement);
        });
        content.appendChild(list);
        this.show(content, anchor, "sources");
    }

    showAssetPreview(item: DisplayItem, anchor: HTMLElement, canEdit: boolean): void {
        const asset = item.asset;
        if (!asset?.content) return;
        this.cancelHide();
        this.requestVersion++;
        this.currentAnchor = anchor;

        const content = document.createElement("div");
        content.className = "db-display__popover-content db-display__popover-content--asset";
        const header = this.createHeader(assetLabel(asset));
        const actions = header.querySelector(".db-display__popover-actions");
        if (canEdit) {
            const edit = createIconButton("iconEdit", t("common.edit"), "db-display__popover-action");
            edit.addEventListener("click", event => {
                event.stopPropagation();
                this.hideImmediately();
                this.options.onEditAsset(item, anchor);
            });
            actions?.prepend(edit);
        }
        const open = createIconButton("iconOpen", t("common.openFile"), "db-display__popover-action");
        open.addEventListener("click", event => {
            event.stopPropagation();
            this.options.onNavigate({ kind: "asset", path: asset.content! }, event.ctrlKey || event.metaKey);
            this.hideImmediately();
        });
        actions?.prepend(open);

        const image = document.createElement("img");
        image.className = "db-display__popover-image";
        image.alt = assetLabel(asset);
        // Register listeners before assigning `src`: for cached images the
        // load event can fire before the listener is attached, leaving the
        // popover positioned at its pre-load size and clipped at screen edges.
        image.addEventListener("error", () => {
            const message = document.createElement("span");
            message.className = "db-display__popover-empty";
            message.textContent = t("common.previewUnavailable");
            image.replaceWith(message);
            this.position();
        }, { once: true });
        image.addEventListener("load", () => this.position(), { once: true });
        image.src = encodeURI(asset.content);
        content.append(header, image);
        this.show(content, anchor, "asset");
    }

    hide(): void {
        if (!this.root || this.root.hidden || this.hideTimer) return;
        this.hideTimer = window.setTimeout(() => this.hideImmediately(), HIDE_DELAY);
    }

    dispose(): void {
        this.cancelHide();
        this.root?.remove();
        document.removeEventListener("pointerdown", this.handlePointerDown, true);
        document.removeEventListener("keydown", this.handleKeyDown, true);
        window.removeEventListener("resize", this.position);
        this.root = undefined;
        this.currentAnchor = undefined;
    }

    private createHeader(title: string): HTMLElement {
        const header = document.createElement("header");
        header.className = "db-display__popover-header";
        const heading = document.createElement("strong");
        heading.textContent = title;
        const actions = document.createElement("span");
        actions.className = "db-display__popover-actions";
        const close = createIconButton("iconClose", t("common.cancel"), "db-display__popover-action");
        close.addEventListener("click", event => {
            event.stopPropagation();
            this.hideImmediately();
        });
        actions.appendChild(close);
        header.append(heading, actions);
        return header;
    }

    private show(content: HTMLElement, anchor: HTMLElement, kind: string): void {
        const root = this.ensureRoot();
        root.dataset.kind = kind;
        root.replaceChildren(content);
        root.hidden = false;
        this.currentAnchor = anchor;
        this.position();
    }

    private ensureRoot(): HTMLElement {
        if (this.root) return this.root;
        const root = document.createElement("div");
        root.className = "db-display__popover";
        root.hidden = true;
        root.setAttribute("role", "dialog");
        root.addEventListener("pointerenter", () => this.cancelHide());
        root.addEventListener("pointerleave", () => this.hide());
        document.body.appendChild(root);
        document.addEventListener("pointerdown", this.handlePointerDown, true);
        document.addEventListener("keydown", this.handleKeyDown, true);
        window.addEventListener("resize", this.position);
        this.root = root;
        return root;
    }

    private readonly handlePointerDown = (event: PointerEvent): void => {
        const target = event.target as Node;
        if (this.root?.contains(target) || this.currentAnchor?.contains(target)) return;
        this.hideImmediately();
    };

    private readonly handleKeyDown = (event: KeyboardEvent): void => {
        if (event.key === "Escape") this.hideImmediately();
    };

    private readonly position = (): void => {
        if (!this.root || this.root.hidden || !this.currentAnchor?.isConnected) return;
        positionPanelNear(this.root, this.currentAnchor, 6);
    };

    private cancelHide(): void {
        if (this.hideTimer) window.clearTimeout(this.hideTimer);
        this.hideTimer = undefined;
    }

    private hideImmediately(): void {
        this.cancelHide();
        this.requestVersion++;
        if (this.root) this.root.hidden = true;
        this.currentAnchor = undefined;
    }
}
