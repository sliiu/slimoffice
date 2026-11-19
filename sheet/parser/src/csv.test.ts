import assert from "node:assert/strict";
import { test } from "node:test";
import { parseCsv, writeCsv } from "./csv";

test("reads comma and quoted fields", () => {
  const book = parseCsv('名称,数量\n"合,计",12\n');
  assert.equal(book.sheets[0]?.cells[0]?.[0]?.value, "名称");
  assert.equal(book.sheets[0]?.cells[1]?.[0]?.value, "合,计");
  assert.equal(book.sheets[0]?.cells[1]?.[1]?.value, "12");
});

test("round-trips the first sheet", () => {
  const book = parseCsv("a,b\n1,2");
  assert.equal(writeCsv(book), "a,b\n1,2");
});

test("detects tabs", () => {
  const book = parseCsv("a\tb\n1\t2");
  assert.equal(book.sheets[0]?.cells[0]?.[1]?.value, "b");
});
