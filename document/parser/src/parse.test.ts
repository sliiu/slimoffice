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
      <w:sectPr><w:pgSz w:w="15840" w:h="12240" w:orient="landscape"/><w:cols w:num="2" w:space="708" w:sep="1"/></w:sectPr>
    </w:body></w:document>`,
  }));
  const section = parsed.sections[0]!;
  assert.equal(section.page.landscape, true);
  assert.equal(section.page.columns, 2);
  assert.equal(section.page.columnSpace, 708);
  assert.equal(section.page.columnSeparator, true);
  const table = section.blocks[0]!;
  assert.equal(isDocTable(table), true);
  if (isDocTable(table)) {
    const cell = table.rows[0]?.[0];
    assert.equal(cell?.span, 2);
    assert.equal(cell?.vMerge, "restart");
    assert.equal(cell?.shading, "#eeeeee");
  }
});

test("reads the mail merge settings and the paragraphs inside a content control", async () => {
  const parsed = await parseDocx(docx({
    "word/settings.xml": `<w:settings><w:mailMerge><w:mainDocumentType w:val="formLetters"/><w:dataType w:val="textFile"/><w:query w:val="recipients.csv"/><w:linkToQuery w:val="file"/></w:mailMerge></w:settings>`,
    "word/document.xml": `<w:document><w:body>
      <w:sdt><w:sdtPr><w:alias w:val="Name"/></w:sdtPr><w:sdtContent><w:p><w:r><w:t>Ada</w:t></w:r></w:p></w:sdtContent></w:sdt>
    </w:body></w:document>`,
  }));
  assert.equal(parsed.mailMerge?.document, "formLetters");
  assert.equal(parsed.mailMerge?.data, "textFile");
  assert.equal(parsed.mailMerge?.source, "recipients.csv");
  assert.equal(parsed.mailMerge?.link, "file");
  const block = parsed.sections[0]!.blocks[0]!;
  assert.equal("content" in block ? block.content?.[0]?.runs[0]?.text : "", "Ada");
  assert.equal("control" in block ? block.control?.includes("alias") : false, true);
});

test("reads the theme's colors and fonts, and resolves a theme font and a theme color", async () => {
  const parsed = await parseDocx(docx({
    "word/theme/theme1.xml": `<a:theme><a:themeElements>
      <a:clrScheme name="Office"><a:dk1><a:sysClr val="windowText" lastClr="111111"/></a:dk1><a:accent1><a:srgbClr val="5B9BD5"/></a:accent1></a:clrScheme>
      <a:fontScheme name="Office"><a:majorFont><a:latin typeface="Calibri Light"/><a:ea typeface="DengXian"/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/></a:minorFont></a:fontScheme>
    </a:themeElements></a:theme>`,
    "word/document.xml": `<w:document><w:body>
      <w:p><w:r><w:rPr><w:rFonts w:asciiTheme="minorHAnsi" w:eastAsiaTheme="majorEastAsia"/><w:color w:val="5B9BD5" w:themeColor="accent1"/></w:rPr><w:t>Themed</w:t></w:r></w:p>
    </w:body></w:document>`,
  }));
  assert.equal(parsed.theme?.colors.dk1, "#111111");
  assert.equal(parsed.theme?.colors.accent1, "#5b9bd5");
  assert.equal(parsed.theme?.fonts.latin, "Calibri Light");
  assert.equal(parsed.theme?.fonts.eastAsia, "DengXian");
  const block = parsed.sections[0]!.blocks[0]!;
  if (isDocParagraph(block)) {
    assert.equal(block.runs[0]?.font, "theme:latin");
    assert.equal(block.runs[0]?.fontEastAsia, "theme:eastAsia");
    assert.equal(block.runs[0]?.themeColor, "accent1");
    assert.equal(block.runs[0]?.color, "#5b9bd5");
  }
});

test("reads the view, the zoom, and whether a macro project is present", async () => {
  const parsed = await parseDocx(docx({
    "word/settings.xml": `<w:settings><w:view w:val="outline"/><w:zoom w:percent="150"/></w:settings>`,
    "word/document.xml": `<w:document><w:body><w:p><w:r><w:t>A</w:t></w:r></w:p></w:body></w:document>`,
    "word/vbaProject.bin": "macro bytes",
  }));
  assert.equal(parsed.view, "outline");
  assert.equal(parsed.zoom, 150);
  assert.equal(parsed.macros, true);
});

test("a view Word does not use here falls back to print, and no macro project means none", async () => {
  const parsed = await parseDocx(docx({
    "word/settings.xml": `<w:settings><w:view w:val="masterPages"/><w:zoom w:percent="100"/></w:settings>`,
    "word/document.xml": `<w:document><w:body><w:p><w:r><w:t>A</w:t></w:r></w:p></w:body></w:document>`,
  }));
  assert.equal(parsed.view, undefined);
  assert.equal(parsed.zoom, 100);
  assert.equal(parsed.macros, undefined);
});

test("reads the complex-script size, bold, and italic as their own fields", async () => {
  const parsed = await parseDocx(docx({
    "word/document.xml": `<w:document><w:body>
      <w:p><w:r><w:rPr><w:sz w:val="24"/><w:szCs w:val="32"/><w:bCs/><w:iCs/></w:rPr><w:t>季报</w:t></w:r></w:p>
    </w:body></w:document>`,
  }));
  const block = parsed.sections[0]!.blocks[0]!;
  if (isDocParagraph(block)) {
    assert.equal(block.runs[0]?.fontSize, 12);
    assert.equal(block.runs[0]?.fontSizeCs, 16);
    assert.equal(block.runs[0]?.boldCs, true);
    assert.equal(block.runs[0]?.italicCs, true);
    assert.equal(block.runs[0]?.fitText, undefined);
  }
});

test("reads each side of a border, a column width, a page number format, a frame, and a run's fit width", async () => {
  const parsed = await parseDocx(docx({
    "word/document.xml": `<w:document><w:body>
      <w:p><w:pPr>
        <w:pBdr><w:top w:val="double" w:sz="12" w:color="FF0000"/><w:bottom w:val="dotted" w:sz="4" w:color="0000FF"/></w:pBdr>
        <w:framePr w:w="2880" w:hAnchor="page" w:wrap="around" w:dropCap="drop" w:lines="3" w:hSpace="120"/>
        <w:jc w:val="distribute"/>
        <w:textDirection w:val="tbRl"/><w:textAlignment w:val="center"/><w:divId w:val="3"/>
      </w:pPr><w:r><w:rPr><w:bdr><w:top w:val="single" w:sz="8" w:color="00AA00"/></w:bdr><w:shd w:val="clear" w:fill="FFFF00"/><w:fitText w:val="1440"/><w:eastAsianLayout w:combine="1" w:id="2"/></w:rPr><w:t>Boxed</w:t></w:r></w:p>
      <w:sectPr>
        <w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:bottom="1440" w:left="1440" w:right="1440"/>
        <w:cols w:num="2" w:equalWidth="0"><w:col w:w="4320"/><w:col w:w="2880"/></w:cols>
        <w:pgBorders><w:top w:val="single" w:sz="24" w:color="000000"/><w:left w:val="dashed" w:sz="6" w:color="888888"/></w:pgBorders>
        <w:vAlign w:val="center"/><w:docGrid w:linePitch="360"/><w:pgNumType w:start="3" w:fmt="lowerRoman"/>
      </w:sectPr>
    </w:body></w:document>`,
  }));
  const block = parsed.sections[0]!.blocks[0]!;
  if (isDocParagraph(block)) {
    assert.equal(block.border?.top?.style, "double");
    assert.equal(block.border?.top?.size, 12);
    assert.equal(block.border?.top?.color, "#ff0000");
    assert.equal(block.border?.bottom?.style, "dotted");
    assert.equal(block.border?.left, undefined);
    assert.equal(block.align, "distribute");
    assert.equal(block.frame?.width, 2880);
    assert.equal(block.frame?.anchorX, "page");
    assert.equal(block.frame?.dropCap?.lines, 3);
    assert.equal(block.frame?.dropCap?.space, 120);
    assert.equal(block.direction, "tb");
    assert.equal(block.textAlign, "center");
    assert.equal(block.divId, "3");
    assert.equal(block.runs[0]?.border?.top?.style, "single");
    assert.equal(block.runs[0]?.shading, "#ffff00");
    assert.equal(block.runs[0]?.fitText, 1440);
    assert.equal(block.runs[0]?.eastAsianLayout?.combine, true);
  }
  const page = parsed.sections[0]!.page;
  assert.deepEqual(page.columnWidths, [4320, 2880]);
  assert.equal(page.border?.top?.size, 24);
  assert.equal(page.border?.left?.style, "dashed");
  assert.equal(page.verticalAlign, "center");
  assert.equal(page.grid?.linePitch, 360);
  assert.equal(page.pageNumber?.start, 3);
  assert.equal(page.pageNumber?.format, "lowerRoman");
});

test("reads a row height, a note separator, a move range, an automatic color, and a picture bullet", async () => {
  const parsed = await parseDocx(docx({
    "word/document.xml": `<w:document><w:body>
      <w:tbl><w:tr><w:trPr><w:trHeight w:val="600" w:hRule="exact"/></w:trPr><w:tc><w:tcPr><w:vAlign w:val="center"/></w:tcPr><w:p><w:r><w:t>Tall</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
      <w:p><w:moveFromRangeStart w:id="7"/><w:r><w:rPr><w:color w:val="auto"/></w:rPr><w:t>Moved</w:t></w:r><w:moveFromRangeEnd w:id="7"/></w:p>
      <w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>Item</w:t></w:r><w:r><w:footnoteReference w:id="1"/></w:r></w:p>
    </w:body></w:document>`,
    "word/footnotes.xml": `<w:footnotes><w:footnote w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:footnote><w:footnote w:id="1"><w:p><w:r><w:t>Note</w:t></w:r></w:p></w:footnote></w:footnotes>`,
    "word/numbering.xml": `<w:numbering><w:numPicBullet w:numPicBulletId="0"><w:drawing><wp:inline><a:graphic><a:graphicData><pic:pic><pic:blipFill><a:blip r:embed="rBullet"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:numPicBullet><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/><w:lvlPicBulletId w:val="0"/><w:lvlText w:val=""/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`,
    "word/_rels/numbering.xml.rels": `<Relationships><Relationship Id="rBullet" Type="image" Target="media/bullet.png"/></Relationships>`,
    "word/media/bullet.png": "PNG",
  }));
  const table = parsed.sections[0]!.blocks[0]!;
  assert.equal(isDocTable(table) ? table.rowHeights?.[0] : 0, 600);
  assert.equal(isDocTable(table) ? table.rowRules?.[0] : "", "exact");
  assert.equal(isDocTable(table) ? table.rows[0]?.[0]?.align : "", "center");
  const moved = parsed.sections[0]!.blocks[1]!;
  if (isDocParagraph(moved)) {
    assert.equal(moved.runs[0]?.moveRange?.kind, "moveFrom");
    assert.equal(moved.runs[0]?.moveRange?.edge, "start");
    assert.equal(moved.runs[1]?.colorAuto, true);
    assert.equal(moved.runs[2]?.moveRange?.edge, "end");
  }
  const listed = parsed.sections[0]!.blocks[2]!;
  if (isDocParagraph(listed)) {
    assert.equal(parsed.numbering?.["1"]?.[0]?.picture?.image, "rBullet");
    assert.ok((parsed.numbering?.["1"]?.[0]?.picture?.imageBytes?.length ?? 0) > 0);
  }
  const separator = parsed.sections[0]!.blocks.find((block) => isDocParagraph(block) && block.noteSeparator);
  assert.equal(isDocParagraph(separator!) && separator.noteSeparator?.type, "separator");
});

test("reads the document defaults, a linked character style, a table style, and the latent styles", async () => {
  const parsed = await parseDocx(docx({
    "word/document.xml": `<w:document><w:body><w:p><w:r><w:t>Body</w:t></w:r></w:p></w:body></w:document>`,
    "word/styles.xml": `<w:styles>
      <w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri"/><w:sz w:val="22"/></w:rPr></w:rPrDefault></w:docDefaults>
      <w:latentStyles><w:lsdException w:name="heading 1" w:count="1"/></w:latentStyles>
      <w:style w:type="paragraph" w:styleId="Heading1"><w:link w:val="Heading1Char"/></w:style>
      <w:style w:type="character" w:styleId="Heading1Char"><w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style>
      <w:style w:type="table" w:styleId="TableGrid"><w:rPr><w:sz w:val="20"/></w:rPr></w:style>
    </w:styles>`,
  }));
  assert.equal(parsed.styles?.defaults?.font, "Calibri");
  assert.equal(parsed.styles?.defaults?.fontSize, 11);
  assert.equal(parsed.styles?.styles.Heading1?.link, "Heading1Char");
  assert.equal(parsed.styles?.styles.Heading1Char?.type, "character");
  assert.equal(parsed.styles?.styles.Heading1Char?.bold, true);
  assert.equal(parsed.styles?.styles.TableGrid?.type, "table");
  assert.deepEqual(parsed.styles?.latent, [{ name: "heading 1", count: 1 }]);
});
