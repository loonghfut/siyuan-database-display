import type { FieldType } from "@/core/types";

/**
 * The single source of truth for Pro-gated capabilities.
 *
 * A feature without `fieldTypes` can still be used as a general capability
 * flag (for example, `inline-edit`). Field types listed here are hidden when
 * the corresponding feature is unavailable.
 */
export interface ProFeatureDefinition {
    fieldTypes?: readonly FieldType[];
}

function defineProFeatures<T extends Record<string, ProFeatureDefinition>>(features: T): T {
    return features;
}

export const PRO_FEATURES = defineProFeatures({
    "inline-edit": {},
    relation: { fieldTypes: ["relation"] }
} as const);

export type ProFeature = keyof typeof PRO_FEATURES;
export const PRO_FEATURE_KEYS = Object.freeze(Object.keys(PRO_FEATURES) as ProFeature[]);

export function isProFeature(value: string): value is ProFeature {
    return Object.prototype.hasOwnProperty.call(PRO_FEATURES, value);
}

export function requiredFeaturesForField(fieldType: FieldType): ProFeature[] {
    return PRO_FEATURE_KEYS.filter(feature =>
        (PRO_FEATURES[feature] as ProFeatureDefinition).fieldTypes?.includes(fieldType) === true
    );
}
