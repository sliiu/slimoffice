"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.meta3DForWrite = meta3DForWrite;
exports.hasMeta3DForWrite = hasMeta3DForWrite;
exports.meta3DToXml = meta3DToXml;
exports.meta3DEqual = meta3DEqual;
exports.patchSpPr3DIn = patchSpPr3DIn;
const core_1 = require("@sliiu/present-core");
const raw_xml_1 = require("./raw-xml");
const xml_util_1 = require("./xml-util");
/** Strip runtime bake fields — only OOXML-round-trippable 3D params remain. */
function meta3DForWrite(info) {
    if (!info)
        return undefined;
    const sp3d = info.sp3d && Object.keys(info.sp3d).length ? info.sp3d : undefined;
    const scene3d = info.scene3d && Object.keys(info.scene3d).length ? info.scene3d : undefined;
    if (!sp3d && !scene3d)
        return undefined;
    return { sp3d: sp3d ?? {}, scene3d };
}
function hasMeta3DForWrite(info) {
    return meta3DForWrite(info) !== undefined;
}
// §20.1.5.6 contourClr / §20.1.5.7 extrusionClr 都是 CT_Color：直接放颜色元素，不套 solidFill。
function solidColorXml(color) {
    const parsed = (0, xml_util_1.parseColor)(color);
    return `<a:srgbClr val="${parsed.hex}"/>`;
}
function sphereXml(s) {
    return `<a:rot lat="${(0, xml_util_1.angleToEmu)(s.lat)}" lon="${(0, xml_util_1.angleToEmu)(s.lon)}" rev="${(0, xml_util_1.angleToEmu)(s.rev)}"/>`;
}
function bevelXml(tag, b) {
    const attrs = [];
    if (b.w !== undefined)
        attrs.push(`w="${(0, xml_util_1.pxToEmu)(b.w)}"`);
    if (b.h !== undefined)
        attrs.push(`h="${(0, xml_util_1.pxToEmu)(b.h)}"`);
    if (b.prst)
        attrs.push(`prst="${(0, xml_util_1.esc)(b.prst)}"`);
    return attrs.length ? `<${tag} ${attrs.join(" ")}/>` : `<${tag}/>`;
}
function cameraXml(c) {
    const attrs = [];
    if (c.prst)
        attrs.push(`prst="${(0, xml_util_1.esc)(c.prst)}"`);
    if (c.fov !== undefined)
        attrs.push(`fov="${(0, xml_util_1.angleToEmu)(c.fov)}"`);
    if (c.zoom !== undefined)
        attrs.push(`zoom="${Math.round(c.zoom * 100000)}"`);
    const rot = c.rot ? sphereXml(c.rot) : "";
    return attrs.length || rot ? `<a:camera ${attrs.join(" ")}>${rot}</a:camera>` : "";
}
function lightRigXml(l) {
    const attrs = [];
    if (l.rig)
        attrs.push(`rig="${(0, xml_util_1.esc)(l.rig)}"`);
    if (l.dir)
        attrs.push(`dir="${(0, xml_util_1.esc)(l.dir)}"`);
    const rot = l.rot ? sphereXml(l.rot) : "";
    return attrs.length || rot ? `<a:lightRig ${attrs.join(" ")}>${rot}</a:lightRig>` : "";
}
function scene3dToXml(scene) {
    const parts = [];
    if (scene.camera) {
        const cam = cameraXml(scene.camera);
        if (cam)
            parts.push(cam);
    }
    if (scene.lightRig) {
        const lr = lightRigXml(scene.lightRig);
        if (lr)
            parts.push(lr);
    }
    if (scene.backdrop) {
        const bd = scene.backdrop;
        const inner = [];
        if (bd.anchor) {
            inner.push(`<a:anchor x="${(0, xml_util_1.pxToEmu)(bd.anchor.x)}" y="${(0, xml_util_1.pxToEmu)(bd.anchor.y)}" z="${(0, xml_util_1.pxToEmu)(bd.anchor.z)}"/>`);
        }
        if (bd.norm) {
            inner.push(`<a:norm dx="${bd.norm.dx}" dy="${bd.norm.dy}" dz="${bd.norm.dz}"/>`);
        }
        if (bd.up) {
            inner.push(`<a:up dx="${bd.up.dx}" dy="${bd.up.dy}" dz="${bd.up.dz}"/>`);
        }
        if (inner.length)
            parts.push(`<a:backdrop>${inner.join("")}</a:backdrop>`);
    }
    if (!parts.length)
        return "";
    return `<a:scene3d>${parts.join("")}</a:scene3d>`;
}
function sp3dToXml(sp) {
    const attrs = [];
    if (sp.extrusionH !== undefined)
        attrs.push(`extrusionH="${(0, xml_util_1.pxToEmu)(sp.extrusionH)}"`);
    if (sp.contourW !== undefined)
        attrs.push(`contourW="${(0, xml_util_1.pxToEmu)(sp.contourW)}"`);
    if (sp.prstMaterial)
        attrs.push(`prstMaterial="${(0, xml_util_1.esc)(sp.prstMaterial)}"`);
    if (sp.z !== undefined)
        attrs.push(`z="${(0, xml_util_1.pxToEmu)(sp.z)}"`);
    const inner = [];
    if (sp.bevelT)
        inner.push(bevelXml("a:bevelT", sp.bevelT));
    if (sp.bevelB)
        inner.push(bevelXml("a:bevelB", sp.bevelB));
    if (sp.contourClr)
        inner.push(`<a:contourClr>${solidColorXml(sp.contourClr)}</a:contourClr>`);
    if (sp.extrusionClr)
        inner.push(`<a:extrusionClr>${solidColorXml(sp.extrusionClr)}</a:extrusionClr>`);
    if (sp.flatTx)
        inner.push(`<a:flatTx z="${(0, xml_util_1.pxToEmu)(sp.flatTx.z)}"/>`);
    if (!attrs.length && !inner.length)
        return "";
    return `<a:sp3d ${attrs.join(" ")}>${inner.join("")}</a:sp3d>`;
}
/** `<a:scene3d>…</a:scene3d><a:sp3d>…</a:sp3d>` fragment for spPr / new shapes. */
function meta3DToXml(info) {
    const w = meta3DForWrite(info);
    if (!w)
        return "";
    const parts = [];
    if (w.scene3d) {
        const scene = scene3dToXml(w.scene3d);
        if (scene)
            parts.push(scene);
    }
    if (w.sp3d) {
        const sp = sp3dToXml(w.sp3d);
        if (sp)
            parts.push(sp);
    }
    return parts.join("");
}
function meta3DEqual(a, b) {
    return JSON.stringify(meta3DForWrite(a)) === JSON.stringify(meta3DForWrite(b));
}
const SP3D_LOCALS = new Set(["scene3d", "sp3d"]);
function strip3DNodes(children) {
    return children.filter((c) => !SP3D_LOCALS.has((0, raw_xml_1.localName)((0, raw_xml_1.getTagName)(c) ?? "")));
}
/** Sync `<a:scene3d>` / `<a:sp3d>` under `<p:spPr>` from `shape.meta3D`. */
function patchSpPr3DIn(spPr, shape, opts, partPath) {
    const desired = meta3DForWrite(shape.meta3D);
    const origin = (0, core_1.getOrigin)(shape)?.meta3D;
    if (!hasMeta3DForWrite(desired) && !origin)
        return;
    if (!(0, core_1.isDirty)(shape, "meta3D") &&
        meta3DEqual(desired, origin) &&
        (!desired || meta3DEqual(desired, shape.meta3D))) {
        return;
    }
    const children = (0, raw_xml_1.getChildren)(spPr);
    const without3d = strip3DNodes(children);
    const desiredXml = meta3DToXml(shape.meta3D);
    if (!desiredXml) {
        if (without3d.length !== children.length) {
            (0, raw_xml_1.setChildren)(spPr, without3d);
            if (opts.debug)
                console.log(`[roundtrip] ${partPath} spPr 3D cleared`);
        }
        return;
    }
    const desiredNodes = (0, raw_xml_1.parseFragmentAsChildren)(desiredXml);
    if (!desiredNodes.length)
        return;
    const existingScene = children.find((c) => (0, raw_xml_1.localName)((0, raw_xml_1.getTagName)(c) ?? "") === "scene3d");
    const existingSp = children.find((c) => (0, raw_xml_1.localName)((0, raw_xml_1.getTagName)(c) ?? "") === "sp3d");
    const desiredScene = desiredNodes.find((c) => (0, raw_xml_1.localName)((0, raw_xml_1.getTagName)(c) ?? "") === "scene3d");
    const desiredSp = desiredNodes.find((c) => (0, raw_xml_1.localName)((0, raw_xml_1.getTagName)(c) ?? "") === "sp3d");
    if (JSON.stringify(existingScene) === JSON.stringify(desiredScene) &&
        JSON.stringify(existingSp) === JSON.stringify(desiredSp) &&
        without3d.length === children.length - (existingScene ? 1 : 0) - (existingSp ? 1 : 0)) {
        return;
    }
    const extIdx = without3d.findIndex((c) => (0, raw_xml_1.localName)((0, raw_xml_1.getTagName)(c) ?? "") === "extLst");
    const insertAt = extIdx >= 0 ? extIdx : without3d.length;
    const next = [...without3d.slice(0, insertAt), ...desiredNodes, ...without3d.slice(insertAt)];
    (0, raw_xml_1.setChildren)(spPr, next);
    if (opts.debug)
        console.log(`[roundtrip] ${partPath} spPr 3D patched`);
}
