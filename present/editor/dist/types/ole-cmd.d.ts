import type { EditCommand, OleObjectShape, Presentation, Rect } from "@sliiu/present-core";
export interface BuildOleShapeInput {
    fileName: string;
    embedSrc: string;
    bbox: Rect;
    showAsIcon?: boolean;
}
/** Build an `OleObjectShape` for editor insert. */
export declare function buildOleShape(input: BuildOleShapeInput): OleObjectShape;
/** Download the embedded OLE payload (original file bytes as data URL). */
export declare function downloadOleEmbed(doc: Document, shape: OleObjectShape): void;
/** Byte length of an OLE `embedSrc` data URL (for UI labels). */
export declare function oleEmbedByteSize(embedSrc: string | undefined): number | null;
/** Byte length of any `data:...;base64,...` URL (video / audio / glTF / OLE). */
export declare function dataUrlByteSize(dataUrl: string | undefined): number | null;
export declare const OLE_EMBED_WARN_BYTES: number;
export declare function isOleEmbedOverLimit(bytes: number | null, limit?: number): boolean;
export declare function formatByteSize(bytes: number): string;
/** Insert an embedded OLE object onto the active slide layer. */
export declare class InsertOleCmd implements EditCommand {
    private slideIdx;
    private layerIdx;
    readonly label = "Insert object";
    readonly shape: OleObjectShape;
    constructor(slideIdx: number, layerIdx: number, input: BuildOleShapeInput);
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
/** Replace embedded file bytes on an existing OLE shape. */
export declare class UpdateOleEmbedCmd implements EditCommand {
    private slideIdx;
    private shapeId;
    private fileName;
    private embedSrc;
    readonly label = "Replace embedded object";
    private snapshot?;
    constructor(slideIdx: number, shapeId: string, fileName: string, embedSrc: string);
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
export declare class SetOleShowAsIconCmd implements EditCommand {
    private slideIdx;
    private shapeId;
    private showAsIcon;
    readonly label = "Embedded object as icon";
    private prev?;
    constructor(slideIdx: number, shapeId: string, showAsIcon: boolean);
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
