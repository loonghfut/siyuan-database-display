export const PRO_FEATURES = ["inline-edit"] as const;

export type ProFeature = typeof PRO_FEATURES[number];

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
