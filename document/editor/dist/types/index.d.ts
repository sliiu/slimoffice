import { type Document } from "@sliiu/document-core";
export interface DocumentView {
    destroy(): void;
}
/** Read-only pages. Editing comes later, so this view never changes the document. */
export declare function mountDocument(host: HTMLElement, document: Document): DocumentView;
