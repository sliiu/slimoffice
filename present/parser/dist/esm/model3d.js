import { angle60kToDeg, emuToPx } from "./units.js";
import { attr, findByLocalName } from "./xml.js";
import { joinPath } from "./zip.js";
export const MODEL3D_GRAPHIC_URI = "http://schemas.microsoft.com/office/drawing/2017/model3d";
function parseRot(el) {
    if (!el)
        return undefined;
    const lat = attr(el, "lat");
    const lon = attr(el, "lon");
    const rev = attr(el, "rev");
    if (lat === undefined && lon === undefined && rev === undefined)
        return undefined;
    return {
        lat: lat !== undefined ? angle60kToDeg(lat) : undefined,
        lon: lon !== undefined ? angle60kToDeg(lon) : undefined,
        rev: rev !== undefined ? angle60kToDeg(rev) : undefined,
    };
}
function parseVec3(parent, local) {
    const el = parent ? findByLocalName(parent, local) : undefined;
    if (!el)
        return undefined;
    const x = attr(el, "x");
    const y = attr(el, "y");
    const z = attr(el, "z");
    if (x === undefined && y === undefined && z === undefined)
        return undefined;
    const xf = x !== undefined ? emuToPx(x) : 0;
    const yf = y !== undefined ? emuToPx(y) : 0;
    const zf = z !== undefined ? emuToPx(z) : 0;
    return { x: xf, y: yf, z: zf };
}
function resolvePartPath(rels, relId) {
    if (!relId || !rels)
        return undefined;
    const raw = rels.resolve(relId);
    if (!raw)
        return undefined;
    return raw.includes("..") && rels.ownerPath ? joinPath(rels.ownerPath, raw) : raw;
}
/** Parse `<a:graphicData uri="…/model3d">` → `Model3DShape`. */
export function parseModel3DGraphicFrame(graphicData, meta, bbox, transform, ctx) {
    const uri = attr(graphicData, "uri");
    const modelEl = findByLocalName(graphicData, "model3d");
    if (!modelEl && uri !== MODEL3D_GRAPHIC_URI)
        return null;
    if (!modelEl)
        return null;
    const glbRel = attr(modelEl, "r:embed") ?? attr(modelEl, "embed");
    const glbPath = resolvePartPath(ctx?.rels, glbRel);
    const resolve = ctx?.resolveMedia ?? ctx?.resolveImage;
    const glbSrc = glbPath && resolve ? resolve(glbPath) : undefined;
    const rasterEl = findByLocalName(modelEl, "raster");
    const rasterRel = rasterEl ? attr(rasterEl, "r:embed") ?? attr(rasterEl, "embed") : undefined;
    const rasterPath = resolvePartPath(ctx?.rels, rasterRel);
    const rasterSrc = rasterPath && ctx?.resolveImage ? ctx.resolveImage(rasterPath) : undefined;
    const cameraEl = findByLocalName(modelEl, "camera");
    const camera = cameraEl
        ? {
            preset: attr(cameraEl, "prst"),
            rot: parseRot(findByLocalName(cameraEl, "rot")),
        }
        : undefined;
    const transEl = findByLocalName(modelEl, "trans");
    const modelTransform = transEl
        ? {
            scale: parseVec3(transEl, "scale"),
            rot: parseRot(findByLocalName(transEl, "rot")),
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
