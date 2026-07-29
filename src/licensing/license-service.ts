import { LicensePayload, LicenseStatus, ProFeature, SignedLicense } from "./types";

declare const __DATABASE_DISPLAY_PRO_PUBLIC_KEY__: string;

const ED25519_ALGORITHM = { name: "Ed25519" };

function currentUserId(): string {
    return typeof window === "undefined" ? "" : window.siyuan?.user?.userId?.trim() || "";
}

function toArrayBuffer(value: string): ArrayBuffer {
    const normalized = value.replace(/\s/g, "").replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
    return bytes.buffer;
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
    return toArrayBuffer(pem.replace(/-----(BEGIN|END) PUBLIC KEY-----/g, ""));
}

function canonicalPayload(payload: LicensePayload): ArrayBuffer {
    const bytes = new TextEncoder().encode(JSON.stringify({
        version: payload.version,
        userId: payload.userId,
        edition: payload.edition
    }));
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    return copy.buffer;
}

function parseLicense(value: unknown): SignedLicense | undefined {
    if (typeof value !== "string" || !value.trim()) return undefined;
    try {
        const raw = value.trim();
        const parts = raw.split(".");
        if (parts.length !== 3 || parts[0] !== "DBP1") return undefined;
        const parsed = {
            payload: JSON.parse(new TextDecoder().decode(toArrayBuffer(parts[1]))),
            signature: parts[2]
        } as Partial<SignedLicense>;
        if (!parsed.payload || parsed.payload.version !== 1 || parsed.payload.edition !== "pro" ||
            typeof parsed.payload.userId !== "string" || !parsed.payload.userId.trim() || typeof parsed.signature !== "string") return undefined;
        return parsed as SignedLicense;
    } catch {
        return undefined;
    }
}

export class LicenseService {
    private status: LicenseStatus = { valid: false, reason: "missing" };

    async refresh(rawLicense: unknown): Promise<LicenseStatus> {
        this.status = await this.verify(rawLicense, currentUserId());
        return this.status;
    }

    getStatus(): LicenseStatus {
        return this.status;
    }

    hasFeature(feature: ProFeature): boolean {
        return this.status.valid && feature === "inline-edit";
    }

    async verify(rawLicense: unknown, userId = currentUserId()): Promise<LicenseStatus> {
        const license = parseLicense(rawLicense);
        if (!license) return { valid: false, reason: "missing" };
        if (!userId || license.payload.userId !== userId) return { valid: false, reason: "wrong-user" };
        if (!__DATABASE_DISPLAY_PRO_PUBLIC_KEY__.trim()) return { valid: false, reason: "unconfigured" };
        if (!globalThis.crypto?.subtle) return { valid: false, reason: "unsupported" };
        try {
            const publicKey = await crypto.subtle.importKey(
                "spki",
                pemToArrayBuffer(__DATABASE_DISPLAY_PRO_PUBLIC_KEY__),
                ED25519_ALGORITHM,
                false,
                ["verify"]
            );
            const valid = await crypto.subtle.verify(
                ED25519_ALGORITHM,
                publicKey,
                toArrayBuffer(license.signature),
                canonicalPayload(license.payload)
            );
            return valid ? { valid: true, userId } : { valid: false, reason: "invalid" };
        } catch {
            return { valid: false, reason: "invalid" };
        }
    }
}
