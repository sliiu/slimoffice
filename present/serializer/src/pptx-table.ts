import type { GroupShape, Shape, Stroke, TextShape } from "@ppt/core";
import { attrs, esc, pxToEmu } from "./xml-util";
import { aTxBodyToXml, allocSpId, fillToXml, graphicFrameLocksXml, hlinkTagXml, nvPrXml, strokeToXml, type ShapeCtx } from "./pptx-shapes";

const TABLE_URI = "http://schemas.openxmlformats.org/drawingml/2006/table";

function getCell(g: GroupShape, r: number, c: number): TextShape | undefined {
  const { cols } = g.tableMeta!;
  const idx = r * cols + c;
  const s = g.children[idx];
  return s?.kind === "text" ? s : undefined;
}

function colWidths(g: GroupShape): number[] {
  const { rows, cols } = g.tableMeta!;
  const ws: number[] = [];
  for (let c = 0; c < cols; c++) {
    const cell = getCell(g, 0, c);
    ws.push(cell?.bbox.w ?? g.bbox.w / cols);
  }
  if (rows === 0) return ws;
  return ws;
}

function rowHeights(g: GroupShape): number[] {
  const { rows, cols } = g.tableMeta!;
  const hs: number[] = [];
  for (let r = 0; r < rows; r++) {
    const cell = getCell(g, r, 0);
    hs.push(cell?.bbox.h ?? g.bbox.h / rows);
  }
  return hs;
}

function hiddenMergeKind(g: GroupShape, r: number, c: number): "hMerge" | "vMerge" {
  for (let cc = c - 1; cc >= 0; cc--) {
    const left = getCell(g, r, cc);
    if (!left || left.cellMeta?.hidden) continue;
    const span = left.cellMeta?.gridSpan ?? 1;
    if (cc + span > c) return "hMerge";
    break;
  }
  for (let rr = r - 1; rr >= 0; rr--) {
    const up = getCell(g, rr, c);
    if (!up || up.cellMeta?.hidden) continue;
    const span = up.cellMeta?.rowSpan ?? 1;
    if (rr + span > r) return "vMerge";
    return "vMerge";
  }
  return "hMerge";
}

function tcSideLn(tag: string, stroke: Stroke | undefined): string {
  if (!stroke) return "";
  const xml = strokeToXml(stroke, tag);
  return xml || "";
}

function tcPrXml(cell: TextShape): string {
  const anchor = cell.vAlign === "middle" ? "ctr" : cell.vAlign === "bottom" ? "b" : "t";
  const tcAttrs: Record<string, string | number | undefined> = {
    anchor,
    anchorCtr: cell.anchorCtr ? 1 : undefined,
    horzOverflow: cell.horzOverflow && cell.horzOverflow !== "overflow" ? cell.horzOverflow : undefined,
    vert: cell.vert && cell.vert !== "horz" ? cell.vert : undefined,
  };
  const lIns = pxToEmu(cell.insets?.l ?? 7);
  const tIns = pxToEmu(cell.insets?.t ?? 4);
  const rIns = pxToEmu(cell.insets?.r ?? 7);
  const bIns = pxToEmu(cell.insets?.b ?? 4);
  const fill = cell.fill ? fillToXml(cell.fill) : "";
  const b = cell.cellMeta?.borders;
  const perSide = !!(b && (b.l || b.r || b.t || b.b || b.tl2br || b.bl2tr));
  const borders = perSide && b
    ? [
        tcSideLn("a:lnL", b.l),
        tcSideLn("a:lnR", b.r),
        tcSideLn("a:lnT", b.t),
        tcSideLn("a:lnB", b.b),
        tcSideLn("a:lnTlToBr", b.tl2br),
        tcSideLn("a:lnBlToTr", b.bl2tr),
      ].join("")
    : [
        tcSideLn("a:lnL", cell.stroke),
        tcSideLn("a:lnR", cell.stroke),
        tcSideLn("a:lnT", cell.stroke),
        tcSideLn("a:lnB", cell.stroke),
      ].join("");
  // §21.1.3.17 CT_TableCellProperties 是 sequence：lnL…lnBlToTr → cell3D → 填充 → headers。
  // 边线必须写在填充前面，反了 PowerPoint 会按 schema 报错整张表拒收。
  return `<a:tcPr${attrs(tcAttrs)} marL="${lIns}" marR="${rIns}" marT="${tIns}" marB="${bIns}">${borders}${fill}</a:tcPr>`;
}

function cellToTcXml(g: GroupShape, r: number, c: number, ctx: ShapeCtx): string {
  const cell = getCell(g, r, c);
  const meta = cell?.cellMeta;
  if (meta?.hidden) {
    const kind = hiddenMergeKind(g, r, c);
    return `<a:tc ${kind}="1"/>`;
  }
  if (!cell) return `<a:tc/>`;
  const tcAttrs: Record<string, string | number | undefined> = {};
  if ((meta?.gridSpan ?? 1) > 1) tcAttrs.gridSpan = meta!.gridSpan;
  if ((meta?.rowSpan ?? 1) > 1) tcAttrs.rowSpan = meta!.rowSpan;
  const txBody = aTxBodyToXml(cell.paragraphs, cell, ctx);
  // §21.1.3.16 CT_TableCell：txBody 在 tcPr 之前。
  return `<a:tc${attrs(tcAttrs)}>${txBody}${tcPrXml(cell)}</a:tc>`;
}

/** 仅 `<a:tbl>…</a:tbl>` 片段（round-trip patch 用）。 */
export function tableTblXml(g: GroupShape, ctx: ShapeCtx): string {
  const { rows, cols } = g.tableMeta!;
  const colWs = colWidths(g);
  const rowHs = rowHeights(g);
  const tblGrid = colWs.map((w) => `<a:gridCol w="${pxToEmu(w)}"/>`).join("");
  const trs: string[] = [];
  for (let r = 0; r < rows; r++) {
    const tcs = [];
    for (let c = 0; c < cols; c++) tcs.push(cellToTcXml(g, r, c, ctx));
    trs.push(`<a:tr h="${pxToEmu(rowHs[r] ?? 0)}">${tcs.join("")}</a:tr>`);
  }
  return `<a:tbl><a:tblPr${tblPrAttrs(g.tableMeta!)}/><a:tblGrid>${tblGrid}</a:tblGrid>${trs.join("")}</a:tbl>`;
}

function tblPrAttrs(meta: NonNullable<GroupShape["tableMeta"]>): string {
  const flag = (key: "firstRow" | "lastRow" | "firstCol" | "lastCol" | "bandRow" | "bandCol", fallback?: boolean): string => {
    const v = meta[key];
    if (v === true) return ` ${key}="1"`;
    if (v === false) return ` ${key}="0"`;
    if (fallback) return ` ${key}="1"`;
    return "";
  };
  const style = meta.styleId ? ` styleId="${esc(meta.styleId)}"` : "";
  return `${flag("firstRow", true)}${flag("lastRow")}${flag("firstCol")}${flag("lastCol")}${flag("bandRow", true)}${flag("bandCol")}${style}`;
}

function cNvPrXml(id: number, g: GroupShape, ctx: ShapeCtx): string {
  const a: Record<string, string | number | undefined> = {
    id,
    name: g.name,
    title: g.title,
    descr: g.descr,
  };
  const click = g.hyperlink ? hlinkTagXml(g.hyperlink, "a:hlinkClick", ctx) : "";
  const hover = g.hoverLink ? hlinkTagXml(g.hoverLink, "a:hlinkHover", ctx) : "";
  const inner = click + hover;
  if (!inner) return `<p:cNvPr${attrs(a)}/>`;
  return `<p:cNvPr${attrs(a)}>${inner}</p:cNvPr>`;
}

/** tableMeta group → `<p:graphicFrame>` + `<a:tbl>`（from-scratch / 新增 shape）。 */
export function tableGroupToXml(g: Extract<Shape, { kind: "group" }>, ctx: ShapeCtx): string {
  const id = allocSpId(g, ctx);
  const tbl = tableTblXml(g, ctx);
  return `<p:graphicFrame>
    <p:nvGraphicFramePr>
      ${cNvPrXml(id, g, ctx)}
      <p:cNvGraphicFramePr>${graphicFrameLocksXml(g)}</p:cNvGraphicFramePr>
      ${nvPrXml(g, ctx)}
    </p:nvGraphicFramePr>
    <p:xfrm>
      <a:off x="${pxToEmu(g.bbox.x)}" y="${pxToEmu(g.bbox.y)}"/>
      <a:ext cx="${pxToEmu(Math.max(1, g.bbox.w))}" cy="${pxToEmu(Math.max(1, g.bbox.h))}"/>
    </p:xfrm>
    <a:graphic>
      <a:graphicData uri="${TABLE_URI}">
        ${tbl}
      </a:graphicData>
    </a:graphic>
  </p:graphicFrame>`;
}
