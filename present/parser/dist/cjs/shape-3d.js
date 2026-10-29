"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parse3DInfo = parse3DInfo;
const xml_1 = require("./xml");
const units_1 = require("./units");
const theme_1 = require("./theme");
/** `<a:rot lat lon rev>` → 度（原值 ÷ 60000）。 */
function parseSphere(rot) {
    return {
        lat: Number((0, xml_1.attr)(rot, "lat") ?? "0") / 60000,
        lon: Number((0, xml_1.attr)(rot, "lon") ?? "0") / 60000,
        rev: Number((0, xml_1.attr)(rot, "rev") ?? "0") / 60000,
    };
}
/** §20.1.5.4 EG_Bevel：忠实记录 w/h/prst；缺省的 w/h 留 undefined，由效果层补默认。 */
function parseBevel(bevel) {
    if (!bevel)
        return undefined;
    const out = {};
    const w = (0, xml_1.attr)(bevel, "w");
    if (w !== undefined)
        out.w = (0, units_1.emuToPx)(w);
    const h = (0, xml_1.attr)(bevel, "h");
    if (h !== undefined)
        out.h = (0, units_1.emuToPx)(h);
    const prst = (0, xml_1.attr)(bevel, "prst");
    if (prst)
        out.prst = prst;
    return out;
}
/**
 * 忠实解析 spPr / bodyPr 下的 `<a:scene3d>` 和 `<a:sp3d>` → Sp3DInfo。
 * 只记录 XML 实际写了的内容；preset → 具体相机/材质/默认值 的映射在渲染侧效果层。
 */
function parse3DInfo(spPr, theme) {
    if (!spPr)
        return undefined;
    const sp3dEl = (0, xml_1.findByLocalName)(spPr, "sp3d");
    const scene3dEl = (0, xml_1.findByLocalName)(spPr, "scene3d");
    if (!sp3dEl && !scene3dEl)
        return undefined;
    const sp3d = {};
    if (sp3dEl) {
        const ex = (0, xml_1.attr)(sp3dEl, "extrusionH");
        if (ex !== undefined)
            sp3d.extrusionH = (0, units_1.emuToPx)(ex);
        const cw = (0, xml_1.attr)(sp3dEl, "contourW");
        if (cw !== undefined)
            sp3d.contourW = (0, units_1.emuToPx)(cw);
        const prstMat = (0, xml_1.attr)(sp3dEl, "prstMaterial");
        if (prstMat)
            sp3d.prstMaterial = prstMat;
        const bevelT = parseBevel((0, xml_1.findByLocalName)(sp3dEl, "bevelT"));
        if (bevelT)
            sp3d.bevelT = bevelT;
        const bevelB = parseBevel((0, xml_1.findByLocalName)(sp3dEl, "bevelB"));
        if (bevelB)
            sp3d.bevelB = bevelB;
        const contourClr = (0, xml_1.findByLocalName)(sp3dEl, "contourClr");
        if (contourClr)
            sp3d.contourClr = (0, theme_1.resolveColor)(contourClr, theme);
        const extrusionClr = (0, xml_1.findByLocalName)(sp3dEl, "extrusionClr");
        if (extrusionClr)
            sp3d.extrusionClr = (0, theme_1.resolveColor)(extrusionClr, theme);
        const z = (0, xml_1.attr)(sp3dEl, "z");
        if (z !== undefined)
            sp3d.z = (0, units_1.emuToPx)(z);
        const flatTx = (0, xml_1.findByLocalName)(sp3dEl, "flatTx");
        if (flatTx)
            sp3d.flatTx = { z: (0, units_1.emuToPx)((0, xml_1.attr)(flatTx, "z") ?? "0") };
    }
    const scene = {};
    if (scene3dEl) {
        const cam = (0, xml_1.findByLocalName)(scene3dEl, "camera");
        if (cam) {
            const camera = {};
            const prst = (0, xml_1.attr)(cam, "prst");
            if (prst)
                camera.prst = prst;
            const fov = (0, xml_1.attr)(cam, "fov");
            if (fov !== undefined)
                camera.fov = Number(fov) / 60000;
            const zoom = (0, xml_1.attr)(cam, "zoom");
            if (zoom !== undefined)
                camera.zoom = Number(zoom) / 100000;
            const rot = (0, xml_1.findByLocalName)(cam, "rot");
            if (rot)
                camera.rot = parseSphere(rot);
            scene.camera = camera;
        }
        const lr = (0, xml_1.findByLocalName)(scene3dEl, "lightRig");
        if (lr) {
            const lightRig = {};
            const rig = (0, xml_1.attr)(lr, "rig");
            if (rig)
                lightRig.rig = rig;
            const dir = (0, xml_1.attr)(lr, "dir");
            if (dir)
                lightRig.dir = dir;
            const rot = (0, xml_1.findByLocalName)(lr, "rot");
            if (rot)
                lightRig.rot = parseSphere(rot);
            scene.lightRig = lightRig;
        }
        const bd = (0, xml_1.findByLocalName)(scene3dEl, "backdrop");
        if (bd) {
            const anchorEl = (0, xml_1.findByLocalName)(bd, "anchor");
            const normEl = (0, xml_1.findByLocalName)(bd, "norm");
            const upEl = (0, xml_1.findByLocalName)(bd, "up");
            scene.backdrop = {
                anchor: anchorEl
                    ? {
                        x: (0, units_1.emuToPx)((0, xml_1.attr)(anchorEl, "x") ?? "0"),
                        y: (0, units_1.emuToPx)((0, xml_1.attr)(anchorEl, "y") ?? "0"),
                        z: (0, units_1.emuToPx)((0, xml_1.attr)(anchorEl, "z") ?? "0"),
                    }
                    : undefined,
                norm: normEl
                    ? {
                        dx: Number((0, xml_1.attr)(normEl, "dx") ?? "0"),
                        dy: Number((0, xml_1.attr)(normEl, "dy") ?? "0"),
                        dz: Number((0, xml_1.attr)(normEl, "dz") ?? "0"),
                    }
                    : undefined,
                up: upEl
                    ? {
                        dx: Number((0, xml_1.attr)(upEl, "dx") ?? "0"),
                        dy: Number((0, xml_1.attr)(upEl, "dy") ?? "0"),
                        dz: Number((0, xml_1.attr)(upEl, "dz") ?? "0"),
                    }
                    : undefined,
            };
        }
    }
    return {
        sp3d,
        scene3d: Object.keys(scene).length ? scene : undefined,
    };
}
