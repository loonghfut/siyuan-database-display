import { DisplayConfig, isSafeColor } from "@/config/display-config";
import { AssetReference, DisplayItem, DisplayNavigationTarget, DisplaySegment, isInlineEditableField } from "@/core/types";
import { t } from "@/i18n";
import { assetLabel, assetThumbnailUrl } from "@/ui/asset-utils";
import { createIconButton, iconElement } from "@/libs/dom";

export interface RenderContext {
    blockId: string;
    config: DisplayConfig;
    canInlineEdit: boolean;
    onEdit: (item: DisplayItem, element: HTMLElement) => void;
    onNavigate: (target: DisplayNavigationTarget, event: MouseEvent) => void;
    onShowRollupSources: (item: DisplayItem, element: HTMLElement) => void;
    onPreviewAsset: (item: DisplayItem, element: HTMLElement, event: MouseEvent) => void;
    onContextMenu: (item: DisplayItem, element: HTMLElement, event: MouseEvent) => void;
}

export class AttributeRenderer {
    private readonly signatures = new WeakMap<HTMLElement, string>();
    private readonly itemSignatures = new WeakMap<DisplayItem[], string>();
    private readonly configSignatures = new WeakMap<DisplayConfig, string>();
    private readonly listMetrics = new WeakMap<HTMLElement, { height: number; fieldNameWidth: number; contentHeight?: number }>();
    // 列表模式：列表高度决定块底部预留空间，尺寸变化（图片懒加载、字段增删、重排）需同步
    private readonly listSpaceObserver = new ResizeObserver(entries => {
        for (const entry of entries) {
            const list = entry.target as HTMLElement;
            // 容器随思源事务被替换后即失去引用，及时解除观察避免累积
            if (!list.isConnected) {
                this.listSpaceObserver.unobserve(list);
                continue;
            }
            if (!list.classList.contains("my-protyle-attr--av--list")) continue;
            const metrics = this.listMetrics.get(list);
            if (metrics) metrics.height = entry.contentRect.height;
            this.applyListSpace(list, entry.contentRect.height, metrics?.contentHeight);
        }
    });

    render(parent: HTMLElement, items: DisplayItem[], context: RenderContext): void {
        // 容器挂在 .protyle-attr 内（思源识别的属性容器，编辑/合并/序列化时被安全忽略）
        const attributeContainer = [...parent.children].find(child => child.classList.contains("protyle-attr")) as HTMLElement | undefined;
        if (!attributeContainer) return;
        const useList = context.config.layout !== "inline"
            && items.length > 0
            && !parent.classList.contains("protyle-title");
        this.syncLayoutClasses(parent, attributeContainer, useList, context.config.layout);
        // A block can have multiple visible parents. Share the expensive item
        // serialization between those parents.
        let itemSignature = this.itemSignatures.get(items);
        if (!itemSignature) {
            itemSignature = JSON.stringify(items);
            this.itemSignatures.set(items, itemSignature);
        }
        let configSignature = this.configSignatures.get(context.config);
        if (!configSignature) {
            configSignature = JSON.stringify(this.visualConfig(context.config));
            this.configSignatures.set(context.config, configSignature);
        }
        const signature = `${itemSignature}|${context.canInlineEdit ? 1 : 0}|${configSignature}`;
        // 容器必须仍然存在且签名一致才跳过渲染：思源会在 updateAttrs 等事务中
        // 用 innerHTML 重建 .protyle-attr 内部（容器元素对象不变），清掉我们注入的
        // 节点，此时 WeakMap 中的旧签名已失效，必须重新注入。
        const existing = attributeContainer.querySelector<HTMLElement>(":scope > .my-protyle-attr--av");
        // 无内容且尚无容器时不创建（避免残留空白）
        if (items.length === 0 && !existing) return;
        parent.classList.add("db-display--rendered");
        const container = existing || document.createElement("div");
        if (existing && this.signatures.get(container) === signature) {
            // The block can be rebuilt while the injected container survives.
            // Restore cached CSS values without forcing another layout read.
            this.syncListSpace(container, false);
            return;
        }
        this.signatures.set(container, signature);

        // 列表模式追加位置修饰类：配合 CSS 显示在块上方或下方并纵向排列；
        // 文档块（标题）不参与列表模式；无内容的容器也不参与（避免预留空白条）
        const listPositionClass = context.config.layout === "above"
            ? "my-protyle-attr--av--list-above"
            : "my-protyle-attr--av--list-below";
        const listColumnsClass = context.config.listMultiColumn
            ? "my-protyle-attr--av--list-multi"
            : "my-protyle-attr--av--list-single";
        container.className = useList
            ? `my-protyle-attr--av my-protyle-attr--av--list ${listPositionClass} ${listColumnsClass}`
            : "my-protyle-attr--av";
        if (useList) {
            container.style.setProperty("--db-attr-list-font-size", `${context.config.listFontSize}px`);
        } else {
            container.style.removeProperty("--db-attr-list-font-size");
        }
        // 容器随旧块被思源替换/重建时，据此定位所属块以支持一帧内快速恢复
        container.dataset.blockId = context.blockId;
        container.replaceChildren(...this.createItems(items, context));
        // 容器始终位于 .protyle-attr 首位（原生徽标之前）；位置不对时归位
        if (container.parentElement !== attributeContainer || container.previousElementSibling !== null) {
            attributeContainer.insertBefore(container, attributeContainer.firstChild);
        }
        this.syncListSpace(container, true);
    }

    clear(parent: HTMLElement): void {
        const container = parent.querySelector<HTMLElement>(":scope > .protyle-attr > .my-protyle-attr--av");
        if (container) {
            this.listSpaceObserver.unobserve(container);
            this.signatures.delete(container);
            container.remove();
        }
        parent.style.removeProperty("--db-attr-list-space");
        parent.style.removeProperty("--db-attr-block-height");
        parent.classList.remove("db-display--rendered", "db-display--list-above", "db-display--list-below");
    }

    dispose(): void {
        this.listSpaceObserver.disconnect();
    }

    /**
     * 列表模式：把列表当前高度写入所在块的 --db-attr-list-space，供 CSS 预留底部空间，
     * 并记录未包含列表预留区的块高度，供列表定位到块底部。行内模式需要解除旧观察和变量。
     */
    private syncListSpace(container: HTMLElement, measure = true): void {
        const block = container.closest<HTMLElement>("[data-node-id]");
        if (!container.classList.contains("my-protyle-attr--av--list")) {
            this.listSpaceObserver.unobserve(container);
            block?.style.removeProperty("--db-attr-list-space");
            block?.style.removeProperty("--db-attr-block-height");
            return;
        }
        this.listSpaceObserver.observe(container);
        const metrics = this.listMetrics.get(container);
        if (measure || !metrics) {
            const fieldNameWidth = this.syncListFieldNameWidth(container);
            const height = container.offsetHeight;
            const contentHeight = container.classList.contains("my-protyle-attr--av--list-below")
                ? this.measureListBlockContentHeight(container)
                : undefined;
            this.listMetrics.set(container, { height, fieldNameWidth, contentHeight });
            this.applyListSpace(container, height, contentHeight);
        } else {
            if (metrics.fieldNameWidth > 0) {
                container.style.setProperty("--db-attr-field-name-width", `${Math.ceil(metrics.fieldNameWidth)}px`);
            } else {
                container.style.removeProperty("--db-attr-field-name-width");
            }
            this.applyListSpace(container, metrics.height, metrics.contentHeight);
        }
    }

    private syncLayoutClasses(parent: HTMLElement, attributeContainer: HTMLElement, useList: boolean, layout: DisplayConfig["layout"]): void {
        parent.classList.toggle("db-display--list-above", useList && layout === "above");
        parent.classList.toggle("db-display--list-below", useList && layout === "below");
        attributeContainer.classList.toggle("db-display--has-list", useList);
    }

    /** 将同一列表中的字段名统一为最长标签宽度，使所有字段值从同一列开始显示。 */
    private syncListFieldNameWidth(container: HTMLElement): number {
        const widths = [...container.querySelectorAll<HTMLElement>(".db-display__field-name-label")]
            .map(name => Math.max(name.offsetWidth, name.scrollWidth));
        const width = Math.max(0, ...widths);
        if (width > 0) {
            container.style.setProperty("--db-attr-field-name-width", `${Math.ceil(width)}px`);
        } else {
            container.style.removeProperty("--db-attr-field-name-width");
        }
        return width;
    }

    private measureListBlockContentHeight(container: HTMLElement): number | undefined {
        const block = container.closest<HTMLElement>("[data-node-id]");
        if (!block) return undefined;
        // 下方模式的 offsetHeight 包含上一次列表预留的高度；扣除它后得到块原本的高度。
        // 首次应用时 CSS 使用默认 18px，因此同时扣除默认间距 10px。
        const previousHeight = Number.parseFloat(block.style.getPropertyValue("--db-attr-list-space"));
        const previousReserved = Number.isFinite(previousHeight) ? previousHeight + 10 : 28;
        return Math.max(0, block.offsetHeight - previousReserved);
    }

    private applyListSpace(container: HTMLElement, height: number, contentHeight?: number): void {
        const value = `${Math.ceil(height)}px`;
        const block = container.closest<HTMLElement>("[data-node-id]");
        if (block) {
            if (container.classList.contains("my-protyle-attr--av--list-above")) {
                block.style.setProperty("--db-attr-list-space", value);
                block.style.removeProperty("--db-attr-block-height");
            } else {
                if (contentHeight !== undefined) {
                    block.style.setProperty("--db-attr-block-height", `${Math.ceil(contentHeight)}px`);
                }
                block.style.setProperty("--db-attr-list-space", value);
            }
        }

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
        group.className = `db-display__asset-group${context.config.showFieldNames ? " db-display__asset-group--has-field-name" : ""}`;
        if (context.config.showFieldNames) group.appendChild(this.createFieldName(items[0].keyName, items[0], context.config));
        const values = document.createElement("span");
        values.className = "db-display__group-values";
        items.forEach(item => values.appendChild(this.createAssetItem(item, context, false)));
        group.appendChild(values);
        return group;
    }

    private createRelationGroup(items: DisplayItem[], context: RenderContext): HTMLElement {
        const group = document.createElement("span");
        group.className = `db-display__relation-group${context.config.showFieldNames ? " db-display__relation-group--has-field-name" : ""}`;
        if (context.config.showFieldNames) group.appendChild(this.createFieldName(items[0].keyName, items[0], context.config));
        const values = document.createElement("span");
        values.className = "db-display__group-values";
        items.forEach(item => values.appendChild(this.createRelationChip(item, context)));

        if (context.canInlineEdit && isInlineEditableField("relation")) {
            const edit = createIconButton("iconEdit", t("common.edit"), "db-display__relation-edit");
            edit.addEventListener("click", event => {
                event.stopPropagation();
                context.onEdit(items[0], edit);
            });
            values.appendChild(edit);
        }
        group.appendChild(values);
        return group;
    }

    private createRelationChip(item: DisplayItem, context: RenderContext): HTMLElement {
        if (item.navigation?.kind === "block") return this.createNavigationChip(item, context, false);
        return this.createReadonlyChip(item, context, false);
    }

    private createItem(item: DisplayItem, context: RenderContext): HTMLElement {
        if (item.type === "mAsset" && item.asset) return this.createAssetItem(item, context);
        if (item.type === "rollup") return this.createRollupChip(item, context);
        if (item.navigation?.kind === "block") return this.createNavigationChip(item, context, true);
        if (item.keyType === "url" && Boolean(item.rawValue)) return this.createUrlChip(item, context);
        return this.createEditableOrReadonlyChip(item, context);
    }

    private createNavigationChip(item: DisplayItem, context: RenderContext, includeFieldName: boolean): HTMLButtonElement {
        const element = document.createElement("button");
        element.type = "button";
        element.className = "db-display__chip db-display__chip--navigation";
        const plainText = this.populateChip(element, item, context, includeFieldName);
        // relation/block 字段显示目标块图标
        if (item.icon) {
            element.querySelector<HTMLElement>(".db-display__value")?.insertAdjacentElement("beforebegin", this.createBlockIcon(item.icon));
        }
        const target = item.navigation!;
        const label = target.kind === "block" ? t("common.openBlock") : t("common.openFile");
        element.title = label;
        element.setAttribute("aria-label", this.chipLabel(item, plainText, includeFieldName));
        this.applyColors(element, item, context.config);
        element.addEventListener("click", event => {
            event.stopPropagation();
            context.onNavigate(target, event);
        });
        return element;
    }

    private createRollupChip(item: DisplayItem, context: RenderContext): HTMLElement {
        const canShowSources = Boolean(item.sources?.length);
        const element = document.createElement(canShowSources ? "button" : "span");
        element.className = "db-display__chip db-display__chip--rollup";
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
        element.className = "db-display__chip db-display__asset db-display__asset--file";
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
        if (includeFieldName && context.config.showFieldNames) wrapper.appendChild(this.createFieldName(item.keyName, item, context.config));

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
        element.className = "db-display__chip";
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
        element.className = "db-display__chip";
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
        element.addEventListener(context.config.editTrigger, event => {
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
        element.className = "db-display__chip db-display__chip--readonly";
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
        if (isTemplate) {
            // 模板值已由 renderTemplateValue 填充
        } else if (item.segments?.length) {
            this.renderSegments(value, item.segments, context.config.maxDisplayLength);
        } else {
            value.textContent = truncateDisplayText(plainText, context.config.maxDisplayLength);
        }
        if (includeFieldName && context.config.showFieldNames) {
            element.append(this.createFieldName(item.keyName, item, context.config), value);
        } else {
            element.appendChild(value);
        }
        element.dataset.fieldType = item.type;
        value.dataset.dbTruncated = plainText.length > context.config.maxDisplayLength ? "1" : "0";
        element.classList.toggle("ariaLabel", value.dataset.dbTruncated === "1");
        this.enableTruncatedTooltip(element, value);
        this.enableContextMenu(element, item, context);
        return plainText;
    }

    /**
     * 多选字段分段渲染：每个选项一个色块（背景/文字色来自思源调色板，
     * 与数据库单元格内的原生选项样式一致），总长超出上限时逐段截断。
     */
    private renderSegments(value: HTMLElement, segments: DisplaySegment[], maxLength: number): void {
        const totalLength = segments.reduce((sum, segment) => sum + segment.text.length, 0);
        const full = totalLength <= maxLength;
        let remaining = maxLength;
        segments.forEach(segment => {
            if (!full && remaining <= 0) return;
            const chip = document.createElement("span");
            chip.className = "db-display__option-chip";
            if (/^[1-9]$|^1[0-4]$/.test(segment.color || "")) {
                chip.style.backgroundColor = `var(--b3-font-background${segment.color})`;
                chip.style.color = `var(--b3-font-color${segment.color})`;
            }
            const text = document.createElement("span");
            if (full) {
                text.textContent = segment.text;
            } else {
                if (segment.text.length > remaining) {
                    text.textContent = `${segment.text.slice(0, Math.max(0, remaining - 1))}…`;
                    remaining = 0;
                } else {
                    text.textContent = segment.text;
                    remaining -= segment.text.length;
                }
            }
            chip.appendChild(text);
            value.appendChild(chip);
        });
    }

    /**
     * 目标块图标：unicode 码点串（如 "1f600"）或资源路径。
     */
    private createBlockIcon(icon: string): HTMLElement {
        if (icon.includes("/")) {
            const image = document.createElement("img");
            image.className = "db-display__block-icon";
            image.alt = "";
            image.src = encodeURI(icon);
            image.addEventListener("error", () => image.remove(), { once: true });
            return image;
        }
        const span = document.createElement("span");
        span.className = "db-display__block-icon db-display__block-icon--emoji";
        span.textContent = emojiFromUnicode(icon);
        return span;
    }

    private createFieldName(keyName: string, item: DisplayItem, config: DisplayConfig): HTMLSpanElement {
        const cell = document.createElement("span");
        cell.className = "db-display__field-name";
        const label = document.createElement("span");
        label.className = "db-display__field-name-label";
        label.textContent = `${keyName}: `;
        // 背景色应用在文字内层：列表模式将外层扩展为统一列宽时，空白填充区不显示背景。
        this.applyFieldNameColors(label, item, config);
        cell.appendChild(label);
        return cell;
    }

    /**
     * 字段名样式：背景与所在 chip 一致（含按值覆盖的背景），颜色恒为字段色。
     */
    private applyFieldNameColors(element: HTMLElement, item: DisplayItem, config: DisplayConfig): void {
        const valueRule = config.valueColors[item.text];
        const rule = typeof valueRule === "string" ? { color: valueRule } : valueRule;
        const color = config.fieldColors[item.type];
        const background = rule?.bg || config.fieldBackgrounds[item.type];
        if (isSafeColor(color)) element.style.color = color;
        if (isSafeColor(background)) element.style.setProperty("--db-chip-background", background);
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

    /** Checks CSS clipping only when a user actually hovers or focuses a chip. */
    private enableTruncatedTooltip(element: HTMLElement, value: HTMLElement): void {
        const update = (): void => {
            const truncated = value.dataset.dbTruncated === "1"
                || value.scrollWidth > value.clientWidth + 1
                || value.scrollHeight > value.clientHeight + 1;
            element.classList.toggle("ariaLabel", truncated);
        };
        element.addEventListener("pointerover", update);
        element.addEventListener("focusin", update);
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
            listFontSize: config.listFontSize,
            listMultiColumn: config.listMultiColumn,
            editTrigger: config.editTrigger,
            layout: config.layout,
            colors: config.fieldColors,
            backgrounds: config.fieldBackgrounds,
            values: config.valueColors
        };
    }
}

function normalizeDisplayText(value: string): string {
    return value.replace(/\s+/g, " ").trim();
}

/**
 * 思源块图标的 unicode 码点串（如 "1f600" 或 "1f3c3-1f3fb"）转 emoji 文本；
 * 解析失败时原样返回。
 */
function emojiFromUnicode(unicode: string): string {
    try {
        const result = unicode.split("-").map(part => String.fromCodePoint(parseInt(part.length < 5 ? `0${part}` : part, 16))).join("");
        return result.includes("\uFFFD") ? unicode : result;
    } catch {
        return unicode;
    }
}

function truncateDisplayText(value: string, maxLength: number): string {
    return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}
