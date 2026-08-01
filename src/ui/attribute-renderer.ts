import { DisplayConfig, isSafeColor } from "@/config/display-config";
import { DisplayItem } from "@/core/types";

export interface RenderContext {
    blockId: string;
    config: DisplayConfig;
    canInlineEdit: boolean;
    onEdit: (item: DisplayItem, element: HTMLElement) => void;
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
        if (this.signatures.get(attributeContainer) === signature) return;
        this.signatures.set(attributeContainer, signature);

        const existing = attributeContainer.querySelector<HTMLElement>(":scope > .my-protyle-attr--av");
        const container = existing || document.createElement("div");
        container.className = "my-protyle-attr--av";
        container.replaceChildren(...items.map(item => this.createItem(item, context)));
        if (!existing) attributeContainer.insertBefore(container, attributeContainer.firstChild);
    }

    clear(parent: HTMLElement): void {
        const attributeContainer = [...parent.children].find(child => child.classList.contains("protyle-attr")) as HTMLElement | undefined;
        attributeContainer?.querySelector(":scope > .my-protyle-attr--av")?.remove();
        if (attributeContainer) this.signatures.delete(attributeContainer);
    }

    private createItem(item: DisplayItem, context: RenderContext): HTMLElement {
        const isLink = item.keyType === "url" && Boolean(item.rawValue);
        const editable = context.canInlineEdit && item.keyType !== "created" && item.keyType !== "updated";
        const element = document.createElement(isLink ? "a" : editable ? "button" : "span");
        element.className = "db-display__chip ariaLabel";
        if (element instanceof HTMLButtonElement) element.type = "button";
        const normalizedText = item.text.replace(/\s+/g, " ").trim();
        const text = normalizedText.length > context.config.maxDisplayLength
            ? `${normalizedText.slice(0, context.config.maxDisplayLength)}...`
            : normalizedText;
        const value = document.createElement("span");
        value.className = "db-display__value";
        value.textContent = text;
        if (context.config.showFieldNames) {
            const name = document.createElement("span");
            name.className = "db-display__field-name";
            name.textContent = `${item.keyName}: `;
            element.append(name, value);
        } else {
            element.appendChild(value);
        }
        element.setAttribute("aria-label", context.config.showFieldNames ? `${item.keyName}: ${item.text}` : item.text);
        element.dataset.fieldType = item.type;
        this.applyColors(element, item, context.config);

        if (element instanceof HTMLAnchorElement) {
            element.href = String(item.rawValue || "");
            element.target = "_blank";
            element.rel = "noopener noreferrer";
            if (editable) {
                element.addEventListener("contextmenu", event => {
                    event.preventDefault();
                    context.onEdit(item, element);
                });
            }
            return element;
        }
        if (!editable) {
            element.classList.add("db-display__chip--readonly");
            return element;
        }
        element.addEventListener("click", event => {
            event.stopPropagation();
            context.onEdit(item, element);
        });
        return element;
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
