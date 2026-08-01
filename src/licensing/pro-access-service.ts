import { ProFeature } from "./features";
import { LicenseService } from "./license-service";
import { TrialService } from "./trial-service";

/** Combines the permanent license and the temporary trial into one access check. */
export class ProAccessService {
    constructor(
        private readonly license: LicenseService,
        private readonly trial: TrialService
    ) {}

    isFeatureEnabled(feature: ProFeature): boolean {
        return this.license.hasFeature(feature) || this.trial.hasActiveTrial();
    }
}
