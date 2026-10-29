"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tableTblXml = tableTblXml;
exports.tableGroupToXml = tableGroupToXml;
const xml_util_1 = require("./xml-util");
const pptx_shapes_1 = require("./pptx-shapes");
const TABLE_URI = "http://schemas.openxmlformats.org/drawingml/2006/table";
function getCell(g, r, c) {
    const { cols } = g.tableMeta;
    const idx = r * cols + c;
    const s = g.children[idx];
    return s?.kind === "text" ? s : undefined;
}
function colWidths(g) {
    const { rows, cols } = g.tableMeta;
    const ws = [];
    for (let c = 0; c < cols; c++) {
        const cell = getCell(g, 0, c);
        ws.push(cell?.bbox.w ?? g.bbox.w / cols);
    }
    if (rows === 0)
        return ws;
    return ws;
}
function rowHeights(g) {
    const { rows, cols } = g.tableMeta;
    const hs = [];
    for (let r = 0; r < rows; r++) {
        const cell = getCell(g, r, 0);
        hs.push(cell?.bbox.h ?? g.bbox.h / rows);
    }
    return hs;
}
function hiddenMergeKind(g, r, c) {
    for (let cc = c - 1; cc >= 0; cc--) {
        const left = getCell(g, r, cc);
        if (!left || left.cellMeta?.hidden)
            continue;
        const span = left.cellMeta?.gridSpan ?? 1;
        if (cc + span > c)
            return "hMerge";
        break;
    }
    for (let rr = r - 1; rr >= 0; rr--) {
        const up = getCell(g, rr, c);
        if (!up || up.cellMeta?.hidden)
            continue;
        const span = up.cellMeta?.rowSpan ?? 1;
        if (rr + span > r)
            return "vMerge";
        return "vMerge";
    }
    return "hMerge";
}
function tcSideLn(tag, stroke) {
    if (!stroke)
        return "";
    const xml = (0, pptx_shapes_1.strokeToXml)(stroke, tag);
    return xml || "";
}
function tcPrXml(cell) {
    const anchor = cell.vAlign === "middle" ? "ctr" : cell.vAlign === "bottom" ? "b" : "t";
    const tcAttrs = {
        anchor,
        anchorCtr: cell.anchorCtr ? 1 : undefined,
        horzOverflow: cell.horzOverflow && cell.horzOverflow !== "overflow" ? cell.horzOverflow : undefined,
        vert: cell.vert && cell.vert !== "horz" ? cell.vert : undefined,
    };
    const lIns = (0, xml_util_1.pxToEmu)(cell.insets?.l ?? 7);
    const tIns = (0, xml_util_1.pxToEmu)(cell.insets?.t ?? 4);
    const rIns = (0, xml_util_1.pxToEmu)(cell.insets?.r ?? 7);
    const bIns = (0, xml_util_1.pxToEmu)(cell.insets?.b ?? 4);
    const fill = cell.fill ? (0, pptx_shapes_1.fillToXml)(cell.fill) : "";
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
    return `<a:tcPr${(0, xml_util_1.attrs)(tcAttrs)} marL="${lIns}" marR="${rIns}" marT="${tIns}" marB="${bIns}">${borders}${fill}</a:tcPr>`;
}
function cellToTcXml(g, r, c, ctx) {
    const cell = getCell(g, r, c);
    const meta = cell?.cellMeta;
    if (meta?.hidden) {
        const kind = hiddenMergeKind(g, r, c);
        return `<a:tc ${kind}="1"/>`;
    }
    if (!cell)
        return `<a:tc/>`;
    const tcAttrs = {};
    if ((meta?.gridSpan ?? 1) > 1)
        tcAttrs.gridSpan = meta.gridSpan;
    if ((meta?.rowSpan ?? 1) > 1)
        tcAttrs.rowSpan = meta.rowSpan;
    const txBody = (0, pptx_shapes_1.aTxBodyToXml)(cell.paragraphs, cell, ctx);
    // §21.1.3.16 CT_TableCell：txBody 在 tcPr 之前。
    return `<a:tc${(0, xml_util_1.attrs)(tcAttrs)}>${txBody}${tcPrXml(cell)}</a:tc>`;
}
/** 仅 `<a:tbl>…</a:tbl>` 片段（round-trip patch 用）。 */
function tableTblXml(g, ctx) {
    const { rows, cols } = g.tableMeta;
    const colWs = colWidths(g);
    const rowHs = rowHeights(g);
    const tblGrid = colWs.map((w) => `<a:gridCol w="${(0, xml_util_1.pxToEmu)(w)}"/>`).join("");
    const trs = [];
    for (let r = 0; r < rows; r++) {
        const tcs = [];
        for (let c = 0; c < cols; c++)
            tcs.push(cellToTcXml(g, r, c, ctx));
        trs.push(`<a:tr h="${(0, xml_util_1.pxToEmu)(rowHs[r] ?? 0)}">${tcs.join("")}</a:tr>`);
    }
    return `<a:tbl><a:tblPr${tblPrAttrs(g.tableMeta)}/><a:tblGrid>${tblGrid}</a:tblGrid>${trs.join("")}</a:tbl>`;
}
function tblPrAttrs(meta) {
    const flag = (key, fallback) => {
        const v = meta[key];
        if (v === true)
            return ` ${key}="1"`;
        if (v === false)
            return ` ${key}="0"`;
        if (fallback)
            return ` ${key}="1"`;
        return "";
    };
    const style = meta.styleId ? ` styleId="${(0, xml_util_1.esc)(meta.styleId)}"` : "";
    return `${flag("firstRow", true)}${flag("lastRow")}${flag("firstCol")}${flag("lastCol")}${flag("bandRow", true)}${flag("bandCol")}${style}`;
}
function cNvPrXml(id, g, ctx) {
    const a = {
        id,
        name: g.name,
        title: g.title,
        descr: g.descr,
    };
    const click = g.hyperlink ? (0, pptx_shapes_1.hlinkTagXml)(g.hyperlink, "a:hlinkClick", ctx) : "";
    const hover = g.hoverLink ? (0, pptx_shapes_1.hlinkTagXml)(g.hoverLink, "a:hlinkHover", ctx) : "";
    const inner = click + hover;
    if (!inner)
        return `<p:cNvPr${(0, xml_util_1.attrs)(a)}/>`;
    return `<p:cNvPr${(0, xml_util_1.attrs)(a)}>${inner}</p:cNvPr>`;
}
/** tableMeta group → `<p:graphicFrame>` + `<a:tbl>`（from-scratch / 新增 shape）。 */
function tableGroupToXml(g, ctx) {
    const id = (0, pptx_shapes_1.allocSpId)(g, ctx);
    const tbl = tableTblXml(g, ctx);
    return `<p:graphicFrame>
    <p:nvGraphicFramePr>
      ${cNvPrXml(id, g, ctx)}
      <p:cNvGraphicFramePr>${(0, pptx_shapes_1.graphicFrameLocksXml)(g)}</p:cNvGraphicFramePr>
      ${(0, pptx_shapes_1.nvPrXml)(g, ctx)}
    </p:nvGraphicFramePr>
    <p:xfrm>
      <a:off x="${(0, xml_util_1.pxToEmu)(g.bbox.x)}" y="${(0, xml_util_1.pxToEmu)(g.bbox.y)}"/>
      <a:ext cx="${(0, xml_util_1.pxToEmu)(Math.max(1, g.bbox.w))}" cy="${(0, xml_util_1.pxToEmu)(Math.max(1, g.bbox.h))}"/>
    </p:xfrm>
    <a:graphic>
      <a:graphicData uri="${TABLE_URI}">
        ${tbl}
      </a:graphicData>
    </a:graphic>
  </p:graphicFrame>`;
}
