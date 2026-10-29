import type { EditCommand, Model3DShape, Presentation, Rect } from "@sliiu/present-core";
export declare function model3DPresetById(id: string): import("@sliiu/present-core").Model3DPreset | undefined;
/** Build a `Model3DShape` for editor insert (caller supplies resolved `glbSrc` data URL). */
export declare function buildModel3DShape(presetId: string, glbSrc: string, bbox: Rect, objectName?: string): Model3DShape;
/** Insert a built-in or custom glTF model onto the active slide layer. */
export declare class InsertModel3DCmd implements EditCommand {
    private slideIdx;
    private layerIdx;
    readonly label = "Insert 3D model";
    readonly shape: Model3DShape;
    constructor(slideIdx: number, layerIdx: number, presetId: string, glbSrc: string, bbox: Rect, objectName?: string);
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
/** Swap glTF payload on an existing 3D model shape. */
export declare class UpdateModel3DGlbCmd implements EditCommand {
    private slideIdx;
    private shapeId;
    private glbSrc;
    private newName?;
    readonly label = "Replace 3D model";
    private prev?;
    constructor(slideIdx: number, shapeId: string, glbSrc: string, newName?: string | undefined);
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
