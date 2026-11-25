import { strToU8, zipSync } from "fflate";
import { DEFAULT_PAGE } from "@sliiu/document-core";
import { applyDocumentEdits } from "./body";
const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`;
const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;
const DOCUMENT = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:sectPr><w:pgSz w:w="${DEFAULT_PAGE.width}" w:h="${DEFAULT_PAGE.height}"/><w:pgMar w:top="${DEFAULT_PAGE.margin.top}" w:bottom="${DEFAULT_PAGE.margin.bottom}" w:left="${DEFAULT_PAGE.margin.left}" w:right="${DEFAULT_PAGE.margin.right}"/></w:sectPr></w:body></w:document>`;
/** A blank document, or one filled with the given blocks. It can be opened again. */
export function blankDocument(blocks = []) {
    const source = new Map([
        ["[Content_Types].xml", strToU8(CONTENT_TYPES)],
        ["_rels/.rels", strToU8(RELS)],
        ["word/document.xml", strToU8(applyDocumentEdits(DOCUMENT, { sections: [{ page: DEFAULT_PAGE, header: [], footer: [], blocks }] }).xml)],
    ]);
    return {
        bytes: zipSync(Object.fromEntries(source)),
        document: { sections: [{ page: DEFAULT_PAGE, header: [], footer: [], blocks }], source },
    };
}
