import type { DeckComment } from "./slide";
/** presentation tags part 中 Pavera 批注元数据键名。新文件写 Pavera，读取仍认 2026-11-27 之前写入的 SlimPPT 键。 */
export declare const COMMENT_META_TAG = "Pavera.Comments.v1";
export declare const COMMENT_META_TAG_LEGACY = "SlimPPT.Comments.v1";
export interface CommentMetaKey {
    slideIndex: number;
    author: string;
    createdAt: number;
    text: string;
}
export declare function commentMetaKey(c: DeckComment): CommentMetaKey;
/** 序列化 resolved / parentId（OOXML classic cmLst 不支持的字段）。 */
export declare function buildCommentMeta(comments: DeckComment[] | undefined): string | undefined;
/** 从 tags 侧车恢复 resolved / parentId（按稳定键匹配批注；已解决且未写出 cm 的批注会重建）。 */
export declare function applyCommentMeta(comments: DeckComment[], raw: string | undefined): void;
