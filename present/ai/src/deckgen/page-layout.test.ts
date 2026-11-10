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

  it("header-stack: a short carrier grows into the slack instead of leaving a band under it", () => {
    // A 3-row table at its natural height fills barely half of a header-stack region; the old
    // layout floated it near the top and the page ended at y≈520 with 160px of paper below.
    const table: FilledEl = {
      slot: "t",
      kind: "table",
      name: "t",
      bbox: { x: 0, y: 0, w: 1, h: 1 },
      paintRole: "surface",
      table: { headers: ["环节", "AI 接手", "仍由人负责", "前后对比"], rows: [["入库", "抽取标签", "切分粒度", "8 分钟 → 40 秒"], ["检索", "语义扩召回", "排序权重", "40% → 78%"], ["更新", "触发重建", "版本确认", "季度 → 实时"]] },
    };
    const slots: PageSlots = { composition: "header-stack", eyebrow: "02 · 三个环节", title: "三个环节里 AI 具体做了什么", lede: "模型接手打标签、扩召回和触发重建，切分规则与权限仍由人定。", carrier: table, takeaway: "抽取、扩召回、起草摘要交给模型；切分规则、权限归属由人负责。", footnote: "对照口径：同一批 200 篇文档。" };
    const els = layoutPage(slots, sys);
    inside(els);
    const natural = fitHeight(table, CANVAS.width * (1 - 2 * sys.grid.margin), 400, sys);
    const carrier = els.find((e) => e.slot === "carrier")!;
    assert.ok(carrier.bbox.h > natural, `carrier stayed at its natural ${natural}px`);
    // Nothing below the carrier group may be left empty enough to read as a hole.
    const my = CANVAS.height * sys.grid.margin;
    const contentBottom = Math.max(
      ...els.filter((e) => !/footnote/.test(e.slot)).map((e) => inkBox({ ...e, color: "#000000" }, sys).y + inkBox({ ...e, color: "#000000" }, sys).h),
    );
    assert.ok(CANVAS.height - my - contentBottom < CANVAS.height * 0.18, `bottom band ${Math.round(CANVAS.height - my - contentBottom)}px`);
  });

  it("header-stack: a short title puts the lede beside it, not under it", () => {
    const table: FilledEl = { slot: "t", kind: "table", name: "t", bbox: { x: 0, y: 0, w: 1, h: 1 }, paintRole: "surface", table: { headers: ["a", "b"], rows: [["1", "2"]] } };
    const els = layoutPage({ composition: "header-stack", eyebrow: "02 · 三个环节", title: "三个环节里 AI 具体做了什么", lede: "模型接手打标签、扩召回和触发重建，切分规则与权限仍由人定。", carrier: table }, sys);
    inside(els);
    const title = els.find((e) => e.slot === "title")!;
    const lede = els.find((e) => e.slot === "lede")!;
    assert.ok(lede.bbox.x > title.bbox.x + title.bbox.w * 0.9, "lede sits in the right-hand column");
    assert.equal(Math.round(lede.bbox.y), Math.round(title.bbox.y), "the two columns start on one line");
  });

  it("header-stack: a long title keeps the lede stacked under it", () => {
    const table: FilledEl = { slot: "t", kind: "table", name: "t", bbox: { x: 0, y: 0, w: 1, h: 1 }, paintRole: "surface", table: { headers: ["a", "b"], rows: [["1", "2"]] } };
    const els = layoutPage({ composition: "header-stack", title: "从零到可用：企业知识库上线第一年的完整推进节奏与验收口径", lede: "分四个阶段推进。", carrier: table }, sys);
    inside(els);
    const title = els.find((e) => e.slot === "title")!;
    const lede = els.find((e) => e.slot === "lede")!;
    assert.equal(Math.round(lede.bbox.x), Math.round(title.bbox.x), "a full-width title leaves no column for the lede");
    assert.ok(lede.bbox.y > title.bbox.y, "lede stacks under the title");
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
