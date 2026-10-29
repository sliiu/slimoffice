import type { Rect, Transform } from "@ppt/core";
import type { OleObjectShape, ShapeMeta } from "@ppt/core";
import { boolish, emuToPx } from "./units";
import { attr, findByLocalName, pickAlternateContentChildren, type XmlNode } from "./xml";
import type { RelMap } from "./parts";
import { extractOlePreviewPayload } from "./ole-preview";
import type { PptxArchive } from "./zip";
import { joinPath } from "./zip";

export interface OleParseCtx {
  rels?: RelMap;
  archive?: PptxArchive;
  resolveRawBytes?: (cacheKey: string, bytes: Uint8Array, mime: string) => string | undefined;
}

export const OLE_GRAPHIC_URI = "http://schemas.openxmlformats.org/presentationml/2006/ole";

const PROG_ID_LABELS: Record<string, string> = {
  "Excel.Sheet.12": "Excel Worksheet",
  "Excel.Sheet.8": "Excel Worksheet",
  "Excel.Chart.8": "Excel Chart",
  "Word.Document.12": "Word Document",
  "Word.Document.8": "Word Document",
  "PowerPoint.Show.12": "PowerPoint Presentation",
  "PowerPoint.Show.8": "PowerPoint Presentation",
  "Acrobat.Document.DC": "PDF Document",
  "Acrobat.Document": "PDF Document",
  "Equation.3": "Equation",
  "Package": "Embedded Package",
  "Visio.Drawing.15": "Visio Drawing",
  "Outlook.MsgAttach": "Outlook Message",
};

/** Map OOXML progId / file extension to a short human-readable type label. */
export function oleTypeLabel(progId: string | undefined, fileName?: string): string {
  if (progId && PROG_ID_LABELS[progId]) return PROG_ID_LABELS[progId]!;
  if (progId) {
    const base = progId.split(".")[0];
    if (base && base !== progId) return base;
    return progId;
  }
  const ext = fileName?.split(".").pop()?.toLowerCase();
  if (ext === "xlsx" || ext === "xls") return "Excel Worksheet";
  if (ext === "docx" || ext === "doc") return "Word Document";
  if (ext === "pptx" || ext === "ppt") return "PowerPoint Presentation";
  if (ext === "pdf") return "PDF Document";
  if (ext) return ext.toUpperCase() + " File";
  return "Embedded Object";
}

/** Short badge text for the OLE icon tile (e.g. XLS, PDF). */
export function oleBadgeText(progId: string | undefined, fileName?: string, typeLabel?: string): string {
  const ext = fileName?.split(".").pop()?.toUpperCase();
  if (ext && ext.length <= 5) return ext;
  if (progId?.startsWith("Excel")) return "XLS";
  if (progId?.startsWith("Word")) return "DOC";
  if (progId?.startsWith("PowerPoint")) return "PPT";
  if (progId?.includes("Acrobat") || progId?.includes("PDF")) return "PDF";
  if (progId === "Equation.3") return "fx";
  if (typeLabel) {
    const w = typeLabel.split(/\s+/)[0] ?? "OBJ";
    return w.slice(0, 4).toUpperCase();
  }
  return "OLE";
}

function findOleObj(graphicData: XmlNode): XmlNode | undefined {
  const direct = findByLocalName(graphicData, "oleObj");
  if (direct) return direct;
  const alt = findByLocalName(graphicData, "AlternateContent");
  if (!alt) return undefined;
  for (const ref of pickAlternateContentChildren(alt)) {
    const local = ref.tag.replace(/^.*:/, "");
    if (local === "oleObj") return ref.node;
    const nested = findByLocalName(ref.node, "oleObj");
    if (nested) return nested;
  }
  const fallback = findByLocalName(alt, "Fallback");
  if (fallback) return findByLocalName(fallback, "oleObj");
  return undefined;
}

function oleBadgeColor(progId: string | undefined, fileName?: string): string {
  const ext = fileName?.split(".").pop()?.toLowerCase();
  if (progId?.startsWith("Excel") || ext === "xlsx" || ext === "xls") return "#217346";
  if (progId?.startsWith("Word") || ext === "docx" || ext === "doc") return "#2b579a";
  if (progId?.startsWith("PowerPoint") || ext === "pptx" || ext === "ppt") return "#d24726";
  if (progId?.includes("Acrobat") || ext === "pdf") return "#c41e3a";
  if (progId === "Equation.3") return "#6366f1";
  return "#64748b";
}

const EXT_PROG_ID: Record<string, string> = {
  xlsx: "Excel.Sheet.12",
  xlsm: "Excel.Sheet.12",
  xls: "Excel.Sheet.8",
  docx: "Word.Document.12",
  doc: "Word.Document.8",
  pptx: "PowerPoint.Show.12",
  pptm: "PowerPoint.Show.12",
  ppt: "PowerPoint.Show.8",
  pdf: "Acrobat.Document.DC",
  vsdx: "Visio.Drawing.15",
};

/** Guess OOXML `progId` from a user-selected file name (Insert → Object). */
export function guessOleProgId(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase();
  if (ext && EXT_PROG_ID[ext]) return EXT_PROG_ID[ext]!;
  return "Package";
}

export { oleBadgeColor };

/** Parse `<a:graphicData uri="…/ole">` → `OleObjectShape`. */
export function parseOleGraphicFrame(
  graphicData: XmlNode,
  meta: ShapeMeta,
  bbox: Rect,
  transform: Transform,
  ctx?: OleParseCtx,
): OleObjectShape | null {
  const uri = attr(graphicData, "uri");
  const oleEl = findOleObj(graphicData);
  if (!oleEl && uri !== OLE_GRAPHIC_URI) return null;
  if (!oleEl) return null;

  const progId = attr(oleEl, "progId");
  const objectName = attr(oleEl, "name") ?? meta.name;
  const showAsIcon = boolish(attr(oleEl, "showAsIcon"));
  const relId = attr(oleEl, "r:id") ?? attr(oleEl, "id");
  const isLinked = Boolean(findByLocalName(oleEl, "link"));
  const imgW = attr(oleEl, "imgW");
  const imgH = attr(oleEl, "imgH");

  let embedPath: string | undefined;
  let embedFileName: string | undefined;
  const rels = ctx?.rels;
  if (relId && rels) {
    const raw = rels.resolve(relId);
    if (raw) {
      embedPath = raw.includes("..") && rels.ownerPath ? joinPath(rels.ownerPath, raw) : raw;
      embedFileName = embedPath.split("/").pop();
    }
  }

  let previewSrc: string | undefined;
  let previewKind: OleObjectShape["previewKind"];
  if (embedPath && ctx?.archive) {
    const embedBytes = ctx.archive.getBytes(embedPath);
    if (embedBytes) {
      const payload = extractOlePreviewPayload(embedBytes, embedFileName, progId);
      if (payload && ctx.resolveRawBytes) {
        const key = `${embedPath}#preview-${payload.kind}`;
        previewSrc = ctx.resolveRawBytes(key, payload.bytes, payload.mime);
        previewKind = payload.kind;
      }
    }
  }

  const typeLabel = oleTypeLabel(progId, embedFileName);
  const badgeText = oleBadgeText(progId, embedFileName, typeLabel);

  return {
    ...meta,
    kind: "ole",
    bbox,
    transform,
    progId,
    objectName,
    showAsIcon: showAsIcon ?? undefined,
    isLinked,
    embedPath,
    embedFileName,
    typeLabel,
    badgeText,
    badgeColor: oleBadgeColor(progId, embedFileName),
    iconSize:
      imgW && imgH
        ? { w: emuToPx(imgW), h: emuToPx(imgH) }
        : undefined,
    previewSrc,
    previewKind,
    fill: { kind: "solid", color: "#f8fafc", alpha: 1 },
    stroke: { paint: { kind: "solid", color: "#94a3b8" }, width: 1, dash: [4, 3] },
  };
}
