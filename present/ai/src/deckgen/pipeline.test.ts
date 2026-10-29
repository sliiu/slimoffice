import assert from "node:assert/strict";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  COLOR_THEME_IDS,
  COLOR_THEME_PALETTES,
  COLOR_THEME_PAIRING,
  LAYOUT_IDS,
  SLOT_CAPS,
  VISUAL_SYSTEM_IDS,
  applyColorTheme,
  assertThemePairing,
  enforceSlotCaps,
  fillPlans,
  generateDeck,
  generateDeckPair,
  isLayoutId,
  lockColorTheme,
  paletteOf,
  resolveColorTheme,
  resolveLayout,
  resolveVisualSystem,
  structureEqual,
  structureOf,
  type SlidePlan,
} from "./index.js";
import { SAMPLE_BRIEF, LONG_TEXT_BRIEF } from "./fixtures/briefs.js";

const here = dirname(fileURLToPath(import.meta.url));
const sampleDir = join(here, "samples");

function quads(pres: ReturnType<typeof generateDeck>["presentation"]): string[] {
  return pres.slides.map((s) => s.customData?.tags?.quad ?? `${s.name}`);
}

function writeSample(name: string, result: ReturnType<typeof generateDeck>): void {
  mkdirSync(sampleDir, { recursive: true });
  const body = {
    system: result.system.id,
    theme: result.theme.id,
    title: result.outline.title,
    slides: result.presentation.slides.map((s, i) => ({
      quad: s.customData?.tags?.quad,
      layout: result.plan[i]?.layout,
      variant: result.plan[i]?.variant,
      slots: Object.fromEntries(
        result.painted[i]!.elements
          .filter((e) => e.text)
          .map((e) => [e.name, e.text]),
      ),
    })),
  };
  writeFileSync(join(sampleDir, name), `${JSON.stringify(body, null, 2)}\n`);
}

describe("deckgen no-key catalog whitelist", () => {
  it("locks VisualSystem, Layout, Variant, and ColorTheme pairing tables", () => {
    assert.deepEqual([...VISUAL_SYSTEM_IDS], ["editorial", "swiss"]);
    assert.deepEqual([...LAYOUT_IDS], [
      "cover",
      "section",
      "statement",
      "quote",
      "bullets",
      "steps",
      "timeline",
      "cards",
      "bars",
      "loop",
      "split",
      "figure",
      "gallery",
      "kpi",
      "compare",
      "banner",
      "close",
    ]);
    assert.deepEqual([...COLOR_THEME_PAIRING.editorial], ["ink", "indigo", "kraft"]);
    assert.deepEqual([...COLOR_THEME_PAIRING.swiss], ["ikb", "signal", "lemon"]);
    assert.deepEqual([...COLOR_THEME_IDS], ["ink", "indigo", "kraft", "ikb", "signal", "lemon"]);
    assert.throws(() => resolveVisualSystem("monograph"));
    assert.throws(() => resolveLayout("hero", "hero-title"));
    assert.throws(() => resolveLayout("bullets", "stacked"));
    assert.throws(() => assertThemePairing("editorial", "ikb"));
    assert.throws(() => assertThemePairing("swiss", "ink"));
    assert.throws(() => lockColorTheme("editorial", "lemon"));
    lockColorTheme("editorial", "ink");
    lockColorTheme("swiss", "ikb");
  });

  it("registers the six ColorTheme palettes with locked token hex", () => {
    const expected = {
      ink: { bg: "#F1EFEA", surface: "#E8E5DE", ink: "#0A0A0B", muted: "#5C5852", line: "#C8C2B6", accent: "#0A0A0B", accentSoft: "#E8E5DE" },
      indigo: { bg: "#F1F3F5", surface: "#E4E8EC", ink: "#0A1F3D", muted: "#5A6B7D", line: "#C5CDD8", accent: "#0A1F3D", accentSoft: "#E4E8EC" },
      kraft: { bg: "#EEDFC7", surface: "#E0D0B6", ink: "#2A1E13", muted: "#6B5744", line: "#C9B396", accent: "#2A1E13", accentSoft: "#E0D0B6" },
      ikb: { bg: "#FAFAF8", surface: "#F0F0EE", ink: "#0A0A0A", muted: "#737373", line: "#D4D4D2", accent: "#002FA7", accentSoft: "#E8ECF6" },
      signal: { bg: "#FAFAF8", surface: "#F0F0EE", ink: "#0A0A0A", muted: "#737373", line: "#D4D4D2", accent: "#FF6B35", accentSoft: "#F6E8E2" },
      lemon: { bg: "#FAFAF8", surface: "#F0F0EE", ink: "#0A0A0A", muted: "#737373", line: "#D4D4D2", accent: "#C5E803", accentSoft: "#F3F6E0" },
    } as const;
    for (const id of COLOR_THEME_IDS) {
      assert.deepEqual(COLOR_THEME_PALETTES[id], expected[id]);
      const systemId = (COLOR_THEME_PAIRING.editorial as readonly string[]).includes(id) ? "editorial" : "swiss";
      const theme = resolveColorTheme(id, systemId);
      assert.deepEqual(paletteOf(theme), expected[id]);
    }
    const deck = generateDeck({ topic: "Palette", systemId: "editorial", themeId: "ink" });
    assert.equal(deck.presentation.theme?.colors?.bg, "#F1EFEA");
    assert.equal(deck.presentation.theme?.colors?.accent, "#0A0A0B");
    const swiss = generateDeck({ topic: "Palette", systemId: "swiss", themeId: "ikb" });
    assert.equal(swiss.presentation.theme?.colors?.accent, "#002FA7");
  });

  it("locks type roles: serif 700 editorial vs ExtraLight swiss, mono meta", () => {
    const ed = generateDeck({ topic: "Type", audience: "Leads", systemId: "editorial", themeId: "ink" });
    const cover = ed.painted.find((s) => s.layout === "cover");
    assert.ok(cover);
    const title = cover!.elements.find((e) => e.slot === "title");
    const meta = cover!.elements.find((e) => e.slot === "meta");
    assert.equal(title?.fontWeight, 700);
    assert.match(title?.fontFamily ?? "", /Playfair Display/);
    assert.equal(meta?.caps, "all");
    assert.match(meta?.fontFamily ?? "", /IBM Plex Mono/);
    const run = ed.presentation.slides[0]?.layers[0]?.shapes.find((s) => s.kind === "text" && s.name === "slot:title");
    assert.ok(run && run.kind === "text");
    assert.equal(run.paragraphs[0]?.runs[0]?.fontWeight, 700);

    const sw = generateDeck({ topic: "Type", systemId: "swiss", themeId: "ikb" });
    const st = sw.painted.find((s) => s.layout === "cover")?.elements.find((e) => e.slot === "title");
    assert.equal(st?.fontWeight, 200);
    assert.match(st?.fontFamily ?? "", /Inter/);
    assert.ok((st?.letterSpacing ?? 0) < 0);
    assert.equal(sw.presentation.theme?.colors?.bg, "#FAFAF8");
    assert.equal(sw.presentation.theme?.colors?.line, "#D4D4D2");
    assert.equal(sw.presentation.theme?.colors?.muted, "#737373");
  });
});

describe("emit masters", () => {
  it("writes a real slide master, layoutRef, and inherited solid background", () => {
    const deck = generateDeck({ ...SAMPLE_BRIEF, systemId: "editorial", themeId: "ink" });
    const master = deck.presentation.masters?.[0];
    assert.ok(master);
    assert.equal(master.background?.kind, "solid");
    if (master.background?.kind === "solid") {
      assert.equal(master.background.color, deck.presentation.theme?.colors?.bg);
    }
    assert.ok(master.layouts?.some((l) => l.id.endsWith("__cover")));
    assert.ok(master.layouts?.some((l) => l.type === "blank"));
    assert.ok(!master.shapes.some((s) => s.id.startsWith("dec_")));
    for (const slide of deck.presentation.slides) {
      assert.equal(slide.layoutRef?.masterId, master.id);
      assert.ok(master.layouts?.some((l) => l.id === slide.layoutRef?.layoutId));
      assert.equal(slide.background, undefined);
    }
  });
});

describe("gate 1 — cross-page consistency", () => {
  it("keeps one VisualSystem, type scale, 5% margin, and theme palette across a deck", () => {
    const deck = generateDeck({ ...SAMPLE_BRIEF, systemId: "editorial", themeId: "ink" });
    const sys = deck.system;
    const mx = 1280 * sys.grid.margin;
    const my = 720 * sys.grid.margin;
    const typeSet = new Set(
      [sys.typeScale.display, sys.typeScale.h1, sys.typeScale.h2, sys.typeScale.body, sys.typeScale.caption],
    );
    for (const slide of deck.painted) {
      assert.ok(isLayoutId(slide.layout));
      for (const el of slide.elements) {
        if (el.fontSize != null) assert.ok(typeSet.has(el.fontSize), `font ${el.fontSize}`);
        assert.ok(el.bbox.x >= mx - 0.5);
        assert.ok(el.bbox.y >= my - 0.5);
        assert.ok(el.bbox.x + el.bbox.w <= 1280 - mx + 0.5);
        assert.ok(el.bbox.y + el.bbox.h <= 720 - my + 0.5);
        assert.notEqual(el.align, "middle");
      }
    }
    const ids = new Set(deck.presentation.slides.map((s) => s.customData?.tags?.system));
    assert.deepEqual([...ids], ["editorial"]);
  });
});

describe("gate 2 — long text cut/split, never shrink", () => {
  it("truncates statement to 18 and splits bullets over 5 without changing type", () => {
    const longItems = [
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaXXX",
      "bbbbbbbbbbbbbbbbbbbbbbbbbbbbYYY",
      "ccccccccccccccccccccccccccccZZZ",
      "dddddddddddddddddddddddddddd111",
      "eeeeeeeeeeeeeeeeeeeeeeeeeeee222",
      "ffffffffffffffffffffffffffff333",
    ];
    const plans: SlidePlan[] = [
      {
        layout: "statement",
        variant: "single-line",
        claim: "This claim is way longer than eighteen",
      },
      { layout: "bullets", variant: "title-5", title: "Overflow", items: longItems },
      {
        layout: "kpi",
        variant: "number-row",
        title: "KPIs",
        kpis: [
          { value: "1", label: "a" },
          { value: "2", label: "b" },
          { value: "3", label: "c" },
          { value: "4", label: "d" },
        ],
      },
    ];
    const capped = enforceSlotCaps(plans);
    const statements = capped.filter((p) => p.layout === "statement");
    assert.equal(statements.length, 1);
    assert.ok([...(statements[0]!.claim ?? "")].length <= SLOT_CAPS.statementClaimChars);

    const bulletPages = capped.filter((p) => p.layout === "bullets");
    assert.equal(bulletPages.length, 2);
    assert.ok(bulletPages.every((p) => (p.items?.length ?? 0) <= SLOT_CAPS.bulletItems));
    assert.ok(
      bulletPages.every((p) => (p.items ?? []).every((it) => [...it.replace(/…$/, "")].length <= SLOT_CAPS.bulletItemChars)),
    );

    const kpiPages = capped.filter((p) => p.layout === "kpi");
    assert.equal(kpiPages.length, 2);
    assert.ok(kpiPages.every((p) => (p.kpis?.length ?? 0) <= SLOT_CAPS.kpiRow));

    const sys = resolveVisualSystem("editorial");
    const filled = fillPlans(capped, sys);
    for (const slide of filled) {
      for (const el of slide.elements) {
        if (el.fontSize != null) {
          assert.ok(
            [sys.typeScale.display, sys.typeScale.h1, sys.typeScale.h2, sys.typeScale.body, sys.typeScale.caption].includes(
              el.fontSize,
            ),
          );
        }
      }
    }
    const painted = applyColorTheme(filled, lockColorTheme("editorial", "ink"));
    for (const slide of painted) {
      for (const el of slide.elements) {
        assert.ok(el.bbox.x >= 1280 * 0.05 - 0.5);
        assert.ok(el.bbox.x + el.bbox.w <= 1280 * 0.95 + 0.5);
      }
    }

    const live = generateDeck({ ...LONG_TEXT_BRIEF, systemId: "editorial", themeId: "indigo" });
    const liveBullets = live.plan.filter((p) => p.layout === "bullets");
    assert.ok(liveBullets.length >= 2, "long evidence must split title-5 pages");
    writeSample("long-text.json", live);
  });
});

describe("gate 3 — ColorTheme swap is structure-stable", () => {
  it("editorial ink vs indigo keeps layouts/variants/bboxes", () => {
    const { a, b } = generateDeckPair({ ...SAMPLE_BRIEF, systemId: "editorial" }, "ink", "indigo");
    assert.equal(a.system.id, b.system.id);
    assert.equal(a.theme.id, "ink");
    assert.equal(b.theme.id, "indigo");
    assert.ok(structureEqual(a.painted, b.painted), "ColorTheme must not change structure");
    assert.deepEqual(
      a.plan.map((p) => `${p.layout}/${p.variant}`),
      b.plan.map((p) => `${p.layout}/${p.variant}`),
    );
    writeSample("editorial-ink.json", a);
    writeSample("editorial-indigo.json", b);
  });

  it("swiss ikb vs signal keeps structure", () => {
    const { a, b } = generateDeckPair({ ...SAMPLE_BRIEF, systemId: "swiss" }, "ikb", "signal");
    assert.ok(structureEqual(a.painted, b.painted));
    writeSample("swiss-ikb.json", a);
  });
});

describe("gate 4 — layout whitelist + slot caps", () => {
  it("emits whitelist layouts and matching variants", () => {
    const deck = generateDeck({ ...SAMPLE_BRIEF, systemId: "editorial", themeId: "kraft" });
    for (const slide of deck.plan) {
      assert.ok(isLayoutId(slide.layout));
      resolveLayout(slide.layout, slide.variant);
    }
    assert.ok(quads(deck.presentation).every((q) => q.startsWith("editorial/")));
    const used = new Set(deck.plan.map((p) => p.layout));
    for (const id of ["cover", "section", "quote", "cards", "close"] as const) {
      assert.ok(used.has(id), `expected ${id} in sample plan`);
    }
  });

  it("fills every locked layout/variant without leaving the type scale", () => {
    const sys = resolveVisualSystem("editorial");
    const typeSet = new Set(
      [sys.typeScale.display, sys.typeScale.h1, sys.typeScale.h2, sys.typeScale.body, sys.typeScale.caption],
    );
    const items = ["Alpha", "Beta", "Gamma", "Delta", "Epsilon", "Zeta"];
    const kpis = items.slice(0, 4).map((label, i) => ({ value: String(i + 1), label }));
    const plans: SlidePlan[] = [
      { layout: "cover", variant: "poster", title: "Poster" },
      { layout: "statement", variant: "question", claim: "Why now" },
      { layout: "quote", variant: "serif-mark", claim: "A longer pull quote lives here" },
      { layout: "quote", variant: "band", claim: "Band quote on paper not lemon" },
      { layout: "steps", variant: "row-5", title: "Steps", items: items.slice(0, 5) },
      { layout: "steps", variant: "row-3", title: "Three", items: items.slice(0, 3) },
      { layout: "timeline", variant: "horizontal", title: "When", items: items.slice(0, 4) },
      { layout: "timeline", variant: "vertical", title: "When", items: items.slice(0, 5) },
      { layout: "cards", variant: "three", title: "Three", items: items.slice(0, 3) },
      { layout: "cards", variant: "four", title: "Four", items: items.slice(0, 4) },
      { layout: "cards", variant: "six", title: "Six", items: items },
      { layout: "bars", variant: "tower", title: "Tower", items: ["A|40", "B|70", "C|20"] },
      { layout: "bars", variant: "horizontal", title: "H-bar", items: ["A|40", "B|70"] },
      { layout: "loop", variant: "cycle-4", title: "Loop", items: items.slice(0, 4) },
      { layout: "split", variant: "figure-text", title: "Lead", rightItems: items.slice(0, 3) },
      { layout: "figure", variant: "hero", title: "Hero figure" },
      { layout: "gallery", variant: "trio", title: "Trio", items: items.slice(0, 3) },
      { layout: "gallery", variant: "matrix", title: "Matrix", items },
      { layout: "kpi", variant: "ledger", title: "Ledger", kpis },
      { layout: "banner", variant: "ink-band", title: "Now", next: "Ship the file" },
      { layout: "close", variant: "manifesto", title: "Own the file", items: items.slice(0, 3) },
    ];
    const filled = fillPlans(plans, sys);
    assert.equal(filled.length, plans.length);
    for (const slide of filled) {
      resolveLayout(slide.layout, slide.variant);
      assert.ok(slide.elements.length > 0, `${slide.layout}/${slide.variant}`);
      for (const el of slide.elements) {
        if (el.fontSize != null) assert.ok(typeSet.has(el.fontSize), `${slide.layout} font ${el.fontSize}`);
      }
    }
  });
});

describe("gate 5 — system bans", () => {
  it("forbids radius, shadow, gradient, and swiss centered display", () => {
    const swiss = generateDeck({ ...SAMPLE_BRIEF, systemId: "swiss", themeId: "lemon" });
    const master = swiss.presentation.masters?.[0];
    assert.ok(master);
    assert.equal(master.background?.kind, "solid");
    for (const slide of swiss.presentation.slides) {
      assert.ok(slide.layoutRef?.masterId === master.id);
      assert.ok(!slide.background || slide.background.kind === "solid");
      for (const layer of slide.layers) {
        for (const sh of layer.shapes) {
          assert.ok(!sh.shadow);
          if (sh.kind === "rect") assert.ok(sh.rx == null || sh.rx === 0);
          if (sh.fill) assert.equal(sh.fill.kind, "solid");
          if (sh.kind === "text") {
            for (const p of sh.paragraphs) assert.notEqual(p.align, "middle");
          }
        }
      }
    }
    assert.equal(swiss.system.bans.centeredDisplay, true);
    assert.equal(resolveVisualSystem("editorial").bans.gradients, true);
  });
});

describe("gate 6 — no invented layouts, no free hex, pairing", () => {
  it("rejects invented page types and wrong pairings", () => {
    assert.throws(() => resolveLayout("masonry", "title-5"));
    assert.throws(() => generateDeck({ topic: "x", systemId: "editorial", themeId: "ikb" }));
    assert.throws(() => generateDeck({ topic: "x", systemId: "swiss", themeId: "ink" }));
  });

  it("binds every painted color to the registered ColorTheme palette", () => {
    const deck = generateDeck({ ...SAMPLE_BRIEF, systemId: "swiss", themeId: "ikb" });
    const allowed = new Set(Object.values(deck.presentation.theme?.colors ?? {}).map((c) => c.toLowerCase()));
    for (const slide of deck.painted) {
      for (const el of slide.elements) {
        assert.ok(allowed.has(el.color.toLowerCase()), el.color);
      }
    }
  });
});

describe("negative fixtures on disk", () => {
  it("loads samples/negative and each case fails the documented gate", () => {
    const dir = join(sampleDir, "negative");
    const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
    assert.ok(files.length >= 4, `expected ≥4 negative fixtures, got ${files.join(",")}`);
    for (const file of files) {
      const raw = JSON.parse(readFileSync(join(dir, file), "utf8")) as {
        expect: string;
        gate: string;
        reason: string;
        input?: { topic: string; systemId: "editorial" | "swiss"; themeId: string };
        plan?: Array<{ layout: string; variant: string }>;
      };
      assert.equal(raw.expect, "fail");
      assert.match(file, /^fail-/);
      let message = "";
      try {
        if (raw.input) {
          generateDeck({
            topic: raw.input.topic,
            systemId: raw.input.systemId,
            themeId: raw.input.themeId as "ink",
          });
        } else if (raw.plan) {
          for (const step of raw.plan) resolveLayout(step.layout, step.variant);
        } else {
          assert.fail(`${file} has neither input nor plan`);
        }
      } catch (e) {
        message = e instanceof Error ? e.message : String(e);
      }
      assert.ok(message, `${file} must fail`);
      assert.equal(message, raw.reason, file);
    }
  });
});

describe("QA sample labels", () => {
  it("labels slides as system/layout/variant/theme quads", () => {
    const deck = generateDeck({ ...SAMPLE_BRIEF, systemId: "editorial", themeId: "ink" });
    for (const q of quads(deck.presentation)) {
      const parts = q.split("/");
      assert.equal(parts.length, 4);
      assert.equal(parts[0], "editorial");
      assert.equal(parts[3], "ink");
      assert.ok(isLayoutId(parts[1]!));
    }
    // Structure snapshot for QA (not a color pack).
    writeFileSync(
      join(sampleDir, "structure-editorial-ink.json"),
      `${JSON.stringify(structureOf(deck.painted), null, 2)}\n`,
    );
  });
});
