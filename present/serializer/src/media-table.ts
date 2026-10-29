// MediaTable：把 ImagePaint / pic shape 的 src 注册成一组 ppt/media/image{N}.{ext} 文件，
// 并返回稳定的 rIdN 给 OOXML 的 a:blip / p:blipFill 引用。
//
// 抽到独立文件主要是避免循环 import：pptx-roundtrip 和 pptx-write / pptx-shapes 都需要
// 它，而 pptx-write 已经 import pptx-roundtrip。

import { dataUrlToBytes, mimeToExt } from "./zip-write";
import { esc } from "./xml-util";

/** `file:` / `http(s):` 外链：写 r:link + TargetMode=External，不要把 URL 字符串当 PNG 字节塞进 ppt/media。 */
export function isExternalMediaSrc(src: string | undefined): boolean {
  return !!src && /^(https?:|file:)/i.test(src);
}

/** `<a:blip>` 引用：外链用 r:link，嵌入用 r:embed。 */
export function blipRidAttr(src: string, rid: string): string {
  return isExternalMediaSrc(src) ? `r:link="${rid}"` : `r:embed="${rid}"`;
}

export const REL_TYPE_IMAGE =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image";
export const REL_TYPE_VIDEO =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/video";
export const REL_TYPE_AUDIO =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/audio";
export const REL_TYPE_OFFICE_MEDIA =
  "http://schemas.microsoft.com/office/2007/relationships/media";
export const REL_TYPE_MODEL3D =
  "http://schemas.microsoft.com/office/2017/relationships/model3d";

export function mediaNamePrefix(mime: string): string {
  if (mime === "model/gltf-binary" || mime === "model/gltf+json") return "model3d";
  if (mime.startsWith("video/") || mime.startsWith("audio/")) return "media";
  return "image";
}

function mediaBasename(idx: number, mime: string): string {
  const ext = mimeToExt(mime);
  return `${mediaNamePrefix(mime)}${idx}.${ext}`;
}

export function mediaRelationshipXml(item: {
  relId: string;
  name?: string;
  relType?: string;
  src?: string;
  external?: boolean;
}): string {
  const type = item.relType || REL_TYPE_IMAGE;
  if (item.external || isExternalMediaSrc(item.src)) {
    return `<Relationship Id="${item.relId}" Type="${type}" Target="${esc(item.src ?? "")}" TargetMode="External"/>`;
  }
  return `<Relationship Id="${item.relId}" Type="${type}" Target="../media/${item.name ?? ""}"/>`;
}

function decodeImageSrc(src: string): { bytes: Uint8Array; mime: string } {
  if (src.startsWith("data:")) {
    const decoded = dataUrlToBytes(src);
    if (decoded) return decoded;
    return { bytes: new Uint8Array(0), mime: "image/png" };
  }
  return { bytes: new TextEncoder().encode(src), mime: "image/png" };
}

/** 最小 media 注册接口 —— MediaTable / SlideMediaTable 均实现。 */
export interface MediaRegistrar {
  registerImage(src: string): string;
  /** 任意媒体 data URL → part 级 rId（默认 image 关系；切换音等仍走这条）。 */
  registerMedia(src: string): string;
  /** 指定 OOXML 关系类型（video / audio / office media / model3d / image）。同 src 不同 type 各占一个 rId。 */
  registerRel(src: string, relType: string): string;
}

/** per-part rel 表暴露给 rels 渲染器的最小字段（bytes 可选，服务端引用模式不带字节）。 */
export interface MediaListItem {
  name: string;
  relId: string;
  mime: string;
  src: string;
  bytes?: Uint8Array;
  relType?: string;
  /** 外链（file:/http(s):）：rels 写 TargetMode=External，zip 内无对应 ppt/media 文件。 */
  external?: boolean;
}

/** 单个部件（slide / master / layout）的 media rel 表。 */
export interface PartMediaTable extends MediaRegistrar {
  list(): MediaListItem[];
}

/** deck 级 media 池：负责分配 ppt/media/imageN.ext 文件名 + 派发 per-part 表。 */
export interface DeckMediaPool {
  createPartTable(): PartMediaTable;
}

/**
 * 服务端「分离生成」用的 media manifest 项：告诉前端某个 zip 路径应写入哪份媒体字节。
 * ref 是前端在 stripMediaToRefs 里产生的引用 token（前端据此回查本地字节）。
 */
export interface MediaManifestEntry {
  zipPath: string;
  ref: string;
  mime: string;
}

/**
 * 解析前端产生的媒体引用 token。约定格式 `pptmedia:<mime>:<id>`；
 * 兜底兼容遗留的 data URL 头（`data:<mime>;...`）与裸字符串。
 */
export function parseMediaRef(ref: string): { mime: string } {
  const m = /^pptmedia:([^:]+):/.exec(ref);
  if (m) return { mime: m[1]! };
  const d = /^data:([^;,]+)[;,]/.exec(ref);
  if (d) return { mime: d[1]! };
  return { mime: "image/png" };
}

/** Deck 级 media 文件池：同一张图只写一次 ppt/media/imageN.ext。 */
export class DeckMediaRegistry implements DeckMediaPool {
  private srcToName = new Map<string, string>();
  private files = new Map<string, Uint8Array>();
  private nextIdx = 1;

  ensureFile(src: string): string {
    const hit = this.srcToName.get(src);
    if (hit) return hit;
    const { bytes, mime } = decodeImageSrc(src);
    const name = mediaBasename(this.nextIdx++, mime);
    this.srcToName.set(src, name);
    this.files.set(name, bytes);
    return name;
  }

  createPartTable(): PartMediaTable {
    return new SlideMediaTable(this);
  }

  fileEntries(): Array<{ name: string; bytes: Uint8Array }> {
    return [...this.files.entries()].map(([name, bytes]) => ({ name, bytes }));
  }

  getBytes(name: string): Uint8Array {
    return this.files.get(name) ?? new Uint8Array(0);
  }
}

/**
 * 引用式 deck media 池（服务端「分离生成」专用）。
 * 与 DeckMediaRegistry 的唯一区别：**不解码字节**，仅根据引用 token 里的 mime 分配
 * imageN.ext 文件名 + rId，并累积 manifest。字节由前端本地在 assembleDeck 时补入。
 */
export class RefDeckMediaRegistry implements DeckMediaPool {
  private refToName = new Map<string, string>();
  private manifest: MediaManifestEntry[] = [];
  private nextIdx = 1;

  ensureFile(ref: string): string {
    const hit = this.refToName.get(ref);
    if (hit) return hit;
    const { mime } = parseMediaRef(ref);
    const name = mediaBasename(this.nextIdx++, mime);
    this.refToName.set(ref, name);
    this.manifest.push({ zipPath: `ppt/media/${name}`, ref, mime });
    return name;
  }

  createPartTable(): PartMediaTable {
    return new RefSlideMediaTable(this);
  }

  manifestEntries(): MediaManifestEntry[] {
    return [...this.manifest];
  }
}

function relKey(src: string, relType: string): string {
  return `${relType}\t${src}`;
}

/** RefDeckMediaRegistry 的 per-part 表：镜像 SlideMediaTable 的 rId 语义，但不携带字节。 */
export class RefSlideMediaTable implements PartMediaTable {
  private keyToRelIdx = new Map<string, number>();
  private items: Array<{ name: string; mime: string; src: string; relType: string; external?: boolean }> = [];

  constructor(private deck: RefDeckMediaRegistry) {}

  registerRel(ref: string, relType: string): string {
    const key = relKey(ref, relType);
    const existing = this.keyToRelIdx.get(key);
    if (existing !== undefined) return `rId${existing}`;
    const idx = this.items.length + 1;
    if (isExternalMediaSrc(ref)) {
      this.items.push({ name: "", mime: "image/png", src: ref, relType, external: true });
    } else {
      const name = this.deck.ensureFile(ref);
      const { mime } = parseMediaRef(ref);
      this.items.push({ name, mime, src: ref, relType });
    }
    this.keyToRelIdx.set(key, idx);
    return `rId${idx}`;
  }

  registerImage(ref: string): string {
    return this.registerRel(ref, REL_TYPE_IMAGE);
  }

  registerMedia(src: string): string {
    return this.registerImage(src);
  }

  list(): MediaListItem[] {
    return this.items.map((it, i) => ({ ...it, relId: `rId${i + 1}` }));
  }
}

/**
 * 单 slide 的 rel 表：rId 从 rId1 起 per-slide 编号，但 media 文件名走 DeckMediaRegistry
 * 去重。解决「slide B 复用 slide A 已注册的图片 src 时，B 的 rels 缺 rId」的问题。
 */
export class SlideMediaTable implements PartMediaTable {
  private keyToRelIdx = new Map<string, number>();
  private items: Array<{ name: string; mime: string; src: string; relType: string; external?: boolean }> = [];

  constructor(private deck: DeckMediaRegistry) {}

  registerRel(src: string, relType: string): string {
    const key = relKey(src, relType);
    const existing = this.keyToRelIdx.get(key);
    if (existing !== undefined) return `rId${existing}`;
    const idx = this.items.length + 1;
    if (isExternalMediaSrc(src)) {
      this.items.push({ name: "", mime: "image/png", src, relType, external: true });
    } else {
      const name = this.deck.ensureFile(src);
      const { mime } = decodeImageSrc(src);
      this.items.push({ name, mime, src, relType });
    }
    this.keyToRelIdx.set(key, idx);
    return `rId${idx}`;
  }

  registerImage(src: string): string {
    return this.registerRel(src, REL_TYPE_IMAGE);
  }

  registerMedia(src: string): string {
    return this.registerImage(src);
  }

  list(): Array<MediaListItem & { bytes: Uint8Array }> {
    return this.items.map((it, i) => ({
      ...it,
      bytes: it.external ? new Uint8Array(0) : this.deck.getBytes(it.name),
      relId: `rId${i + 1}`,
    }));
  }
}

export class MediaTable implements MediaRegistrar {
  private items: Array<{
    name: string;
    bytes: Uint8Array;
    mime: string;
    src: string;
    relType: string;
    external?: boolean;
  }> = [];
  private keyMap = new Map<string, number>();

  registerRel(src: string, relType: string): string {
    const key = relKey(src, relType);
    const existing = this.keyMap.get(key);
    if (existing !== undefined) return `rId${existing}`;
    const idx = this.items.length + 1;
    if (isExternalMediaSrc(src)) {
      this.items.push({
        name: "",
        bytes: new Uint8Array(0),
        mime: "image/png",
        src,
        relType,
        external: true,
      });
    } else {
      const { bytes, mime } = decodeImageSrc(src);
      const name = mediaBasename(idx, mime);
      this.items.push({ name, bytes, mime, src, relType });
    }
    this.keyMap.set(key, idx);
    return `rId${idx}`;
  }

  registerImage(src: string): string {
    return this.registerRel(src, REL_TYPE_IMAGE);
  }

  registerMedia(src: string): string {
    return this.registerImage(src);
  }

  list(): Array<MediaListItem & { bytes: Uint8Array }> {
    return this.items.map((it, i) => ({ ...it, relId: `rId${i + 1}` }));
  }
}
