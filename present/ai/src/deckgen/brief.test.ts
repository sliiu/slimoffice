import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { COMPOSITIONS, breakCompositionRuns, coerceDeckBrief, coercePageBrief, coercePhotoRhythm, defaultPhotoRhythm, defaultRhythm, inferRelationship, photoRhythmFromNotes } from "./brief.js";
import { applyPhotoRhythm, briefsFromJobs, jobsFromPages } from "./jobs.js";
import { DeckBriefsSchema, coerceDeckBriefs } from "../generate/agent/roles.js";

describe("design brief coercion", () => {
  it("accepts loose organizer casing/aliases and drops unknown values", () => {
    const deck = coerceDeckBrief({ mode: "Showcase", system: "Dark-Tech", paletteIntent: " navy + cyan ", motif: "rules" });
    assert.deepEqual(deck, { mode: "showcase", systemId: "dark-tech", paletteIntent: "navy + cyan", motif: "rules" });
    assert.deepEqual(coerceDeckBrief({ mode: "sermon", systemId: "monograph" }), {});
    const page = coercePageBrief({ relationship: "order", carrierHint: "chart", rhythm: "anchor", coreMessage: " one line " });
    assert.deepEqual(page, { coreMessage: "one line", relationships: "order", rhythm: "anchor", carrier: "chart" });
    assert.deepEqual(coercePageBrief({ relationships: "vibes" }), {});
  });

  it("normalizes the whole organizer payload so the zod schema accepts it", () => {
    const raw = coerceDeckBriefs({
      designBrief: { mode: "Briefing", systemId: "Data Dense", paletteIntent: "paper + one signal red" },
      slides: [
        { purpose: "cover", topic: "Q3", keyPoints: ["Q3 review"], relationship: "None", rhythm: "Anchor" },
        { purpose: "content", topic: "Q3", keyPoints: ["Step one", "Step two", "Step three"], relationships: "ORDER", carrierHint: "Diagram", rhythm: "dense" },
      ],
    });
    const parsed = DeckBriefsSchema.parse(raw);
    assert.equal(parsed.deck?.mode, "briefing");
    assert.equal(parsed.deck?.systemId, "data-dense");
    assert.equal(parsed.slides[0]?.relationships, "none");
    assert.equal(parsed.slides[0]?.rhythm, "anchor");
    assert.equal(parsed.slides[1]?.relationships, "order");
    assert.equal(parsed.slides[1]?.carrier, "diagram");
    assert.equal((parsed.slides[1] as Record<string, unknown>).carrierHint, undefined);
  });
});

describe("brief fallbacks in jobsFromPages", () => {
  it("keeps organizer values and infers the rest deterministically", () => {
    const jobs = jobsFromPages(
      [
        { title: "Deck", bullets: [] },
        { title: "Plan", bullets: ["First we pilot", "Then we scale", "Finally default on"], layoutHint: "bullets" },
        { title: "Options", bullets: ["A vs B"], relationships: "contrast", rhythm: "breathing", carrier: "device", coreMessage: "B wins" },
        { title: "Numbers", bullets: ["41%", "3.2x", "18", "9"], layoutHint: "metrics" },
        { title: "Thanks", bullets: [] },
      ],
      "Deck",
    );
    const briefs = briefsFromJobs(jobs);
    assert.equal(briefs.length, 5);
    assert.equal(briefs[0]!.relationships, "none");
    assert.equal(briefs[0]!.rhythm, "anchor");
    assert.equal(briefs[1]!.relationships, "order");
    assert.equal(briefs[1]!.rhythm, "dense");
    assert.equal(briefs[2]!.coreMessage, "B wins");
    assert.equal(briefs[2]!.relationships, "contrast");
    assert.equal(briefs[2]!.rhythm, "breathing");
    assert.equal(briefs[2]!.carrier, "device");
    assert.equal(briefs[3]!.relationships, "membership");
    assert.equal(briefs[4]!.rhythm, "anchor");
    assert.equal(inferRelationship(["before: slow", "after: fast"], "evidence"), "contrast");
    assert.equal(inferRelationship(["one long sentence that goes well past the short-label threshold for membership"], "evidence"), "none");
    assert.equal(defaultRhythm(4, 9, "evidence"), "breathing");
    assert.equal(defaultRhythm(1, 3, "evidence"), "anchor");
  });
});

describe("page composition", () => {
  it("assigns a composition to every page and never repeats one on consecutive pages", () => {
    const jobs = jobsFromPages(
      Array.from({ length: 10 }, (_, i) => ({ title: `Page ${i}`, bullets: ["a", "b", "c", "d"], layoutHint: i === 0 ? "cover" : i === 9 ? "closing" : "bullets" })),
      "Deck",
    );
    for (let i = 0; i < jobs.length; i++) {
      assert.ok(COMPOSITIONS.includes(jobs[i]!.composition), `page ${i} has composition ${jobs[i]!.composition}`);
      if (i > 0) assert.notEqual(jobs[i]!.composition, jobs[i - 1]!.composition, `pages ${i - 1} and ${i} share ${jobs[i]!.composition}`);
    }
    assert.ok(["statement", "full-bleed", "band"].includes(jobs[0]!.composition));
    assert.equal(briefsFromJobs(jobs)[3]!.composition, jobs[3]!.composition);
  });

  it("keeps organizer compositions but breaks back-to-back repeats", () => {
    const jobs = jobsFromPages(
      [
        { title: "Cover", bullets: [], composition: "statement" },
        { title: "A", bullets: ["x", "y"], composition: "header-stack" },
        { title: "B", bullets: ["x", "y"], composition: "header-stack" },
        { title: "C", bullets: ["x", "y"], composition: "header-stack" },
        { title: "D", bullets: ["x", "y"], composition: "split" },
      ],
      "Deck",
    );
    const list = jobs.map((j) => j.composition);
    assert.equal(list[0], "statement");
    assert.equal(list[1], "header-stack");
    assert.notEqual(list[2], "header-stack");
    assert.notEqual(list[3], list[2]);
    assert.equal(breakCompositionRuns(["grid", "grid", "grid"], ["evidence", "evidence", "evidence"]).filter((c, i, a) => i > 0 && c === a[i - 1]).length, 0);
    assert.equal(coercePageBrief({ composition: "Full Bleed" }).composition, "full-bleed");
    assert.equal(coercePageBrief({ composition: "collage" }).composition, undefined);
  });

  it("photo wants follow carrier and imageIdea, not chart/table pages", () => {
    const jobs = jobsFromPages(
      [
        { title: "Cover", bullets: [] },
        { title: "Metric", bullets: ["41%"], carrier: "chart", imageIdea: "server room" },
        { title: "Place", bullets: ["a"], carrier: "diagram", imageIdea: "harbour at dawn" },
        { title: "Photo", bullets: ["a"], carrier: "photo" },
        { title: "Words", bullets: ["a"], carrier: "typeOnly" },
      ],
      "Deck",
    );
    assert.deepEqual(
      jobs.map((j) => j.wantsPhoto),
      [true, false, true, true, false],
    );
  });
});

describe("deck photo rhythm", () => {
  const pages = () => [
    { title: "Deck", bullets: [], carrier: "photo" as const, imageIdea: "laptop on a desk" },
    { title: "Agenda", bullets: ["a", "b", "c"], layoutHint: "agenda", carrier: "device" as const },
    { title: "Claim", bullets: ["one line"], rhythm: "anchor" as const, carrier: "typeOnly" as const, imageIdea: "projector beam" },
    { title: "Numbers", bullets: ["41%", "3.2x"], layoutHint: "metrics", carrier: "device" as const, imageIdea: "server room" },
    { title: "Interior photo", bullets: ["x"], carrier: "photo" as const, imageIdea: "brick hallway" },
    { title: "Part two", bullets: [], layoutHint: "section", carrier: "typeOnly" as const },
    { title: "Numbers again", bullets: ["1", "2"], layoutHint: "chart", rhythm: "anchor" as const, carrier: "chart" as const },
    { title: "Thanks", bullets: [], carrier: "typeOnly" as const },
  ];

  it("coerces organizer / user wording and defaults by deck mode", () => {
    assert.equal(coercePhotoRhythm("Anchors"), "anchors");
    assert.equal(coercePhotoRhythm("cover-close"), "bookends");
    assert.equal(coercePhotoRhythm("no photos"), "none");
    assert.equal(coercePhotoRhythm("magazine"), undefined);
    assert.equal(coerceDeckBrief({ photoRhythm: "Editorial" }).photoRhythm, "editorial");
    assert.equal(photoRhythmFromNotes("正式汇报，不要配图"), "none");
    assert.equal(photoRhythmFromNotes("a photo-heavy portfolio"), "editorial");
    assert.equal(photoRhythmFromNotes("keep it short"), undefined);
    assert.equal(defaultPhotoRhythm("showcase"), "editorial");
    assert.equal(defaultPhotoRhythm("briefing"), "anchors");
  });

  it("anchors: every type-led anchor page is a photograph, no interior page is", () => {
    const jobs = jobsFromPages(pages(), "Deck");
    applyPhotoRhythm(jobs, "anchors");
    assert.deepEqual(
      jobs.map((j) => j.wantsPhoto),
      [true, false, true, false, false, true, false, true],
    );
    assert.equal(jobs[4]!.carrier, "typeOnly", "interior photo page becomes type");
    assert.equal(jobs[5]!.carrier, "photo", "section opener becomes a photo page");
    assert.equal(jobs[6]!.carrier, "chart", "a chart anchor keeps its figure");
    for (let i = 1; i < jobs.length; i++) assert.notEqual(jobs[i]!.composition, jobs[i - 1]!.composition);
    assert.equal(jobs[0]!.composition, "full-bleed");
  });

  it("bookends keeps cover + close only; none strips every photo; editorial leaves the organizer's picks", () => {
    const bookends = jobsFromPages(pages(), "Deck");
    applyPhotoRhythm(bookends, "bookends");
    assert.deepEqual(bookends.map((j) => j.wantsPhoto), [true, false, false, false, false, false, false, true]);
    assert.equal(bookends[2]!.carrier, "typeOnly");
    const none = jobsFromPages(pages(), "Deck");
    applyPhotoRhythm(none, "none");
    assert.ok(none.every((j) => !j.wantsPhoto && j.carrier !== "photo"));
    const editorial = jobsFromPages(pages(), "Deck");
    const before = editorial.map((j) => [j.carrier, j.wantsPhoto]);
    applyPhotoRhythm(editorial, "editorial");
    assert.deepEqual(editorial.map((j) => [j.carrier, j.wantsPhoto]), before);
  });
});
