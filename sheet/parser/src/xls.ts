import type { SheetCell, Workbook, Worksheet } from "@sliiu/sheet-core";

const OLE_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

/** Minimal BIFF8 reader: values, shared strings, booleans, formula cached values. */
export function parseXls(input: ArrayBuffer | Uint8Array): Workbook {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (!OLE_MAGIC.every((b, i) => bytes[i] === b)) throw new Error("LEGACY_XLS");
  const stream = readWorkbookStream(bytes);
  if (!stream) throw new Error("LEGACY_XLS");
  return parseBiff8(stream);
}

function readWorkbookStream(bytes: Uint8Array): Uint8Array | undefined {
  const found = readCompoundStream(bytes, "workbook") ?? readCompoundStream(bytes, "book");
  return found?.bytes;
}

/** One stream inside a compound file, found by the tail of its name. */
export interface CompoundStream {
  name: string;
  bytes: Uint8Array;
}

/** Reads a named stream out of an OLE compound file. Names match by their lower-cased tail. */
export function readCompoundStream(bytes: Uint8Array, wanted: string): CompoundStream | undefined {
  if (bytes.length < 512 || !OLE_MAGIC.every((byte, index) => bytes[index] === byte)) return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const sectorSize = 1 << view.getUint16(30, true);
  const miniSize = 1 << view.getUint16(32, true);
  const dirFirst = view.getUint32(48, true);
  const miniCutoff = view.getUint32(56, true);
  const miniFatFirst = view.getUint32(60, true);
  const fat = fatSectors(view, bytes, sectorSize);
  const fatBytes = readSectors(bytes, sectorSize, fat);
  const fatView = new DataView(fatBytes.buffer, fatBytes.byteOffset, fatBytes.byteLength);
  const dir = readChain(bytes, sectorSize, fatView, dirFirst);
  const entries = Math.floor(dir.length / 128);
  let rootStart = -1;
  let rootSize = 0;
  let match: { name: string; start: number; size: number } | undefined;
  for (let i = 0; i < entries; i += 1) {
    const off = i * 128;
    const nameChars = Math.max(0, dir[off + 64]! / 2 - 1);
    let name = "";
    for (let c = 0; c < nameChars; c += 1) name += String.fromCharCode(dir[off + c * 2]! | (dir[off + c * 2 + 1]! << 8));
    const entry = new DataView(dir.buffer, dir.byteOffset + off, 128);
    const start = entry.getInt32(116, true);
    const size = entry.getUint32(120, true);
    if (i === 0) {
      rootStart = start;
      rootSize = size;
    }
    if (!match && name.toLowerCase().endsWith(wanted.toLowerCase())) match = { name, start, size };
  }
  if (!match || match.start < 0) return undefined;
  const data = match.size < miniCutoff && rootStart >= 0
    ? readMini(bytes, sectorSize, miniSize, fatView, miniFatFirst, rootStart, rootSize, match.start)
    : readChain(bytes, sectorSize, fatView, match.start);
  return { name: match.name, bytes: data.subarray(0, match.size || data.length) };
}

function fatSectors(view: DataView, bytes: Uint8Array, sectorSize: number): number[] {
  const count = view.getUint32(44, true);
  const ids: number[] = [];
  for (let i = 0; i < Math.min(count, 109); i += 1) ids.push(view.getUint32(76 + i * 4, true));
  let difat = view.getUint32(68, true);
  const difatCount = view.getUint32(72, true);
  for (let n = 0; n < difatCount && difat >= 0 && difat < 0xfffffffe; n += 1) {
    const start = (difat + 1) * sectorSize;
    const sector = new DataView(bytes.buffer, bytes.byteOffset + start, sectorSize);
    for (let i = 0; i < sectorSize / 4 - 1 && ids.length < count; i += 1) ids.push(sector.getUint32(i * 4, true));
    difat = sector.getUint32(sectorSize - 4, true);
  }
  return ids;
}

function readMini(
  bytes: Uint8Array,
  sectorSize: number,
  miniSize: number,
  fatView: DataView,
  miniFatFirst: number,
  rootStart: number,
  rootSize: number,
  start: number,
): Uint8Array {
  const miniFatBytes = readChain(bytes, sectorSize, fatView, miniFatFirst);
  const miniFat = new DataView(miniFatBytes.buffer, miniFatBytes.byteOffset, miniFatBytes.byteLength);
  const mini = readChain(bytes, sectorSize, fatView, rootStart).subarray(0, rootSize);
  const ids: number[] = [];
  let sid = start;
  const guard = Math.floor(mini.length / miniSize) + 8;
  for (let n = 0; n < guard && sid >= 0 && sid < 0xfffffffe; n += 1) {
    ids.push(sid);
    sid = sid * 4 + 4 <= miniFat.byteLength ? miniFat.getInt32(sid * 4, true) : -1;
  }
  const out = new Uint8Array(ids.length * miniSize);
  ids.forEach((id, index) => out.set(mini.subarray(id * miniSize, (id + 1) * miniSize), index * miniSize));
  return out;
}


function readSectors(bytes: Uint8Array, sectorSize: number, ids: number[]): Uint8Array {
  const out = new Uint8Array(ids.length * sectorSize);
  ids.forEach((id, index) => {
    if (id >= 0xfffffffe) return;
    const start = (id + 1) * sectorSize;
    out.set(bytes.subarray(start, start + sectorSize), index * sectorSize);
  });
  return out;
}

function readChain(bytes: Uint8Array, sectorSize: number, fatView: DataView, start: number): Uint8Array {
  const ids: number[] = [];
  let sid = start;
  const guard = Math.floor(bytes.length / sectorSize) + 8;
  for (let n = 0; n < guard && sid >= 0 && sid < 0xfffffffe; n += 1) {
    ids.push(sid);
    sid = fatView.getInt32(sid * 4, true);
  }
  return readSectors(bytes, sectorSize, ids);
}

function parseBiff8(stream: Uint8Array): Workbook {
  const view = new DataView(stream.buffer, stream.byteOffset, stream.byteLength);
  const sheets: Worksheet[] = [];
  let shared: string[] = [];
  let current: Worksheet | undefined;
  let i = 0;
  while (i + 4 <= stream.length) {
    const type = view.getUint16(i, true);
    const size = view.getUint16(i + 2, true);
    const data = stream.subarray(i + 4, i + 4 + size);
    i += 4 + size;
    if (type === 0x00fc) shared = readSst(data, view, stream, () => {
      // CONTINUE records may follow; handled loosely by reading declared size only.
    });
    else if (type === 0x0085) {
      // BOUNDSHEET — name at offset 8
      const nameLen = data[6] ?? 0;
      const compressed = data[7] === 0;
      let name = "";
      if (compressed) name = String.fromCharCode(...data.subarray(8, 8 + nameLen));
      else {
        for (let c = 0; c < nameLen; c += 1) name += String.fromCharCode(data[8 + c * 2]! | (data[9 + c * 2]! << 8));
      }
      current = { name: name || `Sheet${sheets.length + 1}`, cells: [] };
      sheets.push(current);
    } else if (type === 0x00fd && current) {
      // LABELSST
      const row = new DataView(data.buffer, data.byteOffset, data.byteLength).getUint16(0, true);
      const col = new DataView(data.buffer, data.byteOffset, data.byteLength).getUint16(2, true);
      const index = new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(6, true);
      put(current, row, col, { value: shared[index] ?? "" });
    } else if (type === 0x0204 && current) {
      // LABEL
      const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
      const row = dv.getUint16(0, true);
      const col = dv.getUint16(2, true);
      const len = dv.getUint16(6, true);
      const compressed = data[8] === 0;
      let value = "";
      if (compressed) value = String.fromCharCode(...data.subarray(9, 9 + len));
      else for (let c = 0; c < len; c += 1) value += String.fromCharCode(data[9 + c * 2]! | (data[10 + c * 2]! << 8));
      put(current, row, col, { value });
    } else if ((type === 0x0203 || type === 0x027e) && current) {
      // NUMBER or RK
      const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
      const row = dv.getUint16(0, true);
      const col = dv.getUint16(2, true);
      let value: number;
      if (type === 0x0203) value = dv.getFloat64(6, true);
      else value = decodeRk(dv.getUint32(6, true));
      put(current, row, col, { value: formatNumber(value) });
    } else if (type === 0x0205 && current) {
      // BOOLERR
      const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
      const row = dv.getUint16(0, true);
      const col = dv.getUint16(2, true);
      const boolErr = data[6] ?? 0;
      const isErr = data[7] === 1;
      put(current, row, col, { value: isErr ? "#VALUE!" : boolErr ? "TRUE" : "FALSE" });
    } else if (type === 0x0006 && current) {
      // FORMULA — cached value at offset 6
      const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
      const row = dv.getUint16(0, true);
      const col = dv.getUint16(2, true);
      const cached = decodeFormulaCache(data.subarray(6, 14));
      put(current, row, col, { value: cached, formula: "" });
    }
  }
  if (!sheets.length) sheets.push({ name: "Sheet1", cells: [] });
  return { sheets };
}

function put(sheet: Worksheet, row: number, col: number, cell: SheetCell): void {
  const line = sheet.cells[row] ?? [];
  line[col] = cell;
  sheet.cells[row] = line;
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "#NUM!";
  if (Number.isInteger(value)) return String(value);
  return String(Math.round(value * 1e10) / 1e10);
}

function decodeRk(rk: number): number {
  const cent = rk & 1;
  const integer = rk & 2;
  let value: number;
  if (integer) value = (rk >> 2);
  else {
    const buf = new ArrayBuffer(8);
    const view = new DataView(buf);
    view.setUint32(4, rk & 0xfffffffc, true);
    value = view.getFloat64(0, true);
  }
  return cent ? value / 100 : value;
}

function decodeFormulaCache(data: Uint8Array): string {
  if (data[0] === 0xff && data[1] === 0xff) {
    const kind = data[2];
    if (kind === 1) return data[4] ? "TRUE" : "FALSE";
    if (kind === 2) return ""; // string follows in STRING record — leave blank
    if (kind === 3) return "#VALUE!";
    return "";
  }
  return formatNumber(new DataView(data.buffer, data.byteOffset, 8).getFloat64(0, true));
}

function readSst(data: Uint8Array, _view: DataView, _stream: Uint8Array, _onContinue: () => void): string[] {
  if (data.length < 8) return [];
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const count = dv.getUint32(4, true);
  const out: string[] = [];
  let offset = 8;
  for (let n = 0; n < count && offset < data.length; n += 1) {
    if (offset + 3 > data.length) break;
    const len = data[offset]! | (data[offset + 1]! << 8);
    const flags = data[offset + 2]!;
    offset += 3;
    const compressed = (flags & 1) === 0;
    let text = "";
    if (compressed) {
      if (offset + len > data.length) break;
      text = String.fromCharCode(...data.subarray(offset, offset + len));
      offset += len;
    } else {
      if (offset + len * 2 > data.length) break;
      for (let c = 0; c < len; c += 1) text += String.fromCharCode(data[offset + c * 2]! | (data[offset + c * 2 + 1]! << 8));
      offset += len * 2;
    }
    out.push(text);
  }
  return out;
}
