import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { strToU8, zipSync } from "fflate";
import { defaultConfig } from "../config";
import { extractSourceText, SourceFileError } from "./extract";
import { classifySourceFile, topicFromSourceName } from "./kinds";
import { resolveSourceDelivery } from "./resolve";
import { byteRouteFor, filesNeedingDegrade, unknownSourceNames } from "./support";

describe("source file kinds", () => {
  it("accepts documents and images, and rejects other files", () => {
    assert.equal(classifySourceFile("a.PDF", ""), "pdf");
    assert.equal(classifySourceFile("a.docx", ""), "docx");
    assert.equal(classifySourceFile("a.xlsx", ""), "xlsx");
    assert.equal(classifySourceFile("a.doc", ""), "legacy");
    assert.equal(classifySourceFile("a.pptx", ""), "document");
    assert.equal(classifySourceFile("notes.md", ""), "text");
    assert.equal(classifySourceFile("shot.PNG", ""), "image");
    assert.equal(classifySourceFile("photo", "image/jpeg"), "image");
    assert.equal(classifySourceFile("clip.mp4", "video/mp4"), "unknown");
    assert.equal(topicFromSourceName("Q1 Report.docx"), "Q1 Report");
  });

  it("sends bytes when the model accepts the type and asks before extracting otherwise", () => {
    const openai = { ...defaultConfig().text, provider: "openai" as const, model: "gpt-4o" };
    const deepseek = { ...defaultConfig().text, provider: "deepseek" as const, model: "deepseek-chat" };
    const claude = { ...defaultConfig().text, provider: "anthropic" as const, model: "claude-sonnet-4-5" };
    assert.equal(byteRouteFor(openai, "pdf"), "chat");
    assert.equal(byteRouteFor(openai, "docx"), "openai-responses");
    assert.equal(byteRouteFor(openai, "xlsx"), "openai-responses");
    assert.equal(byteRouteFor(openai, "image"), "chat");
    assert.equal(byteRouteFor(openai, "document"), "openai-responses");
    assert.equal(byteRouteFor(claude, "pdf"), "chat");
    assert.equal(byteRouteFor(claude, "image"), "chat");
    assert.equal(byteRouteFor(claude, "xlsx"), "degrade");
    assert.equal(byteRouteFor(claude, "text"), "degrade");
    assert.equal(byteRouteFor(deepseek, "pdf"), "degrade");
    assert.equal(byteRouteFor(deepseek, "image"), "degrade");
    assert.deepEqual(
      filesNeedingDegrade(deepseek, [
        { name: "a.pdf", mediaType: "application/pdf" },
        { name: "b.docx", mediaType: "" },
        { name: "c.png", mediaType: "image/png" },
        { name: "d.txt", mediaType: "text/plain" },
      ]),
      ["a.pdf", "b.docx", "d.txt"],
    );
    assert.deepEqual(unknownSourceNames([{ name: "clip.mp4", mediaType: "video/mp4" }]), ["clip.mp4"]);
    assert.deepEqual(unknownSourceNames([{ name: "deck.pptx", mediaType: "" }]), []);
  });

  it("sends an image to a vision model and stops when the model cannot see", async () => {
    const openai = { ...defaultConfig().text, provider: "openai" as const, model: "gpt-4o" };
    const deepseek = { ...defaultConfig().text, provider: "deepseek" as const, model: "deepseek-chat" };
    const png = new Uint8Array([1, 2, 3]);
    const sent = await resolveSourceDelivery(openai, [{ name: "shot.png", mediaType: "", bytes: png }], async () => true);
    assert.equal(sent.parts[0]?.mediaType, "image/png");
    assert.equal(sent.parts[0]?.route, "chat");
    await assert.rejects(
      () => resolveSourceDelivery(deepseek, [{ name: "shot.png", mediaType: "image/png", bytes: png }], async () => true),
      /读不了图像/,
    );
  });
});

describe("source text fallback", () => {
  it("reads docx, xlsx, and a text-layer pdf", () => {
    const docx = zipSync({
      "word/document.xml": strToU8(
        `<w:document><w:body><w:p><w:r><w:t>Hello doc</w:t></w:r></w:p></w:body></w:document>`,
      ),
    });
    assert.equal(extractSourceText({ name: "a.docx", mediaType: "", bytes: docx }), "Hello doc");

    const xlsx = zipSync({
      "xl/sharedStrings.xml": strToU8(`<sst><si><t>Revenue</t></si></sst>`),
      "xl/worksheets/sheet1.xml": strToU8(`<worksheet><sheetData><row><c r="A1" t="s"><v>0</v></c><c r="B1"><v>12</v></c></row></sheetData></worksheet>`),
    });
    const sheet = extractSourceText({ name: "a.xlsx", mediaType: "", bytes: xlsx });
    assert.match(sheet, /Revenue/);
    assert.match(sheet, /12/);

    const pdf = new TextEncoder().encode("%PDF-1.1\nBT (Hello PDF) Tj ET\n%%EOF");
    assert.match(extractSourceText({ name: "a.pdf", mediaType: "application/pdf", bytes: pdf }), /Hello PDF/);

    assert.equal(extractSourceText({ name: "notes.md", mediaType: "text/markdown", bytes: new TextEncoder().encode("# Hello\n") }), "# Hello");

    const pptx = zipSync({
      "ppt/slides/slide1.xml": strToU8(`<p:sld><a:t>From the deck</a:t></p:sld>`),
    });
    assert.equal(extractSourceText({ name: "deck.pptx", mediaType: "", bytes: pptx }), "From the deck");
  });

  it("keeps docx tables as rows instead of flattening them", () => {
    const docx = zipSync({
      "word/document.xml": strToU8(
        `<w:document><w:body>
          <w:p><w:r><w:t>Q3 销量</w:t></w:r></w:p>
          <w:tbl>
            <w:tr><w:tc><w:p><w:r><w:t>品牌</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>销量</w:t></w:r></w:p></w:tc></w:tr>
            <w:tr><w:tc><w:p><w:r><w:t>A</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>120</w:t></w:r></w:p></w:tc></w:tr>
          </w:tbl>
          <w:p><w:r><w:t>数据来源：内部</w:t></w:r></w:p>
        </w:body></w:document>`,
      ),
    });
    const text = extractSourceText({ name: "q3.docx", mediaType: "", bytes: docx });
    assert.match(text, /\| 品牌 \| 销量 \|/);
    assert.match(text, /\| --- \| --- \|/);
    assert.match(text, /\| A \| 120 \|/);
    // document order survives: the caption above the table, not after it
    assert.ok(text.indexOf("Q3 销量") < text.indexOf("| 品牌"), text);
    assert.ok(text.indexOf("数据来源") > text.indexOf("| A"), text);
  });

  it("stops on a file with no readable text", () => {
    assert.throws(
      () => extractSourceText({ name: "empty.pdf", mediaType: "application/pdf", bytes: new TextEncoder().encode("%PDF-1.1\n%%EOF") }),
      SourceFileError,
    );
  });
});
