import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { THEMES } from "../themes";
import { createHeadlessPort } from "../kernel";
import { templateFromThemeDef } from "../generate/template/generate-template";
import { presentationFromTemplateOutline } from "../generate/template-fill";
import { applyChangeProposal } from "./change-proposal";

describe("change proposal", () => {
  it("writes confirmed text and appends a slide on the deck's own layout", async () => {
    const theme = THEMES.business;
    if (!theme) throw new Error("missing business theme");
    const template = templateFromThemeDef(theme, { idPrefix: "test" });
    const pres = presentationFromTemplateOutline(template, {
      title: "Deck",
      themeId: "ai",
      slides: [{ title: "Old", bullets: ["Old body"] }],
    });
    const port = createHeadlessPort(pres);
    await applyChangeProposal(port, {
      summary: "update",
      edits: [{ slideIndex: 0, title: "New title", body: "New body", notes: "Say this" }],
      adds: [{ title: "Added", body: "More", notes: "" }],
      deletes: [],
    });
    const next = port.getPres();
    assert.equal(next.slides.length, 2);
    const first = next.slides[0]!;
    const joined = first.layers[0]!.shapes
      .filter((s) => s.kind === "text")
      .map((s) => (s.kind === "text" ? s.paragraphs.flatMap((p) => p.runs.map((r) => r.text)).join(" ") : ""))
      .join(" | ");
    assert.match(joined, /New title/);
    assert.match(joined, /New body/);
    assert.equal(first.notes, "Say this");
    assert.ok(next.slides[1]?.layoutRef?.layoutId);
  });
});
