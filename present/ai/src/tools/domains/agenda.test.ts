import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { identityTransform, type Presentation, type Slide, type TextShape } from "@ppt/core";
import { createHeadlessPort } from "../../kernel/port";
import { createToolRuntime } from "../types";
import { defaultConfig } from "../../config/types";
import { agendaTools, agendaRowsFromDeck } from "./agenda";
import { iconTools } from "./icons";
import { compileCanvasDeck } from "../../deckgen/pipeline";
import { resolveVisualSystem } from "../../deckgen/visual-system";
import { seedColorTheme } from "../../deckgen/color-theme";
import type { FilledSlide } from "../../deckgen/ir";

type AnyTool = { name: string; execute: (rt: ReturnType<typeof createToolRuntime>, input: unknown) => unknown };
const tool = (name: string): AnyTool => ([...agendaTools, ...iconTools] as unknown as AnyTool[]).find((t) => t.name === name)!;

function rtFor(pres: Presentation) {
  const port = createHeadlessPort(pres);
  return { rt: createToolRuntime({ port, getConfig: () => defaultConfig() }), port };
}

function textSlide(id: string, title: string, size = 40, extra: Partial<Slide> = {}): Slide {
  const t: TextShape = {
    id: `${id}_t`,
    name: "Title",
    zIndex: 0,
    visible: true,
    locked: false,
    opacity: 1,
    transform: identityTransform(),
    kind: "text",
    bbox: { x: 40, y: 40, w: 800, h: 80 },
    wrap: true,
    vAlign: "top",
    paragraphs: [{ align: "start", runs: [{ text: title, fontSize: size, color: "#111111" }] }],
  };
  return { id, name: id, index: 0, layers: [{ id: "l", name: "Main", visible: true, locked: false, shapes: [t] }], ...extra };
}

function plainDeck(): Presentation {
  return {
    id: "p",
    size: { width: 960, height: 540 },
    slides: [
      textSlide("s0", "Cover"),
      textSlide("s1", "Market", 40, { layoutRef: { masterId: "m", layoutId: "m__section" } }),
      textSlide("s2", "Revenue up 24%", 28),
      textSlide("s3", "Product", 40, { layoutRef: { masterId: "m", layoutId: "m__section" } }),
      textSlide("s4", "Launches", 28),
      textSlide("s5", "Thanks"),
    ],
    theme: { id: "t", name: "t", colors: { dk1: "#1F2937", lt1: "#FFFFFF", accent1: "#2563EB" }, fonts: { major: "Arial", minor: "Arial" } },
  } as Presentation;
}

describe("insertAgendaSlide", () => {
  it("derives section rows, shifts targets past the insertion point, and links every row", () => {
    const pres = plainDeck();
    const rows = agendaRowsFromDeck(pres, 1);
    assert.deepEqual(rows, [
      { title: "Market", target: 3 },
      { title: "Product", target: 5 },
    ]);
    const { rt, port } = rtFor(pres);
    const res = tool("insertAgendaSlide").execute(rt, {}) as { ok: boolean; slideIdx?: number; linkedShapes?: number; error?: string };
    assert.equal(res.ok, true, res.error ?? "");
    const after = port.getPres();
    assert.equal(after.slides.length, 7);
    const agenda = after.slides[1]!;
    assert.equal(agenda.layoutRef, undefined, "no foreign master reference");
    assert.equal(agenda.background?.kind, "solid");
    const links = agenda.layers[0]!.shapes.filter((s) => s.hyperlink?.kind === "slide").map((s) => s.hyperlink!.target);
    assert.deepEqual([...new Set(links)].sort(), ["3", "5"]);
    assert.ok((res.linkedShapes ?? 0) >= 4);
    // Scaled to the 960×540 deck: nothing beyond the page.
    for (const s of agenda.layers[0]!.shapes) assert.ok(s.bbox.x + s.bbox.w <= 961 && s.bbox.y + s.bbox.h <= 541, `${s.name} inside page`);
    const title = agenda.layers[0]!.shapes.find((s) => s.kind === "text" && /slot:title/.test(s.name ?? "")) as TextShape;
    assert.equal(title.paragraphs[0]!.runs[0]!.text, "Contents");
  });

  it("keeps the deckgen master and picks the CJK title on a generated deck", () => {
    const sys = resolveVisualSystem("editorial");
    const page = (layout: string, title: string): FilledSlide => ({
      layout,
      variant: "canvas",
      elements: [{ slot: "title", kind: "text", name: "slot:title", bbox: { x: 64, y: 60, w: 900, h: 60 }, paintRole: "ink", text: title, fontSize: sys.typeScale.h1 }],
    });
    const compiled = compileCanvasDeck({
      system: sys,
      theme: seedColorTheme("editorial"),
      title: "t",
      slides: [page("cover", "年度回顾"), page("section", "市场"), page("evidence", "收入增长"), page("section", "产品"), page("close", "谢谢")],
    });
    const { rt, port } = rtFor(compiled.presentation);
    const res = tool("insertAgendaSlide").execute(rt, { items: [{ title: "市场", target: 3 }, { title: "产品", target: 5 }] }) as { ok: boolean; error?: string };
    assert.equal(res.ok, true, res.error ?? "");
    const agenda = port.getPres().slides[1]!;
    assert.ok(agenda.layoutRef?.masterId, "keeps a master reference on a deckgen deck");
    const title = agenda.layers[0]!.shapes.find((s) => s.kind === "text" && /slot:title/.test(s.name ?? "")) as TextShape;
    assert.equal(title.paragraphs[0]!.runs[0]!.text, "目录");
  });

  it("rejects targets that point at the agenda itself or past the deck", () => {
    const { rt } = rtFor(plainDeck());
    const res = tool("insertAgendaSlide").execute(rt, { insertAt: 1, items: [{ title: "a", target: 2 }, { title: "b", target: 9 }] }) as { ok: boolean; error?: string };
    assert.equal(res.ok, false);
    assert.match(res.error ?? "", /2, 9/);
  });
});

describe("insertIcon", () => {
  it("adds a stroke path in the theme accent and suggests ids for typos", () => {
    const { rt, port } = rtFor(plainDeck());
    const bad = tool("insertIcon").execute(rt, { slideIdx: 0, icon: "shield-chek", bbox: { x: 10, y: 10, w: 32, h: 32 } }) as { ok: boolean; error?: string };
    assert.equal(bad.ok, false);
    assert.match(bad.error ?? "", /Did you mean/);
    const res = tool("insertIcon").execute(rt, { slideIdx: 0, icon: "ShieldCheck", bbox: { x: 10, y: 10, w: 32, h: 48 } }) as { ok: boolean; shapeId?: string; color?: string };
    assert.equal(res.ok, true);
    assert.equal(res.color, "#2563EB");
    const shape = port.getPres().slides[0]!.layers[0]!.shapes.find((s) => s.id === res.shapeId)!;
    assert.equal(shape.kind, "path");
    assert.deepEqual(shape.bbox, { x: 10, y: 18, w: 32, h: 32 });
  });
});
