import { CAMERA_PRESETS, DEFAULT_BEVEL_PX, DEFAULT_FOV, DEFAULT_LIGHT_RIG, DEFAULT_MATERIAL, FOV_LOCKED_PRESETS, } from "./presets.js";
export function resolveCamera(cam) {
    let lat = 0;
    let lon = 0;
    let rev = 0;
    let fov = DEFAULT_FOV;
    if (cam?.prst) {
        const p = CAMERA_PRESETS[cam.prst];
        if (p) {
            lat = p.lat;
            lon = p.lon;
            rev = p.rev;
            fov = p.fov;
        }
    }
    // 显式 <a:rot> 覆盖角度（preset 与 rot 是覆盖而非叠加）。
    if (cam?.rot) {
        lat = cam.rot.lat;
        lon = cam.rot.lon;
        rev = cam.rot.rev;
    }
    // 显式 @fov 覆盖 fov——但 relaxed 系 preset 无条件用预设窄 fov（PPT 把显式 fov 当 zoom 参考）。
    if (cam?.fov !== undefined && !(cam.prst && FOV_LOCKED_PRESETS.has(cam.prst))) {
        fov = cam.fov;
    }
    return { lat, lon, rev, fov, isOrtho: fov < 1, zoom: cam?.zoom };
}
function resolveBevel(b) {
    if (!b)
        return undefined;
    return {
        w: b.w ?? DEFAULT_BEVEL_PX,
        h: b.h ?? DEFAULT_BEVEL_PX,
    };
}
export function resolveSp3D(sp3d) {
    const bevelT = resolveBevel(sp3d?.bevelT);
    const bevelB = resolveBevel(sp3d?.bevelB);
    return {
        extrusionH: sp3d?.extrusionH ?? 0,
        contourW: sp3d?.contourW,
        contourClr: sp3d?.contourClr,
        extrusionClr: sp3d?.extrusionClr,
        prstMaterial: sp3d?.prstMaterial ?? DEFAULT_MATERIAL,
        bevelT,
        bevelB,
        hasBevel: !!(bevelT || bevelB),
    };
}
export function resolveLightRig(lr) {
    return { rig: lr?.rig ?? DEFAULT_LIGHT_RIG, dir: lr?.dir };
}
function asVec(v) {
    return "dx" in v ? { x: v.dx, y: v.dy, z: v.dz } : v;
}
function normalizeVec(v) {
    const len = Math.hypot(v.x, v.y, v.z);
    if (len < 1e-8)
        return undefined;
    return { x: v.x / len, y: v.y / len, z: v.z / len };
}
function nearAxis(v, x, y, z, eps = 0.02) {
    return Math.abs(v.x - x) < eps && Math.abs(v.y - y) < eps && Math.abs(v.z - z) < eps;
}
/** identity / 全 0 → undefined，setupCamera 保持 preset 朝向。 */
export function resolveBackdrop(bd) {
    if (!bd)
        return undefined;
    const n = bd.norm ? normalizeVec(asVec(bd.norm)) : undefined;
    const u = bd.up ? normalizeVec(asVec(bd.up)) : undefined;
    const identityN = !n || nearAxis(n, 0, 0, 1);
    const identityU = !u || nearAxis(u, 0, 1, 0);
    const a = bd.anchor;
    const hasAnchor = !!(a && (Math.abs(a.x) > 1e-4 || Math.abs(a.y) > 1e-4 || Math.abs(a.z) > 1e-4));
    if (identityN && identityU && !hasAnchor)
        return undefined;
    return {
        target: a ?? { x: 0, y: 0, z: 0 },
        forward: identityN ? undefined : n,
        up: identityU ? undefined : u,
    };
}
export function resolveScene3D(info) {
    const scene = info.scene3d;
    return {
        camera: resolveCamera(scene?.camera),
        sp3d: resolveSp3D(info.sp3d),
        lightRig: resolveLightRig(scene?.lightRig),
        backdrop: resolveBackdrop(scene?.backdrop),
    };
}
