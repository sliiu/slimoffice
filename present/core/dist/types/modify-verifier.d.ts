import type { ModifyVerifier, Presentation } from "./slide.js";
import type { PresentationProtection } from "./protection.js";
/** Parchon-encoded protection payload in `modifyVerifier/@algorithmName`. 新文件写 Parchon，读取仍认 Pavera 与 SlimPPT 旧值。 */
export declare const SLIMPPT_MODIFY_VERIFIER_ALG = "Parchon-Protection-v1";
export declare const SLIMPPT_MODIFY_VERIFIER_ALG_PAVERA = "Pavera-Protection-v1";
export declare const SLIMPPT_MODIFY_VERIFIER_ALG_LEGACY = "SlimPPT-Protection-v1";
/** Encode Parchon protection into OOXML `modifyVerifier` for presentation.xml round-trip. */
export declare function encodeProtectionInModifyVerifier(p: PresentationProtection): ModifyVerifier;
/** Decode Parchon or infer Office-native protection from `modifyVerifier`. */
export declare function decodeProtectionFromModifyVerifier(mv: ModifyVerifier | undefined): PresentationProtection | undefined;
export declare function syncModifyVerifierWithProtection(pres: Presentation, protection: PresentationProtection | undefined, officeModifyVerifier?: ModifyVerifier): void;
/** Apply protection inferred from `pres.modifyVerifier` when tags sidecar is absent. */
export declare function applyModifyVerifierProtection(pres: Presentation): void;
export declare function cloneModifyVerifier(mv: ModifyVerifier | undefined): ModifyVerifier | undefined;
