import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MockLanguageModelV3 } from "ai/test";
import { CanvasDeckSchema, normalizeCanvasDeck } from "./canvas-schema.js";
import { authorCanvasDeck, canvasAuthorSystemPrompt, canvasChunkIndexes, canvasExtraChunks, toFilled } from "./canvas-author.js";
import { jobsFromPages } from "../deckgen/jobs.js";

function textResult(text: string) {
  return {
    content: [{ type: "text" as const, text }],
    finishReason: { unified: "stop" as const, raw: "stop" },
    usage: { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } },
    warnings: [],
  };
}

describe("canvas author look", () => {
  it("asks the model to pick editorial or swiss and author a palette", () => {
    const p = canvasAuthorSystemPrompt();
    assert.match(p, /editorial/);
    assert.match(p, /swiss/);
    assert.match(p, /systemId/);
    assert.match(p, /palette/);
    assert.doesNotMatch(p, /Keep systemId=/);
  });

  it("locks systemId on the repair pass", () => {
    const p = canvasAuthorSystemPrompt(undefined, { systemId: "swiss" });
    assert.match(p, /Keep systemId="swiss"/);
  });

  it("pins brand hex when the brief has one", () => {
    const p = canvasAuthorSystemPrompt("#E11D48");
    assert.match(p, /#E11D48/);
  });

  it("teaches the P0 vocabulary: all seven systems, presets, icons, diagrams, devices, runs, scrim", () => {
    const p = canvasAuthorSystemPrompt();
    for (const id of ["dark-tech", "soft-rounded", "photo-editorial", "data-dense", "brutalist"]) assert.match(p, new RegExp(id));
    assert.match(p, /kinds: .*shape, icon, diagram, device/);
    assert.match(p, /shape\.preset ∈/);
    assert.match(p, /icon\.icon ∈/);
    assert.match(p, /diagram\.layout ∈/);
    assert.match(p, /device\.type ∈/);
    assert.match(p, /kpiRow/);
    assert.match(p, /stepStrip/);
    assert.match(p, /chevron/);
    assert.match(p, /rocket/);
    assert.match(p, /runs/);
    assert.match(p, /scrim/);
    assert.match(p, /relationships/i);
  });

  it("binds the deck brief: locks the chosen system, carries mode + motif", () => {
    const p = canvasAuthorSystemPrompt(undefined, undefined, {
      mode: "showcase",
      systemId: "dark-tech",
      paletteIntent: "deep navy with electric cyan",
      motif: "thin rules and glow",
    });
    assert.match(p, /dark-tech/);
    assert.match(p, /showcase/);
    assert.match(p, /electric cyan/);
    assert.match(p, /thin rules and glow/);
  });
});

describe("page-scoped repair", () => {
  it("briefs only the named pages, tells the model about the rest, and maps slides + photos back by index", async () => {
    const real = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAgEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/";
    const jobs = jobsFromPages(
      [{ title: "Cover", bullets: [] }, { title: "One", bullets: ["a"] }, { title: "Two", bullets: ["b"] }, { title: "Three", bullets: ["c"] }, { title: "Close", bullets: [] }],
      "T",
    );
    const images = new Map([[0, real], [3, real]]);
    let prompt = "";
    const model = new MockLanguageModelV3({
      doGenerate: async (opts) => {
        const user = opts.prompt.find((m) => m.role === "user");
        prompt = user && Array.isArray(user.content) ? user.content.map((c) => ("text" in c ? c.text : "")).join("") : "";
        return textResult(
          JSON.stringify({
            systemId: "swiss",
            slides: [
              { job: "evidence", elements: [{ kind: "text", bbox: { x: 64, y: 60, w: 900, h: 56 }, text: "One fixed", fontSize: 32 }] },
              { job: "evidence", background: { kind: "image", src: "PHOTO" }, elements: [{ kind: "text", bbox: { x: 64, y: 60, w: 900, h: 56 }, text: "Three fixed", fontSize: 32 }] },
            ],
          }),
        );
      },
    });
    const out = await authorCanvasDeck({
      model: model as never,
      topic: "T",
      jobs,
      images,
      repair: "[content #1] brief asks for a chart carrier; [content #3] table missing",
      only: [3, 1],
      unchanged: "#0 · cover · Cover · statement\n#2 · evidence · Two · grid · folio 03\n#4 · close · Close · statement",
      lock: { systemId: "swiss" },
    });
    assert.match(prompt, /Re-author ONLY pages 1, 3/);
    assert.match(prompt, /exactly 2 entries/);
    assert.match(prompt, /#2 · evidence · Two · grid · folio 03/);
    assert.match(prompt, /PAGE 1 job=/);
    assert.match(prompt, /PAGE 3 job=/);
    assert.doesNotMatch(prompt, /PAGE 2 job=/);
    assert.doesNotMatch(prompt, /keep the same page count/);
    assert.equal(out.slides.length, 2);
    assert.equal(out.slides[0]!.elements[0]!.text, "One fixed");
    assert.equal(out.slides[1]!.background?.src, real, "photo for deck page 3 lands on the second returned slide");
  });
});

describe("toFilled photo binding", () => {
  it("always substitutes the fetched src (model echoes the truncated preview / PHOTO placeholder) and keeps the scrim", () => {
    const real = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAgEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/";
    const jobs = jobsFromPages([{ title: "Cover", bullets: [] }, { title: "Body", bullets: ["a", "b"] }, { title: "Close", bullets: [] }], "T");
    const images = new Map([[0, real], [2, real]]);
    const deck = CanvasDeckSchema.parse(
      normalizeCanvasDeck({
        systemId: "photo-editorial",
        slides: [
          { job: "cover", background: { kind: "image", src: real.slice(0, 48) + "…", scrim: { direction: "left", strength: 0.78 } }, elements: [{ kind: "text", bbox: [64, 400, 600, 120], text: "Hi", fontSize: 72 }] },
          { job: "evidence", background: { kind: "image", src: "PHOTO" }, elements: [{ kind: "text", bbox: [64, 60, 600, 40], text: "Body", fontSize: 36 }] },
          { job: "close", elements: [{ kind: "text", bbox: [64, 400, 600, 120], text: "Bye", fontSize: 72 }] },
        ],
      }),
    );
    const filled = toFilled(deck, jobs, images);
    assert.equal(filled[0]!.background?.src, real, "truncated echo replaced by the real src");
    assert.deepEqual(filled[0]!.background?.scrim, { direction: "left", strength: 0.78 });
    assert.equal(filled[0]!.background?.overlay, undefined, "model chose a scrim; no default overlay stacked on top");
    assert.equal(filled[1]!.background?.src, "PHOTO", "no fetched photo for this page → left for snap to drop to paper");
    assert.equal(filled[2]!.background?.kind, "image", "fetched photo lands even when the model wrote no background");
    assert.equal(filled[2]!.background?.src, real);
  });
});

describe("normalizeCanvasDeck", () => {
  it("maps layout/theme/shapes onto the canvas schema without outline aliases", () => {
    const parsed = CanvasDeckSchema.parse(
      normalizeCanvasDeck({
        system: "Swiss Sans",
        theme: { bg: "111111", ink: "#eee", accent: "#f50" },
        themeId: "navy",
        slides: [
          {
            layout: "cover",
            shapes: [{ kind: "text", bbox: { x: 80, y: 80, w: 400, h: 48 }, text: "Hello" }],
          },
        ],
      }),
    );
    assert.equal(parsed.systemId, "swiss");
    assert.equal(parsed.themeId, undefined);
    assert.equal(parsed.palette?.bg, "#111111");
    assert.equal(parsed.palette?.ink, "#eeeeee");
    assert.equal(parsed.palette?.accent, "#ff5500");
    assert.equal(parsed.slides[0]?.job, "cover");
    assert.equal(parsed.slides[0]?.elements[0]?.kind, "text");
  });

  it("hoists device payload written beside device:{type} (live slip that dropped 5 devices in one run)", () => {
    const parsed = CanvasDeckSchema.parse(
      normalizeCanvasDeck({
        systemId: "swiss",
        slides: [
          {
            job: "evidence",
            elements: [
              { kind: "device", device: { type: "stepStrip" }, bbox: { x: 64, y: 200, w: 1100, h: 300 }, items: [{ title: "盘点", body: "a" }, { title: "接入", body: "b" }] },
              { kind: "device", device: { type: "kpiRow", kpis: [{ value: "68%", label: "x" }, { value: "5x", label: "y" }] }, bbox: { x: 64, y: 520, w: 1100, h: 120 } },
              { kind: "device", device: { type: "quoteBlock" }, text: "Said it.", attribution: "Someone", bbox: { x: 64, y: 100, w: 1100, h: 80 } },
            ],
          },
        ],
      }),
    );
    const [strip, kpi, quote] = parsed.slides[0]!.elements;
    assert.equal(strip!.device?.items?.length, 2);
    assert.equal(quote!.device?.type, "quoteBlock");
    // Loose device names resolve to the canonical type.
    const loose = CanvasDeckSchema.parse(
      normalizeCanvasDeck({
        systemId: "swiss",
        slides: [{ job: "evidence", elements: [
          { kind: "device", device: { type: "KPI row", items: [{ value: "1", label: "a" }, { value: "2", label: "b" }] }, bbox: { x: 0, y: 0, w: 100, h: 50 } },
          { kind: "device", device: { type: "quote", text: "q" }, bbox: { x: 0, y: 0, w: 100, h: 50 } },
          { kind: "device", device: { type: "icon-grid", items: [{ title: "a" }, { title: "b" }] }, bbox: { x: 0, y: 0, w: 100, h: 50 } },
        ] }],
      }),
    );
    assert.deepEqual(loose.slides[0]!.elements.map((e) => e.device?.type), ["kpiRow", "quoteBlock", "iconLabelGrid"]);
    // shape preset "ellipse" (not a preset) → kind ellipse.
    const circ = CanvasDeckSchema.parse(
      normalizeCanvasDeck({ systemId: "swiss", slides: [{ job: "close", elements: [{ kind: "shape", preset: "ellipse", bbox: { x: 0, y: 0, w: 40, h: 40 } }, { kind: "circle", bbox: { x: 0, y: 0, w: 40, h: 40 } }] }] }),
    );
    assert.deepEqual(circ.slides[0]!.elements.map((e) => [e.kind, e.preset]), [["ellipse", undefined], ["ellipse", undefined]]);
    const first = kpi!.device?.items?.[0];
    assert.equal(typeof first === "object" ? first.value : first, "68%");
    assert.equal(quote!.device?.text, "Said it.");
    assert.equal(quote!.device?.attribution, "Someone");
  });

  it("normalizes new kinds and system aliases from loose model output", () => {
    const parsed = CanvasDeckSchema.parse(
      normalizeCanvasDeck({
        systemId: "dark tech",
        slides: [
          {
            job: "evidence",
            background: { kind: "image", src: "https://x/y.jpg", scrim: { direction: "left", strength: 0.7 } },
            elements: [
              { kind: "rect", bbox: { x: 0, y: 0, w: 100, h: 100 }, preset: "roundRect" },
              { kind: "icon", bbox: { x: 0, y: 0, w: 40, h: 40 }, icon: "Rocket" },
              { kind: "smartart", bbox: { x: 0, y: 0, w: 600, h: 200 }, diagram: { layout: "process", items: [{ title: "A" }, { title: "B" }] } },
              { kind: "kpiRow", bbox: { x: 0, y: 0, w: 600, h: 200 }, items: [{ value: "1", title: "a" }] },
              { kind: "icon", bbox: { x: 0, y: 0, w: 40, h: 40 }, icon: "lucide:TrendingUp" },
              {
                kind: "text",
                bbox: { x: 0, y: 0, w: 600, h: 80 },
                runs: [{ text: "Grow " }, { text: "3×", emphasis: "accent" }],
              },
            ],
          },
        ],
      }),
    );
    assert.equal(parsed.systemId, "dark-tech");
    const els = parsed.slides[0]!.elements;
    assert.equal(els[0]!.kind, "shape");
    assert.equal(els[0]!.preset, "roundRect");
    assert.equal(els[1]!.icon, "rocket");
    assert.equal(els[2]!.kind, "diagram");
    assert.equal(els[3]!.kind, "device");
    assert.equal(els[3]!.device?.type, "kpiRow");
    assert.equal(els[3]!.device?.items?.length, 1);
    assert.equal(els[4]!.icon, "trending-up");
    assert.equal(els[5]!.runs?.[1]?.emphasis, "accent");
    assert.equal(parsed.slides[0]!.background?.scrim?.direction, "left");
  });

  it("rescues chart/table data flattened onto the element and loose fontSize names (live DeepSeek slip)", () => {
    const parsed = CanvasDeckSchema.parse(
      normalizeCanvasDeck({
        systemId: "swiss",
        slides: [
          {
            job: "data",
            background: null,
            notes: null,
            elements: [
              { kind: "shape", shape: { preset: "plaque" }, bbox: { x: 0, y: 0, w: 100, h: 40 }, paintRole: "ink" },
              { kind: "device", device: "numberedList", bbox: [64, 206, 620, 400], items: [{ title: "a", body: "b" }, { title: "c" }], paintRole: null },
              { kind: "text", bbox: [64, 96, 700, 48], text: "Title", size: "32" },
              { kind: "rule", bbox: { left: 64, top: 142, width: 63, height: 6 } },
              { kind: "text", bbox: { x: 0, y: 0, w: 600, h: 48 }, text: "Bold", fontSize: 16, weight: "bold" },
              // series at element level, values as strings with %, donut alias
              { kind: "chart", bbox: { x: 0, y: 0, w: 600, h: 300 }, chartType: "donut", categories: ["A", "B"], series: [{ name: "share", data: ["60%", "40"] }] },
              // nested under data, series as object map, no categories
              { kind: "chart", bbox: { x: 0, y: 0, w: 600, h: 300 }, data: { type: "stacked", series: { pilot: [1, 2, 3], scale: [4, 5, 6] } } },
              // rows as objects keyed by header, numbers as cells
              { kind: "table", bbox: { x: 0, y: 0, w: 600, h: 300 }, columns: ["stage", "weeks"], rows: [{ stage: "pilot", weeks: 2 }, { stage: "scale", weeks: 6 }] },
              // header as first row
              { kind: "table", bbox: { x: 0, y: 0, w: 600, h: 300 }, rows: [["k", "v"], ["a", 1]] },
            ],
          },
        ],
      }),
    );
    assert.equal(parsed.slides[0]!.background, undefined, "null background is dropped, not a zod failure");
    const els = parsed.slides[0]!.elements;
    assert.equal(els[0]!.preset, "plaque");
    assert.equal(els[1]!.device?.type, "numberedList");
    assert.equal(els[1]!.device?.items?.length, 2);
    assert.deepEqual(els[1]!.bbox, { x: 64, y: 206, w: 620, h: 400 });
    assert.deepEqual(els[2]!.bbox, { x: 64, y: 96, w: 700, h: 48 });
    assert.equal(els[2]!.fontSize, 32);
    assert.deepEqual(els[3]!.bbox, { x: 64, y: 142, w: 63, h: 6 });
    assert.equal(els[4]!.fontWeight, 700);
    assert.deepEqual(els[5]!.chart, { type: "doughnut", categories: ["A", "B"], series: [{ name: "share", values: [60, 40] }] });
    assert.equal(els[6]!.chart?.type, "column", "unknown chart type falls back instead of failing the deck");
    assert.deepEqual(els[6]!.chart?.categories, ["C1", "C2", "C3"]);
    assert.equal(els[6]!.chart?.series.length, 2);
    assert.deepEqual(els[7]!.table, { headers: ["stage", "weeks"], rows: [["pilot", "2"], ["scale", "6"]] });
    assert.deepEqual(els[8]!.table, { headers: ["k", "v"], rows: [["a", "1"]] });

    const bg = CanvasDeckSchema.parse(
      normalizeCanvasDeck({
        systemId: "swiss",
        slides: [
          { job: "a", background: { kind: "color", paintRole: "bg" }, elements: [{ kind: "text", bbox: [0, 0, 10, 10], text: "x" }] },
          { job: "b", background: "https://x/y.jpg", elements: [{ kind: "text", bbox: [0, 0, 10, 10], text: "x" }] },
        ],
      }),
    );
    assert.deepEqual(bg.slides[0]!.background, { kind: "solid", paintRole: "bg" });
    assert.deepEqual(bg.slides[1]!.background, { kind: "image", src: "https://x/y.jpg" });
  });
});

describe("canvas chunks", () => {
  it("keeps a short deck in one call", () => {
    assert.equal(canvasExtraChunks(8, 8), 0);
    assert.deepEqual(canvasChunkIndexes(8, 0), [[0, 1, 2, 3, 4, 5, 6, 7]]);
  });

  it("splits a long deck only when three later calls still fit", () => {
    assert.equal(canvasExtraChunks(16, 6), 2);
    assert.equal(canvasExtraChunks(16, 4), 0);
    assert.deepEqual(canvasChunkIndexes(10, 1), [
      [0, 1, 2, 3, 4],
      [5, 6, 7, 8, 9],
    ]);
  });
});
