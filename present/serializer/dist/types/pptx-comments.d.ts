import type { DeckComment } from "@sliiu/present-core";
export declare const REL_TYPE_COMMENTS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments";
export declare const REL_TYPE_COMMENT_AUTHORS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/commentAuthors";
export declare const CT_COMMENTS = "application/vnd.openxmlformats-officedocument.presentationml.comments+xml";
export declare const CT_COMMENT_AUTHORS = "application/vnd.openxmlformats-officedocument.presentationml.commentAuthors+xml";
/** 导出到 OOXML 时跳过已解决批注（classic cmLst 无 resolved 字段）。 */
export declare function exportableComments(comments: DeckComment[] | undefined): DeckComment[];
export declare function slideCommentsForExport(comments: DeckComment[] | undefined, slideIndex: number, modern: boolean): DeckComment[];
export declare function commentsSnapshotForSlide(comments: DeckComment[] | undefined, slideIndex: number, modern?: boolean): string;
export declare function buildCommentAuthors(comments: DeckComment[]): {
    authors: Array<{
        id: number;
        name: string;
        lastIdx: number;
    }>;
    authorIdByName: Map<string, number>;
};
export declare function renderCommentAuthorsXml(authors: Array<{
    id: number;
    name: string;
    lastIdx: number;
}>): string;
export declare function renderCommentsXml(comments: DeckComment[], authorIdByName: Map<string, number>, slideSize: {
    width: number;
    height: number;
}): string;
