import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  CHROME_DEAD_PATHS,
  QUICK_BAR_IDS,
  TASK_TAB_IDS,
  listCommandGroups,
  listExportFormats,
  listQuickBar,
  listTaskTabs,
} from "./chrome-plan-b.js";

const here = dirname(fileURLToPath(import.meta.url));

function load(name: string): string {
  return readFileSync(join(here, name), "utf8");
}

const FULL_FLAGS = {
  insertSlide: true,
  insertIcon: true,
  formatPainter: true,
  hasFile: true,
  hasInsert: true,
  hasLayout: true,
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
};

describe("editor shell catalogs", () => {
  it("locks task groups behind 常用, File first, 实验 last", () => {
    assert.deepEqual([...TASK_TAB_IDS], [
      "file",
      "insert",
      "editText",
      "draw",
      "lookObject",
      "present",
      "workspace",
      "review",
      "help",
      "experimental",
    ]);
    assert.deepEqual(listTaskTabs(FULL_FLAGS), [...TASK_TAB_IDS]);
    assert.deepEqual(listCommandGroups(FULL_FLAGS), ["common", ...TASK_TAB_IDS]);
    assert.deepEqual(listCommandGroups({}), ["common"]);
  });

  it("locks 常用 order: 新建幻灯片 · 版式 · 文本框 · 插入 · 图片 · 形状 · 图标 | 选择 · 格式刷", () => {
    assert.deepEqual([...QUICK_BAR_IDS], [
      "slide",
      "layout",
      "text",
      "insert",
      "image",
      "shape",
      "icon",
      "select",
      "formatPainter",
    ]);
    assert.deepEqual(listQuickBar(FULL_FLAGS), [...QUICK_BAR_IDS]);
  });

  it("omits gated 常用 items when host hooks are missing", () => {
    assert.deepEqual(listQuickBar({}), ["text", "image", "shape", "select"]);
  });

  it("never lists dead paths (动画刷 / 显示批注 / 动作)", () => {
    const first = [...listQuickBar(FULL_FLAGS), ...listCommandGroups(FULL_FLAGS)];
    for (const dead of CHROME_DEAD_PATHS) {
      assert.ok(!first.includes(dead as never), dead);
    }
  });

  it("Export lists PPTX plus only the formats the host can export", () => {
    assert.deepEqual(listExportFormats({}), ["pptx"]);
    assert.deepEqual(
      listExportFormats({ canExportPdf: true, canExportPng: true, canExportHtml: true, canExportHtmlZip: true }),
      ["pptx", "pdf", "png", "html", "html-zip"],
    );
  });
});

describe("editor shell source locks", () => {
  it("top bar is Undo · Redo | Share only; Theme lives in Design, Export in File", () => {
    const ribbon = load("ribbon.ts");
    const top = ribbon.match(/顶栏：Undo[\s\S]*?if \(a\.close\)/)?.[0] ?? "";
    assert.match(top, /toolbar\.undo/);
    assert.match(top, /toolbar\.redo/);
    assert.match(top, /openShareChrome/);
    assert.match(top, /addShareSep/);
    assert.match(top, /editor\.status\.slide/);
    assert.doesNotMatch(top, /toolbar\.theme"/);
    assert.doesNotMatch(top, /openExportChrome/);
    assert.doesNotMatch(top, /toolbar\.insert"/);
    assert.doesNotMatch(top, /toolbar\.more"/);
    assert.match(ribbon, /ribbon\.themes\.gallery/);
    assert.match(ribbon, /openExportChrome\(exportBtn\)/);
  });

  it("view bar: 普通 / 浏览 / 阅读 · 标尺 · 参考线 · 网格 | 放映 · 明暗 · 属性栏", () => {
    const ribbon = load("ribbon.ts");
    const view = ribbon.match(/const viewBar = doc\.createElement[\s\S]*?const commandBar = /)?.[0] ?? "";
    assert.ok(view, "view bar region");
    assert.match(view, /PRESENTATION_VIEW_ICON\[mode\]/);
    assert.match(ribbon, /normal: "panel-left"/);
    assert.match(ribbon, /sorter: "layout-grid"/);
    assert.match(ribbon, /outline: "list-collapse"/);
    assert.match(ribbon, /reading: "book-open"/);
    assert.match(ribbon, /notesPage: "sticky-note"/);
    assert.doesNotMatch(ribbon, /"grid-2x2"/);
    assert.doesNotMatch(view, /a\.stepZoom/);
    assert.match(view, /ppt-view-bar-center/);
    assert.match(view, /viewBar\.append\(viewLeft, viewRight\)/);
    assert.match(view, /viewLeft\.appendChild\(viewCenter\)/);
    assert.match(view, /"ruler", "ribbon\.show\.rulers"/);
    assert.match(view, /"crosshair", "ribbon\.show\.guides"/);
    assert.match(view, /"grid-3x3", "ribbon\.show\.grid"/);
    assert.match(view, /setGuideAidColor/);
    assert.match(view, /setGridAidColor/);
    assert.match(view, /contextmenu/);
    assert.match(view, /viewCenter\.hidden = \(a\.getPresentationView\?\.\(\) \?\? "normal"\) !== "normal"/);
    assert.match(view, /toggleAppearance/);
    assert.match(view, /subscribeAppearance\(syncAppearanceBtn\)/);
    assert.match(view, /data-ppt-tip/);
    const editor = load("editor.ts");
    assert.match(editor, /subscribeAppearance: opts\.subscribeAppearance/);
    const main = readFileSync(join(here, "../../playground/src/main.ts"), "utf8");
    assert.match(main, /subscribeAppearance: onColorSchemeChange/);
    assert.match(view, /startSlideshowFromBeginning/);
    assert.match(view, /startSlideshowFromCurrent/);
    assert.match(view, /ppt-view-bar-play/);
    assert.match(view, /dataset\.viewBarPlayMenu/);
    assert.match(view, /fromBeginningLabel/);
    assert.match(view, /fromCurrentLabel/);
    assert.match(view, /icon: "play"/);
    assert.match(view, /icon: "skip-forward"/);
    assert.match(ribbon, /startSlideshowFromBeginning\?\.\(\),\s*"play"/);
    assert.match(ribbon, /startSlideshowFromCurrent\?\.\(\),\s*"skip-forward"/);
    assert.match(view, /playStart = mode\.id/);
    assert.match(view, /checked: mode\.id === playStart/);
    assert.match(view, /dataset\.viewBarPlay = "1"[\s\S]*dataset\.viewBarAppearance = "1"/);
    assert.match(view, /togglePropertiesPanel/);
  });

  it("sorter reflows by width; reading hides the command row and pages the slide", () => {
    const views = load("presentation-views.ts");
    assert.match(views, /grid\.style\.display = "grid"/);
    assert.match(views, /repeat\(auto-fill,minmax\(min\(/);
    assert.doesNotMatch(views, /grid\.style\.display = ""/);
    const editor = load("editor.ts");
    assert.match(editor, /ppt-reading/);
    assert.match(editor, /onPresentationViewChange/);
    assert.match(editor, /presentationView === "reading"/);
    const css = load("ui-style.ts");
    assert.match(css, /\.ppt-editor-root\.ppt-reading \.ppt-command-bar \{ display: none; \}/);
  });

  it("bottom is one command row: group pill + strip; no tab rail", () => {
    const ribbon = load("ribbon.ts");
    assert.match(ribbon, /ppt-group-pill/);
    assert.match(ribbon, /ppt-command-strip/);
    assert.match(ribbon, /ppt-group-popover/);
    assert.match(ribbon, /ppt-command-list-btn/);
    assert.match(ribbon, /toolbar\.group\.list/);
    assert.doesNotMatch(ribbon, /ppt-group-more|toolbar\.group\.more/);
    assert.match(ribbon, /listCommandGroups/);
    assert.doesNotMatch(ribbon, /ppt-task-rail|ppt-task-strip|ppt-task-tab/);
    assert.match(ribbon, /file: \["File"\]/);
    assert.match(ribbon, /insert: \["Insert"\]/);
    assert.match(ribbon, /focusTransitionsPanel/);
    assert.match(ribbon, /focusAnimationsPanel/);
  });

  it("command row regions never resurrect dead paths", () => {
    const ribbon = load("ribbon.ts");
    const bottom = ribbon.match(/const commandBar = [\s\S]*?selectGroup\("common"\);/)?.[0] ?? "";
    assert.ok(bottom, "command row region");
    assert.doesNotMatch(bottom, /ribbon\.insert\.action/);
    assert.doesNotMatch(bottom, /toggleAnimationPainter|animationPainter/);
    assert.doesNotMatch(bottom, /toggleComments|showComments/);
  });

  it("locks density tokens: view 40 / command 40 / status 32", () => {
    const css = load("ui-style.ts");
    const tokens = readFileSync(join(here, "../../ui/src/tokens.ts"), "utf8");
    const tokensCss = readFileSync(join(here, "../../ui/tokens.css"), "utf8");
    for (const src of [tokens, tokensCss]) {
      assert.match(src, /--chrome-view-bar-height:\s*40px/);
      assert.match(src, /--chrome-command-bar-height:\s*40px/);
      assert.match(src, /--chrome-status-bar-height:\s*32px/);
      assert.match(src, /--chrome-control-height:\s*28px/);
    }
    assert.match(css, /\.ppt-view-bar\s*\{[^}]*height:\s*var\(--chrome-view-bar-height/s);
    assert.match(css, /\.ppt-view-bar-center\[hidden\]\s*\{\s*display:\s*none/);
    assert.match(css, /\.ppt-command-bar\s*\{[^}]*height:\s*var\(--chrome-command-bar-height/s);
    assert.match(css, /\.ppt-command-strip::-webkit-scrollbar\s*\{[^}]*height:\s*6px/s);
    assert.doesNotMatch(css, /\.ppt-command-strip::-webkit-scrollbar\s*\{\s*display:\s*none/);
    const stripRule = css.match(/\.ppt-command-strip\s*\{[^}]*\}/s)?.[0] ?? "";
    assert.doesNotMatch(stripRule.replace(/\/\*[\s\S]*?\*\//g, ""), /scrollbar-width|scrollbar-color/);
    assert.match(css, /@supports not selector\(::-webkit-scrollbar\)/);
    assert.match(css, /\.ppt-command-strip\s*\{[^}]*align-items:\s*flex-start/s);
    assert.match(css, /\.ppt-command-bar\s*\{[^}]*box-shadow:\s*inset 0 1px 0/s);
    assert.doesNotMatch(css, /\.ppt-command-common\s*\{[^}]*height:\s*100%/s);
    const stripPanel = css.match(/\.ppt-command-strip \.ppt-ribbon-panel\s*\{[^}]*\}/s)?.[0] ?? "";
    assert.match(stripPanel, /flex:\s*0 0 auto/);
    assert.match(stripPanel, /min-width:\s*max-content/);
    assert.doesNotMatch(stripPanel, /min-width:\s*0/);
    assert.match(css, /\.ppt-topbar-btn--share\s*\{[^}]*#4[Ff]46[Ee]5/s);
  });

  it("properties panel and notes drawer default collapsed; status bar carries view menu + zoom + dock menu", () => {
    const editor = load("editor.ts");
    const ribbon = load("ribbon.ts");
    const css = load("ui-style.ts");
    assert.match(editor, /let rightPanelOpen = false/);
    assert.match(editor, /let dockOpen = false/);
    assert.match(editor, /statusBar\.prepend\(toolbar\.statusStart\)/);
    assert.match(editor, /statusBar\.append\(toolbar\.statusEnd\)/);
    assert.doesNotMatch(editor, /collapseTaskStrip/);
    const statusEnd = ribbon.match(/const statusEnd = doc\.createElement[\s\S]*?selectGroup\("common"\);/)?.[0] ?? "";
    assert.ok(statusEnd, "status end region");
    assert.match(statusEnd, /statusEnd\.appendChild\(zoom\)/);
    assert.match(statusEnd, /a\.stepZoom/);
    assert.match(ribbon, /pptStatusDock/);
    assert.match(ribbon, /ppt-status-menu-btn/);
    assert.match(editor, /timelineDismissed/);
    assert.match(editor, /openTimeline\("animation"\)/);
    assert.match(editor, /RIGHT_PANEL_MIN = 280/);
    assert.match(editor, /RIGHT_PANEL_MAX = 480/);
    assert.match(editor, /RIGHT_PANEL_DEFAULT = 320/);
    assert.match(editor, /pp\.rightPanelWidth/);
    assert.match(editor, /ppt-right-panel-resizer/);
    assert.match(editor, /minmax\(0,1fr\) \$\{rightPanelWidth\}px/);
    assert.match(css, /\.ppt-right-panel-resizer\s*\{[^}]*cursor:\s*col-resize/s);
  });

  it("insert strip places the table ahead of the shape library", () => {
    const ribbon = load("ribbon.ts");
    const insert = ribbon.match(/const insert = mkPanel\(\);[\s\S]*?tabPanels\.set\("Insert"/)?.[0] ?? "";
    const tableAt = insert.indexOf("toolbar.insert.tableShort");
    const shapesAt = insert.indexOf("ribbon.group.shapes");
    assert.ok(tableAt >= 0 && shapesAt > tableAt);
    assert.doesNotMatch(insert.slice(shapesAt), /insertTable/);
  });

  it("strips that already use icons collapse the remaining icon buttons to 24px", () => {
    const ribbon = load("ribbon.ts");
    const css = load("ui-style.ts");
    assert.match(ribbon, /function markUniformIconStrip/);
    assert.match(ribbon, /ppt-command-strip--icon-uniform/);
    assert.match(ribbon, /ppt-ribbon-btn__label/);
    assert.match(ribbon, /markUniformIconStrip\(commandStrip\)/);
    assert.match(ribbon, /ppt-ribbon-btn--keep-label/);
    const rule = css.match(/\.ppt-command-strip\.ppt-command-strip--icon-uniform \.ppt-ribbon-btn--named:not\(\.ppt-ribbon-btn--keep-label\)\s*\{[^}]*\}/s)?.[0] ?? "";
    assert.match(rule, /width:\s*24px/);
    assert.match(rule, /height:\s*24px/);
    assert.match(css, /\.ppt-ribbon-btn__label\s*\{[^}]*display:\s*none/s);
    assert.match(css, /\.ppt-ribbon-btn--named\s*\{[^}]*width:\s*auto/s);
  });

  it("mounts a selection format bar beside the selection, not on the common row", () => {
    const editor = load("editor.ts");
    const bar = load("selection-format-bar.ts");
    assert.match(editor, /mountSelectionFormatBar/);
    assert.match(editor, /formatSubject/);
    assert.doesNotMatch(editor, /if \(ev\.kind === "execute"\) return/);
    assert.doesNotMatch(editor, /inspectorRefreshOnBlur/);
    assert.match(editor, /propsWrap\.contains\(active\)/);
    assert.match(bar, /sizeInput\.addEventListener\("input"/);
    assert.match(bar, /addEventListener\("input", \(\) => onChange\(input\.value\)\)/);
    assert.match(bar, /dataset\.pptSelectionFormat = "1"/);
    assert.match(bar, /kind: "text"/);
    assert.doesNotMatch(load("chrome-plan-b.ts"), /formatBar|fontSize/);
    const quick = load("chrome-plan-b.ts").match(/QUICK_BAR_IDS = \[[\s\S]*?\]/)?.[0] ?? "";
    assert.doesNotMatch(quick, /bold|bullet|fill/);
  });

  it("paints shapes that hang off the slide in the normal editor workspace", () => {
    const editor = load("editor.ts");
    const svg = load("../../renderer/src/svg-backend.ts");
    assert.match(editor, /const clipToSlide = presentationView !== "normal"/);
    assert.match(editor, /clipToSlide/);
    assert.match(editor, /stageWrap\.addEventListener\("pointerdown"/);
    assert.match(editor, /data-ppt-text-editor/);
    assert.match(editor, /outsideSlide/);
    assert.match(svg, /opts\.clipToSlide === false/);
    assert.match(svg, /overflow", "visible"/);
  });

  it("header status and slide counter reuse i18n", () => {
    const zh = load("i18n/messages-zh.ts");
    const en = load("i18n/messages-en.ts");
    assert.match(zh, /"editor\.status\.slide": "幻灯片 \{current\} \/ \{total\}"/);
    assert.match(en, /"editor\.status\.slide": "Slide \{current\} \/ \{total\}"/);
    assert.match(zh, /"playground\.header\.savedAuto": "已保存·自动保存"/);
    assert.match(en, /"playground\.header\.savedAuto": "Saved · autosave"/);
  });

  it("playground header: brand · file button | slide pill | AI · undo/redo · Share · avatar; slide toggle leads the view bar", () => {
    const html = readFileSync(join(here, "../../playground/index.html"), "utf8");
    const main = readFileSync(join(here, "../../playground/src/main.ts"), "utf8");
    const editor = load("editor.ts");
    const left = html.match(/<div class="header-left">[\s\S]*?<div class="header-center">/)?.[0] ?? "";
    assert.doesNotMatch(left, /header-menu-btn/);
    const foot = html.match(/class="slides-panel-foot"[\s\S]*?<\/div>/)?.[0] ?? "";
    assert.match(foot, /id="add-slide-btn"[\s\S]*id="dup-slide-btn"[\s\S]*id="del-slide-btn"[\s\S]*id="add-section-btn"/);
    assert.doesNotMatch(foot, /header-menu-btn/);
    assert.match(main, /function placeSlidesToggle/);
    assert.match(main, /querySelector\("\.ppt-view-bar-left"\)/);
    assert.match(main, /left\.prepend\(headerMenuBtn\)/);
    assert.match(main, /ppt-view-bar-sep/);
    assert.match(html, /\.ppt-view-bar-sep\s*\{[^}]*width:\s*1px/s);
    assert.match(html, /--ppt-view-seg-width:\s*max\(0px,\s*calc\(var\(--slides-col,\s*180px\)\s*-\s*57px\)\)/);
    assert.match(html, /\.slides-panel-foot\s*\{[^}]*height:\s*32px/s);
    assert.match(html, /\.slides-panel-foot\s*\{[^}]*justify-content:\s*center/s);
    assert.match(html, /\.slides-panel-foot\s*\{[^}]*background:\s*var\(--editor-header,\s*#181818\)/s);
    assert.match(html, /main\.thumbs-collapsed\s*\{\s*grid-template-columns:\s*1fr/);
    assert.match(html, /main\.thumbs-collapsed \.slides-panel\s*\{\s*display:\s*none/);
    assert.match(html, /grid-template-columns:\s*var\(--slides-col,\s*180px\)/);
    assert.match(main, /SLIDES_COL_DEFAULT = 180/);
    assert.match(html, /class="slides-panel-resizer"/);
    assert.match(main, /pp\.slidesColWidth/);
    assert.match(main, /SLIDES_COL_MIN = 120/);
    assert.match(main, /SLIDES_COL_MAX = 480/);
    assert.match(main, /panel-left-open/);
    assert.match(main, /panel-left-close/);
    assert.doesNotMatch(main, /headerMenuBtn, "menu"/);
    assert.match(left, /app-brand-name/);
    assert.match(left, /class="header-doc-stack"[\s\S]*id="open-split"/);
    assert.match(html, /#status,[\s\S]*display:\s*none\s*!important/);
    assert.match(editor, /dataset\.pptStatusHost = "1"/);
    assert.match(editor, /left:50%/);
    assert.match(editor, /transform:translate\(-50%,-50%\)/);
    const right = html.match(/<div class="header-right">[\s\S]*?<\/header>/)?.[0] ?? "";
    assert.match(right, /id="ribbon-host"[\s\S]*id="ai-btn"/);
    for (const id of ["play", "appearance-toggle"]) {
      assert.match(right, new RegExp(`header-moved[^>]*id="${id}"|id="${id}"[^>]*header-moved`), id);
    }
    assert.match(right, /id="locale-split"/);
    assert.doesNotMatch(right, /header-moved[^>]*id="locale-split"|id="locale-split"[^>]*header-moved/);
    assert.match(html, /body\.is-signed-in #locale-split/);
    assert.match(right, /id="output-split"/);
    assert.doesNotMatch(right, /header-moved[^>]*id="output-split"|id="output-split"[^>]*header-moved/);
    assert.match(html, /header #output-split > button:not\(:disabled\)/);
    assert.match(html, /#output-main:not\(:disabled\)\s*\{[^}]*border-right:\s*none/s);
    assert.match(html, /#output-split > button\.caret:not\(:disabled\)\s*\{[^}]*border-left-color:\s*color-mix\(in srgb, #4f46e5 84%, #fff\)/s);
    assert.match(html, /\.header-right \.ppt-topbar-btn--share \{ display: none !important; \}/);
    assert.match(html, /<\/header>\s*<div id="view-bar-host"/);
    assert.match(main, /viewBarHost,/);

    const paint = main.match(/function paintStatus\([\s\S]*?\nfunction /)?.[0] ?? "";
    assert.match(paint, /statusEl\.textContent\s*=\s*""/);
    assert.match(paint, /setHostStatus\(headerText, hostKind, statusAction\)/);
    assert.match(paint, /cloudPassphraseRequired/);
    assert.match(paint, /openAccountSettingsPanel\(\{ focus: "passphrase" \}\)/);
    assert.doesNotMatch(paint, /isIdleSavedStatus\(headerText\) \? ""/);
    assert.match(html, /#open-main,[\s\S]*display:\s*none\s*!important/);
    assert.match(left, /id="open-main"[^>]*hidden/);
  });

  it("group switcher and command list follow appearance tokens", () => {
    const css = load("ui-style.ts");
    const ribbon = load("ribbon.ts");
    assert.match(css, /\.ppt-chrome-popover,\s*\.ppt-chrome-menu\s*\{[^}]*background:\s*var\(--popover\)/s);
    assert.match(css, /\.ppt-topbar-popover,\s*\.ppt-topbar-menu\s*\{[^}]*background:\s*var\(--popover\)/s);
    assert.match(css, /\.ppt-topbar-popover,\s*\.ppt-topbar-menu\s*\{[^}]*color:\s*var\(--popover-foreground\)/s);
    assert.match(css, /\.ppt-group-chip\s*\{[^}]*color:\s*var\(--muted-foreground\)/s);
    assert.match(
      css,
      /\.ppt-group-chip\[data-group="experimental"\][\s\S]*color:\s*var\(--warning, #d97706\)/,
    );
    assert.match(css, /\.ppt-command-host \.ppt-ribbon-group__label\s*\{[^}]*background:\s*var\(--popover\)/s);
    assert.match(css, /\.ppt-topbar-popover\.ppt-command-host\s*\{[^}]*overflow:\s*hidden/s);
    assert.match(css, /\.ppt-command-scroll\s*\{[^}]*overflow:\s*auto/s);
    assert.match(ribbon, /className = "ppt-command-scroll"/);
    assert.doesNotMatch(css, /\.ppt-group-chip\s*\{[^}]*#171717/s);
    assert.doesNotMatch(css, /\.ppt-command-host \.ppt-ribbon-group--menu \.ppt-ribbon-btn\s*\{[^}]*#171717/s);
    assert.match(css, /\.ppt-chrome-share-copy\s*\{[^}]*#4F46E5/s);
  });
});
