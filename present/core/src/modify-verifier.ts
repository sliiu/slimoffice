import type { ModifyVerifier, Presentation } from "./slide";
import type { PresentationProtection } from "./protection";
import { getPresentationProtection, setPresentationProtectionMeta } from "./protection";
import { isOfficePasswordVerifier } from "./office-password";

/** SlimPPT-encoded protection payload in `modifyVerifier/@algorithmName`. */
export const SLIMPPT_MODIFY_VERIFIER_ALG = "SlimPPT-Protection-v1";

interface SlimPptMvPayloadV1 {
  v: 1;
  kind: PresentationProtection["kind"];
  setAt: number;
  ph?: string;
}

function deepCloneModifyVerifier(mv: ModifyVerifier | undefined): ModifyVerifier | undefined {
  return mv ? { ...mv } : undefined;
}

/** Encode SlimPPT protection into OOXML `modifyVerifier` for presentation.xml round-trip. */
export function encodeProtectionInModifyVerifier(p: PresentationProtection): ModifyVerifier {
  const payload: SlimPptMvPayloadV1 = { v: 1, kind: p.kind, setAt: p.setAt };
  if (p.passwordHash) payload.ph = p.passwordHash;
  return {
    algorithmName: SLIMPPT_MODIFY_VERIFIER_ALG,
    hashValue: JSON.stringify(payload),
    spinValue: 0,
  };
}

/** Decode SlimPPT or infer Office-native protection from `modifyVerifier`. */
export function decodeProtectionFromModifyVerifier(
  mv: ModifyVerifier | undefined,
): PresentationProtection | undefined {
  if (!mv) return undefined;

  if (mv.algorithmName === SLIMPPT_MODIFY_VERIFIER_ALG && mv.hashValue) {
    try {
      const o = JSON.parse(mv.hashValue) as SlimPptMvPayloadV1;
      if (o.v !== 1) return undefined;
      if (o.kind !== "final" && o.kind !== "restricted") return undefined;
      if (typeof o.setAt !== "number") return undefined;
      return {
        kind: o.kind,
        setAt: o.setAt,
        passwordHash: typeof o.ph === "string" ? o.ph : undefined,
      };
    } catch {
      return undefined;
    }
  }

  // Office-native write protection — password verified via hashData/saltData/spinCount.
  if (isOfficePasswordVerifier(mv)) {
    return { kind: "restricted", setAt: 0 };
  }
  return undefined;
}

export function syncModifyVerifierWithProtection(
  pres: Presentation,
  protection: PresentationProtection | undefined,
  officeModifyVerifier?: ModifyVerifier,
): void {
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
export function applyModifyVerifierProtection(pres: Presentation): void {
  if (getPresentationProtection(pres)) return;
  const fromMv = decodeProtectionFromModifyVerifier(pres.modifyVerifier);
  if (fromMv) setPresentationProtectionMeta(pres, fromMv);
}

export function cloneModifyVerifier(mv: ModifyVerifier | undefined): ModifyVerifier | undefined {
  return deepCloneModifyVerifier(mv);
}
