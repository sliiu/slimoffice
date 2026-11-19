"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.blankDocument = blankDocument;
const fflate_1 = require("fflate");
const document_core_1 = require("@sliiu/document-core");
const body_1 = require("./body.js");
const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`;
const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;
const DOCUMENT = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:sectPr><w:pgSz w:w="${document_core_1.DEFAULT_PAGE.width}" w:h="${document_core_1.DEFAULT_PAGE.height}"/><w:pgMar w:top="${document_core_1.DEFAULT_PAGE.margin.top}" w:bottom="${document_core_1.DEFAULT_PAGE.margin.bottom}" w:left="${document_core_1.DEFAULT_PAGE.margin.left}" w:right="${document_core_1.DEFAULT_PAGE.margin.right}"/></w:sectPr></w:body></w:document>`;
/** A blank document, or one filled with the given blocks. It can be opened again. */
function blankDocument(blocks = []) {
    const source = new Map([
        ["[Content_Types].xml", (0, fflate_1.strToU8)(CONTENT_TYPES)],
        ["_rels/.rels", (0, fflate_1.strToU8)(RELS)],
        ["word/document.xml", (0, fflate_1.strToU8)((0, body_1.applyDocumentEdits)(DOCUMENT, { sections: [{ page: document_core_1.DEFAULT_PAGE, header: [], footer: [], blocks }] }).xml)],
    ]);
    return {
        bytes: (0, fflate_1.zipSync)(Object.fromEntries(source)),
        document: { sections: [{ page: document_core_1.DEFAULT_PAGE, header: [], footer: [], blocks }], source },
    };
}
