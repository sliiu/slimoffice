import type { ModifyVerifier, Presentation } from "./slide";
import type { PresentationProtection } from "./protection";
/** Pavera-encoded protection payload in `modifyVerifier/@algorithmName`. 新文件写 Pavera，读取仍认 2026-11-27 之前写入的 SlimPPT。 */
export declare const SLIMPPT_MODIFY_VERIFIER_ALG = "Pavera-Protection-v1";
export declare const SLIMPPT_MODIFY_VERIFIER_ALG_LEGACY = "SlimPPT-Protection-v1";
/** Encode Pavera protection into OOXML `modifyVerifier` for presentation.xml round-trip. */
export declare function encodeProtectionInModifyVerifier(p: PresentationProtection): ModifyVerifier;
/** Decode Pavera or infer Office-native protection from `modifyVerifier`. */
export declare function decodeProtectionFromModifyVerifier(mv: ModifyVerifier | undefined): PresentationProtection | undefined;
export declare function syncModifyVerifierWithProtection(pres: Presentation, protection: PresentationProtection | undefined, officeModifyVerifier?: ModifyVerifier): void;
/** Apply protection inferred from `pres.modifyVerifier` when tags sidecar is absent. */
export declare function applyModifyVerifierProtection(pres: Presentation): void;
export declare function cloneModifyVerifier(mv: ModifyVerifier | undefined): ModifyVerifier | undefined;
