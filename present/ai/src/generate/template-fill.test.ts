import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { THEMES } from "../themes";
import type { Outline } from "./schema";
import { templateFromThemeDef } from "./template/generate-template";
import type { Template } from "@ppt/core";
import { contentLayout, layoutsFromTemplate, presentationFromTemplateOutline, repairTemplateDeck, resolveVisualSource } from "./template-fill";

function outline(): Outline {
  return {
    title: "Deck",
    themeId: "ai",
    slides: [
      { title: "Cover title", bullets: ["A subtitle"] },
      { title: "Numbers", layoutHint: "chart", bullets: ["12", "18"] },
    ],
  };
}

describe("layout template fill", () => {
  it("fills placeholders and does not invent a chart layout", () => {
    const theme = THEMES.business;
    if (!theme) throw new Error("missing business theme");
    const template = templateFromThemeDef(theme, { idPrefix: "test" });
    const choices = layoutsFromTemplate(template);
    assert.ok(choices.some((c) => c.type === "obj"));
    assert.equal(choices.some((c) => /chart/i.test(c.type)), false);
    const body = contentLayout(choices);
    assert.equal(body?.type, "obj");

    const pres = presentationFromTemplateOutline(template, outline());
    assert.equal(pres.slides.length, 2);
    assert.equal(pres.slides[0]?.layoutRef?.layoutId, choices.find((c) => c.type === "title")?.id);
    assert.equal(pres.slides[1]?.layoutRef?.layoutId, body?.id);
    const text = pres.slides[1]?.layers[0]?.shapes
      .filter((s) => s.kind === "text")
      .map((s) => (s.kind === "text" ? s.paragraphs.flatMap((p) => p.runs.map((r) => r.text)).join("") : ""))
      .join("\n") ?? "";
    assert.match(text, /Numbers/);
    assert.match(text, /12/);
    assert.match(text, /18/);
  });

  it("repairs placeholder contrast and turns on shrink-to-fit when the words overflow", () => {
    const theme = THEMES.business;
    if (!theme) throw new Error("missing business theme");
    const template = templateFromThemeDef(theme, { idPrefix: "test" });
    const pres = presentationFromTemplateOutline(template, outline());
    const slide = pres.slides[1]!;
    slide.background = { kind: "solid", color: "#111111" };
    const body = slide.layers[0]?.shapes.find((s) => s.kind === "text" && s.placeholder?.type === "body");
    assert.ok(body && body.kind === "text");
    body.bbox = { x: 80, y: 160, w: 80, h: 28 };
    body.paragraphs = [{ runs: [{ text: "twelve people editing one page at the same time with notes", fontSize: 28, color: "#222222" }] }];
    repairTemplateDeck(pres);
    assert.equal(body.autoFit?.kind, "normAutofit");
    assert.notEqual(body.paragraphs[0]?.runs[0]?.color?.toLowerCase(), "#222222");
  });

  it("fills placeholders and keeps density when the template has both layers", () => {
    const theme = THEMES.business;
    if (!theme) throw new Error("missing business theme");
    const template = { ...templateFromThemeDef(theme, { idPrefix: "test" }), composition: "page 1 density text=2 cover=40%" };
    const plan = resolveVisualSource(template);
    assert.equal(plan.fillPlaceholders, true);
    assert.equal(plan.density, "page 1 density text=2 cover=40%");
    assert.equal(plan.composition, undefined);
  });

  it("follows the page layer when the template has no text placeholders", () => {
    const template: Template = {
      id: "user:pages",
      name: "Pages",
      source: "user",
      masters: [],
      composition: "page 1 density text=1 cover=10%",
    };
    const plan = resolveVisualSource(template);
    assert.equal(plan.fillPlaceholders, false);
    assert.equal(plan.composition, "page 1 density text=1 cover=10%");
    assert.equal(plan.density, undefined);
  });

  it("still fills a template that has no slides and no page layer", () => {
    const template: Template = { id: "user:masters", name: "Masters", source: "user", masters: [] };
    assert.deepEqual(resolveVisualSource(template), { fillPlaceholders: true });
  });
});
