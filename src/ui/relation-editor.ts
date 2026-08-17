import { showMessage } from "siyuan";
import { AttributeViewRelation, AttributeViewWriteValue, RelationContent, RelationValue, RelationCandidateRow } from "@/core/types";
import { attributeViewRepository } from "@/data/attribute-view-repository";
import { toErrorMessage } from "@/libs/error-utils";
import { t } from "@/i18n";
import { createIconButton, iconElement, positionPanelNear } from "@/libs/dom";

const PAGE_SIZE = 16;
const SEARCH_DELAY = 180;

export interface RelationEditorOptions {
    element: HTMLElement;
    avID: string;
    itemID: string;
    keyID: string;
    keyName: string;
    relation?: AttributeViewRelation;
    currentValue: unknown;
    onSave?: () => void;
    onCancel?: () => void;
    onClose: () => void;
}

export interface RelationEditorHandle {
    panel: HTMLElement;
    cleanup: () => void;
}

interface RelationSelection {
    rowID: string;
    blockID?: string;
    content: string;
    isDetached?: boolean;
}

const repository = attributeViewRepository;

function normalizeRelation(value: unknown): RelationValue {
    const source = value && typeof value === "object" && "relation" in value
        ? (value as { relation?: unknown }).relation
        : value;
    if (Array.isArray(source)) {
        const legacy = source as Array<{ blockID?: unknown; content?: unknown }>;
        return {
            blockIDs: legacy.map(item => String(item?.blockID || "")).filter(Boolean),
            contents: legacy.map(item => ({
                type: "block" as const,
                block: { id: String(item?.blockID || ""), content: String(item?.content || "") },
                isDetached: true
            }))
        };
    }
    if (!source || typeof source !== "object") return { blockIDs: [], contents: [] };
    const relation = source as RelationValue;
    return {
        blockIDs: Array.isArray(relation.blockIDs)
            ? relation.blockIDs.map(blockID => typeof blockID === "string" ? blockID : "").filter(Boolean)
            : [],
        contents: Array.isArray(relation.contents) ? relation.contents : []
    };
}

function selectionFromContent(rowID: string, content?: RelationContent): RelationSelection {
    return {
        rowID,
        blockID: content?.block?.id,
        content: content?.block?.content || rowID,
        isDetached: content?.isDetached
    };
}

function selectionFromRow(row: RelationCandidateRow): RelationSelection {
    const primaryCell = row.cells?.find(cell => cell.value?.type === "block" || cell.value?.block) || row.cells?.[0];
    const value = primaryCell?.value;
    return {
        rowID: String(row.id),
        blockID: value?.block?.id,
        content: value?.block?.content || value?.text?.content || String(row.id),
        isDetached: value?.isDetached
    };
}

function positionPanel(panel: HTMLElement, target: HTMLElement): void {
    positionPanelNear(panel, target, 4);
}

export function openRelationEditor(options: RelationEditorOptions): RelationEditorHandle | undefined {
    if (!options.relation?.avID) {
        showMessage(t("common.relationTargetMissing"), 3000, "error");
        return undefined;
    }

    const panel = document.createElement("div");
    panel.className = "inline-edit-dropdown inline-edit-relation";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", options.keyName);

    const header = document.createElement("header");
    header.className = "inline-edit-panel__header";
    const fieldIcon = iconElement("iconEdit");
    fieldIcon.classList.add("inline-edit-panel__field-icon");
    const title = document.createElement("strong");
    title.textContent = options.keyName;
    const actions = document.createElement("span");
    actions.className = "inline-edit-panel__actions";
    const closeButton = createIconButton("iconClose", t("common.cancel"), "inline-edit-panel__close");
    const saveButton = createIconButton("iconCheck", t("common.save"), "inline-edit-action inline-edit-action--primary");
    actions.append(closeButton, saveButton);
    header.append(fieldIcon, title, actions);

    const searchWrap = document.createElement("div");
    searchWrap.className = "inline-edit-popup-input inline-edit-relation__search";
    const searchInput = document.createElement("input");
    searchInput.type = "search";
    searchInput.className = "inline-edit-relation__input";
    searchInput.placeholder = t("inlineEdit.searchRelation");
    searchInput.setAttribute("aria-label", t("inlineEdit.searchRelation"));
    searchWrap.appendChild(searchInput);

    const list = document.createElement("div");
    list.className = "inline-edit-dropdown-list inline-edit-relation__list";
    panel.append(header, searchWrap, list);
    document.body.appendChild(panel);
    positionPanel(panel, options.element);

    const relation = normalizeRelation(options.currentValue);
    const selected = new Map<string, RelationSelection>();
    (relation.blockIDs || []).forEach((rowID, index) => {
        selected.set(rowID, selectionFromContent(rowID, relation.contents?.[index]));
    });
    const candidates = new Map<string, RelationSelection>();
    let keyword = "";
    let page = 0;
    let total = 0;
    let loading = false;
    let saving = false;
    let searchTimer: number | undefined;
    let outsideTimer: number | undefined;
    let controller: AbortController | undefined;
    let resetQueued = false;
    let disposed = false;

    const hasMore = (): boolean => page * PAGE_SIZE < total;
    const renderMessage = (message: string): void => {
        const item = document.createElement("div");
        item.className = "inline-edit-relation__message";
        item.textContent = message;
        list.appendChild(item);
    };
    const createRow = (item: RelationSelection, isSelected: boolean): HTMLButtonElement => {
        const row = document.createElement("button");
        row.type = "button";
        row.className = `inline-edit-relation__row${isSelected ? " inline-edit-relation__row--selected" : ""}`;
        row.dataset.rowId = item.rowID;
        row.append(iconElement(isSelected ? "iconCheck" : "iconUncheck"));
        const label = document.createElement("span");
        label.textContent = item.content;
        row.appendChild(label);
        row.addEventListener("click", event => {
            event.preventDefault();
            event.stopPropagation();
            const selectedItem = selected.get(item.rowID);
            if (selectedItem) {
                selected.delete(item.rowID);
                candidates.set(item.rowID, selectedItem);
            } else {
                selected.set(item.rowID, item);
                candidates.delete(item.rowID);
            }
            renderList();
        });
        return row;
    };
    const renderList = (): void => {
        list.replaceChildren();
        if (selected.size) {
            selected.forEach(item => list.appendChild(createRow(item, true)));
            const separator = document.createElement("div");
            separator.className = "inline-edit-relation__separator";
            list.appendChild(separator);
        }
        candidates.forEach(item => {
            if (!selected.has(item.rowID)) list.appendChild(createRow(item, false));
        });
        if (!selected.size && !candidates.size && !loading) renderMessage(t("inlineEdit.noRelationResults"));
        if (loading && !candidates.size && !selected.size) renderMessage(t("inlineEdit.loadingRelation"));
        if (!loading && hasMore()) {
            const loadMore = document.createElement("button");
            loadMore.type = "button";
            loadMore.className = "inline-edit-relation__load-more";
            loadMore.textContent = t("inlineEdit.loadMoreRelation");
            loadMore.addEventListener("click", () => void loadPage(false));
            list.appendChild(loadMore);
        }
    };
    const mergePage = (data: { selectedRows?: RelationCandidateRow[]; rows?: RelationCandidateRow[] }): void => {
        (data.selectedRows || []).forEach(row => {
            const item = selectionFromRow(row);
            selected.set(item.rowID, { ...selected.get(item.rowID), ...item });
        });
        (data.rows || []).forEach(row => {
            const item = selectionFromRow(row);
            if (!selected.has(item.rowID)) candidates.set(item.rowID, item);
        });
    };
    const loadPage = async (reset: boolean): Promise<void> => {
        if (disposed) return;
        // fetchSyncPost does not accept AbortSignal, so aborting the controller
        // cannot stop the kernel request. Serialize reset searches instead of
        // allowing every keystroke to create another in-flight request.
        if (loading) {
            if (reset) resetQueued = true;
            return;
        }
        if (!reset && !hasMore()) return;
        if (reset) {
            controller?.abort();
            page = 0;
            total = 0;
            candidates.clear();
        }
        loading = true;
        renderList();
        const requestedPage = reset ? 1 : page + 1;
        const requestKeyword = keyword;
        const requestController = new AbortController();
        controller = requestController;
        try {
            // The kernel resolves the destination database from the relation
            // key. `avID` itself must remain the source database ID.
            const data = await repository.getRelationCandidates(options.avID, options.keyID, requestKeyword,
                [...selected.keys()], requestedPage, PAGE_SIZE);
            if (requestController.signal.aborted || requestKeyword !== keyword) return;
            page = requestedPage;
            total = typeof data.total === "number" ? data.total : (requestedPage - 1) * PAGE_SIZE + (data.rows?.length || 0) + ((data.rows?.length || 0) === PAGE_SIZE ? 1 : 0);
            mergePage(data);
        } catch (error) {
            if (!requestController.signal.aborted) {
                const message = toErrorMessage(error);
                showMessage(t("common.relationLoadFailed", { message }), 5000, "error");
            }
        } finally {
            if (controller === requestController) {
                loading = false;
                renderList();
                if (!disposed && resetQueued) {
                    resetQueued = false;
                    void loadPage(true);
                }
            }
        }
    };
    const save = async (): Promise<void> => {
        if (saving) return;
        saving = true;
        saveButton.disabled = true;
        const contents: RelationContent[] = [...selected.values()].map(item => ({
            type: "block",
            block: { id: item.blockID, content: item.content },
            isDetached: item.isDetached
        }));
        const value: AttributeViewWriteValue = {
            relation: { blockIDs: [...selected.keys()], contents }
        };
        try {
            await repository.setValue(options.avID, options.keyID, options.itemID, value);
            showMessage(t("common.saveSuccess"), 2000, "info");
            options.onSave?.();
            options.onClose();
        } catch (error) {
            const message = toErrorMessage(error);
            showMessage(t("common.saveFailed", { message }), 5000, "error");
            saving = false;
            saveButton.disabled = false;
        }
    };
    const dismiss = (): void => {
        options.onClose();
        options.onCancel?.();
    };
    const onOutsideClick = (event: MouseEvent): void => {
        const target = event.target as Node;
        if (!panel.contains(target) && !options.element.contains(target)) dismiss();
    };
    const onResize = (): void => positionPanel(panel, options.element);
    const onSearch = (): void => {
        keyword = searchInput.value.trim();
        if (searchTimer) window.clearTimeout(searchTimer);
        searchTimer = window.setTimeout(() => void loadPage(true), SEARCH_DELAY);
    };
    const onScroll = (): void => {
        if (!loading && hasMore() && list.scrollHeight - list.scrollTop - list.clientHeight < 40) void loadPage(false);
    };

    closeButton.addEventListener("click", event => {
        event.stopPropagation();
        dismiss();
    });
    saveButton.addEventListener("click", event => {
        event.stopPropagation();
        void save();
    });
    searchInput.addEventListener("input", onSearch);
    list.addEventListener("scroll", onScroll);
    window.addEventListener("resize", onResize);
    outsideTimer = window.setTimeout(() => document.addEventListener("mousedown", onOutsideClick), 100);

    const cleanup = (): void => {
        disposed = true;
        resetQueued = false;
        controller?.abort();
        if (searchTimer) window.clearTimeout(searchTimer);
        if (outsideTimer) window.clearTimeout(outsideTimer);
        document.removeEventListener("mousedown", onOutsideClick);
        window.removeEventListener("resize", onResize);
    };

    searchInput.focus();
    renderList();
    void loadPage(true);
    return { panel, cleanup };
}
