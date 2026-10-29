/** `file:` / `http(s):` 外链：写 r:link + TargetMode=External，不要把 URL 字符串当 PNG 字节塞进 ppt/media。 */
export declare function isExternalMediaSrc(src: string | undefined): boolean;
/** `<a:blip>` 引用：外链用 r:link，嵌入用 r:embed。 */
export declare function blipRidAttr(src: string, rid: string): string;
export declare const REL_TYPE_IMAGE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image";
export declare const REL_TYPE_VIDEO = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/video";
export declare const REL_TYPE_AUDIO = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/audio";
export declare const REL_TYPE_OFFICE_MEDIA = "http://schemas.microsoft.com/office/2007/relationships/media";
export declare const REL_TYPE_MODEL3D = "http://schemas.microsoft.com/office/2017/relationships/model3d";
export declare function mediaNamePrefix(mime: string): string;
export declare function mediaRelationshipXml(item: {
    relId: string;
    name?: string;
    relType?: string;
    src?: string;
    external?: boolean;
}): string;
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
export declare function parseMediaRef(ref: string): {
    mime: string;
};
/** Deck 级 media 文件池：同一张图只写一次 ppt/media/imageN.ext。 */
export declare class DeckMediaRegistry implements DeckMediaPool {
    private srcToName;
    private files;
    private nextIdx;
    ensureFile(src: string): string;
    createPartTable(): PartMediaTable;
    fileEntries(): Array<{
        name: string;
        bytes: Uint8Array;
    }>;
    getBytes(name: string): Uint8Array;
}
/**
 * 引用式 deck media 池（服务端「分离生成」专用）。
 * 与 DeckMediaRegistry 的唯一区别：**不解码字节**，仅根据引用 token 里的 mime 分配
 * imageN.ext 文件名 + rId，并累积 manifest。字节由前端本地在 assembleDeck 时补入。
 */
export declare class RefDeckMediaRegistry implements DeckMediaPool {
    private refToName;
    private manifest;
    private nextIdx;
    ensureFile(ref: string): string;
    createPartTable(): PartMediaTable;
    manifestEntries(): MediaManifestEntry[];
}
/** RefDeckMediaRegistry 的 per-part 表：镜像 SlideMediaTable 的 rId 语义，但不携带字节。 */
export declare class RefSlideMediaTable implements PartMediaTable {
    private deck;
    private keyToRelIdx;
    private items;
    constructor(deck: RefDeckMediaRegistry);
    registerRel(ref: string, relType: string): string;
    registerImage(ref: string): string;
    registerMedia(src: string): string;
    list(): MediaListItem[];
}
/**
 * 单 slide 的 rel 表：rId 从 rId1 起 per-slide 编号，但 media 文件名走 DeckMediaRegistry
 * 去重。解决「slide B 复用 slide A 已注册的图片 src 时，B 的 rels 缺 rId」的问题。
 */
export declare class SlideMediaTable implements PartMediaTable {
    private deck;
    private keyToRelIdx;
    private items;
    constructor(deck: DeckMediaRegistry);
    registerRel(src: string, relType: string): string;
    registerImage(src: string): string;
    registerMedia(src: string): string;
    list(): Array<MediaListItem & {
        bytes: Uint8Array;
    }>;
}
export declare class MediaTable implements MediaRegistrar {
    private items;
    private keyMap;
    registerRel(src: string, relType: string): string;
    registerImage(src: string): string;
    registerMedia(src: string): string;
    list(): Array<MediaListItem & {
        bytes: Uint8Array;
    }>;
}
