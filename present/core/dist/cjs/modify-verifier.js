"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SLIMPPT_MODIFY_VERIFIER_ALG = void 0;
exports.encodeProtectionInModifyVerifier = encodeProtectionInModifyVerifier;
exports.decodeProtectionFromModifyVerifier = decodeProtectionFromModifyVerifier;
exports.syncModifyVerifierWithProtection = syncModifyVerifierWithProtection;
exports.applyModifyVerifierProtection = applyModifyVerifierProtection;
exports.cloneModifyVerifier = cloneModifyVerifier;
const protection_1 = require("./protection");
const office_password_1 = require("./office-password");
/** SlimPPT-encoded protection payload in `modifyVerifier/@algorithmName`. */
exports.SLIMPPT_MODIFY_VERIFIER_ALG = "SlimPPT-Protection-v1";
function deepCloneModifyVerifier(mv) {
    return mv ? { ...mv } : undefined;
}
/** Encode SlimPPT protection into OOXML `modifyVerifier` for presentation.xml round-trip. */
function encodeProtectionInModifyVerifier(p) {
    const payload = { v: 1, kind: p.kind, setAt: p.setAt };
    if (p.passwordHash)
        payload.ph = p.passwordHash;
    return {
        algorithmName: exports.SLIMPPT_MODIFY_VERIFIER_ALG,
        hashValue: JSON.stringify(payload),
        spinValue: 0,
    };
}
/** Decode SlimPPT or infer Office-native protection from `modifyVerifier`. */
function decodeProtectionFromModifyVerifier(mv) {
    if (!mv)
        return undefined;
    if (mv.algorithmName === exports.SLIMPPT_MODIFY_VERIFIER_ALG && mv.hashValue) {
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
    if ((0, office_password_1.isOfficePasswordVerifier)(mv)) {
        return { kind: "restricted", setAt: 0 };
    }
    return undefined;
}
function syncModifyVerifierWithProtection(pres, protection, officeModifyVerifier) {
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
function applyModifyVerifierProtection(pres) {
    if ((0, protection_1.getPresentationProtection)(pres))
        return;
    const fromMv = decodeProtectionFromModifyVerifier(pres.modifyVerifier);
    if (fromMv)
        (0, protection_1.setPresentationProtectionMeta)(pres, fromMv);
}
function cloneModifyVerifier(mv) {
    return deepCloneModifyVerifier(mv);
}
