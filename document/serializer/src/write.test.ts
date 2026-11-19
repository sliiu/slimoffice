import assert from "node:assert/strict";
import { test } from "node:test";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { writeDocx } from "./index";

test("puts every original part back unchanged", () => {
  const source = new Map<string, Uint8Array>([
    ["word/document.xml", strToU8("<w:document>kept</w:document>")],
    ["word/theme/theme1.xml", strToU8("<a:theme>untouched</a:theme>")],
  ]);
  const out = unzipSync(writeDocx({ sections: [], source }));
  assert.equal(strFromU8(out["word/document.xml"]!), "<w:document>kept</w:document>");
  assert.equal(strFromU8(out["word/theme/theme1.xml"]!), "<a:theme>untouched</a:theme>");
});

test("refuses a document that was not opened from a file", () => {
  assert.throws(() => writeDocx({ sections: [] }), /original parts/);
});

test("round trip keeps the part bytes", () => {
  const original = zipSync({ "word/document.xml": strToU8("<w:document><w:body/></w:document>") });
  const source = new Map(Object.entries(unzipSync(original)));
  const again = unzipSync(writeDocx({ sections: [], source }));
  assert.deepEqual(again["word/document.xml"], source.get("word/document.xml"));
});

const PAGE = { width: 12240, height: 15840, margin: { top: 720, bottom: 720, left: 720, right: 720 } };

test("keeps each section's header reference when the story is rewritten", () => {
  const story = `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>
    <w:p><w:r><w:t>One</w:t></w:r></w:p>
    <w:p><w:pPr><w:sectPr><w:headerReference w:type="default" r:id="rHdr"/><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="720" w:bottom="720" w:left="720" w:right="720"/></w:sectPr></w:pPr></w:p>
    <w:p><w:r><w:t>Two</w:t></w:r></w:p>
    <w:sectPr><w:pgSz w:w="15840" w:h="12240" w:orient="landscape"/><w:pgMar w:top="720" w:bottom="720" w:left="720" w:right="720"/><w:cols w:num="2"/></w:sectPr>
  </w:body></w:document>`;
  const source = new Map<string, Uint8Array>([["word/document.xml", strToU8(story)]]);
  const out = unzipSync(writeDocx({
    edited: true,
    source,
    sections: [
      { page: PAGE, header: [], footer: [], blocks: [{ runs: [{ text: "One" }] }] },
      { page: { ...PAGE, width: 15840, height: 12240, landscape: true, columns: 2 }, header: [], footer: [], blocks: [{ runs: [{ text: "Two" }] }] },
    ],
  }));
  const xml = strFromU8(out["word/document.xml"]!);
  assert.match(xml, /r:id="rHdr"/);
  assert.match(xml, /w:orient="landscape"/);
  assert.match(xml, /w:cols w:num="2"/);
});

test("writes a relationship and a content type for a picture added after opening", () => {
  const story = `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body><w:p><w:r><w:t>Body</w:t></w:r></w:p><w:sectPr><w:pgSz w:w="12240" w:h="15840"/></w:sectPr></w:body></w:document>`;
  const png = Uint8Array.from([137, 80, 78, 71]);
  const source = new Map<string, Uint8Array>([
    ["word/document.xml", strToU8(story)],
    ["[Content_Types].xml", strToU8(`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>`)],
    ["word/media/rIdImg1.png", png],
  ]);
  const out = unzipSync(writeDocx({
    edited: true,
    source,
    sections: [{ page: PAGE, header: [], footer: [], blocks: [{ runs: [{ text: "Body" }, { text: "", image: "rIdImg1", imageBytes: png, imageType: "image/png" }] }] }],
  }));
  assert.match(strFromU8(out["word/document.xml"]!), /r:embed="rIdImg1"/);
  assert.match(strFromU8(out["word/_rels/document.xml.rels"]!), /Id="rIdImg1"[^>]*Target="media\/rIdImg1\.png"/);
  assert.match(strFromU8(out["[Content_Types].xml"]!), /Extension="png" ContentType="image\/png"/);
  assert.deepEqual(out["word/media/rIdImg1.png"], png);
});

test("writes a numbering part for a list started inside the editor", () => {
  const story = `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>One</w:t></w:r></w:p><w:sectPr><w:pgSz w:w="12240" w:h="15840"/></w:sectPr></w:body></w:document>`;
  const source = new Map<string, Uint8Array>([
    ["word/document.xml", strToU8(story)],
    ["[Content_Types].xml", strToU8(`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>`)],
  ]);
  const out = unzipSync(writeDocx({
    edited: true,
    source,
    numbering: { "1": [{ text: "%1." }] },
    sections: [{ page: PAGE, header: [], footer: [], blocks: [{ runs: [{ text: "One" }], numbering: { id: "1", level: 0 } }] }],
  }));
  const numbering = strFromU8(out["word/numbering.xml"]!);
  assert.match(numbering, /<w:num w:numId="1"><w:abstractNumId w:val="1"\/><\/w:num>/);
  assert.match(numbering, /<w:lvlText w:val="%1\."\/>/);
  assert.match(strFromU8(out["word/_rels/document.xml.rels"]!), /Target="numbering\.xml"/);
  assert.match(strFromU8(out["[Content_Types].xml"]!), /PartName="\/word\/numbering\.xml"/);
  assert.match(strFromU8(out["word/document.xml"]!), /<w:numId w:val="1"\/>/);
});

test("writes the picture extent it was given", () => {
  const story = `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body><w:p><w:r><w:t>Body</w:t></w:r></w:p><w:sectPr/></w:body></w:document>`;
  const source = new Map<string, Uint8Array>([["word/document.xml", strToU8(story)]]);
  const out = unzipSync(writeDocx({
    edited: true,
    source,
    sections: [{ page: PAGE, header: [], footer: [], blocks: [{ runs: [{ text: "", image: "rPic", imageWidth: 914400, imageHeight: 457200 }] }] }],
  }));
  assert.match(strFromU8(out["word/document.xml"]!), /<wp:extent cx="914400" cy="457200"\/>/);
});
