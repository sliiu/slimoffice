"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseTable = parseTable;
const core_1 = require("@sliiu/present-core");
const xml_1 = require("./xml");
const units_1 = require("./units");
const fill_1 = require("./fill");
const text_1 = require("./text");
function parseTable(tbl, bbox, ctx) {
    const grid = (0, xml_1.findByLocalName)(tbl, "tblGrid");
    const gridCols = (0, xml_1.findAllByLocalName)(grid, "gridCol");
    const colWs = gridCols.map((g) => (0, units_1.emuToPx)((0, xml_1.attr)(g, "w")));
    const totalW = colWs.reduce((a, b) => a + b, 0) || bbox.w;
    const scaleX = bbox.w / totalW;
    const colWidths = colWs.map((w) => w * scaleX);
    const nCols = colWidths.length;
    const trs = (0, xml_1.findAllByLocalName)(tbl, "tr");
    const rowHs = trs.map((tr) => (0, units_1.emuToPx)((0, xml_1.attr)(tr, "h")));
    const totalH = rowHs.reduce((a, b) => a + b, 0) || bbox.h;
    const scaleY = totalH > 0 ? bbox.h / totalH : 1;
    const rowHeights = rowHs.map((h) => h * scaleY);
    const nRows = trs.length;
    const tblPr = (0, xml_1.findByLocalName)(tbl, "tblPr");
    const styleFlags = {
        firstRow: (0, units_1.boolish)((0, xml_1.attr)(tblPr, "firstRow")) === true,
        lastRow: (0, units_1.boolish)((0, xml_1.attr)(tblPr, "lastRow")) === true,
        firstCol: (0, units_1.boolish)((0, xml_1.attr)(tblPr, "firstCol")) === true,
        lastCol: (0, units_1.boolish)((0, xml_1.attr)(tblPr, "lastCol")) === true,
        bandRow: (0, units_1.boolish)((0, xml_1.attr)(tblPr, "bandRow")) === true,
        bandCol: (0, units_1.boolish)((0, xml_1.attr)(tblPr, "bandCol")) === true,
    };
    const styleId = (0, xml_1.attr)(tblPr, "styleId");
    const styleMap = ctx.tableStyleMap;
    const resolvedId = styleId ?? styleMap?.default;
    const styleEntry = resolvedId ? styleMap?.byId.get(resolvedId) : undefined;
    const slots = Array.from({ length: nRows }, () => Array(nCols).fill(undefined));
    let cursorY = bbox.y;
    for (let r = 0; r < nRows; r++) {
        const tcs = (0, xml_1.findAllByLocalName)(trs[r], "tc");
        let cursorX = bbox.x;
        let colIdx = 0;
        for (const tc of tcs) {
            if (colIdx >= nCols)
                break;
            const gridSpan = Math.max(1, Number((0, xml_1.attr)(tc, "gridSpan") ?? "1"));
            const rowSpan = Math.max(1, Number((0, xml_1.attr)(tc, "rowSpan") ?? "1"));
            const hMerge = (0, units_1.boolish)((0, xml_1.attr)(tc, "hMerge")) === true;
            const vMerge = (0, units_1.boolish)((0, xml_1.attr)(tc, "vMerge")) === true;
            let w = 0;
            for (let i = 0; i < gridSpan && colIdx + i < nCols; i++)
                w += colWidths[colIdx + i];
            let h = 0;
            for (let i = 0; i < rowSpan && r + i < nRows; i++)
                h += rowHeights[r + i];
            const hidden = hMerge || vMerge;
            const cellBbox = {
                x: cursorX,
                y: cursorY,
                w: hidden ? (colWidths[colIdx] ?? w) : w,
                h: hidden ? (rowHeights[r] ?? h) : h,
            };
            const meta = { rowIdx: r, colIdx, rowSpan, gridSpan, hMerge, vMerge };
            slots[r][colIdx] = makeTextCell(tc, meta, cellBbox, hidden, styleFlags, nRows, nCols, ctx, styleEntry);
            cursorX += hidden ? (colWidths[colIdx] ?? w) : w;
            colIdx += hidden ? 1 : gridSpan;
        }
        cursorY += rowHeights[r] ?? 0;
    }
    const children = [];
    let accY = bbox.y;
    for (let r = 0; r < nRows; r++) {
        let accX = bbox.x;
        for (let c = 0; c < nCols; c++) {
            const existing = slots[r][c];
            if (existing) {
                children.push(existing);
            }
            else {
                children.push(emptyHiddenCell(r, c, {
                    x: accX,
                    y: accY,
                    w: colWidths[c] ?? 0,
                    h: rowHeights[r] ?? 0,
                }));
            }
            accX += colWidths[c] ?? 0;
        }
        accY += rowHeights[r] ?? 0;
    }
    const meta = {
        rows: nRows,
        cols: nCols,
        firstRow: styleFlags.firstRow || undefined,
        lastRow: styleFlags.lastRow || undefined,
        firstCol: styleFlags.firstCol || undefined,
        lastCol: styleFlags.lastCol || undefined,
        bandRow: styleFlags.bandRow || undefined,
        bandCol: styleFlags.bandCol || undefined,
        styleId: styleId || undefined,
    };
    return { children, meta };
}
function emptyHiddenCell(r, c, bbox) {
    return {
        id: `tbl_${r}_${c}_text`,
        name: `Cell ${r},${c}`,
        zIndex: r * 100 + c,
        visible: true,
        locked: false,
        opacity: 1,
        kind: "text",
        bbox,
        transform: (0, core_1.identityTransform)(),
        paragraphs: [{ runs: [{ text: "" }] }],
        wrap: true,
        cellMeta: { hidden: true, gridSpan: 1, rowSpan: 1 },
    };
}
function makeTextCell(tc, meta, cellBbox, hidden, styleFlags, rowCount, colCount, ctx, styleEntry) {
    const tcPr = (0, xml_1.findByLocalName)(tc, "tcPr");
    const regions = styleEntry ? applicableRegions(meta, styleFlags, rowCount, colCount) : [];
    const explicit = readCellLines(tcPr, ctx);
    const styled = hidden || !styleEntry ? {} : readStyleBorders(styleEntry, regions, meta, rowCount, colCount);
    const lines = {
        left: explicit.left ?? styled.left,
        right: explicit.right ?? styled.right,
        top: explicit.top ?? styled.top,
        bottom: explicit.bottom ?? styled.bottom,
        tl2br: explicit.tl2br,
        bl2tr: explicit.bl2tr,
    };
    const fill = hidden ? undefined : readCellFill(tcPr, regions, ctx, styleEntry);
    const insets = readCellInsets(tcPr);
    const vAlign = ((0, xml_1.attr)(tcPr, "anchor") ?? "t");
    const cellAnchorCtr = (0, units_1.boolish)((0, xml_1.attr)(tcPr, "anchorCtr"));
    const cellHorzOverflow = (0, xml_1.attr)(tcPr, "horzOverflow");
    const cellVert = (0, xml_1.attr)(tcPr, "vert");
    const stroke = lines.left ?? lines.top ?? lines.right ?? lines.bottom;
    const borders = lines.left || lines.right || lines.top || lines.bottom || lines.tl2br || lines.bl2tr
        ? {
            l: lines.left,
            r: lines.right,
            t: lines.top,
            b: lines.bottom,
            tl2br: lines.tl2br,
            bl2tr: lines.bl2tr,
        }
        : undefined;
    let paragraphs = [{ runs: [{ text: "" }] }];
    let wrap;
    let autoFit;
    let bodyRot;
    let vert;
    let insetsOut = insets;
    const txBody = (0, xml_1.findByLocalName)(tc, "txBody");
    if (txBody && !hidden) {
        const parsed = (0, text_1.parseTxBody)(txBody, ctx);
        if (parsed.length > 0)
            paragraphs = parsed;
        const bodyPr = (0, text_1.parseBodyPr)((0, xml_1.findByLocalName)(txBody, "bodyPr"));
        wrap = bodyPr.wrap;
        autoFit = bodyPr.autoFit;
        bodyRot = bodyPr.bodyRot;
        vert = cellVert ?? bodyPr.vert;
        insetsOut = insets ?? bodyPr.insets;
    }
    if (!hidden && styleEntry) {
        const textColor = firstStyleProp(styleEntry, regions, "textColor");
        if (textColor)
            applyFallbackTextColor(paragraphs, textColor);
    }
    return {
        id: `tbl_${meta.rowIdx}_${meta.colIdx}_text`,
        name: `Cell ${meta.rowIdx},${meta.colIdx}`,
        zIndex: meta.rowIdx * 100 + meta.colIdx,
        visible: true,
        locked: false,
        opacity: 1,
        kind: "text",
        bbox: cellBbox,
        transform: (0, core_1.identityTransform)(),
        paragraphs,
        fill: fill ?? (hidden ? undefined : { kind: "solid", color: "#ffffff" }),
        stroke: stroke ?? (hidden || borders ? undefined : { paint: { kind: "solid", color: "#cccccc" }, width: 0.5 }),
        vAlign: vAlign === "ctr" ? "middle" : vAlign === "b" ? "bottom" : "top",
        wrap: wrap ?? true,
        insets: insetsOut,
        autoFit,
        bodyRot,
        vert: (vert ?? cellVert),
        anchorCtr: cellAnchorCtr,
        horzOverflow: cellHorzOverflow,
        cellMeta: {
            gridSpan: meta.gridSpan,
            rowSpan: meta.rowSpan,
            hidden: hidden || undefined,
            borders,
        },
    };
}
function readCellInsets(tcPr) {
    if (!tcPr)
        return undefined;
    const lIns = (0, xml_1.attr)(tcPr, "marL");
    const tIns = (0, xml_1.attr)(tcPr, "marT");
    const rIns = (0, xml_1.attr)(tcPr, "marR");
    const bIns = (0, xml_1.attr)(tcPr, "marB");
    if (lIns === undefined && tIns === undefined && rIns === undefined && bIns === undefined) {
        return undefined;
    }
    return {
        l: (0, units_1.emuToPx)(lIns ?? "91440"),
        t: (0, units_1.emuToPx)(tIns ?? "45720"),
        r: (0, units_1.emuToPx)(rIns ?? "91440"),
        b: (0, units_1.emuToPx)(bIns ?? "45720"),
    };
}
function readCellLines(tcPr, ctx) {
    if (!tcPr)
        return {};
    return {
        left: readSideLine((0, xml_1.findByLocalName)(tcPr, "lnL"), ctx),
        right: readSideLine((0, xml_1.findByLocalName)(tcPr, "lnR"), ctx),
        top: readSideLine((0, xml_1.findByLocalName)(tcPr, "lnT"), ctx),
        bottom: readSideLine((0, xml_1.findByLocalName)(tcPr, "lnB"), ctx),
        tl2br: readSideLine((0, xml_1.findByLocalName)(tcPr, "lnTlToBr"), ctx),
        bl2tr: readSideLine((0, xml_1.findByLocalName)(tcPr, "lnBlToTr"), ctx),
    };
}
function readSideLine(ln, ctx) {
    if (!ln)
        return undefined;
    // <a:lnL>/<a:lnR>/<a:lnT>/<a:lnB> have the same content model as <a:ln> per
    // ECMA-376 §20.1.4.2.16-19, so wrap into a fake `spPr` for parseStroke.
    const host = { ln };
    Object.defineProperty(host, "$children", {
        value: [{ tag: "ln", node: ln }],
        enumerable: false,
        configurable: true,
    });
    return (0, fill_1.parseStroke)(host, ctx);
}
function readCellFill(tcPr, regions, ctx, styleEntry) {
    // Explicit per-cell fill always wins.
    if (tcPr) {
        const fill = (0, fill_1.parseFill)(tcPr, ctx);
        if (fill && fill.kind !== "none")
            return fill;
    }
    if (!styleEntry)
        return undefined;
    return firstStyleProp(styleEntry, regions, "fill");
}
function applyFallbackTextColor(paragraphs, color) {
    for (const p of paragraphs) {
        for (const r of p.runs) {
            if (!r.color)
                r.color = color;
        }
    }
}
/**
 * Style-region precedence per ECMA-376 §20.1.4.2:
 * corner > header/footer > banding > wholeTbl.
 */
function applicableRegions(meta, flags, rowCount, colCount) {
    const { rowIdx, colIdx } = meta;
    const isFirstRow = flags.firstRow && rowIdx === 0;
    const isLastRow = flags.lastRow && rowIdx === rowCount - 1;
    const isFirstCol = flags.firstCol && colIdx === 0;
    const isLastCol = flags.lastCol && colIdx === colCount - 1;
    const out = [];
    if (isFirstRow && isFirstCol)
        out.push("nwCell");
    if (isFirstRow && isLastCol)
        out.push("neCell");
    if (isLastRow && isFirstCol)
        out.push("swCell");
    if (isLastRow && isLastCol)
        out.push("seCell");
    if (isFirstRow)
        out.push("firstRow");
    if (isLastRow)
        out.push("lastRow");
    if (isFirstCol)
        out.push("firstCol");
    if (isLastCol)
        out.push("lastCol");
    // Header/first-col cells are excluded from the banding index (bandIdx < 0).
    if (flags.bandRow) {
        const bandIdx = rowIdx - (flags.firstRow ? 1 : 0);
        if (bandIdx >= 0)
            out.push(bandIdx % 2 === 0 ? "band1H" : "band2H");
    }
    if (flags.bandCol) {
        const bandIdx = colIdx - (flags.firstCol ? 1 : 0);
        if (bandIdx >= 0)
            out.push(bandIdx % 2 === 0 ? "band1V" : "band2V");
    }
    out.push("wholeTbl");
    return out;
}
function firstStyleProp(styleEntry, regions, key) {
    for (const region of regions) {
        const v = styleEntry.parts[region]?.[key];
        if (v !== undefined)
            return v;
    }
    return undefined;
}
function readStyleBorders(styleEntry, regions, meta, rowCount, colCount) {
    const out = {};
    for (const side of ["left", "right", "top", "bottom"]) {
        for (const region of regions) {
            const border = styleEntry.parts[region]?.border;
            if (!border)
                continue;
            const outer = regionSideIsOuter(region, side, meta.rowIdx, meta.colIdx, rowCount, colCount);
            const stroke = strokeForRegionSide(border, side, outer);
            if (stroke) {
                out[side] = stroke;
                break;
            }
        }
    }
    return out;
}
function regionSideIsOuter(region, side, rowIdx, colIdx, rowCount, colCount) {
    switch (region) {
        case "wholeTbl":
            return ((side === "left" && colIdx === 0) ||
                (side === "right" && colIdx === colCount - 1) ||
                (side === "top" && rowIdx === 0) ||
                (side === "bottom" && rowIdx === rowCount - 1));
        case "firstRow":
        case "lastRow":
        case "band1H":
        case "band2H":
            return (side === "top" ||
                side === "bottom" ||
                (side === "left" && colIdx === 0) ||
                (side === "right" && colIdx === colCount - 1));
        case "firstCol":
        case "lastCol":
        case "band1V":
        case "band2V":
            return (side === "left" ||
                side === "right" ||
                (side === "top" && rowIdx === 0) ||
                (side === "bottom" && rowIdx === rowCount - 1));
        case "nwCell":
        case "neCell":
        case "swCell":
        case "seCell":
            return true;
    }
}
function strokeForRegionSide(border, side, outer) {
    if (outer)
        return border[side];
    return side === "left" || side === "right" ? border.insideV : border.insideH;
}
