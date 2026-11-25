import assert from "node:assert/strict";
import { test } from "node:test";
import type { Workbook } from "@sliiu/sheet-core";
import { consolidateRanges, evaluate, formatResult, recalculate } from "./index";

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
