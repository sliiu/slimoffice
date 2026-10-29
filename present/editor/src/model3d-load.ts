import type { Model3DPreset } from "@ppt/core";

export type Model3DMime = "model/gltf-binary" | "model/gltf+json";

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  if (typeof btoa !== "undefined") return btoa(bin);
  const g = globalThis as { Buffer?: { from(b: Uint8Array): { toString(e: string): string } } };
  if (g.Buffer) return g.Buffer.from(bytes).toString("base64");
  throw new Error("base64 encoder unavailable");
}

function parseDataUrl(dataUrl: string): { mime: string; bytes: Uint8Array } | null {
  const m = /^data:([^;]+);base64,(.+)$/i.exec(dataUrl);
  if (!m) return null;
  const b64 = m[2]!;
  let bin: string;
  if (typeof atob !== "undefined") bin = atob(b64);
  else {
    const g = globalThis as { Buffer?: { from(s: string, e: string): Uint8Array } };
    if (!g.Buffer) return null;
    return { mime: m[1]!, bytes: g.Buffer.from(b64, "base64") };
  }
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { mime: m[1]!, bytes };
}

/** Detect glTF binary vs JSON from file bytes. */
export function detectModel3DMime(bytes: Uint8Array, fileName?: string): Model3DMime | null {
  if (bytes.length >= 4) {
    const magic = String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!);
    if (magic === "glTF") return "model/gltf-binary";
  }
  const head = new TextDecoder().decode(bytes.subarray(0, Math.min(48, bytes.length))).trimStart();
  if (head.startsWith("{")) return "model/gltf+json";
  const lower = fileName?.toLowerCase() ?? "";
  if (lower.endsWith(".gltf")) return "model/gltf+json";
  if (lower.endsWith(".glb")) return "model/gltf-binary";
  return null;
}

export function model3DDataUrlFromBytes(bytes: Uint8Array, mime: Model3DMime): string {
  return `data:${mime};base64,${bytesToBase64(bytes)}`;
}

/** Ensure a user/model data URL uses a glTF MIME type understood by serializer + Three.js. */
export function normalizeModel3DDataUrl(dataUrl: string, fileName?: string): string {
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) return dataUrl;
  const mime = parsed.mime.toLowerCase();
  if (mime === "model/gltf-binary" || mime === "model/gltf+json") {
    return dataUrl;
  }
  const detected = detectModel3DMime(parsed.bytes, fileName);
  if (!detected) return dataUrl;
  return model3DDataUrlFromBytes(parsed.bytes, detected);
}

function labelFromName(name: string): string {
  return name.replace(/\.(glb|gltf)$/i, "").trim() || "3D Model";
}

function labelFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const last = u.pathname.split("/").pop() ?? "";
    return labelFromName(decodeURIComponent(last));
  } catch {
    return labelFromName(url.split("/").pop() ?? "3D Model");
  }
}

/** Fetch a remote `.glb` / `.gltf` and return an embeddable data URL. */
export async function loadModel3DFromUrl(url: string): Promise<{ glbSrc: string; label: string }> {
  const trimmed = url.trim();
  if (!trimmed) throw new Error("empty url");
  const res = await fetch(trimmed);
  if (!res.ok) throw new Error(`Failed to load 3D model (${res.status})`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const detected =
    detectModel3DMime(bytes, trimmed) ??
    (trimmed.toLowerCase().includes(".gltf") ? "model/gltf+json" : "model/gltf-binary");
  return {
    glbSrc: model3DDataUrlFromBytes(bytes, detected),
    label: labelFromUrl(trimmed),
  };
}

/** Read a user-selected `.glb` / `.gltf` file as a normalized data URL. */
export async function loadModel3DFromFile(file: File): Promise<{ glbSrc: string; label: string }> {
  const raw = await readModel3DFileAsDataUrl(file);
  const glbSrc = normalizeModel3DDataUrl(raw, file.name);
  return { glbSrc, label: labelFromName(file.name) };
}

/** Fetch a `.glb` URL and return a `data:model/gltf-binary;base64,...` URL. */
export async function fetchGlbAsDataUrl(url: string): Promise<string> {
  const { glbSrc } = await loadModel3DFromUrl(url);
  return glbSrc;
}

/** Read a user-selected `.glb` / `.gltf` file as a data URL. */
export function readModel3DFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

export function model3DPresetAssetUrl(baseUrl: string, preset: Model3DPreset): string {
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const path = preset.samplePath.startsWith("/") ? preset.samplePath.slice(1) : preset.samplePath;
  return `${base}${path}`;
}

export async function loadModel3DPresetAsDataUrl(
  preset: Model3DPreset,
  baseUrl = "/",
): Promise<string> {
  return fetchGlbAsDataUrl(model3DPresetAssetUrl(baseUrl, preset));
}

export const MODEL3D_CUSTOM_PRESET_ID = "custom";

/** Byte length of a glTF data URL (for inspector labels). */
export function model3DDataUrlByteSize(glbSrc: string | undefined): number | null {
  const parsed = glbSrc ? parseDataUrl(glbSrc) : null;
  return parsed?.bytes.length ?? null;
}
