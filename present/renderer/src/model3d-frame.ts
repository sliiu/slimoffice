import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { Model3DShape } from "@ppt/core";

const gltfCache = new Map<string, Promise<THREE.Object3D>>();

export function loadGltfScene(src: string): Promise<THREE.Object3D> {
  let hit = gltfCache.get(src);
  if (!hit) {
    const loader = new GLTFLoader();
    hit = new Promise((resolve, reject) => {
      loader.load(
        src,
        (gltf) => {
          const root = gltf.scene;
          const box = new THREE.Box3().setFromObject(root);
          const size = new THREE.Vector3();
          const center = new THREE.Vector3();
          box.getSize(size);
          box.getCenter(center);
          root.position.sub(center);
          const maxDim = Math.max(size.x, size.y, size.z, 1e-6);
          root.scale.setScalar(1 / maxDim);
          resolve(root);
        },
        undefined,
        reject,
      );
    });
    gltfCache.set(src, hit);
  }
  return hit;
}

function deg(v: number | undefined): number {
  return ((v ?? 0) * Math.PI) / 180;
}

export function applyModel3DCameraPose(
  cam: THREE.PerspectiveCamera,
  latDeg: number,
  lonDeg: number,
  dist = 2.8,
): void {
  const lat = deg(latDeg);
  const lon = deg(lonDeg);
  cam.position.set(
    dist * Math.cos(lat) * Math.sin(lon),
    dist * Math.sin(lat),
    dist * Math.cos(lat) * Math.cos(lon),
  );
  cam.lookAt(0, 0, 0);
  cam.updateProjectionMatrix();
}

export function applyModel3DCamera(cam: THREE.PerspectiveCamera, s: Model3DShape): void {
  applyModel3DCameraPose(cam, s.camera?.rot?.lat ?? 15, s.camera?.rot?.lon ?? 25);
}

export function applyModel3DTransform(root: THREE.Object3D, s: Model3DShape): void {
  const t = s.modelTransform;
  if (!t) return;
  const sc = t.scale;
  if (sc) root.scale.multiply(new THREE.Vector3(sc.x || 1, sc.y || 1, sc.z || 1));
  const r = t.rot;
  if (r) root.rotation.set(deg(r.lat), deg(r.lon), deg(r.rev), "YXZ");
  const o = t.off;
  if (o) root.position.add(new THREE.Vector3(o.x, o.y, o.z));
}

type FrameEntry =
  | { status: "pending"; wait: Promise<void> }
  | { status: "ready"; img: HTMLImageElement }
  | { status: "failed" };

const previewCache = new Map<string, FrameEntry>();

let previewRenderer: THREE.WebGLRenderer | null = null;
let previewRendererFailed = false;

function getPreviewRenderer(): THREE.WebGLRenderer | null {
  if (previewRenderer) return previewRenderer;
  if (previewRendererFailed) return null;
  if (typeof document === "undefined") {
    previewRendererFailed = true;
    return null;
  }
  try {
    const r = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
    r.setPixelRatio(1);
    r.setClearColor(0x000000, 0);
    r.outputColorSpace = THREE.SRGBColorSpace;
    previewRenderer = r;
  } catch {
    previewRendererFailed = true;
  }
  return previewRenderer;
}

function previewKey(s: Model3DShape): string {
  return JSON.stringify({
    src: s.glbSrc,
    cam: s.camera ?? null,
    xf: s.modelTransform ?? null,
    ar: s.bbox.h > 0 ? Math.round((s.bbox.w / s.bbox.h) * 1000) / 1000 : 1,
  });
}

function rasterize(s: Model3DShape, root: THREE.Object3D): string | null {
  const renderer = getPreviewRenderer();
  if (!renderer) return null;
  const aspect = s.bbox.h > 0 ? s.bbox.w / s.bbox.h : 1;
  const w = 256;
  const h = Math.max(1, Math.round(w / Math.max(aspect, 0.2)));
  const scene = new THREE.Scene();
  const clone = root.clone(true);
  applyModel3DTransform(clone, s);
  scene.add(clone);
  const light = new THREE.DirectionalLight(0xffffff, 1.1);
  light.position.set(2, 3, 4);
  scene.add(light);
  scene.add(new THREE.AmbientLight(0xffffff, 0.45));
  const cam = new THREE.PerspectiveCamera(35, w / h, 0.01, 100);
  applyModel3DCamera(cam, s);
  renderer.setSize(w, h, false);
  renderer.render(scene, cam);
  return renderer.domElement.toDataURL("image/png");
}

export function getModel3DPreviewFrame(
  s: Model3DShape,
  onReady?: () => void,
): HTMLImageElement | null {
  if (typeof document === "undefined" || !s.glbSrc) return null;
  const key = previewKey(s);
  const hit = previewCache.get(key);
  if (hit?.status === "ready") return hit.img;
  if (hit?.status === "failed") return null;
  if (hit?.status === "pending") {
    if (onReady) void hit.wait.then(() => onReady());
    return null;
  }
  const wait = loadGltfScene(s.glbSrc)
    .then(
      (root) =>
        new Promise<void>((resolve) => {
          const url = rasterize(s, root);
          if (!url) {
            previewCache.set(key, { status: "failed" });
            resolve();
            return;
          }
          const img = new Image();
          img.onload = () => {
            previewCache.set(key, { status: "ready", img });
            onReady?.();
            resolve();
          };
          img.onerror = () => {
            previewCache.set(key, { status: "failed" });
            resolve();
          };
          img.src = url;
        }),
    )
    .catch(() => {
      previewCache.set(key, { status: "failed" });
    });
  previewCache.set(key, { status: "pending", wait });
  return null;
}

export function waitForModel3DFrames(timeoutMs = 8000): Promise<void> {
  const pending: Promise<void>[] = [];
  for (const e of previewCache.values()) {
    if (e.status === "pending") pending.push(e.wait);
  }
  if (!pending.length) return Promise.resolve();
  return Promise.race([
    Promise.all(pending).then(() => undefined),
    new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}
