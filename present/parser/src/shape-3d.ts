import { attr, findByLocalName, type XmlNode } from "./xml";
import { emuToPx } from "./units";
import { resolveColor, type ThemeData } from "./theme";
import type {
  Bevel3D,
  Camera3D,
  LightRig3D,
  Scene3DParams,
  Sp3DInfo,
  Sp3DParams,
  Sphere3D,
} from "@ppt/core";

// 3D 数据类型的**唯一来源**是 @ppt/core（packages/core/src/three-d.ts）。这里只做
// 「OOXML → 那些类型」的忠实解析，不展开 preset、不补默认值 —— 那些 PowerPoint 私有
// 数值与默认逻辑全部归渲染侧效果层（packages/three-bake/src/presets.ts + resolve.ts）。
//
// 为向后兼容，旧的从 "@ppt/parser" 引用这些类型的代码仍可用：见 packages/parser/src/index.ts
// 的 re-export。
export type {
  Baker,
  Shape3DRequest,
  Shape3DResult,
  Sp3DParams,
  Scene3DParams,
  Sp3DInfo,
  Camera3D,
  LightRig3D,
} from "@ppt/core";

/** `<a:rot lat lon rev>` → 度（原值 ÷ 60000）。 */
function parseSphere(rot: XmlNode): Sphere3D {
  return {
    lat: Number(attr(rot, "lat") ?? "0") / 60000,
    lon: Number(attr(rot, "lon") ?? "0") / 60000,
    rev: Number(attr(rot, "rev") ?? "0") / 60000,
  };
}

/** §20.1.5.4 EG_Bevel：忠实记录 w/h/prst；缺省的 w/h 留 undefined，由效果层补默认。 */
function parseBevel(bevel: XmlNode | undefined): Bevel3D | undefined {
  if (!bevel) return undefined;
  const out: Bevel3D = {};
  const w = attr(bevel, "w");
  if (w !== undefined) out.w = emuToPx(w);
  const h = attr(bevel, "h");
  if (h !== undefined) out.h = emuToPx(h);
  const prst = attr(bevel, "prst");
  if (prst) out.prst = prst;
  return out;
}

/**
 * 忠实解析 spPr / bodyPr 下的 `<a:scene3d>` 和 `<a:sp3d>` → Sp3DInfo。
 * 只记录 XML 实际写了的内容；preset → 具体相机/材质/默认值 的映射在渲染侧效果层。
 */
export function parse3DInfo(
  spPr: XmlNode | undefined,
  theme: ThemeData | undefined,
): Sp3DInfo | undefined {
  if (!spPr) return undefined;
  const sp3dEl = findByLocalName(spPr, "sp3d");
  const scene3dEl = findByLocalName(spPr, "scene3d");
  if (!sp3dEl && !scene3dEl) return undefined;

  const sp3d: Sp3DParams = {};
  if (sp3dEl) {
    const ex = attr(sp3dEl, "extrusionH");
    if (ex !== undefined) sp3d.extrusionH = emuToPx(ex);
    const cw = attr(sp3dEl, "contourW");
    if (cw !== undefined) sp3d.contourW = emuToPx(cw);
    const prstMat = attr(sp3dEl, "prstMaterial");
    if (prstMat) sp3d.prstMaterial = prstMat;
    const bevelT = parseBevel(findByLocalName(sp3dEl, "bevelT"));
    if (bevelT) sp3d.bevelT = bevelT;
    const bevelB = parseBevel(findByLocalName(sp3dEl, "bevelB"));
    if (bevelB) sp3d.bevelB = bevelB;
    const contourClr = findByLocalName(sp3dEl, "contourClr");
    if (contourClr) sp3d.contourClr = resolveColor(contourClr, theme);
    const extrusionClr = findByLocalName(sp3dEl, "extrusionClr");
    if (extrusionClr) sp3d.extrusionClr = resolveColor(extrusionClr, theme);
    const z = attr(sp3dEl, "z");
    if (z !== undefined) sp3d.z = emuToPx(z);
    const flatTx = findByLocalName(sp3dEl, "flatTx");
    if (flatTx) sp3d.flatTx = { z: emuToPx(attr(flatTx, "z") ?? "0") };
  }

  const scene: Scene3DParams = {};
  if (scene3dEl) {
    const cam = findByLocalName(scene3dEl, "camera");
    if (cam) {
      const camera: Camera3D = {};
      const prst = attr(cam, "prst");
      if (prst) camera.prst = prst;
      const fov = attr(cam, "fov");
      if (fov !== undefined) camera.fov = Number(fov) / 60000;
      const zoom = attr(cam, "zoom");
      if (zoom !== undefined) camera.zoom = Number(zoom) / 100000;
      const rot = findByLocalName(cam, "rot");
      if (rot) camera.rot = parseSphere(rot);
      scene.camera = camera;
    }
    const lr = findByLocalName(scene3dEl, "lightRig");
    if (lr) {
      const lightRig: LightRig3D = {};
      const rig = attr(lr, "rig");
      if (rig) lightRig.rig = rig;
      const dir = attr(lr, "dir");
      if (dir) lightRig.dir = dir;
      const rot = findByLocalName(lr, "rot");
      if (rot) lightRig.rot = parseSphere(rot);
      scene.lightRig = lightRig;
    }
    const bd = findByLocalName(scene3dEl, "backdrop");
    if (bd) {
      const anchorEl = findByLocalName(bd, "anchor");
      const normEl = findByLocalName(bd, "norm");
      const upEl = findByLocalName(bd, "up");
      scene.backdrop = {
        anchor: anchorEl
          ? {
              x: emuToPx(attr(anchorEl, "x") ?? "0"),
              y: emuToPx(attr(anchorEl, "y") ?? "0"),
              z: emuToPx(attr(anchorEl, "z") ?? "0"),
            }
          : undefined,
        norm: normEl
          ? {
              dx: Number(attr(normEl, "dx") ?? "0"),
              dy: Number(attr(normEl, "dy") ?? "0"),
              dz: Number(attr(normEl, "dz") ?? "0"),
            }
          : undefined,
        up: upEl
          ? {
              dx: Number(attr(upEl, "dx") ?? "0"),
              dy: Number(attr(upEl, "dy") ?? "0"),
              dz: Number(attr(upEl, "dz") ?? "0"),
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
