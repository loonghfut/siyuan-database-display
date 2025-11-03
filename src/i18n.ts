import enUS from "../public/i18n/en_US.json";

export type I18nDictionary = typeof enUS;

let currentI18n: I18nDictionary = enUS;

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepMerge<T extends Record<string, unknown>>(target: T, source?: Record<string, unknown>): T {
    if (!source) {
        return target;
    }
    const output: Record<string, unknown> = { ...target };
    for (const [key, value] of Object.entries(source)) {
        const existing = output[key];
        if (isPlainObject(existing) && isPlainObject(value)) {
            output[key] = deepMerge(existing as Record<string, unknown>, value);
        } else {
            output[key] = value;
        }
    }
    return output as T;
}

export function setI18n(dict?: Record<string, unknown>): void {
    currentI18n = deepMerge(enUS, dict as Record<string, unknown> | undefined);
}

export function getI18n(): I18nDictionary {
    return currentI18n;
}

export function t(path: string, vars?: Record<string, string | number>, fallback?: string): string {
    const segments = path.split(".");
    let result: unknown = currentI18n;
    for (const segment of segments) {
        if (isPlainObject(result) && segment in result) {
            result = result[segment];
        } else {
            result = undefined;
            break;
        }
    }
    if (typeof result !== "string") {
        return fallback ?? path;
    }
    if (!vars) {
        return result;
    }
    return result.replace(/\$\{(.*?)\}/g, (_, key: string) => {
        const trimmed = key.trim();
        const value = vars[trimmed];
        return value === undefined ? "" : String(value);
    });
}
