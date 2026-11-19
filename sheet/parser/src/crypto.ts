import { inflateSync } from "fflate";

export class XlsxPasswordError extends Error {
  readonly code = "WRONG_PASSWORD" as const;
  constructor() {
    super("WRONG_PASSWORD");
    this.name = "XlsxPasswordError";
  }
}

/**
 * Decrypt an ECMA-376 Agile encrypted package when a password is given.
 * Returns the inner OOXML zip bytes. Throws WRONG_PASSWORD on failure.
 * Standard (RC4) encryption is rejected with ENCRYPTED_XLSX via the caller.
 */
export async function decryptAgile(bytes: Uint8Array, password: string): Promise<Uint8Array> {
  const ole = parseOle(bytes);
  const encryptionInfo = ole.get("EncryptionInfo") ?? ole.get("encryptioninfo");
  const encryptedPackage = ole.get("EncryptedPackage") ?? ole.get("encryptedpackage");
  if (!encryptionInfo || !encryptedPackage) throw new Error("ENCRYPTED_XLSX");
  const info = new TextDecoder("utf-8").decode(encryptionInfo);
  if (!/http:\/\/schemas\.microsoft\.com\/office\/2006\/encryption/.test(info) && !info.includes("keyData")) {
    throw new Error("ENCRYPTED_XLSX");
  }
  const keyDataSalt = b64(attr(info, "keyData", "saltValue") ?? "");
  const keyBits = Number(attr(info, "keyData", "keyBits") ?? "256");
  const hashAlgo = (attr(info, "keyData", "hashAlgorithm") ?? "SHA512").toUpperCase();
  const cipherAlgo = (attr(info, "keyData", "cipherAlgorithm") ?? "AES").toUpperCase();
  const cipherChain = (attr(info, "keyData", "cipherChaining") ?? "ChainingModeCBC").toLowerCase();
  const spin = Number(attr(info, "p:encryptedKey", "spinCount") ?? attr(info, "encryptedKey", "spinCount") ?? "100000");
  const keySalt = b64(attr(info, "p:encryptedKey", "saltValue") ?? attr(info, "encryptedKey", "saltValue") ?? "");
  const encryptedKeyValue = b64(attr(info, "p:encryptedKey", "encryptedKeyValue") ?? attr(info, "encryptedKey", "encryptedKeyValue") ?? "");
  const verifierHashInput = b64(attr(info, "p:encryptedKey", "encryptedVerifierHashInput") ?? attr(info, "encryptedKey", "encryptedVerifierHashInput") ?? "");
  const verifierHashValue = b64(attr(info, "p:encryptedKey", "encryptedVerifierHashValue") ?? attr(info, "encryptedKey", "encryptedVerifierHashValue") ?? "");
  const hashName = hashAlgo.includes("SHA1") ? "SHA-1" : hashAlgo.includes("SHA256") ? "SHA-256" : "SHA-512";
  // UTF-16LE password
  const utf16 = new Uint8Array(password.length * 2);
  for (let i = 0; i < password.length; i += 1) {
    utf16[i * 2] = password.charCodeAt(i) & 0xff;
    utf16[i * 2 + 1] = password.charCodeAt(i) >> 8;
  }
  let hash = await crypto.subtle.digest(hashName, source(concat(keySalt, utf16)));
  const spinBuf = new ArrayBuffer(4);
  const spinView = new DataView(spinBuf);
  for (let i = 0; i < spin; i += 1) {
    spinView.setUint32(0, i, true);
    hash = await crypto.subtle.digest(hashName, source(concat(copy(hash), copy(spinBuf))));
  }
  const secretKey = await deriveAgileKey(copy(hash), hashName, keyBits / 8, encryptedKeyValue, keyDataSalt.length ? keyDataSalt : keySalt);
  const ok = await verifyPassword(secretKey, verifierHashInput, verifierHashValue, hashName, cipherAlgo, cipherChain);
  if (!ok) throw new XlsxPasswordError();
  return copy(await decryptPackage(encryptedPackage, secretKey, keyDataSalt, cipherAlgo, cipherChain));
}

async function deriveAgileKey(hash: Bytes, hashName: string, keyLen: number, encryptedKeyValue: Bytes, _salt: Bytes): Promise<CryptoKey> {
  const blockKey = await crypto.subtle.digest(hashName, source(concat(hash, u32le(0x36))));
  const keyMaterial = copy(blockKey).subarray(0, keyLen);
  const kek = await crypto.subtle.importKey("raw", source(keyMaterial), { name: "AES-CBC" }, false, ["decrypt"]);
  const iv = copy(await crypto.subtle.digest(hashName, source(concat(hash, u8(0xfe, 0xa7, 0xd2, 0x76, 0x3b, 0x4b, 0x9e, 0x79))))).subarray(0, 16);
  let decrypted: ArrayBuffer;
  try {
    decrypted = await crypto.subtle.decrypt({ name: "AES-CBC", iv: source(iv) }, kek, source(encryptedKeyValue));
  } catch {
    throw new XlsxPasswordError();
  }
  return crypto.subtle.importKey("raw", source(copy(decrypted).subarray(0, keyLen)), { name: "AES-CBC" }, false, ["decrypt"]);
}

async function verifyPassword(key: CryptoKey, encInput: Bytes, encHash: Bytes, hashName: string, _cipher: string, _chain: string): Promise<boolean> {
  try {
    const inputIv = copy(await crypto.subtle.digest(hashName, source(u8(0xfe, 0xa7, 0xd2, 0x76, 0x3b, 0x4b, 0x9e, 0x79)))).subarray(0, 16);
    const plain = copy(await crypto.subtle.decrypt({ name: "AES-CBC", iv: source(inputIv) }, key, source(encInput)));
    const hash = copy(await crypto.subtle.digest(hashName, source(plain)));
    const hashIv = copy(await crypto.subtle.digest(hashName, source(u8(0xd7, 0xaa, 0x0f, 0x6d, 0x30, 0x61, 0x34, 0x4e)))).subarray(0, 16);
    const decHash = copy(await crypto.subtle.decrypt({ name: "AES-CBC", iv: source(hashIv) }, key, source(encHash)));
    return hash.length <= decHash.length && hash.every((b, i) => b === decHash[i]);
  } catch {
    return false;
  }
}

async function decryptPackage(pkg: Bytes, key: CryptoKey, salt: Bytes, _cipher: string, _chain: string): Promise<Bytes> {
  // EncryptedPackage: 8-byte length + AES-CBC segments with IV = hash(salt + block)
  const total = Number(new DataView(pkg.buffer, pkg.byteOffset, 8).getBigUint64(0, true));
  const enc = pkg.subarray(8);
  const chunk = 4096;
  const out = new Uint8Array(enc.length);
  let offset = 0;
  let block = 0;
  while (offset < enc.length) {
    const slice = enc.subarray(offset, offset + chunk);
    const iv = copy(await crypto.subtle.digest("SHA-512", source(concat(salt, u32le(block))))).subarray(0, 16);
    try {
      const plain = copy(await crypto.subtle.decrypt({ name: "AES-CBC", iv: source(iv) }, key, source(padBlock(slice))));
      out.set(plain.subarray(0, slice.length), offset);
    } catch {
      out.set(slice, offset);
    }
    offset += chunk;
    block += 1;
  }
  const trimmed = out.subarray(0, total || out.length);
  if (trimmed[0] === 0x78) {
    try {
      return inflateSync(trimmed);
    } catch {
      return trimmed;
    }
  }
  return trimmed;
}

type Bytes = Uint8Array;

/** Fresh ArrayBuffer-backed copy so WebCrypto accepts the bytes under TS 5.7+. */
function copy(bytes: ArrayBuffer | Uint8Array): Uint8Array {
  if (bytes instanceof ArrayBuffer) {
    const out = new Uint8Array(bytes.byteLength);
    out.set(new Uint8Array(bytes));
    return out;
  }
  const out = new Uint8Array(bytes.byteLength);
  out.set(bytes);
  return out;
}

function source(bytes: Uint8Array): BufferSource {
  return copy(bytes) as unknown as BufferSource;
}

function padBlock(slice: Uint8Array): Uint8Array {
  if (slice.length % 16 === 0) return slice;
  const padded = new Uint8Array(Math.ceil(slice.length / 16) * 16);
  padded.set(slice);
  return padded;
}

function parseOle(bytes: Uint8Array): Map<string, Uint8Array> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const sectorShift = view.getUint16(30, true);
  const sectorSize = 1 << sectorShift;
  const fatCount = view.getUint32(44, true);
  const dirFirst = view.getUint32(48, true);
  const fatIds: number[] = [];
  for (let i = 0; i < Math.min(fatCount, 109); i += 1) fatIds.push(view.getUint32(76 + i * 4, true));
  const fatBytes = sectors(bytes, sectorSize, fatIds);
  const fatView = new DataView(fatBytes.buffer, fatBytes.byteOffset, fatBytes.byteLength);
  const dir = chain(bytes, sectorSize, fatView, dirFirst);
  const out = new Map<string, Uint8Array>();
  for (let i = 0; i + 128 <= dir.length; i += 128) {
    const nameChars = dir[i + 64]! / 2 - 1;
    if (nameChars <= 0) continue;
    let name = "";
    for (let c = 0; c < nameChars; c += 1) name += String.fromCharCode(dir[i + c * 2]! | (dir[i + c * 2 + 1]! << 8));
    const sid = new DataView(dir.buffer, dir.byteOffset + i, 128).getInt32(116, true);
    const size = new DataView(dir.buffer, dir.byteOffset + i, 128).getUint32(120, true);
    if (sid < 0) continue;
    out.set(name, chain(bytes, sectorSize, fatView, sid).subarray(0, size));
  }
  return out;
}

function sectors(bytes: Uint8Array, sectorSize: number, ids: number[]): Uint8Array {
  const out = new Uint8Array(ids.length * sectorSize);
  ids.forEach((id, index) => {
    if (id >= 0xfffffffe) return;
    out.set(bytes.subarray((id + 1) * sectorSize, (id + 2) * sectorSize), index * sectorSize);
  });
  return out;
}

function chain(bytes: Uint8Array, sectorSize: number, fatView: DataView, start: number): Uint8Array {
  const ids: number[] = [];
  let sid = start;
  for (let n = 0; n < 1_000_000 && sid >= 0 && sid < 0xfffffffe; n += 1) {
    ids.push(sid);
    sid = fatView.getInt32(sid * 4, true);
  }
  return sectors(bytes, sectorSize, ids);
}

function attr(xml: string, tag: string, name: string): string | undefined {
  const block = new RegExp(`<${tag.replace(":", ":?")}\\b[^>]*>`, "i").exec(xml)?.[0] ?? xml;
  return new RegExp(`\\b${name}="([^"]*)"`, "i").exec(block)?.[1];
}

function b64(text: string): Uint8Array {
  if (!text) return new Uint8Array();
  if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(text, "base64"));
  const bin = globalThis.atob(text);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function u32le(value: number): Uint8Array {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, value, true);
  return out;
}

function u8(...values: number[]): Uint8Array {
  return new Uint8Array(values);
}
