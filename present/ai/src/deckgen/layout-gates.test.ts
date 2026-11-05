import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PaintedEl, PaintedSlide } from "./apply-theme.js";
import type { PageBrief } from "./brief.js";
import { inkBox, largestEmptyRect, layoutFindings, wrapText } from "./layout-gates.js";
import { resolveVisualSystem } from "./visual-system.js";

const sys = resolveVisualSystem("data-dense"); // h1 28 / h2 18 / body 14, margin 5%

let n = 0;
function el(kind: PaintedEl["kind"], bbox: PaintedEl["bbox"], extra: Partial<PaintedEl> = {}): PaintedEl {
  n += 1;
  return { slot: `${kind}-${n}`, kind, name: `${kind}-${n}`, bbox, paintRole: "ink", color: "#111111", ...extra };
}
const text = (t: string, bbox: PaintedEl["bbox"], fontSize: number, extra: Partial<PaintedEl> = {}) => el("text", bbox, { text: t, fontSize, ...extra });
const page = (elements: PaintedEl[], layout = "data"): PaintedSlide => ({ layout, variant: "canvas", elements });
const dense: PageBrief = { rhythm: "dense", composition: "header-stack" };

/** Cover and close are exempt from the air checks; wrap the page under test between them. */
function findingsFor(s: PaintedSlide, brief: PageBrief = dense) {
  const cover = page([text("Cover", { x: 64, y: 300, w: 600, h: 60 }, 48)], "cover");
  const close = page([text("Thanks", { x: 64, y: 300, w: 600, h: 60 }, 48)], "close");
  return layoutFindings([cover, s, close], sys, [undefined, brief, undefined]).filter((f) => f.slideIdx === 1);
}

describe("layout gates", () => {
  it("wraps CJK per character and keeps closing punctuation on the line", () => {
    const lines = wrapText("查找和归档耗时：引入前后对比", 28, 330.8);
    assert.deepEqual(lines.map((l) => l.text), ["查找和归档耗时：引入前后", "对比"]);
    assert.equal(wrapText("ab，", 10, 10).length, 1);
  });

  it("measures text by its ink, not its oversized box", () => {
    const ink = inkBox(text("四步把知识库跑起来", { x: 260, y: 92, w: 956, h: 300 }, 28), sys);
    assert.ok(ink.h < 60, `ink height ${ink.h}`);
    assert.ok(ink.w < 300, `ink width ${ink.w}`);
  });

  it("finds the largest empty rectangle on a 16px grid", () => {
    const r = largestEmptyRect({ x: 0, y: 0, w: 320, h: 320 }, [{ x: 0, y: 0, w: 320, h: 160 }]);
    assert.deepEqual(r, { x: 0, y: 160, w: 320, h: 160 });
  });

  it("flags half a page left empty under a row of steps", () => {
    const steps = [0, 1, 2, 3].map((k) => text(`步骤 ${k + 1}`, { x: 260 + k * 240, y: 286, w: 227, h: 300 }, 18, { slot: `steps.step${k}.title` }));
    const s = page([
      text("四步把知识库跑起来", { x: 260, y: 92, w: 956, h: 64 }, 28),
      ...steps,
      text("每步的完成标准是能上线、能被验证。", { x: 260, y: 630, w: 900, h: 20 }, 14),
    ]);
    const f = findingsFor(s);
    assert.ok(f.some((x) => /empty block/.test(x.issue)), JSON.stringify(f));
  });

  it("does not flag dead space on a breathing page, a photo page, or a full page", () => {
    const sparse = page([text("一句话", { x: 64, y: 300, w: 600, h: 60 }, 28)]);
    assert.equal(findingsFor(sparse, { rhythm: "breathing" }).length, 0);
    assert.equal(findingsFor({ ...sparse, background: { kind: "image", src: "data:image/png;base64,AAAA" } }).filter((x) => /empty/.test(x.issue)).length, 0);
    const full = page([
      text("三个数字说明现在的缺口", { x: 64, y: 80, w: 1000, h: 60 }, 28),
      el("surface", { x: 64, y: 160, w: 560, h: 480 }),
      el("chart", { x: 648, y: 160, w: 568, h: 480 }, { chart: { type: "bar", categories: ["a"], series: [{ name: "s", values: [1] }] } }),
    ]);
    assert.equal(findingsFor(full).length, 0);
  });

  it("flags a title and its copy split by a void in one column", () => {
    const s = page([
      text("传统知识库与 AI 助手", { x: 64, y: 110, w: 350, h: 250 }, 28),
      text("同一份知识源，四个机制逐个对照。", { x: 64, y: 382, w: 340, h: 60 }, 14),
      el("table", { x: 470, y: 110, w: 746, h: 520 }, { table: { headers: ["a", "b"], rows: [["x", "y"]] } }),
    ]);
    const f = findingsFor(s, { rhythm: "dense", composition: "split" });
    assert.ok(f.some((x) => /void splits the column/.test(x.issue)), JSON.stringify(f));
    // the same copy set right under the title is fine
    s.elements[1]!.bbox.y = 170;
    assert.ok(!findingsFor(s, { rhythm: "dense", composition: "split" }).some((x) => /void/.test(x.issue)));
  });

  it("flags a heading with one or two characters stranded on its last line", () => {
    const s = page([text("查找和归档耗时：引入前后对比", { x: 64, y: 118, w: 350, h: 100 }, 28)]);
    const f = findingsFor(s);
    assert.ok(f.some((x) => /“对比” alone/.test(x.issue)), JSON.stringify(f));
    const ok = page([text("查找和归档耗时对比", { x: 64, y: 118, w: 350, h: 100 }, 28)]);
    assert.ok(!findingsFor(ok).some((x) => /alone/.test(x.issue)));
    // body copy below h2 is not checked
    const body = page([text("查找和归档耗时：引入前后对比", { x: 64, y: 118, w: 190, h: 100 }, 14)]);
    assert.ok(!findingsFor(body).some((x) => /alone/.test(x.issue)));
  });

  it("flags a chart that repeats the KPI tiles' numbers", () => {
    const chart = el("chart", { x: 648, y: 152, w: 568, h: 376 }, { chart: { type: "bar", categories: ["a", "b"], series: [{ name: "%", values: [62, 70] }] } });
    const s = page([
      text("62%", { x: 78, y: 204, w: 144, h: 62 }, 56, { slot: "kpis.kpi0.value" }),
      text("8.4", { x: 262, y: 204, w: 144, h: 62 }, 56, { slot: "kpis.kpi1.value" }),
      text("70%", { x: 446, y: 204, w: 144, h: 62 }, 56, { slot: "kpis.kpi2.value" }),
      chart,
    ]);
    assert.ok(findingsFor(s).some((x) => /repeats numbers/.test(x.issue)));
    chart.chart = { type: "line", categories: ["Q1", "Q2", "Q3"], series: [{ name: "%", values: [41, 55, 62] }] };
    assert.ok(!findingsFor(s).some((x) => /repeats numbers/.test(x.issue)));
  });
});
