import type { SheetChart, SheetShape, SheetSparkline, SheetTable, Worksheet } from "@sliiu/sheet-core";

/** Minimal chart/table/shape fragments written beside sheetData. */
export function drawingFragments(sheet: Worksheet, sheetIndex: number): {
  sheetExtras: string;
  parts: Map<string, string>;
  contentTypes: string[];
  rels: string[];
} {
  const parts = new Map<string, string>();
  const contentTypes: string[] = [];
  const rels: string[] = [];
  const extras: string[] = [];
  const drawings: string[] = [];

  (sheet.tables ?? []).forEach((table, index) => {
    const path = `xl/tables/table${sheetIndex + 1}_${index + 1}.xml`;
    parts.set(path, tableXml(table));
    contentTypes.push(`<Override PartName="/${path}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml"/>`);
    const rid = `rIdT${index + 1}`;
    rels.push(`<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/table" Target="../tables/table${sheetIndex + 1}_${index + 1}.xml"/>`);
    extras.push(`<tableParts count="1"><tablePart r:id="${rid}"/></tableParts>`);
  });

  (sheet.charts ?? []).forEach((chart, index) => {
    drawings.push(chartAnchor(chart, index));
  });
  (sheet.sparklines ?? []).forEach((spark) => {
    extras.push(sparklineXml(spark));
  });
  (sheet.shapes ?? []).forEach((shape, index) => {
    drawings.push(shapeAnchor(shape, index));
  });

  if (drawings.length) {
    const drawingPath = `xl/drawings/drawing${sheetIndex + 1}.xml`;
    parts.set(drawingPath, drawingXml(drawings));
    contentTypes.push(`<Override PartName="/${drawingPath}" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`);
    const rid = "rIdDrawing1";
    rels.push(`<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing${sheetIndex + 1}.xml"/>`);
    extras.push(`<drawing r:id="${rid}"/>`);
  }

  if (sheet.validations?.length) extras.push(dataValidationsXml(sheet));
  if (sheet.pageBreaks?.rows?.length || sheet.pageBreaks?.cols?.length) extras.push(pageBreaksXml(sheet));

  return { sheetExtras: extras.join(""), parts, contentTypes, rels };
}

function tableXml(table: SheetTable): string {
  const ref = `${colName(table.c1)}${table.r1 + 1}:${colName(table.c2)}${table.r2 + 1}`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<table xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" id="1" name="${escapeXml(table.name)}" displayName="${escapeXml(table.name)}" ref="${ref}" ${table.headerRow ? 'headerRowCount="1"' : ""}><autoFilter ref="${ref}"/><tableStyleInfo name="${escapeXml(table.style ?? "TableStyleMedium2")}" showFirstColumn="0" showLastColumn="0" showRowStripes="1" showColumnStripes="0"/></table>`;
}

function sparklineXml(spark: SheetSparkline): string {
  return `<extLst><ext uri="{05C60535-1F16-4fd2-B107-1C6BDA2B7F3E}" xmlns:x14="http://schemas.microsoft.com/office/spreadsheetml/2009/9/main"><x14:sparklineGroups xmlns:xm="http://schemas.microsoft.com/office/excel/2006/main"><x14:sparklineGroup type="${spark.kind === "column" ? "column" : spark.kind === "winLoss" ? "stacked" : "line"}"><x14:sparklines><x14:sparkline><xm:f>${escapeXml(spark.data)}</xm:f><xm:sqref>${escapeXml(spark.location)}</xm:sqref></x14:sparkline></x14:sparklines></x14:sparklineGroup></x14:sparklineGroups></ext></extLst>`;
}

function chartAnchor(chart: SheetChart, index: number): string {
  return `<xdr:twoCellAnchor><xdr:from><xdr:col>0</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${index * 12}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>6</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${index * 12 + 10}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:graphicFrame><xdr:nvGraphicFramePr><xdr:cNvPr id="${index + 1}" name="${escapeXml(chart.title ?? chart.id)}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rIdChart${index + 1}"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor><!-- range ${escapeXml(chart.range)} kind ${chart.kind} -->`;
}

function shapeAnchor(shape: SheetShape, index: number): string {
  const cx = Math.round(shape.w * 9525);
  const cy = Math.round(shape.h * 9525);
  return `<xdr:oneCellAnchor><xdr:from><xdr:col>0</xdr:col><xdr:colOff>${Math.round(shape.x * 9525)}</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>${Math.round(shape.y * 9525)}</xdr:rowOff></xdr:from><xdr:ext cx="${cx}" cy="${cy}"/><xdr:sp><xdr:nvSpPr><xdr:cNvPr id="${100 + index}" name="${escapeXml(shape.id)}"/><xdr:cNvSpPr/></xdr:nvSpPr><xdr:spPr><a:prstGeom prst="${shape.kind === "ellipse" ? "ellipse" : shape.kind === "line" || shape.kind === "arrow" ? "line" : "rect"}"><a:avLst/></a:prstGeom></xdr:spPr>${shape.text ? `<xdr:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>${escapeXml(shape.text)}</a:t></a:r></a:p></xdr:txBody>` : ""}</xdr:sp><xdr:clientData/></xdr:oneCellAnchor>`;
}

function drawingXml(anchors: string[]): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">${anchors.join("")}</xdr:wsDr>`;
}

function dataValidationsXml(sheet: Worksheet): string {
  const items = sheet.validations ?? [];
  if (!items.length) return "";
  const body = items
    .map((item) => {
      const sqref = `${colName(item.c1)}${item.r1 + 1}:${colName(item.c2)}${item.r2 + 1}`;
      return `<dataValidation type="${item.type}" allowBlank="${item.allowBlank === false ? 0 : 1}" sqref="${sqref}">${item.formula1 ? `<formula1>${escapeXml(item.formula1)}</formula1>` : ""}${item.formula2 ? `<formula2>${escapeXml(item.formula2)}</formula2>` : ""}</dataValidation>`;
    })
    .join("");
  return `<dataValidations count="${items.length}">${body}</dataValidations>`;
}

function pageBreaksXml(sheet: Worksheet): string {
  const rows = (sheet.pageBreaks?.rows ?? []).map((row) => `<brk id="${row}" max="16383" man="1"/>`).join("");
  const cols = (sheet.pageBreaks?.cols ?? []).map((col) => `<brk id="${col}" max="1048575" man="1"/>`).join("");
  return `${rows ? `<rowBreaks count="${sheet.pageBreaks!.rows!.length}" manualBreakCount="${sheet.pageBreaks!.rows!.length}">${rows}</rowBreaks>` : ""}${cols ? `<colBreaks count="${sheet.pageBreaks!.cols!.length}" manualBreakCount="${sheet.pageBreaks!.cols!.length}">${cols}</colBreaks>` : ""}`;
}

function colName(index: number): string {
  let name = "";
  let next = index + 1;
  while (next > 0) {
    next -= 1;
    name = String.fromCharCode(65 + (next % 26)) + name;
    next = Math.floor(next / 26);
  }
  return name;
}

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
