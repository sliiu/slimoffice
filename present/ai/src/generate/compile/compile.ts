// 把 PresentationSpec（zod 校验过的 AI 输出）编译为 @ppt/core 的 Presentation IR。
//
// 关键点：
//   1. 每个 spec.slides[i] 通过 renderLayout(spec, size, theme) 得到 Shape[]，
//      包成一个 Slide。整篇得到 Presentation。
//   2. 主题在 Presentation 顶层落到一个轻量 theme 对象上，方便未来 round-trip
//      到 OOXML <a:clrScheme>；当前主要作为信息载体，渲染层不依赖它。
//   3. 写真正的 slide master + layouts（占位符槽位）。装饰在母版上合成；
//      slide 只带内容 shape + layoutRef。from-scratch 导出走 serializer 的
//      renderSlideMasterXml / renderSlideLayoutXml。

import type { Paint, Presentation, Shape, Slide, SlideMaster, SlideSize, TextShape, Theme } from "@ppt/core";
import { identityTransform } from "@ppt/core";
import type { GuidanceInput, PresentationSpec } from "../schema";
import { applyCompileConstraints, isFullBleedRole, isNoBulletLayout } from "./constraints";
import {
  buildMastersFromThemeDef,
  findLayoutRefByType,
  getTheme,
  type GeneratedThemeSpec,
  type ThemeDef,
} from "../../themes";
import { buildMotifShapes, renderLayout, type SlideSpec } from "./layouts";
import type { LayoutStyleSpec } from "../layout-style";

const DEFAULT_SIZE: SlideSize = { width: 960, height: 540 };

export interface CompileOptions {
  size?: SlideSize;
  // 当 spec 没给 themeId 时使用。
  defaultThemeId?: string;
  /**
   * 自定义主题（AI 生成 / 用户自定义）。优先级最高，存在时忽略 themeId 查询。
   * 用法：先 realizeGeneratedTheme(spec) → 把得到的 ThemeDef 透传进来。
   */
  themeOverride?: ThemeDef;
  /**
   * 构图种子：驱动 layouts v2 的构图变体选择。缺省时每次 compile 随机 ——
   * "重新生成"会得到可见的构图差异；传入固定值可复现同一构图。
   * 同一 deck 内按 layout kind 派生子种子：相同 layout → 相同变体（整册一致），
   * 不同 layout 各自选型。
   */
  designSeed?: number;
  /**
   * AI 设计的布局风格（generateLayoutStyle 产出）：构图锚点/版心/面板/母题
   * 按 spec 执行；缺省回退种子变体。
   */
  layoutStyle?: LayoutStyleSpec;
  themeSpec?: GeneratedThemeSpec;
  masters?: SlideMaster[];
  guidance?: GuidanceInput;
  /**
   * Compile-path A/B only（非用户开关）。false 时跳过 applyCompileConstraints /
   * 全出血 overlay / no-bullet 剥离，用来量门禁 pass-rate。默认 true。
   */
  constraintsEnabled?: boolean;
}

/** FNV-1a 弱哈希：把 layout kind 折进 deck 种子，同 kind 稳定同 seed。 */
/** 全出血戏剧页用完整装饰；信息密度高的内容页用静默版（滤掉大面积光晕）。 */
const FEATURE_DECOR_KINDS = new Set(["cover", "hero", "section", "closing", "quote", "stat"]);

export function decorationRoleForKind(kind: string | undefined): "feature" | "content" {
  return kind && FEATURE_DECOR_KINDS.has(kind) ? "feature" : "content";
}

function layoutTypeForKind(kind: string | undefined): string {
  switch (kind) {
    case "cover":
    case "hero":
    case "closing":
    case "quote":
    case "stat":
      return "title";
    case "section":
      return "sectionHead";
    case "two-column":
    case "comparison":
      return "twoObj";
    default:
      return "obj";
  }
}

function attachSlots(shapes: Shape[], kind: string | undefined): Shape[] {
  let titleIdx: number | undefined;
  let subIdx: number | undefined;
  let bodyIdx: number | undefined;
  shapes.forEach((s, i) => {
    if (s.kind !== "text") return;
    const n = (s.name ?? "").toLowerCase();
    if (titleIdx == null && (n.includes("title") || n.includes("heading") || n === "quote")) {
      titleIdx = i;
      return;
    }
    if (subIdx == null && n.includes("subtitle")) {
      subIdx = i;
      return;
    }
    if (bodyIdx == null && (n.includes("body") || n.includes("bullet") || n.includes("side text"))) {
      bodyIdx = i;
    }
  });
  const titleType = kind === "cover" || kind === "hero" ? "ctrTitle" : "title";
  return shapes.map((s, i) => {
    if (i === titleIdx) return { ...s, placeholder: { type: titleType, idx: "0" } };
    if (i === subIdx) return { ...s, placeholder: { type: "subTitle", idx: "1" } };
    if (i === bodyIdx) return { ...s, placeholder: { type: "body", idx: "1" } };
    return s;
  });
}

export function hashKind(seed: number, kind: string): number {
  let h = seed >>> 0;
  for (let i = 0; i < kind.length; i++) {
    h ^= kind.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const FULL_BLEED_PLACEHOLDER =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#0f172a"/><stop offset="100%" stop-color="#1e293b"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`,
  );

function fullBleedPlaceholder(): Paint {
  return { kind: "image", src: FULL_BLEED_PLACEHOLDER, fit: "cover" };
}

function applyFullBleedVisual(slide: Slide, kind: string, size: SlideSize, overlay: number): void {
  if (!isFullBleedRole(kind)) return;
  if (!slide.background || slide.background.kind !== "image") {
    slide.background = fullBleedPlaceholder();
  }
  const layer = slide.layers[0];
  if (!layer) return;
  if (layer.shapes.some((s) => s.name === "BG overlay" || s.id.startsWith("bgov_"))) return;
  layer.shapes.unshift({
    id: `bgov_${kind}_${slide.index}`,
    kind: "rect",
    name: "BG overlay",
    bbox: { x: 0, y: 0, w: size.width, h: size.height },
    zIndex: -10,
    visible: true,
    locked: false,
    opacity: 1,
    transform: identityTransform(),
    fill: { kind: "solid", color: "#000000", alpha: overlay > 0 ? overlay : 0.55 },
  });
}

function stripNoBulletMarks(slide: Slide, kind: string): void {
  if (!isNoBulletLayout(kind)) return;
  for (const layer of slide.layers) {
    for (const sh of layer.shapes) {
      if (sh.kind !== "text") continue;
      for (const para of (sh as TextShape).paragraphs) {
        if (para.bullet) delete para.bullet;
      }
    }
  }
}

export function compilePresentation(spec: PresentationSpec, opts: CompileOptions = {}): Presentation {
  const useConstraints = opts.constraintsEnabled !== false;
  const constrained = useConstraints ? applyCompileConstraints(spec, opts.guidance).spec : spec;
  const size = opts.size ?? DEFAULT_SIZE;
  const theme = opts.themeOverride ?? getTheme(constrained.themeId ?? opts.defaultThemeId);
  const deckSeed = opts.designSeed ?? Math.floor(Math.random() * 0x7fffffff);
  const built = opts.masters?.length
    ? null
    : buildMastersFromThemeDef(
        theme,
        size,
        `ai_${Date.now().toString(36)}`,
        opts.themeSpec,
      );
  const masters = opts.masters?.length ? opts.masters : built!.masters;
  const themeMeta: Theme = built?.coreTheme ?? {
    id: theme.id,
    name: theme.name,
    colors: {
      bg1: theme.palette.bg,
      bg2: theme.palette.bgAlt,
      tx1: theme.palette.text,
      tx2: theme.palette.textMuted,
      accent1: theme.palette.accent1,
      accent2: theme.palette.accent2,
      accent3: theme.palette.accent3,
      accent4: theme.palette.accent4,
    },
    fonts: { major: theme.fonts.title, minor: theme.fonts.body },
  };

  const slides: Slide[] = constrained.slides.map((s, i) => {
    const kind = (s as SlideSpec).kind;
    const layout = renderLayout(s as SlideSpec, size, theme, {
      seed: hashKind(deckSeed, kind),
      ...(opts.layoutStyle ? { style: opts.layoutStyle } : {}),
    });
    const motifShapes = buildMotifShapes(opts.layoutStyle, size, theme, i, kind);
    const shapes = attachSlots([...motifShapes, ...layout.shapes], kind);
    const ref = findLayoutRefByType(masters, layoutTypeForKind(kind));
    const slide: Slide = {
      id: `slide_${Date.now().toString(36)}_${i}`,
      name: kind,
      index: i,
      layers: [
        { id: "layer_main", name: "Main", visible: true, locked: false, shapes },
      ],
      background: layout.background ?? theme.backgroundPaint ?? { kind: "solid", color: theme.palette.bg },
    };
    if (ref) slide.layoutRef = ref;
    const notes = (s as { notes?: string }).notes;
    if (notes && notes.trim()) slide.notes = notes.trim();
    if (useConstraints) {
      applyFullBleedVisual(slide, kind, size, (s as { bgOverlay?: number }).bgOverlay ?? 0.55);
      stripNoBulletMarks(slide, kind);
    }
    return slide;
  });

  return {
    id: `pres_${Date.now().toString(36)}`,
    size,
    slides,
    masters,
    theme: themeMeta,
  };
}

// 把 outline 应急转换为 spec —— 当 LLM 调 generate slide 失败 / 不可用 / 用户跳过
// 详情阶段时，仅基于 outline 也能编译出一份"占位 PPT"。
import type { Outline } from "../schema";

function splitCells(line: string): string[] {
  const parts = line.split(/\s*\|\s*/).map((s) => s.trim()).filter((s) => s.length > 0);
  return parts.length >= 2 ? parts : [line.trim()];
}

function tableSpecFromOutline(
  title: string,
  bullets: string[] | undefined,
): { kind: "table"; title: string; headers: string[]; rows: string[][] } {
  const raw = bullets?.length ? bullets : [title];
  const first = splitCells(raw[0] ?? title);
  const headerRow = first.length >= 2;
  const headers = headerRow ? first : ["Item", "Detail"];
  const lines = headerRow ? raw.slice(1) : raw;
  const cols = headers.length;
  const rows = (lines.length ? lines : [title]).map((line) => {
    const cells = splitCells(line);
    if (cells.length === 1 && cols === 2) return [cells[0]!, ""];
    const out = cells.slice();
    while (out.length < cols) out.push("");
    return out.slice(0, cols);
  });
  return { kind: "table", title, headers, rows };
}

const CHART_TYPES = ["column", "bar", "line", "area", "pie", "doughnut"] as const;
type ChartLayoutType = (typeof CHART_TYPES)[number];

function parseChartNum(s: string): number {
  const m = s.replace(/[,$\s]/g, "").match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : NaN;
}

function chartSpecFromOutline(
  title: string,
  bullets: string[] | undefined,
): {
  kind: "chart";
  title: string;
  chartType: ChartLayoutType;
  categories: string[];
  series: Array<{ name: string; values: number[] }>;
} {
  const raw = bullets?.length ? bullets.slice() : [];
  let chartType: ChartLayoutType = "column";
  const head = (raw[0] ?? "").trim().toLowerCase();
  if ((CHART_TYPES as readonly string[]).includes(head)) {
    chartType = head as ChartLayoutType;
    raw.shift();
  }
  const lines = raw.length ? raw : [`A | B | C`, `${title} | 3 | 5 | 8`];
  const pairwise =
    lines.length >= 2 &&
    lines.every((l) => {
      const c = splitCells(l);
      return c.length === 2 && Number.isFinite(parseChartNum(c[0]!));
    });
  if (pairwise) {
    return {
      kind: "chart",
      title,
      chartType,
      categories: lines.map((l) => (splitCells(l)[1] ?? "").slice(0, 16)),
      series: [{ name: title.slice(0, 24), values: lines.map((l) => parseChartNum(splitCells(l)[0]!)) }],
    };
  }
  const catCells = splitCells(lines[0] ?? "A | B | C");
  let categories: string[];
  let seriesStart = 1;
  if (catCells.length >= 2 && catCells.every((c, i) => i === 0 || Number.isNaN(parseChartNum(c)))) {
    categories = catCells;
  } else if (catCells.length >= 3 && Number.isFinite(parseChartNum(catCells[1]!))) {
    categories = catCells.slice(1).map((_, i) => `C${i + 1}`);
    seriesStart = 0;
  } else {
    categories = catCells.length >= 2 ? catCells : ["A", "B", "C"];
  }
  while (categories.length < 2) categories.push(`C${categories.length + 1}`);
  categories = categories.slice(0, 12);
  const pie = chartType === "pie" || chartType === "doughnut";
  const seriesLines = lines.slice(seriesStart);
  const fallback = [`${title} | ${categories.map((_, i) => String((i + 1) * 3)).join(" | ")}`];
  const series = (seriesLines.length ? seriesLines : fallback)
    .slice(0, pie ? 1 : 6)
    .map((line, i) => {
      const cells = splitCells(line);
      const named = cells.length > 1 && Number.isNaN(parseChartNum(cells[0] ?? ""));
      const name = named ? (cells[0] ?? `S${i + 1}`).slice(0, 24) : `S${i + 1}`;
      const nums = (named ? cells.slice(1) : cells).map(parseChartNum);
      return {
        name,
        values: categories.map((_, j) => (Number.isFinite(nums[j]) ? nums[j]! : (j + 1) * (i + 2))),
      };
    });
  return { kind: "chart", title, chartType, categories, series };
}

export function outlineToFallbackSpec(
  outline: Outline,
  opts?: { injectMissingCover?: boolean },
): PresentationSpec {
  const slides: PresentationSpec["slides"] = [];
  const firstIsCover = outline.slides[0]?.layoutHint === "cover";
  if (opts?.injectMissingCover !== false && !firstIsCover) {
    slides.push({
      kind: "cover",
      title: outline.title,
      ...(outline.subtitle ? { subtitle: outline.subtitle } : {}),
    });
  }
  for (const item of outline.slides) {
    const hint = item.layoutHint ?? "bullets";
    if (hint === "cover") {
      slides.push({
        kind: "cover",
        title: item.title,
        ...(outline.subtitle ? { subtitle: outline.subtitle } : {}),
      });
    } else if (hint === "section") {
      slides.push({ kind: "section", title: item.title });
    } else if (hint === "quote") {
      slides.push({ kind: "quote", quote: item.bullets?.[0] ?? item.title });
    } else if (hint === "closing") {
      slides.push({ kind: "closing", title: item.title });
    } else if (hint === "hero") {
      slides.push({ kind: "hero", title: item.title });
    } else if (hint === "stat") {
      slides.push({
        kind: "stat",
        value: item.bullets?.[0] ?? "100%",
        label: item.title,
      });
    } else if (hint === "content") {
      slides.push({ kind: "content", title: item.title, body: (item.bullets ?? []).join("\n") });
    } else if (hint === "table") {
      slides.push(tableSpecFromOutline(item.title, item.bullets));
    } else if (hint === "two-column") {
      const half = Math.ceil((item.bullets?.length ?? 0) / 2);
      slides.push({
        kind: "two-column",
        title: item.title,
        leftBullets: item.bullets?.slice(0, half) ?? [item.title],
        rightBullets: item.bullets?.slice(half) ?? [""],
      });
    } else if (hint === "image-text") {
      slides.push({
        kind: "image-text",
        title: item.title,
        bullets: item.bullets ?? [item.title],
      });
    } else if (hint === "cards") {
      const raw = item.bullets ?? [item.title];
      slides.push({
        kind: "cards",
        title: item.title,
        cards: raw.slice(0, 4).map((b) => {
          const parts = b.split(/[:：—-]/);
          return {
            title: (parts[0] ?? b).trim().slice(0, 24) || b.slice(0, 24),
            body: (parts.slice(1).join(":").trim() || b).slice(0, 80),
          };
        }),
      });
    } else if (hint === "timeline") {
      const raw = item.bullets ?? [item.title, "Next", "Later"];
      while (raw.length < 3) raw.push(`Step ${raw.length + 1}`);
      slides.push({
        kind: "timeline",
        title: item.title,
        steps: raw.slice(0, 6).map((b) => ({ label: b.slice(0, 20) })),
      });
    } else if (hint === "comparison") {
      const raw = item.bullets ?? [item.title];
      let leftLabel = "A";
      let rightLabel = "B";
      let rest = raw;
      const labelParts = (raw[0] ?? "").split(/\s*\|\|\s*|\s+vs\.?\s+|\s+对\s+/i);
      if (labelParts.length === 2 && labelParts[0]!.trim() && labelParts[1]!.trim()) {
        leftLabel = labelParts[0]!.trim().slice(0, 20);
        rightLabel = labelParts[1]!.trim().slice(0, 20);
        rest = raw.slice(1);
      }
      const half = Math.ceil(rest.length / 2);
      slides.push({
        kind: "comparison",
        title: item.title,
        leftLabel,
        leftBullets: rest.slice(0, half).length ? rest.slice(0, half) : [item.title],
        rightLabel,
        rightBullets: rest.slice(half).length ? rest.slice(half) : [""],
      });
    } else if (hint === "agenda") {
      const raw = item.bullets ?? [item.title, "Topic 2", "Topic 3"];
      while (raw.length < 3) raw.push(`Item ${raw.length + 1}`);
      slides.push({
        kind: "agenda",
        title: item.title,
        items: raw.slice(0, 8).map((b, i) => ({
          number: String(i + 1).padStart(2, "0"),
          label: b,
        })),
      });
    } else if (hint === "metrics") {
      const raw = item.bullets ?? ["100%|Score", "2x|Growth"];
      while (raw.length < 2) raw.push(`${raw.length + 1}x|Metric`);
      slides.push({
        kind: "metrics",
        title: item.title,
        metrics: raw.slice(0, 4).map((b) => {
          const [value, ...rest] = b.split(/[|：:]/);
          return { value: (value ?? b).trim().slice(0, 8), label: (rest.join(":") || b).trim().slice(0, 28) };
        }),
      });
    } else if (hint === "chart") {
      slides.push(chartSpecFromOutline(item.title, item.bullets));
    } else if (hint === "process") {
      const raw = item.bullets ?? [item.title, "Next", "Done"];
      while (raw.length < 3) raw.push(`Step ${raw.length + 1}`);
      slides.push({
        kind: "process",
        title: item.title,
        steps: raw.slice(0, 5).map((b) => ({ title: b.slice(0, 24) })),
      });
    } else if (hint === "banner") {
      slides.push({
        kind: "banner",
        title: item.title,
        bullets: item.bullets && item.bullets.length > 0 ? item.bullets : [item.title],
      });
    } else {
      // bullets 兜底
      slides.push({
        kind: "bullets",
        title: item.title,
        bullets: item.bullets && item.bullets.length > 0 ? item.bullets : [item.title],
      });
    }
    // outline 阶段的演讲备注透传到 spec（fallback 路径也不丢 notes）。
    if (item.notes && slides.length > 0) {
      (slides[slides.length - 1] as { notes?: string }).notes = item.notes;
    }
  }
  return { themeId: outline.themeId, slides };
}
