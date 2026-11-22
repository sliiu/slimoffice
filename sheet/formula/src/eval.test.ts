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
  assert.equal(evaluate("=VLOOKUP(\"b\",A1:B3,2,FALSE)", ctx(workbook)), 20);
  assert.equal(evaluate("=INDEX(A1:B3,2,2)", ctx(workbook)), 20);
  assert.equal(evaluate("=MATCH(\"c\",A1:A3)", ctx(workbook)), 3);
  assert.equal(evaluate("=XLOOKUP(\"a\",A1:A3,B1:B3)", ctx(workbook)), 10);
  assert.equal(evaluate("=TEXT(12.3,\"0.00\")", ctx(workbook)), "12.30");
  assert.deepEqual(evaluate("=SEQUENCE(2,2,1,1)", ctx(workbook)), [1, 2, 3, 4]);
  assert.deepEqual(evaluate("=UNIQUE(A1:A3)", ctx(workbook)), ["a", "b", "c"]);
});

test("conditional aggregation, text search, and dates", () => {
  const workbook = book([
    [{ value: "apple" }, { value: "10" }, { value: "east" }],
    [{ value: "pear" }, { value: "20" }, { value: "west" }],
    [{ value: "apricot" }, { value: "30" }, { value: "east" }],
  ]);
  assert.equal(evaluate("=SUMIF(A1:A3,\"a*\",B1:B3)", ctx(workbook)), 40);
  assert.equal(evaluate("=COUNTIF(C1:C3,\"east\")", ctx(workbook)), 2);
  assert.equal(evaluate("=AVERAGEIF(C1:C3,\"east\",B1:B3)", ctx(workbook)), 20);
  assert.equal(evaluate("=SUMIFS(B1:B3,C1:C3,\"east\",B1:B3,\">=10\")", ctx(workbook)), 40);
  assert.equal(evaluate("=COUNTIFS(C1:C3,\"east\",B1:B3,\">15\")", ctx(workbook)), 1);
  assert.equal(formatResult(evaluate("=FIND(\"P\",\"Apple\")", ctx(workbook))), "#VALUE!");
  assert.equal(evaluate("=SEARCH(\"P\",\"Apple\")", ctx(workbook)), 2);
  assert.equal(evaluate("=SEARCH(\"?p*\",\"Apple\")", ctx(workbook)), 1);
  assert.equal(evaluate("=SUBSTITUTE(\"a-a-a\",\"a\",\"b\",2)", ctx(workbook)), "a-b-a");
  assert.equal(evaluate("=REPLACE(\"2026\",3,2,\"30\")", ctx(workbook)), "2030");
  assert.equal(evaluate("=IFS(1=0,\"no\",1=1,\"yes\")", ctx(workbook)), "yes");
  assert.equal(evaluate("=SWITCH(2,1,\"a\",2,\"b\",\"c\")", ctx(workbook)), "b");
  assert.equal(evaluate("=TEXTJOIN(\",\",TRUE,A1,\"\",A2)", ctx(workbook)), "apple,pear");
  assert.equal(evaluate("=DATEDIF(DATE(2026,1,31),DATE(2026,3,1),\"M\")", ctx(workbook)), 1);
  assert.equal(evaluate("=MONTH(EOMONTH(DATE(2026,1,31),1))", ctx(workbook)), 2);
  assert.equal(evaluate("=DAY(EDATE(DATE(2026,1,31),1))", ctx(workbook)), 28);
  assert.equal(evaluate("=SUMPRODUCT(B1:B2,B1:B2)", ctx(workbook)), 500);
  assert.equal(evaluate("=COLUMNS(A1:C3)", ctx(workbook)), 3);
  assert.equal(evaluate("=ROWS(A1:C3)", ctx(workbook)), 3);
  assert.equal(evaluate("=HLOOKUP(\"10\",A1:C2,2)", ctx(workbook)), 20);
  assert.equal(evaluate("=TEXT(1234.5,\"#,##0.00\")", ctx(workbook)), "1,234.50");
  assert.equal(evaluate("=TEXT(0.125,\"0.00%\")", ctx(workbook)), "12.50%");
  assert.equal(evaluate("=TEXT(DATE(2026,3,5),\"yyyy-mm-dd\")", ctx(workbook)), "2026-03-05");
  assert.equal(evaluate("=TEXT(-12,\"0.00;(-0.00)\")", ctx(workbook)), "(-12.00)");
  assert.equal(evaluate("=VLOOKUP(25,B1:B3,1)", ctx(workbook)), 20);
  assert.equal(evaluate("=MATCH(25,B1:B3,1)", ctx(workbook)), 2);
  assert.equal(evaluate("=SUBTOTAL(9,B1:B3)", ctx(workbook)), 60);
  assert.equal(evaluate("=NETWORKDAYS(DATE(2026,3,2),DATE(2026,3,6))", ctx(workbook)), 5);
});

test("wildcard lookups, date units, hidden rows, and finance", () => {
  const workbook: Workbook = {
    sheets: [{
      name: "Sheet1",
      hiddenRows: [2],
      cells: [
        [{ value: "Apple" }, { value: "10" }, { value: "", formula: "SUBTOTAL(9,B1:B2)" }],
        [{ value: "Apricot" }, { value: "20" }],
        [{ value: "Pear" }, { value: "30" }],
      ],
    }],
  };
  assert.equal(evaluate("=VLOOKUP(\"ap*\",A1:B3,2,FALSE)", ctx(workbook)), 10);
  assert.equal(evaluate("=VLOOKUP(25,B1:B3,1,TRUE)", ctx(workbook)), 20);
  assert.equal(evaluate("=VLOOKUP(\"pear\",A1:B3,2,FALSE)", ctx(workbook)), 30);
  assert.equal(evaluate("=MATCH(\"?ear\",A1:A3,0)", ctx(workbook)), 3);
  assert.equal(evaluate("=XLOOKUP(\"ap*\",A1:A3,B1:B3)", ctx(workbook)), 10);
  assert.equal(evaluate("=DATEDIF(DATE(2026,1,31),DATE(2026,3,1),\"MD\")", ctx(workbook)), 1);
  assert.equal(evaluate("=DATEDIF(DATE(2025,1,31),DATE(2026,3,1),\"YM\")", ctx(workbook)), 1);
  assert.equal(evaluate("=DATEDIF(DATE(2025,12,31),DATE(2026,3,1),\"YD\")", ctx(workbook)), 60);
  assert.equal(evaluate("=SUBTOTAL(109,B1:B3)", ctx(workbook)), 30);
  assert.equal(evaluate("=SUBTOTAL(9,B1:B3)", ctx(workbook)), 60);
  assert.equal(Math.round(evaluate("=PMT(0.05,2,100)", ctx(workbook)) as number), -54);
  assert.equal(Math.round(evaluate("=NPV(0.1,110)", ctx(workbook)) as number), 100);
  assert.equal(evaluate("=STDEV.P(2,4,4,4,5,5,7,9)", ctx(workbook)), 2);
  assert.equal(evaluate("=MODE(1,2,2,3)", ctx(workbook)), 2);
  assert.equal(evaluate("=PERCENTILE(B1:B3,0.5)", ctx(workbook)), 20);
  assert.equal(evaluate("=ROUND(CORREL(B1:B3,B1:B3),4)", ctx(workbook)), 1);
  assert.equal(evaluate("=FACT(5)", ctx(workbook)), 120);
  assert.equal(evaluate("=COMBIN(5,2)", ctx(workbook)), 10);
  assert.equal(evaluate("=PROPER(\"hello WORLD\")", ctx(workbook)), "Hello World");
  assert.equal(evaluate("=HOUR(TIME(13,30,0))", ctx(workbook)), 13);
  assert.equal(evaluate("=WORKDAY(DATE(2026,3,6),1)", ctx(workbook)), evaluate("=DATE(2026,3,9)", ctx(workbook)));
  assert.equal(evaluate("=YEARFRAC(DATE(2026,1,1),DATE(2026,7,1),0)", ctx(workbook)), 0.5);
  assert.equal(evaluate("=DEC2HEX(255)", ctx(workbook)), "FF");
  assert.equal(evaluate("=BIN2DEC(\"1010\")", ctx(workbook)), 10);
  assert.equal(evaluate("=CONVERT(1,\"m\",\"cm\")", ctx(workbook)), 100);
  assert.equal(evaluate("=CONVERT(0,\"C\",\"F\")", ctx(workbook)), 32);
});
