import type { ModifyVerifier, Presentation } from "./slide.js";
import type { PresentationProtection } from "./protection.js";
/** SlimPPT-encoded protection payload in `modifyVerifier/@algorithmName`. */
export declare const SLIMPPT_MODIFY_VERIFIER_ALG = "SlimPPT-Protection-v1";
/** Encode SlimPPT protection into OOXML `modifyVerifier` for presentation.xml round-trip. */
export declare function encodeProtectionInModifyVerifier(p: PresentationProtection): ModifyVerifier;
/** Decode SlimPPT or infer Office-native protection from `modifyVerifier`. */
export declare function decodeProtectionFromModifyVerifier(mv: ModifyVerifier | undefined): PresentationProtection | undefined;
export declare function syncModifyVerifierWithProtection(pres: Presentation, protection: PresentationProtection | undefined, officeModifyVerifier?: ModifyVerifier): void;
/** Apply protection inferred from `pres.modifyVerifier` when tags sidecar is absent. */
export declare function applyModifyVerifierProtection(pres: Presentation): void;
export declare function cloneModifyVerifier(mv: ModifyVerifier | undefined): ModifyVerifier | undefined;
