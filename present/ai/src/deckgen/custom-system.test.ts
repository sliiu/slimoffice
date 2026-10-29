import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { CANVAS_SYSTEM_IDS, isCanvasSystemId, listCanvasSystemIds } from "./ids.js";
import {
  buildCustomVisualSystem,
  CustomVisualSystemError,
  extractCustomVisualSystems,
  formatCustomVisualSystemBlock,
} from "./custom-system.js";
import {
  fontFamiliesForSystem,
  listCanvasSystems,
  normalizeSystemId,
  registerCustomVisualSystems,
  resolveVisualSystem,
  typeRole,
  VISUAL_SYSTEMS,
} from "./visual-system.js";
import { seedColorTheme, themeFromAuthoredLook } from "./color-theme.js";
import { compileCanvasDeck } from "./pipeline.js";
import type { FilledSlide } from "./ir.js";

const APPLE = {
  id: "apple_keynote",
  name: "Apple keynote",
  extends: "soft-rounded" as const,
  voice: "neo-grotesk" as const,
  typeScale: { display: 84, h1: 40, body: 18 },
  canvas: { radius: 18, shadow: false, tone: "light" as const, displayTreatment: "none" as const, character: "white paper, one accent, one idea per page" },
  palette: { bg: "#FFFFFF", ink: "#1D1D1F", accent: "#0071E3" },
  fontFamilies: ["Inter", "Noto Sans SC"],
  aliases: ["apple", "keynote"],
};

afterEach(() => registerCustomVisualSystems([]));

describe("extractCustomVisualSystems", () => {
  it("reads ```visual-system blocks, leaves the prose, and accepts json-tagged fences", () => {
    const body = ["## Look", "Use systemId=apple_keynote.", "", formatCustomVisualSystemBlock(APPLE), "", "```json", '{"not": "a system"}', "```", "", "```json visual-system", JSON.stringify({ id: "second_one" }), "```"].join("\n");
    const { defs, body: rest } = extractCustomVisualSystems(body);
    assert.deepEqual(defs.map((d) => d.id), ["apple_keynote", "second_one"]);
    assert.match(rest, /Use systemId=apple_keynote/);
    assert.match(rest, /"not": "a system"/);
    assert.doesNotMatch(rest, /visual-system/);
  });

  it("rejects malformed JSON, builtin ids, duplicates, and unknown keys", () => {
    assert.throws(() => extractCustomVisualSystems("```visual-system\n{ nope\n```"), CustomVisualSystemError);
    assert.throws(() => extractCustomVisualSystems('```visual-system\n{"id":"swiss"}\n```'), /builtin system id/);
    assert.throws(() => extractCustomVisualSystems('```visual-system\n{"id":"a_b"}\n```\n```visual-system\n{"id":"a_b"}\n```'), /duplicate/);
    assert.throws(() => extractCustomVisualSystems('```visual-system\n{"id":"a_b","hex":"#fff"}\n```'), CustomVisualSystemError);
    assert.throws(() => extractCustomVisualSystems('```visual-system\n{"id":"Bad-Id"}\n```'), /lower_snake/);
    assert.throws(() => extractCustomVisualSystems('```visual-system\n{"id":"a_b","palette":{"bg":"#fff","ink":"#000","accent":"#00f"}}\n```'), /RRGGBB/);
  });
});

describe("buildCustomVisualSystem", () => {
  it("fills every field from the base system and keeps bans in step with the canvas policy", () => {
    const reg = buildCustomVisualSystem(APPLE, "apple_skill");
    const sys = reg.system;
    const base = VISUAL_SYSTEMS["soft-rounded"];
    assert.equal(sys.id, "apple_keynote");
    assert.equal(sys.voice, "neo-grotesk");
    assert.equal(sys.typeScale.display, 84);
    assert.equal(sys.typeScale.h2, base.typeScale.h2, "h2 inherited");
    assert.equal(sys.typeScale.caption, base.typeScale.caption);
    assert.deepEqual(sys.grid, base.grid);
    assert.equal(sys.canvas.radius, 18);
    assert.equal(sys.canvas.shadow, false);
    assert.equal(sys.bans.shadows, true, "shadow:false in canvas → shadows banned");
    assert.equal(sys.bans.roundedCorners, false);
    assert.equal(sys.canvas.glow, base.canvas.glow);
    assert.equal(sys.canvas.displayTreatment, "none");
    assert.equal(sys.fonts.display, base.fonts.display, "fonts inherited when not authored");
    assert.deepEqual(reg.fontFamilies, ["Inter", "Noto Sans SC"]);
    assert.deepEqual(reg.aliases, ["apple", "keynote"]);
    assert.equal(reg.skillId, "apple_skill");
    assert.ok(reg.seedPalette);
    assert.equal(reg.seedPalette!.bg, "#FFFFFF");
    assert.match(reg.seedPalette!.surface, /^#[0-9a-f]{6}$/i, "surface derived");
    assert.match(reg.seedPalette!.accentSoft, /^#[0-9a-f]{6}$/i, "accentSoft derived");
  });

  it("defaults to swiss when nothing but an id is given and inherits its fonts to load", () => {
    const reg = buildCustomVisualSystem({ id: "bare_one" });
    assert.equal(reg.system.voice, VISUAL_SYSTEMS.swiss.voice);
    assert.equal(reg.system.name, "bare one");
    assert.deepEqual([...reg.fontFamilies], [...fontFamiliesForSystem("swiss")]);
    assert.equal(reg.seedPalette, undefined);
  });

  it("drops an inherited CJK display override when only the Latin display size is re-authored", () => {
    const reg = buildCustomVisualSystem({ id: "big_type", extends: "swiss", typeScale: { display: 96 } });
    assert.equal(reg.system.typeScale.display, 96);
    assert.equal(reg.system.typeScale.displayCjk, undefined);
  });
});

describe("custom system registry", () => {
  it("joins the author whitelist, resolves, seeds a theme, loads fonts, and leaves when unregistered", () => {
    assert.equal(isCanvasSystemId("apple_keynote"), false);
    registerCustomVisualSystems([buildCustomVisualSystem(APPLE)]);
    assert.equal(isCanvasSystemId("apple_keynote"), true);
    assert.deepEqual(listCanvasSystemIds(), [...CANVAS_SYSTEM_IDS, "apple_keynote"]);
    assert.equal(listCanvasSystems().at(-1)?.id, "apple_keynote");
    assert.equal(resolveVisualSystem("apple_keynote").voice, "neo-grotesk");
    assert.deepEqual([...fontFamiliesForSystem("apple_keynote")], ["Inter", "Noto Sans SC"]);

    const seed = seedColorTheme("apple_keynote");
    assert.equal(seed.id, "custom");
    assert.equal(seed.palette?.bg, "#FFFFFF");
    assert.equal(seed.palette?.accent, "#0071E3");
    const authored = themeFromAuthoredLook({ systemId: "apple_keynote", palette: { bg: "#000000", ink: "#F5F5F7", accent: "#2997FF" } });
    assert.equal(authored.palette?.bg, "#000000");

    registerCustomVisualSystems([]);
    assert.equal(isCanvasSystemId("apple_keynote"), false);
    assert.throws(() => resolveVisualSystem("apple_keynote"), /Unknown VisualSystem/);
  });

  it("refuses to shadow a builtin id and falls back to a tone palette without a seed", () => {
    registerCustomVisualSystems([
      { system: { ...VISUAL_SYSTEMS.swiss, id: "swiss" }, fontFamilies: [], aliases: [] },
      buildCustomVisualSystem({ id: "night_mode", canvas: { tone: "dark" } }),
    ]);
    assert.deepEqual(listCanvasSystemIds(), [...CANVAS_SYSTEM_IDS, "night_mode"]);
    const seed = seedColorTheme("night_mode");
    assert.equal(seed.palette?.bg, "#0E0E10", "dark tone seed");
  });

  it("normalizeSystemId reaches custom systems by id, name, alias, and word match — before builtin guesses", () => {
    registerCustomVisualSystems([buildCustomVisualSystem(APPLE)]);
    assert.equal(normalizeSystemId("apple_keynote"), "apple_keynote");
    assert.equal(normalizeSystemId("apple-keynote"), "apple_keynote");
    assert.equal(normalizeSystemId("Apple Keynote"), "apple_keynote");
    assert.equal(normalizeSystemId("AppleKeynote"), "apple_keynote");
    assert.equal(normalizeSystemId("keynote look"), "apple_keynote");
    assert.equal(normalizeSystemId("Dark Tech"), "dark-tech");
    assert.equal(normalizeSystemId("swiss grid"), "swiss");
    assert.equal(normalizeSystemId(""), undefined);
    registerCustomVisualSystems([]);
    assert.equal(normalizeSystemId("apple keynote"), undefined);
  });
});

describe("compiling on a custom system", () => {
  it("emits an editable deck whose meta names the custom system and carries its font links", () => {
    registerCustomVisualSystems([buildCustomVisualSystem(APPLE)]);
    const system = resolveVisualSystem("apple_keynote");
    const theme = themeFromAuthoredLook({ systemId: "apple_keynote" });
    const slides: FilledSlide[] = [
      {
        layout: "cover",
        variant: "canvas",
        elements: [
          { slot: "title", kind: "text", name: "slot:title", bbox: { x: 64, y: 240, w: 900, h: 110 }, paintRole: "ink", text: "One idea per page", fontSize: 84 },
          { slot: "kicker", kind: "text", name: "slot:kicker", bbox: { x: 64, y: 200, w: 400, h: 20 }, paintRole: "accent", text: "Keynote", fontSize: 13 },
        ],
      },
      {
        layout: "kpi",
        variant: "canvas",
        elements: [
          { slot: "title", kind: "text", name: "slot:title", bbox: { x: 64, y: 48, w: 900, h: 50 }, paintRole: "ink", text: "Faster everywhere", fontSize: 40 },
          {
            slot: "kpis",
            kind: "device",
            name: "slot:kpis",
            bbox: { x: 64, y: 200, w: 1152, h: 300 },
            paintRole: "surface",
            device: { type: "kpiRow", items: [{ value: "2×", title: "Speed" }, { value: "40%", title: "Less power" }, { value: "18 h", title: "Battery" }] },
          },
        ],
      },
    ];
    const result = compileCanvasDeck({ system, theme, slides, title: "Keynote" });
    const meta = result.presentation.meta as { deckgen?: { system?: string; theme?: string }; fontCssLinks?: Array<{ family: string }> };
    assert.equal(meta.deckgen?.system, "apple_keynote");
    assert.equal(meta.deckgen?.theme, "custom");
    assert.deepEqual(meta.fontCssLinks?.map((l) => l.family), ["Inter", "Noto Sans SC"]);
    const cover = result.presentation.slides[0]!;
    const title = cover.layers[0]!.shapes.find((s) => s.kind === "text" && JSON.stringify(s).includes("One idea per page"));
    assert.ok(title, "title survives snap");
    const titleJson = JSON.stringify(title);
    assert.match(titleJson, /"fontWeight":600/, "neo-grotesk display weight");
    const kpi = result.presentation.slides[1]!;
    assert.ok(kpi.layers[0]!.shapes.some((s) => JSON.stringify(s).includes("2×")), "kpi numerals emitted");
    assert.equal(result.reflect.findings.filter((f) => /unknown|whitelist/i.test(f.issue)).length, 0);
  });
});

describe("neo-grotesk voice", () => {
  it("is semibold and tight on display, sentence-case on kickers, no mono index", () => {
    const sys = buildCustomVisualSystem(APPLE).system;
    const display = typeRole(sys, "display", 84, "Hello");
    assert.equal(display.fontWeight, 600);
    assert.ok((display.letterSpacing ?? 0) < 0, "negative tracking on display");
    const cjk = typeRole(sys, "display", 66, "你好");
    assert.ok((cjk.letterSpacing ?? 0) > (display.letterSpacing ?? 0), "CJK tracks looser than Latin");
    assert.equal(typeRole(sys, "h1", 40).fontWeight, 600);
    assert.equal(typeRole(sys, "h2", 24).fontWeight, 500);
    assert.equal(typeRole(sys, "body", 18).fontWeight, 400);
    const kicker = typeRole(sys, "kicker", 13);
    assert.equal(kicker.caps, undefined);
    assert.equal(kicker.fontFamily, sys.fonts.display);
    assert.equal(typeRole(sys, "index", 13).fontFamily, sys.fonts.display);
  });
});
