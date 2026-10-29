import type { EditCommand, OleObjectShape, Presentation, Rect } from "@ppt/core";
import { identityTransform } from "@ppt/core";
import {
  guessOleProgId,
  oleBadgeColor,
  oleBadgeText,
  oleTypeLabel,
  extractOlePreviewPayload,
} from "@ppt/parser";

let oleSeq = 1;

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

function dataUrlToBytes(dataUrl: string): Uint8Array | null {
  const m = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!m) return null;
  const bin =
    typeof atob !== "undefined"
      ? atob(m[2]!)
      : (globalThis as { Buffer?: { from(s: string, e: string): { buffer: ArrayBuffer } } }).Buffer?.from(
          m[2]!,
          "base64",
        );
  if (!bin) return null;
  if (bin instanceof Uint8Array) return bin;
  const s = String(bin);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export interface BuildOleShapeInput {
  fileName: string;
  embedSrc: string;
  bbox: Rect;
  showAsIcon?: boolean;
}

/** Build an `OleObjectShape` for editor insert. */
export function buildOleShape(input: BuildOleShapeInput): OleObjectShape {
  const { fileName, embedSrc, bbox, showAsIcon = true } = input;
  const progId = guessOleProgId(fileName);
  const embedFileName = fileName.split(/[/\\]/).pop() ?? fileName;
  const typeLabel = oleTypeLabel(progId, embedFileName);
  const badgeText = oleBadgeText(progId, embedFileName, typeLabel);
  const objectName = embedFileName.replace(/\.[^.]+$/, "") || embedFileName;

  let previewSrc: string | undefined;
  let previewKind: OleObjectShape["previewKind"];
  const bytes = dataUrlToBytes(embedSrc);
  if (bytes) {
    const payload = extractOlePreviewPayload(bytes, embedFileName, progId);
    if (payload) {
      previewSrc = `data:${payload.mime};base64,${bytesToBase64(payload.bytes)}`;
      previewKind = payload.kind;
    }
  }

  return {
    id: `ole_${oleSeq++}`,
    name: objectName,
    zIndex: 0,
    kind: "ole",
    bbox,
    transform: identityTransform(),
    visible: true,
    locked: false,
    opacity: 1,
    progId,
    objectName: embedFileName,
    embedFileName,
    embedSrc,
    showAsIcon,
    isLinked: false,
    typeLabel,
    badgeText,
    badgeColor: oleBadgeColor(progId, embedFileName),
    previewSrc,
    previewKind,
    fill: { kind: "solid", color: "#f8fafc", alpha: 1 },
    stroke: { paint: { kind: "solid", color: "#94a3b8" }, width: 1, dash: [4, 3] },
  };
}

/** Download the embedded OLE payload (original file bytes as data URL). */
export function downloadOleEmbed(doc: Document, shape: OleObjectShape): void {
  if (!shape.embedSrc) return;
  const a = doc.createElement("a");
  a.href = shape.embedSrc;
  a.download = shape.embedFileName ?? shape.objectName ?? "embedded-object.bin";
  doc.body.appendChild(a);
  a.click();
  a.remove();
}

/** Byte length of an OLE `embedSrc` data URL (for UI labels). */
export function oleEmbedByteSize(embedSrc: string | undefined): number | null {
  if (!embedSrc) return null;
  return dataUrlToBytes(embedSrc)?.length ?? null;
}

/** Byte length of any `data:...;base64,...` URL (video / audio / glTF / OLE). */
export function dataUrlByteSize(dataUrl: string | undefined): number | null {
  return oleEmbedByteSize(dataUrl);
}

export const OLE_EMBED_WARN_BYTES = 8 * 1024 * 1024;

export function isOleEmbedOverLimit(bytes: number | null, limit = OLE_EMBED_WARN_BYTES): boolean {
  return bytes != null && bytes > limit;
}

export function formatByteSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Insert an embedded OLE object onto the active slide layer. */
export class InsertOleCmd implements EditCommand {
  readonly label = "Insert object";
  readonly shape: OleObjectShape;

  constructor(
    private slideIdx: number,
    private layerIdx: number,
    input: BuildOleShapeInput,
  ) {
    this.shape = buildOleShape(input);
  }

  apply(pres: Presentation): void {
    const slide = pres.slides[this.slideIdx];
    const layer = slide?.layers[this.layerIdx];
    if (!layer) return;
    layer.shapes.push(this.shape);
  }

  revert(pres: Presentation): void {
    const slide = pres.slides[this.slideIdx];
    const layer = slide?.layers[this.layerIdx];
    if (!layer) return;
    const pos = layer.shapes.findIndex((s) => s.id === this.shape.id);
    if (pos >= 0) layer.shapes.splice(pos, 1);
  }
}

function oleShapeAt(pres: Presentation, slideIdx: number, id: string): OleObjectShape | undefined {
  const slide = pres.slides[slideIdx];
  if (!slide) return undefined;
  for (const layer of slide.layers) {
    const s = layer.shapes.find((sh) => sh.id === id);
    if (s?.kind === "ole") return s as OleObjectShape;
  }
  return undefined;
}

type OleEmbedSnapshot = Pick<
  OleObjectShape,
  | "name"
  | "progId"
  | "objectName"
  | "embedFileName"
  | "embedSrc"
  | "typeLabel"
  | "badgeText"
  | "badgeColor"
  | "previewSrc"
  | "previewKind"
>;

function applyOleEmbedPatch(shape: OleObjectShape, fileName: string, embedSrc: string): void {
  const rebuilt = buildOleShape({
    fileName,
    embedSrc,
    bbox: shape.bbox,
    showAsIcon: shape.showAsIcon,
  });
  shape.name = rebuilt.name;
  shape.progId = rebuilt.progId;
  shape.objectName = rebuilt.objectName;
  shape.embedFileName = rebuilt.embedFileName;
  shape.embedSrc = rebuilt.embedSrc;
  shape.typeLabel = rebuilt.typeLabel;
  shape.badgeText = rebuilt.badgeText;
  shape.badgeColor = rebuilt.badgeColor;
  shape.previewSrc = rebuilt.previewSrc;
  shape.previewKind = rebuilt.previewKind;
}

/** Replace embedded file bytes on an existing OLE shape. */
export class UpdateOleEmbedCmd implements EditCommand {
  readonly label = "Replace embedded object";
  private snapshot?: OleEmbedSnapshot;

  constructor(
    private slideIdx: number,
    private shapeId: string,
    private fileName: string,
    private embedSrc: string,
  ) {}

  apply(pres: Presentation): void {
    const shape = oleShapeAt(pres, this.slideIdx, this.shapeId);
    if (!shape) return;
    this.snapshot = {
      name: shape.name,
      progId: shape.progId,
      objectName: shape.objectName,
      embedFileName: shape.embedFileName,
      embedSrc: shape.embedSrc,
      typeLabel: shape.typeLabel,
      badgeText: shape.badgeText,
      badgeColor: shape.badgeColor,
      previewSrc: shape.previewSrc,
      previewKind: shape.previewKind,
    };
    applyOleEmbedPatch(shape, this.fileName, this.embedSrc);
  }

  revert(pres: Presentation): void {
    const shape = oleShapeAt(pres, this.slideIdx, this.shapeId);
    if (!shape || !this.snapshot) return;
    Object.assign(shape, this.snapshot);
  }
}

export class SetOleShowAsIconCmd implements EditCommand {
  readonly label = "Embedded object as icon";
  private prev?: boolean;

  constructor(
    private slideIdx: number,
    private shapeId: string,
    private showAsIcon: boolean,
  ) {}

  apply(pres: Presentation): void {
    const shape = oleShapeAt(pres, this.slideIdx, this.shapeId);
    if (!shape) return;
    this.prev = shape.showAsIcon;
    shape.showAsIcon = this.showAsIcon;
  }

  revert(pres: Presentation): void {
    const shape = oleShapeAt(pres, this.slideIdx, this.shapeId);
    if (!shape || this.prev === undefined) return;
    shape.showAsIcon = this.prev;
  }
}
