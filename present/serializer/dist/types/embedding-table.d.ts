export declare const OLE_OBJECT_REL_TYPE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/oleObject";
export interface OleEmbeddingRegistrar {
    registerOle(embedSrc: string, fileName?: string): string;
}
export interface OleEmbeddingListItem {
    name: string;
    relId: string;
    bytes: Uint8Array;
}
export declare class DeckEmbeddingRegistry {
    private srcToName;
    private files;
    private nextIdx;
    ensureFile(src: string): {
        name: string;
        bytes: Uint8Array;
    };
    createPartTable(): SlideOleEmbeddingTable;
    fileEntries(): Array<{
        name: string;
        bytes: Uint8Array;
    }>;
}
export declare class SlideOleEmbeddingTable implements OleEmbeddingRegistrar {
    private deck;
    private srcToRelIdx;
    private items;
    constructor(deck: DeckEmbeddingRegistry);
    registerOle(embedSrc: string, _fileName?: string): string;
    list(): OleEmbeddingListItem[];
}
