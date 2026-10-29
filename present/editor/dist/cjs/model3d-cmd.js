"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpdateModel3DGlbCmd = exports.InsertModel3DCmd = void 0;
exports.model3DPresetById = model3DPresetById;
exports.buildModel3DShape = buildModel3DShape;
const core_1 = require("@sliiu/present-core");
let model3dSeq = 1;
function model3DPresetById(id) {
    return core_1.MODEL3D_PRESETS.find((p) => p.id === id);
}
/** Build a `Model3DShape` for editor insert (caller supplies resolved `glbSrc` data URL). */
function buildModel3DShape(presetId, glbSrc, bbox, objectName) {
    const preset = model3DPresetById(presetId);
    const id = `model3d_${presetId}_${model3dSeq++}`;
    return {
        id,
        name: objectName ?? preset?.label ?? "3D Model",
        zIndex: 0,
        kind: "model3d",
        bbox,
        transform: (0, core_1.identityTransform)(),
        objectName: objectName ?? preset?.label ?? "3D Model",
        glbSrc,
        camera: { preset: "orbit", rot: { lat: 15, lon: 25 } },
        visible: true,
        locked: false,
        opacity: 1,
    };
}
/** Insert a built-in or custom glTF model onto the active slide layer. */
class InsertModel3DCmd {
    slideIdx;
    layerIdx;
    label = "Insert 3D model";
    shape;
    constructor(slideIdx, layerIdx, presetId, glbSrc, bbox, objectName) {
        this.slideIdx = slideIdx;
        this.layerIdx = layerIdx;
        this.shape = buildModel3DShape(presetId, glbSrc, bbox, objectName);
    }
    apply(pres) {
        const slide = pres.slides[this.slideIdx];
        const layer = slide?.layers[this.layerIdx];
        if (!layer)
            return;
        layer.shapes.push(this.shape);
    }
    revert(pres) {
        const slide = pres.slides[this.slideIdx];
        const layer = slide?.layers[this.layerIdx];
        if (!layer)
            return;
        const pos = layer.shapes.findIndex((s) => s.id === this.shape.id);
        if (pos >= 0)
            layer.shapes.splice(pos, 1);
    }
}
exports.InsertModel3DCmd = InsertModel3DCmd;
function model3dShapeAt(pres, slideIdx, id) {
    const slide = pres.slides[slideIdx];
    if (!slide)
        return undefined;
    for (const layer of slide.layers) {
        const s = layer.shapes.find((sh) => sh.id === id);
        if (s?.kind === "model3d")
            return s;
    }
    return undefined;
}
/** Swap glTF payload on an existing 3D model shape. */
class UpdateModel3DGlbCmd {
    slideIdx;
    shapeId;
    glbSrc;
    newName;
    label = "Replace 3D model";
    prev;
    constructor(slideIdx, shapeId, glbSrc, newName) {
        this.slideIdx = slideIdx;
        this.shapeId = shapeId;
        this.glbSrc = glbSrc;
        this.newName = newName;
    }
    apply(pres) {
        const shape = model3dShapeAt(pres, this.slideIdx, this.shapeId);
        if (!shape)
            return;
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
    revert(pres) {
        const shape = model3dShapeAt(pres, this.slideIdx, this.shapeId);
        if (!shape || !this.prev)
            return;
        shape.glbSrc = this.prev.glbSrc;
        if (this.prev.name !== undefined)
            shape.name = this.prev.name;
        if (this.prev.objectName !== undefined)
            shape.objectName = this.prev.objectName;
        if (this.prev.rasterSrc !== undefined)
            shape.rasterSrc = this.prev.rasterSrc;
        else
            delete shape.rasterSrc;
        if (this.prev.rasterPath !== undefined)
            shape.rasterPath = this.prev.rasterPath;
        else
            delete shape.rasterPath;
    }
}
exports.UpdateModel3DGlbCmd = UpdateModel3DGlbCmd;
