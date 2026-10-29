// 只读摘要函数 —— 给 LLM 的"看清当前状态"数据契约。
//
// ⚠️ 契约（.cursor/rules/ppt-design-rules.mdc §7）：
//   - getPresentationSummary → 每个 slide 既返回 background (kind) 也返回
//     backgroundDetail (kind + 主色 + alpha + image src)
//   - listShapesOnSlide → text shape 必须返回 style { color, fontSize, fontWeight }；
//     非 text shape 必须返回 fill { kind, color, alpha }
// 新加 shape 类型 / 改 Paint 结构时必须回头同步这几个函数，否则 AI 丢失
// 联动检查（ripple-effect）的数据基础。

import type { Paint, Shape, Slide, TextShape } from "@ppt/core";
import { extractSmartArtItems } from "@ppt/core";

const DATA_URL_RE = /^data:([^;,]+)?(;base64)?,/i;

/** 工具返回里省略 data: / 超长 URL，避免下一轮请求体爆炸。 */
export function elideUrlForSummary(src: string): string {
  if (DATA_URL_RE.test(src)) {
    const mime = src.match(DATA_URL_RE)?.[1] ?? "application/octet-stream";
    const comma = src.indexOf(",");
    const b64 = comma < 0 ? "" : src.slice(comma + 1);
    const bytes = Math.floor((b64.length * 3) / 4);
    return `data:${mime};base64,(…${bytes} bytes elided)`;
  }
  if (src.startsWith("blob:")) return "blob:(session-only)";
  if (src.length > 240) return `${src.slice(0, 240)}…`;
  return src;
}

// 把 Paint 折成"主色 + 类型"的极简摘要。
// 目的：让 LLM 在 ripple-effect / 对比度兜底里能直接拿到 bg / fill 的代表色，
// 不必再追加多次读类调用。色值仅用于推理参考，并非渲染权威值。
export function paintSummary(p: Paint | undefined):
  | { kind: string; color?: string; alpha?: number; src?: string; fit?: string }
  | undefined {
  if (!p) return undefined;
  switch (p.kind) {
    case "solid":
      return { kind: "solid", color: p.color, alpha: p.alpha };
    case "linear":
    case "radial": {
      // 取中间 stop（>=0.5 的第一个）作为"视觉主色"近似 —— 比第一个 stop 更能
      // 反映用户眼里看到的颜色（gradient 边缘色一般偏次要）。
      const stops = p.stops ?? [];
      const mid = stops.find((s) => s.offset >= 0.5) ?? stops[Math.floor(stops.length / 2)] ?? stops[0];
      return { kind: p.kind, color: mid?.color, alpha: mid?.alpha };
    }
    case "image":
      return {
        kind: "image",
        src: p.src ? elideUrlForSummary(p.src) : undefined,
        alpha: p.alpha,
        fit: p.fit,
      };
    case "pattern":
      return { kind: "pattern", color: p.fg, alpha: p.fgAlpha };
    case "groupFill":
      return { kind: "groupFill" };
    case "none":
      return { kind: "none" };
    default:
      return undefined;
  }
}

// 给 LLM 的"代表性文字样式"摘要：取首段首个非空 run 的 color/fontSize/fontWeight。
// 多 run 的标题/正文绝大多数情况下整段同色同字号，这个近似已经够支撑对比度判断。
export function textStyleSummary(t: TextShape): {
  color?: string;
  fontSize?: number;
  fontWeight?: number | string;
  italic?: boolean;
} {
  for (const para of t.paragraphs) {
    for (const run of para.runs) {
      if (run.text && run.text.length > 0) {
        return {
          color: run.color,
          fontSize: run.fontSize,
          fontWeight: run.fontWeight,
          italic: run.italic,
        };
      }
    }
  }
  return {};
}

export function findShapeDeep(slide: Slide, id: string): Shape | undefined {
  for (const layer of slide.layers) {
    for (const s of layer.shapes) {
      const found = walkShape(s, id);
      if (found) return found;
    }
  }
  return undefined;
}

function walkShape(s: Shape, id: string): Shape | undefined {
  if (s.id === id) return s;
  if (s.kind === "group") {
    for (const c of s.children) {
      const f = walkShape(c, id);
      if (f) return f;
    }
  }
  return undefined;
}

export function shapeSummary(s: Shape, depth = 0): Record<string, unknown> {
  const base: Record<string, unknown> = {
    id: s.id,
    name: s.name,
    kind: s.kind,
    bbox: s.bbox,
    visible: s.visible,
    locked: s.locked,
    opacity: s.opacity,
  };
  if (s.transform?.rotation) base.rotation = s.transform.rotation;
  if (s.descr) base.descr = s.descr;
  if (s.hyperlink) {
    base.hyperlink = {
      kind: s.hyperlink.kind,
      target: s.hyperlink.target,
      tooltip: s.hyperlink.tooltip,
      ...(s.hyperlink.sound ? { sound: s.hyperlink.sound.name ?? true } : {}),
    };
  }
  if (s.hoverLink) {
    base.hoverLink = {
      kind: s.hoverLink.kind,
      target: s.hoverLink.target,
      tooltip: s.hoverLink.tooltip,
      ...(s.hoverLink.sound ? { sound: s.hoverLink.sound.name ?? true } : {}),
    };
  }
  // 让 LLM 看到"这个 shape 自己什么颜色" —— 是 ripple-effect 自检（比如背景换色后
  // 找出仍硬编码深灰文字的 shape）的最低数据基础。
  const fill = paintSummary(s.fill);
  if (fill) base.fill = fill;
  if (s.stroke) {
    base.stroke = {
      width: s.stroke.width,
      paint: paintSummary(s.stroke.paint),
      dash: s.stroke.dash,
    };
  }
  if (s.math?.latex) base.math = s.math.latex;
  if (s.kind === "text") {
    const t = s as TextShape;
    const first = t.paragraphs[0];
    const cell: Record<string, unknown> = {};
    if (s.cellMeta) {
      cell.cell = {
        gridSpan: s.cellMeta.gridSpan,
        rowSpan: s.cellMeta.rowSpan,
        hidden: s.cellMeta.hidden,
      };
    }
    return {
      ...base,
      ...cell,
      text: t.paragraphs.map((p) => p.runs.map((r) => r.math?.latex || r.text).join("")).join("\n"),
      style: textStyleSummary(t),
      rtl: first?.rtl,
      bullet: first?.bullet,
      vAlign: t.vAlign,
    };
  }
  if (s.kind === "chart") {
    return {
      ...base,
      chartType: s.chart.type,
      categories: s.chart.categories?.slice(0, 8),
      series: s.chart.series.slice(0, 4).map((x) => x.name),
    };
  }
  if (s.kind === "image") {
    return {
      ...base,
      src: elideUrlForSummary(s.src),
      cropRect: s.cropRect,
    };
  }
  if (s.kind === "video" || s.kind === "audio") {
    return {
      ...base,
      src: elideUrlForSummary(s.src),
      autoplay: s.autoplay,
      loop: s.loop,
      muted: s.muted,
      volume: s.volume,
      trim: s.trim,
      ...(s.kind === "video" && s.poster ? { poster: elideUrlForSummary(s.poster) } : {}),
    };
  }
  if (s.kind === "line") {
    return { ...base, endpoints: { x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2 } };
  }
  if (s.kind === "polygon") {
    return { ...base, points: s.points.slice(0, 24) };
  }
  if (s.kind === "path") {
    return {
      ...base,
      presetType: s.presetType,
      presetAdj: s.presetAdj,
      startCxn: s.startCxn,
      endCxn: s.endCxn,
    };
  }
  if (s.kind === "ole") {
    return {
      ...base,
      progId: s.progId,
      objectName: s.objectName,
      showAsIcon: s.showAsIcon,
      embedFileName: s.embedFileName,
    };
  }
  if (s.kind === "model3d") {
    return { ...base, objectName: s.objectName, hasGlb: Boolean(s.glbSrc) };
  }
  if (s.kind === "webEmbed") {
    return {
      ...base,
      provider: s.provider,
      originalUrl: s.originalUrl,
      embedUrl: elideUrlForSummary(s.embedUrl),
      allowFullscreen: s.allowFullscreen,
    };
  }
  if (s.kind === "group" && depth < 2) {
    const extra: Record<string, unknown> = {};
    if (s.tableMeta) {
      extra.table = { ...s.tableMeta };
      extra.cells = s.children.map((c, i) => {
        const cols = s.tableMeta!.cols;
        const row = Math.floor(i / cols);
        const col = i % cols;
        const text =
          c.kind === "text"
            ? c.paragraphs.map((p) => p.runs.map((r) => r.text).join("")).join("\n")
            : "";
        return {
          id: c.id,
          row,
          col,
          text: text.length > 80 ? `${text.slice(0, 80)}…` : text,
          hidden: c.cellMeta?.hidden || undefined,
          gridSpan: c.cellMeta?.gridSpan,
          rowSpan: c.cellMeta?.rowSpan,
          fill: paintSummary(c.fill),
          vAlign: c.kind === "text" ? c.vAlign : undefined,
        };
      });
    } else {
      extra.children = s.children.slice(0, 12).map((c) => shapeSummary(c, depth + 1));
    }
    if (s.smartArtMeta) {
      extra.smartArt = {
        layout: s.smartArtMeta.layout,
        items: extractSmartArtItems(s),
      };
    }
    return { ...base, ...extra };
  }
  return base;
}

export function slideSummary(slide: Slide, idx: number): Record<string, unknown> {
  const shapes = slide.layers.flatMap((l) => l.shapes);
  const bg = paintSummary(slide.background);
  return {
    // 显式回 idx：模型做条件筛选（"没背景图的页面"等）时常要把结果直接喂回
    // slideIdx-级 mutation tool，靠数组下标自己数容易错位。
    slideIdx: idx,
    name: slide.name,
    shapeCount: shapes.length,
    // 同时返回 kind（兼容消费方）和完整摘要（含主色），供 ripple-effect 自检。
    background: slide.background?.kind ?? "default",
    backgroundDetail: bg,
    notes: slide.notes,
    show: slide.show,
    hf: slide.hf,
    layoutRef: slide.layoutRef,
    // 仅给出首屏几个 shape，避免 prompt token 爆炸。
    topShapes: shapes.slice(0, 8).map((s) => ({
      id: s.id,
      kind: s.kind,
      name: s.name,
    })),
  };
}
