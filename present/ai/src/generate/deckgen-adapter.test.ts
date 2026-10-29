import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Presentation } from "@ppt/core";
import {
  COLOR_THEME_PAIRING,
  DEFAULT_COLOR_THEME,
  LAYOUT_IDS,
  LAYOUT_VARIANTS,
  isLayoutId,
  isVariantForLayout,
  resolveVisualSystem,
  type FilledSlide,
  type GenerateDeckResult,
} from "../deckgen/index.js";
import { jobsFromPages } from "../deckgen/jobs.js";
import {
  assertDeckgenBoundary,
  compileDeckgenPresentation,
  generatePresentationViaDeckgen,
  isDeckgenGenerateEnabled,
  describeUnchangedPages,
  fillMissingPhotos,
  withPhotoDecision,
  mergeCanvasPages,
  repairScope,
  resolveDeckgenSystem,
  resolveDeckgenTheme,
  toDeckgenInput,
} from "./deckgen-adapter.js";
import { generateFromOutline, generatePresentation } from "./pipeline.js";
import type { Outline } from "./schema.js";

function editorModelOk(pres: Presentation): void {
  assert.ok(pres.id.startsWith("deckgen_"));
  assert.deepEqual(pres.size, { width: 1280, height: 720 });
  assert.ok(pres.slides.length >= 3, `slides=${pres.slides.length}`);
  assert.ok(pres.theme?.id, "theme.id");
  assert.ok(pres.theme?.colors?.bg, "theme.colors.bg");
  assert.ok(pres.meta && typeof pres.meta === "object");
  const meta = pres.meta as { deckgen?: { system?: string; theme?: string } };
  assert.ok(meta.deckgen?.system, "meta.deckgen.system");
  assert.ok(meta.deckgen?.theme, "meta.deckgen.theme");
  assert.ok(pres.masters?.length, "masters");
  const master = pres.masters![0]!;
  assert.ok(master.layouts?.length, "master.layouts");
  assert.equal(master.background?.kind, "solid");
  for (const slide of pres.slides) {
    assert.ok(slide.layoutRef?.masterId === master.id, `slide ${slide.id} layoutRef`);
    assert.ok(
      master.layouts!.some((l) => l.id === slide.layoutRef!.layoutId),
      `slide ${slide.id} layout ${slide.layoutRef?.layoutId}`,
    );
    const inherited: boolean = slide.background == null && master.background != null;
    assert.ok(slide.background || inherited, `slide ${slide.id} background`);
    if (slide.background?.kind === "image") assert.equal(slide.showMasterSp, false);
    assert.ok(slide.layers?.[0]?.shapes?.length, `slide ${slide.id} has shapes`);
    const quad = slide.customData?.tags?.quad ?? "";
    const [system, layout, variant, theme] = quad.split("/");
    assert.ok(isLayoutId(layout ?? ""), `layout ${layout}`);
    assert.ok(LAYOUT_IDS.includes(layout as (typeof LAYOUT_IDS)[number]), quad);
    assert.ok(isVariantForLayout(layout as (typeof LAYOUT_IDS)[number], variant ?? ""), quad);
    assert.ok(
      (COLOR_THEME_PAIRING[system as keyof typeof COLOR_THEME_PAIRING] as readonly string[] | undefined)?.includes(
        theme ?? "",
      ),
      `pairing ${quad}`,
    );
  }
}

const outline: Outline = {
  title: "Why local-first decks win",
  subtitle: "Product leads",
  themeId: "ai",
  slides: [
    { title: "Own the file, not the tab", layoutHint: "cover" },
    { title: "Offline edit stays authoritative", layoutHint: "bullets", bullets: ["No tab lock-in", "File is source"] },
    { title: "Export remains a round-trip", layoutHint: "closing" },
  ],
};

describe("deckgen generate flag", () => {
  it("is always ON (useDeckgen is ignored)", () => {
    assert.equal(isDeckgenGenerateEnabled({}), true);
    assert.equal(isDeckgenGenerateEnabled({ useDeckgen: true }), true);
    assert.equal(isDeckgenGenerateEnabled({ useDeckgen: false }), true);
  });
});

describe("toDeckgenInput honors a reviewed outline", () => {
  it("emits one page per outline slide even without deckgenLayout pills", () => {
    const input = toDeckgenInput({ topic: "Ignored topic", styleFamily: "editorial" }, outline);
    assert.equal(input.pages?.length, outline.slides.length);
    assert.equal(input.pages?.[0]?.layout, "cover");
    assert.equal(input.pages?.[1]?.layout, "bullets");
    assert.equal(input.pages?.[2]?.layout, "close");
  });

  it("one-click generate without outline still uses the narrative template", () => {
    const input = toDeckgenInput({ topic: "Why local-first decks win", styleFamily: "editorial" });
    assert.equal(input.pages, undefined);
  });
});

describe("deckgen boundary mapping", () => {
  it("maps styleFamily / visualSystem onto the two-id whitelist", () => {
    assert.equal(resolveDeckgenSystem({ topic: "x", styleFamily: "swiss" }), "swiss");
    assert.equal(resolveDeckgenSystem({ topic: "x", styleFamily: "editorial" }), "editorial");
    assert.equal(resolveDeckgenSystem({ topic: "x", visualSystem: "B" }), "editorial");
    assert.equal(resolveDeckgenSystem({ topic: "x" }), "editorial");
    assert.equal(resolveDeckgenTheme("editorial"), DEFAULT_COLOR_THEME.editorial);
    assert.equal(resolveDeckgenTheme("swiss", "signal"), "signal");
    assert.equal(resolveDeckgenTheme("editorial", "ai"), "ink");
    assert.equal(resolveDeckgenTheme("editorial", "ikb"), "ikb");
    assert.equal(resolveDeckgenTheme("swiss", "ink"), "ink");
  });

  it("named themes are seeds; fill remaps unpaired ids instead of throwing", () => {
    assert.doesNotThrow(() =>
      assertDeckgenBoundary({ topic: "x", systemId: "editorial", themeId: "ikb" }),
    );
    assert.doesNotThrow(() => assertDeckgenBoundary({ topic: "x", systemId: "swiss", themeId: "ink" }));
    const fill = toDeckgenInput({ topic: "x", styleFamily: "editorial", themeId: "ikb" });
    assert.equal(fill.themeId, "ink");
    assert.equal(toDeckgenInput({ topic: "x", styleFamily: "swiss", themeId: "ink" }).themeId, "ikb");
  });
});

describe("generate entry → deckgen → editor model", () => {
  it("generatePresentation (default ON) emits an editable Presentation", async () => {
    const drafts: Presentation[] = [];
    const pres = await generatePresentation(
      { topic: "Why local-first decks win", audience: "Product leads", styleFamily: "editorial" },
      { onPresentationDraft: (p) => drafts.push(p), wallClock: false },
    );
    editorModelOk(pres);
    assert.equal((pres.meta as { deckgen: { system: string; theme: string } }).deckgen.system, "editorial");
    assert.equal((pres.meta as { deckgen: { theme: string } }).deckgen.theme, "ink");
    assert.ok(drafts.length >= 1);
    assert.equal(drafts[0]?.id, pres.id);
  });

  it("generateFromOutline feeds outline titles into deckgen and keeps swiss pairing", async () => {
    const pres = await generateFromOutline(outline, { topic: "Ignored topic", styleFamily: "swiss" }, {
      wallClock: false,
    });
    editorModelOk(pres);
    assert.equal(pres.slides.length, outline.slides.length, "must keep the reviewed outline, not rebuild a 7-beat narrative");
    assert.equal((pres.meta as { deckgen: { system: string; theme: string } }).deckgen.system, "swiss");
    assert.equal((pres.meta as { deckgen: { theme: string } }).deckgen.theme, "ikb");
    const text = pres.slides
      .flatMap((s) => s.layers[0]!.shapes)
      .flatMap((sh) => ("paragraphs" in sh ? sh.paragraphs.flatMap((p) => p.runs.map((r) => r.text)) : []))
      .join("\n");
    assert.match(text, /Own the file/);
    assert.match(text, /Offline edit/);
    assert.match(text, /round-trip/i);
  });

  it("adapter and generate entry stay on the locked variant table", async () => {
    const pres = await generatePresentationViaDeckgen({ topic: "Variant lock", styleFamily: "editorial" }, outline);
    assert.equal(pres.slides.length, outline.slides.length);
    for (const slide of pres.slides) {
      const layout = slide.customData?.tags?.layout as (typeof LAYOUT_IDS)[number];
      const variant = slide.customData?.tags?.variant ?? "";
      assert.ok((LAYOUT_VARIANTS[layout] as readonly string[]).includes(variant), `${layout}/${variant}`);
    }
  });

  it("entrance animations target real shapes and hide them at slide start", async () => {
    // Regression: shape ids without the `sp_` prefix produced timing nodes whose
    // spid resolved to nothing → nothing hidden, every element visible, no motion.
    const pres = await generateFromOutline(outline, { topic: "Motion" }, { wallClock: false });
    let effects = 0;
    let hidden = 0;
    for (const slide of pres.slides) {
      const ids = new Set<string>();
      const walk = (s: { id: string; kind: string; children?: { id: string; kind: string }[] }): void => {
        ids.add(s.id);
        if (s.kind === "group") for (const c of s.children ?? []) walk(c as never);
      };
      for (const layer of slide.layers) for (const s of layer.shapes) walk(s);
      for (const id of ids) assert.ok(id.startsWith("sp_"), `shape id "${id}" breaks the sp_<spid> contract`);

      const spids = [...JSON.stringify(slide.ooxmlTiming ?? {}).matchAll(/"spid":"([^"]+)"/g)].map((m) => m[1]!);
      for (const spid of spids) assert.ok(ids.has(`sp_${spid}`), `timing target ${spid} has no shape on slide ${slide.id}`);
      effects += spids.length;
      hidden += slide.layers.flatMap((l) => l.shapes).filter((s) => s.opacity === 0).length;
    }
    assert.ok(effects > 0, "auto-animate should attach at least one entrance");
    assert.ok(hidden > 0, "shapes with an entrance must start hidden (opacity 0)");
  });

  it("useDeckgen: false is ignored (still compiles via deckgen without an API key)", async () => {
    const pres = await generateFromOutline(outline, { topic: "Legacy" }, { useDeckgen: false, wallClock: false });
    editorModelOk(pres);
    assert.equal(pres.slides.length, outline.slides.length);
  });

  it("resume from write keeps the compiled deck and skips re-author", async () => {
    const compiled = compileDeckgenPresentation({ topic: "Resume", styleFamily: "editorial" }, outline);
    const marker = "resume-keep";
    compiled.meta = { ...(compiled.meta ?? {}), resumeMarker: marker };
    const pres = await generateFromOutline(outline, { topic: "Resume", styleFamily: "editorial" }, {
      resume: { stage: "write", presentation: compiled, outline },
      wallClock: false,
      enableArtDirector: false,
      enableImageEnrichment: false,
      enableQaRepair: false,
      enableAnimations: false,
    });
    assert.equal((pres.meta as { resumeMarker?: string }).resumeMarker, marker);
    assert.equal(pres.slides.length, compiled.slides.length);
  });

  it("repairScope names the pages to re-author, or falls back to the full deck", () => {
    const f = (slideIdx: number, pages?: number[]) => ({ kind: "content" as const, slideIdx, issue: "x", ...(pages ? { pages } : {}) });
    assert.deepEqual(repairScope([f(3), f(1), f(3)], 8), [1, 3]);
    // Deck-level finding that lists its pages joins the scope.
    assert.deepEqual(repairScope([f(1), f(-1, [6])], 8), [1, 6]);
    // Deck-level finding without pages → full pass.
    assert.equal(repairScope([f(1), f(-1)], 8), undefined);
    // Scope covering most of the deck → full pass.
    assert.equal(repairScope([f(0), f(1), f(2), f(3), f(4)], 8), undefined);
    assert.equal(repairScope([], 8), undefined);
  });

  it("describeUnchangedPages lists the pages the model must leave alone", () => {
    const system = resolveVisualSystem("swiss");
    const slide = (title: string, folio?: string): FilledSlide => ({
      layout: "evidence",
      variant: "canvas",
      elements: [
        ...(folio ? [{ slot: "num", kind: "text" as const, name: "n", bbox: { x: 64, y: 40, w: 60, h: 20 }, paintRole: "accent" as const, text: folio, fontSize: 12 }] : []),
        { slot: "title", kind: "text", name: "t", bbox: { x: 64, y: 80, w: 900, h: 56 }, paintRole: "ink", text: title, fontSize: 32 },
      ],
    });
    const jobs = jobsFromPages([{ title: "A", bullets: [] }, { title: "B", bullets: ["x"] }, { title: "C", bullets: ["y"] }], "T");
    const out = describeUnchangedPages([slide("Alpha"), slide("Beta", "02"), slide("Gamma", "03")], jobs, [1], system);
    assert.match(out, /^#0 · .* · Alpha · /m);
    assert.match(out, /^#2 · .* · Gamma · .* · folio 03$/m);
    assert.doesNotMatch(out, /Beta/);
  });

  it("tells the next chunk the sentences already written", () => {
    const system = resolveVisualSystem("swiss");
    const slide = {
      layout: "evidence",
      variant: "canvas",
      elements: [
        { slot: "title", kind: "text" as const, name: "t", bbox: { x: 64, y: 80, w: 900, h: 56 }, paintRole: "ink" as const, text: "Alpha", fontSize: 32 },
        { slot: "body", kind: "text" as const, name: "b", bbox: { x: 64, y: 180, w: 800, h: 40 }, paintRole: "ink" as const, text: "twelve people edit one page", fontSize: 18 },
      ],
    };
    const jobs = jobsFromPages([{ title: "A", bullets: [] }], "T");
    const out = describeUnchangedPages([slide], jobs, [], system);
    assert.match(out, /says twelve people edit one page/);
  });

  it("mergeCanvasPages keeps the author's page where the repair pass regressed it", () => {
    const page = (tag: string): FilledSlide => ({ layout: "evidence", variant: "canvas", elements: [], ...({ tag } as object) });
    const compiledWith = (findings: Array<[number, string]>): GenerateDeckResult =>
      ({ reflect: { passed: findings.length === 0, findings: findings.map(([slideIdx, issue]) => ({ kind: "content", slideIdx, issue })) } } as unknown as GenerateDeckResult);
    const first = { slides: [page("a0"), page("a1"), page("a2")], compiled: compiledWith([[1, "chart missing"]]) };
    const second = { slides: [page("b0"), page("b1"), page("b2")], compiled: compiledWith([[2, "table missing"], [-1, "deck-level"]]) };
    const merged = mergeCanvasPages(first, second)!;
    // page 0: tie → repair; page 1: repair fixed it → repair; page 2: repair regressed → author.
    assert.deepEqual(merged.map((s) => (s as unknown as { tag: string }).tag), ["b0", "b1", "a2"]);
    // Nothing to gain → undefined (no recompile).
    assert.equal(mergeCanvasPages(first, { ...second, compiled: compiledWith([]) }), undefined);
    assert.equal(mergeCanvasPages(first, { ...second, slides: second.slides.slice(0, 2) }), undefined);
  });
});

describe("fillMissingPhotos", () => {
  it("lends the cover's photograph to a photo page whose fetch missed, nearest sibling otherwise, nothing when none arrived", () => {
    const jobs = jobsFromPages(
      [
        { title: "Deck", bullets: [], carrier: "photo" },
        { title: "A", bullets: ["x"], carrier: "device" },
        { title: "Claim", bullets: ["y"], rhythm: "anchor", carrier: "photo" },
        { title: "Thanks", bullets: [], carrier: "photo" },
      ],
      "Deck",
    );
    const images = new Map<number, string>([[0, "data:cover"], [3, "data:close"]]);
    assert.deepEqual(fillMissingPhotos(jobs, images), [2]);
    assert.equal(images.get(2), "data:cover");
    assert.equal(images.has(1), false, "a non-photo page is never given one");
    const noCover = new Map<number, string>([[3, "data:close"]]);
    fillMissingPhotos(jobs, noCover);
    assert.equal(noCover.get(0), "data:close");
    assert.equal(noCover.get(2), "data:close");
    const empty = new Map<number, string>();
    assert.deepEqual(fillMissingPhotos(jobs, empty), []);
    assert.equal(empty.size, 0);
  });
});

describe("withPhotoDecision", () => {
  it("user words beat the organizer, and an organizer 'none' cannot override a brief that asked for photos", () => {
    const g = (extraNotes: string) => ({ topic: "t", extraNotes }) as Parameters<typeof withPhotoDecision>[1];
    assert.equal(withPhotoDecision({ mode: "briefing", photoRhythm: "none" }, g("封面 / 结束页用全屏摄影")).photoRhythm, "anchors");
    assert.equal(withPhotoDecision({ mode: "briefing", photoRhythm: "bookends" }, g("cover uses full-bleed photography")).photoRhythm, "bookends");
    assert.equal(withPhotoDecision({ mode: "briefing", photoRhythm: "anchors" }, g("不要配图")).photoRhythm, "none");
    assert.equal(withPhotoDecision({ mode: "showcase" }, g("keep it tight")).photoRhythm, "editorial");
    assert.equal(withPhotoDecision({ mode: "pyramid", photoRhythm: "none" }, g("keep it tight")).photoRhythm, "none");
  });
});
