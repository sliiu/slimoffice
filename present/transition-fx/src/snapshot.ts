// WebGL 切换要把整页画进纹理。foreignObject 再画到 canvas 时，SVG 里任何
// 外部地址（包括本页 createObjectURL 的 blob:）都会把画布弄脏，随后
// texImage2D 抛 SecurityError。这里先把能读到像素的图换成 data URL；
// 读不到的可见图返回 false，调用方改走不读像素的 CSS 切换。

const XLINK_NS = "http://www.w3.org/1999/xlink";
const URL_ATTRS = ["href", "src", "poster"] as const;

export interface Snapshot {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
}

export type SnapshotCache = Map<string, Promise<string | null>>;

export function isExternalSnapshotUrl(url: string): boolean {
  const u = url.trim();
  if (!u || u.startsWith("#") || /^data:/i.test(u) || /^about:/i.test(u)) return false;
  return true;
}

/** 把样式里的外部 url() 换成 data URL；换不掉的可见背景改成 none，避免再去拉取。 */
export function rewriteCssForSnapshot(
  css: string,
  resolved: Map<string, string | null>,
): { css: string; droppedVisible: boolean } {
  let droppedVisible = false;
  // @import 会让 SVG 再去拉外部样式，把画布弄脏。样式表本身不是画面内容，去掉即可。
  const noImport = css.replace(/@import\b[^;]*;/gi, "");
  const cssUrl = /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi;
  const next = noImport.replace(cssUrl, (full, _quote: string, raw: string, index: number) => {
    const url = String(raw).trim();
    if (!isExternalSnapshotUrl(url)) return full;
    const data = resolved.get(url);
    if (data) return `url("${data}")`;
    const before = noImport.slice(Math.max(0, index - 48), index).toLowerCase();
    if (/background|mask|border-image|content\s*:/.test(before)) droppedVisible = true;
    return "none";
  });
  return { css: next, droppedVisible };
}

function bytesToBase64(bytes: Uint8Array): string {
  const parts: string[] = [];
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    const slice = bytes.subarray(i, i + chunk);
    const codes = new Array<string>(slice.length);
    for (let j = 0; j < slice.length; j++) codes[j] = String.fromCharCode(slice[j]!);
    parts.push(codes.join(""));
  }
  return btoa(parts.join(""));
}

async function blobToDataUrl(blob: Blob): Promise<string | null> {
  if (typeof FileReader !== "undefined") {
    const viaReader = await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      try {
        reader.readAsDataURL(blob);
      } catch {
        resolve(null);
      }
    });
    if (viaReader?.startsWith("data:")) return viaReader;
  }
  try {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const type = blob.type || "application/octet-stream";
    return `data:${type};base64,${bytesToBase64(bytes)}`;
  } catch {
    return null;
  }
}

function imageConstructor(doc: Document): { new (): HTMLImageElement } | null {
  const Ctor = doc.defaultView?.Image ?? globalThis.Image;
  return typeof Ctor === "function" ? Ctor : null;
}

function drawImageToDataUrl(url: string, doc: Document): Promise<string | null> {
  const Ctor = imageConstructor(doc);
  if (!Ctor) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Ctor();
    if (/^https?:\/\//i.test(url)) img.crossOrigin = "anonymous";
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (value: string | null): void => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      resolve(value);
    };
    timer = setTimeout(() => finish(null), 2000);
    img.onload = () => {
      try {
        const canvas = doc.createElement("canvas");
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        if (w <= 0 || h <= 0) {
          finish(null);
          return;
        }
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d")?.drawImage(img, 0, 0, w, h);
        const data = canvas.toDataURL("image/png");
        finish(data.startsWith("data:") ? data : null);
      } catch {
        finish(null);
      }
    };
    img.onerror = () => finish(null);
    img.src = url;
  });
}

async function readAsDataUrl(url: string, doc: Document): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (res.ok) {
      const data = await blobToDataUrl(await res.blob());
      if (data) return data;
    }
  } catch {
    // 跨域且没有 CORS 头时 fetch 会失败，下面再用带 anonymous 的 Image 试一次。
  }
  return drawImageToDataUrl(url, doc);
}

function cachedDataUrl(url: string, doc: Document, cache: SnapshotCache): Promise<string | null> {
  const hit = cache.get(url);
  if (hit) return hit;
  const pending = readAsDataUrl(url, doc).catch(() => null);
  cache.set(url, pending);
  return pending;
}

function elementsOf(root: Element, selector: string): Element[] {
  const out: Element[] = [];
  if (root.matches(selector)) out.push(root);
  root.querySelectorAll(selector).forEach((el) => out.push(el));
  return out;
}

function copyLayout(from: Element, to: HTMLElement): void {
  const style = from.getAttribute("style");
  if (style) to.setAttribute("style", style);
  const width = from.getAttribute("width");
  const height = from.getAttribute("height");
  if (width) to.setAttribute("width", width);
  if (height) to.setAttribute("height", height);
}

function stillFromCanvas(canvas: HTMLCanvasElement, doc: Document): HTMLImageElement | null {
  if (canvas.width <= 0 || canvas.height <= 0) return null;
  try {
    const url = canvas.toDataURL("image/png");
    if (!url.startsWith("data:")) return null;
    const img = doc.createElement("img");
    img.src = url;
    copyLayout(canvas, img);
    return img;
  } catch {
    return null;
  }
}

function stillFromVideo(video: HTMLVideoElement, doc: Document): HTMLImageElement | null {
  const w = video.videoWidth || video.clientWidth;
  const h = video.videoHeight || video.clientHeight;
  if (w <= 0 || h <= 0) return null;
  try {
    const canvas = doc.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const cx = canvas.getContext("2d");
    if (!cx) return null;
    cx.drawImage(video, 0, 0, w, h);
    const url = canvas.toDataURL("image/jpeg", 0.72);
    if (!url.startsWith("data:")) return null;
    const img = doc.createElement("img");
    img.src = url;
    copyLayout(video, img);
    return img;
  } catch {
    return null;
  }
}

function walk(root: Element, visit: (el: Element) => void): void {
  visit(root);
  root.querySelectorAll("*").forEach(visit);
}

function collectExternalUrls(root: Element): Set<string> {
  const urls = new Set<string>();
  const take = (value: string | null): void => {
    if (value && isExternalSnapshotUrl(value)) urls.add(value.trim());
  };
  walk(root, (el) => {
    if (el.localName === "style" && el.textContent) {
      const cssUrl = /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi;
      for (const match of el.textContent.matchAll(cssUrl)) {
        const raw = match[2];
        if (raw && isExternalSnapshotUrl(raw)) urls.add(raw.trim());
      }
    }
    const style = el.getAttribute("style");
    if (style) {
      const cssUrl = /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi;
      for (const match of style.matchAll(cssUrl)) {
        const raw = match[2];
        if (raw && isExternalSnapshotUrl(raw)) urls.add(raw.trim());
      }
    }
    for (const name of URL_ATTRS) take(el.getAttribute(name));
    take(el.getAttributeNS(XLINK_NS, "href"));
  });
  return urls;
}

function applyResolvedUrls(root: Element, resolved: Map<string, string | null>): boolean {
  let complete = true;
  const paintTag = (el: Element): boolean =>
    el.localName === "image" || el.localName === "img" || el.localName === "video" || el.localName === "source";
  const writeAttr = (el: Element, name: string, ns: string | null, value: string | null): void => {
    if (!value || !isExternalSnapshotUrl(value)) return;
    const data = resolved.get(value.trim());
    if (data) {
      if (ns) el.setAttributeNS(ns, name, data);
      else el.setAttribute(name, data);
      return;
    }
    if (ns) el.removeAttributeNS(ns, name);
    else el.removeAttribute(name);
    if (paintTag(el)) complete = false;
  };
  walk(root, (el) => {
    if (el.hasAttribute("srcset")) el.removeAttribute("srcset");
    if (el.localName === "style" && el.textContent) {
      const rewritten = rewriteCssForSnapshot(el.textContent, resolved);
      el.textContent = rewritten.css;
      if (rewritten.droppedVisible) complete = false;
    }
    const style = el.getAttribute("style");
    if (style) {
      const rewritten = rewriteCssForSnapshot(style, resolved);
      el.setAttribute("style", rewritten.css);
      if (rewritten.droppedVisible) complete = false;
    }
    for (const name of URL_ATTRS) writeAttr(el, name, null, el.getAttribute(name));
    writeAttr(el, "href", XLINK_NS, el.getAttributeNS(XLINK_NS, "href"));
  });
  return complete;
}

/**
 * 在克隆树上把外部图片换成 data URL，并拆掉会弄脏画布的 video / iframe。
 * 返回 false 表示有一张可见图读不出来，快照不能代表这一页。
 * 不改 live。
 */
export async function sanitizeSnapshotClone(
  live: HTMLElement,
  clone: HTMLElement,
  cache: SnapshotCache = new Map(),
): Promise<boolean> {
  const doc = clone.ownerDocument;
  let complete = true;

  const liveCanvases = elementsOf(live, "canvas");
  const cloneCanvases = elementsOf(clone, "canvas");
  const canvasCount = Math.min(liveCanvases.length, cloneCanvases.length);
  if (liveCanvases.length !== cloneCanvases.length) complete = false;
  for (let i = 0; i < canvasCount; i++) {
    const src = liveCanvases[i] as HTMLCanvasElement | undefined;
    const dst = cloneCanvases[i];
    if (!src || !dst) continue;
    if (src.width <= 0 || src.height <= 0) continue;
    const still = stillFromCanvas(src, doc);
    if (still) dst.replaceWith(still);
    else complete = false;
  }

  const liveVideos = elementsOf(live, "video");
  const cloneVideos = elementsOf(clone, "video");
  const videoCount = Math.min(liveVideos.length, cloneVideos.length);
  if (liveVideos.length !== cloneVideos.length) complete = false;
  for (let i = 0; i < videoCount; i++) {
    const src = liveVideos[i] as HTMLVideoElement | undefined;
    const dst = cloneVideos[i];
    if (!src || !dst) continue;
    const still = stillFromVideo(src, doc);
    if (still) {
      dst.replaceWith(still);
      continue;
    }
    const poster = src.poster || dst.getAttribute("poster");
    if (poster) {
      const img = doc.createElement("img");
      img.setAttribute("src", poster);
      copyLayout(dst, img);
      dst.replaceWith(img);
      continue;
    }
    dst.remove();
    complete = false;
  }

  if (clone.querySelector("iframe, object, embed")) {
    complete = false;
    clone.querySelectorAll("iframe, object, embed").forEach((el) => el.remove());
  }
  clone.querySelectorAll("audio, link[rel='stylesheet'], link[rel='preconnect']").forEach((el) => el.remove());

  const urls = collectExternalUrls(clone);
  const resolved = new Map<string, string | null>();
  await Promise.all(
    [...urls].map(async (url) => {
      resolved.set(url, await cachedDataUrl(url, doc, cache));
    }),
  );
  if (!applyResolvedUrls(clone, resolved)) complete = false;
  return complete;
}

function canvasIsReadable(canvas: HTMLCanvasElement): boolean {
  try {
    const cx = canvas.getContext("2d");
    if (!cx || canvas.width === 0 || canvas.height === 0) return false;
    cx.getImageData(0, 0, 1, 1);
    return true;
  } catch {
    return false;
  }
}

function loadImage(doc: Document, url: string): Promise<HTMLImageElement | null> {
  const Ctor = imageConstructor(doc);
  if (!Ctor) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Ctor();
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (value: HTMLImageElement | null): void => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      resolve(value);
    };
    timer = setTimeout(() => finish(null), 3000);
    img.onload = () => finish(img);
    img.onerror = () => finish(null);
    img.src = url;
  });
}

export async function snapshotElement(
  el: HTMLElement,
  w: number,
  h: number,
  cache: SnapshotCache = new Map(),
): Promise<Snapshot | null> {
  if (w <= 0 || h <= 0) return null;
  const doc = el.ownerDocument;
  try {
    const clone = el.cloneNode(true) as HTMLElement;
    if (clone.namespaceURI === "http://www.w3.org/1999/xhtml" && !clone.getAttribute("xmlns")) {
      clone.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
    }
    const complete = await sanitizeSnapshotClone(el, clone, cache);
    if (!complete) return null;
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">` +
      `<foreignObject width="100%" height="100%">` +
      `${new XMLSerializer().serializeToString(clone)}` +
      `</foreignObject></svg>`;
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    try {
      const img = await loadImage(doc, url);
      if (!img) return null;
      const canvas = doc.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const cx = canvas.getContext("2d");
      if (!cx) return null;
      cx.drawImage(img, 0, 0, w, h);
      if (!canvasIsReadable(canvas)) return null;
      return { canvas, width: w, height: h };
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    return null;
  }
}
