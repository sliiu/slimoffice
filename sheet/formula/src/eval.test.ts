import assert from "node:assert/strict";
import { test } from "node:test";
import type { Workbook } from "@sliiu/sheet-core";
import { evaluate, formatResult, recalculate } from "./index";

function book(cells: { value: string; formula?: string }[][]): Workbook {
  return { sheets: [{ name: "Sheet1", cells }] };
}

function ctx(workbook: Workbook, row = 0, col = 0) {
  return { workbook, sheetIndex: 0, row, col };
}

test("arithmetic and comparisons", () => {
  const workbook = book([]);
  assert.equal(evaluate("=1+2*3", ctx(workbook)), 7);
  assert.equal(evaluate("=(1+2)*3", ctx(workbook)), 9);
  assert.equal(evaluate("=2^3", ctx(workbook)), 8);
  assert.equal(evaluate("=10%", ctx(workbook)), 0.1);
  assert.equal(evaluate("=\"A\"&\"B\"", ctx(workbook)), "AB");
  assert.equal(evaluate("=3>2", ctx(workbook)), true);
  assert.equal(evaluate("=3<>3", ctx(workbook)), false);
});

test("cell refs and SUM", () => {
  const workbook = book([[{ value: "1" }, { value: "2" }, { value: "", formula: "A1+B1" }]]);
  recalculate(workbook);
  assert.equal(workbook.sheets[0]?.cells[0]?.[2]?.value, "3");
  assert.equal(evaluate("=SUM(A1:B1)", ctx(workbook)), 3);
  assert.equal(evaluate("=AVERAGE(A1:B1)", ctx(workbook)), 1.5);
});

test("IF and text functions", () => {
  const workbook = book([[{ value: "hello" }]]);
  assert.equal(evaluate("=IF(1=1,\"yes\",\"no\")", ctx(workbook)), "yes");
  assert.equal(evaluate("=UPPER(A1)", ctx(workbook)), "HELLO");
  assert.equal(evaluate("=LEFT(A1,2)", ctx(workbook)), "he");
  assert.equal(evaluate("=LEN(A1)", ctx(workbook)), 5);
});

test("errors", () => {
  const workbook = book([]);
  assert.equal(formatResult(evaluate("=1/0", ctx(workbook))), "#DIV/0!");
  assert.equal(formatResult(evaluate("=NOPE()", ctx(workbook))), "#NAME?");
});

test("sheet-qualified refs", () => {
  const workbook: Workbook = {
    sheets: [
      { name: "Sheet1", cells: [[{ value: "9" }]] },
      { name: "Sheet2", cells: [[{ value: "", formula: "Sheet1!A1*2" }]] },
    ],
  };
  recalculate(workbook);
  assert.equal(workbook.sheets[1]?.cells[0]?.[0]?.value, "18");
});

test("VLOOKUP INDEX MATCH XLOOKUP TEXT", () => {
  const workbook = book([
    [{ value: "a" }, { value: "10" }],
    [{ value: "b" }, { value: "20" }],
    [{ value: "c" }, { value: "30" }],
  ]);
  assert.equal(evaluate("=VLOOKUP(\"b\",A1:B3,2)", ctx(workbook)), 20);
  assert.equal(evaluate("=INDEX(A1:B3,2,2)", ctx(workbook)), 20);
  assert.equal(evaluate("=MATCH(\"c\",A1:A3)", ctx(workbook)), 3);
  assert.equal(evaluate("=XLOOKUP(\"a\",A1:A3,B1:B3)", ctx(workbook)), 10);
  assert.equal(evaluate("=TEXT(12.3,\"0.00\")", ctx(workbook)), "12.30");
  assert.deepEqual(evaluate("=SEQUENCE(2,2,1,1)", ctx(workbook)), [1, 2, 3, 4]);
  assert.deepEqual(evaluate("=UNIQUE(A1:A3)", ctx(workbook)), ["a", "b", "c"]);
});
