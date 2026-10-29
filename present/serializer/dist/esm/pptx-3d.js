import { getOrigin, isDirty } from "@sliiu/present-core";
import { getChildren, getTagName, localName, parseFragmentAsChildren, setChildren, } from "./raw-xml.js";
import { angleToEmu, esc, parseColor, pxToEmu } from "./xml-util.js";
/** Strip runtime bake fields — only OOXML-round-trippable 3D params remain. */
export function meta3DForWrite(info) {
    if (!info)
        return undefined;
    const sp3d = info.sp3d && Object.keys(info.sp3d).length ? info.sp3d : undefined;
    const scene3d = info.scene3d && Object.keys(info.scene3d).length ? info.scene3d : undefined;
    if (!sp3d && !scene3d)
        return undefined;
    return { sp3d: sp3d ?? {}, scene3d };
}
export function hasMeta3DForWrite(info) {
    return meta3DForWrite(info) !== undefined;
}
// §20.1.5.6 contourClr / §20.1.5.7 extrusionClr 都是 CT_Color：直接放颜色元素，不套 solidFill。
function solidColorXml(color) {
    const parsed = parseColor(color);
    return `<a:srgbClr val="${parsed.hex}"/>`;
}
function sphereXml(s) {
    return `<a:rot lat="${angleToEmu(s.lat)}" lon="${angleToEmu(s.lon)}" rev="${angleToEmu(s.rev)}"/>`;
}
function bevelXml(tag, b) {
    const attrs = [];
    if (b.w !== undefined)
        attrs.push(`w="${pxToEmu(b.w)}"`);
    if (b.h !== undefined)
        attrs.push(`h="${pxToEmu(b.h)}"`);
    if (b.prst)
        attrs.push(`prst="${esc(b.prst)}"`);
    return attrs.length ? `<${tag} ${attrs.join(" ")}/>` : `<${tag}/>`;
}
function cameraXml(c) {
    const attrs = [];
    if (c.prst)
        attrs.push(`prst="${esc(c.prst)}"`);
    if (c.fov !== undefined)
        attrs.push(`fov="${angleToEmu(c.fov)}"`);
    if (c.zoom !== undefined)
        attrs.push(`zoom="${Math.round(c.zoom * 100000)}"`);
    const rot = c.rot ? sphereXml(c.rot) : "";
    return attrs.length || rot ? `<a:camera ${attrs.join(" ")}>${rot}</a:camera>` : "";
}
function lightRigXml(l) {
    const attrs = [];
    if (l.rig)
        attrs.push(`rig="${esc(l.rig)}"`);
    if (l.dir)
        attrs.push(`dir="${esc(l.dir)}"`);
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
            inner.push(`<a:anchor x="${pxToEmu(bd.anchor.x)}" y="${pxToEmu(bd.anchor.y)}" z="${pxToEmu(bd.anchor.z)}"/>`);
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
        attrs.push(`extrusionH="${pxToEmu(sp.extrusionH)}"`);
    if (sp.contourW !== undefined)
        attrs.push(`contourW="${pxToEmu(sp.contourW)}"`);
    if (sp.prstMaterial)
        attrs.push(`prstMaterial="${esc(sp.prstMaterial)}"`);
    if (sp.z !== undefined)
        attrs.push(`z="${pxToEmu(sp.z)}"`);
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
        inner.push(`<a:flatTx z="${pxToEmu(sp.flatTx.z)}"/>`);
    if (!attrs.length && !inner.length)
        return "";
    return `<a:sp3d ${attrs.join(" ")}>${inner.join("")}</a:sp3d>`;
}
/** `<a:scene3d>…</a:scene3d><a:sp3d>…</a:sp3d>` fragment for spPr / new shapes. */
export function meta3DToXml(info) {
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
export function meta3DEqual(a, b) {
    return JSON.stringify(meta3DForWrite(a)) === JSON.stringify(meta3DForWrite(b));
}
const SP3D_LOCALS = new Set(["scene3d", "sp3d"]);
function strip3DNodes(children) {
    return children.filter((c) => !SP3D_LOCALS.has(localName(getTagName(c) ?? "")));
}
/** Sync `<a:scene3d>` / `<a:sp3d>` under `<p:spPr>` from `shape.meta3D`. */
export function patchSpPr3DIn(spPr, shape, opts, partPath) {
    const desired = meta3DForWrite(shape.meta3D);
    const origin = getOrigin(shape)?.meta3D;
    if (!hasMeta3DForWrite(desired) && !origin)
        return;
    if (!isDirty(shape, "meta3D") &&
        meta3DEqual(desired, origin) &&
        (!desired || meta3DEqual(desired, shape.meta3D))) {
        return;
    }
    const children = getChildren(spPr);
    const without3d = strip3DNodes(children);
    const desiredXml = meta3DToXml(shape.meta3D);
    if (!desiredXml) {
        if (without3d.length !== children.length) {
            setChildren(spPr, without3d);
            if (opts.debug)
                console.log(`[roundtrip] ${partPath} spPr 3D cleared`);
        }
        return;
    }
    const desiredNodes = parseFragmentAsChildren(desiredXml);
    if (!desiredNodes.length)
        return;
    const existingScene = children.find((c) => localName(getTagName(c) ?? "") === "scene3d");
    const existingSp = children.find((c) => localName(getTagName(c) ?? "") === "sp3d");
    const desiredScene = desiredNodes.find((c) => localName(getTagName(c) ?? "") === "scene3d");
    const desiredSp = desiredNodes.find((c) => localName(getTagName(c) ?? "") === "sp3d");
    if (JSON.stringify(existingScene) === JSON.stringify(desiredScene) &&
        JSON.stringify(existingSp) === JSON.stringify(desiredSp) &&
        without3d.length === children.length - (existingScene ? 1 : 0) - (existingSp ? 1 : 0)) {
        return;
    }
    const extIdx = without3d.findIndex((c) => localName(getTagName(c) ?? "") === "extLst");
    const insertAt = extIdx >= 0 ? extIdx : without3d.length;
    const next = [...without3d.slice(0, insertAt), ...desiredNodes, ...without3d.slice(insertAt)];
    setChildren(spPr, next);
    if (opts.debug)
        console.log(`[roundtrip] ${partPath} spPr 3D patched`);
}
