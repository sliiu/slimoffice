import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  CHROME_DEAD_PATHS,
  EXPORT_COPY_BAN,
  INSERT_COMMON_IDS,
  MORE_GROUP_IDS,
  listExportFormats,
  listHelpExperimentalChildren,
  listInsertCommon,
  listInsertMore,
  listLookObjectChildren,
  listMoreGroups,
} from "./chrome-plan-b.js";

const here = dirname(fileURLToPath(import.meta.url));

function load(name: string): string {
  return readFileSync(join(here, name), "utf8");
}

describe("editor chrome Plan B catalogs", () => {
  it("locks Insert common order: 新页 · 文本框 · 图片 · 形状", () => {
    assert.deepEqual([...INSERT_COMMON_IDS], ["slide", "text", "image", "shape"]);
    assert.deepEqual(listInsertCommon({ insertSlide: true }), ["slide", "text", "image", "shape"]);
  });

  it("omits Insert more items when host hooks are missing", () => {
    assert.deepEqual(listInsertMore({}), ["moreShapes"]);
    assert.deepEqual(
      listInsertMore({
        insertTable: true,
        insertChart: true,
        insertIcon: true,
        insertVideo: true,
      }),
      ["moreShapes", "table", "chart", "icon", "media"],
    );
    assert.ok(!listInsertMore({ insertAudio: false, insertVideo: false }).includes("media"));
  });

  it("never lists dead paths on the first screen", () => {
    const first = [...listInsertCommon({ insertSlide: true }), ...listInsertMore({ insertExtras: true })];
    for (const dead of CHROME_DEAD_PATHS) {
      assert.ok(!first.includes(dead as never), dead);
    }
  });

  it("shows extra formats only when the host already exports them", () => {
    assert.deepEqual(listExportFormats({}), ["pptx"]);
    assert.deepEqual(listExportFormats({ canExportPdf: true }), ["pptx", "pdf"]);
    assert.ok(!listExportFormats({ canExportPdf: true }).includes("html"));
    assert.ok(!listExportFormats({ canExportPdf: true }).includes("png"));
  });

  it("regroups More into user-facing groups, with 实验 on its own", () => {
    assert.deepEqual([...MORE_GROUP_IDS], [
      "file",
      "editText",
      "draw",
      "lookObject",
      "present",
      "workspace",
      "review",
      "help",
      "experimental",
    ]);
    assert.deepEqual(
      listMoreGroups({
        hasFile: true,
        hasEdit: true,
        hasDraw: true,
        hasLook: true,
        hasObject: true,
        hasPresent: true,
        hasWorkspace: true,
        hasReview: true,
        hasHelp: true,
        hasExperimental: true,
        hasTransitions: true,
        hasAnimations: true,
      }),
      [...MORE_GROUP_IDS],
    );
    assert.ok(!listMoreGroups({ hasHelp: true, hasExperimental: false }).includes("file"));
    assert.deepEqual(listHelpExperimentalChildren({ hasHelp: true }), ["help"]);
    assert.deepEqual(listLookObjectChildren({ hasLook: true, hasTransitions: true }), ["look", "transitions"]);
  });

  it("omits 实验 when the experimental hook is missing", () => {
    assert.deepEqual(listHelpExperimentalChildren({ hasHelp: true }), ["help"]);
    assert.deepEqual(listMoreGroups({ hasHelp: true }), ["help"]);
    assert.deepEqual(listMoreGroups({ hasExperimental: true }), ["experimental"]);
  });
});

describe("editor chrome Plan B source locks", () => {
  it("chrome first screens do not resurrect 动作 / animation painter / show-comments", () => {
    const ribbon = load("ribbon.ts");
    const top = ribbon.match(/顶栏：Undo[\s\S]*?if \(a\.close\)/)?.[0] ?? "";
    const view = ribbon.match(/const viewBar = doc\.createElement[\s\S]*?const commandBar = /)?.[0] ?? "";
    const bottom = ribbon.match(/const commandBar = [\s\S]*?panelCleanupFns\.push/)?.[0] ?? "";
    assert.ok(top && view && bottom, "shell chrome regions must exist");
    for (const src of [top, view, bottom]) {
      assert.doesNotMatch(src, /ribbon\.insert\.action/);
      assert.doesNotMatch(src, /toggleAnimationPainter|animationPainter/);
      assert.doesNotMatch(src, /toggleComments|showComments/);
    }
  });

  it("Plan B More popover is no longer the primary task IA", () => {
    const ribbon = load("ribbon.ts");
    assert.doesNotMatch(ribbon, /function openMoreChrome/);
    assert.doesNotMatch(ribbon, /function openInsertChrome/);
    assert.doesNotMatch(ribbon, /openMoreChrome\(/);
    assert.doesNotMatch(ribbon, /openInsertChrome\(/);
  });

  it("Export popover never uses the PowerPoint product name", () => {
    const en = load("i18n/messages-en.ts");
    const zh = load("i18n/messages-zh.ts");
    const keys = ["toolbar.export", "toolbar.exportHint", "toolbar.export.pptx", "toolbar.export.pptxHint", "toolbar.export.pdf", "toolbar.export.pdfHint"];
    for (const src of [en, zh]) {
      for (const key of keys) {
        const m = src.match(new RegExp(`"${key}":\\s*"((?:\\\\.|[^"\\\\])*)"`));
        assert.ok(m, key);
        assert.ok(!EXPORT_COPY_BAN.test(m[1]!), `${key}=${m[1]}`);
      }
    }
    assert.match(zh, /"toolbar.export.pptxHint":\s*"演示文稿"/);
    assert.match(en, /"toolbar.export.pptxHint":\s*"Presentation"/);
  });

  it("zoom Fit button uses i18n, not hardcoded English", () => {
    const ribbon = load("ribbon.ts");
    assert.match(ribbon, /mkBtn\(t\("ribbon\.zoom\.fit"\),\s*t\("ribbon\.zoom\.fit"\)/);
    assert.doesNotMatch(ribbon, /mkBtn\("Fit"/);
  });

  it("ColorTheme chips stay read-only spans", () => {
    const inspector = load("inspector.ts");
    assert.match(inspector, /chip\.className = "ppt-color-theme-chip"/);
    assert.match(inspector, /const chip = doc\.createElement\("span"\)/);
    assert.doesNotMatch(
      inspector,
      /const chip = doc\.createElement\("button"\)[\s\S]{0,80}ppt-color-theme-chip/,
    );
  });
});
