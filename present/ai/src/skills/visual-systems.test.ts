import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, it } from "node:test";
import { parseSkill, stringifySkill } from "./parse.js";
import { lintSkill } from "./lint.js";
import { getEnabledChecklist, getEnabledSkillFragments, listSampleSkills, listSkills, listSkillVisualSystems } from "./registry.js";
import { resolveCustomVisualSystems, stripVisualSystemBlocks } from "./visual-systems.js";
import type { HostSkillStore, SkillSpec } from "./types.js";
import { isCanvasSystemId, listCanvasSystemIds } from "../deckgen/ids.js";
import { registerCustomVisualSystems, resolveVisualSystem } from "../deckgen/visual-system.js";
import { canvasAuthorSystemPrompt } from "../generate/canvas-author.js";
import { organizeDeckSystemPrompt } from "../generate/agent/prompts.js";
import { coerceDeckBrief } from "../deckgen/brief.js";

const here = dirname(fileURLToPath(import.meta.url));
const SAMPLE = readFileSync(join(here, "samples/apple-keynote.md"), "utf8");

function hostOf(...specs: SkillSpec[]): HostSkillStore {
  const map = new Map(specs.map((s) => [s.id, s]));
  return {
    list: () => [...map.values()].map((spec) => ({ spec, mtime: 1 })),
    load: (id) => map.get(id) ?? null,
    save: (id, raw) => {
      const spec = parseSkill(raw);
      map.set(id, spec);
      return { ok: true, spec };
    },
    remove: (id) => void map.delete(id),
  };
}

afterEach(() => registerCustomVisualSystems([]));

describe("skills carrying a visual system", () => {
  it("the apple-keynote sample parses, lints clean, and keeps the block in body for round-trips", () => {
    const spec = parseSkill(SAMPLE);
    assert.equal(spec.id, "apple_keynote");
    assert.equal(spec.stage, "both");
    assert.deepEqual(spec.visualSystems?.map((v) => v.id), ["apple_keynote"]);
    assert.equal(spec.visualSystems?.[0]?.voice, "neo-grotesk");
    assert.match(spec.body, /```visual-system/);
    assert.deepEqual(lintSkill(spec, { isKnownFontFamily: (f) => ["Inter", "Noto Sans SC", "JetBrains Mono"].includes(f) }), []);
    const again = parseSkill(stringifySkill(spec));
    assert.deepEqual(again.visualSystems, spec.visualSystems);
  });

  it("a broken block refuses the save with a located message", () => {
    const raw = ["---", "name: broken", "description: x", "---", "## Look", "```visual-system", '{ "id": "broken_one", "voice": "comic" }', "```"].join("\n");
    assert.throws(() => parseSkill(raw), /visual-system block #1: voice/);
  });

  it("listSkills(host) registers the systems of enabled skills and drops them when disabled", () => {
    const spec = parseSkill(SAMPLE);
    const host = hostOf(spec);
    assert.equal(isCanvasSystemId("apple_keynote"), false);
    listSkills(host);
    assert.equal(isCanvasSystemId("apple_keynote"), true);
    assert.equal(resolveVisualSystem("apple_keynote").canvas.radius, 18);
    assert.deepEqual(listSkillVisualSystems(host).map((r) => r.skillId), ["apple_keynote"]);

    // A disabled view contributes nothing (the enabled flag comes from the host UI's settings store).
    assert.deepEqual(resolveCustomVisualSystems([{ ...listSkills(host)[0]!, enabled: false }]), []);

    host.remove("apple_keynote");
    listSkills(host);
    assert.equal(isCanvasSystemId("apple_keynote"), false);
    assert.deepEqual(listSkillVisualSystems(host), []);
  });

  it("chat-only skills do not register systems and lint says so", () => {
    const raw = SAMPLE.replace("stage: both", "stage: chat");
    const spec = parseSkill(raw);
    listSkills(hostOf(spec));
    assert.equal(isCanvasSystemId("apple_keynote"), false);
    assert.ok(lintSkill(spec).some((w) => /chat-only/.test(w)));
  });

  it("lint flags fonts that will not load, unreadable seeds, and a system the text never names", () => {
    const raw = [
      "---",
      "name: quiet",
      "description: x",
      "stage: generate",
      "---",
      "## Look",
      "Nothing here mentions the system.",
      "```visual-system",
      JSON.stringify({ id: "quiet_one", fontFamilies: ["Comic Sans"], canvas: { tone: "dark" }, palette: { bg: "#FFFFFF", ink: "#CCCCCC", accent: "#EEEEEE" } }),
      "```",
    ].join("\n");
    const warnings = lintSkill(parseSkill(raw), { isKnownFontFamily: () => false });
    assert.ok(warnings.some((w) => /"Comic Sans" is not a known preset/.test(w)));
    assert.ok(warnings.some((w) => /ink on bg is below 4.5:1/.test(w)));
    assert.ok(warnings.some((w) => /accent on bg is below 3:1/.test(w)));
    assert.ok(warnings.some((w) => /canvas.tone is "dark" but palette.bg is a light/.test(w)));
    assert.ok(warnings.some((w) => /never names it/.test(w)));
  });

  it("the JSON never reaches a prompt; the prose and checklist do", () => {
    const spec = parseSkill(SAMPLE);
    const host = hostOf(spec);
    const slide = getEnabledSkillFragments({ stage: "slide", host }).join("\n");
    assert.doesNotMatch(slide, /visual-system/);
    assert.doesNotMatch(slide, /"typeScale"/);
    assert.match(slide, /Use systemId=apple_keynote/);
    assert.match(slide, /## Motion/);
    const checklist = getEnabledChecklist({ stage: "slide", host }).join("\n");
    assert.match(checklist, /Accent appears on exactly one element/);
    assert.doesNotMatch(checklist, /"palette"/);
    assert.equal(stripVisualSystemBlocks("a\n```visual-system\n{}\n```\n\n\nb"), "a\n\nb");
  });

  it("canvas author and organizer prompts list the custom system and carry the skill text", () => {
    const spec = parseSkill(SAMPLE);
    const host = hostOf(spec);
    const author = canvasAuthorSystemPrompt(undefined, undefined, undefined, host);
    assert.match(author, /systemId must be one of: .*apple_keynote/);
    assert.match(author, /apple_keynote: pure white paper/);
    assert.match(author, /STYLE GUIDANCE/);
    assert.match(author, /Use systemId=apple_keynote/);
    const organizer = organizeDeckSystemPrompt(host);
    assert.match(organizer, /systemId ∈ \{ .*apple_keynote \}/);
    assert.match(organizer, /STYLE GUIDANCE/);
    assert.ok(listCanvasSystemIds().includes("apple_keynote"));
    // The organizer's answer survives the brief coercion in every spelling.
    assert.equal(coerceDeckBrief({ systemId: "Apple Keynote" }).systemId, "apple_keynote");
    assert.equal(coerceDeckBrief({ systemId: "apple-keynote" }).systemId, "apple_keynote");
  });

  it("without a host, prompts stay on the builtin whitelist", () => {
    const p = canvasAuthorSystemPrompt();
    assert.doesNotMatch(p, /apple_keynote/);
    assert.doesNotMatch(p, /STYLE GUIDANCE/);
  });
});

describe("sample skill templates", () => {
  it("ships apple_keynote as a parseable template that is not injected until added", () => {
    const samples = listSampleSkills();
    const apple = samples.find((s) => s.spec.id === "apple_keynote");
    assert.ok(apple, "apple_keynote template present");
    assert.equal(apple!.spec.visualSystems?.[0]?.id, "apple_keynote");
    assert.ok(apple!.raw.includes("```visual-system"));
    assert.equal(listSkills().some((v) => v.id === "apple_keynote"), false, "templates are not builtin skills");
  });
});
