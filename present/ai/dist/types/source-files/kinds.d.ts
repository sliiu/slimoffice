export type SourceKind = "pdf" | "docx" | "xlsx" | "legacy" | "image" | "text" | "document" | "unknown";
export interface IncomingSourceFile {
    name: string;
    mediaType: string;
    bytes: Uint8Array;
}
export declare function topicFromSourceName(name: string): string;
export declare function classifySourceFile(name: string, mediaType: string): SourceKind;
export declare function mediaTypeForKind(kind: SourceKind, given: string, name?: string): string;
