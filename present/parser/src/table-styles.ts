// ECMA-376 §20.1.4.2 tblStyle / §14.7 tableStyles.xml — 一个可选的演示文稿
// 级别部件，定义 wholeTbl/band1H/band2H/firstRow/lastRow/firstCol/lastCol/
// nwCell/neCell/swCell/seCell 等 12 个区域的填充、边框与文字颜色。
import type { Paint, Stroke } from "@ppt/core";
import { attr, findAllByLocalName, findByLocalName, type XmlNode } from "./xml";
import { parseFill, parseStroke, type FillCtx } from "./fill";
import { loadXmlPart } from "./parts";
import { resolveColorEx } from "./theme";
import type { PptxArchive } from "./zip";

export type TableStyleRegion =
  | "wholeTbl"
  | "band1H"
  | "band2H"
  | "band1V"
  | "band2V"
  | "firstRow"
  | "lastRow"
  | "firstCol"
  | "lastCol"
  | "nwCell"
  | "neCell"
  | "swCell"
  | "seCell";

export interface TableStylePart {
  fill?: Paint;
  textColor?: string;
  border?: { left?: Stroke; right?: Stroke; top?: Stroke; bottom?: Stroke; insideH?: Stroke; insideV?: Stroke };
}

export interface TableStyleEntry {
  id: string;
  name?: string;
  parts: Partial<Record<TableStyleRegion, TableStylePart>>;
}

export interface TableStyleMap {
  default?: string;
  byId: Map<string, TableStyleEntry>;
}

export function loadTableStyles(
  archive: PptxArchive,
  partPath: string | undefined,
  ctx: FillCtx,
): TableStyleMap | undefined {
  if (!partPath) return undefined;
  const xml = loadXmlPart(archive, partPath);
  if (!xml) return undefined;
  return parseTableStyleList(xml, ctx);
}

/** 解析 `<a:tblStyleLst>`（文档根或 lst 节点本身均可）。 */
export function parseTableStyleList(xml: XmlNode, ctx: FillCtx): TableStyleMap | undefined {
  const root = findByLocalName(xml, "tblStyleLst") ?? xml;
  const styles = findAllByLocalName(root, "tblStyle");
  if (!styles.length && attr(root, "def") === undefined) return undefined;
  const def = attr(root, "def");
  const byId = new Map<string, TableStyleEntry>();
  for (const ts of styles) {
    const id = attr(ts, "styleId");
    if (!id) continue;
    const entry: TableStyleEntry = { id, name: attr(ts, "styleName"), parts: {} };
    const REGIONS: TableStyleRegion[] = [
      "wholeTbl", "band1H", "band2H", "band1V", "band2V",
      "firstRow", "lastRow", "firstCol", "lastCol",
      "nwCell", "neCell", "swCell", "seCell",
    ];
    for (const r of REGIONS) {
      const node = findByLocalName(ts, r);
      if (!node) continue;
      const part: TableStylePart = {};
      const tcStyle = findByLocalName(node, "tcStyle");
      if (tcStyle) {
        const fillRef = findByLocalName(tcStyle, "fill");
        if (fillRef) {
          const f = parseFill(fillRef, ctx);
          if (f) part.fill = f;
        }
        const tcBdr = findByLocalName(tcStyle, "tcBdr");
        if (tcBdr) {
          const b: NonNullable<TableStylePart["border"]> = {};
          const sides: Array<[string, keyof typeof b]> = [
            ["left", "left"], ["right", "right"], ["top", "top"], ["bottom", "bottom"],
            ["insideH", "insideH"], ["insideV", "insideV"],
          ];
          for (const [tag, key] of sides) {
            const sideEl = findByLocalName(tcBdr, tag);
            if (!sideEl) continue;
            const ln = findByLocalName(sideEl, "ln");
            if (!ln) continue;
            const host: XmlNode = { ln };
            Object.defineProperty(host, "$children", {
              value: [{ tag: "ln", node: ln }],
              enumerable: false,
              configurable: true,
            });
            b[key] = parseStroke(host, ctx);
          }
          if (Object.keys(b).length) part.border = b;
        }
      }
      const tcTxStyle = findByLocalName(node, "tcTxStyle");
      if (tcTxStyle) {
        const color = readTxStyleColor(tcTxStyle, ctx);
        if (color) part.textColor = color;
      }
      if (Object.keys(part).length) entry.parts[r] = part;
    }
    byId.set(id, entry);
  }
  return { default: def, byId };
}

function readTxStyleColor(tcTxStyle: XmlNode, ctx: FillCtx): string | undefined {
  const fontFill = findByLocalName(tcTxStyle, "solidFill");
  if (fontFill) {
    const f = parseFill({ solidFill: fontFill } as XmlNode, ctx);
    if (f && f.kind === "solid") return f.color;
  }
  const fontRef = findByLocalName(tcTxStyle, "fontRef");
  const fromRef = resolveColorEx(fontRef, ctx.theme);
  if (fromRef) return fromRef.color;
  return resolveColorEx(tcTxStyle, ctx.theme)?.color;
}
