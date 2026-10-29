import type { ModifyVerifier } from "./slide";

const SLIMPPT_MODIFY_VERIFIER_ALG = "SlimPPT-Protection-v1";

/** MS-OFFCRYPTO / Office 2010+ `cryptAlgorithmSid` → Web Crypto digest name. */
const CRYPT_SID_TO_DIGEST: Record<number, string> = {
  2: "MD2",
  3: "MD4",
  4: "MD5",
  5: "SHA-1",
  8: "SHA-256",
  9: "SHA-384",
  10: "SHA-512",
  14: "SHA-512",
  15: "SHA-384",
  16: "SHA-256",
  17: "SHA-1",
};

const WEB_CRYPTO_DIGESTS = new Set(["SHA-1", "SHA-256", "SHA-384", "SHA-512", "MD5"]);

function normalizeAlgorithmName(name: string): string | undefined {
  const u = name.trim().toUpperCase().replace(/_/g, "-");
  if (u === "SHA1") return "SHA-1";
  if (u === "SHA256") return "SHA-256";
  if (u === "SHA384") return "SHA-384";
  if (u === "SHA512") return "SHA-512";
  if (WEB_CRYPTO_DIGESTS.has(u)) return u;
  return undefined;
}

export function resolveOfficeHashAlgorithm(mv: ModifyVerifier): string | undefined {
  if (mv.algorithmName) {
    const n = normalizeAlgorithmName(mv.algorithmName);
    if (n) return n;
  }
  if (mv.cryptAlgorithmSid !== undefined) {
    return CRYPT_SID_TO_DIGEST[mv.cryptAlgorithmSid];
  }
  // Office 2013+ modifyVerifier without legacy algorithmName — default SHA-512.
  if (mv.hashData && mv.saltData) return "SHA-512";
  return undefined;
}

export function officeModifyVerifierSaltB64(mv: ModifyVerifier): string | undefined {
  return mv.saltData ?? mv.saltValue;
}

export function officeModifyVerifierHashB64(mv: ModifyVerifier): string | undefined {
  return mv.hashData ?? mv.hashValue;
}

export function officeModifyVerifierSpinCount(mv: ModifyVerifier): number {
  const n = mv.spinCount ?? mv.spinValue;
  return typeof n === "number" && Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

/** True when `modifyVerifier` carries an Office-native password hash (not SlimPPT JSON). */
export function isOfficePasswordVerifier(mv: ModifyVerifier | undefined): boolean {
  if (!mv) return false;
  if (mv.algorithmName === SLIMPPT_MODIFY_VERIFIER_ALG) return false;
  const hash = officeModifyVerifierHashB64(mv);
  const salt = officeModifyVerifierSaltB64(mv);
  return Boolean(hash && salt);
}

export interface OfficeModifyVerifierSummary {
  algorithm: string;
  spinCount: number;
}

/** Human-readable Office `modifyVerifier` fields for Ribbon / protect dialog. */
export function summarizeOfficeModifyVerifier(
  mv: ModifyVerifier | undefined,
): OfficeModifyVerifierSummary | undefined {
  if (!isOfficePasswordVerifier(mv)) return undefined;
  const algorithm = resolveOfficeHashAlgorithm(mv!) ?? "unknown";
  return { algorithm, spinCount: officeModifyVerifierSpinCount(mv!) };
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  let len = 0;
  for (const p of parts) len += p.length;
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** ECMA-376 password → UTF-16LE, max 255 UTF-16 code units. */
export function officePasswordUtf16Le(password: string): Uint8Array {
  const truncated = [...password].slice(0, 255).join("");
  const out = new Uint8Array(truncated.length * 2);
  for (let i = 0; i < truncated.length; i++) {
    const c = truncated.charCodeAt(i);
    out[i * 2] = c & 0xff;
    out[i * 2 + 1] = c >> 8;
  }
  return out;
}

export function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/\s/g, "");
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(clean, "base64"));
  }
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

async function digestBytes(algorithm: string, data: Uint8Array): Promise<Uint8Array> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle?.digest) throw new Error("Web Crypto digest unavailable");
  const buf = await subtle.digest(algorithm, data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer);
  return new Uint8Array(buf);
}

/**
 * Office Open XML password verifier (documentProtection / modifyVerifier).
 * H0 = H(salt + password_utf16le); Hn = H(Hn-1 + iterator_le32) for iterator in 0..spinCount-1.
 */
export async function computeOfficePasswordHash(
  password: string,
  salt: Uint8Array,
  spinCount: number,
  algorithm: string,
): Promise<Uint8Array> {
  const alg = normalizeAlgorithmName(algorithm) ?? algorithm;
  if (!WEB_CRYPTO_DIGESTS.has(alg)) {
    throw new Error(`Unsupported Office hash algorithm: ${algorithm}`);
  }
  const pw = officePasswordUtf16Le(password);
  let h = await digestBytes(alg, concatBytes(salt, pw));
  for (let i = 0; i < spinCount; i++) {
    const iter = new Uint8Array(4);
    new DataView(iter.buffer).setUint32(0, i, true);
    h = await digestBytes(alg, concatBytes(h, iter));
  }
  return h;
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

export async function verifyOfficeModifyVerifierPassword(
  mv: ModifyVerifier,
  password: string,
): Promise<boolean> {
  if (!isOfficePasswordVerifier(mv)) return false;
  const algorithm = resolveOfficeHashAlgorithm(mv);
  const saltB64 = officeModifyVerifierSaltB64(mv);
  const hashB64 = officeModifyVerifierHashB64(mv);
  if (!algorithm || !saltB64 || !hashB64) return false;
  try {
    const salt = base64ToBytes(saltB64);
    const expected = base64ToBytes(hashB64);
    const actual = await computeOfficePasswordHash(password, salt, officeModifyVerifierSpinCount(mv), algorithm);
    return constantTimeEqual(actual, expected);
  } catch {
    return false;
  }
}

/** Office 2013+ default spin count for modifyVerifier / sheetProtection password hashing. */
export const OFFICE_MODIFY_VERIFIER_SPIN_COUNT = 100000;

function randomSalt(bytes = 16): Uint8Array {
  const out = new Uint8Array(bytes);
  const cryptoObj = globalThis.crypto;
  if (typeof cryptoObj?.getRandomValues === "function") {
    cryptoObj.getRandomValues(out);
    return out;
  }
  for (let i = 0; i < bytes; i++) out[i] = Math.floor(Math.random() * 256);
  return out;
}

/**
 * Build Office-native `<p:modifyVerifier>` fields from a plaintext password.
 * PowerPoint / Excel use this format (hashData + saltData + spinCount + crypt* attrs).
 */
export async function buildOfficeModifyVerifier(password: string): Promise<ModifyVerifier> {
  const salt = randomSalt(16);
  const hash = await computeOfficePasswordHash(password, salt, OFFICE_MODIFY_VERIFIER_SPIN_COUNT, "SHA-512");
  return {
    cryptProviderType: "rsaAES",
    cryptAlgorithmClass: "hash",
    cryptAlgorithmType: "typeAny",
    cryptAlgorithmSid: 14,
    spinCount: OFFICE_MODIFY_VERIFIER_SPIN_COUNT,
    saltData: bytesToBase64(salt),
    hashData: bytesToBase64(hash),
  };
}
