"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.drawingFragments = drawingFragments;
/** Minimal chart/table/shape fragments written beside sheetData. */
function drawingFragments(sheet, sheetIndex) {
    const parts = new Map();
    const contentTypes = [];
    const rels = [];
    const workbookRels = [];
    const pivotCacheRefs = [];
    const extras = [];
    const drawings = [];
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
    const notes = commentList(sheet);
    if (notes.length) {
        const path = `xl/comments${sheetIndex + 1}.xml`;
        parts.set(path, commentsXml(notes));
        contentTypes.push(`<Override PartName="/${path}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.comments+xml"/>`);
        rels.push(`<Relationship Id="rIdComment1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" Target="../comments${sheetIndex + 1}.xml"/>`);
    }
    if (sheet.validations?.length)
        extras.push(dataValidationsXml(sheet));
    if (sheet.pageBreaks?.rows?.length || sheet.pageBreaks?.cols?.length)
        extras.push(pageBreaksXml(sheet));
    (sheet.pivots ?? []).forEach((pivot, index) => {
        const id = sheetIndex * 100 + index + 1;
        const tablePath = `xl/pivotTables/pivotTable${id}.xml`;
        const cachePath = `xl/pivotCache/pivotCacheDefinition${id}.xml`;
        const recordsPath = `xl/pivotCache/pivotCacheRecords${id}.xml`;
        parts.set(tablePath, pivotTableXml(pivot, id));
        parts.set(cachePath, pivotCacheXml(pivot));
        parts.set(recordsPath, pivotRecordsXml(pivot));
        parts.set(`xl/pivotCache/_rels/pivotCacheDefinition${id}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdRecords" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/pivotCacheRecords" Target="pivotCacheRecords${id}.xml"/></Relationships>`);
        contentTypes.push(`<Override PartName="/${tablePath}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.pivotTable+xml"/>`);
        contentTypes.push(`<Override PartName="/${cachePath}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.pivotCacheDefinition+xml"/>`);
        contentTypes.push(`<Override PartName="/${recordsPath}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.pivotCacheRecords+xml"/>`);
        rels.push(`<Relationship Id="rIdPivot${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/pivotTable" Target="../pivotTables/pivotTable${id}.xml"/>`);
        workbookRels.push(`<Relationship Id="rIdPivotCache${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/pivotCacheDefinition" Target="pivotCache/pivotCacheDefinition${id}.xml"/>`);
        pivotCacheRefs.push(`<pivotCache cacheId="${id}" r:id="rIdPivotCache${id}"/>`);
    });
    if (sheet.formControls?.length) {
        const path = `xl/ctrlProps/ctrlProp${sheetIndex + 1}.xml`;
        parts.set(path, formControlsXml(sheet));
        contentTypes.push(`<Override PartName="/${path}" ContentType="application/vnd.ms-excel.controlproperties+xml"/>`);
    }
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
    if (sheet.slicers?.length) {
        const slicerPath = `xl/slicers/slicer${sheetIndex + 1}.xml`;
        parts.set(slicerPath, slicersXml(sheet));
        parts.set(`xl/slicers/_rels/slicer${sheetIndex + 1}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheet.slicers.map((_item, at) => `<Relationship Id="rIdCache${at + 1}" Type="http://schemas.microsoft.com/office/2007/relationships/slicerCache" Target="../slicerCaches/slicerCache${sheetIndex + 1}_${at + 1}.xml"/>`).join("")}</Relationships>`);
        contentTypes.push(`<Override PartName="/${slicerPath}" ContentType="application/vnd.ms-excel.slicer+xml"/>`);
        sheet.slicers.forEach((slicer, index) => {
            const cachePath = `xl/slicerCaches/slicerCache${sheetIndex + 1}_${index + 1}.xml`;
            parts.set(cachePath, slicerCacheXml(slicer, index));
            contentTypes.push(`<Override PartName="/${cachePath}" ContentType="application/vnd.ms-excel.slicerCache+xml"/>`);
        });
        rels.push(`<Relationship Id="rIdSlicer1" Type="http://schemas.microsoft.com/office/2007/relationships/slicer" Target="../slicers/slicer${sheetIndex + 1}.xml"/>`);
    }
    return { sheetExtras: extras.join(""), parts, contentTypes, rels, workbookRels, pivotCacheRefs };
}
function tableXml(table) {
    const ref = `${colName(table.c1)}${table.r1 + 1}:${colName(table.c2)}${table.r2 + 1}`;
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<table xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" id="1" name="${escapeXml(table.name)}" displayName="${escapeXml(table.name)}" ref="${ref}" ${table.headerRow ? 'headerRowCount="1"' : ""}><autoFilter ref="${ref}"/><tableStyleInfo name="${escapeXml(table.style ?? "TableStyleMedium2")}" showFirstColumn="0" showLastColumn="0" showRowStripes="1" showColumnStripes="0"/></table>`;
}
function sparklineXml(spark) {
    return `<extLst><ext uri="{05C60535-1F16-4fd2-B107-1C6BDA2B7F3E}" xmlns:x14="http://schemas.microsoft.com/office/spreadsheetml/2009/9/main"><x14:sparklineGroups xmlns:xm="http://schemas.microsoft.com/office/excel/2006/main"><x14:sparklineGroup type="${spark.kind === "column" ? "column" : spark.kind === "winLoss" ? "stacked" : "line"}"><x14:sparklines><x14:sparkline><xm:f>${escapeXml(spark.data)}</xm:f><xm:sqref>${escapeXml(spark.location)}</xm:sqref></x14:sparkline></x14:sparklines></x14:sparklineGroup></x14:sparklineGroups></ext></extLst>`;
}
function chartAnchor(chart, index) {
    return `<xdr:twoCellAnchor><xdr:from><xdr:col>0</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${index * 12}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>6</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${index * 12 + 10}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:graphicFrame><xdr:nvGraphicFramePr><xdr:cNvPr id="${index + 1}" name="${escapeXml(chart.title ?? chart.id)}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rIdChart${index + 1}"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor><!-- range ${escapeXml(chart.range)} kind ${chart.kind} -->`;
}
function shapeAnchor(shape, index) {
    const cx = Math.round(shape.w * 9525);
    const cy = Math.round(shape.h * 9525);
    return `<xdr:oneCellAnchor><xdr:from><xdr:col>0</xdr:col><xdr:colOff>${Math.round(shape.x * 9525)}</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>${Math.round(shape.y * 9525)}</xdr:rowOff></xdr:from><xdr:ext cx="${cx}" cy="${cy}"/><xdr:sp><xdr:nvSpPr><xdr:cNvPr id="${100 + index}" name="${escapeXml(shape.id)}"/><xdr:cNvSpPr/></xdr:nvSpPr><xdr:spPr><a:prstGeom prst="${shape.kind === "ellipse" ? "ellipse" : shape.kind === "line" || shape.kind === "arrow" ? "line" : "rect"}"><a:avLst/></a:prstGeom></xdr:spPr>${shape.text ? `<xdr:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>${escapeXml(shape.text)}</a:t></a:r></a:p></xdr:txBody>` : ""}</xdr:sp><xdr:clientData/></xdr:oneCellAnchor>`;
}
function drawingXml(anchors) {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">${anchors.join("")}</xdr:wsDr>`;
}
function dataValidationsXml(sheet) {
    const items = sheet.validations ?? [];
    if (!items.length)
        return "";
    const body = items
        .map((item) => {
        const sqref = `${colName(item.c1)}${item.r1 + 1}:${colName(item.c2)}${item.r2 + 1}`;
        return `<dataValidation type="${item.type}" allowBlank="${item.allowBlank === false ? 0 : 1}" sqref="${sqref}">${item.formula1 ? `<formula1>${escapeXml(item.formula1)}</formula1>` : ""}${item.formula2 ? `<formula2>${escapeXml(item.formula2)}</formula2>` : ""}</dataValidation>`;
    })
        .join("");
    return `<dataValidations count="${items.length}">${body}</dataValidations>`;
}
function commentList(sheet) {
    const notes = [];
    sheet.cells.forEach((row, rowIndex) => {
        row?.forEach((cell, column) => {
            if (cell?.comment)
                notes.push({ ref: `${colName(column)}${rowIndex + 1}`, text: cell.comment });
        });
    });
    return notes;
}
function commentsXml(notes) {
    const body = notes
        .map((note) => `<comment ref="${note.ref}" authorId="0"><text><r><t>${escapeXml(note.text)}</t></r></text></comment>`)
        .join("");
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<comments xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><authors><author/></authors><commentList>${body}</commentList></comments>`;
}
function consolidationXml(consolidation) {
    const sources = consolidation.sources.map((source) => `<source ref="${escapeXml(source)}"/>`).join("");
    const flags = [
        consolidation.topRow ? ' topRow="1"' : "",
        consolidation.leftCol ? ' leftCol="1"' : "",
        consolidation.links ? ' links="1"' : "",
    ].join("");
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<consolidation func="${consolidation.func}" dest="${escapeXml(consolidation.dest)}"${flags}>${sources}</consolidation>`;
}
function formControlsXml(sheet) {
    const body = (sheet.formControls ?? [])
        .map((control) => `<control id="${escapeXml(control.id)}" objectType="${control.kind}"${control.label ? ` name="${escapeXml(control.label)}"` : ""}${control.linked ? ` fmlaLink="${escapeXml(control.linked)}"` : ""}${control.checked ? ' checked="1"' : ""}/>`)
        .join("");
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<formControlPr xmlns="http://schemas.microsoft.com/office/spreadsheetml/2009/9/main">${body}</formControlPr>`;
}
function xmlMapsXml(sheet) {
    const body = (sheet.xmlMaps ?? [])
        .map((map) => `<Map ID="${escapeXml(map.id)}" Name="${escapeXml(map.name)}"${map.root ? ` RootElement="${escapeXml(map.root)}"` : ""}/>`)
        .join("");
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<MapInfo xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${body}</MapInfo>`;
}
function slicersXml(sheet) {
    const body = (sheet.slicers ?? [])
        .map((slicer, index) => `<slicer name="${escapeXml(slicer.name)}" cache="SlicerCache${index + 1}" caption="${escapeXml(slicer.field)}"/>`)
        .join("");
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<slicers xmlns="http://schemas.microsoft.com/office/spreadsheetml/2009/9/main">${body}</slicers>`;
}
function slicerCacheXml(slicer, index) {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<slicerCacheDefinition xmlns="http://schemas.microsoft.com/office/spreadsheetml/2009/9/main" name="SlicerCache${index + 1}" sourceName="${escapeXml(slicer.source)}"><data name="${escapeXml(slicer.field)}"/></slicerCacheDefinition>`;
}
function pivotTableXml(pivot, cacheId) {
    const fields = pivot.fields ?? [...new Set([...(pivot.rows ?? []), ...(pivot.columns ?? []), ...(pivot.values ?? [])])];
    const fieldIndex = (name) => Math.max(0, fields.indexOf(name));
    const list = (names) => (names ?? []).map((name) => `<field x="${fieldIndex(name)}"/>`).join("");
    const rows = list(pivot.rows);
    const cols = list(pivot.columns);
    const values = list(pivot.values);
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<pivotTableDefinition xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" name="${escapeXml(pivot.name)}" cacheId="${cacheId}"><pivotFields count="${fields.length}">${fields.map(() => "<pivotField/>").join("")}</pivotFields>${rows ? `<rowFields count="${pivot.rows.length}">${rows}</rowFields>` : ""}${cols ? `<colFields count="${pivot.columns.length}">${cols}</colFields>` : ""}${values ? `<dataFields count="${pivot.values.length}">${values}</dataFields>` : ""}</pivotTableDefinition>`;
}
function pivotCacheXml(pivot) {
    const fields = pivot.fields ?? [];
    const body = fields.map((field) => `<cacheField name="${escapeXml(field)}"/>`).join("");
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<pivotCacheDefinition xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cacheSource type="worksheet"><worksheetSource ref="${escapeXml(pivot.source)}"/></cacheSource><cacheFields count="${fields.length}">${body}</cacheFields></pivotCacheDefinition>`;
}
function pivotRecordsXml(pivot) {
    const rows = (pivot.cache ?? []).map((row) => `<r>${row.map((value) => (/^-?\d+(?:\.\d+)?$/.test(value) ? `<n v="${value}"/>` : `<s v="${escapeXml(value)}"/>`)).join("")}</r>`).join("");
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<pivotCacheRecords xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${pivot.cache?.length ?? 0}">${rows}</pivotCacheRecords>`;
}
function pageBreaksXml(sheet) {
    const rows = (sheet.pageBreaks?.rows ?? []).map((row) => `<brk id="${row}" max="16383" man="1"/>`).join("");
    const cols = (sheet.pageBreaks?.cols ?? []).map((col) => `<brk id="${col}" max="1048575" man="1"/>`).join("");
    return `${rows ? `<rowBreaks count="${sheet.pageBreaks.rows.length}" manualBreakCount="${sheet.pageBreaks.rows.length}">${rows}</rowBreaks>` : ""}${cols ? `<colBreaks count="${sheet.pageBreaks.cols.length}" manualBreakCount="${sheet.pageBreaks.cols.length}">${cols}</colBreaks>` : ""}`;
}
function colName(index) {
    let name = "";
    let next = index + 1;
    while (next > 0) {
        next -= 1;
        name = String.fromCharCode(65 + (next % 26)) + name;
        next = Math.floor(next / 26);
    }
    return name;
}
function escapeXml(value) {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
