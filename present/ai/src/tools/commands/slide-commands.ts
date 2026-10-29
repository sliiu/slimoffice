// AI 修改对话用的额外 EditCommand：覆盖现有 editor commands 没有的"幻灯片级"操作。
//
// 幻灯片列表增删改重排已统一到 @ppt/editor slide-commands（与 playground 共用 undo 栈）。
// 本文件保留 AI 专属：主题应用、从 spec 建页、重命名、ReplaceText 等。

import {
  type EditCommand,
  type Layer,
  type Presentation,
  type Slide,
  type TextParagraph,
  type TextRun,
} from "@ppt/core";
import {
  newSlideId,
  reindexPresentationSlides,
} from "@ppt/editor/commands";
import { renderLayout, type SlideSpec } from "../../generate/compile/layouts";
import { getTheme } from "../../themes";

export {
  ApplyCustomThemeCmd,
  ApplyThemeCmd,
  type ApplyCustomThemeOpts,
  type ApplyThemeOpts,
} from "@ppt/themes";

export {
  DeleteSlideCmd,
  DeleteSlidesCmd,
  DuplicateSlideCmd,
  InsertSlideCmd,
  MoveSlideCmd,
} from "@ppt/editor/commands";

function blankLayer(): Layer {
  return { id: `layer_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`, name: "Main", visible: true, locked: false, shapes: [] };
}

// 通过 layout + theme 生成一张新 slide。AI tool "createSlide" 落到此命令。
export class CreateSlideFromSpecCmd implements EditCommand {
  readonly label = "AI: Create slide";
  private inserted?: { idx: number; slide: Slide };

  constructor(
    private idx: number,
    private spec: SlideSpec,
    private themeId: string | undefined,
  ) {}

  apply(pres: Presentation): void {
    const theme = getTheme(this.themeId ?? pres.theme?.id);
    const layout = renderLayout(this.spec, pres.size, theme);
    // 背景优先级同 compile.ts：layout 显式 > theme.backgroundPaint > solid(theme.palette.bg)。
    const background =
      layout.background ?? theme.backgroundPaint ?? { kind: "solid" as const, color: theme.palette.bg };
    const slide: Slide = {
      id: newSlideId(),
      name: titleOfSpec(this.spec),
      index: 0,
      background,
      layers: [{ ...blankLayer(), shapes: layout.shapes }],
    };
    const at = Math.max(0, Math.min(this.idx, pres.slides.length));
    pres.slides.splice(at, 0, slide);
    this.inserted = { idx: at, slide };
    reindexPresentationSlides(pres);
  }

  revert(pres: Presentation): void {
    if (!this.inserted) return;
    const cur = pres.slides.indexOf(this.inserted.slide);
    if (cur >= 0) pres.slides.splice(cur, 1);
    reindexPresentationSlides(pres);
  }
}

function titleOfSpec(spec: SlideSpec): string {
  if ("title" in spec && spec.title) return spec.title;
  if (spec.kind === "quote") return spec.quote.slice(0, 24);
  return spec.kind;
}

// 设置幻灯片名称（用于左侧缩略图列表显示和大纲）。
export class SetSlideNameCmd implements EditCommand {
  readonly label = "AI: Rename slide";
  private prev?: string;

  constructor(private idx: number, private next: string) {}

  apply(pres: Presentation): void {
    const s = pres.slides[this.idx];
    if (!s) return;
    this.prev = s.name;
    s.name = this.next;
  }

  revert(pres: Presentation): void {
    const s = pres.slides[this.idx];
    if (!s || this.prev === undefined) return;
    s.name = this.prev;
  }
}

// 设置 slide.notes（讲稿）。
export class SetSlideNotesCmd implements EditCommand {
  readonly label = "AI: Set notes";
  private prev?: string | undefined;

  constructor(private idx: number, private next: string) {}

  apply(pres: Presentation): void {
    const s = pres.slides[this.idx];
    if (!s) return;
    this.prev = s.notes;
    s.notes = this.next;
  }

  revert(pres: Presentation): void {
    const s = pres.slides[this.idx];
    if (!s) return;
    s.notes = this.prev;
  }
}

// 替换某 text shape 的全部段落（用 plain text，每行一段，沿用旧的第一个 run 样式）。
// 类似 EditTextCmd，但接受多段输入；本身和 EditTextCmd 是兼容的（EditTextCmd 也接受 string[]）。
// 这里独立一个轻量版本，仅在 AI tools 内部使用，避免循环依赖 editor。
export class ReplaceTextCmd implements EditCommand {
  readonly label = "AI: Replace text";
  private prev?: TextParagraph[];

  constructor(
    private slideIdx: number,
    private shapeId: string,
    private next: string[],
  ) {}

  apply(pres: Presentation): void {
    const text = findTextShape(pres, this.slideIdx, this.shapeId);
    if (!text) return;
    this.prev = text.paragraphs.map((p) => clone(p));
    const baseRun: TextRun = text.paragraphs[0]?.runs[0] ?? { text: "" };
    const baseParaShape: Omit<TextParagraph, "runs"> = (() => {
      if (!text.paragraphs[0]) return {} as Omit<TextParagraph, "runs">;
      const { runs: _drop, ...rest } = clone(text.paragraphs[0]);
      return rest;
    })();
    text.paragraphs = this.next.map((line) => ({
      ...clone(baseParaShape),
      runs: [{ ...clone(baseRun), text: line }],
    }));
  }

  revert(pres: Presentation): void {
    const text = findTextShape(pres, this.slideIdx, this.shapeId);
    if (!text || !this.prev) return;
    text.paragraphs = this.prev.map((p) => clone(p));
  }
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function findTextShape(
  pres: Presentation,
  slideIdx: number,
  id: string,
): import("@ppt/core").TextShape | undefined {
  const slide = pres.slides[slideIdx];
  if (!slide) return undefined;
  for (const layer of slide.layers) {
    for (const s of layer.shapes) {
      const found = walkText(s, id);
      if (found) return found;
    }
  }
  return undefined;
}

function walkText(
  s: import("@ppt/core").Shape,
  id: string,
): import("@ppt/core").TextShape | undefined {
  if (s.id === id && s.kind === "text") return s;
  if (s.kind === "group") {
    for (const c of s.children) {
      const f = walkText(c, id);
      if (f) return f;
    }
  }
  return undefined;
}
