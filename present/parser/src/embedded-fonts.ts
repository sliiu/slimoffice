import type { EmbeddedFont } from "@ppt/core";
import { decompressEotFont } from "mtx-decompressor";
import { attr, findAllByLocalName, findByLocalName, type XmlNode } from "./xml";
import type { RelMap } from "./parts";
import type { PptxArchive } from "./zip";
import type { MediaResolver } from "./media";

type FontSlot = "regular" | "bold" | "italic" | "boldItalic";

interface SlotStyle {
  weight: number;
  style: "normal" | "italic";
  /** Suffix appended to the base typeface in PowerPoint's alternate naming convention. */
  suffix: string;
}

// ECMA-376 §15.2.13 embeddedFontLst — 不同的 PPT 软件在文本运行中
// 既可能用 `<a:latin typeface="X">` + `<a:rPr b="1" i="1"/>` 引用粗斜体，
// 也可能直接用 `<a:latin typeface="X Italic">` / `"X Bold"` / `"X Bold Italic"`
// （Office 在保存时常出现后者，参见 7.pptx 的 "Menlo Italic"）。两种命名都要兼容。
const SLOT_TO_STYLE: Record<FontSlot, SlotStyle> = {
  regular: { weight: 400, style: "normal", suffix: "" },
  bold: { weight: 700, style: "normal", suffix: " Bold" },
  italic: { weight: 400, style: "italic", suffix: " Italic" },
  boldItalic: { weight: 700, style: "italic", suffix: " Bold Italic" },
};

// EOT (Embedded OpenType) processing flags — Microsoft EOT 文件结构规范
// （https://www.w3.org/Submission/EOT/）。注意位号要严格按规范，旧实现误用 0x2 检测压缩位
// 会让 MTX 压缩字体（PowerPoint 默认压缩方式）静默通过判定却在后续 detectFontFormat
// 处失败，最终整份 embeddedFontLst 输出空数组。
const TTEMBED_SUBSET = 0x00000001;
const TTEMBED_TTCOMPRESSED = 0x00000004;
const TTEMBED_FAILIFVARIATIONSIMULATED = 0x00000010;
const TTEMBED_EMBEDEUDC = 0x00000020;
const TTEMBED_VALIDATIONTESTS = 0x00000040;
const TTEMBED_WEBOBJECT = 0x00000080;
const TTEMBED_XORENCRYPTDATA = 0x10000000;

// 静默引用以避免 TS 移除未使用常量；它们是规范条目，便于读者理解 flags 解码。
void TTEMBED_SUBSET;
void TTEMBED_FAILIFVARIATIONSIMULATED;
void TTEMBED_EMBEDEUDC;
void TTEMBED_VALIDATIONTESTS;
void TTEMBED_WEBOBJECT;

export function parseEmbeddedFonts(
  presEl: XmlNode | undefined,
  presRels: RelMap,
  archive: PptxArchive,
  media: MediaResolver,
): EmbeddedFont[] {
  const lst = findByLocalName(presEl, "embeddedFontLst");
  if (!lst) return [];
  const out: EmbeddedFont[] = [];
  for (const ef of findAllByLocalName(lst, "embeddedFont")) {
    const fontEl = findByLocalName(ef, "font");
    const typeface = attr(fontEl, "typeface");
    if (!typeface) continue;
    // 第一遍：解出每个 slot 的字体文件，并从 **字体文件自身** 探测真实 weight/style。
    //
    // 关键：embeddedFontLst 里的 <p:regular>/<p:italic>… slot 标签 **不可信**。PowerPoint
    // 常把一张斜体 face 塞进 <p:regular> slot（见 7.pptx：Menlo 的 regular slot 实际是
    // Menlo Italic，post.italicAngle=-11、head/OS2 italic 位均置 1）。若按 slot 标签把它
    // 当正体注册到基底 family（Menlo / normal / 400），浏览器在 `font-family:Menlo` 上拿到
    // 的就是这张斜体 outline → 本应正体的正文数字（+mn-lt=Menlo i="0"）被画成斜体。
    // 因此用真实样式而非 slot 标签来决定 weight/style 与是否锚定基底 family。
    interface Face {
      slot: FontSlot;
      src: string;
      format: EmbeddedFont["format"];
    }
    const faces: Face[] = [];
    for (const declared of ["regular", "bold", "italic", "boldItalic"] as FontSlot[]) {
      const slotEl = findByLocalName(ef, declared);
      if (!slotEl) continue;
      const rid = attr(slotEl, "r:id") ?? attr(slotEl, "id");
      if (!rid) continue;
      const path = presRels.resolve(rid);
      if (!path) continue;
      const bytes = archive.getBytes(path);
      if (!bytes) continue;
      const converted = eotToOpenType(bytes, typeface, declared);
      if (!converted) continue;
      const src = media.resolveRaw(path + ".otf", converted.bytes, converted.mime);
      if (!src) continue;
      // 真实样式优先；探测不到（非 sfnt 等）才退回 slot 标签。
      const style = detectSfntStyle(converted.bytes);
      const slot = style ? styleToSlot(style) : declared;
      faces.push({ slot, src, format: converted.format });
    }

    // 基底 family（如 "Menlo"）下是否存在一张 **真实正体** 锚定 face。只内嵌 bold/italic
    // （或被错塞进 regular slot 的 italic）时为 false → 不把它们注册到基底 family 正体上。
    const hasRegular = faces.some((f) => f.slot === "regular");
    for (const f of faces) {
      const meta = SLOT_TO_STYLE[f.slot];
      // 主声明：base typeface + 真实 weight/style，匹配 `<a:latin typeface="X">` + b/i 模式。
      // 仅当该 face 真为 regular、或同字体另有 regular 锚定 face 时才注册，避免「只内嵌
      // bold/italic」的字体污染基底 family 名下的正体请求（裸 "X" 正体回退系统字体）。
      if (f.slot === "regular" || hasRegular) {
        out.push({ family: typeface, weight: meta.weight, style: meta.style, src: f.src, format: f.format });
      }
      // 别名声明：对非 regular face，再注册 "X Italic" / "X Bold" / "X Bold Italic"
      // 的「normal-weight / normal-style」别名，匹配 PowerPoint 把样式编进 typeface
      // 字符串的写法。FontFace 共享同一份字体 src，浏览器仅多了一条匹配规则。
      if (meta.suffix) {
        out.push({ family: typeface + meta.suffix, weight: 400, style: "normal", src: f.src, format: f.format });
      }
    }
  }
  return out;
}

function styleToSlot(s: { italic: boolean; bold: boolean }): FontSlot {
  if (s.bold && s.italic) return "boldItalic";
  if (s.bold) return "bold";
  if (s.italic) return "italic";
  return "regular";
}

// 从 sfnt（TrueType/OpenType）字体文件自身探测真实 italic / bold。综合三路信号，任一命中
// 即判定，最大化兼容各家不规范字体：
//   - head.macStyle：bit0=bold、bit1=italic（§OpenType head）
//   - OS/2.fsSelection：bit0=italic、bit5=bold、bit9=oblique；usWeightClass>=600 视为 bold
//   - post.italicAngle：非 0（容差 0.5°）视为 italic
// 非 sfnt（woff/woff2 等，PPT 内嵌不会出现）返回 undefined，调用方退回 slot 标签。
function detectSfntStyle(bytes: Uint8Array): { italic: boolean; bold: boolean } | undefined {
  if (bytes.byteLength < 12) return undefined;
  const sig = (bytes[0]! << 24) | (bytes[1]! << 16) | (bytes[2]! << 8) | bytes[3]!;
  const isSfnt = sig === 0x00010000 || sig === 0x74727565 || sig === 0x4f54544f;
  if (!isSfnt) return undefined;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const numTables = dv.getUint16(4, false);
  let head: { off: number; len: number } | undefined;
  let os2: { off: number; len: number } | undefined;
  let post: { off: number; len: number } | undefined;
  for (let i = 0; i < numTables; i++) {
    const rec = 12 + i * 16;
    if (rec + 16 > bytes.byteLength) break;
    const tag = String.fromCharCode(bytes[rec]!, bytes[rec + 1]!, bytes[rec + 2]!, bytes[rec + 3]!);
    const off = dv.getUint32(rec + 8, false);
    const len = dv.getUint32(rec + 12, false);
    if (tag === "head") head = { off, len };
    else if (tag === "OS/2") os2 = { off, len };
    else if (tag === "post") post = { off, len };
  }
  let italic = false;
  let bold = false;
  if (head && head.len >= 46 && head.off + 46 <= bytes.byteLength) {
    const macStyle = dv.getUint16(head.off + 44, false);
    if (macStyle & 0x1) bold = true;
    if (macStyle & 0x2) italic = true;
  }
  if (os2 && os2.len >= 64 && os2.off + 64 <= bytes.byteLength) {
    const fsSel = dv.getUint16(os2.off + 62, false);
    if (fsSel & 0x1 || fsSel & 0x200) italic = true;
    if (fsSel & 0x20) bold = true;
    const usWeight = dv.getUint16(os2.off + 4, false);
    if (usWeight >= 600) bold = true;
  }
  if (post && post.len >= 8 && post.off + 8 <= bytes.byteLength) {
    const angle = dv.getInt32(post.off + 4, false) / 65536;
    if (Math.abs(angle) > 0.5) italic = true;
  }
  return { italic, bold };
}

interface ConvertedFont {
  bytes: Uint8Array;
  mime: string;
  format: EmbeddedFont["format"];
}

function eotToOpenType(eot: Uint8Array, typeface: string, slot: FontSlot): ConvertedFont | undefined {
  // 最小 EOT 头长度。规范规定为 82 字节，含 EOTSize/FontDataSize/Version/Flags/
  // FontPANOSE/Charset/Italic/Weight/fsType/MagicNumber/UnicodeRange/CodePageRange/
  // CheckSumAdjustment/Reserved 等域。
  if (eot.byteLength < 82) return undefined;
  const dv = new DataView(eot.buffer, eot.byteOffset, eot.byteLength);
  const eotSize = dv.getUint32(0, true);
  const fontDataSize = dv.getUint32(4, true);
  // §3.1 — EOTSize 必须等于整个 EOT 容器的字节数；不一致一般是文件被截断或加密层未剥离。
  if (eotSize !== eot.byteLength) return undefined;
  if (fontDataSize <= 0 || fontDataSize > eot.byteLength) return undefined;
  // §3.1 MagicNumber：固定 0x504C（"LP"），用于校验 EOT 容器有效性。
  const magic = dv.getUint16(34, true);
  if (magic !== 0x504c) return undefined;
  const start = eotSize - fontDataSize;
  if (start < 82 || start + fontDataSize > eot.byteLength) return undefined;
  const flags = dv.getUint32(12, true);
  const compressed = (flags & TTEMBED_TTCOMPRESSED) !== 0;
  const xorEncrypted = (flags & TTEMBED_XORENCRYPTDATA) !== 0;
  const fontBytes = eot.subarray(start, start + fontDataSize);

  let payload: Uint8Array;
  if (compressed || xorEncrypted) {
    try {
      // libeot 等价：先 XOR 解密（key=0x50，仅当 XORENCRYPTDATA 置位时），再 MTX 解压成
      // 标准 sfnt（TTF）。decompressEotFont 是 zero-dep TypeScript 移植，浏览器与 Node
      // 同样可用。
      payload = decompressEotFont(fontBytes, compressed, xorEncrypted);
    } catch (err) {
      if (typeof console !== "undefined") {
        console.warn(
          `[parser] embedded font "${typeface}/${slot}" decompression failed:`,
          err instanceof Error ? err.message : err,
        );
      }
      return undefined;
    }
  } else {
    // 未压缩、未加密：font 数据已经是 SFNT，直接取用。
    payload = fontBytes;
  }

  const fmt = detectFontFormat(payload);
  if (!fmt) return undefined;
  // ECMA-376 §15.2.13 内嵌字体来自 MTX 解压 / EOT 子集化，往往保留了 PowerPoint 在
  // 嵌入时生成的「冗余表」与「平台/语言字段不规范」的情况。浏览器 OTS（OpenType
  // Sanitizer）校验比 Office 字体引擎严格得多——例如 cvt 表存在但长度 0、cmap
  // 子表 language != 0（在 platform != Mac 时强制为 0）等都会触发 OTS 拒绝整份字体
  // （表现为 FontFace.load() NetworkError）。这里做一次最小化矫正：
  //   1. cmap format 12 / 13：把 language 字段写回 0；
  //   2. SFNT 表目录：剔除 length == 0 的引用，重新拼接 + 校验和。
  // 不做任何「内容」级别修改，只规范化容器层格式。
  const sanitized = sanitizeSfnt(payload);
  if (!sanitized) return undefined;
  return { bytes: sanitized, mime: fmt.mime, format: fmt.format };
}

// SFNT 容器级矫正。仅作用于 TrueType / OpenType（"OTTO"）；WOFF / WOFF2 的二进制
// 结构不同，直接放行（嵌入字体在 PowerPoint 中只可能是 sfnt 形式）。
function sanitizeSfnt(input: Uint8Array): Uint8Array | undefined {
  if (input.byteLength < 12) return input;
  const sig = (input[0]! << 24) | (input[1]! << 16) | (input[2]! << 8) | input[3]!;
  // 仅处理 TrueType (0x00010000 / "true") 与 OpenType ("OTTO")。
  const isSfnt = sig === 0x00010000 || sig === 0x74727565 || sig === 0x4f54544f;
  if (!isSfnt) return input;
  // 复制一份，所有改写都在副本上做。
  const buf = new Uint8Array(input);
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const numTables = dv.getUint16(4, false);
  if (numTables === 0) return buf;

  interface TableEntry {
    tag: string;
    checksum: number;
    offset: number;
    length: number;
  }
  const entries: TableEntry[] = [];
  for (let i = 0; i < numTables; i++) {
    const recOff = 12 + i * 16;
    const tag = String.fromCharCode(
      buf[recOff]!,
      buf[recOff + 1]!,
      buf[recOff + 2]!,
      buf[recOff + 3]!,
    );
    const checksum = dv.getUint32(recOff + 4, false);
    const offset = dv.getUint32(recOff + 8, false);
    const length = dv.getUint32(recOff + 12, false);
    entries.push({ tag, checksum, offset, length });
  }

  // Step 1 — cmap 子表 language 字段矫正。OpenType §cmap：format 12 / 13 / 14
  // 在 platform != 1 (Mac) 时 language 必须为 0；许多 PPT 嵌入字体直接保留了
  // Windows 区域语言 ID（1007、2052 等），现代浏览器会因此拒绝整份字体。
  const cmap = entries.find((e) => e.tag === "cmap");
  if (cmap && cmap.length >= 4) {
    const co = cmap.offset;
    const numSubs = dv.getUint16(co + 2, false);
    for (let k = 0; k < numSubs && co + 4 + k * 8 + 8 <= co + cmap.length; k++) {
      const subRec = co + 4 + k * 8;
      const subOff = dv.getUint32(subRec + 4, false);
      const absOff = co + subOff;
      if (absOff + 4 > buf.byteLength) continue;
      const fmt = dv.getUint16(absOff, false);
      // format 12 / 13：language 在子表偏移 +8（uint32）。format 14 不含 language。
      if (fmt === 12 || fmt === 13) {
        if (absOff + 12 <= buf.byteLength) {
          dv.setUint32(absOff + 8, 0, false);
        }
      } else if (fmt === 4 || fmt === 6 || fmt === 0 || fmt === 2) {
        // 这些 16-bit 子表的 language 在 +4（uint16）。也按 platform 强制 0。
        // 仅当对应 encoding record 的 platformID != 1 (Mac) 时归零，保守起见这里
        // 默认归零——OTS 自身的行为就是 platform != 1 时拒非零 language。
        const plat = dv.getUint16(subRec, false);
        if (plat !== 1 && absOff + 6 <= buf.byteLength) {
          dv.setUint16(absOff + 4, 0, false);
        }
      }
    }
  }

  // Step 2 — 剔除 length == 0 的表（例如 PowerPoint MTX 解压常见的空 cvt）。
  // 这类表在表目录里占了 16 字节但没有数据，OTS 会判定为非法。把表目录裁掉、
  // 重新计算 SFNT 头四个搜索字段，并用现有表数据按 4 字节对齐重组容器。
  const empty = entries.filter((e) => e.length === 0);
  if (empty.length === 0) {
    // 只做了 cmap 矫正：重新计算各表 checksum + head.checksumAdjustment 后返回。
    recomputeChecksums(buf, entries);
    return buf;
  }

  return rebuildSfnt(
    buf,
    entries.filter((e) => e.length > 0),
    sig,
  );
}

function recomputeChecksums(buf: Uint8Array, entries: Array<{ tag: string; offset: number; length: number }>): void {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  // 先把 head.checksumAdjustment 置零，重算 head 校验和。
  const head = entries.find((e) => e.tag === "head");
  if (head && head.length >= 12) {
    dv.setUint32(head.offset + 8, 0, false);
  }
  // 重算每张表的 checksum，写回表目录。
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]!;
    const cs = tableChecksum(buf, e.offset, e.length);
    dv.setUint32(12 + i * 16 + 4, cs, false);
  }
  // 计算整体文件 checksum 并写回 head.checksumAdjustment。
  if (head && head.length >= 12) {
    const totalCs = tableChecksum(buf, 0, buf.byteLength);
    const adjust = (0xb1b0afba - totalCs) >>> 0;
    dv.setUint32(head.offset + 8, adjust, false);
  }
}

function rebuildSfnt(
  src: Uint8Array,
  keep: Array<{ tag: string; offset: number; length: number }>,
  sig: number,
): Uint8Array {
  // 表目录必须按 tag 字典序排序（OpenType §file structure）。
  const ordered = [...keep].sort((a, b) => (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0));
  const numTables = ordered.length;
  let entrySelector = 0;
  while (1 << (entrySelector + 1) <= numTables) entrySelector++;
  const searchRange = (1 << entrySelector) * 16;
  const rangeShift = (numTables * 16 - searchRange) >>> 0;

  // 表目录后紧跟表数据，按 4 字节对齐。
  const dirSize = 12 + numTables * 16;
  let dataSize = 0;
  const dataOff: number[] = [];
  for (const e of ordered) {
    dataOff.push(dirSize + dataSize);
    dataSize += (e.length + 3) & ~3;
  }
  const out = new Uint8Array(dirSize + dataSize);
  const dvOut = new DataView(out.buffer);
  dvOut.setUint32(0, sig >>> 0, false);
  dvOut.setUint16(4, numTables, false);
  dvOut.setUint16(6, searchRange, false);
  dvOut.setUint16(8, entrySelector, false);
  dvOut.setUint16(10, rangeShift, false);

  // 先拷贝每张表的数据到目标偏移。
  for (let i = 0; i < ordered.length; i++) {
    const e = ordered[i]!;
    out.set(src.subarray(e.offset, e.offset + e.length), dataOff[i]!);
  }

  // 把 head.checksumAdjustment 置零，准备重算。
  const headIdx = ordered.findIndex((e) => e.tag === "head");
  if (headIdx >= 0 && ordered[headIdx]!.length >= 12) {
    dvOut.setUint32(dataOff[headIdx]! + 8, 0, false);
  }

  // 写表目录，逐表算 checksum。
  for (let i = 0; i < ordered.length; i++) {
    const e = ordered[i]!;
    const rec = 12 + i * 16;
    out[rec] = e.tag.charCodeAt(0);
    out[rec + 1] = e.tag.charCodeAt(1);
    out[rec + 2] = e.tag.charCodeAt(2);
    out[rec + 3] = e.tag.charCodeAt(3);
    const cs = tableChecksum(out, dataOff[i]!, e.length);
    dvOut.setUint32(rec + 4, cs, false);
    dvOut.setUint32(rec + 8, dataOff[i]!, false);
    dvOut.setUint32(rec + 12, e.length, false);
  }

  // 总体校验和 + head.checksumAdjustment。
  if (headIdx >= 0 && ordered[headIdx]!.length >= 12) {
    const totalCs = tableChecksum(out, 0, out.byteLength);
    const adjust = (0xb1b0afba - totalCs) >>> 0;
    dvOut.setUint32(dataOff[headIdx]! + 8, adjust, false);
  }

  return out;
}

// OpenType 标准表 checksum：以 32 位大端整数为单位求和，末尾若不足 4 字节补 0。
function tableChecksum(buf: Uint8Array, offset: number, length: number): number {
  const padded = (length + 3) & ~3;
  let sum = 0;
  for (let i = 0; i < padded; i += 4) {
    const b0 = i < length ? buf[offset + i]! : 0;
    const b1 = i + 1 < length ? buf[offset + i + 1]! : 0;
    const b2 = i + 2 < length ? buf[offset + i + 2]! : 0;
    const b3 = i + 3 < length ? buf[offset + i + 3]! : 0;
    sum = (sum + ((b0 << 24) | (b1 << 16) | (b2 << 8) | b3)) >>> 0;
  }
  return sum;
}

function detectFontFormat(
  bytes: Uint8Array,
): { mime: string; format: EmbeddedFont["format"] } | undefined {
  if (bytes.byteLength < 4) return undefined;
  const sig = (bytes[0]! << 24) | (bytes[1]! << 16) | (bytes[2]! << 8) | bytes[3]!;
  // sfnt 标志：TrueType 用 0x00010000；Apple TrueType collection prefix "true"；
  // OpenType 用 "OTTO"；WOFF/WOFF2 各自前 4 字节签名。
  if (sig === 0x00010000 || sig === 0x74727565) {
    return { mime: "font/ttf", format: "truetype" };
  }
  if (sig === 0x4f54544f) {
    return { mime: "font/otf", format: "opentype" };
  }
  if (sig === 0x774f4646) {
    return { mime: "font/woff", format: "woff" };
  }
  if (sig === 0x774f4632) {
    return { mime: "font/woff2", format: "woff2" };
  }
  return undefined;
}
