import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { guessOleProgId, oleBadgeText, oleTypeLabel } from "./ole.js";

describe("OLE labels", () => {
  it("maps progId and file extension", () => {
    assert.equal(oleTypeLabel("Excel.Sheet.12"), "Excel Worksheet");
    assert.equal(oleTypeLabel(undefined, "report.pdf"), "PDF Document");
    assert.equal(oleTypeLabel(undefined, "note.txt"), "TXT File");
    assert.equal(oleTypeLabel(undefined), "Embedded Object");
    assert.equal(oleBadgeText("Excel.Sheet.12"), "XLS");
    assert.equal(oleBadgeText(undefined, "deck.pptx"), "PPTX");
    assert.equal(oleBadgeText("Equation.3"), "fx");
    assert.equal(guessOleProgId("book.xlsx"), "Excel.Sheet.12");
    assert.equal(guessOleProgId("unknown.bin"), "Package");
  });
});
