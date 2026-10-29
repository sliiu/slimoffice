import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Shape } from "@ppt/core";
import { compileCanvasDeck } from "./pipeline.js";
import { resolveVisualSystem } from "./visual-system.js";
import { seedColorTheme } from "./color-theme.js";
import { pageNumeralOf, resolveAgendaTargets, snapCanvas } from "./snap.js";
import { jobFromOutlineItem, jobsFromPages } from "./jobs.js";
import { coerceDeckBrief, coerceFolio, defaultFolio, folioFromNotes } from "./brief.js";
import type { FilledSlide } from "./ir.js";
import { normalizeCanvasDeck } from "../generate/canvas-schema.js";
import { withFolioDecision } from "../generate/deckgen-adapter.js";

const sys = resolveVisualSystem("editorial");
const theme = seedColorTheme("editorial");

function textPage(layout: string, title: string, extra: FilledSlide["elements"] = []): FilledSlide {
  return {
    layout,
    variant: "canvas",
    elements: [
      { slot: "title", kind: "text", name: "slot:title", bbox: { x: 64, y: 60, w: 900, h: 60 }, paintRole: "ink", text: title, fontSize: sys.typeScale.h1 },
      { slot: "body", kind: "text", name: "slot:body", bbox: { x: 64, y: 160, w: 900, h: 120 }, paintRole: "ink", text: "Body copy that says something concrete about the topic at hand.", fontSize: sys.typeScale.body },
      ...extra,
    ],
  };
}

function agendaPage(items: Array<{ title: string; target?: number }>): FilledSlide {
  return {
    layout: "agenda",
    variant: "canvas",
    elements: [
      { slot: "title", kind: "text", name: "slot:title", bbox: { x: 64, y: 60, w: 900, h: 60 }, paintRole: "ink", text: "Contents", fontSize: sys.typeScale.h1 },
      { slot: "agenda", kind: "device", name: "device", bbox: { x: 64, y: 160, w: 1152, h: 480 }, paintRole: "surface", device: { type: "agendaList", items } },
    ],
  };
}

function deck(agenda: FilledSlide): FilledSlide[] {
  return [
    textPage("cover", "Annual review"),
    agenda,
    textPage("section", "Market"),
    textPage("evidence", "Revenue grew 24%"),
    textPage("section", "Product"),
    textPage("evidence", "Three launches shipped"),
    textPage("section", "People"),
    textPage("close", "Thank you"),
  ];
}

describe("agenda targets", () => {
  it("keeps explicit targets, matches titles, then falls back to the k-th section page", () => {
    const slides = deck(
      agendaPage([
        { title: "Market overview", target: 3 }, // explicit, valid
        { title: "Product" }, // by title → page 5
        { title: "Team" }, // no match → 3rd section after the agenda = page 7
        { title: "Contents", target: 2 }, // points at itself → repaired
      ]),
    );
    resolveAgendaTargets(slides);
    const items = slides[1]!.elements[1]!.device!.items!;
    assert.deepEqual(
      items.map((it) => it.target),
      [3, 5, 7, 4],
    );
  });

  it("emits every row as a slide-jump hyperlink grouped as one animation unit", () => {
    const out = compileCanvasDeck({
      system: sys,
      theme,
      title: "t",
      slides: deck(agendaPage([{ title: "Market" }, { title: "Product" }, { title: "People" }])),
    });
    const shapes = out.presentation.slides[1]!.layers[0]!.shapes;
    const linked = shapes.filter((s) => s.hyperlink?.kind === "slide");
    assert.ok(linked.length >= 6, `numeral + title (+ arrow) per row are linked, got ${linked.length}`);
    const targets = [...new Set(linked.map((s) => s.hyperlink!.target))].sort();
    assert.deepEqual(targets, ["3", "5", "7"]);
    const units = new Set(linked.map((s) => (s as Shape & { animUnit?: string }).animUnit));
    assert.equal(units.size, 3, "each row is one animUnit");
    // Titles are real text shapes carrying the section names.
    const titles = shapes.filter((s) => s.kind === "text" && /row\d\.title/.test(s.name ?? ""));
    assert.equal(titles.length, 3);
  });

  it("maps the outline hint to the agenda job with order relationships", () => {
    assert.equal(jobFromOutlineItem({ title: "Agenda", layoutHint: "agenda" }, 1, 10), "agenda");
    const jobs = jobsFromPages([{ title: "Cover" }, { title: "目录", layoutHint: "agenda", bullets: ["A", "B", "C"] }, { title: "Close" }]);
    assert.equal(jobs[1]!.job, "agenda");
    assert.equal(jobs[1]!.relationships, "order");
    assert.equal(jobs[1]!.wantsPhoto, false);
  });

  it("normalizes loose agenda rows and element links from the model", () => {
    const raw = {
      systemId: "editorial",
      slides: [
        {
          job: "agenda",
          elements: [
            { kind: "device", bbox: { x: 0, y: 0, w: 100, h: 100 }, device: { type: "toc" }, sections: [{ title: "A", page: "3" }, { title: "B", slide: 5 }] },
            { kind: "text", bbox: { x: 0, y: 0, w: 100, h: 20 }, text: "↩ contents", link: "page 2" },
          ],
        },
      ],
    };
    const norm = normalizeCanvasDeck(raw) as { slides: Array<{ elements: Array<Record<string, unknown>> }> };
    const dev = norm.slides[0]!.elements[0]!.device as { type: string; items: Array<{ target?: number }> };
    assert.equal(dev.type, "agendaList");
    assert.deepEqual(dev.items.map((it) => it.target), [3, 5]);
    assert.equal(norm.slides[0]!.elements[1]!.link, 2);
  });
});

describe("folio decision", () => {
  const numeral = (n: string): FilledSlide["elements"][number] => ({ slot: "num", kind: "text", name: "slot:num", bbox: { x: 64, y: 30, w: 40, h: 18 }, paintRole: "muted", text: n, fontSize: sys.typeScale.caption });

  it("folio=false strips authored page numerals but not KPI numbers", () => {
    const slides = [
      textPage("cover", "Cover"),
      textPage("evidence", "One", [numeral("02")]),
      textPage("evidence", "Two", [
        numeral("03"),
        { slot: "kpis", kind: "device", name: "d", bbox: { x: 64, y: 300, w: 1152, h: 200 }, paintRole: "surface", device: { type: "kpiRow", items: [{ value: "12", title: "markets" }, { value: "41%", title: "growth" }] } },
      ]),
      textPage("close", "Close"),
    ];
    const out = snapCanvas(slides, sys, { folio: false });
    for (const s of out) assert.equal(pageNumeralOf(s.elements), undefined, `${s.layout} has no numeral`);
    const kpi = out[2]!.elements.find((e) => e.text === "12");
    assert.ok(kpi, "KPI value 12 survives");
  });

  it("folio=true numbers every content page once, never the cover / section / close", () => {
    const slides = [
      textPage("cover", "Cover"),
      textPage("evidence", "One"),
      textPage("evidence", "Two", [numeral("03")]),
      textPage("section", "Part"),
      textPage("evidence", "Three"),
      textPage("close", "Close"),
    ];
    const out = compileCanvasDeck({ system: sys, theme, title: "t", slides, folio: true });
    const nums = out.painted.map((s) => pageNumeralOf(s.elements)?.text);
    assert.deepEqual(nums, [undefined, "02", "03", undefined, "05", undefined]);
    const injected = out.painted[1]!.elements.find((e) => e.slot === "folio")!;
    assert.equal(injected.fontSize, out.painted[2]!.elements.find((e) => e.slot === "num")!.fontSize, "one folio size");
    assert.equal(out.painted[2]!.elements.filter((e) => e.slot === "folio").length, 0, "authored numeral is kept, not doubled");
    assert.ok(!out.reflect.findings.some((f) => /numerals/.test(f.issue)), "count-up gate passes");
  });

  it("reads the user's words, then the organizer, then the deck default", () => {
    assert.equal(folioFromNotes("请加上页码，正式汇报"), true);
    assert.equal(folioFromNotes("不要页码"), false);
    assert.equal(folioFromNotes("Board deck, no page numbers please"), false);
    assert.equal(folioFromNotes("with page numbers"), true);
    // Mentioning page numbers only to hand the call to the AI is not a decision.
    assert.equal(folioFromNotes("页码由你按整篇的风格决定"), undefined);
    assert.equal(folioFromNotes("whether the deck carries page numbers is your call"), undefined);
    assert.equal(folioFromNotes("a deck about coffee"), undefined);
    assert.equal(coerceFolio("off"), false);
    assert.equal(coerceDeckBrief({ mode: "briefing", pageNumbers: "yes" }).folio, true);
    assert.equal(defaultFolio("showcase", 10), false);
    assert.equal(defaultFolio("briefing", 6), true);
    assert.equal(defaultFolio(undefined, 12), true);
    assert.equal(withFolioDecision({ mode: "showcase", folio: true }, { topic: "x", extraNotes: "no page numbers" }, 12).folio, false);
    assert.equal(withFolioDecision({ mode: "showcase" }, { topic: "x", pageNumbers: true }, 4).folio, true);
    assert.equal(withFolioDecision({ mode: "showcase" }, { topic: "x" }, 8).folio, false);
  });
});
