import { getPresentationProtection, setPresentationProtectionMeta } from "./protection.js";
import { isOfficePasswordVerifier } from "./office-password.js";
/** SlimPPT-encoded protection payload in `modifyVerifier/@algorithmName`. */
export const SLIMPPT_MODIFY_VERIFIER_ALG = "SlimPPT-Protection-v1";
function deepCloneModifyVerifier(mv) {
    return mv ? { ...mv } : undefined;
}
/** Encode SlimPPT protection into OOXML `modifyVerifier` for presentation.xml round-trip. */
export function encodeProtectionInModifyVerifier(p) {
    const payload = { v: 1, kind: p.kind, setAt: p.setAt };
    if (p.passwordHash)
        payload.ph = p.passwordHash;
    return {
        algorithmName: SLIMPPT_MODIFY_VERIFIER_ALG,
        hashValue: JSON.stringify(payload),
        spinValue: 0,
    };
}
/** Decode SlimPPT or infer Office-native protection from `modifyVerifier`. */
export function decodeProtectionFromModifyVerifier(mv) {
    if (!mv)
        return undefined;
    if (mv.algorithmName === SLIMPPT_MODIFY_VERIFIER_ALG && mv.hashValue) {
        try {
            const o = JSON.parse(mv.hashValue);
            if (o.v !== 1)
                return undefined;
            if (o.kind !== "final" && o.kind !== "restricted")
                return undefined;
            if (typeof o.setAt !== "number")
                return undefined;
            return {
                kind: o.kind,
                setAt: o.setAt,
                passwordHash: typeof o.ph === "string" ? o.ph : undefined,
            };
        }
        catch {
            return undefined;
        }
    }
    // Office-native write protection — password verified via hashData/saltData/spinCount.
    if (isOfficePasswordVerifier(mv)) {
        return { kind: "restricted", setAt: 0 };
    }
    return undefined;
}
export function syncModifyVerifierWithProtection(pres, protection, officeModifyVerifier) {
    if (!protection) {
        pres.modifyVerifier = undefined;
        return;
    }
    // Restricted + password → Office-native hashData/saltData (PowerPoint 可识别解锁)。
    if (officeModifyVerifier) {
        pres.modifyVerifier = { ...officeModifyVerifier };
        return;
    }
    pres.modifyVerifier = encodeProtectionInModifyVerifier(protection);
}
/** Apply protection inferred from `pres.modifyVerifier` when tags sidecar is absent. */
export function applyModifyVerifierProtection(pres) {
    if (getPresentationProtection(pres))
        return;
    const fromMv = decodeProtectionFromModifyVerifier(pres.modifyVerifier);
    if (fromMv)
        setPresentationProtectionMeta(pres, fromMv);
}
export function cloneModifyVerifier(mv) {
    return deepCloneModifyVerifier(mv);
}
