import type { DeckComment } from "@sliiu/present-core";
import type { PptxArchive } from "./zip.js";
import { type RelMap } from "./parts.js";
export interface ModernAuthorIndex {
    byId: Map<string, string>;
}
export declare function loadModernAuthors(archive: PptxArchive, presRels: RelMap): ModernAuthorIndex;
export declare function loadModernSlideComments(archive: PptxArchive, slideRels: RelMap, authors: ModernAuthorIndex, slideIndex: number): {
    comments: DeckComment[];
    commentsPartPath?: string;
    commentsModern: boolean;
};
export declare function modernAuthorsPartPath(_archive: PptxArchive, presRels: RelMap): string | undefined;
