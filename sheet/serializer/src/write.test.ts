import assert from "node:assert/strict";
import { test } from "node:test";
import { unzipSync, zipSync, strToU8 } from "fflate";
import { writeXlsx } from "./index";

test("puts every original part back unchanged", () => {
  const source = new Map<string, Uint8Array>([
    ["xl/workbook.xml", strToU8("<workbook/>")],
    ["xl/worksheets/sheet1.xml", strToU8("<worksheet/>")],
  ]);
  const out = unzipSync(writeXlsx({ sheets: [], source }));
  assert.equal(Object.keys(out).length, 2);
  assert.deepEqual(out["xl/workbook.xml"], strToU8("<workbook/>"));
});

test("refuses a workbook that was not opened from a file", () => {
  assert.throws(() => writeXlsx({ sheets: [] }), /no original parts/);
});

test("round trip keeps the part bytes", () => {
  const packed = zipSync({ "xl/workbook.xml": strToU8("<workbook/>") });
  const source = new Map(Object.entries(unzipSync(packed)));
  const again = unzipSync(writeXlsx({ sheets: [], source }));
  assert.deepEqual(again["xl/workbook.xml"], source.get("xl/workbook.xml"));
});
