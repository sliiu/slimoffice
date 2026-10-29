// 参考文档是文档或图像。版式模板和样稿不是参考文档，但一份 PPTX 也可以只当材料。

export type SourceKind = "pdf" | "docx" | "xlsx" | "legacy" | "image" | "text" | "document" | "unknown";

const PDF = "application/pdf";
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const PPTX = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

const IMAGE_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  tif: "image/tiff",
  tiff: "image/tiff",
  svg: "image/svg+xml",
  heic: "image/heic",
  heif: "image/heif",
  avif: "image/avif",
};

const TEXT_EXT = new Set([
  "txt", "md", "markdown", "csv", "tsv", "json", "html", "htm", "xml", "log", "rst", "yaml", "yml", "rtf",
]);

const DOCUMENT_EXT = new Set(["ppt", "pptx", "odt", "ods", "odp", "epub", "pages", "key", "numbers"]);

export interface IncomingSourceFile {
  name: string;
  mediaType: string;
  bytes: Uint8Array;
}

export function topicFromSourceName(name: string): string {
  const base = name.trim().replace(/^.*[/\\]/, "");
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  return stem.trim();
}

function extensionOf(name: string): string {
  return name.trim().toLowerCase().split(".").pop() ?? "";
}

export function classifySourceFile(name: string, mediaType: string): SourceKind {
  const ext = extensionOf(name);
  const mime = mediaType.trim().toLowerCase();
  if (ext === "pdf" || mime === PDF) return "pdf";
  if (ext === "docx" || mime === DOCX) return "docx";
  if (ext === "xlsx" || mime === XLSX) return "xlsx";
  if (ext === "doc" || ext === "xls" || mime === "application/msword" || mime === "application/vnd.ms-excel") {
    return "legacy";
  }
  if (mime.startsWith("image/") || ext in IMAGE_MIME) return "image";
  if (mime.startsWith("text/") || mime === "application/json" || mime === "application/xml" || TEXT_EXT.has(ext)) {
    return "text";
  }
  if (
    ext === "pptx" ||
    mime === PPTX ||
    mime.includes("opendocument") ||
    mime === "application/epub+zip" ||
    DOCUMENT_EXT.has(ext)
  ) {
    return "document";
  }
  return "unknown";
}

export function mediaTypeForKind(kind: SourceKind, given: string, name = ""): string {
  if (kind === "pdf") return PDF;
  if (kind === "docx") return DOCX;
  if (kind === "xlsx") return XLSX;
  if (kind === "image") {
    const mime = given.trim().toLowerCase();
    if (mime.startsWith("image/")) return mime;
    return IMAGE_MIME[extensionOf(name)] ?? "image/png";
  }
  if (kind === "text") {
    const mime = given.trim().toLowerCase();
    if (mime.startsWith("text/") || mime === "application/json" || mime === "application/xml") return mime;
    return "text/plain";
  }
  if (kind === "document") {
    const mime = given.trim().toLowerCase();
    if (mime) return mime;
    if (extensionOf(name) === "pptx") return PPTX;
  }
  return given || "application/octet-stream";
}
