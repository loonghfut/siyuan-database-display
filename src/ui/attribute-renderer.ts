import { DisplayConfig, isSafeColor } from "@/config/display-config";
import { AssetReference, DisplayItem, DisplayNavigationTarget, isInlineEditableField } from "@/core/types";
import { t } from "@/i18n";
import { assetLabel, assetThumbnailUrl } from "@/ui/asset-utils";
import { createIconButton, iconElement } from "@/libs/dom";

export interface RenderContext {
    blockId: string;
    config: DisplayConfig;
    canInlineEdit: boolean;
    onEdit: (item: DisplayItem, element: HTMLElement) => void;
    onNavigate: (target: DisplayNavigationTarget, event: MouseEvent) => void;
    onShowBlockPreview: (target: DisplayNavigationTarget, element: HTMLElement) => void;
    onHideContentPreview: () => void;
    onShowRollupSources: (item: DisplayItem, element: HTMLElement) => void;
    onPreviewAsset: (item: DisplayItem, element: HTMLElement, event: MouseEvent) => void;
    onContextMenu: (item: DisplayItem, element: HTMLElement, event: MouseEvent) => void;
}

export class AttributeRenderer {
    private readonly signatures = new WeakMap<HTMLElement, string>();

    render(parent: HTMLElement, items: DisplayItem[], context: RenderContext): void {
        const attributeContainer = [...parent.children].find(child => child.classList.contains("protyle-attr")) as HTMLElement | undefined;
        if (!attributeContainer) return;
        const signature = JSON.stringify({
            items,
            canInlineEdit: context.canInlineEdit,
            config: this.visualConfig(context.config)
        });
        // 容器必须仍然存在且签名一致才跳过渲染：思源会在 updateAttrs 等事务中
        // 用 innerHTML 重建 .protyle-attr 内部（容器元素对象不变），清掉我们注入的
        // 节点，此时 WeakMap 中的旧签名已失效，必须重新注入。
        const existing = attributeContainer.querySelector<HTMLElement>(":scope > .my-protyle-attr--av");
        if (existing && this.signatures.get(attributeContainer) === signature) return;
        this.signatures.set(attributeContainer, signature);

        const container = existing || document.createElement("div");
        container.className = "my-protyle-attr--av";
        // 容器随旧块被思源替换/重建时，据此定位所属块以支持一帧内快速恢复
        container.dataset.blockId = context.blockId;
        container.replaceChildren(...this.createItems(items, context));
        if (!existing) attributeContainer.insertBefore(container, attributeContainer.firstChild);
    }

    clear(parent: HTMLElement): void {
        const attributeContainer = [...parent.children].find(child => child.classList.contains("protyle-attr")) as HTMLElement | undefined;
        attributeContainer?.querySelector(":scope > .my-protyle-attr--av")?.remove();
        if (attributeContainer) this.signatures.delete(attributeContainer);
    }

    private createItems(items: DisplayItem[], context: RenderContext): HTMLElement[] {
        const elements: HTMLElement[] = [];
        for (let index = 0; index < items.length;) {
            const item = items[index];
            if (item.type === "relation") {
                const group = [item];
                index++;
                while (index < items.length && this.belongsToRelationGroup(items[index], item)) {
                    group.push(items[index]);
                    index++;
                }
                elements.push(this.createRelationGroup(group, context));
                continue;
            }
            if (item.type === "mAsset" && item.asset) {
                const group = [item];
                index++;
                while (index < items.length && this.belongsToAssetGroup(items[index], item)) {
                    group.push(items[index]);
                    index++;
                }
                elements.push(this.createAssetGroup(group, context));
                continue;
            }
            elements.push(this.createItem(item, context));
            index++;
        }
        return elements;
    }

    private belongsToRelationGroup(candidate: DisplayItem, item: DisplayItem): boolean {
        return candidate.type === "relation" && candidate.avID === item.avID && candidate.keyID === item.keyID;
    }

    private belongsToAssetGroup(candidate: DisplayItem, item: DisplayItem): boolean {
        return candidate.type === "mAsset" && Boolean(candidate.asset) && candidate.avID === item.avID && candidate.keyID === item.keyID;
    }

    private createAssetGroup(items: DisplayItem[], context: RenderContext): HTMLElement {
        const group = document.createElement("span");
        group.className = "db-display__asset-group";
        if (context.config.showFieldNames) group.appendChild(this.createFieldName(items[0].keyName));
        items.forEach(item => group.appendChild(this.createAssetItem(item, context, false)));
        return group;
    }

    private createRelationGroup(items: DisplayItem[], context: RenderContext): HTMLElement {
        const group = document.createElement("span");
        group.className = "db-display__relation-group";
        if (context.config.showFieldNames) group.appendChild(this.createFieldName(items[0].keyName));
        items.forEach(item => group.appendChild(this.createRelationChip(item, context)));

        if (context.canInlineEdit && isInlineEditableField("relation")) {
            const edit = createIconButton("iconEdit", t("common.edit"), "db-display__relation-edit");
            edit.addEventListener("click", event => {
                event.stopPropagation();
                context.onEdit(items[0], edit);
            });
            group.appendChild(edit);
        }
        return group;
    }

    private createRelationChip(item: DisplayItem, context: RenderContext): HTMLElement {
        if (item.navigation?.kind === "block") return this.createNavigationChip(item, context, false, false);
        return this.createReadonlyChip(item, context, false);
    }

    private createItem(item: DisplayItem, context: RenderContext): HTMLElement {
        if (item.type === "mAsset" && item.asset) return this.createAssetItem(item, context);
        if (item.type === "rollup") return this.createRollupChip(item, context);
        if (item.navigation?.kind === "block") return this.createNavigationChip(item, context, true);
        if (item.keyType === "url" && Boolean(item.rawValue)) return this.createUrlChip(item, context);
        return this.createEditableOrReadonlyChip(item, context);
    }

    private createNavigationChip(item: DisplayItem, context: RenderContext, includeFieldName: boolean, withHoverPreview = true): HTMLButtonElement {
        const element = document.createElement("button");
        element.type = "button";
        element.className = "db-display__chip db-display__chip--navigation ariaLabel";
        const plainText = this.populateChip(element, item, context, includeFieldName);
        const target = item.navigation!;
        const label = target.kind === "block" ? t("common.openBlock") : t("common.openFile");
        element.title = label;
        element.setAttribute("aria-label", this.chipLabel(item, plainText, includeFieldName));
        this.applyColors(element, item, context.config);
        element.addEventListener("click", event => {
            event.stopPropagation();
            context.onNavigate(target, event);
        });
        if (target.kind === "block" && withHoverPreview) {
            element.addEventListener("pointerenter", () => context.onShowBlockPreview(target, element));
            element.addEventListener("pointerleave", () => context.onHideContentPreview());
        }
        return element;
    }

    private createRollupChip(item: DisplayItem, context: RenderContext): HTMLElement {
        const canShowSources = Boolean(item.sources?.length);
        const element = document.createElement(canShowSources ? "button" : "span");
        element.className = "db-display__chip db-display__chip--rollup ariaLabel";
        if (element instanceof HTMLButtonElement) element.type = "button";
        const plainText = this.populateChip(element, item, context, true);
        element.setAttribute("aria-label", this.chipLabel(item, plainText, true));
        this.applyColors(element, item, context.config);
        if (element instanceof HTMLButtonElement) {
            element.title = t("common.viewSourceValues");
            element.addEventListener("click", event => {
                event.stopPropagation();
                context.onShowRollupSources(item, element);
            });
        } else {
            element.classList.add("db-display__chip--readonly");
        }
        return element;
    }

    private createAssetItem(item: DisplayItem, context: RenderContext, includeFieldName = true): HTMLElement {
        const asset = item.asset!;
        if (asset.type === "image" && asset.content) return this.createImageAsset(item, asset, context, includeFieldName);

        const element = document.createElement(item.navigation ? "button" : "span");
        element.className = "db-display__chip db-display__asset db-display__asset--file ariaLabel";
        if (element instanceof HTMLButtonElement) element.type = "button";
        const icon = iconElement("iconFile");
        icon.classList.add("db-display__asset-icon");
        element.appendChild(icon);
        const plainText = this.populateChip(element, item, context, includeFieldName);
        element.setAttribute("aria-label", this.chipLabel(item, plainText, includeFieldName));
        this.applyColors(element, item, context.config);
        if (element instanceof HTMLButtonElement && item.navigation) {
            element.title = t("common.openFile");
            element.addEventListener("click", event => {
                event.stopPropagation();
                context.onNavigate(item.navigation!, event);
            });
        } else {
            element.classList.add("db-display__chip--readonly");
        }
        return element;
    }

    private createImageAsset(item: DisplayItem, asset: AssetReference, context: RenderContext, includeFieldName = true): HTMLElement {
        const wrapper = document.createElement("span");
        wrapper.className = "db-display__asset db-display__asset--image";
        if (includeFieldName && context.config.showFieldNames) wrapper.appendChild(this.createFieldName(item.keyName));

        const preview = document.createElement("button");
        preview.type = "button";
        preview.className = "db-display__asset-thumbnail ariaLabel";
        const label = assetLabel(asset);
        preview.title = t("common.previewImage");
        preview.setAttribute("aria-label", label || t("common.previewImage"));
        const name = label ? document.createElement("span") : undefined;
        if (name) {
            name.className = "db-display__asset-name db-display__asset-name--hidden";
            name.textContent = truncateDisplayText(normalizeDisplayText(label), context.config.maxDisplayLength);
            wrapper.appendChild(name);
        }

        const image = document.createElement("img");
        image.loading = "lazy";
        image.src = assetThumbnailUrl(asset.content || "");
        image.alt = label;
        image.addEventListener("error", () => {
            preview.classList.add("db-display__asset-thumbnail--failed");
            preview.replaceChildren(iconElement("iconFile"));
            name?.classList.remove("db-display__asset-name--hidden");
        }, { once: true });
        image.addEventListener("load", () => name?.classList.add("db-display__asset-name--hidden"), { once: true });
        preview.appendChild(image);
        this.applyColors(preview, item, context.config);
        preview.addEventListener("click", event => {
            event.stopPropagation();
            if ((event.ctrlKey || event.metaKey) && item.navigation) {
                context.onNavigate(item.navigation, event);
                return;
            }
            context.onPreviewAsset(item, preview, event);
        });
        this.enableContextMenu(preview, item, context);
        wrapper.appendChild(preview);
        return wrapper;
    }

    private createUrlChip(item: DisplayItem, context: RenderContext): HTMLAnchorElement {
        const element = document.createElement("a");
        element.className = "db-display__chip ariaLabel";
        const plainText = this.populateChip(element, item, context, true);
        element.href = String(item.rawValue || "");
        element.target = "_blank";
        element.rel = "noopener noreferrer";
        element.setAttribute("aria-label", this.chipLabel(item, plainText, true));
        this.applyColors(element, item, context.config);
        return element;
    }

    private createEditableOrReadonlyChip(item: DisplayItem, context: RenderContext): HTMLElement {
        const isTemplate = item.type === "template";
        const editable = this.isEditable(item, context);
        const element = document.createElement(isTemplate || !editable ? "span" : "button");
        element.className = "db-display__chip ariaLabel";
        if (element instanceof HTMLButtonElement) element.type = "button";
        const plainText = this.populateChip(element, item, context, true);
        element.setAttribute("aria-label", this.chipLabel(item, plainText, true));
        this.applyColors(element, item, context.config);

        if (isTemplate && editable) {
            element.setAttribute("role", "button");
            element.tabIndex = 0;
            const value = element.querySelector<HTMLElement>(".db-display__value");
            if (value) this.stopTemplateInteraction(value);
        }
        if (!editable) {
            element.classList.add("db-display__chip--readonly");
            return element;
        }
        element.addEventListener("click", event => {
            event.stopPropagation();
            context.onEdit(item, element);
        });
        if (isTemplate) {
            element.addEventListener("keydown", event => {
                const keyboardEvent = event as KeyboardEvent;
                if (keyboardEvent.key !== "Enter" && keyboardEvent.key !== " ") return;
                event.preventDefault();
                event.stopPropagation();
                context.onEdit(item, element);
            });
        }
        return element;
    }

    private createReadonlyChip(item: DisplayItem, context: RenderContext, includeFieldName: boolean): HTMLSpanElement {
        const element = document.createElement("span");
        element.className = "db-display__chip db-display__chip--readonly ariaLabel";
        const plainText = this.populateChip(element, item, context, includeFieldName);
        element.setAttribute("aria-label", this.chipLabel(item, plainText, includeFieldName));
        this.applyColors(element, item, context.config);
        return element;
    }

    private populateChip(element: HTMLElement, item: DisplayItem, context: RenderContext, includeFieldName: boolean): string {
        const value = document.createElement("span");
        value.className = "db-display__value";
        const isTemplate = item.type === "template";
        const plainText = isTemplate
            ? this.renderTemplateValue(value, item.text, context.config.maxDisplayLength)
            : normalizeDisplayText(item.text);
        if (!isTemplate) value.textContent = truncateDisplayText(plainText, context.config.maxDisplayLength);
        if (includeFieldName && context.config.showFieldNames) {
            element.append(this.createFieldName(item.keyName), value);
        } else {
            element.appendChild(value);
        }
        element.dataset.fieldType = item.type;
        this.enableContextMenu(element, item, context);
        return plainText;
    }

    private createFieldName(keyName: string): HTMLSpanElement {
        const name = document.createElement("span");
        name.className = "db-display__field-name";
        name.textContent = `${keyName}: `;
        return name;
    }

    private chipLabel(item: DisplayItem, text: string, includeFieldName: boolean): string {
        return includeFieldName ? `${item.keyName}: ${text}` : text;
    }

    private isEditable(item: DisplayItem, context: RenderContext): boolean {
        return context.canInlineEdit && isInlineEditableField(item.type) && item.type !== "relation";
    }

    private enableContextMenu(element: HTMLElement, item: DisplayItem, context: RenderContext): void {
        element.addEventListener("contextmenu", event => {
            event.preventDefault();
            event.stopPropagation();
            context.onContextMenu(item, element, event);
        });
    }

    private renderTemplateValue(value: HTMLElement, content: string, maxLength: number): string {
        const sanitizer = window.DOMPurify;
        if (!sanitizer) {
            const plainText = document.createElement("span");
            plainText.textContent = content;
            const text = normalizeDisplayText(plainText.textContent || "");
            value.textContent = truncateDisplayText(text, maxLength);
            return text;
        }

        const source = document.createElement("span");
        source.innerHTML = sanitizer.sanitize(content);
        const text = normalizeDisplayText(source.textContent || "");
        if (text.length > maxLength) {
            value.textContent = truncateDisplayText(text, maxLength);
        } else {
            value.append(...Array.from(source.childNodes));
        }
        return text;
    }

    private stopTemplateInteraction(value: HTMLElement): void {
        value.querySelectorAll<HTMLElement>("a, button, input, select, textarea, label, summary").forEach(interactive => {
            ["click", "mousedown", "pointerdown", "keydown"].forEach(eventName => {
                interactive.addEventListener(eventName, event => event.stopPropagation());
            });
        });
    }

    private applyColors(element: HTMLElement, item: DisplayItem, config: DisplayConfig): void {
        const valueRule = config.valueColors[item.text];
        const rule = typeof valueRule === "string" ? { color: valueRule } : valueRule;
        const color = rule?.color || config.fieldColors[item.type];
        const background = rule?.bg || config.fieldBackgrounds[item.type];
        if (isSafeColor(color)) element.style.color = color;
        if (isSafeColor(background)) element.style.setProperty("--db-chip-background", background);
    }

    private visualConfig(config: DisplayConfig): unknown {
        return {
            max: config.maxDisplayLength,
            showFieldNames: config.showFieldNames,
            colors: config.fieldColors,
            backgrounds: config.fieldBackgrounds,
            values: config.valueColors
        };
    }
}

function normalizeDisplayText(value: string): string {
    return value.replace(/\s+/g, " ").trim();
}

function truncateDisplayText(value: string, maxLength: number): string {
    return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}
