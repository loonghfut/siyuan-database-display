export type { ProFeature, ProFeatureDefinition } from "./features";

export interface LicensePayload {
    version: 1;
    userId: string;
    edition: "pro";
}

export interface SignedLicense {
    payload: LicensePayload;
    signature: string;
}

export type LicenseStatus =
    | { valid: true; userId: string }
    | { valid: false; reason: "missing" | "invalid" | "wrong-user" | "unconfigured" | "unsupported" };
