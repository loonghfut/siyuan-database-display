import { I18nDictionary } from "@/i18n";

export type SettingsPanelText = I18nDictionary["settings"]["panel"];
export type AddPanel = (key: string, value: string, title: string, description: string, render: (value: string, commit: (value: string) => void) => HTMLElement) => void;
