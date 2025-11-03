export function toErrorMessage(error: unknown): string {
    if (error instanceof Error && typeof error.message === "string") {
        return error.message;
    }
    if (typeof error === "string") {
        return error;
    }
    if (error && typeof error === "object") {
        const maybeMessage = (error as { message?: unknown }).message;
        if (typeof maybeMessage === "string") {
            return maybeMessage;
        }
    }
    try {
        return JSON.stringify(error);
    } catch {
        return String(error ?? "");
    }
}
