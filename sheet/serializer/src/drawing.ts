import type { SheetChart, SheetConsolidation, SheetPivot, SheetShape, SheetTable, Worksheet } from "@sliiu/sheet-core";

/** Minimal chart/table/shape fragments written beside sheetData. */
export function drawingFragments(sheet: Worksheet, sheetIndex: number, dxfForFormat?: (format: string) => number): {
  sheetExtras: string;
  parts: Map<string, string>;
  contentTypes: string[];
  rels: string[];
  workbookRels: string[];
  pivotCacheRefs: string[];
} {
  const parts = new Map<string, string>();
  const contentTypes: string[] = [];
  const rels: string[] = [];
  const workbookRels: string[] = [];
  const pivotCacheRefs: string[] = [];
  const extras: string[] = [];
  const drawings: string[] = [];

  (sheet.tables ?? []).forEach((table, index) => {
    const path = `xl/tables/table${sheetIndex + 1}_${index + 1}.xml`;
    parts.set(path, tableXml(table, dxfForFormat));
    contentTypes.push(`<Override PartName="/${path}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml"/>`);
    const rid = `rIdT${index + 1}`;
    rels.push(`<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/table" Target="../tables/table${sheetIndex + 1}_${index + 1}.xml"/>`);
    extras.push(`<tableParts count="1"><tablePart r:id="${rid}"/></tableParts>`);
  });

  (sheet.charts ?? []).forEach((chart, index) => {
    drawings.push(chartAnchor(chart, index));
  });
  // 迷你图是 x14 扩展，不在 ECMA-376 里，不写。
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

  const notes = commentList(sheet);
  if (notes.length) {
    const path = `xl/comments${sheetIndex + 1}.xml`;
    parts.set(path, commentsXml(notes));
    contentTypes.push(`<Override PartName="/${path}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.comments+xml"/>`);
    rels.push(`<Relationship Id="rIdComment1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" Target="../comments${sheetIndex + 1}.xml"/>`);
  }

  if (sheet.validations?.length) extras.push(dataValidationsXml(sheet));
  if (sheet.pageBreaks?.rows?.length || sheet.pageBreaks?.cols?.length) extras.push(pageBreaksXml(sheet));

  (sheet.pivots ?? []).forEach((pivot, index) => {
    const id = sheetIndex * 100 + index + 1;
    const tablePath = `xl/pivotTables/pivotTable${id}.xml`;
    const cachePath = `xl/pivotCache/pivotCacheDefinition${id}.xml`;
    const recordsPath = `xl/pivotCache/pivotCacheRecords${id}.xml`;
    parts.set(tablePath, pivotTableXml(pivot, id));
    parts.set(cachePath, pivotCacheXml(pivot));
    parts.set(recordsPath, pivotRecordsXml(pivot));
    parts.set(
      `xl/pivotCache/_rels/pivotCacheDefinition${id}.xml.rels`,
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdRecords" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/pivotCacheRecords" Target="pivotCacheRecords${id}.xml"/></Relationships>`,
    );
    contentTypes.push(`<Override PartName="/${tablePath}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.pivotTable+xml"/>`);
    contentTypes.push(`<Override PartName="/${cachePath}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.pivotCacheDefinition+xml"/>`);
    contentTypes.push(`<Override PartName="/${recordsPath}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.pivotCacheRecords+xml"/>`);
    rels.push(`<Relationship Id="rIdPivot${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/pivotTable" Target="../pivotTables/pivotTable${id}.xml"/>`);
    workbookRels.push(`<Relationship Id="rIdPivotCache${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/pivotCacheDefinition" Target="pivotCache/pivotCacheDefinition${id}.xml"/>`);
    pivotCacheRefs.push(`<pivotCache cacheId="${id}" r:id="rIdPivotCache${id}"/>`);
  });

  // 表单控件属性是 x14 扩展，不在 ECMA-376 里，不写。

  if (sheet.consolidation) {
    const path = `xl/consolidation/consolidation${sheetIndex + 1}.xml`;
    parts.set(path, consolidationXml(sheet.consolidation));
    contentTypes.push(`<Override PartName="/${path}" ContentType="application/xml"/>`);
    rels.push(`<Relationship Id="rIdConsolidation1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/consolidation" Target="../consolidation/consolidation${sheetIndex + 1}.xml"/>`);
  }

  if (sheet.xmlMaps?.length) {
    const path = `xl/xmlMaps/xmlMap${sheetIndex + 1}.xml`;
    parts.set(path, xmlMapsXml(sheet));
    contentTypes.push(`<Override PartName="/${path}" ContentType="application/xml"/>`);
  }

  // 切片器是 x14 扩展，不在 ECMA-376 里，不写。

  return { sheetExtras: extras.join(""), parts, contentTypes, rels, workbookRels, pivotCacheRefs };
}

function tableXml(table: SheetTable, dxfForFormat?: (format: string) => number): string {
  const ref = `${colName(table.c1)}${table.r1 + 1}:${colName(table.c2)}${table.r2 + 1}`;
  const columns = table.columns ?? [];
  const cols = columns.length
    ? `<tableColumns count="${columns.length}">${columns.map((name, index) => {
        const formula = table.formulas?.[index];
        const fn = table.totals?.[index];
        const totalsFn = fn && fn !== "sum" ? ` totalsRowFunction="${fn === "average" ? "average" : fn === "count" ? "count" : fn === "max" ? "max" : fn === "min" ? "min" : "none"}"` : "";
        const totalsFormula = table.totalsFormulas?.[index];
        const width = table.widths?.[index];
        const widthAttr = width && width > 0 ? ` width="${width}"` : "";
        const hiddenAttr = table.hidden?.[index] ? ` hidden="1"` : "";
        const format = table.formats?.[index];
        const dxfAttr = format && dxfForFormat ? ` dataDxfId="${dxfForFormat(format)}"` : "";
        const body = `${formula ? `<calculatedColumnFormula>${escapeXml(formula)}</calculatedColumnFormula>` : ""}${totalsFormula ? `<totalsRowFormula>${escapeXml(totalsFormula)}</totalsRowFormula>` : ""}`;
        return `<tableColumn id="${index + 1}" name="${escapeXml(name)}"${widthAttr}${hiddenAttr}${dxfAttr}${totalsFn}>${body}</tableColumn>`;
      }).join("")}</tableColumns>`
    : "";
  // A table without filter buttons writes no autoFilter. The default keeps them, and a column keeps the values it still shows.
  const ops: Record<string, string> = { eq: "equal", ne: "notEqual", gt: "greaterThan", gte: "greaterThanOrEqual", lt: "lessThan", lte: "lessThanOrEqual" };
  const groups = new Map<number, { op: "eq" | "ne" | "gt" | "gte" | "lt" | "lte"; value: string; and?: boolean }[]>();
  for (const rule of table.filterRules ?? []) {
    const list = groups.get(rule.col);
    if (list) list.push(rule);
    else groups.set(rule.col, [rule]);
  }
  // A column ranks its numbers, or lists values, or compares. Ranking wins when a column does more than one.
  const ranked = new Set((table.filterTop ?? []).map((item) => item.col));
  const top = (table.filterTop ?? [])
    .map((item) => `<filterColumn colId="${item.col}"><top10${item.bottom ? " top=\"0\"" : ""}${item.percent ? " percent=\"1\"" : ""} val="${item.count}"/></filterColumn>`)
    .join("");
  const compared = [...groups.entries()].flatMap(([col, rules]) => {
    if (ranked.has(col)) return [];
    const and = rules.some((rule) => rule.and) ? " and=\"1\"" : "";
    const body = rules.map((rule) => `<customFilter operator="${ops[rule.op] ?? "equal"}" val="${escapeXml(rule.value)}"/>`).join("");
    return [`<filterColumn colId="${col}"><customFilters${and}>${body}</customFilters></filterColumn>`];
  }).join("");
  const kept = (table.filterColumns ?? [])
    .filter((column) => !ranked.has(column.col))
    .map((column) => `<filterColumn colId="${column.col}"><filters>${column.values.map((value) => `<filter val="${escapeXml(value)}"/>`).join("")}</filters></filterColumn>`)
    .join("");
  const filter = table.filter === false ? "" : `<autoFilter ref="${ref}">${kept}${compared}${top}</autoFilter>`;
  // The sort covers the data rows only, so the header and the totals row stay out of it.
  const dataTop = (table.headerRow === false ? table.r1 : table.r1 + 1) + 1;
  const dataBottom = (table.totalsRow ? table.r2 - 1 : table.r2) + 1;
  const sort = (table.sort ?? [])
    .filter((key) => key.col >= 0 && key.col < table.c2 - table.c1 + 1)
    .map((key) => {
      const column = colName(table.c1 + key.col);
      return `<sortCondition ${key.descending ? 'descending="1" ' : ""}ref="${column}${dataTop}:${column}${dataBottom}"/>`;
    })
    .join("");
  const sortState = sort ? `<sortState ref="${colName(table.c1)}${dataTop}:${colName(table.c2)}${dataBottom}">${sort}</sortState>` : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<table xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" id="1" name="${escapeXml(table.name)}" displayName="${escapeXml(table.name)}" ref="${ref}" ${table.headerRow === false ? 'headerRowCount="0"' : 'headerRowCount="1"'}${table.totalsRow ? ' totalsRowCount="1"' : ""}>${cols}${filter}${sortState}<tableStyleInfo name="${escapeXml(table.style ?? "TableStyleMedium2")}" showFirstColumn="${table.firstColumn ? "1" : "0"}" showLastColumn="${table.lastColumn ? "1" : "0"}" showRowStripes="${table.rowStripes === false ? "0" : "1"}" showColumnStripes="${table.colStripes ? "1" : "0"}"/></table>`;
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
      const op = item.op
        ? ` operator="${item.op === "gt" ? "greaterThan" : item.op === "gte" ? "greaterThanOrEqual" : item.op === "lt" ? "lessThan" : item.op === "lte" ? "lessThanOrEqual" : item.op === "neq" ? "notEqual" : item.op === "between" ? "between" : "equal"}"`
        : "";
      return `<dataValidation type="${item.type}" allowBlank="${item.allowBlank === false ? 0 : 1}"${op} sqref="${sqref}">${item.formula1 ? `<formula1>${escapeXml(item.formula1)}</formula1>` : ""}${item.formula2 ? `<formula2>${escapeXml(item.formula2)}</formula2>` : ""}</dataValidation>`;
    })
    .join("");
  return `<dataValidations count="${items.length}">${body}</dataValidations>`;
}

function commentList(sheet: Worksheet): { ref: string; text: string }[] {
  const notes: { ref: string; text: string }[] = [];
  sheet.cells.forEach((row, rowIndex) => {
    row?.forEach((cell, column) => {
      if (cell?.comment) notes.push({ ref: `${colName(column)}${rowIndex + 1}`, text: cell.comment });
    });
  });
  return notes;
}

function commentsXml(notes: { ref: string; text: string }[]): string {
  const body = notes
    .map((note) => `<comment ref="${note.ref}" authorId="0"><text><r><t>${escapeXml(note.text)}</t></r></text></comment>`)
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<comments xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><authors><author/></authors><commentList>${body}</commentList></comments>`;
}

function consolidationXml(consolidation: SheetConsolidation): string {
  const sources = consolidation.sources.map((source) => `<source ref="${escapeXml(source)}"/>`).join("");
  const flags = [
    consolidation.topRow ? ' topRow="1"' : "",
    consolidation.leftCol ? ' leftCol="1"' : "",
    consolidation.links ? ' links="1"' : "",
  ].join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<consolidation func="${consolidation.func}" dest="${escapeXml(consolidation.dest)}"${flags}>${sources}</consolidation>`;
}

function xmlMapsXml(sheet: Worksheet): string {
  const body = (sheet.xmlMaps ?? [])
    .map((map) => `<Map ID="${escapeXml(map.id)}" Name="${escapeXml(map.name)}"${map.root ? ` RootElement="${escapeXml(map.root)}"` : ""}/>`)
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<MapInfo xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${body}</MapInfo>`;
}

function pivotTableXml(pivot: SheetPivot, cacheId: number): string {
  const fields = pivot.fields ?? [...new Set([...(pivot.rows ?? []), ...(pivot.columns ?? []), ...(pivot.values ?? [])])];
  const fieldIndex = (name: string): number => Math.max(0, fields.indexOf(name));
  const list = (names: string[] | undefined): string => (names ?? []).map((name) => `<field x="${fieldIndex(name)}"/>`).join("");
  const rows = list(pivot.rows);
  const cols = list(pivot.columns);
  const subtotal = pivot.agg && pivot.agg !== "sum" ? ` subtotal="${pivot.agg}"` : "";
  const values = (pivot.values ?? []).map((name) => `<dataField fld="${fieldIndex(name)}"${subtotal}/>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<pivotTableDefinition xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" name="${escapeXml(pivot.name)}" cacheId="${cacheId}"><pivotFields count="${fields.length}">${fields.map(() => "<pivotField/>").join("")}</pivotFields>${rows ? `<rowFields count="${pivot.rows!.length}">${rows}</rowFields>` : ""}${cols ? `<colFields count="${pivot.columns!.length}">${cols}</colFields>` : ""}${values ? `<dataFields count="${pivot.values!.length}">${values}</dataFields>` : ""}</pivotTableDefinition>`;
}

function pivotCacheXml(pivot: SheetPivot): string {
  const fields = pivot.fields ?? [];
  const body = fields.map((field) => `<cacheField name="${escapeXml(field)}"/>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<pivotCacheDefinition xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cacheSource type="worksheet"><worksheetSource ref="${escapeXml(pivot.source)}"/></cacheSource><cacheFields count="${fields.length}">${body}</cacheFields></pivotCacheDefinition>`;
}

function pivotRecordsXml(pivot: SheetPivot): string {
  const rows = (pivot.cache ?? []).map((row) => `<r>${row.map((value) => (/^-?\d+(?:\.\d+)?$/.test(value) ? `<n v="${value}"/>` : `<s v="${escapeXml(value)}"/>`)).join("")}</r>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<pivotCacheRecords xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${pivot.cache?.length ?? 0}">${rows}</pivotCacheRecords>`;
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
