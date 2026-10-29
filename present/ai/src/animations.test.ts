import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Shape, Slide, TextShape } from "@ppt/core";
import { autoAnimateSlide } from "./animations.js";

function text(id: string, x: number, y: number, w = 200, h = 40, name = id): TextShape {
  return {
    id,
    kind: "text",
    name,
    bbox: { x, y, w, h },
    paragraphs: [{ runs: [{ text: id }] }],
  } as TextShape;
}

function rect(id: string, x: number, y: number, w: number, h: number, name = id): Shape {
  return { id, kind: "rectangle", name, bbox: { x, y, w, h }, fill: { kind: "solid", color: "#eeeeee" } } as unknown as Shape;
}

function slideOf(shapes: Shape[]): Slide {
  return { id: "s1", layers: [{ id: "l1", shapes }] } as unknown as Slide;
}

function plate(id: string, x: number, y: number, w: number, h: number, name = id): Shape {
  return { ...rect(id, x, y, w, h, name), kind: "rect" } as Shape;
}

describe("autoAnimateSlide — every content unit enters", () => {
  it("gives every peer card its own click and keeps the card on one effect", () => {
    const shapes: Shape[] = [text("title", 64, 40, 900, 60, "slot:title")];
    for (let i = 0; i < 12; i++) {
      const x = 64 + (i % 4) * 290;
      const y = 140 + Math.floor(i / 4) * 180;
      const unit = `kpis.kpi${i}`;
      shapes.push({ ...rect(`card${i}`, x, y, 260, 150), animUnit: unit } as Shape);
      shapes.push({ ...text(`v${i}`, x + 20, y + 20, 200, 60, `slot:kpi${i}.value:${i}`), animUnit: unit } as Shape);
      shapes.push({ ...text(`l${i}`, x + 20, y + 90, 200, 30, `slot:kpi${i}.label:${i}`), animUnit: unit } as Shape);
    }
    const effects = autoAnimateSlide(slideOf(shapes), { bundleId: "minimal" });
    const animated = new Set(effects.map((e) => e.shapeId));
    for (const s of shapes) assert.ok(animated.has(s.id), `${s.id} must animate`);

    const clicks = effects.filter((e) => e.trigger === "onClick").map((e) => e.shapeId);
    assert.deepEqual(clicks[0], "title");
    assert.equal(clicks.length, 13, "title plus one click per card");
    for (let i = 0; i < 12; i++) {
      const members = effects.filter((e) => e.shapeId === `card${i}` || e.shapeId === `v${i}` || e.shapeId === `l${i}`);
      assert.equal(members.length, 3);
      assert.equal(new Set(members.map((e) => e.effect)).size, 1, `card ${i} shares one effect`);
      assert.ok(members.every((e) => e.delayMs === 0));
      assert.equal(members.filter((e) => e.trigger === "withPrevious").length, 2);
    }
  });

  it("keeps a tagged card together: backdrop, value, and label share one beat", () => {
    const shapes: Shape[] = [
      { ...rect("card", 100, 100, 300, 200), animUnit: "kpis.kpi0" } as Shape,
      { ...text("value", 120, 120, 200, 80, "slot:kpi0.value:0"), animUnit: "kpis.kpi0" } as Shape,
      { ...text("label", 120, 220, 200, 30, "slot:kpi0.label:0"), animUnit: "kpis.kpi0" } as Shape,
      { ...rect("card2", 500, 100, 300, 200), animUnit: "kpis.kpi1" } as Shape,
      { ...text("value2", 520, 120, 200, 80, "slot:kpi1.value:1"), animUnit: "kpis.kpi1" } as Shape,
    ];
    const effects = autoAnimateSlide(slideOf(shapes), { bundleId: "minimal" });
    const byId = new Map(effects.map((e) => [e.shapeId, e]));
    assert.equal(effects.length, 5);
    const leads = effects.filter((e) => e.trigger !== "withPrevious").map((e) => e.shapeId);
    assert.equal(leads.length, 2, "two cards → two beats");
    assert.equal(byId.get("card")!.trigger, "withPrevious");
    assert.equal(byId.get("card2")!.trigger, "withPrevious");
    assert.equal(byId.get("card")!.delayMs, 0);
    assert.equal(byId.get("label")!.effect, byId.get("value")!.effect);
    assert.equal(byId.get("label")!.delayMs, 0);
  });

  it("gives an isolated small decoration a fallback entrance and leaves page-sized fields static", () => {
    const shapes: Shape[] = [
      rect("field", 0, 0, 1280, 720),
      text("title", 64, 60, 800, 80, "slot:title"),
      rect("dot", 1100, 620, 24, 24),
    ];
    const effects = autoAnimateSlide(slideOf(shapes), { bundleId: "minimal" });
    const ids = new Set(effects.map((e) => e.shapeId));
    assert.ok(ids.has("title"));
    assert.ok(ids.has("dot"), "small lone decoration still enters");
    assert.ok(!ids.has("field"), "page-sized backdrop stays put");
  });

  it("auto-plays a header chain and clicks each peer card", () => {
    const shapes: Shape[] = [
      text("title", 64, 40, 800, 56, "page title"),
      text("sub", 64, 120, 800, 32, "cover subtitle"),
      text("foot", 64, 20, 80, 24, "cover footer"),
      text("left", 80, 220, 200, 40, "card title"),
      plate("left-plate", 64, 210, 280, 160),
      text("right", 480, 220, 200, 40, "card title"),
      plate("right-plate", 464, 210, 280, 160),
    ];
    const effects = autoAnimateSlide(slideOf(shapes), { bundleId: "minimal" });
    const byId = new Map(effects.map((e) => [e.shapeId, e]));
    assert.equal(byId.get("title")!.trigger, "onClick");
    assert.equal(byId.get("sub")!.trigger, "afterPrevious");
    assert.equal(byId.get("left")!.trigger, "onClick");
    assert.equal(byId.get("right")!.trigger, "onClick");
    assert.equal(byId.get("left-plate")!.trigger, "withPrevious");
    assert.equal(byId.get("left-plate")!.delayMs, 0);
    assert.equal(byId.get("left-plate")!.effect, byId.get("left")!.effect);
    assert.equal(byId.get("foot")!.trigger, "afterPrevious");
    const order = effects.map((e) => e.shapeId);
    assert.ok(order.indexOf("title") < order.indexOf("left"));
    assert.ok(order.indexOf("left") < order.indexOf("right"), "same rank reads left to right");
    assert.ok(order.indexOf("right") < order.indexOf("foot"), "footer stays after the body even if it sits higher");
  });

  it("keeps text that overhangs a plate by 20px, and text clear of the plate on its own", () => {
    const shapes: Shape[] = [
      plate("card", 100, 160, 300, 200),
      text("on", 120, 140, 240, 40, "card title"),
      text("off", 120, 40, 240, 40, "card title"),
    ];
    const effects = autoAnimateSlide(slideOf(shapes), { bundleId: "minimal" });
    const onIdx = effects.findIndex((e) => e.shapeId === "on");
    const plateIdx = effects.findIndex((e) => e.shapeId === "card");
    assert.equal(effects[plateIdx]!.trigger, "withPrevious");
    assert.equal(effects[plateIdx - 1]!.shapeId, "on");
    assert.ok(onIdx >= 0);
    const off = effects.find((e) => e.shapeId === "off")!;
    assert.equal(off.trigger, "onClick");
  });

  it("binds a preset path to its label", () => {
    const path = {
      id: "sp_chev",
      kind: "path",
      name: "chev",
      bbox: { x: 64, y: 140, w: 220, h: 80 },
    } as Shape;
    const label = text("sp_chev_label", 80, 155, 180, 50, "chev:label");
    const effects = autoAnimateSlide(slideOf([path, label]), { bundleId: "minimal" });
    const byId = new Map(effects.map((e) => [e.shapeId, e]));
    assert.equal(byId.get("sp_chev")!.trigger, "withPrevious");
    assert.equal(byId.get("sp_chev")!.effect, byId.get("sp_chev_label")!.effect);
    assert.equal(byId.get("sp_chev")!.delayMs, 0);
  });

  it("animates a group as one shape", () => {
    const child = text("child", 20, 20, 80, 30, "card title");
    const group = {
      id: "sp_g",
      kind: "group",
      name: "diagram",
      bbox: { x: 0, y: 0, w: 400, h: 200 },
      children: [child],
    } as Shape;
    const effects = autoAnimateSlide(slideOf([group]), { bundleId: "minimal" });
    assert.deepEqual(effects.map((e) => e.shapeId), ["sp_g"]);
  });

  it("clicks each paragraph of an unframed bullet list and keeps a framed list on one beat", () => {
    const naked = text("list", 64, 160, 800, 240, "bullets body");
    naked.kind = "text";
    (naked as { paragraphs: unknown[] }).paragraphs = [
      { runs: [{ text: "one" }] },
      { runs: [{ text: "two" }] },
      { runs: [{ text: "three" }] },
    ];
    const nakedEffects = autoAnimateSlide(slideOf([naked]), { bundleId: "minimal" });
    assert.equal(nakedEffects.length, 3);
    assert.ok(nakedEffects.every((e) => e.trigger === "onClick" && e.shapeId === "list"));
    assert.deepEqual(
      nakedEffects.map((e) => e.paraRange),
      [
        { st: 0, end: 0 },
        { st: 1, end: 1 },
        { st: 2, end: 2 },
      ],
    );

    const framed = text("body", 120, 180, 240, 120, "bullets body");
    (framed as { paragraphs: unknown[] }).paragraphs = [
      { runs: [{ text: "one" }] },
      { runs: [{ text: "two" }] },
      { runs: [{ text: "three" }] },
    ];
    const framedEffects = autoAnimateSlide(
      slideOf([plate("card", 100, 160, 300, 200), framed]),
      { bundleId: "minimal" },
    );
    assert.equal(framedEffects.filter((e) => e.shapeId === "body").length, 1);
    assert.equal(framedEffects.find((e) => e.shapeId === "body")!.paraRange, undefined);
    assert.equal(framedEffects.find((e) => e.shapeId === "card")!.trigger, "withPrevious");
  });

  it("pulls a step marker into the neighboring title", () => {
    const shapes: Shape[] = [
      text("num", 100, 200, 36, 36, "process number"),
      text("title", 148, 200, 220, 36, "process title"),
    ];
    const effects = autoAnimateSlide(slideOf(shapes), { bundleId: "minimal" });
    const byId = new Map(effects.map((e) => [e.shapeId, e]));
    const follower = byId.get("num")!.trigger === "withPrevious" ? "num" : "title";
    const lead = follower === "num" ? "title" : "num";
    assert.equal(byId.get(follower)!.trigger, "withPrevious");
    assert.equal(byId.get(follower)!.delayMs, 0);
    assert.equal(byId.get(follower)!.effect, byId.get(lead)!.effect);
    assert.equal(effects.length, 2);
  });

  it("folds units past an explicit click cap without splitting a card", () => {
    const shapes: Shape[] = [text("title", 64, 40, 800, 56, "page title")];
    for (let i = 0; i < 4; i++) {
      const unit = `kpis.kpi${i}`;
      const x = 64 + i * 280;
      shapes.push({ ...plate(`card${i}`, x, 160, 240, 140), animUnit: unit } as Shape);
      shapes.push({ ...text(`v${i}`, x + 16, 180, 200, 48, `slot:kpi${i}.value:${i}`), animUnit: unit } as Shape);
    }
    const effects = autoAnimateSlide(slideOf(shapes), { bundleId: "minimal", maxEffects: 2 });
    const clicks = effects.filter((e) => e.trigger === "onClick");
    assert.equal(clicks.length, 2);
    for (let i = 2; i < 4; i++) {
      const members = effects.filter((e) => e.shapeId === `card${i}` || e.shapeId === `v${i}`);
      assert.equal(members.length, 2);
      assert.ok(members.every((e) => e.trigger === "withPrevious" && e.delayMs === 0));
      assert.equal(members[0]!.effect, members[1]!.effect);
    }
  });

  it("leaves a shared field static and enters a single frame with its card", () => {
    const shared = [
      plate("well", 40, 140, 1100, 400),
      plate("a", 80, 200, 300, 180),
      text("at", 100, 240, 200, 40, "card title"),
      plate("b", 480, 200, 300, 180),
      text("bt", 500, 240, 200, 40, "card title"),
    ];
    const sharedFx = autoAnimateSlide(slideOf(shared), { bundleId: "minimal" });
    assert.ok(!sharedFx.some((e) => e.shapeId === "well"));

    const lone = [
      plate("frame", 80, 160, 360, 240),
      plate("card", 100, 180, 300, 180),
      text("title", 120, 220, 240, 40, "card title"),
    ];
    const loneFx = autoAnimateSlide(slideOf(lone), { bundleId: "minimal" });
    const frame = loneFx.find((e) => e.shapeId === "frame");
    assert.ok(frame);
    assert.equal(frame!.trigger, "withPrevious");
    assert.equal(frame!.delayMs, 0);
  });
});

describe("autoAnimateSlide — outline reveal order", () => {
  it("series clicks follow bullet wording, not left-to-right", () => {
    const shapes: Shape[] = [
      text("title", 64, 40, 800, 56, "page title"),
      text("Gamma", 80, 200, 200, 40, "card title"),
      text("Alpha", 480, 200, 200, 40, "card title"),
      text("Beta", 800, 200, 200, 40, "card title"),
      text("foot", 64, 16, 80, 20, "cover footer"),
      rect("dot", 1100, 640, 16, 16),
      { id: "photo", kind: "image", name: "image", bbox: { x: 860, y: 48, w: 360, h: 200 }, src: "x" } as Shape,
    ];
    const effects = autoAnimateSlide(slideOf(shapes), {
      bundleId: "minimal",
      reveal: { title: "Plan", points: ["Alpha", "Beta", "Gamma"] },
    });
    const clicks = effects.filter((e) => e.trigger === "onClick").map((e) => e.shapeId);
    assert.deepEqual(clicks, ["title", "Alpha", "Beta", "Gamma"]);
    const order = effects.map((e) => e.shapeId);
    assert.ok(order.indexOf("photo") > order.indexOf("title") && order.indexOf("photo") < order.indexOf("Alpha"));
    assert.equal(effects.find((e) => e.shapeId === "photo")!.trigger, "withPrevious");
    assert.ok(order.indexOf("Gamma") < order.indexOf("foot"));
    assert.equal(effects.find((e) => e.shapeId === "foot")!.trigger, "afterPrevious");
    assert.ok(!order.includes("dot"));
  });

  it("all-chain pace plays the same order on one click", () => {
    const shapes: Shape[] = [
      text("title", 64, 40, 800, 56, "page title"),
      text("Gamma", 80, 200, 200, 40, "card title"),
      text("Alpha", 400, 200, 200, 40, "card title"),
    ];
    const effects = autoAnimateSlide(slideOf(shapes), {
      bundleId: "minimal",
      reveal: { title: "Plan", points: ["Alpha", "Gamma"], pace: ["chain", "chain"] },
    });
    assert.deepEqual(
      effects.map((e) => e.shapeId),
      ["title", "Alpha", "Gamma"],
    );
    assert.equal(effects.filter((e) => e.trigger === "onClick").length, 1);
    assert.equal(effects.find((e) => e.shapeId === "Alpha")!.trigger, "afterPrevious");
    assert.equal(effects.find((e) => e.shapeId === "Gamma")!.trigger, "afterPrevious");
  });

  it("chains a contiguous run after the last click", () => {
    const shapes: Shape[] = [
      text("title", 64, 40, 800, 56, "page title"),
      text("Gamma", 80, 200, 200, 40, "card title"),
      text("Alpha", 400, 200, 200, 40, "card title"),
      text("Beta", 700, 200, 200, 40, "card title"),
    ];
    const effects = autoAnimateSlide(slideOf(shapes), {
      bundleId: "minimal",
      reveal: { title: "Plan", points: ["Alpha", "Beta", "Gamma"], pace: ["click", "click", "chain"] },
    });
    assert.deepEqual(
      effects.filter((e) => e.trigger === "onClick").map((e) => e.shapeId),
      ["title", "Alpha", "Beta"],
    );
    assert.equal(effects.find((e) => e.shapeId === "Gamma")!.trigger, "afterPrevious");
    const order = effects.map((e) => e.shapeId);
    assert.ok(order.indexOf("Beta") < order.indexOf("Gamma"));
  });

  it("puts a stat value and an eyebrow on the title beat", () => {
    const shapes: Shape[] = [
      text("kicker", 64, 24, 120, 24, "kicker"),
      text("title", 64, 56, 800, 64, "page title"),
      text("72%", 64, 160, 400, 120, "stat value"),
    ];
    const effects = autoAnimateSlide(slideOf(shapes), {
      bundleId: "minimal",
      reveal: { title: "NPS", points: [], withTitle: ["72%"] },
    });
    assert.equal(effects.filter((e) => e.trigger === "onClick").length, 1);
    assert.ok(effects.filter((e) => e.trigger !== "onClick").every((e) => e.trigger === "withPrevious"));
  });

  it("walks an unframed list in bullet order", () => {
    const list = text("list", 64, 160, 800, 240, "bullets body");
    (list as { paragraphs: unknown[] }).paragraphs = [
      { runs: [{ text: "Gamma" }] },
      { runs: [{ text: "Alpha" }] },
      { runs: [{ text: "Beta" }] },
    ];
    const effects = autoAnimateSlide(slideOf([text("title", 64, 40, 400, 40, "page title"), list]), {
      bundleId: "minimal",
      reveal: { title: "Plan", points: ["Alpha", "Beta", "Gamma"] },
    });
    assert.deepEqual(
      effects.filter((e) => e.shapeId === "list").map((e) => e.paraRange),
      [
        { st: 1, end: 1 },
        { st: 2, end: 2 },
        { st: 0, end: 0 },
      ],
    );
  });

  it("reads comparison left then right, and table rows from top to bottom", () => {
    const build = text("Build", 700, 180, 200, 36, "column title");
    const fast = text("fast", 700, 230, 200, 36, "column body");
    const buy = text("Buy", 80, 180, 200, 36, "column title");
    const cheap = text("cheap", 80, 230, 200, 36, "column body");
    const compare = autoAnimateSlide(slideOf([text("title", 64, 40, 400, 40, "page title"), buy, cheap, build, fast]), {
      bundleId: "minimal",
      reveal: {
        title: "Choice",
        points: ["fast", "cheap"],
        leftLabel: "Build",
        rightLabel: "Buy",
        rightFrom: 1,
      },
    });
    const compareOrder = compare.map((e) => e.shapeId);
    assert.ok(compareOrder.indexOf("fast") < compareOrder.indexOf("cheap"));
    assert.ok(compareOrder.indexOf("Build") < compareOrder.indexOf("Buy"));
    assert.equal(compare.find((e) => e.shapeId === "fast")!.trigger, "withPrevious");

    const header = text("H", 40, 140, 400, 28, "table header");
    header.id = "tbl_r0c0";
    const second = text("Second", 40, 180, 400, 28, "cell");
    second.id = "tbl_r1c0";
    const first = text("First", 40, 220, 400, 28, "cell");
    first.id = "tbl_r2c0";
    const table = {
      id: "tbl",
      kind: "group",
      name: "table",
      bbox: { x: 40, y: 140, w: 400, h: 120 },
      children: [header, second, first],
      tableMeta: { rows: 3, cols: 1, firstRow: true },
    } as Shape;
    const rows = autoAnimateSlide(slideOf([text("title", 64, 40, 400, 40, "page title"), table]), {
      bundleId: "minimal",
      reveal: { title: "Grid", points: ["First", "Second"] },
    });
    const rowClicks = rows.filter((e) => e.trigger === "onClick").map((e) => e.shapeId);
    assert.deepEqual(rowClicks, ["title", "tbl_r1c0", "tbl_r2c0"]);
    assert.equal(rows.find((e) => e.shapeId === "tbl_r0c0")!.trigger, "withPrevious");
  });

  it("keeps a title on the first beat when its text matches a later point", () => {
    const title = text("title", 64, 40, 800, 56, "slot:title:0");
    title.paragraphs = [{ runs: [{ text: "路线图三步" }] }] as never;
    const find = text("find", 64, 180, 400, 40, "slot:body:1");
    find.paragraphs = [{ runs: [{ text: "发现" }] }] as never;
    const end = text("end", 64, 260, 400, 40, "slot:body:2");
    end.paragraphs = [{ runs: [{ text: "收尾" }] }] as never;
    const effects = autoAnimateSlide(slideOf([find, end, title]), {
      bundleId: "minimal",
      reveal: { title: "总览", points: ["发现", "路线图三步", "收尾"] },
    });
    assert.deepEqual(
      effects.filter((e) => e.trigger === "onClick").map((e) => e.shapeId),
      ["title", "find", "end"],
    );
  });

  it("pins a rewritten title that no longer matches the outline", () => {
    const title = text("topic", 64, 40, 800, 56, "slot:topic:0");
    title.paragraphs = [{ runs: [{ text: "完全不同的标题" }] }] as never;
    const find = text("find", 64, 200, 400, 40, "slot:body:1");
    find.paragraphs = [{ runs: [{ text: "发现" }] }] as never;
    const effects = autoAnimateSlide(slideOf([find, title]), {
      bundleId: "minimal",
      reveal: { title: "总览", points: ["发现"] },
    });
    assert.deepEqual(
      effects.filter((e) => e.trigger === "onClick").map((e) => e.shapeId),
      ["topic", "find"],
    );
  });

  it("keeps numerals with their row and in numeral order", () => {
    const title = text("title", 64, 40, 400, 40, "slot:title");
    const n1 = text("n1", 64, 140, 48, 32, "slot:index:0");
    n1.paragraphs = [{ runs: [{ text: "01" }] }] as never;
    const gamma = text("gamma", 120, 140, 300, 32, "slot:items:0");
    gamma.paragraphs = [{ runs: [{ text: "Gamma" }] }] as never;
    const n2 = text("n2", 64, 200, 48, 32, "slot:index:1");
    n2.paragraphs = [{ runs: [{ text: "02" }] }] as never;
    const alpha = text("alpha", 120, 200, 300, 32, "slot:items:1");
    alpha.paragraphs = [{ runs: [{ text: "Alpha" }] }] as never;
    const effects = autoAnimateSlide(slideOf([title, alpha, n2, gamma, n1]), {
      bundleId: "minimal",
      reveal: { title: "Plan", points: ["Alpha", "Gamma"] },
    });
    const order = effects.map((e) => e.shapeId);
    assert.deepEqual(
      effects.filter((e) => e.trigger === "onClick").map((e) => e.shapeId),
      ["title", "n1", "n2"],
    );
    assert.ok(order.indexOf("n1") < order.indexOf("gamma") && order.indexOf("gamma") < order.indexOf("n2"));
    assert.equal(effects.find((e) => e.shapeId === "gamma")!.trigger, "withPrevious");
    assert.equal(effects.find((e) => e.shapeId === "alpha")!.trigger, "withPrevious");
  });

  it("orders step markers by their step index, not by bullet text", () => {
    const title = text("title", 64, 40, 400, 40, "slot:title");
    const s0n = text("s0n", 80, 180, 40, 40, "slot:flow.step0.num");
    const s0t = text("s0t", 80, 230, 180, 40, "slot:flow.step0.title");
    const s1n = text("s1n", 400, 180, 40, 40, "slot:flow.step1.num");
    const s1t = text("s1t", 400, 230, 180, 40, "slot:flow.step1.title");
    for (const shape of [s0n, s0t]) (shape as { animUnit?: string }).animUnit = "flow.step0";
    for (const shape of [s1n, s1t]) (shape as { animUnit?: string }).animUnit = "flow.step1";
    s0n.paragraphs = [{ runs: [{ text: "01" }] }] as never;
    s0t.paragraphs = [{ runs: [{ text: "Gamma" }] }] as never;
    s1n.paragraphs = [{ runs: [{ text: "02" }] }] as never;
    s1t.paragraphs = [{ runs: [{ text: "Alpha" }] }] as never;
    const effects = autoAnimateSlide(slideOf([title, s1t, s1n, s0t, s0n]), {
      bundleId: "minimal",
      reveal: { title: "Plan", points: ["Alpha", "Gamma"] },
    });
    const order = effects.map((e) => e.shapeId);
    assert.ok(order.indexOf("s0n") < order.indexOf("s1n"));
    assert.ok(order.indexOf("s0t") < order.indexOf("s1n"));
    assert.equal(effects.find((e) => e.shapeId === "s0t")!.trigger, "withPrevious");
  });

  it("walks numbered paragraphs in numeral order", () => {
    const list = text("list", 64, 160, 800, 240, "bullets body");
    list.paragraphs = [
      { runs: [{ text: "03 Gamma" }] },
      { runs: [{ text: "01 Alpha" }] },
      { runs: [{ text: "02 Beta" }] },
    ] as never;
    const effects = autoAnimateSlide(slideOf([text("title", 64, 40, 400, 40, "page title"), list]), {
      bundleId: "minimal",
      reveal: { title: "Plan", points: ["Gamma", "Alpha", "Beta"] },
    });
    assert.deepEqual(
      effects.filter((e) => e.shapeId === "list").map((e) => e.paraRange),
      [
        { st: 1, end: 1 },
        { st: 2, end: 2 },
        { st: 0, end: 0 },
      ],
    );
  });

  it("reveals table rows from top to bottom even when a middle row matches the first point", () => {
    const header = text("H", 40, 140, 400, 28, "table header");
    header.id = "tbl_r0c0";
    const top = text("Later", 40, 180, 400, 28, "cell");
    top.id = "tbl_r1c0";
    const mid = text("First", 40, 220, 400, 28, "cell");
    mid.id = "tbl_r2c0";
    const bottom = text("Last", 40, 260, 400, 28, "cell");
    bottom.id = "tbl_r3c0";
    const table = {
      id: "tbl",
      kind: "group",
      name: "table",
      bbox: { x: 40, y: 140, w: 400, h: 160 },
      children: [mid, header, bottom, top],
      tableMeta: { rows: 4, cols: 1, firstRow: true },
    } as Shape;
    const rows = autoAnimateSlide(slideOf([text("title", 64, 40, 400, 40, "page title"), table]), {
      bundleId: "minimal",
      reveal: { title: "Grid", points: ["First", "Later", "Last"] },
    });
    assert.deepEqual(
      rows.filter((e) => e.trigger === "onClick").map((e) => e.shapeId),
      ["title", "tbl_r1c0", "tbl_r2c0", "tbl_r3c0"],
    );
    assert.equal(rows.find((e) => e.shapeId === "tbl_r0c0")!.trigger, "withPrevious");
  });
});
