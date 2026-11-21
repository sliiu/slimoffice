import type { SheetAlign, SheetBorder, SheetCell, SheetVAlign } from "@sliiu/sheet-core";
import { attr, child, children, parseXml, type XmlNode } from "./xml";

/** Style fields copied onto a cell. Empty means the cell keeps its value only. */
export type CellLook = Pick<
  SheetCell,
  "bold" | "italic" | "underline" | "strike" | "font" | "fontSize" | "color" | "fill" | "numFmt" | "align" | "valign" | "wrap" | "indent" | "border"
>;

const BUILTIN_FMT: Record<number, string> = {
  1: "0",
  2: "0.00",
  3: "#,##0",
  4: "#,##0.00",
  9: "0%",
  10: "0.00%",
  11: "0.00E+00",
  14: "m/d/yyyy",
  15: "d-mmm-yy",
  16: "d-mmm",
  17: "mmm-yy",
  18: "h:mm AM/PM",
  19: "h:mm:ss AM/PM",
  20: "h:mm",
  21: "h:mm:ss",
  22: "m/d/yyyy h:mm",
  37: "#,##0_);(#,##0)",
  38: "#,##0_);[Red](#,##0)",
  39: "#,##0.00_);(#,##0.00)",
  40: "#,##0.00_);[Red](#,##0.00)",
  45: "mm:ss",
  46: "[h]:mm:ss",
  47: "mmss.0",
  48: "##0.0E+0",
  49: "@",
};

const ALIGN: Record<string, SheetAlign> = { left: "left", center: "center", right: "right", justify: "justify" };
const VALIGN: Record<string, SheetVAlign> = { top: "top", center: "middle", bottom: "bottom" };

/** One look per `cellXfs` entry. Index 0 is the sheet default and is usually empty. */
export function readCellStyles(stylesXml: string | undefined): CellLook[] {
  if (!stylesXml) return [];
  const root = child(parseXml(stylesXml), "styleSheet");
  const formats = new Map<number, string>(Object.entries(BUILTIN_FMT).map(([id, code]) => [Number(id), code]));
  for (const fmt of children(child(root, "numFmts"), "numFmt")) {
    const id = Number(attr(fmt, "numFmtId"));
    const code = attr(fmt, "formatCode");
    if (Number.isInteger(id) && code && code.toLowerCase() !== "general") formats.set(id, code);
  }
  const fonts = children(child(root, "fonts"), "font").map(readFont);
  const fills = children(child(root, "fills"), "fill").map(readFill);
  const borders = children(child(root, "borders"), "border").map(readBorder);
  return children(child(root, "cellXfs"), "xf").map((xf) => {
    const look: CellLook = {};
    const fontId = Number(attr(xf, "fontId"));
    const fillId = Number(attr(xf, "fillId"));
    const borderId = Number(attr(xf, "borderId"));
    const numFmtId = Number(attr(xf, "numFmtId"));
    Object.assign(look, taken(xf, "applyFont", fonts[fontId]));
    Object.assign(look, taken(xf, "applyFill", fills[fillId]));
    Object.assign(look, taken(xf, "applyBorder", borders[borderId]));
    const format = formats.get(numFmtId);
    if (format) Object.assign(look, taken(xf, "applyNumberFormat", { numFmt: format }));
    Object.assign(look, taken(xf, "applyAlignment", readAlignment(child(xf, "alignment"))));
    return look;
  });
}

export function hasLook(look: CellLook | undefined): boolean {
  return !!look && Object.keys(look).length > 0;
}

function taken(xf: XmlNode, flag: string, look: CellLook | undefined): CellLook | undefined {
  if (!hasLook(look)) return undefined;
  const raw = attr(xf, flag);
  if (raw === "0" || raw === "false") return undefined;
  return look;
}

function readFont(font: XmlNode): CellLook {
  const look: CellLook = {};
  if (on(child(font, "b"))) look.bold = true;
  if (on(child(font, "i"))) look.italic = true;
  if (on(child(font, "u"))) look.underline = true;
  if (on(child(font, "strike"))) look.strike = true;
  const size = Number(attr(child(font, "sz"), "val"));
  if (size > 0) look.fontSize = size;
  const color = rgbOf(child(font, "color"));
  if (color) look.color = color;
  const name = attr(child(font, "name"), "val");
  if (name) look.font = name;
  return look;
}

function readFill(fill: XmlNode): CellLook {
  const pattern = child(fill, "patternFill");
  if (attr(pattern, "patternType") !== "solid") return {};
  const color = rgbOf(child(pattern, "fgColor")) ?? rgbOf(child(pattern, "bgColor"));
  return color ? { fill: color } : {};
}

function readBorder(border: XmlNode): CellLook {
  const edges: NonNullable<SheetCell["border"]> = {};
  for (const side of ["left", "right", "top", "bottom"] as const) {
    const edge = readEdge(child(border, side));
    if (edge) edges[side] = edge;
  }
  return Object.keys(edges).length ? { border: edges } : {};
}

function readEdge(node: XmlNode | undefined): SheetBorder | undefined {
  const style = attr(node, "style");
  if (!node || !style || style === "none") return undefined;
  const known = style === "thin" || style === "medium" || style === "thick" || style === "dashed" || style === "dotted" ? style : "thin";
  const color = rgbOf(child(node, "color"));
  return color ? { style: known, color } : { style: known };
}

function readAlignment(node: XmlNode | undefined): CellLook {
  if (!node) return {};
  const look: CellLook = {};
  const horizontal = ALIGN[attr(node, "horizontal") ?? ""];
  const vertical = VALIGN[attr(node, "vertical") ?? ""];
  if (horizontal) look.align = horizontal;
  if (vertical) look.valign = vertical;
  if (attr(node, "wrapText") === "1") look.wrap = true;
  const indent = Number(attr(node, "indent"));
  if (indent > 0) look.indent = indent;
  return look;
}

function on(node: XmlNode | undefined): boolean {
  if (!node) return false;
  const raw = attr(node, "val");
  return raw !== "0" && raw !== "false" && raw !== "none";
}

function rgbOf(node: XmlNode | undefined): string | undefined {
  const raw = attr(node, "rgb")?.replace(/^#/, "");
  if (!raw || !/^[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$/.test(raw)) return undefined;
  return `#${(raw.length === 8 ? raw.slice(2) : raw).toLowerCase()}`;
}
