import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hasLettering, pickBestHit, toneDistance } from "./fetch-stock";
import { defaultConfig } from "../../config/types.js";
import {
  imageEnrichmentAvailable,
  imageEnrichmentSources,
  isImageRateLimitError,
} from "./fetch-enrichment-image.js";
import { maxPhotosForDeck, photoQueryFor, rankPhotoJobs } from "./acquire-page-images.js";
import { jobsFromPages } from "../../deckgen/jobs.js";
import { stockQueryFromIdea, stockQueryLadder } from "./fetch-stock.js";

describe("image enrichment helpers", () => {
  it("detects sources and rate-limit errors", () => {
    const empty = defaultConfig();
    assert.deepEqual(imageEnrichmentSources(empty), { stock: false, ai: false });
    assert.equal(imageEnrichmentAvailable(empty), false);
    assert.equal(isImageRateLimitError(new Error("HTTP 429 Too Many Requests")), true);
    assert.equal(isImageRateLimitError("ok"), false);
  });
});

describe("photo cap per deck", () => {
  it("caps photos at cover + close + one per ~3 content pages, trimming the least important first", () => {
    assert.equal(maxPhotosForDeck(1), 1);
    assert.equal(maxPhotosForDeck(5), 3);
    assert.equal(maxPhotosForDeck(8), 4);
    assert.equal(maxPhotosForDeck(12), 6);
    const jobs = jobsFromPages(
      [
        { title: "Cover", bullets: [] },
        { title: "A", bullets: ["x"], carrier: "photo", imageIdea: "harbour" },
        { title: "B", bullets: ["x"], carrier: "diagram", imageIdea: "office" },
        { title: "C", bullets: ["x"], carrier: "device", imageIdea: "hands" },
        { title: "D", bullets: ["x"], carrier: "chart", imageIdea: "ignored" },
        { title: "Close", bullets: [] },
      ],
      "Deck",
    );
    const ranked = rankPhotoJobs(jobs).map((j) => j.title);
    assert.deepEqual(ranked.slice(0, 3), ["Cover", "Close", "A"]);
    assert.ok(!ranked.includes("D"));
    assert.equal(ranked.length, 5);
  });

  it("a photo page without an imageIdea searches the deck's visual world, not topic + title", () => {
    const jobs = jobsFromPages(
      [
        { title: "Cover", bullets: [], imageIdea: "dark keynote stage, laptop on a lectern" },
        { title: "Open a .pptx and see what PowerPoint shows", bullets: ["x"], carrier: "photo" },
        { title: "Masters and layouts come along", bullets: ["x"], carrier: "photo", imageIdea: "printed pages on a dark table" },
      ],
      "SlimPPT: the PPT workbench in the browser",
    );
    assert.equal(photoQueryFor(jobs[1]!, jobs, "SlimPPT"), "dark keynote stage, laptop on a lectern");
    assert.equal(photoQueryFor(jobs[2]!, jobs, "SlimPPT"), "printed pages on a dark table");
    const bare = jobsFromPages([{ title: "Cover", bullets: [] }, { title: "Numbers", bullets: ["x"], carrier: "photo" }], "Deck");
    assert.equal(photoQueryFor(bare[1]!, bare, "Deck"), "Deck Numbers", "only with no visual world at all does it fall back to topic + title");
  });

  it("compacts prose image ideas into a keyword query: negations and framing words out, ≤ 10 words", () => {
    assert.equal(stockQueryFromIdea("mountain lake at dawn"), "mountain lake at dawn");
    const q = stockQueryFromIdea(
      "Overhead photo of a laptop and a tablet side by side on a dark desk, same slide visible on both screens, clean minimal setting, cool light, no text in image",
    );
    assert.equal(q, "Overhead of a laptop and a tablet side by side");
    assert.doesNotMatch(q, /\bno\b|photo/);
    assert.ok(q.split(" ").length <= 10);
    assert.equal(stockQueryFromIdea("dark keynote stage, single laptop on a lectern, rim light, empty seats, 16:9"), "dark keynote stage single laptop on a lectern rim light");
    // A miss backs off to the first clause, then to the three-word subject.
    assert.deepEqual(stockQueryLadder("empty conference hall after a talk, house lights up, laptop closed, 16:9"), [
      "empty conference hall after a talk house lights up",
      "empty conference hall after a talk",
      "empty conference hall",
    ]);
    assert.deepEqual(stockQueryLadder("mountain lake at dawn"), ["mountain lake at dawn", "mountain lake"]);
  });
});

describe("pickBestHit tone", () => {
  const hit = (url: string, color: string, w = 1600, h = 900) => ({ url, thumb: url, w, h, source: "unsplash" as const, color });
  it("prefers the hit whose average colour matches the deck tone when aspects tie, aspect still wins", () => {
    const pink = hit("pink", "#e89ab8");
    const dark = hit("dark", "#26303a", 1400, 788);
    assert.equal(pickBestHit([pink, dark], 16 / 9, undefined, "dark")?.url, "dark");
    assert.equal(pickBestHit([pink, dark], 16 / 9, undefined, "light")?.url, "pink");
    assert.equal(pickBestHit([pink, dark], 16 / 9, undefined)?.url, "pink", "no tone → resolution decides");
    const portraitDark = hit("portrait", "#26303a", 800, 1200);
    assert.equal(pickBestHit([pink, portraitDark], 16 / 9, undefined, "dark")?.url, "pink", "aspect beats tone");
    assert.ok(toneDistance("#ffffff", "dark") > toneDistance("#333333", "dark"));
    assert.equal(toneDistance(undefined, undefined), 0);
  });

  it("a picture whose alt says it is lettering (book spines, a sign, a screenshot) loses to a plain one, even a worse aspect", () => {
    const spines = { ...hit("spines", "#26303a"), alt: "a stack of books with colorful spines on a table" };
    const desk = { ...hit("desk", "#26303a", 1400, 1000), alt: "laptop on a dark desk" };
    assert.equal(pickBestHit([spines, desk], 16 / 9, undefined, "dark")?.url, "desk");
    assert.equal(pickBestHit([spines], 16 / 9, undefined, "dark")?.url, "spines", "still the only choice when nothing else came back");
    assert.equal(hasLettering("a woman typing on a laptop in a cafe"), false);
    assert.equal(hasLettering("neon sign reading open"), true);
    assert.equal(hasLettering("screenshot of a website"), true);
    assert.equal(hasLettering(undefined), false);
  });
});
