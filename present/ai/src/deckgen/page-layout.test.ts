import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { FilledEl } from "./ir.js";
import { fitHeight, layoutPage, type PageSlots } from "./page-layout.js";
import { inkBox } from "./layout-gates.js";
import { CANVAS, resolveVisualSystem } from "./visual-system.js";
import { CanvasDeckSchema, normalizeCanvasDeck } from "../generate/canvas-schema.js";

const sys = resolveVisualSystem("data-dense");
const device = (type: string, payload: Record<string, unknown>): FilledEl => ({
  slot: "d",
  kind: "device",
  name: "d",
  bbox: { x: 0, y: 0, w: 1, h: 1 },
  paintRole: "accent",
  device: { type: type as NonNullable<FilledEl["device"]>["type"], ...payload },
});
const steps = device("stepStrip", {
  items: [
    { title: "接数据", body: "只接客服与售前两个高频场景" },
    { title: "建评测", body: "200 条评测问答，答案带出处" },
    { title: "换入口", body: "接进企业微信和浏览器插件" },
    { title: "收敛范围", body: "只留用得最多的 3 个场景" },
  ],
});

function inside(els: FilledEl[]): void {
  const mx = CANVAS.width * sys.grid.margin;
  for (const e of els) {
    if (e.kind === "surface" || e.kind === "rule") continue; // bands and panels bleed by design
    assert.ok(e.bbox.x >= mx - 1 && e.bbox.x + e.bbox.w <= CANVAS.width - mx + 1, `${e.slot} x ${e.bbox.x}+${e.bbox.w}`);
    assert.ok(e.bbox.y >= 0 && e.bbox.y + e.bbox.h <= CANVAS.height, `${e.slot} y ${e.bbox.y}+${e.bbox.h}`);
  }
}

describe("slot page layout", () => {
  it("sizes a step strip to its content instead of the whole region", () => {
    const h = fitHeight(steps, 1152, 480, sys);
    assert.ok(h < 300, `step strip took ${h}px of 480`);
    assert.ok(h >= 120, `step strip squeezed to ${h}px`);
  });

  it("header-stack: title on top, carrier and takeaway as one block, nothing off the page", () => {
    const slots: PageSlots = { composition: "header-stack", eyebrow: "推进节奏", title: "从试点到全员使用的四步", carrier: steps, takeaway: "跳过评测直接推广是最常见的失败点。", footnote: "示意数据" };
    const els = layoutPage(slots, sys);
    inside(els);
    const title = els.find((e) => e.slot === "title")!;
    const carrier = els.find((e) => e.slot === "carrier")!;
    const band = els.find((e) => e.slot === "takeaway")!;
    assert.ok(carrier.bbox.y > title.bbox.y + title.bbox.h);
    assert.equal(Math.round(band.bbox.y), Math.round(carrier.bbox.y + carrier.bbox.h + 24));
    assert.equal(band.device?.type, "takeawayBand");
    assert.ok(els.some((e) => e.slot === "footnote" && e.bbox.y + e.bbox.h <= CANVAS.height - CANVAS.height * sys.grid.margin + 1));
  });

  it("split: type column left, carrier right, both starting on one line", () => {
    const chart: FilledEl = { slot: "c", kind: "chart", name: "c", bbox: { x: 0, y: 0, w: 1, h: 1 }, paintRole: "accent", chart: { type: "column", categories: ["a", "b"], series: [{ name: "s", values: [1, 2] }] } };
    const els = layoutPage({ composition: "split", title: "四类知识查询的耗时变化", lede: "都降到三分之一左右。", carrier: chart }, sys);
    inside(els);
    const title = els.find((e) => e.slot === "title")!;
    const c = els.find((e) => e.slot === "carrier")!;
    assert.ok(title.bbox.x + title.bbox.w < c.bbox.x, "title column is left of the carrier");
    assert.equal(Math.round(title.bbox.y), Math.round(c.bbox.y));
  });

  it("sidebar: a full-height panel holds the title at h1 width", () => {
    const els = layoutPage({ composition: "sidebar", title: "试点三个月的四项指标", carrier: steps }, sys);
    const panel = els.find((e) => e.slot === "panel")!;
    const title = els.find((e) => e.slot === "title")!;
    assert.equal(panel.bbox.h, CANVAS.height);
    assert.ok(inkBox({ ...title, color: "#000000" }, sys).h < sys.typeScale.h1 * 2, "ten CJK characters fit one line at h1");
    assert.ok(els.find((e) => e.slot === "carrier")!.bbox.x > panel.bbox.x + panel.bbox.w);
  });

  it("band: header sits in a full-width band above the carrier", () => {
    const els = layoutPage({ composition: "band", title: "从试点到全员使用的四步", carrier: steps }, sys);
    const band = els.find((e) => e.slot === "band")!;
    assert.equal(band.bbox.w, CANVAS.width);
    assert.ok(els.find((e) => e.slot === "carrier")!.bbox.y > band.bbox.y + band.bbox.h);
  });
});

describe("slot pages in the canvas schema", () => {
  it("accepts a slide with slots and no elements, and maps the aliases models use", () => {
    const deck = normalizeCanvasDeck({
      systemId: "data-dense",
      slides: [
        { job: "sequence", composition: "band", slots: { kicker: "节奏", title: "四步", subtitle: "每步都能验收", main: { type: "stepStrip", items: ["a", "b"] }, conclusion: { text: "先建评测" } } },
        { job: "cover", elements: [{ kind: "text", text: "Hi", bbox: [64, 300, 600, 60], fontSize: 48 }] },
        { job: "empty", slots: { lede: "no title" } },
      ],
    });
    const parsed = CanvasDeckSchema.parse(deck);
    assert.equal(parsed.slides.length, 2);
    const s = parsed.slides[0]!.slots!;
    assert.equal(s.composition, "band");
    assert.equal(s.eyebrow, "节奏");
    assert.equal(s.lede, "每步都能验收");
    assert.equal(s.takeaway, "先建评测");
    assert.equal(s.carrier?.kind, "device");
    assert.equal(s.carrier?.device?.type, "stepStrip");
    assert.deepEqual(parsed.slides[0]!.elements, []);
  });
});
