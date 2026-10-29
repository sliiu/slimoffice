import type {
  BulletDef,
  ChartDef,
  ClrMap,
  HeaderFooter,
  HyperlinkRef,
  LevelStyleSpec,
  Paint,
  ImageColorAdjust,
  Shape,
  Slide,
  Stroke,
  StyleRefColor,
  ShapeLocks,
  BackgroundRef,
  TextLevelStyle,
  TextParagraph,
  TextRun,
  TextStyles,
} from "@ppt/core";
import { encodeWebEmbedDescr } from "@ppt/core";
import { attrs, esc, firstCssTypeface, hex, parseColor, pxToEmu, pxToHundredthPt, tag, underlineToOoxml } from "./xml-util";
import type { MediaRegistrar } from "./media-table";
import {
  blipRidAttr,
  REL_TYPE_AUDIO,
  REL_TYPE_OFFICE_MEDIA,
  REL_TYPE_VIDEO,
} from "./media-table";
import type { OleEmbeddingRegistrar } from "./embedding-table";
import { imageSizeFromSrc } from "./image-size";
import { OFFICIAL_PRESET_NAMES } from "./preset-names";
import { svgPathToDrawingML } from "./svg-path-to-drawingml";
import { collectShapeEffectsForWrite, effectsToXml } from "./pptx-effects";
import { meta3DToXml } from "./pptx-3d";
import { tableGroupToXml } from "./pptx-table";
import { CHART_EX_GRAPHIC_URI, renderChartExReferenceXml } from "./pptx-chart-ex";
import { model3DFrameToXml } from "./pptx-model3d";
import { oleFrameToXml } from "./pptx-ole";
import { pickEaTypeface } from "./theme-export";
import { latexToOMathPara } from "./omml-write";
import { DGM_GRAPHIC_URI, type DiagramRelIds } from "./pptx-smartart";
import { inkContentPartToXml, isInkPath, type InkRel } from "./pptx-ink";
import type { MediaTimingHint } from "./pptx-timing";

const SHAPE_NEW_LINE = "\n";

/**
 * `ShapeCtx` 的 `slideSize` 字段是为了解决 WPS Office / macOS QuickLook 的渲染怪癖：
 * 当一个 `<p:sp>` 的 `<a:xfrm>` 起点为 (0,0) **且** `<a:ext>` 完全等于 slide 尺寸时，
 * 这两个 renderer 会把它当作"重复的背景层"静默丢弃。典型症状：
 *   - 用户在图片背景上叠了一层 #000 半透明矩形作压暗 overlay → 预览正常但
 *     在 WPS 打开后 overlay 消失，标题对比度退化到不可读。
 * 我们在 `xfrm()` 里检测这个 pattern 并把 offset 平移 1 EMU（≈0.0001px，肉眼
 * 完全感知不到）来绕过启发式。
 */
export type ShapeCtx = {
  media: MediaRegistrar;
  spIdCounter: { next: number };
  /** shape.id → 本次写出的 cNvPr@id。由 assignSpIds 预填，allocSpId 查找。 */
  spIdByShapeId?: Map<string, number>;
  usedSpIds?: Set<number>;
  slideSize?: { width: number; height: number };
  /**
   * 祖先 group 链上累积的 opacity（默认 1）。OOXML 没有 group / shape 级
   * opacity 字段，渲染器靠 `<g opacity>` 模拟；持久化时必须把这部分乘到每个叶子
   * shape 的 fill / stroke / image alpha 上，否则保存后 group 半透明效果全丢。
   * 由 `groupToXml` 在下钻 children 时累计：`child.ctx.parentOpacity = parent * group.opacity`。
   */
  parentOpacity?: number;
  /**
   * 因 entrance 动画而在运行时被压成 `opacity=0` 的整 shape（parser timing pass /
   * `applyInitialEntranceState` 产物）。这是"入场前隐藏"的 runtime 状态，不是用户
   * 设置的透明度；烘焙进 fill / stroke / blip alpha 会让 shape 在保存后整片消失。
   * 由 slide 渲染路径按 `computeInitialEntranceState(slide).hiddenShapes` 注入，
   * `effectiveOpacity` 对命中的 shape 按 1 处理（round-trip 路径靠 `__opacitySnapshot`
   * 做同样的区分）。
   */
  entranceHidden?: ReadonlySet<Shape>;
  /**
   * chart 部件注册器（from-scratch slide 渲染路径注入）。ChartShape 序列化时
   * 调 register 拿 relId → 输出 `<p:graphicFrame>` 引用真正的 c:chart 部件；
   * 返回 null（不支持的图表类型）或未注入（master/layout/round-trip
   * patch 上下文）时回退 rect 占位。
   */
  charts?: { register(def: ChartDef): { relId: string; chartEx: boolean } | null };
  /**
   * 外部超链接注册器（from-scratch slide 渲染路径注入）。shape / run 级
   * `hyperlink: { kind: "url" }` 序列化时调 register 拿 relId → 输出
   * `<a:hlinkClick r:id>`，rels 里补 TargetMode="External" 的 hyperlink 关系。
   * 未注入（master/layout/round-trip 新增 shape）时 URL 链接跳过不写，
   * 避免悬空 r:id 让 PowerPoint 报修复；action 型跳转（next/prev/…）不需要
   * 关系，任何上下文都照常输出。
   *
   * `registerSlide(n)` 处理「跳到第 n 页」：注册一条 internal 的 slide 关系并返回
   * relId，页码越界时返回 undefined。
   */
  links?: { register(url: string): string; registerSlide?(slideNumber: number): string | undefined };
  /** OLE embedding 注册器（from-scratch slide 渲染路径注入）。 */
  embeddings?: OleEmbeddingRegistrar;
  /**
   * SmartArt diagram 部件注册器。带 `smartArtMeta` 的 group 序列化成
   * `<p:graphicFrame>` + `dgm:relIds`；未注入时回退普通 grpSp。
   */
  diagrams?: { register(group: Extract<Shape, { kind: "group" }>): DiagramRelIds | null };
  /** Draw / Office 墨迹：path + ink 写出 `p:contentPart` + InkML。 */
  inks?: { register(shape: Extract<Shape, { kind: "path" }>): InkRel | null };
  /**
   * 插入的视频 / 音频：写出 pic 时记下 cNvPr@id，供 slide `<p:timing>` 生成
   * `p:video` / `p:audio`（Office 单击播放 / 自动播放靠这棵时序树）。
   */
  mediaTimings?: MediaTimingHint[];
};

/** 预分配 slide 上所有 shape 的 cNvPr@id，让连接符 stCxn 能指向稳定目标。 */
export function assignSpIds(shapes: Shape[], ctx: ShapeCtx): void {
  const walk = (s: Shape): void => {
    allocSpId(s, ctx);
    if (s.kind === "group") for (const c of s.children ?? []) walk(c);
  };
  for (const s of shapes) walk(s);
}

export function allocSpId(s: Shape, ctx: ShapeCtx): number {
  const map = ctx.spIdByShapeId ?? (ctx.spIdByShapeId = new Map());
  const hit = map.get(s.id);
  if (hit !== undefined) return hit;
  const used = ctx.usedSpIds ?? (ctx.usedSpIds = new Set([1]));
  const parsed = /^sp_(\d+)$/.exec(s.id);
  let id: number | undefined;
  if (parsed) {
    const n = Number(parsed[1]);
    if (Number.isFinite(n) && n > 1 && !used.has(n)) id = n;
  }
  if (id === undefined) {
    while (used.has(ctx.spIdCounter.next)) ctx.spIdCounter.next++;
    id = ctx.spIdCounter.next++;
  }
  used.add(id);
  map.set(s.id, id);
  return id;
}

function resolveCxnId(end: { id: number; shapeId?: string }, ctx: ShapeCtx): number {
  if (end.shapeId) {
    const mapped = ctx.spIdByShapeId?.get(end.shapeId);
    if (mapped !== undefined) return mapped;
  }
  return end.id;
}

export function shapeToXml(s: Shape, ctx: ShapeCtx): string {
  try {
    return shapeToXmlInner(s, ctx);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Failed to serialize ${s?.kind ?? "unknown"} shape ${s?.id ?? "?"}: ${msg}`);
  }
}

function shapeToXmlInner(s: Shape, ctx: ShapeCtx): string {
  const eq = equationShapeToXml(s, ctx);
  if (eq) return eq;
  switch (s.kind) {
    case "group":
      if (s.tableMeta) return tableGroupToXml(s, ctx);
      if (s.smartArtMeta) {
        const hit = ctx.diagrams?.register(s) ?? null;
        if (hit) return smartArtFrameToXml(s, hit, ctx);
      }
      return groupToXml(s, ctx);
    case "rect":
    case "ellipse":
    case "path":
    case "polygon":
    case "line":
      if (s.kind === "path" && isInkPath(s)) {
        const hit = ctx.inks?.register(s) ?? null;
        if (hit) return inkContentPartToXml(s, hit, ctx);
      }
      return geomShapeToXml(s, ctx);
    case "text":
      return textShapeToXml(s, ctx);
    case "image":
    case "video":
    case "audio":
      return picShapeToXml(s, ctx);
    case "chart": {
      const hit = ctx.charts?.register(s.chart) ?? null;
      if (hit) return chartFrameToXml(s, hit.relId, hit.chartEx, ctx);
      return geomShapeToXml({ ...s, kind: "rect" } as Shape, ctx);
    }
    case "ole":
      return oleFrameToXml(s, ctx);
    case "model3d":
      return model3DFrameToXml(s, ctx);
    case "webEmbed": {
      const url = s.originalUrl || s.embedUrl;
      const embed = {
        embedUrl: s.embedUrl,
        provider: s.provider ?? "custom",
        originalUrl: url,
      };
      return geomShapeToXml(
        {
          ...s,
          kind: "rect",
          fill: s.fill ?? { kind: "solid", color: "#0f172a" },
          stroke: s.stroke ?? { paint: { kind: "solid", color: "#334155" }, width: 1 },
          name: s.name || "Web embed",
          descr: s.descr || encodeWebEmbedDescr(embed),
          hyperlink: s.hyperlink ?? (url ? { kind: "url", target: url } : undefined),
        } as Shape,
        ctx,
      );
    }
  }
}

const EQ_DESCR_PREFIX = "ppt-equation:";

function equationLatexOf(s: Shape): string | undefined {
  if (s.math?.latex) return s.math.latex;
  const d = s.descr;
  if (!d?.startsWith(EQ_DESCR_PREFIX)) return undefined;
  const rest = d.slice(EQ_DESCR_PREFIX.length);
  const i = rest.indexOf(":");
  if (i < 0) return undefined;
  try {
    return decodeURIComponent(rest.slice(i + 1));
  } catch {
    return rest.slice(i + 1);
  }
}

function equationImageSrc(s: Shape): string | undefined {
  if (s.kind === "image" && typeof s.src === "string" && s.src) return s.src;
  if (s.fill?.kind === "image" && s.fill.src) return s.fill.src;
  return undefined;
}

/**
 * ECMA-376 §22.1 Office Math + Part 3 §13 Markup Compatibility。
 * Choice = `<a14:m>` OMML（PowerPoint / WPS 可再编辑）；Fallback = 公式栅格图。
 */
function equationShapeToXml(s: Shape, ctx: ShapeCtx): string | null {
  const latex = equationLatexOf(s);
  const src = equationImageSrc(s);
  if (!latex || !src) return null;
  const omml = latexToOMathPara(latex);
  if (!omml) return null;
  const id = allocSpId(s, ctx);
  const rid = ctx.media.registerImage(src);
  const xf = xfrm(s, false, ctx.slideSize);
  const name = esc(s.name || "Equation");
  const nv = `<p:cNvPr id="${id}" name="${name}"/>`;
  return `<mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006">
  <mc:Choice xmlns:a14="http://schemas.microsoft.com/office/drawing/2010/main" Requires="a14">
    <p:sp>
      <p:nvSpPr>${nv}<p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>
      <p:spPr>
        ${xf}
        <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
        <a:noFill/>
      </p:spPr>
      <p:txBody>
        <a:bodyPr wrap="none" rtlCol="0" anchor="ctr"><a:spAutoFit/></a:bodyPr>
        <a:p><a:pPr algn="ctr"/><a14:m>${omml}</a14:m></a:p>
      </p:txBody>
    </p:sp>
  </mc:Choice>
  <mc:Fallback>
    <p:sp>
      <p:nvSpPr>${nv}<p:cNvSpPr txBox="1"><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr/></p:nvSpPr>
      <p:spPr>
        ${xf}
        <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
        <a:blipFill><a:blip ${blipRidAttr(src, rid)}/><a:stretch><a:fillRect/></a:stretch></a:blipFill>
      </p:spPr>
      <p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr/></a:p></p:txBody>
    </p:sp>
  </mc:Fallback>
</mc:AlternateContent>`;
}

function smartArtFrameToXml(
  s: Extract<Shape, { kind: "group" }>,
  rels: DiagramRelIds,
  ctx: ShapeCtx,
): string {
  const id = allocSpId(s, ctx);
  return `<p:graphicFrame>
    <p:nvGraphicFramePr>
      ${cNvPrXml(id, s, ctx)}
      <p:cNvGraphicFramePr>${graphicFrameLocksXml(s)}</p:cNvGraphicFramePr>
      ${nvPrXml(s, ctx)}
    </p:nvGraphicFramePr>
    <p:xfrm>
      <a:off x="${pxToEmu(s.bbox.x)}" y="${pxToEmu(s.bbox.y)}"/>
      <a:ext cx="${pxToEmu(Math.max(1, s.bbox.w))}" cy="${pxToEmu(Math.max(1, s.bbox.h))}"/>
    </p:xfrm>
    <a:graphic>
      <a:graphicData uri="${DGM_GRAPHIC_URI}">
        <dgm:relIds xmlns:dgm="${DGM_GRAPHIC_URI}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:dm="${rels.dm}" r:lo="${rels.lo}" r:qs="${rels.qs}" r:cs="${rels.cs}"/>
      </a:graphicData>
    </a:graphic>
  </p:graphicFrame>`;
}

function chartFrameToXml(
  s: Extract<Shape, { kind: "chart" }>,
  relId: string,
  chartEx: boolean,
  ctx: ShapeCtx,
): string {
  const id = allocSpId(s, ctx);
  const graphicUri = chartEx
    ? CHART_EX_GRAPHIC_URI
    : "http://schemas.openxmlformats.org/drawingml/2006/chart";
  const chartRef = chartEx
    ? renderChartExReferenceXml(relId)
    : `<c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="${relId}"/>`;
  return `<p:graphicFrame>
    <p:nvGraphicFramePr>
      ${cNvPrXml(id, s, ctx)}
      <p:cNvGraphicFramePr>${graphicFrameLocksXml(s)}</p:cNvGraphicFramePr>
      ${nvPrXml(s, ctx)}
    </p:nvGraphicFramePr>
    <p:xfrm>
      <a:off x="${pxToEmu(s.bbox.x)}" y="${pxToEmu(s.bbox.y)}"/>
      <a:ext cx="${pxToEmu(Math.max(1, s.bbox.w))}" cy="${pxToEmu(Math.max(1, s.bbox.h))}"/>
    </p:xfrm>
    <a:graphic>
      <a:graphicData uri="${graphicUri}">
        ${chartRef}
      </a:graphicData>
    </a:graphic>
  </p:graphicFrame>`;
}

function groupToXml(g: Extract<Shape, { kind: "group" }>, ctx: ShapeCtx): string {
  const id = allocSpId(g, ctx);
  // group 内部的 children 不能再触发 "full-slide shape" 兜底（child 的 bbox 即便
  // 等于 slide 也不是顶层背景），所以下钻时去掉 slideSize。
  // parentOpacity 把祖先 group 链上的 opacity 累计带下去，叶子 shape 再乘进
  // 自己的 fill / stroke / blip alpha。OOXML 端 group 自身不写 opacity。
  const childCtx: ShapeCtx = {
    ...ctx,
    slideSize: undefined,
    parentOpacity: (ctx.parentOpacity ?? 1) * effectiveOpacity(g, ctx),
  };
  const children = (g.children ?? []).map((c) => shapeToXml(c, childCtx)).join(SHAPE_NEW_LINE);
  const fx = effectsToXml(collectShapeEffectsForWrite(g));
  return `<p:grpSp>
    <p:nvGrpSpPr>
      ${cNvPrXml(id, g, ctx)}
      <p:cNvGrpSpPr>${locksElement("grpSpLocks", g, GRP_LOCK_FLAGS)}</p:cNvGrpSpPr>
      ${nvPrXml(g, ctx)}
    </p:nvGrpSpPr>
    <p:grpSpPr>
      ${xfrm(g, true)}
      ${fillToXml(g.fill, ctx, { w: g.bbox.w, h: g.bbox.h })}
      ${fx}
    </p:grpSpPr>
    ${children}
  </p:grpSp>`;
}

function geomShapeToXml(s: Shape, ctx: ShapeCtx): string {
  const id = allocSpId(s, ctx);
  let prst = "rect";
  let custGeomXml = "";
  if (s.kind === "ellipse") prst = "ellipse";
  else if (s.kind === "rect" && ((s as { rx?: number }).rx ?? 0) > 0) prst = "roundRect";
  else if (s.kind === "line") prst = "line";
  else if (s.kind === "path") {
    // 优先写 <a:prstGeom>：编辑器 / AI 插入的预设形状（shape-factory）会在
    // presetType 记录 OOXML preset 名 + presetAdj 记录原始 avLst 值。
    // prstGeom 在 PowerPoint 里保持"可再编辑的自动图形"语义，且几何 1:1。
    // 非官方 token（防御）或无 presetType（parser custGeom 求值产物）时，
    // 退到从 d 逐命令转换的 custGeom。
    const ps = s as Extract<Shape, { kind: "path" }>;
    if (ps.presetType && OFFICIAL_PRESET_NAMES.has(ps.presetType)) {
      const gds = Object.entries(ps.presetAdj ?? {})
        .map(([n, v]) => `<a:gd name="${esc(n)}" fmla="val ${Math.round(v)}"/>`)
        .join("");
      const geomXml = `<a:prstGeom prst="${ps.presetType}">${gds ? `<a:avLst>${gds}</a:avLst>` : "<a:avLst/>"}</a:prstGeom>`;
      custGeomXml = geomXml;
    } else {
      custGeomXml = pathToCustGeom(ps);
    }
  } else if (s.presetType && OFFICIAL_PRESET_NAMES.has(s.presetType)) {
    // parser 把部分 ST_ShapeType 收成 native rect/ellipse/line/polygon，但仍带 presetType。
    // 写出必须回到 `<a:prstGeom prst>`，不能因为 IR kind 退化成 rect/line 就丢官方 token。
    const gds = Object.entries(s.presetAdj ?? {})
      .map(([n, v]) => `<a:gd name="${esc(n)}" fmla="val ${Math.round(v)}"/>`)
      .join("");
    custGeomXml = `<a:prstGeom prst="${s.presetType}">${gds ? `<a:avLst>${gds}</a:avLst>` : "<a:avLst/>"}</a:prstGeom>`;
  } else if (s.kind === "polygon") {
    custGeomXml = pathToCustGeom(s as Shape & { d?: string; points?: Array<[number, number]> });
  }
  // roundRect：把 rx（px）换算成 adj 调整值（占短边比例 ×100000，0..50000），
  // 否则 PowerPoint 会落到默认 ~16.7% 圆角，和编辑器内的实际圆角不一致。
  let avLst = "<a:avLst/>";
  if (prst === "roundRect") {
    const rx = (s as { rx?: number }).rx ?? 0;
    const bb = (s as { bbox?: { w: number; h: number } }).bbox;
    const minDim = bb ? Math.max(1, Math.min(bb.w, bb.h)) : 0;
    const adj = minDim > 0 ? Math.max(0, Math.min(50000, Math.round((rx / minDim) * 100000))) : 0;
    avLst = `<a:avLst><a:gd name="adj" fmla="val ${adj}"/></a:avLst>`;
  }
  const geom = custGeomXml || `<a:prstGeom prst="${prst}">${avLst}</a:prstGeom>`;
  const op = effectiveOpacity(s, ctx) * (ctx.parentOpacity ?? 1);
  const fx = effectsToXml(collectShapeEffectsForWrite(s));
  const d3 = meta3DToXml(s.meta3D);
  const spPr = `${spPrOpenXml(s)}
      ${xfrm(s, false, ctx.slideSize)}
      ${geom}
      ${spFillXml(s, ctx, op)}
      ${strokeToXml(applyOpacityToStroke(s.stroke, op))}
      ${fx}
      ${d3}
    </p:spPr>`;
  // Office 连接符是 `<p:cxnSp>`（可 stCxn/endCxn 粘附）；写成 `<p:sp>` 后
  // PowerPoint 只当普通线条，不能当连接符。
  if (isConnectorShape(s)) {
    const cxnLocks = locksElement("cxnSpLocks", s, CXN_LOCK_FLAGS);
    const st = s.startCxn ? `<a:stCxn id="${resolveCxnId(s.startCxn, ctx)}" idx="${s.startCxn.idx}"/>` : "";
    const en = s.endCxn ? `<a:endCxn id="${resolveCxnId(s.endCxn, ctx)}" idx="${s.endCxn.idx}"/>` : "";
    return `<p:cxnSp${useBgFillAttr(s)}>
    <p:nvCxnSpPr>
      ${cNvPrXml(id, s, ctx)}
      <p:cNvCxnSpPr>${cxnLocks}${st}${en}</p:cNvCxnSpPr>
      ${nvPrXml(s, ctx)}
    </p:nvCxnSpPr>
    ${spPr}
    ${shapeStyleXml(s)}
  </p:cxnSp>`;
  }
  return `<p:sp${useBgFillAttr(s)}>
    <p:nvSpPr>
      ${cNvPrXml(id, s, ctx)}
      <p:cNvSpPr>${spLocksXml(s)}</p:cNvSpPr>
      ${nvPrXml(s, ctx)}
    </p:nvSpPr>
    ${spPr}
    ${shapeStyleXml(s)}
  </p:sp>`;
}

/** OOXML ST_ShapeType 中的连接符几何；Insert → 线条 / 肘形 / 曲线连接符走这条。 */
const CONNECTOR_PRESETS = new Set([
  "line",
  "straightConnector1",
  "bentConnector2",
  "bentConnector3",
  "bentConnector4",
  "bentConnector5",
  "curvedConnector2",
  "curvedConnector3",
  "curvedConnector4",
  "curvedConnector5",
]);

function isConnectorShape(s: Shape): boolean {
  if (s.kind === "line") return true;
  if (s.kind === "path" && s.presetType && CONNECTOR_PRESETS.has(s.presetType)) return true;
  return false;
}

function cNvPrXml(id: number, s: Shape, ctx?: ShapeCtx): string {
  const a: Record<string, string | number | undefined> = {
    id,
    name: s.name,
    title: s.title,
    descr: s.descr,
    hidden: s.visible === false ? 1 : undefined,
  };
  // ECMA-376 §20.1.2.2.8 CT_NonVisualDrawingProps：hlinkClick 在 hlinkHover 之前。
  const click = s.hyperlink ? hlinkTagXml(s.hyperlink, "a:hlinkClick", ctx) : "";
  const hover = s.hoverLink ? hlinkTagXml(s.hoverLink, "a:hlinkHover", ctx) : "";
  const inner = click + hover;
  if (!inner) return `<p:cNvPr${attrs(a)}/>`;
  return `<p:cNvPr${attrs(a)}>${inner}</p:cNvPr>`;
}

// HyperlinkRef.kind → PowerPoint 内置放映跳转 action URI（ECMA-376 §19.2.2.3）。
const HLINK_ACTION_BY_KIND: Partial<Record<HyperlinkRef["kind"], string>> = {
  next: "ppaction://hlinkshowjump?jump=nextslide",
  prev: "ppaction://hlinkshowjump?jump=previousslide",
  first: "ppaction://hlinkshowjump?jump=firstslide",
  last: "ppaction://hlinkshowjump?jump=lastslide",
  back: "ppaction://hlinkshowjump?jump=lastslideviewed",
  endShow: "ppaction://hlinkshowjump?jump=endshow",
};

/** ECMA-376 §19.2.2.3 —「跳到指定页」的 action URI，目标页由 r:id 的 slide 关系给出。 */
const HLINK_SLIDE_JUMP_ACTION = "ppaction://hlinksldjump";

/**
 * HyperlinkRef → `<a:hlinkClick>` / `<a:hlinkHover>`。
 * - `kind: "url"`：需要 ctx.links 注册 External 关系拿 r:id；无注册器时跳过
 *   （写悬空 r:id 会让 PowerPoint 报"需要修复"）。仅有 `<a:snd>` 时仍写出空 r:id。
 * - 放映跳转类（next/prev/…）：纯 action URI，r:id 留空，任何上下文都可写。
 * - `kind: "slide"`（跳到指定页）：target 是 1-based 页码，需要 ctx.links 注册一条
 *   internal 的 `.../relationships/slide` 关系；注册器缺失或页码非法时跳过。
 *   **不能**退化成 External URL —— 那会写出指向 `ppt/slides/slideN.xml` 的死链。
 * - `kind: "sound"`：动作设置「只播放声音」，`ppaction://noaction` + `<a:snd>`。
 */
export function hlinkTagXml(h: HyperlinkRef, tagName: "a:hlinkClick" | "a:hlinkHover", ctx?: ShapeCtx): string {
  const extra = hlinkExtraAttrs(h);
  const snd = hlinkSndXml(h, ctx);
  const withSnd = (empty: string): string => {
    if (!snd) return empty;
    if (empty.endsWith("/>")) return `${empty.slice(0, -2)}>${snd}</${tagName}>`;
    return empty;
  };
  if (h.kind === "sound") {
    const action = h.action ?? "ppaction://noaction";
    return withSnd(`<${tagName} r:id="" action="${esc(action)}"${extra}/>`);
  }
  if (h.kind === "url") {
    const target = h.target?.trim();
    if (target && ctx?.links) {
      const relId = ctx.links.register(target);
      return withSnd(`<${tagName} r:id="${relId}"${extra}/>`);
    }
    return snd ? withSnd(`<${tagName} r:id=""${extra}/>`) : "";
  }
  if (h.kind === "slide") {
    const n = Number(h.target);
    if (!Number.isInteger(n) || n < 1 || !ctx?.links?.registerSlide) return snd ? withSnd(`<${tagName} r:id=""${extra}/>`) : "";
    const relId = ctx.links.registerSlide(n);
    if (!relId) return snd ? withSnd(`<${tagName} r:id=""${extra}/>`) : "";
    return withSnd(`<${tagName} r:id="${relId}" action="${HLINK_SLIDE_JUMP_ACTION}"${extra}/>`);
  }
  const action = h.action ?? HLINK_ACTION_BY_KIND[h.kind];
  if (!action) return snd ? withSnd(`<${tagName} r:id=""${extra}/>`) : "";
  return withSnd(`<${tagName} r:id="" action="${esc(action)}"${extra}/>`);
}

function hlinkExtraAttrs(h: HyperlinkRef): string {
  let s = "";
  if (h.invalidUrl) s += ` invalidUrl="${esc(h.invalidUrl)}"`;
  if (h.tgtFrame) s += ` tgtFrame="${esc(h.tgtFrame)}"`;
  if (h.tooltip) s += ` tooltip="${esc(h.tooltip)}"`;
  if (h.history === false) s += ` history="0"`;
  if (h.highlightClick) s += ` highlightClick="1"`;
  if (h.endSnd) s += ` endSnd="1"`;
  return s;
}

function hlinkSndXml(h: HyperlinkRef, ctx?: ShapeCtx): string {
  const s = h.sound;
  if (!s) return "";
  const name = s.name ? ` name="${esc(s.name)}"` : "";
  let embed = "";
  if (s.src && ctx?.media && !/^rId\d+/i.test(s.src)) {
    const rid = ctx.media.registerRel(s.src, REL_TYPE_AUDIO);
    embed = ` r:embed="${rid}"`;
  } else if (s.src && /^rId\d+/i.test(s.src)) {
    embed = ` r:embed="${esc(s.src)}"`;
  }
  if (!embed && !name) return "";
  return `<a:snd${embed}${name}/>`;
}

function spLocksXml(s: Shape): string {
  return locksElement("spLocks", s, SP_LOCK_FLAGS);
}

const SP_LOCK_FLAGS = [
  "noGrp",
  "noSelect",
  "noRot",
  "noChangeAspect",
  "noMove",
  "noResize",
  "noEditPoints",
  "noAdjustHandles",
  "noChangeArrowheads",
  "noChangeShapeType",
  "noTextEdit",
] as const satisfies ReadonlyArray<keyof ShapeLocks>;

const PIC_LOCK_FLAGS = [
  "noGrp",
  "noSelect",
  "noRot",
  "noChangeAspect",
  "noMove",
  "noResize",
  "noEditPoints",
  "noAdjustHandles",
  "noChangeArrowheads",
  "noChangeShapeType",
  "noCrop",
] as const satisfies ReadonlyArray<keyof ShapeLocks>;

const CXN_LOCK_FLAGS = [
  "noGrp",
  "noSelect",
  "noRot",
  "noChangeAspect",
  "noMove",
  "noResize",
  "noEditPoints",
  "noAdjustHandles",
  "noChangeArrowheads",
  "noChangeShapeType",
] as const satisfies ReadonlyArray<keyof ShapeLocks>;

const GRP_LOCK_FLAGS = [
  "noGrp",
  "noUngrp",
  "noSelect",
  "noRot",
  "noChangeAspect",
  "noMove",
  "noResize",
] as const satisfies ReadonlyArray<keyof ShapeLocks>;

const GF_LOCK_FLAGS = [
  "noGrp",
  "noDrilldown",
  "noSelect",
  "noChangeAspect",
  "noMove",
  "noResize",
] as const satisfies ReadonlyArray<keyof ShapeLocks>;

function locksElement(
  tagName: "spLocks" | "picLocks" | "cxnSpLocks" | "grpSpLocks",
  s: Shape,
  allowed: readonly (keyof ShapeLocks)[],
): string {
  const locks: ShapeLocks = { ...(s.locks ?? {}) };
  if (s.lockAspect) locks.noChangeAspect = true;
  const parts: string[] = [];
  for (const f of allowed) {
    if (locks[f]) parts.push(`${f}="1"`);
  }
  if (!parts.length) return "";
  return `<a:${tagName} ${parts.join(" ")}/>`;
}

/** ECMA-376 §20.1.2.2.18 graphicFrameLocks。无 IR 时默认 noGrp（Office 表格/图表惯例）。 */
export function graphicFrameLocksXml(s: Shape): string {
  const locks: ShapeLocks = { noGrp: true, ...(s.locks ?? {}) };
  if (s.lockAspect) locks.noChangeAspect = true;
  const parts: string[] = [];
  for (const f of GF_LOCK_FLAGS) {
    if (locks[f]) parts.push(`${f}="1"`);
  }
  if (!parts.length) return "";
  return `<a:graphicFrameLocks ${parts.join(" ")}/>`;
}

function nvMediaXml(s: Shape, ctx?: ShapeCtx): string {
  const m = s.nvMedia;
  if (!m) return "";
  const parts: string[] = [];
  if (m.audioCdStart || m.audioCdEnd) {
    const st = m.audioCdStart ?? {};
    const en = m.audioCdEnd ?? {};
    const stTrack = Number.isFinite(st.track) ? Number(st.track) : Number.isFinite(en.track) ? Number(en.track) : 1;
    const enTrack = Number.isFinite(en.track) ? Number(en.track) : stTrack;
    const stTime = Number.isFinite(st.time) ? Number(st.time) : 0;
    const enTime = Number.isFinite(en.time) ? Number(en.time) : 0;
    parts.push(
      `<p:audioCd><p:st track="${stTrack}" time="${stTime}"/><p:end track="${enTrack}" time="${enTime}"/></p:audioCd>`,
    );
  }
  if (m.wavAudioFileName || m.wavAudioSrc) {
    const name = m.wavAudioFileName ? ` name="${esc(m.wavAudioFileName)}"` : "";
    let embed = "";
    if (m.wavAudioSrc && ctx?.media) {
      const rid = ctx.media.registerRel(m.wavAudioSrc, REL_TYPE_AUDIO);
      embed = ` r:embed="${rid}"`;
    }
    parts.push(`<p:wavAudioFile${embed}${name}/>`);
  }
  return parts.join("");
}

function textShapeToXml(s: Extract<Shape, { kind: "text" }>, ctx: ShapeCtx): string {
  const id = allocSpId(s, ctx);
  const txBody = paragraphsToXml(s.paragraphs ?? [], s, ctx);
  const op = effectiveOpacity(s, ctx) * (ctx.parentOpacity ?? 1);
  const fx = effectsToXml(collectShapeEffectsForWrite(s));
  const d3 = meta3DToXml(s.meta3D);
  const txBoxAttr = s.placeholder ? (s.txBox ? ' txBox="1"' : "") : ' txBox="1"';
  return `<p:sp${useBgFillAttr(s)}>
    <p:nvSpPr>
      ${cNvPrXml(id, s, ctx)}
      <p:cNvSpPr${txBoxAttr}>${spLocksXml(s)}</p:cNvSpPr>
      ${nvPrXml(s, ctx)}
    </p:nvSpPr>
    ${spPrOpenXml(s)}
      ${xfrm(s, false, ctx.slideSize)}
      <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
      ${spFillXml(s, ctx, op)}
      ${strokeToXml(applyOpacityToStroke(s.stroke, op))}
      ${fx}
      ${d3}
    </p:spPr>
    ${shapeStyleXml(s)}
    ${txBody}
  </p:sp>`;
}

const SVG_BLIP_URI = "{96DAC541-7B7A-43D3-8B79-37D633B846F1}";
const P14_MEDIA_URI = "{DAA4B4D4-6D07-4AB8-B03D-B92D7439C58A}";
const P14_NS = "http://schemas.microsoft.com/office/powerpoint/2010/main";

/** 无 poster 时的 1×1 灰 PNG，保证 a:blip 有合法图片关系。 */
const MEDIA_POSTER_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function isSvgDataUrl(src: string | undefined): boolean {
  if (!src) return false;
  return /^data:image\/svg\+xml/i.test(src) || src.trimStart().startsWith("<svg");
}

function shapeSvgSrc(s: Extract<Shape, { kind: "image" | "video" | "audio" }>): string | undefined {
  const extra = (s as { svgSrc?: string }).svgSrc;
  if (extra && isSvgDataUrl(extra)) return extra;
  if (s.kind === "image" && isSvgDataUrl(s.src)) return s.src;
  return undefined;
}

function p14MediaExtXml(
  mediaRid: string,
  s: Extract<Shape, { kind: "video" | "audio" }>,
): string {
  const trimBits: string[] = [];
  if (s.trim?.start !== undefined) trimBits.push(`st="${Math.round(s.trim.start * 1000)}"`);
  if (s.trim?.end !== undefined) trimBits.push(`end="${Math.round(s.trim.end * 1000)}"`);
  const fadeBits: string[] = [];
  if (s.fadeIn !== undefined) fadeBits.push(`in="${Math.round(s.fadeIn * 1000)}"`);
  if (s.fadeOut !== undefined) fadeBits.push(`out="${Math.round(s.fadeOut * 1000)}"`);
  const inner =
    (trimBits.length ? `<p14:trim ${trimBits.join(" ")}/>` : "") +
    (fadeBits.length ? `<p14:fade ${fadeBits.join(" ")}/>` : "");
  return `<p:extLst><p:ext uri="${P14_MEDIA_URI}"><p14:media xmlns:p14="${P14_NS}" r:embed="${mediaRid}">${inner}</p14:media></p:ext></p:extLst>`;
}

function picShapeToXml(s: Extract<Shape, { kind: "image" | "video" | "audio" }>, ctx: ShapeCtx): string {
  const id = allocSpId(s, ctx);
  const isAv = s.kind === "video" || s.kind === "audio";
  const posterSrc = isAv ? ((s as { poster?: string }).poster || MEDIA_POSTER_PNG) : s.src;
  const rid = ctx.media.registerImage(posterSrc);
  const svg = isAv ? undefined : shapeSvgSrc(s);
  const svgRid = svg && svg !== posterSrc ? ctx.media.registerImage(svg) : svg ? rid : undefined;
  const svgBlip =
    svgRid
      ? `<a:extLst><a:ext uri="${SVG_BLIP_URI}"><asvg:svgBlip xmlns:asvg="http://schemas.microsoft.com/office/drawing/2016/SVG/main" r:embed="${svgRid}"/></a:ext></a:extLst>`
      : "";
  let nvPrInner = phXml(s);
  let cNvPr = cNvPrXml(id, s, ctx);
  if (isAv && s.src) {
    const fileRid =
      s.kind === "video"
        ? ctx.media.registerRel(s.src, REL_TYPE_VIDEO)
        : ctx.media.registerRel(s.src, REL_TYPE_AUDIO);
    const mediaRid = ctx.media.registerRel(s.src, REL_TYPE_OFFICE_MEDIA);
    const fileTag = s.kind === "video" ? "videoFile" : "audioFile";
    nvPrInner = `<a:${fileTag} r:link="${fileRid}"/>${p14MediaExtXml(mediaRid, s)}`;
    ctx.mediaTimings?.push({
      kind: s.kind,
      spid: id,
      autoplay: s.autoplay,
      loop: s.loop,
      muted: s.muted,
      isNarration: s.kind === "audio" ? s.isNarration : undefined,
    });
    if (!s.hyperlink) {
      cNvPr = cNvPr.replace(
        /<p:cNvPr([^>]*)\/>/,
        `<p:cNvPr$1><a:hlinkClick r:id="" action="ppaction://media"/></p:cNvPr>`,
      );
      if (!cNvPr.includes("ppaction://media")) {
        cNvPr = cNvPr.replace(
          /<p:cNvPr([^>]*)>/,
          `<p:cNvPr$1><a:hlinkClick r:id="" action="ppaction://media"/>`,
        );
      }
    }
  }
  // shape.opacity 在 pic 上没有原生 OOXML 表示，烘焙进 <a:alphaModFix>。
  // 祖先 group 链上的累积 opacity 也一并乘进来。
  const op = effectiveOpacity(s, ctx) * (ctx.parentOpacity ?? 1);
  const alphaXml = op < 1 ? `<a:alphaModFix amt="${Math.round(op * 100000)}"/>` : "";
  const adjustXml = s.kind === "image" ? imageAdjustToXml(s.adjust) : "";
  // ImageShape.cropRect（渲染层的 clip 裁剪，setImageCrop 工具写入）在 OOXML 里
  // 就是 <a:srcRect>：分数直接 ×100000。不写的话导出后裁剪丢失、整图被拉伸进 bbox。
  const cr = (s as { cropRect?: { l: number; t: number; r: number; b: number } }).cropRect;
  const srcRectXml = cr && (cr.l || cr.t || cr.r || cr.b) ? `<a:srcRect ${rectAttrs(cr)}/>` : "";
  const d3 = meta3DToXml(s.meta3D);
  return `<p:pic${useBgFillAttr(s)}>
    <p:nvPicPr>
      ${cNvPr}
      <p:cNvPicPr>${locksElement("picLocks", s, PIC_LOCK_FLAGS)}</p:cNvPicPr>
      ${nvPrXml(s, ctx, nvPrInner)}
    </p:nvPicPr>
    <p:blipFill>
      <a:blip ${blipRidAttr(posterSrc, rid)}>${alphaXml}${adjustXml}${svgBlip}</a:blip>
      ${srcRectXml}<a:stretch><a:fillRect/></a:stretch>
    </p:blipFill>
    ${spPrOpenXml(s)}
      ${xfrm(s, false, ctx.slideSize)}
      <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
      ${d3}
    </p:spPr>
    ${shapeStyleXml(s)}
  </p:pic>`;
}

// ----- opacity baking -------------------------------------------------------
// OOXML 没有 shape 级 opacity 字段。Shape.opacity < 1 时把它乘进 fill 和 stroke 的
// alpha，保证保存后再打开视觉一致（Editor 上的 opacity 滑杆也能写出去）。
// group.opacity 由 groupToXml 通过 childCtx.parentOpacity 累计；叶子再乘进 fill / stroke / blip alpha。
// 组级阴影 / 效果写在 grpSpPr 的 effectLst（OOXML 无独立 group opacity 属性）。

function effectiveOpacity(s: Shape, ctx?: ShapeCtx): number {
  const v = (s as { opacity?: number }).opacity;
  if (typeof v !== "number" || Number.isNaN(v)) return 1;
  // entrance 目标的 opacity=0 是 runtime "入场前隐藏"，不是持久化透明度。
  if (v === 0 && ctx?.entranceHidden?.has(s)) return 1;
  return Math.max(0, Math.min(1, v));
}

function useBgFillAttr(s: Shape): string {
  return s.useBgFill ? ' useBgFill="1"' : "";
}

function spPrOpenXml(s: Shape): string {
  const bw = s.bwMode ? ` bwMode="${esc(s.bwMode)}"` : "";
  return `<p:spPr${bw}>`;
}

export function nvPrXml(s: Shape, ctx?: ShapeCtx, inner?: string): string {
  const content = (inner !== undefined ? inner : phXml(s)) + nvMediaXml(s, ctx);
  const ud = s.userDrawn ? ' userDrawn="1"' : "";
  if (!content && !ud) return "<p:nvPr/>";
  return `<p:nvPr${ud}>${content}</p:nvPr>`;
}

function spFillXml(s: Shape, ctx: ShapeCtx, op: number): string {
  if (s.useBgFill) return "<a:noFill/>";
  return fillToXml(applyOpacityToPaint(s.fill, op), ctx, { w: s.bbox.w, h: s.bbox.h }) || "<a:noFill/>";
}

function styleRefColorXml(color: StyleRefColor | undefined, fallbackScheme: string): string {
  if (color?.scheme) return `<a:schemeClr val="${esc(color.scheme)}"/>`;
  if (color?.hex) return colorInner(color.hex, undefined);
  return `<a:schemeClr val="${esc(fallbackScheme)}"/>`;
}

/**
 * ECMA-376 CT_ShapeStyle：lnRef / fillRef / effectRef / fontRef 四个都要有。
 * idx=0 表示该通道无主题样式（Office 插入形状的常见写法）。
 */
function shapeStyleXml(s: Shape): string {
  const r = s.styleRefs;
  if (!r) return "";
  const has =
    r.lnRef !== undefined ||
    r.fillRef !== undefined ||
    r.effectRef !== undefined ||
    r.fontRef !== undefined ||
    r.lnColor ||
    r.fillColor ||
    r.effectColor ||
    r.fontColor;
  if (!has) return "";
  const ln = `<a:lnRef idx="${r.lnRef ?? 0}">${styleRefColorXml(r.lnColor, "accent1")}</a:lnRef>`;
  const fill = `<a:fillRef idx="${r.fillRef ?? 0}">${styleRefColorXml(r.fillColor, "accent1")}</a:fillRef>`;
  const effect = `<a:effectRef idx="${r.effectRef ?? 0}">${styleRefColorXml(r.effectColor, "accent1")}</a:effectRef>`;
  const fontIdx = r.fontRef === "major" ? "major" : "minor";
  const font = `<a:fontRef idx="${fontIdx}">${styleRefColorXml(r.fontColor, fontIdx === "major" ? "dk1" : "lt1")}</a:fontRef>`;
  return `<p:style>${ln}${fill}${effect}${font}</p:style>`;
}

function applyAlphaToPaint(p: Paint, opacity: number): Paint {
  if (opacity >= 1) return p;
  const mul = (a: number | undefined): number => Math.max(0, Math.min(1, (a ?? 1) * opacity));
  if (p.kind === "solid") return { ...p, alpha: mul(p.alpha) };
  if (p.kind === "linear" || p.kind === "radial") {
    const stops = Array.isArray(p.stops) ? p.stops : [];
    return { ...p, stops: stops.map((s) => ({ ...s, alpha: mul(s.alpha) })) };
  }
  if (p.kind === "pattern") return { ...p, fgAlpha: mul(p.fgAlpha), bgAlpha: mul(p.bgAlpha) };
  if (p.kind === "image") return { ...p, alpha: mul(p.alpha) };
  return p;
}

function applyOpacityToPaint(p: Paint | undefined, opacity: number): Paint | undefined {
  if (!p || opacity >= 1) return p;
  return applyAlphaToPaint(p, opacity);
}

function applyOpacityToStroke(stroke: Stroke | undefined, opacity: number): Stroke | undefined {
  if (!stroke || opacity >= 1) return stroke;
  if (!stroke.paint || stroke.paint.kind === "none") return stroke;
  return { ...stroke, paint: applyAlphaToPaint(stroke.paint, opacity) };
}

/**
 * OOXML `prst="line"` 从 xfrm 矩形左上画到右下；真正的端点方向靠 flipH/flipV。
 * 编辑器 LineShape 用 (x1,y1,x2,y2) 画线，bbox 只是拖拽包框（常是一个大矩形），
 * 若按 bbox 写 xfrm，WPS / PowerPoint 会把水平线画成对角线。
 */
export function lineXfrmFromEndpoints(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  transform?: { rotation?: number; scaleX?: number; scaleY?: number },
): { x: number; y: number; w: number; h: number; rot: number; flipH: boolean; flipV: boolean } {
  const x = Math.min(x1, x2);
  const y = Math.min(y1, y2);
  const w = Math.abs(x2 - x1);
  const h = Math.abs(y2 - y1);
  let flipH = x1 > x2;
  let flipV = y1 > y2;
  if ((transform?.scaleX ?? 1) < 0) flipH = !flipH;
  if ((transform?.scaleY ?? 1) < 0) flipV = !flipV;
  const rot = Math.round((transform?.rotation ?? 0) * 60000);
  return { x, y, w, h, rot, flipH, flipV };
}

function xfrm(s: Shape, isGroup: boolean, slideSize?: { width: number; height: number }): string {
  let x: number;
  let y: number;
  let w: number;
  let h: number;
  let rot: number;
  let flipH: boolean;
  let flipV: boolean;
  if (!isGroup && s.kind === "line") {
    const g = lineXfrmFromEndpoints(s.x1, s.y1, s.x2, s.y2, s.transform);
    x = pxToEmu(g.x);
    y = pxToEmu(g.y);
    w = pxToEmu(Math.max(0, g.w));
    h = pxToEmu(Math.max(0, g.h));
    rot = g.rot;
    flipH = g.flipH;
    flipV = g.flipV;
  } else {
    x = pxToEmu(s.bbox.x);
    y = pxToEmu(s.bbox.y);
    w = pxToEmu(Math.max(0, s.bbox.w));
    h = pxToEmu(Math.max(0, s.bbox.h));
    rot = Math.round((s.transform?.rotation ?? 0) * 60000);
    flipH = (s.transform?.scaleX ?? 1) < 0;
    flipV = (s.transform?.scaleY ?? 1) < 0;
  }
  // 兼容性兜底：见 ShapeCtx.slideSize 注释。检测 (0,0)→(W,H) 完全等于 slide 的情况，
  // 给非 group shape 加 1 EMU 平移破解 WPS / QuickLook 的 "重复背景" 启发式。
  // 1 EMU ≈ 0.000105 px，不会改变视觉。group 不受影响（不参与启发式）。
  if (!isGroup && slideSize) {
    const slideW = pxToEmu(slideSize.width);
    const slideH = pxToEmu(slideSize.height);
    if (x === 0 && y === 0 && w === slideW && h === slideH) {
      x = 1;
      y = 1;
    }
  }
  const a = attrs({ rot: rot !== 0 ? rot : undefined, flipH: flipH ? 1 : undefined, flipV: flipV ? 1 : undefined });
  if (isGroup) {
    return `<a:xfrm${a}>
      <a:off x="${x}" y="${y}"/>
      <a:ext cx="${w}" cy="${h}"/>
      <a:chOff x="${x}" y="${y}"/>
      <a:chExt cx="${w}" cy="${h}"/>
    </a:xfrm>`;
  }
  return `<a:xfrm${a}>
    <a:off x="${x}" y="${y}"/>
    <a:ext cx="${w}" cy="${h}"/>
  </a:xfrm>`;
}

/**
 * 把 Paint 转成 OOXML `<a:*Fill>` 子树。
 *
 * 支持的 Paint kind（ECMA-376 §20.1.8）：
 *   - solid     → `<a:solidFill>`
 *   - linear    → `<a:gradFill>...<a:lin/>`
 *   - radial    → `<a:gradFill>...<a:path>`
 *   - pattern   → `<a:pattFill>`
 *   - image     → `<a:blipFill>...`  （需要 mediaCtx 注册图片关系，缺则降级为 noFill）
 *   - none      → `<a:noFill/>`
 *   - groupFill → `<a:grpFill/>`
 *
 * `mediaCtx` 是可选的：shape fill 默认不会注入图片填充（避免静默丢失 media 关系），
 * 但 `<p:bg>` / `<p:bgPr>` 调用方传入它就能拿到 image background。
 *
 * `dest` 是填充目标的宽高（px）：slide background 传 slide 尺寸、shape fill 传 bbox。
 * 有它才能把 ImagePaint 的 cover/contain 语义换算成 OOXML 的 srcRect / fillRect
 * （OOXML 只有 stretch，没有等比语义）—— 不传则退化为纯 stretch（旧行为）。
 */
export function fillToXml(
  p: Paint | undefined,
  mediaCtx?: { media: MediaRegistrar },
  dest?: { w: number; h: number },
): string {
  if (!p) return "";
  if (p.kind === "none") return "<a:noFill/>";
  if (p.kind === "groupFill") return "<a:grpFill/>";
  if (p.kind === "solid") {
    return `<a:solidFill>${colorToXml(p.color, p.alpha)}</a:solidFill>`;
  }
  if (p.kind === "pattern") {
    return `<a:pattFill prst="${p.prst}"><a:fgClr>${colorInner(p.fg, p.fgAlpha)}</a:fgClr><a:bgClr>${colorInner(p.bg, p.bgAlpha)}</a:bgClr></a:pattFill>`;
  }
  if (p.kind === "linear" || p.kind === "radial") {
    const attrs: string[] = [];
    if (p.flip && p.flip !== "none") attrs.push(`flip="${p.flip}"`);
    if (p.rotWithShape === false) attrs.push(`rotWithShape="0"`);
    else if (p.rotWithShape === true) attrs.push(`rotWithShape="1"`);
    const gradAttr = attrs.length ? " " + attrs.join(" ") : "";
    const stops = (p.stops ?? [])
      .map(
        (s) =>
          `<a:gs pos="${Math.round((s.offset ?? 0) * 100000)}">${colorToXml(s.color, s.alpha)}</a:gs>`,
      )
      .join("");
    const tile = p.tileRect ? `<a:tileRect ${rectAttrs(p.tileRect)}/>` : "";
    if (p.kind === "linear") {
      const angle = typeof p.angle === "number" && Number.isFinite(p.angle) ? p.angle : 0;
      const linAttrs: string[] = [`ang="${Math.round(((angle % 360) + 360) % 360 * 60000)}"`];
      if (p.scaled !== undefined) linAttrs.push(`scaled="${p.scaled ? "1" : "0"}"`);
      return `<a:gradFill${gradAttr}><a:gsLst>${stops}</a:gsLst><a:lin ${linAttrs.join(" ")}/>${tile}</a:gradFill>`;
    }
    const fillTo = p.fillToRect ?? { l: 0, t: 0, r: 0, b: 0 };
    const path = p.path === "rect" || p.path === "shape" ? p.path : "circle";
    return `<a:gradFill${gradAttr}><a:gsLst>${stops}</a:gsLst><a:path path="${path}"><a:fillToRect ${rectAttrs(fillTo)}/></a:path>${tile}</a:gradFill>`;
  }
  if (p.kind === "image") {
    if (!mediaCtx) return ""; // shape fill 上下文不提供 media → 静默忽略（不应当走到这里）
    const rid = mediaCtx.media.registerImage(p.src);
    // <a:blipFill> 子序列：blip → srcRect? → (stretch | tile)
    let srcRectXml = p.srcRect ? `<a:srcRect ${rectAttrs(p.srcRect)}/>` : "";
    let mode = "";
    if (p.fit === "tile") {
      const tileAttrs: string[] = [];
      if (p.tileSx !== undefined) tileAttrs.push(`sx="${Math.round(p.tileSx * 100000)}"`);
      if (p.tileSy !== undefined) tileAttrs.push(`sy="${Math.round(p.tileSy * 100000)}"`);
      if (p.tileTx !== undefined) tileAttrs.push(`tx="${Math.round(p.tileTx * 100000)}"`);
      if (p.tileTy !== undefined) tileAttrs.push(`ty="${Math.round(p.tileTy * 100000)}"`);
      if (p.tileAlign) tileAttrs.push(`algn="${p.tileAlign}"`);
      if (p.tileFlip && p.tileFlip !== "none") tileAttrs.push(`flip="${p.tileFlip}"`);
      mode = `<a:tile ${tileAttrs.join(" ")}/>`;
    } else {
      // OOXML 没有 contain/cover 语义，只有"srcRect 裁源图 + stretch 铺满"。
      // 拿得到图片宽高比 + 目标宽高比时做等价换算：
      //   cover   → srcRect 居中裁掉超出目标比例的部分（PowerPoint 打开不再变形）
      //   contain → <a:fillRect> 居中留边（信箱式，不放大裁切）
      // 拿不到（非 dataURL 且无 natural 字段）→ 保持旧的纯 stretch 行为。
      let fillRectXml = "<a:fillRect/>";
      if ((p.fit === "cover" || p.fit === "contain") && !p.srcRect && dest && dest.w > 0 && dest.h > 0) {
        const natural = p.natural ?? imageSizeFromSrc(p.src);
        if (natural) {
          const insets = aspectFitInsets(natural.w / natural.h, dest.w / dest.h, p.fit);
          if (insets) {
            if (p.fit === "cover") {
              srcRectXml = `<a:srcRect ${rectAttrs(insets)}/>`;
            } else {
              fillRectXml = `<a:fillRect ${rectAttrs(insets)}/>`;
            }
          }
        }
      }
      mode = `<a:stretch>${fillRectXml}</a:stretch>`;
    }
    const rotAttr = p.rotWithShape === false ? ` rotWithShape="0"` : p.rotWithShape === true ? ` rotWithShape="1"` : "";
    const dpiAttr = p.dpi !== undefined ? ` dpi="${p.dpi}"` : "";
    const blipAlpha = blipAlphaXml(p.alpha);
    const adjustXml = imageAdjustToXml(p.adjust);
    return `<a:blipFill${dpiAttr}${rotAttr}><a:blip ${blipRidAttr(p.src, rid)}>${blipAlpha}${adjustXml}</a:blip>${srcRectXml}${mode}</a:blipFill>`;
  }
  return "";
}

/**
 * 等比适配的居中裁剪 / 留边分数。imgAR = 图片宽高比，destAR = 目标宽高比。
 * 返回 l/t/r/b（0..1 分数）：
 *   - cover   → 作用在 **源图** 上（srcRect）：裁掉超出目标比例的一侧。
 *     图更宽 → 裁左右（保留宽度分数 destAR/imgAR）；图更窄 → 裁上下（保留 imgAR/destAR）。
 *   - contain → 作用在 **目标** 上（stretch fillRect）：图等比缩进目标后留出的边。
 *     图更宽 → 上下留边（显示高度分数 destAR/imgAR）；图更窄 → 左右留边（imgAR/destAR）。
 * 比例几乎一致（<0.5% 差异）时返回 null，省掉无意义的亚像素裁剪。
 */
function aspectFitInsets(
  imgAR: number,
  destAR: number,
  fit: "cover" | "contain",
): { l: number; t: number; r: number; b: number } | null {
  if (!Number.isFinite(imgAR) || !Number.isFinite(destAR) || imgAR <= 0 || destAR <= 0) return null;
  const ratio = imgAR / destAR;
  if (Math.abs(ratio - 1) < 0.005) return null;
  const keep = ratio > 1 ? 1 / ratio : ratio;
  const inset = (1 - keep) / 2;
  const wider = ratio > 1; // 图比目标更宽
  const horizontal = fit === "cover" ? wider : !wider; // 是否作用在左右
  return horizontal ? { l: inset, t: 0, r: inset, b: 0 } : { l: 0, t: inset, r: 0, b: inset };
}

/** OOXML blip 透明度：ImagePaint.alpha → <a:alphaModFix amt="…"/>（0..100000）。 */
function blipAlphaXml(alpha: number | undefined): string {
  if (alpha === undefined || alpha >= 1) return "";
  const amt = Math.max(0, Math.min(100000, Math.round(alpha * 100000)));
  return `<a:alphaModFix amt="${amt}"/>`;
}

/** `<a:blip>` 颜色调整子节点（不含 alphaModFix，透明度走独立通道）。 */
function imageAdjustToXml(adj: ImageColorAdjust | undefined): string {
  if (!adj) return "";
  const parts: string[] = [];
  if (adj.grayscale) parts.push("<a:grayscl/>");
  if (adj.lum) {
    const a: string[] = [];
    if (adj.lum.bright !== undefined) a.push(`bright="${Math.round(adj.lum.bright * 100000)}"`);
    if (adj.lum.contrast !== undefined) a.push(`contrast="${Math.round(adj.lum.contrast * 100000)}"`);
    if (a.length) parts.push(`<a:lum ${a.join(" ")}/>`);
  }
  if (adj.hsl) {
    const a: string[] = [];
    if (adj.hsl.hue !== undefined) a.push(`hue="${Math.round(adj.hsl.hue * 60000)}"`);
    if (adj.hsl.sat !== undefined) a.push(`sat="${Math.round(adj.hsl.sat * 100000)}"`);
    if (adj.hsl.lum !== undefined) a.push(`lum="${Math.round(adj.hsl.lum * 100000)}"`);
    if (a.length) parts.push(`<a:hsl ${a.join(" ")}/>`);
  }
  if (adj.duotone) {
    parts.push(
      `<a:duotone>${colorInner(adj.duotone[0], undefined)}${colorInner(adj.duotone[1], undefined)}</a:duotone>`,
    );
  }
  if (adj.biLevel !== undefined) {
    parts.push(`<a:biLevel thresh="${Math.round(adj.biLevel * 100000)}"/>`);
  }
  if (adj.clrChange) {
    const useA = adj.clrChange.useA === false ? ' useA="0"' : adj.clrChange.useA ? ' useA="1"' : "";
    parts.push(
      `<a:clrChange${useA}><a:clrFrom>${colorInner(adj.clrChange.from, undefined)}</a:clrFrom><a:clrTo>${colorInner(adj.clrChange.to, undefined)}</a:clrTo></a:clrChange>`,
    );
  }
  if (adj.clrRepl) parts.push(`<a:clrRepl>${colorInner(adj.clrRepl, undefined)}</a:clrRepl>`);
  if (adj.fillOverlay) {
    const blend = adj.fillOverlay.blend ? ` blend="${adj.fillOverlay.blend}"` : "";
    parts.push(`<a:fillOverlay${blend}>${colorInner(adj.fillOverlay.color, undefined)}</a:fillOverlay>`);
  }
  if (adj.blur) {
    const grow = adj.blur.grow === false ? ' grow="0"' : "";
    parts.push(`<a:blur rad="${Math.round(adj.blur.radius * 12700)}"${grow}/>`);
  }
  if (adj.tint) {
    const a: string[] = [];
    if (adj.tint.hue !== undefined) a.push(`hue="${Math.round(adj.tint.hue * 60000)}"`);
    if (adj.tint.amount !== undefined) a.push(`amt="${Math.round(adj.tint.amount * 100000)}"`);
    if (a.length) parts.push(`<a:tint ${a.join(" ")}/>`);
  }
  if (adj.alphaCeiling) parts.push("<a:alphaCeiling/>");
  if (adj.alphaFloor) parts.push("<a:alphaFloor/>");
  if (adj.alphaReplace !== undefined) {
    parts.push(`<a:alphaRepl a="${Math.round(adj.alphaReplace * 100000)}"/>`);
  }
  if (adj.alphaBiLevel !== undefined) {
    parts.push(`<a:alphaBiLevel thresh="${Math.round(adj.alphaBiLevel * 100000)}"/>`);
  }
  return parts.join("");
}

/**
 * `<p:bg><p:bgPr>` 序列化。和 shape fill 复用 fillToXml，并强制带 mediaCtx
 * 以支持 ImagePaint background（enrichment pass 写入的图片背景）。
 *
 * 返回完整的 `<p:bg>...</p:bg>` 片段；当 paint 为空字符串时（即未知 kind）
 * 退回到 `<a:solidFill val="FFFFFF"/>` 以保证 OOXML schema 合法（bgPr 必须至少有一个 fill 子元素）。
 */
export function backgroundToXml(
  bg: Paint | undefined,
  ctx: { media: MediaRegistrar },
  slideSize?: { width: number; height: number },
  bgRef?: BackgroundRef,
): string {
  if (bgRef && Number.isFinite(bgRef.idx)) {
    return `<p:bg><p:bgRef idx="${bgRef.idx}">${styleRefColorXml(bgRef.color, "bg1")}</p:bgRef></p:bg>`;
  }
  if (!bg) return "";
  const dest = slideSize ? { w: slideSize.width, h: slideSize.height } : undefined;
  let fill = fillToXml(bg, ctx, dest);
  if (!fill) fill = `<a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill>`;
  return `<p:bg><p:bgPr>${fill}<a:effectLst/></p:bgPr></p:bg>`;
}

// ============================================================================
// schemeClr 保留策略（ECMA-376 §20.1.2.3.29）
//
// parser 在解析期把 schemeClr 解析成字面 hex 存进内存模型；写回时如果一律写
// srgbClr，颜色就与主题「断链」—— 导出的 pptx 在 PowerPoint 里换设计主题时这些
// 颜色不再跟随。这里维护一张「当前 deck 主题色 hex → scheme 槽位」查找表：
// 写出的颜色若与主题色板完全一致（无变换、字面相等），优先写 <a:schemeClr>。
//
// 约束：
//   - 只用 dk1/lt1/dk2/lt2/accentN/hlink/folHlink 这些**直接槽位**（不写 tx1/bg1
//     等 clrMap 别名），避免依赖具体 master 的 clrMap 映射；
//   - 纯黑 / 纯白不映射（撞 dk1/lt1 的概率极高，但用户从取色器选中的黑白多为
//     字面意图，映射反而会在换主题时产生意外漂移）；
//   - 查找表由 write 入口（round-trip / from-scratch）通过 setActiveSchemeColors
//     注入，写完清空 —— serializer 全程同步，不存在并发窜台。
// ============================================================================
const SCHEME_SLOT_SOURCES: Array<[slot: string, keys: string[]]> = [
  ["accent1", ["accent1"]],
  ["accent2", ["accent2"]],
  ["accent3", ["accent3"]],
  ["accent4", ["accent4"]],
  ["accent5", ["accent5"]],
  ["accent6", ["accent6"]],
  ["dk2", ["tx2", "dk2"]],
  ["lt2", ["bg2", "lt2"]],
  ["dk1", ["tx1", "dk1"]],
  ["lt1", ["bg1", "lt1"]],
  ["hlink", ["hlink"]],
  ["folHlink", ["folHlink"]],
];

let activeSchemeLookup: Map<string, string> | undefined;

export function setActiveSchemeColors(colors: Record<string, string> | undefined): void {
  if (!colors) {
    activeSchemeLookup = undefined;
    return;
  }
  const m = new Map<string, string>();
  for (const [slot, keys] of SCHEME_SLOT_SOURCES) {
    for (const key of keys) {
      const v = colors[key];
      if (!v) continue;
      const h = hex(v).toUpperCase();
      if (!/^[0-9A-F]{6}$/.test(h)) continue;
      if (h === "000000" || h === "FFFFFF") continue;
      if (!m.has(h)) m.set(h, slot);
      break;
    }
  }
  activeSchemeLookup = m.size > 0 ? m : undefined;
}

/** hex（大写、无 #）命中当前主题色板时返回 scheme 槽位名，否则 undefined。 */
export function schemeSlotForHex(hexUpper: string): string | undefined {
  return activeSchemeLookup?.get(hexUpper);
}

function colorInner(color: string, alpha: number | undefined): string {
  // 走 parseColor 是为了把 CSS 写法（rgba/rgb/#rrggbbaa）拆出 hex + alpha；
  // 任何携带 alpha 的输入若调用方又传了显式 alpha，以调用方为准。
  const parsed = parseColor(color);
  const effectiveAlpha = alpha !== undefined ? alpha : parsed.alpha;
  const alphaXml =
    effectiveAlpha === undefined || effectiveAlpha >= 1
      ? ""
      : `<a:alpha val="${Math.round(effectiveAlpha * 100000)}"/>`;
  // 命中主题色板 → 保留主题引用（详见上方 schemeClr 保留策略）。
  const slot = schemeSlotForHex(parsed.hex.toUpperCase());
  if (slot) {
    return alphaXml ? `<a:schemeClr val="${slot}">${alphaXml}</a:schemeClr>` : `<a:schemeClr val="${slot}"/>`;
  }
  return alphaXml ? `<a:srgbClr val="${parsed.hex}">${alphaXml}</a:srgbClr>` : `<a:srgbClr val="${parsed.hex}"/>`;
}

function colorToXml(color: string, alpha: number | undefined): string {
  return colorInner(color, alpha);
}

function rectAttrs(r: { l: number; t: number; r: number; b: number }): string {
  return `l="${Math.round(r.l * 100000)}" t="${Math.round(r.t * 100000)}" r="${Math.round(r.r * 100000)}" b="${Math.round(r.b * 100000)}"`;
}

export function strokeToXml(stroke: Stroke | undefined, tag = "a:ln"): string {
  if (!stroke) return "";
  const w = Math.max(0, Math.round((stroke.width ?? 0) * 9525));
  const fill = stroke.paint && stroke.paint.kind !== "none" ? fillToXml(stroke.paint) : "<a:noFill/>";
  const lnAttrs: Record<string, string | number | undefined> = {
    w,
    cap: stroke.cap === "round" ? "rnd" : stroke.cap === "square" ? "sq" : stroke.cap === "butt" ? "flat" : undefined,
    cmpd: stroke.cmpd,
    algn: stroke.align,
  };
  let dashXml = "";
  if (stroke.dashPreset && stroke.dashPreset !== "solid") {
    dashXml = `<a:prstDash val="${stroke.dashPreset}"/>`;
  }
  let joinXml = "";
  if (stroke.join === "miter") joinXml = `<a:miter${stroke.miterLimit !== undefined ? ` lim="${Math.round(stroke.miterLimit * 100000)}"` : ""}/>`;
  else if (stroke.join === "round") joinXml = "<a:round/>";
  else if (stroke.join === "bevel") joinXml = "<a:bevel/>";
  const headEnd = stroke.headEnd && stroke.headEnd.kind !== "none"
    ? `<a:headEnd type="${stroke.headEnd.kind}"${stroke.headEnd.w ? ` w="${stroke.headEnd.w}"` : ""}${stroke.headEnd.len ? ` len="${stroke.headEnd.len}"` : ""}/>`
    : "";
  const tailEnd = stroke.tailEnd && stroke.tailEnd.kind !== "none"
    ? `<a:tailEnd type="${stroke.tailEnd.kind}"${stroke.tailEnd.w ? ` w="${stroke.tailEnd.w}"` : ""}${stroke.tailEnd.len ? ` len="${stroke.tailEnd.len}"` : ""}/>`
    : "";
  return `<${tag}${attrs(lnAttrs)}>${fill}${dashXml}${joinXml}${headEnd}${tailEnd}</${tag}>`;
}

/** 竖排堆叠（与 renderer wrapGlyphsIntoColumns / 列方向一致）。 */
export function isStackedTextVert(
  vert: Extract<Shape, { kind: "text" }>["vert"] | undefined,
): boolean {
  return vert === "wordArtVert" || vert === "wordArtVertRtl" || vert === "eaVert" || vert === "mongolianVert";
}

/**
 * playground 竖排堆叠始终按 bbox 高度折列。
 * WPS「行顺序从右到左」对应 OOXML `vert="wordArtVertRtl"`（不是单独的 rtlCol；
 * 在 wordArtVert 上加 rtlCol 列仍从左边开始）。
 */
export function stackedBodyPrExport(host: {
  vert?: Extract<Shape, { kind: "text" }>["vert"];
  wrap?: boolean;
  rtlCol?: boolean;
}): {
  vert: NonNullable<Extract<Shape, { kind: "text" }>["vert"]> | undefined;
  wrap: "none" | "square" | undefined;
  rtlCol: "1" | undefined;
} {
  const vert = host.vert && host.vert !== "horz" ? host.vert : undefined;
  if (isStackedTextVert(host.vert)) {
    // wordArtVert = 行顺序从左到右；wordArtVertRtl = 从右到左。不要互相改写。
    const rtlCol =
      vert === "wordArtVert" || host.vert === "mongolianVert"
        ? host.rtlCol ? "1" : undefined
        : host.rtlCol === false ? undefined : "1";
    return { vert, wrap: "square", rtlCol };
  }
  return {
    vert,
    wrap: host.wrap === false ? "none" : host.wrap === true ? "square" : undefined,
    rtlCol: host.rtlCol ? "1" : undefined,
  };
}

function txBodyShell(
  rootTag: "p:txBody" | "a:txBody",
  paragraphs: TextParagraph[],
  host: Extract<Shape, { kind: "text" }>,
  ctx?: ShapeCtx,
): string {
  const body = (paragraphs ?? []).map((p) => paragraphToXml(p, ctx)).join("");
  const stacked = stackedBodyPrExport(host);
  const wrap = stacked.wrap ?? "square";
  const lIns = pxToEmu(host.insets?.l ?? 7);
  const tIns = pxToEmu(host.insets?.t ?? 4);
  const rIns = pxToEmu(host.insets?.r ?? 7);
  const bIns = pxToEmu(host.insets?.b ?? 4);
  const anchor = host.vAlign === "middle" ? "ctr" : host.vAlign === "bottom" ? "b" : "t";
  const bodyAttrs = attrs({
    wrap,
    lIns,
    tIns,
    rIns,
    bIns,
    anchor,
    anchorCtr: host.anchorCtr ? 1 : undefined,
    vert: stacked.vert,
    rot: host.bodyRot ? Math.round(host.bodyRot * 60000) : undefined,
    fromWordArt: host.fromWordArt || host.name === "WordArt" ? 1 : undefined,
    upright: host.upright ? 1 : undefined,
    numCol: host.numCol && host.numCol > 1 ? host.numCol : undefined,
    spcCol: host.spcCol !== undefined ? pxToEmu(host.spcCol) : undefined,
    vertOverflow: host.vertOverflow && host.vertOverflow !== "overflow" ? host.vertOverflow : undefined,
    horzOverflow: host.horzOverflow && host.horzOverflow !== "overflow" ? host.horzOverflow : undefined,
    rtlCol: stacked.rtlCol,
    spcFirstLastPara: host.spcFirstLastPara === false ? 0 : host.spcFirstLastPara ? 1 : undefined,
    compatLnSpc: host.compatLnSpc ? 1 : undefined,
    forceAA: host.forceAA ? 1 : undefined,
  });
  const autofit = autoFitXml(host.autoFit);
  const warp = prstTxWarpXml(host.prstTxWarp);
  const body3d = meta3DToXml(host.body3D);
  const inner = `${warp}${autofit}${body3d}`;
  return `<${rootTag}>
    <a:bodyPr${bodyAttrs}${inner ? `>${inner}</a:bodyPr>` : "/>"}
    ${lstStyleXml(host.lstStyle, ctx)}
    ${body}
  </${rootTag}>`;
}

export function autoFitXml(af: Extract<Shape, { kind: "text" }>["autoFit"]): string {
  if (!af) return "";
  if (af.kind === "spAutoFit") return "<a:spAutoFit/>";
  if (af.kind === "none") return "<a:noAutofit/>";
  const fontScale = af.fontScale !== undefined ? ` fontScale="${Math.round(af.fontScale * 100000)}"` : "";
  const lnSpc = af.lnSpcReduction !== undefined ? ` lnSpcReduction="${Math.round(af.lnSpcReduction * 100000)}"` : "";
  return `<a:normAutofit${fontScale}${lnSpc}/>`;
}

function lstStyleXml(styles: TextLevelStyle[] | undefined, ctx?: ShapeCtx): string {
  if (!styles?.length) return "<a:lstStyle/>";
  const levels = styles
    .map((s) => {
      const tag = s.level === 0 ? "a:defPPr" : `a:lvl${s.level}pPr`;
      const para = { ...(s.pPr ?? {}), bullet: s.bullet ?? s.pPr?.bullet } as TextParagraph;
      const inner = paragraphPPrInnerXml(para, ctx);
      const defRPr = s.rPr ? runPropsInnerXml(s.rPr, ctx) : "";
      return `<${tag}>${inner}${defRPr}</${tag}>`;
    })
    .join("");
  return `<a:lstStyle>${levels}</a:lstStyle>`;
}

function levelPPrListXml(levels: LevelStyleSpec[] | undefined, media?: MediaRegistrar): string {
  if (!levels?.length) return "";
  const ctx: ShapeCtx | undefined = media ? { media, spIdCounter: { next: 2 } } : undefined;
  const parts: string[] = [];
  for (let i = 0; i < Math.min(9, levels.length); i++) {
    const s = levels[i]!;
    if (!s.pPr && !s.rPr && !s.bullet) continue;
    const para = { ...(s.pPr ?? {}), bullet: s.bullet } as TextParagraph;
    const inner = paragraphPPrInnerXml(para, ctx);
    const defRPr = s.rPr ? runPropsInnerXml(s.rPr, ctx) : "";
    parts.push(`<a:lvl${i + 1}pPr>${inner}${defRPr}</a:lvl${i + 1}pPr>`);
  }
  return parts.join("");
}

const DEFAULT_NOTES_STYLE = `<p:notesStyle>
    <a:lvl1pPr marL="0" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1">
      <a:defRPr sz="1200" kern="1200">
        <a:solidFill><a:schemeClr val="tx1"/></a:solidFill>
        <a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/>
      </a:defRPr>
    </a:lvl1pPr>
  </p:notesStyle>`;

/** notesMaster `<p:notesStyle>`：有 txStyles.body 就按级写出，否则 Office 默认 12pt。 */
export function notesStyleToXml(body: LevelStyleSpec[] | undefined, media?: MediaRegistrar): string {
  const inner = levelPPrListXml(body, media);
  return inner ? `<p:notesStyle>${inner}</p:notesStyle>` : DEFAULT_NOTES_STYLE;
}

function levelHasContent(s: LevelStyleSpec | undefined): boolean {
  return !!(s && (s.pPr || s.rPr || s.bullet));
}

/**
 * presentation.xml `<p:defaultTextStyle>`。
 * IR 布局与 parser 对偶：body[0]=defPPr，body[1]=lvl1pPr … body[9]=lvl9pPr。
 * 与 sldMaster txStyles 不同（那边 index 0 就是 lvl1，没有 defPPr）。
 * 无有效级时返回 null，调用方回退 18pt 硬编码。
 */
export function defaultTextStyleToXml(styles: TextStyles | undefined, lang: string, media?: MediaRegistrar): string | null {
  const body = styles?.body;
  if (!body?.some(levelHasContent)) return null;
  const ctx: ShapeCtx | undefined = media ? { media, spIdCounter: { next: 2 } } : undefined;
  const writeLevel = (tagName: string, spec: LevelStyleSpec | undefined): string => {
    const rPr = { ...(spec?.rPr ?? {}), lang: spec?.rPr?.lang ?? lang };
    const para = { ...(spec?.pPr ?? {}), bullet: spec?.bullet } as TextParagraph;
    const inner = paragraphPPrInnerXml(para, ctx);
    return `<${tagName}>${inner}${runPropsInnerXml(rPr, ctx)}</${tagName}>`;
  };
  const parts: string[] = [writeLevel("a:defPPr", body[0])];
  for (let i = 1; i <= 9; i++) {
    if (!levelHasContent(body[i])) continue;
    parts.push(writeLevel(`a:lvl${i}pPr`, body[i]));
  }
  return `  <p:defaultTextStyle>\n    ${parts.join("\n    ")}\n  </p:defaultTextStyle>\n`;
}

/** sldMaster `<p:txStyles>`：titleStyle / bodyStyle / otherStyle。全空则写空壳，避免 Office 当成无样式。 */
export function txStylesToXml(styles: TextStyles | undefined, media?: MediaRegistrar): string {
  if (!styles?.title?.length && !styles?.body?.length && !styles?.other?.length) {
    return "<p:txStyles/>";
  }
  const title = levelPPrListXml(styles.title, media);
  const body = levelPPrListXml(styles.body, media);
  const other = levelPPrListXml(styles.other, media);
  return `<p:txStyles>
    <p:titleStyle>${title}</p:titleStyle>
    <p:bodyStyle>${body}</p:bodyStyle>
    <p:otherStyle>${other}</p:otherStyle>
  </p:txStyles>`;
}

function runPropsInnerXml(r: Partial<TextRun>, ctx?: ShapeCtx): string {
  const strike =
    r.strikethrough === "double" ? "dblStrike" : r.strikethrough === "single" ? "sngStrike" : undefined;
  const rPrAttrs: Record<string, string | number | undefined> = {
    sz: r.fontSize !== undefined ? pxToHundredthPt(r.fontSize) : undefined,
    b: r.fontWeight && (typeof r.fontWeight === "number" ? r.fontWeight >= 600 : r.fontWeight === "bold") ? 1 : undefined,
    i: r.italic ? 1 : undefined,
    u: underlineToOoxml(r.underline),
    strike,
    lang: r.lang,
  };
  const family = typefaceXml(r.fontFamily);
  const color = r.color ? `<a:solidFill>${colorInner(r.color, undefined)}</a:solidFill>` : "";
  return `<a:defRPr${attrs(rPrAttrs)}>${color}${family}</a:defRPr>`;
}

export function prstTxWarpXml(warp: Extract<Shape, { kind: "text" }>["prstTxWarp"]): string {
  if (!warp?.prst) return "";
  const gds = Object.entries(warp.avLst ?? {})
    .map(([n, v]) => `<a:gd name="${esc(n)}" fmla="val ${Math.round(v)}"/>`)
    .join("");
  return `<a:prstTxWarp prst="${esc(warp.prst)}">${gds ? `<a:avLst>${gds}</a:avLst>` : "<a:avLst/>"}</a:prstTxWarp>`;
}

/** 表格单元格 `<a:txBody>`（DrawingML table 用，非 `p:txBody`）。 */
export function aTxBodyToXml(
  paragraphs: TextParagraph[],
  host: Extract<Shape, { kind: "text" }>,
  ctx?: ShapeCtx,
): string {
  return txBodyShell("a:txBody", paragraphs, host, ctx);
}

function paragraphsToXml(paragraphs: TextParagraph[], host: Extract<Shape, { kind: "text" }>, ctx?: ShapeCtx): string {
  return txBodyShell("p:txBody", paragraphs, host, ctx);
}

function paragraphToXml(p: TextParagraph, ctx?: ShapeCtx): string {
  const align =
    p.align === "start" ? "l" : p.align === "middle" ? "ctr" : p.align === "end" ? "r" : p.align === "justify" ? "just" : undefined;
  // marL/indent 是 bullet 悬挂缩进的载体（ECMA-376 §21.1.2.2.7）：只写 buChar 不写
  // marL/indent，PowerPoint 里 bullet 会和文字叠在左缘。parser 按 EMU→px 读入，
  // 这里对称写回。
  const pPrAttrs = attrs({
    algn: align,
    lvl: p.level ?? undefined,
    marL: p.marginLeft !== undefined ? pxToEmu(p.marginLeft) : undefined,
    marR: p.marginRight !== undefined ? pxToEmu(p.marginRight) : undefined,
    indent: p.indent !== undefined ? pxToEmu(p.indent) : undefined,
    rtl: p.rtl ? 1 : undefined,
    fontAlgn: p.fontAlign,
    defTabSz: p.defTabSz !== undefined ? pxToEmu(p.defTabSz) : undefined,
    eaLnBrk: p.eaLnBrk === false ? 0 : p.eaLnBrk ? 1 : undefined,
    latinLnBrk: p.latinLnBrk === false ? 0 : p.latinLnBrk ? 1 : undefined,
    hangingPunct: p.hangingPunct === false ? 0 : p.hangingPunct ? 1 : undefined,
  });
  const inner = paragraphPPrInnerXml(p, ctx);
  const runs = (p.runs ?? []).map((r) => runToXml(r, ctx)).join("");
  return inner
    ? `<a:p><a:pPr${pPrAttrs}>${inner}</a:pPr>${runs}</a:p>`
    : `<a:p><a:pPr${pPrAttrs}/>${runs}</a:p>`;
}

function spcPtsXml(px: number): string {
  return `<a:spcPts val="${pxToHundredthPt(px)}"/>`;
}

/** pPr 子节点：间距 → bullet → 制表位。round-trip 新增段落复用。 */
export function paragraphPPrInnerXml(p: TextParagraph, ctx?: ShapeCtx): string {
  const lnSpc = lineSpacingXml(p);
  const spcBef = p.spaceBeforePx !== undefined ? `<a:spcBef>${spcPtsXml(p.spaceBeforePx)}</a:spcBef>` : "";
  const spcAft = p.spaceAfterPx !== undefined ? `<a:spcAft>${spcPtsXml(p.spaceAfterPx)}</a:spcAft>` : "";
  return `${lnSpc}${spcBef}${spcAft}${bulletXml(p.bullet, ctx)}${tabLstXml(p.tabStops)}`;
}

function lineSpacingXml(p: TextParagraph): string {
  if (p.lineHeightPx !== undefined) {
    return `<a:lnSpc>${spcPtsXml(p.lineHeightPx)}</a:lnSpc>`;
  }
  if (p.lineHeight !== undefined) {
    return `<a:lnSpc><a:spcPct val="${Math.round(p.lineHeight * 100000)}"/></a:lnSpc>`;
  }
  return "";
}

function tabLstXml(tabs: TextParagraph["tabStops"]): string {
  if (!tabs?.length) return "";
  const items = tabs
    .map((t) => `<a:tab pos="${pxToEmu(t.pos)}"${t.align ? ` algn="${t.align}"` : ""}/>`)
    .join("");
  return `<a:tabLst>${items}</a:tabLst>`;
}

// ECMA-376 §21.1.2.4 — bullet 定义写出（from-scratch 路径；round-trip 新增段落
// 复用同一函数）。子元素顺序按 CT_TextParagraphProperties：buClr → buSzPts/buSzPct
// → buFont → buNone/buAutoNum/buChar。图片 bullet 走 `<a:buBlip>`（需 media 注册）。
export function bulletXml(bu: BulletDef | undefined, ctx?: ShapeCtx): string {
  if (!bu) return "";
  if (bu.kind === "none") return "<a:buNone/>";
  const parts: string[] = [];
  if (bu.kind !== "picture" && bu.color) {
    parts.push(`<a:buClr>${colorInner(bu.color, undefined)}</a:buClr>`);
  }
  if (bu.sizePts !== undefined) parts.push(`<a:buSzPts val="${Math.round(bu.sizePts * 100)}"/>`);
  else if (bu.sizePct !== undefined) parts.push(`<a:buSzPct val="${Math.round(bu.sizePct * 100000)}"/>`);
  if (bu.kind === "picture") {
    if (ctx?.media && bu.src) {
      try {
        const rid = ctx.media.registerImage(bu.src);
        parts.push(`<a:buBlip><a:blip ${blipRidAttr(bu.src, rid)}/></a:buBlip>`);
        return parts.join("");
      } catch {
        /* invalid data URL → char fallback */
      }
    }
    parts.push(`<a:buChar char="\u2022"/>`);
    return parts.join("");
  }
  if (bu.font) parts.push(`<a:buFont typeface="${esc(bu.font)}"/>`);
  if (bu.kind === "number") {
    parts.push(`<a:buAutoNum type="${esc(bu.numType)}"${bu.startAt !== undefined ? ` startAt="${bu.startAt}"` : ""}/>`);
  } else if (bu.kind === "char") {
    if (!bu.char) return "";
    parts.push(`<a:buChar char="${esc(bu.char)}"/>`);
  }
  return parts.join("");
}

function runToXml(r: TextRun, ctx?: ShapeCtx): string {
  const strike =
    r.strikethrough === "double" ? "dblStrike" : r.strikethrough === "single" ? "sngStrike" : undefined;
  const rPrAttrs: Record<string, string | number | undefined> = {
    // fontSize 在内存模型是 px（parser 用 sz/100*96/72 = sz/75 反算得到）。
    // 写回 sz 时必须用同一比例 px*75，不能写 px*100 —— 否则 24px 会被当成 24pt
    // 写出 2400（即 32px 字号），再次打开就被放大约 1.33×。
    sz: r.fontSize !== undefined ? pxToHundredthPt(r.fontSize) : undefined,
    b: r.fontWeight && (typeof r.fontWeight === "number" ? r.fontWeight >= 600 : r.fontWeight === "bold") ? 1 : undefined,
    i: r.italic ? 1 : undefined,
    u: underlineToOoxml(r.underline),
    strike,
    cap: r.caps && r.caps !== "none" ? r.caps : undefined,
    baseline: r.baseline ? Math.round(r.baseline * 100000) : undefined,
    kern: r.kern !== undefined ? Math.round(r.kern) : undefined,
    spc: r.letterSpacing !== undefined ? pxToHundredthPt(r.letterSpacing) : undefined,
    lang: r.lang,
    altLang: r.altLang,
    kumimoji: r.kumimoji ? 1 : undefined,
    normalizeH: r.normalizeH ? 1 : undefined,
    noProof: r.noProof ? 1 : undefined,
  };
  const family = typefaceXml(r.fontFamily);
  const transparent = r.color === "transparent" || r.color === "none";
  const color =
    r.fill && r.fill.kind !== "solid"
      ? fillToXml(r.fill, ctx)
      : transparent
        ? "<a:noFill/>"
        : r.color
          ? `<a:solidFill>${colorInner(r.color, undefined)}</a:solidFill>`
          : "";
  const outline = r.textOutline ? strokeToXml(r.textOutline) : "";
  const fx = r.effects?.length ? effectsToXml(r.effects) : "";
  const highlight = r.highlight
    ? `<a:highlight>${colorInner(r.highlight, undefined)}</a:highlight>`
    : "";
  const click = r.hyperlink ? hlinkTagXml(r.hyperlink, "a:hlinkClick", ctx) : "";
  const hover = r.hoverLink ? hlinkTagXml(r.hoverLink, "a:hlinkHover", ctx) : "";
  return `<a:r><a:rPr${attrs(rPrAttrs)}>${outline}${color}${fx}${highlight}${family}${click}${hover}</a:rPr><a:t>${esc(r.text)}</a:t></a:r>`;
}

/** latin + 东亚/复杂脚本槽位。只写 latin 时 WPS 对中文艺术字会丢掉样式回退到宋体。 */
function typefaceXml(fontFamily?: string): string {
  const latin = firstCssTypeface(fontFamily);
  if (!latin) return "";
  const ea = pickEaTypeface(fontFamily);
  const latinXml = `<a:latin typeface="${esc(latin)}"/>`;
  // 中文单一字体（微软雅黑）时 ea === latin，仍必须写 a:ea，否则 WPS 走宋体。
  const eaXml = ea ? `<a:ea typeface="${esc(ea)}"/>` : "";
  return `${latinXml}${eaXml}<a:cs typeface="${esc(latin)}"/>`;
}

function pathToCustGeom(s: Shape & { d?: string; points?: Array<[number, number]> }): string {
  const w = pxToEmu(Math.max(1, s.bbox.w));
  const h = pxToEmu(Math.max(1, s.bbox.h));
  let commands = "";
  if (s.kind === "polygon" && s.points && s.points.length > 0) {
    const pts = s.points.map(([x, y]) => [pxToEmu(x - s.bbox.x), pxToEmu(y - s.bbox.y)]);
    commands += `<a:moveTo><a:pt x="${pts[0]![0]}" y="${pts[0]![1]}"/></a:moveTo>`;
    for (let i = 1; i < pts.length; i++) {
      commands += `<a:lnTo><a:pt x="${pts[i]![0]}" y="${pts[i]![1]}"/></a:lnTo>`;
    }
    commands += "<a:close/>";
  } else if (s.kind === "path" && s.d) {
    // SVG path → DrawingML 逐命令转换（M/L/H/V/C/S/Q/T/A/Z），保真导出自定义几何。
    // 解析失败（非法 d）才退回对角线占位，避免产出空 pathLst 让 PowerPoint 报修复。
    const converted = svgPathToDrawingML(s.d, { x: s.bbox.x, y: s.bbox.y }, pxToEmu);
    commands = converted.ok
      ? converted.commands
      : `<a:moveTo><a:pt x="0" y="0"/></a:moveTo><a:lnTo><a:pt x="${w}" y="${h}"/></a:lnTo>`;
  }
  return `<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="0" t="0" r="${w}" b="${h}"/><a:pathLst><a:path w="${w}" h="${h}">${commands}</a:path></a:pathLst></a:custGeom>`;
}

function phXml(s: Shape): string {
  if (!s.placeholder) return "";
  return tag("p:ph", {
    type: s.placeholder.type,
    sz: s.placeholder.sz,
    idx: s.placeholder.idx,
    orient: s.placeholder.orient,
  });
}

/** ECMA-376 §19.3.3 / Microsoft CT_Slide `p:hf`（页眉页脚占位符可见性）。 */
export function hfToXml(hf: HeaderFooter | undefined): string {
  if (!hf) return "";
  const a: Record<string, string | number | undefined> = {};
  if (hf.sldNum !== undefined) a.sldNum = hf.sldNum ? 1 : 0;
  if (hf.hdr !== undefined) a.hdr = hf.hdr ? 1 : 0;
  if (hf.ftr !== undefined) a.ftr = hf.ftr ? 1 : 0;
  if (hf.dt !== undefined) a.dt = hf.dt ? 1 : 0;
  if (!Object.keys(a).length) return "";
  return `<p:hf${attrs(a)}/>`;
}

const CLR_MAP_KEYS = [
  "bg1", "tx1", "bg2", "tx2",
  "accent1", "accent2", "accent3", "accent4", "accent5", "accent6",
  "hlink", "folHlink",
] as const;

/** ECMA-376 §19.3.1.37 `p:sld` 根属性（隐藏页 / 母版图形 / 母版占位符动画）。 */
export function sldRootAttrXml(slide: Slide): string {
  const a: string[] = [];
  if (slide.show === false) a.push('show="0"');
  if (slide.showMasterSp === false) a.push('showMasterSp="0"');
  else if (slide.showMasterSp === true) a.push('showMasterSp="1"');
  if (slide.showMasterPhAnim === false) a.push('showMasterPhAnim="0"');
  else if (slide.showMasterPhAnim === true) a.push('showMasterPhAnim="1"');
  return a.length ? ` ${a.join(" ")}` : "";
}

/** `<p:cSld name>`：默认 "Slide N" 不写，避免污染 Office 侧栏。 */
export function cSldNameAttr(slide: Slide): string {
  const n = slide.name?.trim();
  if (!n || /^Slide\s+\d+$/i.test(n)) return "";
  return ` name="${esc(n)}"`;
}

/** ECMA-376 §19.3.1.8 `p:clrMapOvr`。无覆盖时沿用 master。 */
export function clrMapOvrXml(map: ClrMap | undefined): string {
  if (!map) return `<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>`;
  const bits: string[] = [];
  for (const k of CLR_MAP_KEYS) {
    const v = map[k];
    if (v) bits.push(`${k}="${esc(v)}"`);
  }
  if (!bits.length) return `<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>`;
  return `<p:clrMapOvr><a:overrideClrMapping ${bits.join(" ")}/></p:clrMapOvr>`;
}
