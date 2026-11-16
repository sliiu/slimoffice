import assert from "node:assert/strict";
import { test } from "node:test";
import { strToU8, zipSync } from "fflate";
import { isDocTable } from "@sliiu/document-core";
import { DocxOpenError, parseDocx } from "./parse";

function docx(parts: Record<string, string>): Uint8Array {
  return zipSync(Object.fromEntries(Object.entries(parts).map(([path, xml]) => [path, strToU8(xml)])));
}

test("reads paragraphs, a table, and the section page", async () => {
  const parsed = await parseDocx(docx({
    "word/document.xml": `<w:document><w:body>
      <w:p><w:pPr><w:pStyle w:val="Heading1"/><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="32"/><w:color w:val="112233"/></w:rPr><w:t>Title</w:t></w:r></w:p>
      <w:tbl><w:tr><w:tc><w:p><w:r><w:t>A</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>B</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
      <w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:bottom="1134" w:left="850" w:right="850"/></w:sectPr>
    </w:body></w:document>`,
  }));
  const section = parsed.sections[0]!;
  assert.equal(section.page.width, 11906);
  assert.equal(section.page.margin.left, 850);
  const heading = section.blocks[0]!;
  assert.equal(isDocTable(heading), false);
  if (!isDocTable(heading)) {
    assert.equal(heading.style, "Heading1");
    assert.equal(heading.align, "center");
    assert.deepEqual(heading.runs[0], { text: "Title", bold: true, fontSize: 16, color: "#112233" });
  }
  const table = section.blocks[1]!;
  assert.equal(isDocTable(table), true);
  if (isDocTable(table)) assert.equal(table.rows[0]?.[1]?.[0]?.runs[0]?.text, "B");
});

test("keeps a paragraph after the table", async () => {
  const parsed = await parseDocx(docx({
    "word/document.xml": `<w:document><w:body>
      <w:tbl><w:tr><w:tc><w:p><w:r><w:t>Cell</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
      <w:p><w:r><w:t>After</w:t></w:r></w:p>
    </w:body></w:document>`,
  }));
  const blocks = parsed.sections[0]!.blocks;
  assert.equal(isDocTable(blocks[0]!), true);
  assert.equal(isDocTable(blocks[1]!), false);
});

test("reads a header through its relationship", async () => {
  const parsed = await parseDocx(docx({
    "word/document.xml": `<w:document><w:body><w:p><w:r><w:t>Body</w:t></w:r></w:p><w:sectPr><w:headerReference w:type="default" r:id="rId1"/></w:sectPr></w:body></w:document>`,
    "word/_rels/document.xml.rels": `<Relationships><Relationship Id="rId1" Type="header" Target="header1.xml"/></Relationships>`,
    "word/header1.xml": `<w:hdr><w:p><w:r><w:t>Running head</w:t></w:r></w:p></w:hdr>`,
  }));
  assert.equal(parsed.sections[0]?.header[0]?.runs[0]?.text, "Running head");
});

test("rejects a binary .doc", async () => {
  const bytes = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0]);
  await assert.rejects(parseDocx(bytes), (error: unknown) => error instanceof DocxOpenError && error.code === "LEGACY_DOC");
});

test("keeps the original parts for writing back", async () => {
  const parsed = await parseDocx(docx({ "word/document.xml": `<w:document><w:body><w:p><w:r><w:t>A</w:t></w:r></w:p></w:body></w:document>` }));
  assert.equal(parsed.source?.has("word/document.xml"), true);
});
