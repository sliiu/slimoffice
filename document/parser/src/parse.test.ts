import assert from "node:assert/strict";
import { test } from "node:test";
import { strToU8, zipSync } from "fflate";
import { isDocParagraph, isDocTable } from "@sliiu/document-core";
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
  if (isDocParagraph(heading)) {
    assert.equal(heading.style, "Heading1");
    assert.equal(heading.align, "center");
    assert.deepEqual(heading.runs[0], { text: "Title", bold: true, fontSize: 16, color: "#112233" });
  }
  const table = section.blocks[1]!;
  assert.equal(isDocTable(table), true);
  if (isDocTable(table)) assert.equal(table.rows[0]?.[1]?.paragraphs[0]?.runs[0]?.text, "B");
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

test("reads run marks, a list, spacing, a link, a break, and a picture", async () => {
  const parsed = await parseDocx(docx({
    "word/document.xml": `<w:document><w:body>
      <w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr><w:spacing w:before="200" w:after="120" w:line="360" w:lineRule="auto"/><w:ind w:left="720" w:firstLine="360"/></w:pPr>
        <w:bookmarkStart w:id="0" w:name="here"/>
        <w:r><w:rPr><w:b w:val="0"/><w:i/><w:u w:val="single"/><w:strike/><w:vertAlign w:val="superscript"/><w:highlight w:val="yellow"/><w:rFonts w:ascii="Calibri"/></w:rPr><w:t>Marked</w:t></w:r>
      </w:p>
      <w:p><w:hyperlink r:id="rLink"><w:r><w:t>Go</w:t></w:r></w:hyperlink></w:p>
      <w:p><w:r><w:br w:type="page"/><w:tab/><w:t>Next</w:t></w:r></w:p>
      <w:p><w:r><w:drawing><wp:inline><a:graphic><a:graphicData><pic:pic><pic:blipFill><a:blip r:embed="rImg"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>
    </w:body></w:document>`,
    "word/_rels/document.xml.rels": `<Relationships>
      <Relationship Id="rLink" Type="hyperlink" Target="https://example.com" TargetMode="External"/>
      <Relationship Id="rImg" Type="image" Target="media/pic.png"/>
    </Relationships>`,
    "word/media/pic.png": "PNG",
    "word/numbering.xml": `<w:numbering><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:lvlText w:val="%1."/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`,
  }));
  const listed = parsed.sections[0]!.blocks[0]!;
  const linked = parsed.sections[0]!.blocks[1]!;
  const broken = parsed.sections[0]!.blocks[2]!;
  const picture = parsed.sections[0]!.blocks[3]!;
  assert.equal(isDocTable(listed), false);
  if (isDocParagraph(listed)) {
    assert.deepEqual(listed.numbering, { id: "1", level: 0 });
    assert.deepEqual(listed.spacing, { before: 200, after: 120, line: 360, lineRule: "auto" });
    assert.deepEqual(listed.indent, { left: 720, firstLine: 360 });
    assert.equal(listed.runs[0]?.bold, undefined);
    assert.equal(listed.runs[0]?.italic, true);
    assert.equal(listed.runs[0]?.underline, "single");
    assert.equal(listed.runs[0]?.strike, true);
    assert.equal(listed.runs[0]?.vertAlign, "superscript");
    assert.equal(listed.runs[0]?.highlight, "#ffff00");
    assert.equal(listed.runs[0]?.font, "Calibri");
    assert.equal(listed.runs[0]?.bookmark, "here");
  }
  assert.equal(parsed.numbering?.["1"]?.[0]?.text, "%1.");
  if (isDocParagraph(linked)) assert.equal(linked.runs[0]?.link, "https://example.com");
  if (isDocParagraph(broken)) {
    assert.equal(broken.runs[0]?.breakBefore, "page");
    assert.equal(broken.runs[0]?.tabBefore, true);
  }
  if (isDocParagraph(picture)) {
    assert.equal(picture.runs[0]?.image, "rImg");
    assert.equal(picture.runs[0]?.imageType, "image/png");
    assert.ok((picture.runs[0]?.imageBytes?.length ?? 0) > 0);
  }
});

test("reads merged cells, columns, and landscape", async () => {
  const parsed = await parseDocx(docx({
    "word/document.xml": `<w:document><w:body>
      <w:tbl><w:tr><w:tc><w:tcPr><w:gridSpan w:val="2"/><w:vMerge w:val="restart"/><w:shd w:fill="EEEEEE"/></w:tcPr><w:p><w:r><w:t>Wide</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
      <w:sectPr><w:pgSz w:w="15840" w:h="12240" w:orient="landscape"/><w:cols w:num="2"/></w:sectPr>
    </w:body></w:document>`,
  }));
  const section = parsed.sections[0]!;
  assert.equal(section.page.landscape, true);
  assert.equal(section.page.columns, 2);
  const table = section.blocks[0]!;
  assert.equal(isDocTable(table), true);
  if (isDocTable(table)) {
    const cell = table.rows[0]?.[0];
    assert.equal(cell?.span, 2);
    assert.equal(cell?.vMerge, "restart");
    assert.equal(cell?.shading, "#eeeeee");
  }
});
