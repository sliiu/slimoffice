import type { ModifyVerifier } from "./slide.js";
export declare function resolveOfficeHashAlgorithm(mv: ModifyVerifier): string | undefined;
export declare function officeModifyVerifierSaltB64(mv: ModifyVerifier): string | undefined;
export declare function officeModifyVerifierHashB64(mv: ModifyVerifier): string | undefined;
export declare function officeModifyVerifierSpinCount(mv: ModifyVerifier): number;
/** True when `modifyVerifier` carries an Office-native password hash (not SlimPPT JSON). */
export declare function isOfficePasswordVerifier(mv: ModifyVerifier | undefined): boolean;
export interface OfficeModifyVerifierSummary {
    algorithm: string;
    spinCount: number;
}
/** Human-readable Office `modifyVerifier` fields for Ribbon / protect dialog. */
export declare function summarizeOfficeModifyVerifier(mv: ModifyVerifier | undefined): OfficeModifyVerifierSummary | undefined;
/** ECMA-376 password → UTF-16LE, max 255 UTF-16 code units. */
export declare function officePasswordUtf16Le(password: string): Uint8Array;
export declare function base64ToBytes(b64: string): Uint8Array;
export declare function bytesToBase64(bytes: Uint8Array): string;
/**
 * Office Open XML password verifier (documentProtection / modifyVerifier).
 * H0 = H(salt + password_utf16le); Hn = H(Hn-1 + iterator_le32) for iterator in 0..spinCount-1.
 */
export declare function computeOfficePasswordHash(password: string, salt: Uint8Array, spinCount: number, algorithm: string): Promise<Uint8Array>;
export declare function verifyOfficeModifyVerifierPassword(mv: ModifyVerifier, password: string): Promise<boolean>;
/** Office 2013+ default spin count for modifyVerifier / sheetProtection password hashing. */
export declare const OFFICE_MODIFY_VERIFIER_SPIN_COUNT = 100000;
/**
 * Build Office-native `<p:modifyVerifier>` fields from a plaintext password.
 * PowerPoint / Excel use this format (hashData + saltData + spinCount + crypt* attrs).
 */
export declare function buildOfficeModifyVerifier(password: string): Promise<ModifyVerifier>;
