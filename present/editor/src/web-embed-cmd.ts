import type { EditCommand, Presentation, Rect, WebEmbedShape } from "@ppt/core";
import { identityTransform, type NormalizedWebEmbed, encodeWebEmbedDescr } from "@ppt/core";
import { genShapeId } from "./shape-factory";

export interface BuildWebEmbedShapeInput {
  embed: NormalizedWebEmbed;
  bbox: Rect;
  allowFullscreen?: boolean;
}

export function buildWebEmbedShape(input: BuildWebEmbedShapeInput): WebEmbedShape {
  const { embed, bbox, allowFullscreen = true } = input;
  const label =
    embed.provider === "youtube"
      ? "YouTube"
      : embed.provider === "vimeo"
        ? "Vimeo"
        : "Web Embed";
  return {
    id: genShapeId("web"),
    name: label,
    zIndex: 0,
    kind: "webEmbed",
    bbox,
    transform: identityTransform(),
    visible: true,
    locked: false,
    opacity: 1,
    embedUrl: embed.embedUrl,
    provider: embed.provider,
    originalUrl: embed.originalUrl,
    allowFullscreen,
    descr: encodeWebEmbedDescr(embed),
    hyperlink: { kind: "url", target: embed.originalUrl || embed.embedUrl },
  };
}

/** Insert a web iframe embed (YouTube / Vimeo) onto the active slide layer. */
export class InsertWebEmbedCmd implements EditCommand {
  readonly label = "Insert web embed";
  readonly shape: WebEmbedShape;

  constructor(
    private slideIdx: number,
    private layerIdx: number,
    input: BuildWebEmbedShapeInput,
  ) {
    this.shape = buildWebEmbedShape(input);
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
