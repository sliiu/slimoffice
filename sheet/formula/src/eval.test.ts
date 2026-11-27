import assert from "node:assert/strict";
import { test } from "node:test";
import type { Workbook } from "@sliiu/sheet-core";
import { FormulaError, consolidateRanges, evaluate, formatResult, recalculate } from "./index";

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

test("whole columns and whole rows", () => {
  const workbook = book([[{ value: "1" }, { value: "4" }], [{ value: "2" }, { value: "5" }], [{ value: "3" }, { value: "6" }]]);
  // A column reference adds every number the column holds, and the order of the ends does not matter.
  assert.equal(evaluate("=SUM(A:A)", ctx(workbook)), 6);
  assert.equal(evaluate("=SUM(B:A)", ctx(workbook)), 21);
  // A row reference covers the columns the sheet holds.
  assert.equal(evaluate("=SUM(2:2)", ctx(workbook)), 7);
  assert.equal(evaluate("=SUM(Sheet1!1:1)", ctx(workbook)), 5);
  // A column letter on its own is still a name, not a column.
  assert.equal(formatResult(evaluate("=A", ctx(workbook))), "#NAME?");
});

test("R1C1 addresses count from the cell", () => {
  const workbook = book([[{ value: "1" }, { value: "2" }], [{ value: "3" }, { value: "4" }]]);
  // R1C1 is the top-left cell, wherever the formula sits.
  assert.equal(evaluate("=R1C1", ctx(workbook, 1, 1)), 1);
  // Brackets count from the cell holding the formula, here B2.
  assert.equal(evaluate("=R[-1]C[-1]", ctx(workbook, 1, 1)), 1);
  assert.equal(evaluate("=SUM(R1C1:R2C2)", ctx(workbook)), 10);
  // A relative address that leaves the sheet is a reference error.
  assert.equal(formatResult(evaluate("=R[-1]C", ctx(workbook, 0, 0))), "#REF!");
});

test("a space between ranges is their overlap", () => {
  const workbook = book([[{ value: "1" }, { value: "2" }, { value: "3" }], [{ value: "4" }, { value: "5" }, { value: "6" }], [{ value: "7" }, { value: "8" }, { value: "9" }]]);
  // The two ranges share the middle column of the first two rows.
  assert.equal(evaluate("=SUM(A1:C2 B1:B3)", ctx(workbook)), 7);
  // The shared block is the middle column of the first two rows, in order.
  assert.deepEqual(evaluate("=A1:C2 B1:B3", ctx(workbook)), [2, 5]);
  // No shared cell is a null error.
  assert.equal(formatResult(evaluate("=A1:A2 C2:C3", ctx(workbook))), "#NULL!");
});

test("operators run on every cell of a range", () => {
  const workbook = book([
    [{ value: "1" }, { value: "10" }, { value: "甲" }],
    [{ value: "2" }, { value: "0" }, { value: "乙" }],
    [{ value: "3" }, { value: "30" }, { value: "" }],
  ]);
  // A single number reaches every cell, and the result keeps the column shape.
  assert.deepEqual(evaluate("=A1:A3+1", ctx(workbook)), [2, 3, 4]);
  assert.equal(formatResult(evaluate("=-A1:A2", ctx(workbook))), "-1,-2");
  assert.equal(formatResult(evaluate("=A1:A2%", ctx(workbook))), "0.01,0.02");
  // A column against a row fills the block, one pair of cells at a time.
  workbook.sheets[0]!.cells[0]![2] = { value: "100" };
  assert.equal(formatResult(evaluate("=A1:A2+B1:C1", ctx(workbook))), "11,101,12,102");
  // A side that is neither one row nor one column leaves #N/A where it runs out.
  assert.equal(formatResult(evaluate("={1,2}+{10,20,30}", ctx(workbook))), "11,22,#N/A");
  // A zero in one cell does not sink the rest.
  assert.equal(formatResult(evaluate("=A1:A2/B1:B2", ctx(workbook))), "0.1,#DIV/0!");
  // Comparisons and joining lift the same way, so a sum can count the cells that pass.
  assert.deepEqual(evaluate("=A1:A3>2", ctx(workbook)), [false, false, true]);
  assert.equal(evaluate("=SUM(A1:A3>2)", ctx(workbook)), 1);
  assert.equal(formatResult(evaluate("=C2:C3&\"!\"", ctx(workbook))), "乙!,!");
});

test("a table column reference skips the header", () => {
  const workbook = book([[{ value: "品类" }, { value: "数量" }], [{ value: "甲" }, { value: "10" }], [{ value: "乙" }, { value: "5" }]]);
  workbook.sheets[0]!.tables = [{ id: "t1", name: "Table1", r1: 0, c1: 0, r2: 2, c2: 1, headerRow: true, columns: ["品类", "数量"] }];
  assert.equal(evaluate("=SUM(Table1[数量])", ctx(workbook)), 15);
  // The header is text, so it never enters the sum.
  assert.equal(evaluate("=COUNTA(Table1[品类])", ctx(workbook)), 2);
  assert.equal(evaluate("=Table1[没有]", ctx(workbook)) instanceof FormulaError, true);
});

test("a table reference picks the header, the totals row, or the current row", () => {
  const workbook = book([
    [{ value: "品类" }, { value: "数量" }],
    [{ value: "甲" }, { value: "10" }],
    [{ value: "乙" }, { value: "5" }],
    [{ value: "合计" }, { value: "15" }],
  ]);
  workbook.sheets[0]!.tables = [{ id: "t1", name: "Table1", r1: 0, c1: 0, r2: 3, c2: 1, headerRow: true, totalsRow: true, columns: ["品类", "数量"] }];
  // The data reference stops above the totals row, so the 15 never enters the sum.
  assert.equal(evaluate("=SUM(Table1[数量])", ctx(workbook)), 15);
  assert.equal(evaluate("=Table1[[#Headers],[数量]]", ctx(workbook)), "数量");
  assert.equal(evaluate("=Table1[[#Totals],[数量]]", ctx(workbook)), 15);
  // The current row follows the cell the formula sits in, and the short form names the same cell.
  assert.equal(evaluate("=Table1[[#This Row],[数量]]", ctx(workbook, 1, 0)), 10);
  assert.equal(evaluate("=Table1[@数量]", ctx(workbook, 2, 0)), 5);
  // A formula outside the data rows has no current row, and a table without totals has no totals row.
  assert.equal(evaluate("=Table1[[#This Row],[数量]]", ctx(workbook, 0, 0)) instanceof FormulaError, true);
  workbook.sheets[0]!.tables![0]!.totalsRow = false;
  assert.equal(evaluate("=Table1[[#Totals],[数量]]", ctx(workbook)) instanceof FormulaError, true);
});

test("a table reference covers the whole column or the whole table", () => {
  const workbook = book([
    [{ value: "品类" }, { value: "数量" }],
    [{ value: "甲" }, { value: "10" }],
    [{ value: "乙" }, { value: "5" }],
    [{ value: "合计" }, { value: "15" }],
  ]);
  workbook.sheets[0]!.tables = [{ id: "t1", name: "Table1", r1: 0, c1: 0, r2: 3, c2: 1, headerRow: true, totalsRow: true, columns: ["品类", "数量"] }];
  // #All takes the header and the totals row along with the data, so the sum counts the 15.
  assert.equal(evaluate("=SUM(Table1[[#All],[数量]])", ctx(workbook)), 30);
  // #Data on its own covers both columns and stops above the totals row.
  assert.equal(evaluate("=SUM(Table1[[#Data]])", ctx(workbook)), 15);
  assert.equal(evaluate("=COUNTA(Table1[[#Data]])", ctx(workbook)), 4);
});

test("a table reference spans from one column to another", () => {
  const workbook = book([
    [{ value: "品类" }, { value: "数量" }, { value: "单价" }],
    [{ value: "甲" }, { value: "10" }, { value: "2" }],
    [{ value: "乙" }, { value: "5" }, { value: "4" }],
  ]);
  workbook.sheets[0]!.tables = [{ id: "t1", name: "Table1", r1: 0, c1: 0, r2: 2, c2: 2, headerRow: true, columns: ["品类", "数量", "单价"] }];
  // The colon takes every column from the first named one through the second, either way around.
  assert.equal(evaluate("=SUM(Table1[[数量]:[单价]])", ctx(workbook)), 21);
  assert.equal(evaluate("=SUM(Table1[[单价]:[数量]])", ctx(workbook)), 21);
  // The text column is inside the span, so it counts too.
  assert.equal(evaluate("=COUNTA(Table1[[品类]:[数量]])", ctx(workbook)), 4);
  // The same span on the formula's own row reads one cell of each column.
  assert.equal(evaluate("=SUM(Table1[@[数量]:[单价]])", ctx(workbook, 1, 0)), 12);
  assert.equal(evaluate("=SUM(Table1[[#This Row],[数量]:[单价]])", ctx(workbook, 2, 0)), 9);
  // A column the table does not have is a reference error. A sum would swallow it into zero.
  assert.equal(evaluate("=Table1[[数量]:[没有]]", ctx(workbook)) instanceof FormulaError, true);
});

test("a table column with a space or a quote needs quotes", () => {
  const workbook = book([[{ value: "销售 额" }, { value: "a'b" }], [{ value: "10" }, { value: "5" }]]);
  workbook.sheets[0]!.tables = [{ id: "t1", name: "Table1", r1: 0, c1: 0, r2: 1, c2: 1, headerRow: true, columns: ["销售 额", "a'b"] }];
  // The quotes let the name hold a space, and a doubled quote is the quote itself.
  assert.equal(evaluate("=SUM(Table1['销售 额'])", ctx(workbook)), 10);
  assert.equal(evaluate("=SUM(Table1['a''b'])", ctx(workbook)), 5);
  // The same name reaches the current row.
  assert.equal(evaluate("=Table1[@['销售 额']]", ctx(workbook, 1, 0)), 10);
  // A quote that never closes is a reference error.
  assert.equal(evaluate("=SUM(Table1['销售 额])", ctx(workbook)) instanceof FormulaError, true);
});

test("a space between two table references keeps their overlap", () => {
  const workbook = book([
    [{ value: "品类" }, { value: "数量" }],
    [{ value: "甲" }, { value: "10" }],
    [{ value: "乙" }, { value: "5" }],
    [{ value: "合计" }, { value: "15" }],
  ]);
  workbook.sheets[0]!.tables = [{ id: "t1", name: "Table1", r1: 0, c1: 0, r2: 3, c2: 1, headerRow: true, totalsRow: true, columns: ["品类", "数量"] }];
  // The whole column and the data share only the data cells, so the header and the totals row drop out.
  assert.equal(evaluate("=SUM(Table1[[#All],[数量]] Table1[[#Data],[数量]])", ctx(workbook)), 15);
  // One data cell against the whole column leaves that one cell.
  assert.equal(evaluate("=Table1[[#This Row],[数量]] Table1[[#All],[数量]]", ctx(workbook, 1, 0)), 10);
  // Two parts of the table that share no cell are a null error. A sum would swallow it into zero.
  assert.equal(evaluate("=Table1[[#Headers],[数量]] Table1[[#Totals],[数量]]", ctx(workbook)) instanceof FormulaError, true);
});

test("a bare table name and a bare specifier cover the whole table", () => {
  const workbook = book([
    [{ value: "品类" }, { value: "数量" }],
    [{ value: "甲" }, { value: "10" }],
    [{ value: "乙" }, { value: "5" }],
    [{ value: "合计" }, { value: "15" }],
  ]);
  workbook.sheets[0]!.tables = [{ id: "t1", name: "Table1", r1: 0, c1: 0, r2: 3, c2: 1, headerRow: true, totalsRow: true, columns: ["品类", "数量"] }];
  // The name on its own is the data, so the header and the totals row stay out.
  assert.equal(evaluate("=SUM(Table1)", ctx(workbook)), 15);
  assert.equal(evaluate("=COUNTA(Table1)", ctx(workbook)), 4);
  // A specifier without a column names every column of that one row.
  assert.equal(evaluate("=COUNTA(Table1[[#Headers]])", ctx(workbook)), 2);
  assert.equal(evaluate("=SUM(Table1[[#Totals]])", ctx(workbook)), 15);
  assert.equal(evaluate("=SUM(Table1[[#This Row]])", ctx(workbook, 1, 0)), 10);
  assert.equal(evaluate("=SUM(Table1[@])", ctx(workbook, 2, 0)), 5);
  // A defined name still wins when no table has it, and a name nothing owns stays a name.
  workbook.names = [{ name: "Rate", refersTo: "=2" }];
  assert.equal(evaluate("=Rate*3", ctx(workbook)), 6);
  assert.equal(evaluate("=ISREF(Missing)", ctx(workbook)), false);
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

test("COUNTIF compares dates written as text", () => {
  const workbook = book([[{ value: "2026-01-10" }], [{ value: "2026-01-31" }], [{ value: "2026-02-01" }], [{ value: "甲" }]]);
  // The criterion is a date, so later dates count and the text does not.
  assert.equal(evaluate("=COUNTIF(A1:A4,\">2026-01-15\")", ctx(workbook)), 2);
  assert.equal(evaluate("=COUNTIF(A1:A4,\">=\"&A2)", ctx(workbook)), 2);
  assert.equal(evaluate("=SUMIF(A1:A4,\"<2026-02-01\",A1:A4)", ctx(workbook)), evaluate("=A1+A2", ctx(workbook)));
});

test("a time written as text works in the time functions", () => {
  const workbook = book([[{ value: "2026-01-31 13:30" }], [{ value: "13:30:05" }]]);
  // The date and the clock both come back, and a bare time is a fraction of a day.
  assert.equal(evaluate("=YEAR(A1)", ctx(workbook)), 2026);
  assert.equal(evaluate("=HOUR(A1)", ctx(workbook)), 13);
  assert.equal(evaluate("=MINUTE(A1)", ctx(workbook)), 30);
  assert.equal(evaluate("=SECOND(A2)", ctx(workbook)), 5);
  assert.equal(evaluate("=TIMEVALUE(\"13:30\")", ctx(workbook)), evaluate("=TIME(13,30,0)", ctx(workbook)));
  // An hour past 23 is not a time.
  assert.equal(formatResult(evaluate("=TIMEVALUE(\"25:00\")", ctx(workbook))), "#VALUE!");
});

test("a date written as text works in the date functions", () => {
  const workbook = book([[{ value: "2026-01-31" }], [{ value: "2026/3/1" }]]);
  // The text is read as a date, so the parts come back and the two cells subtract.
  assert.equal(evaluate("=YEAR(A1)", ctx(workbook)), 2026);
  assert.equal(evaluate("=MONTH(A1)", ctx(workbook)), 1);
  assert.equal(evaluate("=DAY(A2)", ctx(workbook)), 1);
  assert.equal(evaluate("=A2-A1", ctx(workbook)), 29);
  assert.equal(evaluate("=DATEVALUE(\"2026/1/31\")", ctx(workbook)), evaluate("=DATE(2026,1,31)", ctx(workbook)));
  // A day the calendar does not have is rejected.
  assert.equal(formatResult(evaluate("=DATEVALUE(\"2026-02-31\")", ctx(workbook))), "#VALUE!");
});

test("a grouped, percent, or parenthesized number adds as a number", () => {
  const workbook = book([[{ value: "1,000" }], [{ value: "12%" }], [{ value: "(500)" }], [{ value: "甲" }]]);
  // The comma is a thousands separator, the percent scales down, and the parentheses mark a negative.
  assert.equal(evaluate("=SUM(A1:A4)", ctx(workbook)), 500.12);
  assert.equal(evaluate("=A1+1", ctx(workbook)), 1001);
  assert.equal(evaluate("=A2*100", ctx(workbook)), 12);
  // Text that only looks grouped stays text, so it never enters the sum.
  assert.equal(evaluate("=SUM(A4)", ctx(workbook)), 0);
  assert.equal(formatResult(evaluate("=VALUE(\"1,000\")", ctx(workbook))), "#VALUE!");
});

test("INDIRECT reads a column, a row, and an R1C1 address", () => {
  const workbook = book([
    [{ value: "1" }, { value: "10" }],
    [{ value: "2" }, { value: "20" }],
    [{ value: "3" }, { value: "30" }],
  ]);
  // A column letter covers the rows the sheet holds, and a row number covers its columns.
  assert.equal(evaluate("=SUM(INDIRECT(\"A:A\"))", ctx(workbook)), 6);
  assert.equal(evaluate("=SUM(INDIRECT(\"2:2\"))", ctx(workbook)), 22);
  // FALSE switches the text to R1C1, counted from the cell holding the formula.
  assert.equal(evaluate("=INDIRECT(\"R1C2\",FALSE)", ctx(workbook, 2, 2)), 10);
  assert.equal(evaluate("=INDIRECT(\"R[-1]C[-1]\",FALSE)", ctx(workbook, 2, 2)), 20);
  assert.equal(evaluate("=SUM(INDIRECT(\"R1C1:R2C2\",FALSE))", ctx(workbook)), 33);
  // Text that names nothing is a reference error.
  assert.equal(formatResult(evaluate("=INDIRECT(\"Nope\")", ctx(workbook))), "#REF!");
});

test("a comma joins ranges into one union", () => {
  const workbook = book([
    [{ value: "1" }, { value: "10" }],
    [{ value: "2" }, { value: "20" }],
    [{ value: "3" }, { value: "30" }],
  ]);
  // The comma adds both ranges, and a cell that sits in both is counted once.
  assert.equal(evaluate("=SUM((A1:A2,B1))", ctx(workbook)), 13);
  assert.equal(evaluate("=SUM((A1:A2,A2:A3))", ctx(workbook)), 6);
  // AREAS counts the ranges, and INDEX picks one of them by its fourth argument.
  assert.equal(evaluate("=AREAS((A1:A2,B1,A1:B3))", ctx(workbook)), 3);
  assert.equal(evaluate("=INDEX((A1:A2,B1),1,1,2)", ctx(workbook)), 10);
  assert.equal(evaluate("=SUM(INDEX((A1:A2,B1:B2),0,1,2))", ctx(workbook)), 30);
  // A pick past the last range is a reference error, and a bare range is one area.
  assert.equal(formatResult(evaluate("=INDEX((A1,B1),1,1,3)", ctx(workbook))), "#REF!");
  assert.equal(evaluate("=AREAS(A1:B3)", ctx(workbook)), 1);
});

test("ROW and COLUMN list every row and column of a range", () => {
  const workbook = book([[{ value: "1" }, { value: "2" }], [{ value: "3" }, { value: "4" }], [{ value: "5" }, { value: "6" }]]);
  // A column range lists its row numbers from top to bottom, so a sum adds them.
  assert.deepEqual(evaluate("=ROW(A2:A4)", ctx(workbook)), [2, 3, 4]);
  assert.equal(evaluate("=SUM(ROW(A1:A3))", ctx(workbook)), 6);
  // A row range lists its column numbers from left to right.
  assert.deepEqual(evaluate("=COLUMN(A1:C1)", ctx(workbook)), [1, 2, 3]);
  // A single cell is still one number, and no argument counts from the cell holding the formula.
  assert.equal(evaluate("=ROW(B2)", ctx(workbook, 4, 4)), 2);
  assert.equal(evaluate("=COLUMN()", ctx(workbook, 4, 3)), 4);
});

test("INDEX with a zero returns the whole row or column", () => {
  const workbook = book([
    [{ value: "1" }, { value: "10" }],
    [{ value: "2" }, { value: "20" }],
    [{ value: "3" }, { value: "30" }],
  ]);
  // Zero in the row slot returns every row of that column, so a sum sees all three.
  assert.equal(evaluate("=SUM(INDEX(A1:B3,0,2))", ctx(workbook)), 60);
  assert.deepEqual(evaluate("=INDEX(A1:B3,0,2)", ctx(workbook)), [10, 20, 30]);
  // Zero in the column slot returns the whole row, in order.
  assert.deepEqual(evaluate("=INDEX(A1:B3,2,0)", ctx(workbook)), [2, 20]);
  // A plain row and column still returns the one cell.
  assert.equal(evaluate("=INDEX(A1:B3,2,2)", ctx(workbook)), 20);
  // A row past the range is a reference error.
  assert.equal(formatResult(evaluate("=INDEX(A1:B3,4,1)", ctx(workbook))), "#REF!");
});

test("an array result spills into the cells beside it", () => {
  const workbook = book([[{ value: "1" }, { value: "", formula: "{10,20;30,40}" }], [{ value: "2" }, { value: "" }]]);
  recalculate(workbook);
  const cells = workbook.sheets[0]!.cells;
  // The anchor keeps the formula and the first value. The rest land in the cells below and to the right.
  assert.equal(cells[0]?.[1]?.value, "10");
  assert.equal(cells[0]?.[1]?.formula, "{10,20;30,40}");
  assert.equal(cells[0]?.[1]?.spillRef, "B1:C2");
  assert.equal(cells[0]?.[2]?.value, "20");
  assert.equal(cells[1]?.[1]?.value, "30");
  assert.equal(cells[1]?.[2]?.value, "40");
  assert.equal(cells[1]?.[2]?.spill, "B1");
  // A spilled cell points back at the formula, so a later formula can read it.
  cells[2] = [{ value: "", formula: "B2+C2" }];
  recalculate(workbook);
  assert.equal(cells[2]?.[0]?.value, "70");
  // A value already sitting in the way blocks the whole spill, and nothing else is written.
  cells[1]![2] = { value: "占用" };
  recalculate(workbook);
  assert.equal(cells[0]?.[1]?.value, "#SPILL!");
  assert.equal(cells[0]?.[2]?.value, "");
  // Clearing the blocker lets the result spill again.
  cells[1]![2] = { value: "" };
  recalculate(workbook);
  assert.equal(cells[1]?.[2]?.value, "40");
});

test("scalar functions run on every cell of a range", () => {
  const workbook = book([
    [{ value: "-2" }, { value: "甲" }],
    [{ value: "5" }, { value: "乙" }],
    [{ value: "1" }, { value: "丙" }],
  ]);
  // ABS and IF each return one result per cell, so SUM sees all of them.
  assert.equal(evaluate("=SUM(ABS(A1:A3))", ctx(workbook)), 8);
  assert.equal(evaluate("=SUM(IF(A1:A3>2,A1:A3,0))", ctx(workbook)), 5);
  assert.equal(formatResult(evaluate("=UPPER(B1:B2)", ctx(workbook))), "甲,乙");
  assert.equal(formatResult(evaluate("=ROUND(A1:A2,0)", ctx(workbook))), "-2,5");
  // A digit list that is shorter than the values leaves #N/A where it runs out.
  assert.equal(formatResult(evaluate("=ROUND({1.26,2.24,3.14},{1,2})", ctx(workbook))), "1.3,2.24,#N/A");
  // IFERROR still catches a per-cell error instead of passing it through.
  assert.equal(formatResult(evaluate("=IFERROR(A1:A2/A2:A3,0)", ctx(workbook))), "-0.4,5");
  // A function that reads the whole range does not split it into cells.
  assert.equal(evaluate("=SUM(A1:A3)", ctx(workbook)), 4);
  assert.equal(evaluate("=MATCH(\"-2\",A1:A3,0)", ctx(workbook)), 1);
});

test("a 3D reference stacks the same cells across sheets", () => {
  const workbook: Workbook = {
    sheets: [
      { name: "Q1", cells: [[{ value: "1" }, { value: "10" }]] },
      { name: "Notes", cells: [[{ value: "100" }, { value: "1" }]] },
      { name: "Q3", cells: [[{ value: "4" }, { value: "40" }]] },
    ],
  };
  // Notes sits between the two named sheets, so its cell is included. Reversing the names does not drop it.
  assert.equal(evaluate("=SUM(Q1:Q3!A1)", ctx(workbook)), 105);
  assert.equal(evaluate("=SUM(Q3:Q1!A1)", ctx(workbook)), 105);
  assert.equal(evaluate("=MIN(Q1:Q3!A1)", ctx(workbook)), 1);
  assert.equal(evaluate("=SUM('Q1':'Q3'!A1:B1)", ctx(workbook)), 156);
  // One sheet is just that sheet.
  assert.equal(evaluate("=SUM(Q1:Q1!B1)", ctx(workbook)), 10);
  // A sheet that is not in the workbook is a reference error.
  assert.equal(evaluate("=Q1:Nope!A1", ctx(workbook)) instanceof FormulaError, true);
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

test("consolidates ranges by position, by label, and with links", () => {
  const workbook: Workbook = {
    sheets: [
      { name: "一月", cells: [[{ value: "甲" }, { value: "10" }], [{ value: "乙" }, { value: "4" }]] },
      { name: "二月", cells: [[{ value: "乙" }, { value: "6" }], [{ value: "甲" }, { value: "3" }]] },
      { name: "汇总", cells: [] },
    ],
  };
  const byPosition = consolidateRanges(workbook, {
    sources: ["一月!A1:B2", "二月!A1:B2"],
    dest: "汇总!A1",
  });
  assert.equal(workbook.sheets[2]?.cells[0]?.[1]?.value, "16");
  assert.equal(workbook.sheets[2]?.cells[1]?.[1]?.value, "7");
  assert.deepEqual(byPosition.sources, ["一月!A1:B2", "二月!A1:B2"]);
  workbook.sheets[2]!.cells = [];
  consolidateRanges(workbook, {
    func: "sum",
    sources: ["一月!A1:B2", "二月!A1:B2"],
    dest: "汇总!A1",
    leftCol: true,
    links: true,
  });
  assert.equal(workbook.sheets[2]?.cells[0]?.[0]?.value, "甲");
  assert.equal(workbook.sheets[2]?.cells[0]?.[1]?.value, "13");
  assert.equal(workbook.sheets[2]?.cells[0]?.[1]?.formula, "SUM('一月'!B1,'二月'!B2)");
  assert.equal(workbook.sheets[2]?.cells[1]?.[0]?.value, "乙");
  assert.equal(workbook.sheets[2]?.cells[1]?.[1]?.value, "10");
  assert.equal(workbook.sheets[2]?.consolidation?.func, "sum");
  assert.equal(evaluate("='一月'!A1", ctx(workbook)), "甲");
  const averaged = consolidateRanges(workbook, {
    func: "average",
    sources: ["一月!B1:B2", "二月!B1:B2"],
    dest: "汇总!D1",
  });
  assert.equal(workbook.sheets[2]?.cells[0]?.[3]?.value, "8");
  assert.equal(averaged.rows, 2);
});

test("lookup references shift, resize, and read back", () => {
  const workbook: Workbook = {
    sheets: [
      { name: "Sheet1", cells: [[{ value: "1" }, { value: "2" }], [{ value: "3" }, { value: "4" }]] },
      { name: "二月", cells: [[{ value: "合计" }]] },
    ],
  };
  assert.equal(evaluate("=OFFSET(A1,1,1)", ctx(workbook)), 4);
  assert.equal(evaluate("=SUM(OFFSET(A1,0,0,2,1))", ctx(workbook)), 4);
  assert.equal(evaluate("=OFFSET(A1,-1,0)", ctx(workbook)).toString(), "#REF!");
  assert.equal(evaluate("=INDIRECT(\"B2\")", ctx(workbook)), 4);
  assert.equal(evaluate("=INDIRECT(\"'二月'!A1\")", ctx(workbook)), "合计");
  assert.equal(evaluate("=ADDRESS(2,2)", ctx(workbook)), "$B$2");
  assert.equal(evaluate("=ADDRESS(2,2,4,1,\"二月\")", ctx(workbook)), "'二月'!B2");
  assert.equal(evaluate("=CHOOSE(2,\"甲\",\"乙\",\"丙\")", ctx(workbook)), "乙");
  assert.equal(formatResult(evaluate("=TRANSPOSE(A1:B2)", ctx(workbook))), "1,3,2,4");
  assert.equal(evaluate("=ROWS(OFFSET(A1,0,0,2,2))", ctx(workbook)), 2);
  assert.equal(evaluate("=COLUMNS(A1:B2)", ctx(workbook)), 2);
  assert.equal(evaluate("=ROW(B2)", ctx(workbook, 4, 4)), 2);
  assert.equal(evaluate("=COLUMN()", ctx(workbook, 4, 3)), 4);
});

test("conditional extremes, information, rounding, and week numbers", () => {
  const workbook = book([[{ value: "甲" }, { value: "5" }], [{ value: "乙" }, { value: "9" }], [{ value: "甲" }, { value: "2" }]]);
  assert.equal(evaluate("=MAXIFS(B1:B3,A1:A3,\"甲\")", ctx(workbook)), 5);
  assert.equal(evaluate("=MINIFS(B1:B3,A1:A3,\"甲\")", ctx(workbook)), 2);
  assert.equal(evaluate("=XOR(TRUE,FALSE,TRUE)", ctx(workbook)), false);
  assert.equal(evaluate("=XOR(TRUE,FALSE)", ctx(workbook)), true);
  assert.equal(evaluate("=ISERROR(1/0)", ctx(workbook)), true);
  assert.equal(evaluate("=ISERR(NA())", ctx(workbook)), false);
  assert.equal(evaluate("=ISNA(NA())", ctx(workbook)), true);
  assert.equal(evaluate("=ISEVEN(4)", ctx(workbook)), true);
  assert.equal(evaluate("=ISODD(-3)", ctx(workbook)), true);
  assert.equal(evaluate("=N(\"甲\")", ctx(workbook)), 0);
  assert.equal(evaluate("=T(1)", ctx(workbook)), "");
  assert.equal(evaluate("=TYPE(\"甲\")", ctx(workbook)), 2);
  assert.equal(evaluate("=TRUNC(-8.9)", ctx(workbook)), -8);
  assert.equal(evaluate("=MROUND(10,3)", ctx(workbook)), 9);
  assert.equal(evaluate("=QUOTIENT(5,2)", ctx(workbook)), 2);
  assert.equal(evaluate("=GCD(12,18)", ctx(workbook)), 6);
  assert.equal(evaluate("=LCM(4,6)", ctx(workbook)), 12);
  assert.equal(evaluate("=SUMSQ(3,4)", ctx(workbook)), 25);
  assert.equal(evaluate("=EVEN(-3)", ctx(workbook)), -4);
  assert.equal(evaluate("=ODD(4)", ctx(workbook)), 5);
  assert.equal(formatResult(evaluate("=TEXTSPLIT(\"甲,乙;丙\",\",\",\";\")", ctx(workbook))), "甲,乙,丙,");
  assert.equal(evaluate("=LOOKUP(6,B1:B3)", ctx(workbook)), 5);
  assert.equal(evaluate("=XMATCH(\"乙\",A1:A3)", ctx(workbook)), 2);
  assert.equal(evaluate("=WEEKNUM(DATE(2026,1,1))", ctx(workbook)), 1);
  assert.equal(evaluate("=ISOWEEKNUM(DATE(2026,1,1))", ctx(workbook)), 1);
  const random = evaluate("=RANDBETWEEN(1,1)", ctx(workbook));
  assert.equal(random, 1);
});

test("array constants, database functions, lambda, and forecasting", () => {
  const workbook = book([
    [{ value: "品类" }, { value: "金额" }],
    [{ value: "甲" }, { value: "10" }],
    [{ value: "乙" }, { value: "4" }],
    [{ value: "甲" }, { value: "6" }],
  ]);
  assert.equal(formatResult(evaluate("={1,2;3,4}", ctx(workbook))), "1,2,3,4");
  assert.equal(evaluate("=SUM({1,2;3,4})", ctx(workbook)), 10);
  assert.equal(evaluate("=DSUM(A1:B4,\"金额\",A1:A2)", ctx(workbook)), 16);
  assert.equal(evaluate("=DCOUNT(A1:B4,\"金额\",A1:A2)", ctx(workbook)), 2);
  assert.equal(evaluate("=DAVERAGE(A1:B4,2,A1:A2)", ctx(workbook)), 8);
  assert.equal(evaluate("=DMAX(A1:B4,\"金额\",A1:A2)", ctx(workbook)), 10);
  assert.equal(evaluate("=DMIN(A1:B4,\"金额\",A1:A2)", ctx(workbook)), 6);
  assert.equal(evaluate("=LAMBDA(x,x*2)(3)", ctx(workbook)), 6);
  assert.equal(evaluate("=LAMBDA(x,[y],IF(ISOMITTED(y),x,y))(5)", ctx(workbook)), 5);
  assert.equal(evaluate("=LAMBDA(x,[y],IF(ISOMITTED(y),x,y))(5,9)", ctx(workbook)), 9);
  assert.equal(formatResult(evaluate("=LAMBDA(x,[y],x)()", ctx(workbook))), "#VALUE!");
  assert.equal(evaluate("=LET(x,2,y,x+3,y*x)", ctx(workbook)), 10);
  assert.equal(formatResult(evaluate("=SORTBY({3;1;2},{1;3;2})", ctx(workbook))), "3,2,1");
  assert.equal(formatResult(evaluate("=HSTACK({1;2},{3;4})", ctx(workbook))), "1,3,2,4");
  assert.equal(formatResult(evaluate("=VSTACK({1,2},{3,4})", ctx(workbook))), "1,2,3,4");
  assert.equal(evaluate("=DAYS360(DATE(2026,1,1),DATE(2026,3,1))", ctx(workbook)), 60);
  assert.equal(formatResult(evaluate("=MMULT({1,2;3,4},{5,6;7,8})", ctx(workbook))), "19,22,43,50");
  assert.equal(evaluate("=FORECAST(3,{2,4,6},{1,2,3})", ctx(workbook)), 6);
  assert.equal(formatResult(evaluate("=MAKEARRAY(2,2,LAMBDA(r,c,r*10+c))", ctx(workbook))), "11,12,21,22");
  assert.equal(formatResult(evaluate("=MAP({1,2,3},LAMBDA(x,x*2))", ctx(workbook))), "2,4,6");
  const rate = evaluate("=XIRR({-100,110},{46023;46388})", ctx(workbook));
  assert.ok(typeof rate === "number" && Math.abs(rate - 0.1) < 1e-4);
});

test("workday calendars, depreciation, regression, and array folds", () => {
  const workbook = book([]);
  assert.equal(evaluate("=DAYS(DATE(2026,1,11),DATE(2026,1,1))", ctx(workbook)), 10);
  assert.equal(evaluate("=WORKDAY.INTL(DATE(2026,1,1),1,11)", ctx(workbook)), evaluate("=DATE(2026,1,2)", ctx(workbook)));
  assert.equal(evaluate("=NETWORKDAYS.INTL(DATE(2026,1,1),DATE(2026,1,7),11)", ctx(workbook)), 6);
  assert.equal(evaluate("=COUPDAYS(DATE(2026,1,15),DATE(2028,1,15),2)", ctx(workbook)), 181);
  assert.equal(evaluate("=COUPNUM(DATE(2026,1,15),DATE(2028,1,15),2)", ctx(workbook)), 4);
  assert.equal(evaluate("=SLN(1000,100,5)", ctx(workbook)), 180);
  assert.equal(evaluate("=SYD(1000,100,5,1)", ctx(workbook)), 300);
  assert.equal(Math.round(evaluate("=DB(1000,100,5,1)", ctx(workbook)) as number), 369);
  assert.equal(evaluate("=DDB(1000,100,5,1)", ctx(workbook)), 400);
  assert.equal(Math.round(evaluate("=EFFECT(0.1,2)", ctx(workbook)) as number * 1e6) / 1e6, 0.1025);
  assert.equal(evaluate("=ROUND(NOMINAL(0.1025,2),4)", ctx(workbook)), 0.1);
  assert.equal(evaluate("=SLOPE({2,4,6},{1,2,3})", ctx(workbook)), 2);
  assert.equal(evaluate("=INTERCEPT({2,4,6},{1,2,3})", ctx(workbook)), 0);
  assert.equal(evaluate("=RSQ({2,4,6},{1,2,3})", ctx(workbook)), 1);
  assert.equal(evaluate("=STEYX({2,4,6},{1,2,3})", ctx(workbook)), 0);
  assert.equal(Math.round(evaluate("=NORM.S.DIST(0,TRUE)", ctx(workbook)) as number * 100) / 100, 0.5);
  assert.equal(Math.round(evaluate("=NORM.INV(0.5,10,2)", ctx(workbook)) as number), 10);
  assert.equal(evaluate("=REDUCE(0,{1,2,3,4},LAMBDA(a,b,a+b))", ctx(workbook)), 10);
  assert.equal(formatResult(evaluate("=SCAN(0,{1,2,3},LAMBDA(a,b,a+b))", ctx(workbook))), "0,1,3,6");
  assert.equal(formatResult(evaluate("=BYROW({1,2;3,4},LAMBDA(r,SUM(r)))", ctx(workbook))), "3,7");
  assert.equal(formatResult(evaluate("=BYCOL({1,2;3,4},LAMBDA(c,SUM(c)))", ctx(workbook))), "4,6");
});

test("array shaping, statistics, finance extras, and text", () => {
  const workbook = book([
    [{ value: "品类" }, { value: "金额" }],
    [{ value: "甲" }, { value: "2" }],
    [{ value: "乙" }, { value: "4" }],
    [{ value: "甲" }, { value: "8" }],
  ]);
  assert.equal(formatResult(evaluate("=TAKE({1,2;3,4;5,6},2)", ctx(workbook))), "1,2,3,4");
  assert.equal(formatResult(evaluate("=DROP({1,2;3,4;5,6},1)", ctx(workbook))), "3,4,5,6");
  assert.equal(formatResult(evaluate("=CHOOSECOLS({1,2,3;4,5,6},3,1)", ctx(workbook))), "3,1,6,4");
  assert.equal(formatResult(evaluate("=CHOOSEROWS({1,2;3,4;5,6},-1)", ctx(workbook))), "5,6");
  assert.equal(formatResult(evaluate("=TOCOL({1,2;3,4})", ctx(workbook))), "1,2,3,4");
  assert.equal(formatResult(evaluate("=TOROW({1,2;3,4},1)", ctx(workbook))), "1,3,2,4");
  assert.equal(formatResult(evaluate("=WRAPROWS({1,2,3,4},2)", ctx(workbook))), "1,2,3,4");
  assert.equal(formatResult(evaluate("=EXPAND({1,2},2,2,0)", ctx(workbook))), "1,2,0,0");
  assert.equal(evaluate("=DCOUNTA(A1:B4,\"金额\",A1:A2)", ctx(workbook)), 2);
  assert.equal(evaluate("=DPRODUCT(A1:B4,\"金额\",A1:A2)", ctx(workbook)), 16);
  assert.equal(evaluate("=DGET(A1:B4,\"金额\",{\"品类\";\"乙\"})", ctx(workbook)), 4);
  assert.equal(evaluate("=ROUND(GEOMEAN(1,3,9),4)", ctx(workbook)), 3);
  assert.equal(evaluate("=HARMEAN(1,2,4)", ctx(workbook)), 12 / 7);
  assert.equal(evaluate("=PERMUT(5,2)", ctx(workbook)), 20);
  assert.equal(formatResult(evaluate("=FREQUENCY({1,2,3,4},{2,4})", ctx(workbook))), "2,2,0");
  assert.equal(evaluate("=ROUND(CUMPRINC(0.1,2,100,1,2,0),2)", ctx(workbook)), -100);
  assert.equal(evaluate("=ROUND(RRI(2,100,121),4)", ctx(workbook)), 0.1);
  assert.equal(Math.round(evaluate("=PDURATION(0.1,100,121)", ctx(workbook)) as number * 1e6) / 1e6, 2);
  assert.equal(evaluate("=NUMBERVALUE(\"1.234,5\",\",\",\".\")", ctx(workbook)), 1234.5);
  assert.equal(evaluate("=FIXED(1234.5,2)", ctx(workbook)), "1,234.50");
  assert.equal(evaluate("=DOLLAR(12,2)", ctx(workbook)), "$12.00");
  assert.equal(evaluate("=UNICODE(\"甲\")", ctx(workbook)), 0x7532);
  assert.equal(evaluate("=UNICHAR(30002)", ctx(workbook)), "甲");
  assert.equal(evaluate('=CLEAN("a"&CHAR(10)&"b")', ctx(workbook)), "ab");
  assert.equal(evaluate("=ASC(\"Ａ\")", ctx(workbook)), "A");
});

test("trend lines, distributions, information, and date counts", () => {
  const workbook = book([
    [{ value: "品类" }, { value: "金额" }],
    [{ value: "甲" }, { value: "2" }],
    [{ value: "乙" }, { value: "4" }],
    [{ value: "甲" }, { value: "8", formula: "B2+6" }],
  ]);
  assert.equal(formatResult(evaluate("=TREND({2,4,6},{1,2,3},{4})", ctx(workbook))), "8");
  assert.equal(evaluate("=ROUND(GROWTH({2,4,8},{1,2,3},4),4)", ctx(workbook)), 16);
  assert.equal(formatResult(evaluate("=LINEST({2,4,6},{1,2,3})", ctx(workbook))), "2,0");
  assert.equal(evaluate("=ROUND(INDEX(LOGEST({2,4,8},{1,2,3}),1),4)", ctx(workbook)), 2);
  assert.equal(evaluate("=ROUND(FVSCHEDULE(100,{0.1,0.1}),4)", ctx(workbook)), 121);
  assert.equal(evaluate("=ROUND(ISPMT(0.1,1,2,100),2)", ctx(workbook)), -5);
  assert.equal(evaluate("=COUPDAYBS(DATE(2026,1,15),DATE(2028,1,15),2)", ctx(workbook)), 0);
  assert.equal(Math.round(evaluate("=BINOM.DIST(2,4,0.5,FALSE)", ctx(workbook)) as number * 16), 6);
  assert.equal(Math.round(evaluate("=POISSON.DIST(0,1,FALSE)", ctx(workbook)) as number * 1000) / 1000, 0.368);
  assert.equal(evaluate("=ROUND(EXPON.DIST(0,1,TRUE),4)", ctx(workbook)), 0);
  assert.equal(evaluate("=ROUND(CONFIDENCE.NORM(0.05,1,100),4)", ctx(workbook)), 0.196);
  assert.equal(evaluate("=ROUND(ERF(0),4)", ctx(workbook)), 0);
  assert.equal(evaluate("=ROUND(ERFC(0),4)", ctx(workbook)), 1);
  assert.equal(evaluate("=SUMX2MY2({2,3},{1,1})", ctx(workbook)), 11);
  assert.equal(evaluate("=SUMX2PY2({2,3},{1,1})", ctx(workbook)), 15);
  assert.equal(evaluate("=SUMXMY2({2,3},{1,1})", ctx(workbook)), 5);
  assert.equal(evaluate("=MULTINOMIAL(2,1)", ctx(workbook)), 3);
  assert.equal(evaluate("=ROUND(SQRTPI(1),4)", ctx(workbook)), 1.7725);
  assert.equal(evaluate("=TIMEVALUE(\"12:00:00\")", ctx(workbook)), 0.5);
  assert.equal(evaluate("=ISLOGICAL(TRUE)", ctx(workbook)), true);
  assert.equal(evaluate("=ISNONTEXT(1)", ctx(workbook)), true);
  assert.equal(evaluate("=ISFORMULA(B4)", ctx(workbook)), true);
  assert.equal(evaluate("=ISFORMULA(A1)", ctx(workbook)), false);
  assert.equal(evaluate("=ERROR.TYPE(1/0)", ctx(workbook)), 2);
  assert.equal(evaluate("=DSTDEVP(A1:B4,2,A1:A2)", ctx(workbook)), 3);
  assert.equal(evaluate("=DVARP(A1:B4,2,A1:A2)", ctx(workbook)), 9);
});

test("matrix algebra, bases, bits, and the wider catalog", () => {
  const workbook = book([[{ value: "1" }, { value: "", formula: "A1*2" }]]);
  assert.equal(evaluate("=MDETERM({1,2;3,4})", ctx(workbook)), -2);
  assert.equal(formatResult(evaluate("=MINVERSE({4,7;2,6})", ctx(workbook))), "0.6,-0.7,-0.2,0.4");
  assert.equal(evaluate("=ROUND(MIRR({-100,0,121},0.1,0.1),4)", ctx(workbook)), 0.1);
  assert.equal(evaluate("=ROUND(XNPV(0.1,{100,110},{46023,46388}),2)", ctx(workbook)), 200);
  assert.equal(evaluate("=FORMULATEXT(B1)", ctx(workbook)), "=A1*2");
  assert.equal(evaluate("=ISREF(A1)", ctx(workbook)), true);
  assert.equal(evaluate("=SHEET()", ctx(workbook)), 1);
  assert.equal(evaluate("=SHEETS()", ctx(workbook)), 1);
  assert.equal(evaluate("=HYPERLINK(\"https://example.com\",\"例子\")", ctx(workbook)), "例子");
  assert.equal(evaluate("=AVERAGEA(2,\"甲\",4)", ctx(workbook)), 2);
  assert.equal(evaluate("=COVARIANCE.P({1,2,3},{2,4,6})", ctx(workbook)), 4 / 3);
  assert.equal(evaluate("=RANK.EQ(2,{3,1,2})", ctx(workbook)), 2);
  assert.equal(evaluate("=RANK.AVG(2,{3,2,2})", ctx(workbook)), 2.5);
  assert.equal(evaluate("=STANDARDIZE(12,10,2)", ctx(workbook)), 1);
  assert.equal(evaluate("=ROUND(FISHER(0),4)", ctx(workbook)), 0);
  assert.equal(evaluate("=COMBINA(4,2)", ctx(workbook)), 10);
  assert.equal(evaluate("=FACTDOUBLE(5)", ctx(workbook)), 15);
  assert.equal(evaluate("=CEILING.MATH(-4.2,1)", ctx(workbook)), -4);
  assert.equal(evaluate("=BASE(255,16)", ctx(workbook)), "FF");
  assert.equal(evaluate("=DECIMAL(\"FF\",16)", ctx(workbook)), 255);
  assert.equal(evaluate("=ROMAN(14)", ctx(workbook)), "XIV");
  assert.equal(evaluate("=ARABIC(\"XIV\")", ctx(workbook)), 14);
  assert.equal(evaluate("=BITAND(13,7)", ctx(workbook)), 5);
  assert.equal(evaluate("=BITLSHIFT(3,2)", ctx(workbook)), 12);
  assert.equal(evaluate("=ROUND(SINH(0),4)", ctx(workbook)), 0);
  assert.equal(evaluate("=ROUND(GAMMA(5),4)", ctx(workbook)), 24);
  assert.equal(evaluate("=COUPDAYSNC(DATE(2026,1,15),DATE(2028,1,15),2)", ctx(workbook)), 181);
  assert.equal(evaluate("=DOLLARDE(1.02,16)", ctx(workbook)), 1.125);
  assert.equal(evaluate("=DELTA(3,3)", ctx(workbook)), 1);
  assert.equal(evaluate("=GESTEP(3,4)", ctx(workbook)), 0);
  assert.equal(evaluate("=AGGREGATE(9,0,{1,2,3})", ctx(workbook)), 6);
  assert.equal(Math.abs(evaluate("=NORM.S.INV(0.5)", ctx(workbook)) as number) < 1e-6, true);
});

test("distributions, complex numbers, and the remaining conversions", () => {
  const workbook = book([[{ value: "1" }]]);
  assert.equal(evaluate("=BIN2HEX(\"1010\")", ctx(workbook)), "A");
  assert.equal(evaluate("=HEX2BIN(\"A\")", ctx(workbook)), "1010");
  assert.equal(evaluate("=OCT2HEX(10)", ctx(workbook)), "8");
  assert.equal(evaluate("=ROUND(ACOT(1),4)", ctx(workbook)), 0.7854);
  assert.equal(evaluate("=ROUND(SECH(0),4)", ctx(workbook)), 1);
  assert.equal(evaluate("=ROUND(BESSELJ(1,0),4)", ctx(workbook)), 0.7652);
  assert.equal(evaluate("=ROUND(BESSELI(1,0),4)", ctx(workbook)), 1.2661);
  assert.equal(evaluate("=ROUND(BESSELY(1,0),4)", ctx(workbook)), 0.0883);
  assert.equal(evaluate("=ROUND(BESSELK(1,0),4)", ctx(workbook)), 0.421);
  assert.equal(evaluate("=COMPLEX(3,4)", ctx(workbook)), "3+4i");
  assert.equal(evaluate("=IMABS(\"3+4i\")", ctx(workbook)), 5);
  assert.equal(evaluate("=IMSUM(\"1+2i\",\"3+4i\")", ctx(workbook)), "4+6i");
  assert.equal(evaluate("=IMPRODUCT(\"1+2i\",\"3+4i\")", ctx(workbook)), "-5+10i");
  assert.equal(evaluate("=SERIESSUM(2,0,1,{1,1})", ctx(workbook)), 3);
  assert.equal(evaluate("=ENCODEURL(\"a b\")", ctx(workbook)), "a%20b");
  assert.equal(evaluate("=CELL(\"row\",A1)", ctx(workbook)), 1);
  assert.equal(evaluate("=ROUND(GAMMA.DIST(1,1,1,TRUE),4)", ctx(workbook)), 0.6321);
  assert.equal(evaluate("=ROUND(WEIBULL.DIST(1,1,1,TRUE),4)", ctx(workbook)), 0.6321);
  assert.equal(evaluate("=HYPGEOM.DIST(1,2,4,2,FALSE)", ctx(workbook)), 4 / 6);
  assert.equal(evaluate("=PROB({1,2,3},{0.2,0.3,0.5},2,3)", ctx(workbook)), 0.8);
  assert.equal(evaluate("=ROUND(Z.TEST({1,2,3},1,1),4)", ctx(workbook)), 0.0416);
  assert.equal(evaluate("=ROUND(INTRATE(DATE(2026,1,1),DATE(2027,1,1),100,110),4)", ctx(workbook)), 0.1);
  assert.equal(evaluate("=ROUND(RECEIVED(DATE(2026,1,1),DATE(2027,1,1),100,0.1),2)", ctx(workbook)), 111.11);
  assert.equal(evaluate("=BAHTTEXT(0)", ctx(workbook)), "ศูนย์บาทถ้วน");
});

test("legacy names, text tools, and the odd coupon periods", () => {
  const workbook = book([[{ value: "1" }, { value: "2" }], [{ value: "3" }, { value: "4" }]]);
  assert.equal(Math.round(evaluate("=BETA.DIST(0.5,2,5,TRUE)", ctx(workbook)) as number * 1e6) / 1e6, 0.890625);
  assert.equal(evaluate("=BETADIST(0.5,2,5)", ctx(workbook)), evaluate("=BETA.DIST(0.5,2,5,TRUE)", ctx(workbook)));
  assert.equal(Math.round(evaluate("=BETA.INV(0.890625,2,5)", ctx(workbook)) as number * 1000) / 1000, 0.5);
  assert.equal(Math.round(evaluate("=T.DIST(1,10,TRUE)", ctx(workbook)) as number * 1000) / 1000, 0.83);
  assert.equal(Math.round(evaluate("=TDIST(1,10,2)", ctx(workbook)) as number * 1000) / 1000, 0.341);
  assert.equal(Math.round(evaluate("=T.INV.2T(0.05,10)", ctx(workbook)) as number * 100) / 100, 2.63);
  assert.equal(evaluate("=TINV(0.05,10)", ctx(workbook)), evaluate("=T.INV.2T(0.05,10)", ctx(workbook)));
  assert.equal(Math.round(evaluate("=FINV(0.05,5,5)", ctx(workbook)) as number * 100) / 100, 5.05);
  assert.equal(Math.round(evaluate("=CHIINV(0.05,1)", ctx(workbook)) as number * 100) / 100, 3.84);
  assert.equal(Math.round(evaluate("=GAMMALN.PRECISE(3)", ctx(workbook)) as number * 1000) / 1000, 0.693);
  assert.equal(evaluate("=IMSIN(\"i\")", ctx(workbook)), evaluate("=COMPLEX(0,SINH(1))", ctx(workbook)));
  assert.equal(evaluate("=IMCOS(\"0\")", ctx(workbook)), "1");
  assert.equal(formatResult(evaluate("=MUNIT(2)", ctx(workbook))), "1,0,0,1");
  assert.equal(evaluate('=REGEXTEST("abc123","[0-9]+")', ctx(workbook)), true);
  assert.equal(evaluate('=REGEXEXTRACT("abc123","[0-9]+")', ctx(workbook)), "123");
  assert.equal(evaluate('=REGEXREPLACE("a1b2","[0-9]","x")', ctx(workbook)), "axbx");
  assert.equal(evaluate("=ARRAYTOTEXT({1,2;3,4})", ctx(workbook)), "1, 2; 3, 4");
  assert.equal(evaluate("=VALUETOTEXT(A1)", ctx(workbook)), "1");
  assert.equal(evaluate("=JIS(\"A\")", ctx(workbook)), "Ａ");
  assert.equal(evaluate("=PERCENTOF(1,4)", ctx(workbook)), 0.25);
  assert.equal(evaluate("=VARPA(1,2,3)", ctx(workbook)), evaluate("=VAR.P(1,2,3)", ctx(workbook)));
  assert.equal(evaluate("=EUROCONVERT(1,\"EUR\",\"DEM\")", ctx(workbook)), 1.95583);
  assert.equal(evaluate("=IMAGE(\"http://x\")", ctx(workbook)), "http://x");
  assert.equal(Math.round(evaluate("=ODDFPRICE(40000,41000,39900,40100,0.05,0.06,100,2)", ctx(workbook)) as number), 97);
  assert.equal(Math.round(evaluate("=ODDLPRICE(40000,41000,40900,0.05,0.06,100,2)", ctx(workbook)) as number), 99);
  assert.equal(Math.round(evaluate("=FORECAST.ETS(4,{2,4,6},{1,2,3})", ctx(workbook)) as number), 8);
  assert.equal(evaluate("=FORECAST.ETS.SEASONALITY(4,{2,4,6},{1,2,3})", ctx(workbook)), 1);
  assert.equal(evaluate("=CEILING.PRECISE(-1.5,1)", ctx(workbook)), -1);
  assert.equal(evaluate("=FLOOR.PRECISE(1.5,1)", ctx(workbook)), 1);
});

test("GROUPBY and PIVOTBY summaries", () => {
  const workbook = book([]);
  const rows = '{"b";"a";"b"}';
  const values = '{1;4;2}';
  // A bare SUM groups the rows and adds a grand total.
  assert.equal(formatResult(evaluate(`=GROUPBY(${rows},${values},SUM)`, ctx(workbook))), "b,3,a,4,总计,7");
  // total_depth 0 drops the total, and a negative sort_order sorts that column descending.
  assert.equal(formatResult(evaluate(`=GROUPBY(${rows},${values},SUM,0,0)`, ctx(workbook))), "b,3,a,4");
  assert.equal(formatResult(evaluate(`=GROUPBY(${rows},${values},SUM,0,0,-2)`, ctx(workbook))), "a,4,b,3");
  // The filter array drops rows, and HSTACK runs two aggregations side by side.
  assert.equal(formatResult(evaluate(`=GROUPBY(${rows},${values},SUM,0,0,,,{TRUE;FALSE;TRUE})`, ctx(workbook))), "b,3");
  assert.equal(formatResult(evaluate(`=GROUPBY(${rows},${values},HSTACK(SUM,COUNT),0,0)`, ctx(workbook))), "b,3,2,a,4,1");
  // Two row fields produce a subtotal per outer group when total_depth is 2.
  const twoFields = '{"北","红";"北","蓝";"南","红"}';
  assert.equal(formatResult(evaluate(`=GROUPBY(${twoFields},{1;4;2},SUM,0,2)`, ctx(workbook))), "北,红,1,北,蓝,4,北,总计,5,南,红,2,南,总计,2,总计,,7");
  // A single row field cannot subtotal, and a name that is not an aggregation is rejected.
  assert.equal(formatResult(evaluate(`=GROUPBY(${rows},${values},SUM,0,2)`, ctx(workbook))), "#VALUE!");
  assert.equal(formatResult(evaluate(`=GROUPBY(${rows},${values},NOPE)`, ctx(workbook))), "#NAME?");
  // PIVOTBY spreads one field across columns and totals both ways.
  assert.equal(formatResult(evaluate(`=PIVOTBY(${rows},{"红";"红";"蓝"},${values},SUM)`, ctx(workbook))), "b,1,2,3,a,4,0,4,总计,5,2,7");
});
