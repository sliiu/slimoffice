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
