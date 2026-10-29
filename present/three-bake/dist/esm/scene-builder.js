import * as THREE from "three";
import { setupCamera } from "./camera.js";
import { applyLightRig } from "./light-rig.js";
import { buildMaterial, pickPrimaryColor } from "./material.js";
import { pathDToShapes } from "./path-to-shape.js";
// ────────────────────────────────────────────────────────────────────────────
// 共享 three.js 场景构建器。offscreen 光栅（bakeSp3d，给 thumbnail/snapshot/pdf）和
// live WebGL backend（player/editor 实时）都用它，保证两条路径几何/材质/光照一致。
// 这里只负责「已解析参数(ResolvedScene3D) → THREE.Scene + 相机」，不碰 DOM / canvas。
// ────────────────────────────────────────────────────────────────────────────
/**
 * "前缘有倒角、背面平整、薄侧壁" 的板形几何——复刻 PowerPoint sp3d 在仅声明
 * `<a:bevelT/>` / `<a:bevelB/>` 没有 extrusionH 时的视觉（如 7.pptx 棋盘）。
 * 返回 front（贴图面，z=+e/2 内缩 bevelW/H）+ rim（chamfer ring + 薄侧壁），让前面用
 * textured material 保色、rim 用 PBR 吃光照显倒角折边。详细几何见原始注释保留。
 */
function buildFrontBeveledSlab(baseW, baseH, extrusionPx, bevelWpx, bevelHpx) {
    const e = extrusionPx;
    const bw = Math.min(bevelWpx, baseW * 0.4);
    const bh = Math.min(bevelHpx, e * 0.5);
    const zFront = +e / 2;
    const zRim = +e / 2 - bh;
    const zBack = -e / 2;
    const buildBuf = (pushAll) => {
        const positions = [];
        const uvs = [];
        const normals = [];
        const pushTri = (p1, p2, p3, uv1, uv2, uv3, n) => {
            positions.push(...p1, ...p2, ...p3);
            uvs.push(...uv1, ...uv2, ...uv3);
            normals.push(...n, ...n, ...n);
        };
        const pushQuad = (a, b, c, d, uva, uvb, uvc, uvd, n) => {
            pushTri(a, b, c, uva, uvb, uvc, n);
            pushTri(a, c, d, uva, uvc, uvd, n);
        };
        pushAll({ pushTri, pushQuad });
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
        geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
        geo.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
        return geo;
    };
    const front = buildBuf(({ pushQuad }) => {
        const u0 = bw / baseW, u1 = 1 - bw / baseW;
        const v0 = bh / baseH, v1 = 1 - bh / baseH;
        pushQuad([bw, bh, zFront], [baseW - bw, bh, zFront], [baseW - bw, baseH - bh, zFront], [bw, baseH - bh, zFront], [u0, v0], [u1, v0], [u1, v1], [u0, v1], [0, 0, 1]);
    });
    // 倒角 / 侧壁的 UV 直接取顶点 (x,y) 归一化，让正面贴图**连续地**裹过倒角折边到外缘
    // （复刻 PowerPoint：image 的 bevel 是「图片本身绕圆边卷过去」，不是一圈灰色画框）。
    // 之前 rim 全用 (0,0) + 灰色材质 → 正面与灰边之间出现「折痕」、顶部朝相机的倒角是
    // 一条灰色折面（见 7.pptx slide2 棋盘）。连续 UV + 同一张贴图后，正面与倒角无色差，
    // 折痕消失，倒角只贡献轮廓上的微弱立体感。
    const uv = (x, y) => [
        Math.min(1, Math.max(0, x / baseW)),
        Math.min(1, Math.max(0, y / baseH)),
    ];
    const rim = buildBuf(({ pushQuad }) => {
        pushQuad([0, 0, zRim], [baseW, 0, zRim], [baseW - bw, bh, zFront], [bw, bh, zFront], uv(0, 0), uv(baseW, 0), uv(baseW - bw, bh), uv(bw, bh), [0, -0.71, 0.71]);
        pushQuad([bw, baseH - bh, zFront], [baseW - bw, baseH - bh, zFront], [baseW, baseH, zRim], [0, baseH, zRim], uv(bw, baseH - bh), uv(baseW - bw, baseH - bh), uv(baseW, baseH), uv(0, baseH), [0, 0.71, 0.71]);
        pushQuad([0, 0, zRim], [bw, bh, zFront], [bw, baseH - bh, zFront], [0, baseH, zRim], uv(0, 0), uv(bw, bh), uv(bw, baseH - bh), uv(0, baseH), [-0.71, 0, 0.71]);
        pushQuad([baseW - bw, bh, zFront], [baseW, 0, zRim], [baseW, baseH, zRim], [baseW - bw, baseH - bh, zFront], uv(baseW - bw, bh), uv(baseW, 0), uv(baseW, baseH), uv(baseW - bw, baseH - bh), [0.71, 0, 0.71]);
        pushQuad([0, 0, zRim], [0, 0, zBack], [baseW, 0, zBack], [baseW, 0, zRim], uv(0, 0), uv(0, 0), uv(baseW, 0), uv(baseW, 0), [0, -1, 0]);
        pushQuad([baseW, 0, zRim], [baseW, 0, zBack], [baseW, baseH, zBack], [baseW, baseH, zRim], uv(baseW, 0), uv(baseW, 0), uv(baseW, baseH), uv(baseW, baseH), [1, 0, 0]);
        pushQuad([baseW, baseH, zRim], [baseW, baseH, zBack], [0, baseH, zBack], [0, baseH, zRim], uv(baseW, baseH), uv(baseW, baseH), uv(0, baseH), uv(0, baseH), [0, 1, 0]);
        pushQuad([0, baseH, zRim], [0, baseH, zBack], [0, 0, zBack], [0, 0, zRim], uv(0, baseH), uv(0, baseH), uv(0, 0), uv(0, 0), [-1, 0, 0]);
    });
    return { front, rim };
}
// THREE.ExtrudeGeometry 默认 UVGenerator 会把侧面拉伸成镜像图。给定 baseW/baseH：
//   - 正/背面：vertex.x/y 归一到 [0,1] 让 image 贴满
//   - 侧面 / 倒角：固定 (0,0)，等于纹理左上角实色，让 fillColor / rim 主导
// V 轴：texture.flipY=true → uv.v=1 对应原图最顶行；geom 顶点 y=baseH（顶部）→ uv.v=1。
function rectFrontUVGenerator(baseW, baseH) {
    const u = (x) => Math.min(1, Math.max(0, x / baseW));
    const v = (y) => Math.min(1, Math.max(0, y / baseH));
    return {
        generateTopUV: (_geo, vs, ia, ib, ic) => {
            const xy = (i) => new THREE.Vector2(u(vs[i * 3]), v(vs[i * 3 + 1]));
            return [xy(ia), xy(ib), xy(ic)];
        },
        generateSideWallUV: () => {
            const z = new THREE.Vector2(0, 0);
            return [z, z, z, z];
        },
    };
}
export function buildThreeScene(inputs) {
    const { baseW, baseH, pathD, fill, stroke, resolved, texture, isImage } = inputs;
    const scene = new THREE.Scene();
    const r = resolved.sp3d;
    const fillColor = pickPrimaryColor(fill, "#7f7f7f");
    const explicitExtH = r.extrusionH;
    const bevelWpx = Math.min(r.bevelT?.w ?? r.bevelB?.w ?? 0, baseW * 0.4);
    const bevelHpx = Math.min(r.bevelT?.h ?? r.bevelB?.h ?? 0, baseH * 0.4);
    const hasBevel = r.hasBevel && bevelWpx > 0 && bevelHpx > 0;
    const useFrontBevelSlab = isImage && hasBevel && !pathD;
    const useBevel = hasBevel && !isImage;
    const extrusionPx = explicitExtH > 0
        ? explicitExtH
        // image：用 2×bevelHpx 当深度，让 buildFrontBeveledSlab 里 bh=min(bevelHpx, e/2)
        // 取满 bevelHpx → 顶/底倒角折面有足够宽度被看见（否则顶光下与正面分不开）。
        : isImage
            ? Math.max(bevelHpx * 2, 8)
            : useBevel
                ? Math.max(bevelHpx * 1.5, 6)
                : 1;
    const pp = pathD ? pathDToShapes(pathD) : null;
    let geometry = null;
    let frontGeo = null;
    let rimGeo = null;
    let geoCenterX = 0;
    let geoCenterY = 0;
    let geoW = baseW;
    let geoH = baseH;
    const extrudeOpts = {
        depth: Math.max(extrusionPx, 0.001),
        bevelEnabled: useBevel,
        bevelSegments: 4,
        bevelSize: bevelWpx,
        bevelThickness: bevelHpx,
        curveSegments: 24,
        UVGenerator: rectFrontUVGenerator(baseW, baseH),
    };
    if (pp && pp.shapes.length > 0) {
        const bbox = pp.bbox;
        geoW = bbox.maxX - bbox.minX || baseW;
        geoH = bbox.maxY - bbox.minY || baseH;
        geoCenterX = (bbox.minX + bbox.maxX) / 2;
        geoCenterY = (bbox.minY + bbox.maxY) / 2;
        geometry = new THREE.ExtrudeGeometry(pp.shapes, extrudeOpts);
    }
    else if (useFrontBevelSlab) {
        geoCenterX = baseW / 2;
        geoCenterY = baseH / 2;
        const built = buildFrontBeveledSlab(baseW, baseH, extrusionPx, bevelWpx, bevelHpx);
        frontGeo = built.front;
        rimGeo = built.rim;
    }
    else {
        geoCenterX = baseW / 2;
        geoCenterY = baseH / 2;
        const shape = new THREE.Shape();
        shape.moveTo(0, 0);
        shape.lineTo(baseW, 0);
        shape.lineTo(baseW, baseH);
        shape.lineTo(0, baseH);
        shape.lineTo(0, 0);
        geometry = new THREE.ExtrudeGeometry([shape], extrudeOpts);
    }
    const rimColor = r.contourClr ?? fillColor;
    if (frontGeo && rimGeo) {
        frontGeo.translate(-geoCenterX, -geoCenterY, -extrusionPx / 2);
        rimGeo.translate(-geoCenterX, -geoCenterY, -extrusionPx / 2);
        frontGeo.computeBoundingSphere();
        frontGeo.computeBoundingBox();
        rimGeo.computeBoundingSphere();
        rimGeo.computeBoundingBox();
        const frontMat = buildMaterial(fill, {
            prst: r.prstMaterial,
            fallbackColor: fillColor,
            imageTexture: texture ?? undefined,
        });
        // image 倒角 / 侧壁与正面共用贴图（连续 UV），让图片裹过折边而不是露出灰色画框；
        // 但 rim 走 litTexture + tint 压暗：正面 basic 满亮、折边受光后再乘灰度 → 顶光下
        // 「上面（倒角折面）」也明显比「前面（正面）」暗，留出区分两个面的折痕。
        // 无贴图（纯色 shape 不会走 slab 路径，但兜底）时仍回退到 contour / fill 灰边。
        const rimMat = texture
            ? buildMaterial(fill, {
                prst: r.prstMaterial,
                fallbackColor: rimColor,
                imageTexture: texture,
                litTexture: true,
                tint: 0x888888,
            })
            : buildMaterial(undefined, { prst: r.prstMaterial, fallbackColor: rimColor });
        scene.add(new THREE.Mesh(frontGeo, frontMat));
        scene.add(new THREE.Mesh(rimGeo, rimMat));
    }
    else if (geometry) {
        geometry.translate(-geoCenterX, -geoCenterY, -extrusionPx / 2);
        geometry.computeBoundingSphere();
        geometry.computeBoundingBox();
        const material = buildMaterial(fill, {
            prst: r.prstMaterial,
            fallbackColor: fillColor,
            imageTexture: texture ?? undefined,
        });
        scene.add(new THREE.Mesh(geometry, material));
    }
    if (stroke && r.contourW && r.contourW > 0) {
        const geomForEdges = frontGeo ?? geometry;
        if (geomForEdges) {
            const edges = new THREE.EdgesGeometry(geomForEdges, 12);
            const lineMat = new THREE.LineBasicMaterial({ color: r.contourClr ?? "#000000", linewidth: 1 });
            scene.add(new THREE.LineSegments(edges, lineMat));
        }
    }
    applyLightRig(scene, resolved.lightRig.rig, resolved.lightRig.dir);
    const dispose = () => {
        scene.traverse((obj) => {
            if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments) {
                obj.geometry?.dispose();
                const mat = obj.material;
                if (Array.isArray(mat))
                    for (const m of mat)
                        m.dispose();
                else
                    mat?.dispose();
            }
        });
    };
    return { scene, geoW, geoH, dispose };
}
/**
 * 把相机摆到「物体在 viewW×viewH 视口里接近 1:1（含 pad 余量）」的距离并构建 THREE 相机。
 * offscreen 与 live 共用：offscreen 传 padded canvas 尺寸；live 传显示像素尺寸。
 */
export function createSceneCamera(cam, geoW, geoH, viewW, viewH, pad, backdrop) {
    const aspect = viewW / viewH;
    const camFit = 1 + pad;
    let distance;
    if (cam.isOrtho) {
        distance = Math.max(Math.max(geoW, geoH) * 4, 200);
    }
    else {
        const fovRad = (cam.fov * Math.PI) / 180;
        const tanHalf = Math.tan(fovRad / 2);
        const dByH = (geoH * camFit) / (2 * tanHalf);
        const dByW = (geoW * camFit) / (2 * tanHalf * aspect);
        distance = Math.max(dByH, dByW, 200);
    }
    const { camera } = setupCamera(cam, new THREE.Vector3(0, 0, 0), distance, backdrop);
    if (camera instanceof THREE.PerspectiveCamera) {
        camera.aspect = aspect;
        camera.updateProjectionMatrix();
    }
    else if (camera instanceof THREE.OrthographicCamera) {
        const halfX = (viewW / 2) * camFit;
        const halfY = (viewH / 2) * camFit;
        camera.left = -halfX;
        camera.right = halfX;
        camera.top = halfY;
        camera.bottom = -halfY;
        camera.updateProjectionMatrix();
    }
    return camera;
}
// 已解码的 <img> 缓存（按 src）。解码是 loadImageTexture 里唯一的异步成本；缓存后
// live WebGLShapeBackend 在每帧重建（编辑器拖动）时可以 **同步** 拿到贴图、当帧首渲，
// 避免"重建 backend → 异步等贴图 → 3D 空一帧"造成的闪屏。THREE.Texture 不进缓存
// （它绑定具体 renderer 的 GPU 资源、且会被各自 backend dispose），每次按缓存的
// HTMLImageElement 新建一个轻量 Texture 即可。
const decodedImageCache = new Map();
function textureFromImage(img) {
    const tex = new THREE.Texture(img);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
}
/**
 * 若 src 对应图片此前已被 loadImageTexture 解码过，则同步返回一个新 Texture；否则
 * 返回 null（调用方需走异步 loadImageTexture）。用于热路径（拖动重建）下零延迟首渲。
 */
export function getCachedImageTexture(src) {
    const img = decodedImageCache.get(src);
    if (!img || !img.complete || img.naturalWidth === 0)
        return null;
    return textureFromImage(img);
}
// dataURL / URL 都走 Image → THREE.Texture，避免 TextureLoader 在 headless 对 dataURL 失败。
export async function loadImageTexture(src) {
    if (typeof Image === "undefined")
        return null;
    const cached = decodedImageCache.get(src);
    if (cached && cached.complete && cached.naturalWidth > 0) {
        return textureFromImage(cached);
    }
    const img = await new Promise((resolve) => {
        const i = new Image();
        i.crossOrigin = "anonymous";
        i.onload = () => resolve(i);
        i.onerror = () => resolve(null);
        i.src = src;
    });
    if (!img || !img.complete || img.naturalWidth === 0)
        return null;
    decodedImageCache.set(src, img);
    return textureFromImage(img);
}
