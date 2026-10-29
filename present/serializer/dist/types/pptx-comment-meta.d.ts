import type { Presentation } from "@sliiu/present-core";
export declare const REL_TYPE_TAGS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/tags";
export declare const CT_TAGS = "application/vnd.openxmlformats.org/presentationml.tags+xml";
type MutableArchive = {
    files: Map<string, Uint8Array>;
};
/** 把 SlimPPT 扩展元数据 + 用户 `customData.tags` 写入 presentation tags 部件。 */
export declare function patchSlimPptSidecarTags(pres: Presentation, archive: MutableArchive, opts?: {
    debug?: boolean;
}): void;
/**
 * from-scratch：把 presentation tags（用户 tagLst + SlimPPT 侧车）写进文本部件表。
 * 缓存恢复丢掉 `__source` 后走这条路径，否则保护 / 插件 / 批注元数据会丢。
 */
export declare function injectScratchPresentationTags(pres: Presentation, files: Record<string, string>): void;
/** from-scratch：slide `cSld/custDataLst` + 独立 tags 部件。 */
export declare function injectScratchSlideTags(pres: Presentation, files: Record<string, string>): void;
/** round-trip：slide `cSld/custDataLst` 用户标签。未改动时保留原字节。 */
export declare function patchSlideCustomDataTags(pres: Presentation, archive: MutableArchive, opts?: {
    debug?: boolean;
}): void;
/** @deprecated 使用 {@link patchSlimPptSidecarTags} */
export declare function patchCommentMetaTags(pres: Presentation, archive: MutableArchive, opts?: {
    debug?: boolean;
}): void;
export {};
