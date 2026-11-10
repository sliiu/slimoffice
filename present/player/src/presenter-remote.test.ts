import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Presentation, Slide } from "@ppt/core";
import { buildPresenterPageHtml, createPresenterBridge, notesForSlide, type RemoteTarget } from "./presenter-remote";

function slide(id: string, title: string, notes?: string): Slide {
  return {
    id,
    name: id,
    index: 0,
    layers: [
      {
        id: `${id}-l`,
        name: "l",
        visible: true,
        locked: false,
        shapes: [{ id: `${id}-t`, name: "title", kind: "text", paragraphs: [{ runs: [{ text: title }] }] } as never],
      },
    ],
    ...(notes != null ? { notes } : {}),
  };
}

const pres = { id: "p", title: "t", slides: [slide("s1", "开场", "先说结论"), slide("s2", "数据", "强调 23%"), slide("s3", "收尾")] } as unknown as Presentation;

function fakeTarget(start = 0, total = 3): RemoteTarget & { pos: number } {
  const t = {
    pos: start,
    next() {
      if (t.pos < total - 1) t.pos += 1;
    },
    prev() {
      if (t.pos > 0) t.pos -= 1;
    },
    goto(i: number) {
      t.pos = i;
    },
    current: () => t.pos,
    total: () => total,
  };
  return t;
}

describe("presenter bridge", () => {
  it("snapshots the current slide title, its notes, and the next slide's notes", () => {
    const t = fakeTarget(0);
    const bridge = createPresenterBridge(() => t, { presentation: pres, now: () => 1000, startedAt: 1000 });
    const s = bridge.snapshot();
    assert.equal(s.slide, 0);
    assert.equal(s.total, 3);
    assert.equal(s.title, "开场");
    assert.equal(s.notes, "先说结论");
    assert.equal(s.nextNotes, "强调 23%");
    assert.equal(s.elapsedMs, 0);
  });

  it("clamps next at the end and prev at the start instead of running off", () => {
    const t = fakeTarget(0);
    const bridge = createPresenterBridge(() => t, { presentation: pres });
    assert.equal(bridge.apply({ type: "prev" }), false);
    assert.equal(t.pos, 0);
    assert.equal(bridge.apply({ type: "next" }), true);
    assert.equal(bridge.apply({ type: "next" }), true);
    assert.equal(bridge.apply({ type: "next" }), false);
    assert.equal(t.pos, 2);
  });

  it("rejects goto outside the visible deck", () => {
    const t = fakeTarget(0);
    const bridge = createPresenterBridge(() => t, { presentation: pres });
    assert.equal(bridge.apply({ type: "goto", slide: 3 }), false);
    assert.equal(bridge.apply({ type: "goto", slide: -1 }), false);
    assert.equal(bridge.apply({ type: "goto", slide: 1.5 }), false);
    assert.equal(bridge.apply({ type: "goto", slide: 2 }), true);
    assert.equal(t.pos, 2);
  });

  it("maps slot numbers through the visible sequence when hidden slides are skipped", () => {
    const t = fakeTarget(0);
    // slots 0/1 map to slides 0/2
    const bridge = createPresenterBridge(() => t, { presentation: pres, visibleSlides: [0, 2] });
    bridge.apply({ type: "next" });
    assert.equal(bridge.snapshot().title, "收尾");
    assert.equal(bridge.snapshot().notes, "");
  });

  it("tracks black and pause without touching the target", () => {
    const t = fakeTarget(1);
    const bridge = createPresenterBridge(() => t, { presentation: pres });
    assert.equal(bridge.apply({ type: "black", on: true }), true);
    assert.equal(bridge.snapshot().black, true);
    bridge.apply({ type: "pause" });
    assert.equal(bridge.snapshot().paused, true);
    assert.equal(t.pos, 1);
  });

  it("accepts nothing while the player is not mounted yet", () => {
    const bridge = createPresenterBridge(() => null, { presentation: pres });
    assert.equal(bridge.apply({ type: "next" }), false);
    assert.equal(bridge.snapshot().total, 3);
  });

  it("keeps notes as plain text and truncates long ones", () => {
    assert.equal(notesForSlide(pres, 1), "强调 23%");
    assert.equal(notesForSlide(pres, 2), "");
    const long = { slides: [{ notes: "字".repeat(2000) }] } as unknown as Presentation;
    const clipped = notesForSlide(long, 0);
    assert.ok(clipped.length <= 901, `${clipped.length}`);
    assert.ok(clipped.endsWith("…"));
  });
});

describe("presenter page", () => {
  it("renders a self-contained phone page with the transport hook and both locales", () => {
    const zh = buildPresenterPageHtml({ title: "季度复盘 <Q3>", lang: "zh" });
    assert.ok(zh.startsWith("<!doctype html>"));
    assert.ok(zh.includes("PPTRemote"), "transport hook");
    assert.ok(zh.includes("上一页") && zh.includes("下一页"));
    assert.ok(zh.includes("viewport-fit=cover"), "safe areas on notch phones");
    assert.ok(zh.includes("季度复盘 &lt;Q3&gt;"), "title escaped");
    assert.ok(!/<script src=/.test(zh), "no external script");

    const en = buildPresenterPageHtml({ title: "Q3 review", lang: "en" });
    assert.ok(en.includes("Prev") && en.includes("Next"));
  });
});
