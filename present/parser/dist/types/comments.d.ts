import type { DeckComment } from "@sliiu/present-core";
import type { PptxArchive } from "./zip.js";
import { type RelMap } from "./parts.js";
import { type ModernAuthorIndex } from "./modern-comments.js";
/** 从 presentation tags part 读取指定 SlimPPT 侧车键（绕过超大 tagLst 的常规解析限制）。 */
export declare function loadMetaTagFromArchive(archive: PptxArchive, presRels: RelMap, tagName: string): string | undefined;
/** 从 presentation tags part 读取 SlimPPT 批注元数据。 */
export declare function loadCommentMetaFromArchive(archive: PptxArchive, presRels: RelMap): string | undefined;
export interface CommentAuthorIndex {
    byId: Map<number, string>;
}
export declare function loadCommentAuthors(archive: PptxArchive, presRels: RelMap): CommentAuthorIndex;
export declare function loadSlideComments(archive: PptxArchive, slideRels: RelMap, authors: CommentAuthorIndex, slideIndex: number, modernAuthors?: ModernAuthorIndex): {
    comments: DeckComment[];
    commentsPartPath?: string;
    commentsModern?: boolean;
};
/** 将 classic cmLst 扁平批注按作者 + 锚点邻近 + 时间链重建 parentId 线程。 */
export declare function linkImportedCommentThreads(comments: DeckComment[]): void;
