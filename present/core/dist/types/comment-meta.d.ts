import type { DeckComment } from "./slide.js";
/** presentation tags part 中 SlimPPT 批注元数据键名。 */
export declare const COMMENT_META_TAG = "SlimPPT.Comments.v1";
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
