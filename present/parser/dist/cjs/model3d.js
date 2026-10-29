"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MODEL3D_GRAPHIC_URI = void 0;
exports.parseModel3DGraphicFrame = parseModel3DGraphicFrame;
const units_1 = require("./units");
const xml_1 = require("./xml");
const zip_1 = require("./zip");
exports.MODEL3D_GRAPHIC_URI = "http://schemas.microsoft.com/office/drawing/2017/model3d";
function parseRot(el) {
    if (!el)
        return undefined;
    const lat = (0, xml_1.attr)(el, "lat");
    const lon = (0, xml_1.attr)(el, "lon");
    const rev = (0, xml_1.attr)(el, "rev");
    if (lat === undefined && lon === undefined && rev === undefined)
        return undefined;
    return {
        lat: lat !== undefined ? (0, units_1.angle60kToDeg)(lat) : undefined,
        lon: lon !== undefined ? (0, units_1.angle60kToDeg)(lon) : undefined,
        rev: rev !== undefined ? (0, units_1.angle60kToDeg)(rev) : undefined,
    };
}
function parseVec3(parent, local) {
    const el = parent ? (0, xml_1.findByLocalName)(parent, local) : undefined;
    if (!el)
        return undefined;
    const x = (0, xml_1.attr)(el, "x");
    const y = (0, xml_1.attr)(el, "y");
    const z = (0, xml_1.attr)(el, "z");
    if (x === undefined && y === undefined && z === undefined)
        return undefined;
    const xf = x !== undefined ? (0, units_1.emuToPx)(x) : 0;
    const yf = y !== undefined ? (0, units_1.emuToPx)(y) : 0;
    const zf = z !== undefined ? (0, units_1.emuToPx)(z) : 0;
    return { x: xf, y: yf, z: zf };
}
function resolvePartPath(rels, relId) {
    if (!relId || !rels)
        return undefined;
    const raw = rels.resolve(relId);
    if (!raw)
        return undefined;
    return raw.includes("..") && rels.ownerPath ? (0, zip_1.joinPath)(rels.ownerPath, raw) : raw;
}
/** Parse `<a:graphicData uri="…/model3d">` → `Model3DShape`. */
function parseModel3DGraphicFrame(graphicData, meta, bbox, transform, ctx) {
    const uri = (0, xml_1.attr)(graphicData, "uri");
    const modelEl = (0, xml_1.findByLocalName)(graphicData, "model3d");
    if (!modelEl && uri !== exports.MODEL3D_GRAPHIC_URI)
        return null;
    if (!modelEl)
        return null;
    const glbRel = (0, xml_1.attr)(modelEl, "r:embed") ?? (0, xml_1.attr)(modelEl, "embed");
    const glbPath = resolvePartPath(ctx?.rels, glbRel);
    const resolve = ctx?.resolveMedia ?? ctx?.resolveImage;
    const glbSrc = glbPath && resolve ? resolve(glbPath) : undefined;
    const rasterEl = (0, xml_1.findByLocalName)(modelEl, "raster");
    const rasterRel = rasterEl ? (0, xml_1.attr)(rasterEl, "r:embed") ?? (0, xml_1.attr)(rasterEl, "embed") : undefined;
    const rasterPath = resolvePartPath(ctx?.rels, rasterRel);
    const rasterSrc = rasterPath && ctx?.resolveImage ? ctx.resolveImage(rasterPath) : undefined;
    const cameraEl = (0, xml_1.findByLocalName)(modelEl, "camera");
    const camera = cameraEl
        ? {
            preset: (0, xml_1.attr)(cameraEl, "prst"),
            rot: parseRot((0, xml_1.findByLocalName)(cameraEl, "rot")),
        }
        : undefined;
    const transEl = (0, xml_1.findByLocalName)(modelEl, "trans");
    const modelTransform = transEl
        ? {
            scale: parseVec3(transEl, "scale"),
            rot: parseRot((0, xml_1.findByLocalName)(transEl, "rot")),
            off: parseVec3(transEl, "off"),
        }
        : undefined;
    return {
        ...meta,
        kind: "model3d",
        bbox,
        transform,
        objectName: meta.name,
        glbPath,
        glbSrc,
        rasterPath,
        rasterSrc,
        camera,
        modelTransform,
        fill: { kind: "solid", color: "#f8fafc", alpha: 1 },
        stroke: { paint: { kind: "solid", color: "#94a3b8" }, width: 1 },
    };
}
