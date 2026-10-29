/** 浏览器无法加载 `file:` 外链图；画带文件名的占位，避免空白碎图。
 *  Node 下若本地文件仍在，读成 data URL 仅供预览，**不改 IR 的 src**（否则 round-trip 会丢掉 r:link）。
 */

export function isFileLinkedSrc(src: string | undefined): boolean {
  return !!src && /^file:/i.test(src);
}

export function linkedImageLabel(src: string): string {
  const stripped = src.replace(/^file:\/\//i, "").replace(/^\/\//, "");
  const name = stripped.split(/[/\\]/).pop()?.trim();
  return name && name.length > 0 && name.length < 80 ? name : "Linked image";
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const FILE_PREVIEW_CACHE = new Map<string, string | null>();

function fileUrlToFsPath(src: string): string | undefined {
  try {
    const u = new URL(src);
    if (u.protocol !== "file:") return undefined;
    let p = decodeURIComponent(u.pathname);
    if (/^\/[A-Za-z]:\//.test(p)) p = p.slice(1);
    return p;
  } catch {
    return undefined;
  }
}

function mimeFromFsPath(p: string): string {
  const ext = p.slice(p.lastIndexOf(".") + 1).toLowerCase();
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "gif") return "image/gif";
  if (ext === "webp") return "image/webp";
  if (ext === "svg") return "image/svg+xml";
  if (ext === "bmp") return "image/bmp";
  return "image/png";
}

type NodeFs = { existsSync(p: string): boolean; readFileSync(p: string): { toString(enc: string): string } };

function tryReadFileLinkedDataUrl(src: string): string | undefined {
  const cached = FILE_PREVIEW_CACHE.get(src);
  if (cached === null) return undefined;
  if (cached) return cached;
  const proc = globalThis as {
    process?: { versions?: { node?: string }; platform?: string; getBuiltinModule?: (id: string) => unknown };
  };
  if (!proc.process?.versions?.node) {
    FILE_PREVIEW_CACHE.set(src, null);
    return undefined;
  }
  const fsPath = fileUrlToFsPath(src);
  if (!fsPath) {
    FILE_PREVIEW_CACHE.set(src, null);
    return undefined;
  }
  try {
    const fs = proc.process.getBuiltinModule?.("fs") as NodeFs | undefined;
    if (!fs?.existsSync || !fs.readFileSync || !fs.existsSync(fsPath)) {
      FILE_PREVIEW_CACHE.set(src, null);
      return undefined;
    }
    const b64 = fs.readFileSync(fsPath).toString("base64");
    const dataUrl = `data:${mimeFromFsPath(fsPath)};base64,${b64}`;
    FILE_PREVIEW_CACHE.set(src, dataUrl);
    return dataUrl;
  } catch {
    FILE_PREVIEW_CACHE.set(src, null);
    return undefined;
  }
}

export function linkedImagePlaceholderDataUri(src: string, w = 320, h = 180): string {
  const label = escapeXml(linkedImageLabel(src));
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.max(1, Math.round(w))}" height="${Math.max(1, Math.round(h))}">` +
    `<rect width="100%" height="100%" fill="#f3f4f6"/>` +
    `<rect x="0.5" y="0.5" width="99%" height="99%" fill="none" stroke="#d1d5db" stroke-dasharray="6 4"/>` +
    `<text x="50%" y="46%" text-anchor="middle" font-size="14" fill="#6b7280" font-family="sans-serif">Linked image</text>` +
    `<text x="50%" y="60%" text-anchor="middle" font-size="12" fill="#6b7280" font-family="sans-serif">${label}</text>` +
    `</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function displayImageSrc(src: string, w = 320, h = 180): string {
  if (!isFileLinkedSrc(src)) return src;
  return tryReadFileLinkedDataUrl(src) ?? linkedImagePlaceholderDataUri(src, w, h);
}

export function drawLinkedImagePlaceholder(
  ctx: CanvasRenderingContext2D,
  bbox: { x: number; y: number; w: number; h: number },
  src: string,
): void {
  ctx.save();
  ctx.fillStyle = "#f3f4f6";
  ctx.fillRect(bbox.x, bbox.y, bbox.w, bbox.h);
  ctx.strokeStyle = "#d1d5db";
  ctx.setLineDash([6, 4]);
  ctx.lineWidth = 1;
  ctx.strokeRect(bbox.x + 0.5, bbox.y + 0.5, bbox.w - 1, bbox.h - 1);
  ctx.setLineDash([]);
  ctx.fillStyle = "#6b7280";
  ctx.font = "12px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const label = linkedImageLabel(src);
  ctx.fillText("Linked image", bbox.x + bbox.w / 2, bbox.y + bbox.h / 2 - 8);
  ctx.font = "11px sans-serif";
  ctx.fillText(label, bbox.x + bbox.w / 2, bbox.y + bbox.h / 2 + 10, Math.max(8, bbox.w - 12));
  ctx.restore();
}
