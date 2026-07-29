import { DisplayConfig, isSafeColor } from "@/config/display-config";
import { DisplayItem } from "@/core/types";

export interface RenderContext {
    blockId: string;
    config: DisplayConfig;
    onEdit: (item: DisplayItem, element: HTMLElement) => void;
}

export class AttributeRenderer {
    private readonly signatures = new WeakMap<HTMLElement, string>();

    render(parent: HTMLElement, items: DisplayItem[], context: RenderContext): void {
        const attributeContainer = [...parent.children].find(child => child.classList.contains("protyle-attr")) as HTMLElement | undefined;
        if (!attributeContainer) return;
        const signature = JSON.stringify({ items, config: this.visualConfig(context.config) });
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
        const element = document.createElement(item.keyType === "url" && item.rawValue ? "a" : "button");
        element.className = "db-display__chip ariaLabel";
        if (element instanceof HTMLButtonElement) element.type = "button";
        const text = item.text.length > context.config.maxDisplayLength ? `${item.text.slice(0, context.config.maxDisplayLength)}...` : item.text;
        element.textContent = text;
        element.setAttribute("aria-label", item.text);
        element.dataset.fieldType = item.type;
        this.applyColors(element, item, context.config);

        if (item.keyType === "created" || item.keyType === "updated") {
            element.classList.add("db-display__chip--readonly");
            return element;
        }
        if (element instanceof HTMLAnchorElement) {
            element.href = String(item.rawValue || "");
            element.target = "_blank";
            element.rel = "noopener noreferrer";
            element.addEventListener("contextmenu", event => {
                event.preventDefault();
                context.onEdit(item, element);
            });
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
        if (isSafeColor(background)) element.style.backgroundColor = background;
    }

    private visualConfig(config: DisplayConfig): unknown {
        return {
            max: config.maxDisplayLength,
            colors: config.fieldColors,
            backgrounds: config.fieldBackgrounds,
            values: config.valueColors
        };
    }
}
