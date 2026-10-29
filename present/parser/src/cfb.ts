/** MS-CFB (OLE compound file) helpers — stream read by path. */

export const CFB_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1] as const;
const NOSTREAM = 0xffffffff;
const ENDOFCHAIN = 0xfffffffe;

export function isCfb(bytes: Uint8Array): boolean {
  if (bytes.length < 8) return false;
  for (let i = 0; i < 8; i++) if (bytes[i] !== CFB_MAGIC[i]) return false;
  return true;
}

interface CfbEntry {
  name: string;
  type: number;
  left: number;
  right: number;
  child: number;
  start: number;
  size: number;
}

function readName(entry: Uint8Array): string {
  const dv = new DataView(entry.buffer, entry.byteOffset, entry.byteLength);
  const nameLen = dv.getUint16(64, true);
  if (nameLen < 2) return "";
  const chars = Math.min(32, Math.floor(nameLen / 2) - 1);
  let s = "";
  for (let i = 0; i < chars; i++) {
    const c = dv.getUint16(i * 2, true);
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s;
}

function loadDirectory(bytes: Uint8Array, dv: DataView, sectorSize: number): CfbEntry[] {
  const dirStart = dv.getUint32(0x30, true);
  const readSector = (sid: number): Uint8Array | null => {
    if (sid === NOSTREAM || sid === ENDOFCHAIN) return null;
    const off = (sid + 1) * sectorSize;
    if (off + sectorSize > bytes.length) return null;
    return bytes.subarray(off, off + sectorSize);
  };

  const fat: number[] = [];
  const fatSectors = dv.getUint32(0x2c, true);
  let fatIdx = dv.getUint32(0x4c, true);
  for (let i = 0; i < fatSectors && fatIdx !== NOSTREAM && fatIdx !== ENDOFCHAIN; i++) {
    const sec = readSector(fatIdx);
    if (!sec) break;
    const n = sectorSize / 4;
    const secDv = new DataView(sec.buffer, sec.byteOffset, sec.byteLength);
    for (let j = 0; j < n; j++) fat.push(secDv.getUint32(j * 4, true));
    fatIdx = fat[fatIdx] ?? NOSTREAM;
  }

  const entries: CfbEntry[] = [];
  let dirSid = dirStart;
  const seenDir = new Set<number>();
  while (dirSid !== ENDOFCHAIN && dirSid !== NOSTREAM && !seenDir.has(dirSid)) {
    seenDir.add(dirSid);
    const sec = readSector(dirSid);
    if (!sec) break;
    const count = sectorSize / 128;
    for (let e = 0; e < count; e++) {
      const base = e * 128;
      const slice = sec.subarray(base, base + 128);
      const edv = new DataView(slice.buffer, slice.byteOffset, slice.byteLength);
      entries.push({
        name: readName(slice),
        type: edv.getUint8(66),
        left: edv.getUint32(68, true),
        right: edv.getUint32(72, true),
        child: edv.getUint32(76, true),
        start: edv.getUint32(116, true),
        size: edv.getUint32(120, true),
      });
    }
    dirSid = fat[dirSid] ?? ENDOFCHAIN;
  }
  return entries;
}

function readChain(bytes: Uint8Array, fat: number[], sectorSize: number, startSid: number): Uint8Array {
  const parts: Uint8Array[] = [];
  let sid = startSid;
  const seen = new Set<number>();
  const readSector = (s: number): Uint8Array | null => {
    if (s === NOSTREAM || s === ENDOFCHAIN) return null;
    const off = (s + 1) * sectorSize;
    if (off + sectorSize > bytes.length) return null;
    return bytes.subarray(off, off + sectorSize);
  };
  while (sid !== ENDOFCHAIN && sid !== NOSTREAM && !seen.has(sid)) {
    seen.add(sid);
    const sec = readSector(sid);
    if (!sec) break;
    parts.push(sec);
    sid = fat[sid] ?? ENDOFCHAIN;
  }
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function buildFat(bytes: Uint8Array, dv: DataView, sectorSize: number): number[] {
  const readSector = (sid: number): Uint8Array | null => {
    if (sid === NOSTREAM || sid === ENDOFCHAIN) return null;
    const off = (sid + 1) * sectorSize;
    if (off + sectorSize > bytes.length) return null;
    return bytes.subarray(off, off + sectorSize);
  };
  const fat: number[] = [];
  const fatSectors = dv.getUint32(0x2c, true);
  let fatIdx = dv.getUint32(0x4c, true);
  for (let i = 0; i < fatSectors && fatIdx !== NOSTREAM && fatIdx !== ENDOFCHAIN; i++) {
    const sec = readSector(fatIdx);
    if (!sec) break;
    const n = sectorSize / 4;
    const secDv = new DataView(sec.buffer, sec.byteOffset, sec.byteLength);
    for (let j = 0; j < n; j++) fat.push(secDv.getUint32(j * 4, true));
    fatIdx = fat[fatIdx] ?? NOSTREAM;
  }
  return fat;
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\/+/, "").toLowerCase();
}

/** List stream paths in a CFB container (e.g. `VBA/dir`). */
export function listCfbStreamPaths(bytes: Uint8Array): string[] {
  if (!isCfb(bytes) || bytes.length < 512) return [];
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const sectorShift = dv.getUint16(0x1e, true);
  const sectorSize = sectorShift < 32 ? 1 << sectorShift : 512;
  const entries = loadDirectory(bytes, dv, sectorSize);
  const out: string[] = [];

  const visit = (sid: number, prefix: string): void => {
    if (sid === NOSTREAM || sid === ENDOFCHAIN || sid >= entries.length) return;
    const e = entries[sid]!;
    visit(e.left, prefix);
    const name = e.name;
    if (name && name !== "Root Entry") {
      const path = prefix ? `${prefix}/${name}` : name;
      if (e.type === 2) out.push(path);
      if (e.type === 1 || e.type === 5) visit(e.child, path);
    }
    visit(e.right, prefix);
  };
  visit(0, "");
  return out;
}

/** Read a stream by slash-separated path (case-insensitive). */
export function readCfbStreamPath(bytes: Uint8Array, wantPath: string): Uint8Array | null {
  if (!isCfb(bytes) || bytes.length < 512) return null;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const sectorShift = dv.getUint16(0x1e, true);
  const sectorSize = sectorShift < 32 ? 1 << sectorShift : 512;
  const entries = loadDirectory(bytes, dv, sectorSize);
  const fat = buildFat(bytes, dv, sectorSize);
  const target = normalizePath(wantPath);
  let found: CfbEntry | undefined;

  const visit = (sid: number, prefix: string): void => {
    if (found || sid === NOSTREAM || sid === ENDOFCHAIN || sid >= entries.length) return;
    const e = entries[sid]!;
    visit(e.left, prefix);
    const name = e.name;
    if (name && name !== "Root Entry") {
      const path = prefix ? `${prefix}/${name}` : name;
      if (e.type === 2 && normalizePath(path) === target) found = e;
      if (!found && (e.type === 1 || e.type === 5)) visit(e.child, path);
    }
    visit(e.right, prefix);
  };
  visit(0, "");

  if (!found || found.start === NOSTREAM) return null;
  const data = readChain(bytes, fat, sectorSize, found.start);
  return data.subarray(0, found.size);
}

/** Back-compat: root-level stream name lookup (ole preview). */
export function readCfbRootStream(bytes: Uint8Array, streamName: string): Uint8Array | null {
  return readCfbStreamPath(bytes, streamName);
}
