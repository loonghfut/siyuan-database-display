import { fetchSyncPost, IWebSocketData } from "siyuan";
import { DisplayItem, DisplayNavigationTarget } from "@/core/types";
import { t } from "@/i18n";
import { assetLabel } from "@/ui/asset-utils";
import { createIconButton, positionPanelNear } from "@/libs/dom";

const PREVIEW_DELAY = 260;
const HIDE_DELAY = 160;
const MAX_PREVIEW_CACHE = 128;

interface BlockPreview {
    title: string;
    path?: string;
    content?: string;
}

interface ContentPopoverOptions {
    onNavigate: (target: DisplayNavigationTarget, openInSplit: boolean) => void;
    onEditAsset: (item: DisplayItem, element: HTMLElement) => void;
}

function escapeSqlLiteral(value: string): string {
    return value.replace(/'/g, "''");
}

export class ContentPopover {
    private root: HTMLElement | undefined;
    private currentAnchor: HTMLElement | undefined;
    private previewTimer: number | undefined;
    private hideTimer: number | undefined;
    private requestVersion = 0;
    private readonly previewCache = new Map<string, BlockPreview | undefined>();

    constructor(private readonly options: ContentPopoverOptions) {}

    showBlockPreview(target: DisplayNavigationTarget, anchor: HTMLElement): void {
        if (target.kind !== "block") return;
        this.cancelHide();
        if (this.currentAnchor === anchor && this.root && !this.root.hidden) return;
        this.currentAnchor = anchor;
        this.cancelPreview();
        const requestVersion = ++this.requestVersion;
        this.previewTimer = window.setTimeout(() => {
            this.previewTimer = undefined;
            if (requestVersion !== this.requestVersion || !anchor.isConnected) return;
            this.showBlockLoading(target, anchor);
            void this.loadBlockPreview(target.blockId).then(preview => {
                if (requestVersion !== this.requestVersion || this.currentAnchor !== anchor) return;
                this.showBlockPreviewContent(target, anchor, preview);
            });
        }, PREVIEW_DELAY);
    }

    showRollupSources(item: DisplayItem, anchor: HTMLElement): void {
        this.cancelPreview();
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
        this.cancelPreview();
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
        this.cancelPreview();
        if (!this.root || this.root.hidden || this.hideTimer) return;
        this.hideTimer = window.setTimeout(() => this.hideImmediately(), HIDE_DELAY);
    }

    dispose(): void {
        this.cancelPreview();
        this.cancelHide();
        this.root?.remove();
        document.removeEventListener("pointerdown", this.handlePointerDown, true);
        document.removeEventListener("keydown", this.handleKeyDown, true);
        window.removeEventListener("resize", this.position);
        this.root = undefined;
        this.currentAnchor = undefined;
        this.previewCache.clear();
    }

    private showBlockLoading(target: Extract<DisplayNavigationTarget, { kind: "block" }>, anchor: HTMLElement): void {
        const content = document.createElement("div");
        content.className = "db-display__popover-content";
        content.appendChild(this.createHeader(target.blockId));
        const loading = document.createElement("span");
        loading.className = "db-display__popover-empty";
        loading.textContent = t("common.loadingPreview");
        content.appendChild(loading);
        this.show(content, anchor, "block");
    }

    private showBlockPreviewContent(target: Extract<DisplayNavigationTarget, { kind: "block" }>, anchor: HTMLElement, preview: BlockPreview | undefined): void {
        const content = document.createElement("div");
        content.className = "db-display__popover-content";
        const header = this.createHeader(preview?.title || target.blockId);
        const open = createIconButton("iconOpen", t("common.openBlock"), "db-display__popover-action");
        open.addEventListener("click", event => {
            event.stopPropagation();
            this.options.onNavigate(target, event.ctrlKey || event.metaKey);
            this.hideImmediately();
        });
        header.querySelector(".db-display__popover-actions")?.prepend(open);
        content.appendChild(header);

        if (preview?.path) {
            const path = document.createElement("div");
            path.className = "db-display__popover-path";
            path.textContent = preview.path;
            content.appendChild(path);
        }
        const body = document.createElement("div");
        body.className = preview?.content ? "db-display__popover-preview" : "db-display__popover-empty";
        body.textContent = preview?.content || t("common.previewUnavailable");
        content.appendChild(body);
        this.show(content, anchor, "block");
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

    private async loadBlockPreview(blockId: string): Promise<BlockPreview | undefined> {
        if (this.previewCache.has(blockId)) return this.previewCache.get(blockId);
        let preview: BlockPreview | undefined;
        try {
            const response = await fetchSyncPost("/api/query/sql", {
                stmt: `SELECT content, markdown, hpath FROM blocks WHERE id = '${escapeSqlLiteral(blockId)}' LIMIT 1`
            }) as IWebSocketData;
            const row = response.code === 0 && Array.isArray(response.data) ? response.data[0] as Record<string, unknown> | undefined : undefined;
            if (row) {
                const title = typeof row.content === "string" ? row.content.trim() : "";
                const markdown = typeof row.markdown === "string" ? row.markdown.trim() : "";
                preview = {
                    title: title || blockId,
                    path: typeof row.hpath === "string" ? row.hpath : undefined,
                    content: markdown || title
                };
            }
        } catch (error) {
            console.warn("[DatabaseDisplay] Failed to load block preview", error);
        }
        this.previewCache.set(blockId, preview);
        while (this.previewCache.size > MAX_PREVIEW_CACHE) {
            const oldest = this.previewCache.keys().next().value;
            if (!oldest) break;
            this.previewCache.delete(oldest);
        }
        return preview;
    }

    private cancelPreview(): void {
        if (this.previewTimer) window.clearTimeout(this.previewTimer);
        this.previewTimer = undefined;
    }

    private cancelHide(): void {
        if (this.hideTimer) window.clearTimeout(this.hideTimer);
        this.hideTimer = undefined;
    }

    private hideImmediately(): void {
        this.cancelPreview();
        this.cancelHide();
        this.requestVersion++;
        if (this.root) this.root.hidden = true;
        this.currentAnchor = undefined;
    }
}
