import type { DeckComment } from "@sliiu/present-core";
export declare const P188_NS = "http://schemas.microsoft.com/office/powerpoint/2018/8/main";
export declare const REL_MODERN_COMMENTS = "http://schemas.microsoft.com/office/2018/10/relationships/comments";
export declare const REL_MODERN_AUTHORS = "http://schemas.microsoft.com/office/2018/10/relationships/authors";
export declare const CT_MODERN_COMMENTS = "application/vnd.ms-powerpoint.comments+xml";
export declare const CT_MODERN_AUTHORS = "application/vnd.ms-powerpoint.authors+xml";
export interface ModernAuthor {
    id: string;
    name: string;
}
/** Deck uses threaded / resolved comments, or source was Office 2021+ modern format. */
export declare function shouldUseModernComments(comments: DeckComment[] | undefined, commentsModern?: boolean): boolean;
export declare function commentModernId(c: DeckComment): string;
export declare function buildModernAuthors(comments: DeckComment[], existing?: Map<string, string>): {
    authors: ModernAuthor[];
    authorIdByName: Map<string, string>;
};
export declare function renderModernAuthorsXml(authors: ModernAuthor[]): string;
/** Office 2021+ comment part: threaded replies in replyLst + status for resolved. */
export declare function renderModernCommentsXml(comments: DeckComment[], authorIdByName: Map<string, string>, slideSize: {
    width: number;
    height: number;
}): string;
export declare function isModernCommentsXml(xml: string): boolean;
/** Parse author name → GUID from an existing modern authors part. */
export declare function parseModernAuthorsFromXml(xml: string): Map<string, string>;
export declare function isModernCommentsPartPath(partPath: string): boolean;
