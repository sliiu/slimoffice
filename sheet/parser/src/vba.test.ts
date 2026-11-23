import assert from "node:assert/strict";
import { test } from "node:test";
import { strToU8, zipSync } from "fflate";
import { parseXlsx } from "./index";
import { decompress, vbaModuleNames } from "./vba";

/** A dir stream compressed the way MS-OVBA 2.4.1 stores it, inside a compound file. */
test("reads unicode module names out of a compressed VBA dir stream", () => {
  const plain = dirStream();
  const packed = compress(plain);
  const back = decompress(packed);
  assert.deepEqual(back, plain);
  const names = vbaModuleNames(compound("dir", packed));
  assert.deepEqual(names, ["模块一", "ThisWorkbook"]);
});

test("reads nothing from a project without a dir stream", () => {
  assert.deepEqual(vbaModuleNames(compound("PROJECT", new Uint8Array([0x01]))), []);
});

/** Opening a workbook reads the module names onto the model and leaves the part untouched. */
test("reads module names when a workbook is opened", async () => {
  const bin = compound("dir", compress(dirStream()));
  const files: Record<string, Uint8Array> = {
    "xl/workbook.xml": strToU8(`<workbook><sheets><sheet name="销售"/></sheets></workbook>`),
    "xl/worksheets/sheet1.xml": strToU8(`<worksheet><sheetData><row r="1"><c r="A1"><v>1</v></c></row></sheetData></worksheet>`),
    "xl/vbaProject.bin": bin,
  };
  const workbook = await parseXlsx(zipSync(files));
  assert.deepEqual(workbook.vbaModules, ["模块一", "ThisWorkbook"]);
  assert.equal(workbook.source?.get("xl/vbaProject.bin")?.byteLength, bin.byteLength);
});

/** A chunk whose second half is a CopyToken pointing back at the first half. */
test("expands a copy token inside a compressed chunk", () => {
  const source = new Uint8Array(32);
  for (let i = 0; i < 16; i += 1) source[i] = i + 1;
  source.set(source.subarray(0, 16), 16);
  assert.deepEqual(decompress(compressWithCopy(source, 16)), source);
});

/**
 * Builds the decompressed dir stream (MS-OVBA 2.3.4.2) for two modules.
 * The module name is GBK in the MBCS record and UTF-16 in the unicode record.
 */
function dirStream(): Uint8Array {
  const parts: Uint8Array[] = [];
  const u32 = (id: number, value: number) => parts.push(record(id, uint32(value)));
  u32(0x0001, 0x00000001);
  u32(0x0002, 0x00000409);
  u32(0x0014, 0x00000409);
  parts.push(record(0x0003, uint16(936)));
  parts.push(record(0x0004, bytes("VBAProject")));
  parts.push(record(0x0005, new Uint8Array()), reserved(0x0040, new Uint8Array()));
  parts.push(record(0x0006, new Uint8Array()), reserved(0x003d, new Uint8Array()));
  u32(0x0007, 0);
  u32(0x0008, 0);
  parts.push(record(0x0009, new Uint8Array(4)), uint16(0));
  parts.push(record(0x000c, new Uint8Array()), reserved(0x003c, new Uint8Array()));
  parts.push(record(0x000f, uint16(2)), record(0x0013, uint16(0xffff)));
  module(parts, bytes("Module1"), utf16("模块一"), 0x0021);
  module(parts, bytes("ThisWorkbook"), utf16("ThisWorkbook"), 0x0022);
  parts.push(record(0x0010, uint32(0)));
  return concat(parts);
}

/** One MODULE record: MBCS name, its unicode copy, then the records up to the terminator. */
function module(parts: Uint8Array[], mbcs: Uint8Array, unicode: Uint8Array, type: number): void {
  parts.push(record(0x0019, mbcs));
  parts.push(record(0x0047, unicode));
  parts.push(record(0x001a, mbcs), reserved(0x0032, unicode));
  parts.push(record(0x001c, new Uint8Array()), reserved(0x0048, new Uint8Array()));
  parts.push(record(0x0031, uint32(0)));
  parts.push(record(0x001e, uint32(0)));
  parts.push(record(0x002c, uint16(0xffff)));
  parts.push(record(type, uint32(0)));
  parts.push(record(0x002b, uint32(0)));
}

function record(id: number, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(6 + body.length);
  out[0] = id & 255;
  out[1] = id >> 8;
  out[2] = body.length & 255;
  out[3] = (body.length >> 8) & 255;
  out[4] = (body.length >> 16) & 255;
  out[5] = (body.length >> 24) & 255;
  out.set(body, 6);
  return out;
}

/** The reserved id and unicode copy that follows an MBCS string. */
function reserved(id: number, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(6 + body.length);
  out[0] = id & 255;
  out[1] = id >> 8;
  out[2] = body.length & 255;
  out[3] = (body.length >> 8) & 255;
  out[4] = (body.length >> 16) & 255;
  out[5] = (body.length >> 24) & 255;
  out.set(body, 6);
  return out;
}

function uint16(value: number): Uint8Array {
  return new Uint8Array([value & 255, (value >> 8) & 255]);
}

function uint32(value: number): Uint8Array {
  return new Uint8Array([value & 255, (value >> 8) & 255, (value >> 16) & 255, (value >> 24) & 255]);
}

function bytes(text: string): Uint8Array {
  return new Uint8Array(Buffer.from(text, "latin1"));
}

function utf16(text: string): Uint8Array {
  return new Uint8Array(Buffer.from(text, "utf16le"));
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/**
 * One compressed chunk (MS-OVBA 2.4.1). The first 20 bytes are stored once and then repeated
 * with a CopyToken, so the test exercises the back-reference path rather than plain literals.
 */
/**
 * Like `compress`, but the bytes from `copyFrom` are stored as one CopyToken that repeats
 * the bytes already written. The source must actually repeat there, so the round trip holds.
 */
function compressWithCopy(source: Uint8Array, copyFrom: number): Uint8Array {
  const data: number[] = [];
  let flagAt = -1;
  let bit = 8;
  const slot = (copyToken: boolean) => {
    if (bit === 8) {
      flagAt = data.length;
      data.push(0);
      bit = 0;
    }
    if (copyToken) data[flagAt] = (data[flagAt] ?? 0) | (1 << bit);
    bit += 1;
  };
  for (let i = 0; i < copyFrom; i += 1) {
    slot(false);
    data.push(source[i]!);
  }
  const count = source.length - copyFrom;
  const bits = Math.max(4, Math.ceil(Math.log2(copyFrom)));
  const lengthMask = 0xffff >> bits;
  const token = (((count - 3) & lengthMask) | (((copyFrom - 1) << (16 - bits)) & (lengthMask ^ 0xffff))) & 0xffff;
  slot(true);
  data.push(token & 255, (token >> 8) & 255);
  const header = (data.length + 2 - 3) | 0x3000 | 0x8000;
  return new Uint8Array([0x01, header & 255, header >> 8, ...data]);
}

/** Stores every byte as a literal token, which is a valid compressed chunk. */
function compress(source: Uint8Array): Uint8Array {
  const data: number[] = [];
  for (let i = 0; i < source.length; i += 8) {
    data.push(0);
    for (let bit = 0; bit < 8 && i + bit < source.length; bit += 1) data.push(source[i + bit]!);
  }
  const header = (data.length + 2 - 3) | 0x3000 | 0x8000;
  return new Uint8Array([0x01, header & 255, header >> 8, ...data]);
}

/** A compound file holding one stream, laid out in 512-byte sectors. */
function compound(name: string, stream: Uint8Array): Uint8Array {
  const sector = 512;
  const header = new Uint8Array(sector);
  header.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  const view = new DataView(header.buffer);
  view.setUint16(24, 0x003e, true);
  view.setUint16(26, 0x0003, true);
  view.setUint16(30, 9, true);
  view.setUint16(32, 6, true);
  view.setUint32(44, 1, true);
  view.setUint32(48, 1, true);
  view.setUint32(56, 4096, true);
  view.setUint32(60, 0xfffffffe, true);
  view.setUint32(68, 0xfffffffe, true);
  for (let i = 0; i < 109; i += 1) view.setUint32(76 + i * 4, 0xfffffffe, true);
  view.setUint32(76, 0, true);
  const fat = new Uint8Array(sector);
  const fatView = new DataView(fat.buffer);
  const dataSectors = Math.max(1, Math.ceil(stream.length / sector));
  fatView.setUint32(0, 0xfffffffd, true);
  fatView.setUint32(4, 0xfffffffe, true);
  for (let i = 0; i < dataSectors; i += 1) fatView.setUint32(8 + i * 4, i + 1 === dataSectors ? 0xfffffffe : i + 3, true);
  const directory = new Uint8Array(sector);
  directory.set(entry("Root Entry", 5, 0xfffffffe, 0), 0);
  directory.set(entry(name, 2, 2, stream.length), 128);
  const data = new Uint8Array(dataSectors * sector);
  data.set(stream);
  return concat([header, fat, directory, data]);
}

function entry(name: string, type: number, start: number, size: number): Uint8Array {
  const out = new Uint8Array(128);
  out.set(Buffer.from(name, "utf16le"));
  out[64] = (name.length + 1) * 2;
  out[66] = type;
  const view = new DataView(out.buffer);
  view.setInt32(68, -1, true);
  view.setInt32(72, -1, true);
  view.setInt32(76, -1, true);
  view.setInt32(116, start, true);
  view.setUint32(120, size, true);
  return out;
}
