import { readCompoundStream } from "./xls";

/**
 * Module names stored in a vbaProject.bin, read from the dir stream.
 * The module streams themselves are never decompressed or run.
 */
export function vbaModuleNames(bytes: Uint8Array | undefined): string[] {
  if (!bytes) return [];
  const dir = readCompoundStream(bytes, "dir");
  if (!dir) return [];
  const source = decompress(dir.bytes);
  if (!source) return [];
  return moduleNames(source);
}

/** MS-OVBA 2.4.1 compressed container. A stream that is not one reads as empty. */
export function decompress(bytes: Uint8Array): Uint8Array | undefined {
  if (bytes.length < 3 || bytes[0] !== 0x01) return undefined;
  const out: number[] = [];
  let at = 1;
  while (at + 2 <= bytes.length) {
    const header = bytes[at]! | (bytes[at + 1]! << 8);
    if (((header >> 12) & 0x07) !== 0b011) break;
    const size = (header & 0x0fff) + 3;
    const flag = header >> 15;
    const end = Math.min(bytes.length, at + size);
    at += 2;
    if (flag === 0) {
      for (let i = 0; i < 4096 && at < end; i += 1) out.push(bytes[at++]!);
      continue;
    }
    const chunkStart = out.length;
    while (at < end) {
      const flags = bytes[at++]!;
      for (let bit = 0; bit < 8 && at < end; bit += 1) {
        if (((flags >> bit) & 1) === 0) {
          out.push(bytes[at++]!);
          continue;
        }
        if (at + 2 > end) return undefined;
        const token = bytes[at]! | (bytes[at + 1]! << 8);
        at += 2;
        const difference = out.length - chunkStart;
        const bits = Math.max(4, Math.ceil(Math.log2(Math.max(1, difference))));
        const lengthMask = 0xffff >> bits;
        const length = (token & lengthMask) + 3;
        const offset = ((token & (lengthMask ^ 0xffff)) >> (16 - bits)) + 1;
        const from = out.length - offset;
        if (from < chunkStart) return undefined;
        for (let i = 0; i < length; i += 1) out.push(out[from + i]!);
      }
    }
  }
  return new Uint8Array(out);
}

/**
 * Walks the decompressed dir stream (MS-OVBA 2.3.4.2) and collects each module's
 * unicode name, falling back to the MBCS name decoded with the project code page.
 */
function moduleNames(source: Uint8Array): string[] {
  const reader = new DirReader(source);
  if (!reader.projectInformation()) return [];
  if (!reader.references()) return [];
  return reader.modules();
}

class DirReader {
  private at = 0;
  private codePage = 1252;

  constructor(private readonly source: Uint8Array) {}

  /** Everything up to and including PROJECTCONSTANTS, so the next id starts the references. */
  projectInformation(): boolean {
    if (this.id() !== 0x0001 || !this.skip(4)) return false;
    const next = this.id();
    if (next === 0x004a) {
      if (!this.skip(4)) return false;
    } else if (next !== 0x0002) {
      return false;
    }
    if (!this.skip(4)) return false;
    if (!this.expect(0x0014) || !this.skip(4)) return false;
    if (!this.expect(0x0003)) return false;
    const codePage = this.sized(2);
    if (!codePage) return false;
    this.codePage = codePage[0]! | (codePage[1]! << 8);
    if (!this.expect(0x0004) || !this.skipText()) return false;
    if (!this.expect(0x0005) || !this.skipText() || !this.skipReserved(0x0040)) return false;
    if (!this.expect(0x0006) || !this.skipText() || !this.skipReserved(0x003d)) return false;
    if (!this.expect(0x0007) || !this.skip(4)) return false;
    if (!this.expect(0x0008) || !this.skip(4)) return false;
    if (!this.expect(0x0009) || !this.skipRaw(10)) return false;
    if (!this.expect(0x000c) || !this.skipText() || !this.skipReserved(0x003c)) return false;
    return true;
  }

  /** REFERENCE records, until the 0x000F that opens PROJECTMODULES. */
  references(): boolean {
    for (;;) {
      const id = this.id();
      if (id === undefined) return false;
      if (id === 0x000f) return true;
      if (id === 0x0016) {
        if (!this.skipText()) return false;
        if (this.peekUint16() === 0x003e && !this.skipReserved(0x003e)) return false;
      } else if (id === 0x0033) {
        if (!this.skipText()) return false;
      } else if (id === 0x002f) {
        if (!this.skipReferenceControl()) return false;
      } else if (id === 0x000d) {
        if (!this.skip(4) || !this.skipText() || !this.skipRaw(6)) return false;
      } else if (id === 0x000e) {
        if (!this.skip(4) || !this.skipText() || !this.skipText() || !this.skipRaw(6)) return false;
      } else {
        return false;
      }
    }
  }

  modules(): string[] {
    if (!this.skip(2)) return [];
    if (!this.expect(0x0013) || !this.skip(2)) return [];
    const names: string[] = [];
    while (this.peekUint16() === 0x0019) {
      const name = this.module();
      if (name === undefined) break;
      if (name) names.push(name);
    }
    return names;
  }

  /** One MODULE record. The unicode copy of the name wins over the MBCS one. */
  private module(): string | undefined {
    if (!this.expect(0x0019)) return undefined;
    const mbcs = this.text();
    if (mbcs === undefined) return undefined;
    let name = mbcs;
    if (this.peekUint16() === 0x0047) {
      this.at += 2;
      const unicode = this.unicode();
      if (unicode) name = unicode;
    }
    if (this.peekUint16() !== 0x001a) return undefined;
    this.at += 2;
    if (this.text() === undefined || !this.skipReserved(0x0032)) return undefined;
    if (this.peekUint16() !== 0x001c) return undefined;
    this.at += 2;
    if (this.text() === undefined || !this.skipReserved(0x0048)) return undefined;
    if (!this.expect(0x0031) || !this.skip(4)) return undefined;
    if (!this.expect(0x001e) || !this.skip(4)) return undefined;
    if (!this.expect(0x002c) || !this.skip(2)) return undefined;
    const type = this.id();
    if ((type !== 0x0021 && type !== 0x0022) || !this.skipRaw(8)) return undefined;
    if (this.peekUint16() === 0x0025) {
      this.at += 2;
      if (!this.skipRaw(8)) return undefined;
    }
    if (this.peekUint16() === 0x0028) {
      this.at += 2;
      if (!this.skipRaw(8)) return undefined;
    }
    if (!this.expect(0x002b) || !this.skipRaw(8)) return undefined;
    if (this.peekUint16() === 0x002a) {
      this.at += 2;
      if (!this.skipRaw(8)) return undefined;
    }
    return name;
  }

  /** REFERENCECONTROL, including its optional extended name record. */
  private skipReferenceControl(): boolean {
    if (!this.skipRaw(4) || !this.skipText() || !this.skipRaw(6)) return false;
    if (this.peekUint16() === 0x0016) {
      this.at += 2;
      if (!this.skipText()) return false;
      if (this.peekUint16() === 0x003e && !this.skipReserved(0x003e)) return false;
    }
    return this.skipRaw(2 + 4 + 4) && this.skipText() && this.skipRaw(4 + 2 + 16 + 4);
  }

  /** A size-prefixed MBCS string, decoded with the project code page. */
  private text(): string | undefined {
    const bytes = this.sized();
    if (!bytes) return undefined;
    return decodeMbcs(bytes, this.codePage);
  }

  /** A size-prefixed UTF-16LE string. */
  private unicode(): string | undefined {
    const bytes = this.sized();
    if (!bytes) return undefined;
    return new TextDecoder("utf-16le").decode(bytes).replace(/\0+$/, "");
  }

  /** A size-prefixed MBCS string plus its reserved id and unicode copy. */
  private skipReserved(reserved: number): boolean {
    const marker = this.id();
    if (marker !== reserved) return false;
    return this.unicode() !== undefined;
  }

  private skipText(): boolean {
    return this.text() !== undefined;
  }

  /** A record body: a 4-byte size, which must match, followed by that many bytes. */
  private skip(size: number): boolean {
    const declared = this.uint32();
    if (declared !== size) return false;
    return this.skipRaw(size);
  }

  /** Bytes with no size prefix. */
  private skipRaw(count: number): boolean {
    if (this.at + count > this.source.length) return false;
    this.at += count;
    return true;
  }

  private expect(id: number): boolean {
    return this.id() === id;
  }

  private id(): number | undefined {
    const id = this.peekUint16();
    if (id === undefined) return undefined;
    this.at += 2;
    return id;
  }

  private sized(expected?: number): Uint8Array | undefined {
    const size = this.uint32();
    if (size === undefined || (expected !== undefined && size !== expected)) return undefined;
    if (this.at + size > this.source.length) return undefined;
    const bytes = this.source.subarray(this.at, this.at + size);
    this.at += size;
    return bytes;
  }

  private peekUint16(): number | undefined {
    if (this.at + 2 > this.source.length) return undefined;
    return this.source[this.at]! | (this.source[this.at + 1]! << 8);
  }

  private uint32(): number | undefined {
    if (this.at + 4 > this.source.length) return undefined;
    const value = this.source[this.at]! | (this.source[this.at + 1]! << 8) | (this.source[this.at + 2]! << 16) | (this.source[this.at + 3]! << 24);
    this.at += 4;
    return value >>> 0;
  }
}

/** Code pages a VBA project actually uses, mapped to a label the runtime can decode. */
const CODE_PAGES: Record<number, string> = {
  437: "ibm437",
  850: "ibm850",
  932: "shift_jis",
  936: "gbk",
  949: "euc-kr",
  950: "big5",
  1250: "windows-1250",
  1251: "windows-1251",
  1252: "windows-1252",
  1253: "windows-1253",
  1254: "windows-1254",
  1255: "windows-1255",
  1256: "windows-1256",
  1257: "windows-1257",
  1258: "windows-1258",
  10000: "macintosh",
  65001: "utf-8",
};

function decodeMbcs(bytes: Uint8Array, codePage: number): string {
  const label = CODE_PAGES[codePage] ?? "windows-1252";
  try {
    return new TextDecoder(label).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}
