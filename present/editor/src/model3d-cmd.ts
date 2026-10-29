import type { EditCommand, Model3DShape, Presentation, Rect } from "@ppt/core";
import { MODEL3D_PRESETS, identityTransform } from "@ppt/core";

let model3dSeq = 1;

export function model3DPresetById(id: string) {
  return MODEL3D_PRESETS.find((p) => p.id === id);
}

/** Build a `Model3DShape` for editor insert (caller supplies resolved `glbSrc` data URL). */
export function buildModel3DShape(
  presetId: string,
  glbSrc: string,
  bbox: Rect,
  objectName?: string,
): Model3DShape {
  const preset = model3DPresetById(presetId);
  const id = `model3d_${presetId}_${model3dSeq++}`;
  return {
    id,
    name: objectName ?? preset?.label ?? "3D Model",
    zIndex: 0,
    kind: "model3d",
    bbox,
    transform: identityTransform(),
    objectName: objectName ?? preset?.label ?? "3D Model",
    glbSrc,
    camera: { preset: "orbit", rot: { lat: 15, lon: 25 } },
    visible: true,
    locked: false,
    opacity: 1,
  };
}

/** Insert a built-in or custom glTF model onto the active slide layer. */
export class InsertModel3DCmd implements EditCommand {
  readonly label = "Insert 3D model";
  readonly shape: Model3DShape;

  constructor(
    private slideIdx: number,
    private layerIdx: number,
    presetId: string,
    glbSrc: string,
    bbox: Rect,
    objectName?: string,
  ) {
    this.shape = buildModel3DShape(presetId, glbSrc, bbox, objectName);
  }

  apply(pres: Presentation): void {
    const slide = pres.slides[this.slideIdx];
    const layer = slide?.layers[this.layerIdx];
    if (!layer) return;
    layer.shapes.push(this.shape);
  }

  revert(pres: Presentation): void {
    const slide = pres.slides[this.slideIdx];
    const layer = slide?.layers[this.layerIdx];
    if (!layer) return;
    const pos = layer.shapes.findIndex((s) => s.id === this.shape.id);
    if (pos >= 0) layer.shapes.splice(pos, 1);
  }
}

function model3dShapeAt(pres: Presentation, slideIdx: number, id: string): Model3DShape | undefined {
  const slide = pres.slides[slideIdx];
  if (!slide) return undefined;
  for (const layer of slide.layers) {
    const s = layer.shapes.find((sh) => sh.id === id);
    if (s?.kind === "model3d") return s as Model3DShape;
  }
  return undefined;
}

/** Swap glTF payload on an existing 3D model shape. */
export class UpdateModel3DGlbCmd implements EditCommand {
  readonly label = "Replace 3D model";
  private prev?: {
    glbSrc?: string;
    name?: string;
    objectName?: string;
    rasterSrc?: string;
    rasterPath?: string;
  };

  constructor(
    private slideIdx: number,
    private shapeId: string,
    private glbSrc: string,
    private newName?: string,
  ) {}

  apply(pres: Presentation): void {
    const shape = model3dShapeAt(pres, this.slideIdx, this.shapeId);
    if (!shape) return;
    this.prev = {
      glbSrc: shape.glbSrc,
      name: shape.name,
      objectName: shape.objectName,
      rasterSrc: shape.rasterSrc,
      rasterPath: shape.rasterPath,
    };
    shape.glbSrc = this.glbSrc;
    delete shape.rasterSrc;
    delete shape.rasterPath;
    if (this.newName?.trim()) {
      shape.name = this.newName.trim();
      shape.objectName = this.newName.trim();
    }
  }

  revert(pres: Presentation): void {
    const shape = model3dShapeAt(pres, this.slideIdx, this.shapeId);
    if (!shape || !this.prev) return;
    shape.glbSrc = this.prev.glbSrc;
    if (this.prev.name !== undefined) shape.name = this.prev.name;
    if (this.prev.objectName !== undefined) shape.objectName = this.prev.objectName;
    if (this.prev.rasterSrc !== undefined) shape.rasterSrc = this.prev.rasterSrc;
    else delete shape.rasterSrc;
    if (this.prev.rasterPath !== undefined) shape.rasterPath = this.prev.rasterPath;
    else delete shape.rasterPath;
  }
}
