import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { compilePresentation, outlineToFallbackSpec } from "./compile";
import {
  applyCompileConstraints,
  GENERATE_BRIEF_CONSTRAINTS,
  isFullBleedRole,
  isNoBulletLayout,
  isWebExclusiveKind,
  WEB_EXCLUSIVE_MIN_PAGES,
} from "./constraints";
import { runP0Gates } from "../qa/gates";
import type { Outline } from "../schema";

function bulletsOutline(pages: number): Outline {
  return {
    title: "Wizard brief",
    themeId: "business",
    slides: Array.from({ length: pages }, (_, i) => ({
      title: i === 0 ? "Opening" : i === pages - 1 ? "Thanks" : `Point ${i}`,
      layoutHint: "bullets" as const,
      bullets: [`Fact ${i}a`, `Fact ${i}b`, `Fact ${i}c`],
    })),
  };
}

describe("applyCompileConstraints", () => {
  it("keeps generate-brief constants independent of lockLayouts", () => {
    assert.deepEqual([...GENERATE_BRIEF_CONSTRAINTS.fullBleedRoles], ["cover", "section", "closing", "hero"]);
    assert.deepEqual([...GENERATE_BRIEF_CONSTRAINTS.webExclusiveLayouts], [
      "cards",
      "process",
      "comparison",
      "two-column",
    ]);
    assert.equal(GENERATE_BRIEF_CONSTRAINTS.webExclusiveMinPages, 4);
  });

  it("forces full-bleed roles, web-exclusive quota, and no-bullet layouts on a 16-page bullets outline", () => {
    const raw = outlineToFallbackSpec(bulletsOutline(16), { injectMissingCover: false });
    const { spec } = applyCompileConstraints(raw, { topic: "Launch" });
    assert.ok(isFullBleedRole(spec.slides[0]?.kind), `opener kind=${spec.slides[0]?.kind}`);
    assert.ok(isFullBleedRole(spec.slides[spec.slides.length - 1]?.kind), "closer is full-bleed role");
    const web = spec.slides.filter((s) => isWebExclusiveKind(s.kind));
    assert.ok(web.length >= WEB_EXCLUSIVE_MIN_PAGES, `web-exclusive count=${web.length}`);
    for (const s of spec.slides) {
      if (!isFullBleedRole(s.kind)) continue;
      const q = (s as { bgImageQuery?: string }).bgImageQuery;
      assert.ok(q && q.trim().length > 0, `${s.kind} missing bgImageQuery`);
    }
  });

  it("compiles constrained 16-page deck with bleed overlay, named web layouts, and no bullets on gated kinds", () => {
    const raw = outlineToFallbackSpec(bulletsOutline(16), { injectMissingCover: false });
    const pres = compilePresentation(raw, { size: { width: 1280, height: 720 } });
    assert.equal(pres.slides.length, 16);
    const cover = pres.slides[0]!;
    assert.equal(cover.background?.kind, "image");
    const overlay = cover.layers[0]!.shapes.find((s) => s.name === "BG overlay" || s.id.startsWith("bgov_"));
    assert.ok(overlay, "cover missing BG overlay");
    const webNames = pres.slides.filter((s) => isWebExclusiveKind(s.name)).length;
    assert.ok(webNames >= WEB_EXCLUSIVE_MIN_PAGES, `named web-exclusive=${webNames}`);
    for (const slide of pres.slides) {
      if (!isNoBulletLayout(slide.name)) continue;
      for (const layer of slide.layers) {
        for (const sh of layer.shapes) {
          if (sh.kind !== "text") continue;
          for (const para of sh.paragraphs) {
            assert.equal(para.bullet, undefined, `${slide.name} still has bullets`);
          }
        }
      }
    }
  });

  it("constraintsEnabled A/B: off fails P0 gates, on passes the 16-page bullets outline", () => {
    const raw = outlineToFallbackSpec(bulletsOutline(16), { injectMissingCover: false });
    const presOff = compilePresentation(raw, {
      size: { width: 1280, height: 720 },
      designSeed: 1,
      constraintsEnabled: false,
    });
    assert.equal(runP0Gates(presOff).passed, false);
    const presOn = compilePresentation(raw, {
      size: { width: 1280, height: 720 },
      designSeed: 1,
      constraintsEnabled: true,
    });
    assert.equal(runP0Gates(presOn).passed, true);
  });
});

describe("P0 gates stay fail-closed", () => {
  it("still fails the 16-page bad-deck shape (cover solid / too few web pages)", () => {
    const pres = compilePresentation(
      {
        themeId: "business",
        slides: [
          { kind: "cover", title: "Bad" },
          ...Array.from({ length: 14 }, () => ({ kind: "bullets" as const, title: "Body", bullets: ["a"] })),
          { kind: "closing", title: "End" },
        ],
      },
      { size: { width: 1280, height: 720 } },
    );
    for (const slide of pres.slides) {
      slide.background = { kind: "solid", color: "#111111" };
      slide.layers[0]!.shapes = slide.layers[0]!.shapes.filter((s) => s.name !== "BG overlay" && !s.id.startsWith("bgov_"));
      slide.notes = "";
    }
    pres.slides[0]!.name = "Cover";
    for (let i = 1; i < pres.slides.length; i++) pres.slides[i]!.name = `Bullets ${i}`;
    const result = runP0Gates(pres);
    assert.equal(result.passed, false);
    const kinds = result.findings.map((f) => f.kind);
    assert.ok(kinds.includes("cover-visual"));
    assert.ok(kinds.includes("web-exclusive"));
  });
});
