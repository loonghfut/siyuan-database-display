import { SettingUtils } from "@/libs/setting-utils";
import { t } from "@/i18n";

export interface SettingsCategory {
    key: string;
    title: string;
}

/** Adds in-dialog anchors to a plugin settings dialog without changing SiYuan's Setting API. */
export function installSettingsHeaderNavigation(settings: SettingUtils, categories: SettingsCategory[]): void {
    const setting = settings.plugin.setting;
    const open = setting.open.bind(setting);

    setting.open = (name: string) => {
        open(name);
        const dialogElement = (setting as any).dialog?.element;//1
        if (dialogElement) mountNavigation(dialogElement, categories);
    };
}

function mountNavigation(dialogElement: HTMLElement, categories: SettingsCategory[]): void {
    const header = dialogElement.querySelector<HTMLElement>(".b3-dialog__header");
    const content = dialogElement.querySelector<HTMLElement>(".b3-dialog__content");
    const items = Array.from(content?.querySelectorAll<HTMLElement>(".config-item") ?? []);
    if (!header || !content || !items.length || header.querySelector(".db-settings-nav")) return;

    const targets = categories
        .map(category => ({ ...category, element: items.find(item => item.querySelector(".config-name")?.textContent === category.title) }))
        .filter((category): category is SettingsCategory & { element: HTMLElement } => Boolean(category.element));
    if (!targets.length) return;

    const navigation = document.createElement("nav");
    navigation.className = "db-settings-nav";
    navigation.setAttribute("aria-label", t("settings.navigation"));
    header.append(navigation);
    header.classList.add("db-settings-header--has-nav");

    const buttons = new Map<string, HTMLButtonElement>();
    const select = (key: string) => {
        buttons.forEach((button, buttonKey) => {
            const active = buttonKey === key;
            button.classList.toggle("db-settings-nav__item--active", active);
            button.toggleAttribute("aria-current", active);
        });
    };

    for (const target of targets) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "db-settings-nav__item";
        button.textContent = target.title;
        button.addEventListener("pointerdown", event => event.stopPropagation());
        button.addEventListener("click", event => {
            event.preventDefault();
            event.stopPropagation();
            const top = target.element.getBoundingClientRect().top - content.getBoundingClientRect().top + content.scrollTop - 8;
            content.scrollTo({ top, behavior: "smooth" });
            select(target.key);
        });
        buttons.set(target.key, button);
        navigation.append(button);
    }

    let frame = 0;
    const updateActiveCategory = () => {
        frame = 0;
        const contentTop = content.getBoundingClientRect().top;
        const active = targets.reduce((current, target) =>
            target.element.getBoundingClientRect().top - contentTop <= 24 ? target : current, targets[0]);
        select(active.key);
    };
    content.addEventListener("scroll", () => {
        if (!frame) frame = requestAnimationFrame(updateActiveCategory);
    }, { passive: true });
    updateActiveCategory();
}
