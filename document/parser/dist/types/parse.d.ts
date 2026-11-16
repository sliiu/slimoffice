import { type Document } from "@sliiu/document-core";
export type DocxOpenErrorCode = "LEGACY_DOC" | "ENCRYPTED_DOCX";
export declare class DocxOpenError extends Error {
    readonly code: DocxOpenErrorCode;
    constructor(code: DocxOpenErrorCode, message: string);
}
export declare function parseDocx(input: ArrayBuffer | Uint8Array | Blob): Promise<Document>;
