"use strict";
// MediaTable：把 ImagePaint / pic shape 的 src 注册成一组 ppt/media/image{N}.{ext} 文件，
// 并返回稳定的 rIdN 给 OOXML 的 a:blip / p:blipFill 引用。
//
// 抽到独立文件主要是避免循环 import：pptx-roundtrip 和 pptx-write / pptx-shapes 都需要
// 它，而 pptx-write 已经 import pptx-roundtrip。
Object.defineProperty(exports, "__esModule", { value: true });
exports.MediaTable = exports.SlideMediaTable = exports.RefSlideMediaTable = exports.RefDeckMediaRegistry = exports.DeckMediaRegistry = exports.REL_TYPE_MODEL3D = exports.REL_TYPE_OFFICE_MEDIA = exports.REL_TYPE_AUDIO = exports.REL_TYPE_VIDEO = exports.REL_TYPE_IMAGE = void 0;
exports.isExternalMediaSrc = isExternalMediaSrc;
exports.blipRidAttr = blipRidAttr;
exports.mediaNamePrefix = mediaNamePrefix;
exports.mediaRelationshipXml = mediaRelationshipXml;
exports.parseMediaRef = parseMediaRef;
const zip_write_1 = require("./zip-write");
const xml_util_1 = require("./xml-util");
/** `file:` / `http(s):` 外链：写 r:link + TargetMode=External，不要把 URL 字符串当 PNG 字节塞进 ppt/media。 */
function isExternalMediaSrc(src) {
    return !!src && /^(https?:|file:)/i.test(src);
}
/** `<a:blip>` 引用：外链用 r:link，嵌入用 r:embed。 */
function blipRidAttr(src, rid) {
    return isExternalMediaSrc(src) ? `r:link="${rid}"` : `r:embed="${rid}"`;
}
exports.REL_TYPE_IMAGE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image";
exports.REL_TYPE_VIDEO = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/video";
exports.REL_TYPE_AUDIO = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/audio";
exports.REL_TYPE_OFFICE_MEDIA = "http://schemas.microsoft.com/office/2007/relationships/media";
exports.REL_TYPE_MODEL3D = "http://schemas.microsoft.com/office/2017/relationships/model3d";
function mediaNamePrefix(mime) {
    if (mime === "model/gltf-binary" || mime === "model/gltf+json")
        return "model3d";
    if (mime.startsWith("video/") || mime.startsWith("audio/"))
        return "media";
    return "image";
}
function mediaBasename(idx, mime) {
    const ext = (0, zip_write_1.mimeToExt)(mime);
    return `${mediaNamePrefix(mime)}${idx}.${ext}`;
}
function mediaRelationshipXml(item) {
    const type = item.relType || exports.REL_TYPE_IMAGE;
    if (item.external || isExternalMediaSrc(item.src)) {
        return `<Relationship Id="${item.relId}" Type="${type}" Target="${(0, xml_util_1.esc)(item.src ?? "")}" TargetMode="External"/>`;
    }
    return `<Relationship Id="${item.relId}" Type="${type}" Target="../media/${item.name ?? ""}"/>`;
}
function decodeImageSrc(src) {
    if (src.startsWith("data:")) {
        const decoded = (0, zip_write_1.dataUrlToBytes)(src);
        if (decoded)
            return decoded;
        return { bytes: new Uint8Array(0), mime: "image/png" };
    }
    return { bytes: new TextEncoder().encode(src), mime: "image/png" };
}
/**
 * 解析前端产生的媒体引用 token。约定格式 `pptmedia:<mime>:<id>`；
 * 兜底兼容遗留的 data URL 头（`data:<mime>;...`）与裸字符串。
 */
function parseMediaRef(ref) {
    const m = /^pptmedia:([^:]+):/.exec(ref);
    if (m)
        return { mime: m[1] };
    const d = /^data:([^;,]+)[;,]/.exec(ref);
    if (d)
        return { mime: d[1] };
    return { mime: "image/png" };
}
/** Deck 级 media 文件池：同一张图只写一次 ppt/media/imageN.ext。 */
class DeckMediaRegistry {
    srcToName = new Map();
    files = new Map();
    nextIdx = 1;
    ensureFile(src) {
        const hit = this.srcToName.get(src);
        if (hit)
            return hit;
        const { bytes, mime } = decodeImageSrc(src);
        const name = mediaBasename(this.nextIdx++, mime);
        this.srcToName.set(src, name);
        this.files.set(name, bytes);
        return name;
    }
    createPartTable() {
        return new SlideMediaTable(this);
    }
    fileEntries() {
        return [...this.files.entries()].map(([name, bytes]) => ({ name, bytes }));
    }
    getBytes(name) {
        return this.files.get(name) ?? new Uint8Array(0);
    }
}
exports.DeckMediaRegistry = DeckMediaRegistry;
/**
 * 引用式 deck media 池（服务端「分离生成」专用）。
 * 与 DeckMediaRegistry 的唯一区别：**不解码字节**，仅根据引用 token 里的 mime 分配
 * imageN.ext 文件名 + rId，并累积 manifest。字节由前端本地在 assembleDeck 时补入。
 */
class RefDeckMediaRegistry {
    refToName = new Map();
    manifest = [];
    nextIdx = 1;
    ensureFile(ref) {
        const hit = this.refToName.get(ref);
        if (hit)
            return hit;
        const { mime } = parseMediaRef(ref);
        const name = mediaBasename(this.nextIdx++, mime);
        this.refToName.set(ref, name);
        this.manifest.push({ zipPath: `ppt/media/${name}`, ref, mime });
        return name;
    }
    createPartTable() {
        return new RefSlideMediaTable(this);
    }
    manifestEntries() {
        return [...this.manifest];
    }
}
exports.RefDeckMediaRegistry = RefDeckMediaRegistry;
function relKey(src, relType) {
    return `${relType}\t${src}`;
}
/** RefDeckMediaRegistry 的 per-part 表：镜像 SlideMediaTable 的 rId 语义，但不携带字节。 */
class RefSlideMediaTable {
    deck;
    keyToRelIdx = new Map();
    items = [];
    constructor(deck) {
        this.deck = deck;
    }
    registerRel(ref, relType) {
        const key = relKey(ref, relType);
        const existing = this.keyToRelIdx.get(key);
        if (existing !== undefined)
            return `rId${existing}`;
        const idx = this.items.length + 1;
        if (isExternalMediaSrc(ref)) {
            this.items.push({ name: "", mime: "image/png", src: ref, relType, external: true });
        }
        else {
            const name = this.deck.ensureFile(ref);
            const { mime } = parseMediaRef(ref);
            this.items.push({ name, mime, src: ref, relType });
        }
        this.keyToRelIdx.set(key, idx);
        return `rId${idx}`;
    }
    registerImage(ref) {
        return this.registerRel(ref, exports.REL_TYPE_IMAGE);
    }
    registerMedia(src) {
        return this.registerImage(src);
    }
    list() {
        return this.items.map((it, i) => ({ ...it, relId: `rId${i + 1}` }));
    }
}
exports.RefSlideMediaTable = RefSlideMediaTable;
/**
 * 单 slide 的 rel 表：rId 从 rId1 起 per-slide 编号，但 media 文件名走 DeckMediaRegistry
 * 去重。解决「slide B 复用 slide A 已注册的图片 src 时，B 的 rels 缺 rId」的问题。
 */
class SlideMediaTable {
    deck;
    keyToRelIdx = new Map();
    items = [];
    constructor(deck) {
        this.deck = deck;
    }
    registerRel(src, relType) {
        const key = relKey(src, relType);
        const existing = this.keyToRelIdx.get(key);
        if (existing !== undefined)
            return `rId${existing}`;
        const idx = this.items.length + 1;
        if (isExternalMediaSrc(src)) {
            this.items.push({ name: "", mime: "image/png", src, relType, external: true });
        }
        else {
            const name = this.deck.ensureFile(src);
            const { mime } = decodeImageSrc(src);
            this.items.push({ name, mime, src, relType });
        }
        this.keyToRelIdx.set(key, idx);
        return `rId${idx}`;
    }
    registerImage(src) {
        return this.registerRel(src, exports.REL_TYPE_IMAGE);
    }
    registerMedia(src) {
        return this.registerImage(src);
    }
    list() {
        return this.items.map((it, i) => ({
            ...it,
            bytes: it.external ? new Uint8Array(0) : this.deck.getBytes(it.name),
            relId: `rId${i + 1}`,
        }));
    }
}
exports.SlideMediaTable = SlideMediaTable;
class MediaTable {
    items = [];
    keyMap = new Map();
    registerRel(src, relType) {
        const key = relKey(src, relType);
        const existing = this.keyMap.get(key);
        if (existing !== undefined)
            return `rId${existing}`;
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
        }
        else {
            const { bytes, mime } = decodeImageSrc(src);
            const name = mediaBasename(idx, mime);
            this.items.push({ name, bytes, mime, src, relType });
        }
        this.keyMap.set(key, idx);
        return `rId${idx}`;
    }
    registerImage(src) {
        return this.registerRel(src, exports.REL_TYPE_IMAGE);
    }
    registerMedia(src) {
        return this.registerImage(src);
    }
    list() {
        return this.items.map((it, i) => ({ ...it, relId: `rId${i + 1}` }));
    }
}
exports.MediaTable = MediaTable;
