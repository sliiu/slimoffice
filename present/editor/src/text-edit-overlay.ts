// ============================================================================
// 双击文本框进入的行内编辑器（contenteditable overlay）
// ----------------------------------------------------------------------------
// 唯一目标：**进入编辑不改变文字的视觉表现**。用户双击时看到的应该是"同一段文字
// 多了个光标"，而不是"文字换了字体 / 变大 / 变色 / 项目符号消失 / 跑到白底上"。
//
// 实现方式是把 renderer（svg/canvas-backend）对 ‹txBody› 的排版规则**逐条镜像**成
// HTML/CSS：
//
//   renderer                                    →  overlay
//   ----------------------------------------------------------------------
//   bbox + insets 组成的 inner box              →  border-box + padding
//   vAlign top/middle/bottom                    →  flex column + justify-content
//   shape.transform.rotation + bodyRot + vert   →  transform: rotate() 绕 bbox 中心
//   祖先 group 的 rotation / flipH / flipV      →  overlayWorldTransformCss 叠到 overlay
//                                                  （解析后 TextBox 拆成 group(_base,_text)，
//                                                   旋转挂在外层，不叠就会和文字错位）
//   wordArtVert / eaVert / mongolianVert        →  逐字列布局（与 renderer 共用
//                                                   buildStackedGlyphs / wrapGlyphsIntoColumns）
//   shape.fill / shape.stroke                   →  background / inset box-shadow
//   shape.shadow                                →  filter: drop-shadow()
//   paragraph align / rtl                       →  text-align + direction
//   marginLeft / indent / bullet 悬挂缩进        →  padding-inline-start + text-indent
//   lineHeightPx ?? maxFs × (lineHeight ?? 1.2) →  line-height（px）
//   spaceBeforePx / spaceAfterPx                →  margin-top / margin-bottom
//   bullet char / 自动编号                       →  绝对定位的 [data-ppt-bullet] span
//   run 字体/字号/粗斜/下划线/删除线/色/字距      →  span inline style
//   run baseline（上下标）                       →  缩小字号 + vertical-align px
//   run textOutline                             →  -webkit-text-stroke
//   run effects（阴影 / 发光）                    →  filter: drop-shadow()
//   normAutofit 运行时缩放                       →  fitOverlayAutofit() 迭代缩字号
//   wrap=false / vertOverflow=clip              →  white-space + overflow
//
// 所有"slide 单位 → 屏幕 px"的换算都乘 stageScale；缺省值（insets / 行距系数 /
// 兜底字号 / bullet 编号规则）一律从 @ppt/renderer 的 text-shared 取，避免与渲染
// 端各写一份而漂移。
//
// 注意：这是 OOXML 文本模型到 HTML inline 样式的**近似**映射，只用于编辑期视觉。
// 提交后由渲染器按完整 ‹rPr› 输出权威外观。已知未镜像项见文件末尾注释。
// ============================================================================
import type { Paint, Shape, Stroke, TextParagraph, TextRun, TextShape } from "@ppt/core";
import { paintedTextColor } from "./live-color";
import type { TextCharRange } from "./text-char-style";
import {
  DEFAULT_LINE_HEIGHT_FACTOR,
  FALLBACK_FONT_SIZE,
  lineHeightFactor,
  DEFAULT_TEXT_INSETS,
  advanceBulletLabel,
  bulletFontSize,
  hexWithAlpha,
  isVerticalStack,
  stackedColumnsLtr,
  newBulletNumState,
  paragraphFallbackFontSize,
  paragraphLineHeightPx,
  pickRunEffectsCssFilter,
  textEffectsCssFilter,
  textTotalRotationDeg,
  vertRotateDeg,
  buildStackedGlyphs,
  wrapGlyphsIntoColumns,
  type StackedGlyph,
} from "@ppt/renderer";
import { overlayWorldTransformCss } from "./shape-transform";

/** overlay 的 bullet 占位元素标记；读回文本时必须跳过，否则项目符号会被写进正文。 */
const BULLET_ATTR = "data-ppt-bullet";
/** 竖排堆叠 overlay 的段落容器；读回时按它取 textContent，避免列 flex 被 innerText 插换行。 */
const PARA_ATTR = "data-ppt-para";
/** 竖排堆叠模式标记（wordArtVert / eaVert / mongolianVert）。 */
const STACK_ATTR = "data-ppt-vert-stack";

export interface TextOverlayBox {
  /** 相对 stage 左上角的 px（已乘 stageScale）。 */
  left: number;
  top: number;
  width: number;
  height: number;
  /** §21.1.2.1.1 lIns/tIns/rIns/bIns 换算后的 padding（px）。 */
  pad: { l: number; t: number; r: number; b: number };
  /** 绕 box 中心的总旋转角（deg）。 */
  rotation: number;
}

/**
 * 计算 overlay 的几何：与 renderer 的 inner box 完全对齐。
 *
 * vert/vert270 时 renderer 把排版放在"旋转前坐标系"里做，宽高互换且 inner box
 * 绕 bbox 中心居中；这里用"box 宽高互换 + 对称 padding"复现同一个 inner box：
 * padLeft = padRight = (tIns + bIns) / 2 恰好等于 renderer 的 (w − innerW) / 2。
 */
export function textOverlayBox(s: TextShape, scale: number): TextOverlayBox {
  const ins = s.insets ?? DEFAULT_TEXT_INSETS;
  const swap = vertRotateDeg(s.vert) !== 0;
  const cx = s.bbox.x + s.bbox.w / 2;
  const cy = s.bbox.y + s.bbox.h / 2;
  const w = swap ? s.bbox.h : s.bbox.w;
  const h = swap ? s.bbox.w : s.bbox.h;
  const pad = swap
    ? { l: (ins.t + ins.b) / 2, t: (ins.l + ins.r) / 2, r: (ins.t + ins.b) / 2, b: (ins.l + ins.r) / 2 }
    : ins;
  return {
    left: (cx - w / 2) * scale,
    top: (cy - h / 2) * scale,
    width: w * scale,
    height: h * scale,
    pad: { l: pad.l * scale, t: pad.t * scale, r: pad.r * scale, b: pad.b * scale },
    rotation: textTotalRotationDeg(s),
  };
}

/** 把 overlay 的位置 / 尺寸 / 旋转写到 style 上；缩放变化时可重复调用。 */
export function applyTextOverlayBox(
  el: HTMLElement,
  s: TextShape,
  scale: number,
  origin: { x: number; y: number },
  ancestors: readonly Shape[] = [],
): TextOverlayBox {
  const box = textOverlayBox(s, scale);
  el.style.left = `${origin.x + box.left}px`;
  el.style.top = `${origin.y + box.top}px`;
  el.style.width = `${box.width}px`;
  // 用 px 锁死上限。百分百相对的是 stageWrap 视口，会把编辑层压窄或撑开，
  // 表现为「框变了但字不跟着重排」。
  el.style.maxWidth = `${box.width}px`;
  el.style.height = `${box.height}px`;
  el.style.padding = `${box.pad.t}px ${box.pad.r}px ${box.pad.b}px ${box.pad.l}px`;
  // 无祖先：绕 box 中心旋转 = renderer 绕 bbox 中心旋转（box 与 bbox 同心）。
  // 有祖先 group：叠父级 rotation/flip（见 overlayWorldTransformCss），否则
  // 解析后的 TextBox（group(_base,_text)，旋转挂在外层）双击后编辑框会和文字错位。
  const xf = overlayWorldTransformCss(box, scale, ancestors);
  el.style.transformOrigin = xf.origin;
  el.style.transform = xf.css;
  return box;
}

/**
 * 构造 overlay 元素并按 shape 的容器级样式（背景 / 描边 / 阴影 / vAlign / 换行 /
 * 溢出 / 竖排）铺好，再把 paragraphs 渲染进去。
 *
 * 不设 outline/border 之外的任何"编辑态装饰"：焦点环用 outline 画在 border box
 * 外侧，不占布局、不挤压文字，因此不会改变文字位置。
 */
export function buildTextEditOverlay(opts: {
  doc: Document;
  shape: TextShape;
  scale: number;
  origin: { x: number; y: number };
  spellcheck: boolean;
  lang: string;
  /** 从外到内的祖先 group；旋转/翻转挂在这些节点上时必须传入，否则 overlay 对不齐。 */
  ancestors?: readonly Shape[];
}): HTMLDivElement {
  const { doc, shape: s, scale, origin } = opts;
  const el = doc.createElement("div");
  el.setAttribute("contenteditable", "true");
  el.spellcheck = opts.spellcheck;
  el.lang = opts.lang;
  el.setAttribute("data-ppt-text-editor", s.id);
  el.style.position = "absolute";
  el.style.boxSizing = "border-box";
  el.style.margin = "0";
  applyTextOverlayBox(el, s, scale, origin, opts.ancestors);

  // stage 上禁用了 user-select（防止拖动时误选场景文字），overlay 必须显式恢复，
  // 否则鼠标拖选、双击选词都失效。
  el.style.userSelect = "text";
  (el.style as CSSStyleDeclaration & { webkitUserSelect?: string }).webkitUserSelect = "text";

  // ---- 背景：镜像 shape 自身的 fill，而不是铺白底 ----
  // 之前 overlay 固定 background: rgba(255,255,255,.95)，在深色 slide + 浅色文字的
  // 主题下双击就变成"白底浅字"，几乎看不见 —— 这是"进入编辑样式全变"最直观的来源。
  // 现在原 shape 在编辑期被隐藏（见 editor.ts），overlay 自己负责画 fill，
  // 没有 fill 时保持透明，让 slide 背景 / 底层 shape 原样透出。
  const bg = paintToCssBackground(s.fill);
  el.style.background = bg.background;
  if (bg.backgroundSize) el.style.backgroundSize = bg.backgroundSize;
  if (bg.backgroundPosition) el.style.backgroundPosition = bg.backgroundPosition;
  if (bg.backgroundRepeat) el.style.backgroundRepeat = bg.backgroundRepeat;

  // ---- 描边：inset box-shadow（border 会挤压 padding 从而移动文字）----
  const strokeCss = strokeToCssColor(s.stroke);
  const shadows: string[] = [];
  if (strokeCss) {
    shadows.push(`inset 0 0 0 ${Math.max(1, (s.stroke?.width ?? 1) * scale)}px ${strokeCss}`);
  }
  if (shadows.length) el.style.boxShadow = shadows.join(", ");

  // 编辑态不额外画框：进入编辑时 shape 一定是选中态，renderOverlay 已经在同一个
  // bbox 上画了虚线选中框 + 8 点手柄，再叠一圈 outline 只会变成"双层虚线"的视觉噪声。
  // "正在编辑"的信号交给闪动的光标（caret 继承插入点的文字色，深浅底都看得见）。
  el.style.outline = "none";

  // ---- shape 级阴影 / 效果 ----
  const filters: string[] = [];
  if (s.shadow && s.shadow.kind === "outer") {
    const c = hexWithAlpha(s.shadow.color, s.shadow.alpha);
    filters.push(
      `drop-shadow(${s.shadow.dx * scale}px ${s.shadow.dy * scale}px ${s.shadow.blur * scale}px ${c})`,
    );
  }
  const shapeFx = textEffectsCssFilter(s.effects, scale);
  if (shapeFx) filters.push(shapeFx);
  if (filters.length) el.style.filter = filters.join(" ");

  // ---- vAlign / 换行 / 竖排 ----
  el.style.display = "flex";
  if (isVerticalStack(s.vert)) {
    // 竖排堆叠：renderer 走逐字符列布局，不是 CSS writing-mode。
    // writing-mode:vertical-rl 会把拉丁字侧躺、行距变成列宽，双击后视觉全变。
    el.setAttribute(STACK_ATTR, s.vert ?? "");
    // 显式关掉 writing-mode，避免继承或旧逻辑把拉丁字侧躺、行距变成列宽。
    el.style.writingMode = "horizontal-tb";
    el.style.alignItems = "stretch";
    el.style.justifyContent = "flex-start";
    el.style.whiteSpace = "pre";
    el.style.overflowWrap = "normal";
    el.style.wordBreak = "normal";
    el.style.minWidth = "0";
    el.style.lineHeight = "1";
  } else {
    el.style.flexDirection = "column";
    el.style.alignItems = "stretch";
    if (s.vAlign === "middle") {
      // renderer 的 clampMiddle：middle 只允许向下溢出，文字变多时退化为 top-anchor。
      // CSS 的 `safe center` 语义完全一致（溢出时回退到 start）；不支持时留 center。
      el.style.justifyContent = "center";
      el.style.justifyContent = "safe center";
    } else if (s.vAlign === "bottom") {
      el.style.justifyContent = "flex-end";
    } else {
      el.style.justifyContent = "flex-start";
    }

    // ---- 换行 / 溢出 ----
    // §21.1.2.1.1 wrap="none" → 不换行（renderer 走 noWrap 单行 layout）。
    el.style.whiteSpace = s.wrap === false ? "pre" : "pre-wrap";
    el.style.overflowWrap = "anywhere";
    el.style.wordBreak = "break-word";
    // flex column 子项默认 min-width:auto = 内容最小宽度。框变窄时子项被撑开，
    // pre-wrap 就不会按 overlay 宽度折行。必须压成 0，换行才跟 renderer 一致。
    el.style.minWidth = "0";
    // 绝不能写 max-width:100%。overlay 是 stageWrap 里的绝对定位元素，百分百
    // 相对的是画布视口而不是文本框。放大或框本身较宽时，编辑框会被压得比
    // shape 窄一截，再叠 min-content 不折行，就是"框变窄了但文字不换行"。
  }
  const clipped =
    (s.vertOverflow ?? "overflow") !== "overflow" || (s.horzOverflow ?? "overflow") !== "overflow";
  el.style.overflow = clipped ? "hidden" : "visible";

  // 不给容器设 font-family / font-size / color：每段 div + 每 run span 自带 inline
  // 样式。但**必须**把 color 兜底成渲染端的缺省值（SVG text 无 fill 时为黑），否则
  // 没写 color 的 run 会继承编辑器 UI 的浅色文字，深浅完全反过来。
  el.style.color = "#000";
  el.style.textAlign = "start";

  renderParagraphsInto(el, s, scale, doc);
  return el;
}

/**
 * 把 paragraphs 渲染成"每段一个 div，每 run 一个 span"。
 * `fontScale` 供 normAutofit 的运行时缩放二次调用（见 fitOverlayAutofit）。
 */
export function renderParagraphsInto(
  editor: HTMLElement,
  s: TextShape,
  scale: number,
  doc: Document,
  fontScale = 1,
): void {
  while (editor.firstChild) editor.removeChild(editor.firstChild);
  if (isVerticalStack(s.vert)) {
    renderStackedInto(editor, s, scale, doc, fontScale);
    return;
  }
  const bulletState = newBulletNumState();
  for (const para of s.paragraphs) {
    editor.appendChild(buildParagraph(para, scale * fontScale, scale, doc, bulletState));
  }
  if (editor.children.length === 0) {
    const empty = doc.createElement("div");
    empty.style.minWidth = "0";
    empty.style.maxWidth = "100%";
    empty.style.width = "100%";
    empty.appendChild(doc.createElement("br"));
    editor.appendChild(empty);
  }
}

/**
 * 竖排堆叠 overlay：镜像 renderer 的 buildStackedGlyphs + wrapGlyphsIntoColumns。
 * 每个字符一个格子，列从右往左（mongolianVert / rtlCol 反向），eaVert 拉丁字旋转 90°。
 */
function renderStackedInto(
  editor: HTMLElement,
  s: TextShape,
  scale: number,
  doc: Document,
  fontScale: number,
): void {
  const vert = s.vert as "wordArtVert" | "wordArtVertRtl" | "eaVert" | "mongolianVert";
  const ltr = stackedColumnsLtr(vert, s.rtlCol);
  const ins = s.insets ?? DEFAULT_TEXT_INSETS;
  const innerH = Math.max(0, s.bbox.h - ins.t - ins.b);
  const px = scale * fontScale;
  const spcCol = Math.max(0, s.spcCol ?? 0) * scale;
  const bulletState = newBulletNumState();

  editor.style.flexDirection = ltr ? "row" : "row-reverse";
  editor.style.justifyContent = "flex-start";
  editor.style.alignItems = "stretch";
  editor.style.gap = `${spcCol}px`;

  for (const p of s.paragraphs) {
    const paraEl = doc.createElement("div");
    paraEl.setAttribute(PARA_ATTR, "1");
    paraEl.style.display = "flex";
    paraEl.style.flexDirection = ltr ? "row" : "row-reverse";
    paraEl.style.alignItems = "stretch";
    paraEl.style.gap = `${spcCol}px`;
    paraEl.style.flex = "0 0 auto";
    paraEl.style.minWidth = "0";
    paraEl.style.height = "100%";

    const glyphs = buildStackedGlyphs(p, undefined, vert);
    const cols: StackedGlyph[][] =
      glyphs.length === 0 ? [[]] : wrapGlyphsIntoColumns(glyphs, innerH);
    const annotated = annotateDroppedStackedGlyphs(glyphs, cols);
    annotated.forEach((colGlyphs, wi) => {
      paraEl.appendChild(
        buildStackedColumn(p, colGlyphs, wi === 0, s, px, scale, doc, bulletState),
      );
    });
    editor.appendChild(paraEl);
  }
  if (editor.children.length === 0) {
    const empty = doc.createElement("div");
    empty.setAttribute(PARA_ATTR, "1");
    empty.appendChild(doc.createElement("br"));
    editor.appendChild(empty);
  }
}

/**
 * wrapGlyphsIntoColumns 会丢掉列首 / 折列处的空白。overlay 必须把这些字符留在
 * DOM 里（零高度隐藏），否则双击后立刻失焦就会把空格提交丢了。
 */
function annotateDroppedStackedGlyphs(
  original: StackedGlyph[],
  columns: StackedGlyph[][],
): { glyph: StackedGlyph; hidden: boolean }[][] {
  const out: { glyph: StackedGlyph; hidden: boolean }[][] = columns.map(() => []);
  if (out.length === 0) return [[]];
  let oi = 0;
  for (let ci = 0; ci < columns.length; ci++) {
    for (const vis of columns[ci]!) {
      while (oi < original.length && original[oi] !== vis) {
        out[ci]!.push({ glyph: original[oi]!, hidden: true });
        oi += 1;
      }
      out[ci]!.push({ glyph: vis, hidden: false });
      if (oi < original.length && original[oi] === vis) oi += 1;
    }
  }
  while (oi < original.length) {
    out[out.length - 1]!.push({ glyph: original[oi]!, hidden: true });
    oi += 1;
  }
  return out;
}

function stackedColumnJustify(
  p: TextParagraph,
  s: TextShape,
): string {
  if (p.align === "middle") return "center";
  if (p.align === "end") return "flex-end";
  if (p.align === "justify") return "space-between";
  if (s.vAlign === "middle") return "center";
  if (s.vAlign === "bottom") return "flex-end";
  return "flex-start";
}

function buildStackedColumn(
  p: TextParagraph,
  glyphs: { glyph: StackedGlyph; hidden: boolean }[],
  showBullet: boolean,
  s: TextShape,
  fontPxScale: number,
  geomScale: number,
  doc: Document,
  bulletState: ReturnType<typeof newBulletNumState>,
): HTMLDivElement {
  const fallbackFs = paragraphFallbackFontSize(p);
  const visible = glyphs.filter((g) => !g.hidden).map((g) => g.glyph);
  const colW =
    (visible.length ? visible.reduce((m, g) => Math.max(m, g.fontSize), 0) : fallbackFs) * fontPxScale;
  const col = doc.createElement("div");
  col.style.display = "flex";
  col.style.flexDirection = "column";
  col.style.justifyContent = stackedColumnJustify(p, s);
  col.style.alignItems = "center";
  col.style.width = `${Math.max(1, colW)}px`;
  col.style.height = "100%";
  col.style.flex = "0 0 auto";
  col.style.boxSizing = "border-box";
  col.style.overflow = "visible";

  const label = showBullet ? advanceBulletLabel(p, bulletState) : null;
  const picture = showBullet && p.bullet?.kind === "picture" ? p.bullet : null;
  if (picture) {
    const first = visible[0];
    const step = (first?.stepY ?? fallbackFs * DEFAULT_LINE_HEIGHT_FACTOR) * fontPxScale;
    const img = buildPictureBullet(p, picture, fontPxScale, geomScale, doc, !!p.rtl, 0, 0);
    img.style.position = "relative";
    img.style.left = "auto";
    img.style.right = "auto";
    img.style.top = "auto";
    img.style.height = `${step}px`;
    col.appendChild(img);
  } else if (label && visible.length > 0) {
    const first = visible[0]!;
    const cell = doc.createElement("span");
    cell.setAttribute(BULLET_ATTR, "1");
    cell.setAttribute("contenteditable", "false");
    cell.style.display = "flex";
    cell.style.alignItems = "center";
    cell.style.justifyContent = "center";
    cell.style.height = `${first.stepY * fontPxScale}px`;
    cell.style.width = "100%";
    cell.style.lineHeight = "1";
    cell.style.fontSize = `${bulletFontSize(p.bullet!, first.fontSize) * fontPxScale}px`;
    const family = ("font" in p.bullet! ? p.bullet.font : undefined) ?? p.runs[0]?.fontFamily;
    if (family) cell.style.fontFamily = family;
    const color = ("color" in p.bullet! ? p.bullet.color : undefined) ?? paintedTextColor(p.runs[0]);
    if (color) cell.style.color = color;
    cell.style.pointerEvents = "none";
    cell.style.userSelect = "none";
    cell.textContent = label;
    col.appendChild(cell);
  }

  if (glyphs.length === 0) {
    const empty = doc.createElement("span");
    empty.style.display = "block";
    empty.style.height = `${fallbackFs * fontPxScale}px`;
    empty.appendChild(doc.createElement("br"));
    col.appendChild(empty);
    return col;
  }

  for (const item of glyphs) {
    const g = item.glyph;
    const cell = doc.createElement("span");
    cell.style.display = "flex";
    cell.style.alignItems = "center";
    cell.style.justifyContent = "center";
    cell.style.lineHeight = "1";
    cell.style.boxSizing = "border-box";
    if (item.hidden) {
      // 折列丢掉的空白：占位但不参与竖排步进，保证 textContent 往返完整。
      cell.style.height = "0";
      cell.style.width = "0";
      cell.style.overflow = "hidden";
      cell.style.opacity = "0";
      cell.style.pointerEvents = "none";
    } else {
      cell.style.height = `${g.stepY * fontPxScale}px`;
      cell.style.width = "100%";
    }
    const span = doc.createElement("span");
    applyRunStyle(span, g.run, fontPxScale, geomScale, fallbackFs);
    span.style.fontSize = `${g.fontSize * fontPxScale}px`;
    // letterSpacing 已计入 glyph.stepY，单字格子上再设会把字形挤偏。
    span.style.letterSpacing = "normal";
    span.style.lineHeight = "1";
    span.textContent = g.ch;
    if (!g.upright && !item.hidden) {
      span.style.display = "inline-block";
      span.style.transform = "rotate(90deg)";
    }
    cell.appendChild(span);
    col.appendChild(cell);
  }
  return col;
}

function buildParagraph(
  p: TextParagraph,
  fontPxScale: number,
  geomScale: number,
  doc: Document,
  bulletState: ReturnType<typeof newBulletNumState>,
): HTMLDivElement {
  const div = doc.createElement("div");
  div.style.minWidth = "0";
  div.style.maxWidth = "100%";
  div.style.width = "100%";
  div.style.boxSizing = "border-box";
  div.style.overflowWrap = "anywhere";
  div.style.wordBreak = "break-word";
  div.style.flex = "0 1 auto";
  div.style.alignSelf = "stretch";
  const rtl = !!p.rtl;
  const fallbackFs = paragraphFallbackFontSize(p);

  // §21.1.2.2.4 algn — start/end 是方向相关的，配合 direction 天然实现 rtl 互换
  // （renderer 里由 mapVisualAlign 做同一件事）。
  if (rtl) div.style.direction = "rtl";
  div.style.textAlign =
    p.align === "middle"
      ? "center"
      : p.align === "end"
        ? "end"
        : p.align === "justify"
          ? "justify"
          : "start";

  // 空段的高度由段落自身的 font-size / line-height 决定，所以两者都要写。
  div.style.fontSize = `${fallbackFs * fontPxScale}px`;
  // 行高必须区分"倍数"和"固定值"，否则混排字号的段落会比 renderer 高一大截：
  // CSS 行盒取所有 inline box 的 leading box 并集，而每个 run 的 leading box 是绕
  // 各自 content 高度居中的。给固定 px 行高时，小字号 run 的盒子会顶出大字号 run
  // 的盒子上下沿 → 并集 > 设定值（实测 53.9px 的段落被撑到 66.9px，后面所有段落
  // 跟着下移）。renderer 侧 text-layout.ts 是 height = lineHeightPx ?? maxFs×factor，
  // 一行只有一个高度。
  //   - 倍数行距：写**无单位** line-height，每个 run 按自己的字号算 leading box，
  //     并集恰好等于 该行最大字号 × factor —— 和 renderer 的 per-line maxFs 一致。
  //   - 固定行距（spcPts）：写 px，同时把 run 的 line-height 压成 0，让行高完全由
  //     段落 strut 决定，避免上面那种并集膨胀。
  const exactLineHeightPx = p.lineHeightPx;
  if (exactLineHeightPx !== undefined) {
    div.style.lineHeight = `${exactLineHeightPx * fontPxScale}px`;
  } else {
    div.style.lineHeight = String(lineHeightFactor(p));
  }
  if (p.spaceBeforePx) div.style.marginTop = `${p.spaceBeforePx * fontPxScale}px`;
  if (p.spaceAfterPx) div.style.marginBottom = `${p.spaceAfterPx * fontPxScale}px`;

  // §21.1.2.2.6 marL / indent。renderer：有 bullet 时正负 indent 都只挪 bullet，
  // 正文恒从 marL 起；无 bullet 时正 indent 作用于首行。
  const marL = (rtl ? p.marginRight : p.marginLeft) ?? 0;
  const indent = p.indent ?? 0;
  const hasBullet = !!p.bullet && p.bullet.kind !== "none";
  if (marL) div.style.paddingInlineStart = `${marL * geomScale}px`;
  const marR = (rtl ? p.marginLeft : p.marginRight) ?? 0;
  if (marR) div.style.paddingInlineEnd = `${marR * geomScale}px`;
  if (!hasBullet && indent > 0) div.style.textIndent = `${indent * geomScale}px`;

  const paraFx = pickRunEffectsCssFilter(p.runs, geomScale);
  if (paraFx) div.style.filter = paraFx;

  // bullet：绝对定位在 marL+indent 处（支持悬挂缩进），contenteditable=false +
  // [data-ppt-bullet] 标记，读回正文时被剔除。
  const label = advanceBulletLabel(p, bulletState);
  // §21.1.2.4.3 buBlip 图片项目符号：advanceBulletLabel 只吐字符/编号，图片要单独走
  // <img>。renderer 对图片 bullet 不要求段落有文字，这里保持一致。
  const picture = p.bullet?.kind === "picture" ? p.bullet : null;
  if (picture) {
    div.style.position = "relative";
    div.appendChild(buildPictureBullet(p, picture, fontPxScale, geomScale, doc, rtl, marL, indent));
  } else if (label && hasAnyText(p)) {
    div.style.position = "relative";
    div.appendChild(buildBullet(p, label, fontPxScale, geomScale, doc, rtl, marL, indent));
  }

  if (p.runs.length === 0) {
    // 空段必须有 <br> 才占位可见。
    div.appendChild(doc.createElement("br"));
    return div;
  }
  for (const run of p.runs) {
    const span = doc.createElement("span");
    applyRunStyle(span, run, fontPxScale, geomScale, fallbackFs);
    if (exactLineHeightPx !== undefined) span.style.lineHeight = "0";
    // textContent 而非 innerText：避免浏览器折叠连续空格。
    span.textContent = run.text;
    div.appendChild(span);
  }
  return div;
}

function buildPictureBullet(
  p: TextParagraph,
  bullet: Extract<NonNullable<TextParagraph["bullet"]>, { kind: "picture" }>,
  fontPxScale: number,
  geomScale: number,
  doc: Document,
  rtl: boolean,
  marL: number,
  indent: number,
): HTMLImageElement {
  const fallbackFs = paragraphFallbackFontSize(p);
  const size = bulletFontSize(bullet, p.runs[0]?.fontSize ?? FALLBACK_FONT_SIZE) * fontPxScale;
  const img = doc.createElement("img");
  img.setAttribute(BULLET_ATTR, "1");
  img.setAttribute("contenteditable", "false");
  img.src = bullet.src;
  img.alt = "";
  img.style.position = "absolute";
  const off = `${(marL + indent) * geomScale}px`;
  if (rtl) img.style.right = off;
  else img.style.left = off;
  // renderer 把图片底边放在首行基线上（y = baseline − bulletFs）。基线相对段顶的
  // 距离就是 text-layout.ts 的 ascent = 行高 − 0.25 × 字号。
  const ascent = (paragraphLineHeightPx(p, fallbackFs) - 0.25 * fallbackFs) * fontPxScale;
  img.style.top = `${ascent - size}px`;
  img.style.width = `${size}px`;
  img.style.height = `${size}px`;
  img.style.objectFit = "contain";
  img.style.pointerEvents = "none";
  img.style.userSelect = "none";
  return img;
}

function buildBullet(
  p: TextParagraph,
  label: string,
  fontPxScale: number,
  geomScale: number,
  doc: Document,
  rtl: boolean,
  marL: number,
  indent: number,
): HTMLSpanElement {
  const bullet = p.bullet!;
  const firstRun = p.runs[0];
  const runFs = firstRun?.fontSize ?? FALLBACK_FONT_SIZE;
  const span = doc.createElement("span");
  span.setAttribute(BULLET_ATTR, "1");
  span.setAttribute("contenteditable", "false");
  span.style.position = "absolute";
  // renderer 的 bulletAbs = innerX + marL + indent（rtl 时从右侧算）。这里的 div
  // 已经在 inner box 内，所以直接用 marL+indent 作为 inline-start 偏移。
  const off = `${(marL + indent) * geomScale}px`;
  if (rtl) span.style.right = off;
  else span.style.left = off;
  span.style.top = "0";
  span.style.fontSize = `${bulletFontSize(bullet, runFs) * fontPxScale}px`;
  const family = ("font" in bullet ? bullet.font : undefined) ?? firstRun?.fontFamily;
  if (family) span.style.fontFamily = family;
  const color = ("color" in bullet ? bullet.color : undefined) ?? paintedTextColor(firstRun);
  if (color) span.style.color = color;
  span.style.pointerEvents = "none";
  span.style.userSelect = "none";
  span.textContent = label;
  return span;
}

export function applyRunStyle(
  span: HTMLSpanElement,
  run: TextRun,
  fontPxScale: number,
  geomScale: number,
  fallbackFs: number,
): void {
  if (run.fontFamily) span.style.fontFamily = run.fontFamily;
  const fs = run.fontSize ?? fallbackFs;
  // §21.1.2.3.7 rPr@baseline — 上下标：字号按 1−|baseline|（上限 0.5）缩小，
  // 基线上移 baseline × fs。与 svg-backend 的 dy + reduced font-size 完全一致。
  //
  // 位移**必须**用 position:relative 而不是 vertical-align：`vertical-align:<length>`
  // 会把被抬高的 inline box 算进行盒高度，整段因此比 renderer 高十几 px，后续段落
  // 全部往下漂（renderer 侧的 tspan@dy 只挪字形，行高只取 run.fontSize）。
  // relative 位移是纯视觉的，不参与行盒计算，才和 dy 等价。
  const baseline = typeof run.baseline === "number" ? run.baseline : 0;
  if (baseline !== 0) {
    span.style.fontSize = `${fs * (1 - Math.min(0.5, Math.abs(baseline))) * fontPxScale}px`;
    span.style.position = "relative";
    span.style.top = `${-baseline * fs * fontPxScale}px`;
  } else if (run.fontSize !== undefined) {
    span.style.fontSize = `${fs * fontPxScale}px`;
  }
  if (run.fontWeight !== undefined) {
    span.style.fontWeight =
      typeof run.fontWeight === "number" ? String(run.fontWeight) : run.fontWeight;
  }
  if (run.italic) span.style.fontStyle = "italic";
  else if (run.italic === false) span.style.fontStyle = "normal";

  const underline = !!run.underline;
  const decorations: string[] = [];
  if (underline) decorations.push("underline");
  if (run.strikethrough && run.strikethrough !== "none") decorations.push("line-through");
  if (decorations.length) {
    span.style.textDecorationLine = decorations.join(" ");
    // §21.1.2.3.9 u="double|dotted|dashed|wavy" → text-decoration-style 同名值。
    const uStyle =
      typeof run.underline === "string" && run.underline !== "single" ? run.underline : undefined;
    if (uStyle) span.style.textDecorationStyle = uStyle;
    else if (run.strikethrough === "double") span.style.textDecorationStyle = "double";
    if (run.underlineColor) span.style.textDecorationColor = run.underlineColor;
  }
  const painted = paintedTextColor(run);
  if (painted) span.style.color = painted;
  // §21.1.2.3.9 rPr@spc — renderer 把 letterSpacing 当 **px**（layout 里按
  // `ls * charCount` 累加宽度、SVG letter-spacing 也是 user unit）。之前 overlay
  // 写成 `em` → 字距被放大成字号的倍数，整行明显变宽。
  if (run.letterSpacing) span.style.letterSpacing = `${run.letterSpacing * fontPxScale}px`;
  if (run.caps === "all") span.style.textTransform = "uppercase";
  else if (run.caps === "small") span.style.fontVariant = "small-caps";
  if (run.highlight) span.style.backgroundColor = run.highlight;
  const outline = strokeToCssColor(run.textOutline);
  if (outline && run.textOutline?.width) {
    (span.style as CSSStyleDeclaration & { webkitTextStroke?: string }).webkitTextStroke =
      `${run.textOutline.width * geomScale}px ${outline}`;
  }
  const fx = textEffectsCssFilter(run.effects, geomScale);
  if (fx) span.style.filter = fx;
}

/**
 * §21.1.2.1.1 normAutofit 的运行时缩放：文字排不下时 renderer 会迭代缩小字号
 * （下限 25%，溢出 5% 以内视为测量误差不动）。overlay 直接用浏览器布局测高，
 * 按同样的规则重排，避免"渲染时是缩小后的字号、双击后弹回原始大字号"。
 *
 * 必须在 overlay 已插入文档（有布局）之后调用。返回最终采用的 fontScale。
 */
export function fitOverlayAutofit(
  editor: HTMLElement,
  s: TextShape,
  scale: number,
  doc: Document,
): number {
  if (isVerticalStack(s.vert) || s.autoFit?.kind !== "normAutofit" || s.paragraphs.length === 0) return 1;
  const box = textOverlayBox(s, scale);
  const innerH = box.height - box.pad.t - box.pad.b;
  if (innerH <= 0) return 1;
  const measure = (): number => {
    let h = 0;
    for (const child of Array.from(editor.children)) {
      if (child.getAttribute?.(BULLET_ATTR)) continue;
      h += (child as HTMLElement).offsetHeight ?? 0;
    }
    return h;
  };
  const base = measure();
  if (!Number.isFinite(base) || base <= innerH * 1.05) return 1;
  let fontScale = Math.max(0.25, innerH / base);
  renderParagraphsInto(editor, s, scale, doc, fontScale);
  for (let i = 0; i < 3; i++) {
    const h = measure();
    if (h <= innerH || fontScale <= 0.25) break;
    fontScale = Math.max(0.25, fontScale * (innerH / h));
    renderParagraphsInto(editor, s, scale, doc, fontScale);
  }
  return fontScale;
}

/**
 * 让 overlay 每段的**首行基线**落到 renderer 算出的同一位置。
 *
 *   renderer：baseline = 段顶 + (行高 − 0.25 × fs)   （text-layout.ts 的 ascent 近似）
 *   CSS：     baseline = 段顶 + half-leading + 字体 ascent（取决于字体真实 metrics）
 *
 * 两者相差 1~2px —— 双击进入编辑时文字会"跳一下"。这里用零尺寸 inline-block 探针
 * 量出 CSS 的实际基线，再用 `position:relative; top` 做**纯视觉**补偿：不改变布局盒
 * 尺寸，所以 vAlign top/middle/bottom 与后续段落的堆叠位置都不受影响。
 *
 * 必须在 overlay 已插入文档、且 fitOverlayAutofit 重排完之后调用。
 */
export function alignOverlayBaselines(
  editor: HTMLElement,
  s: TextShape,
  scale: number,
  doc: Document,
  fontScale = 1,
): void {
  if (isVerticalStack(s.vert)) return;
  const paras = Array.from(editor.children) as HTMLElement[];
  const px = scale * fontScale;
  for (let i = 0; i < paras.length; i++) {
    const p = s.paragraphs[i];
    const div = paras[i];
    if (!p || !div) continue;
    const baseFs = paragraphFallbackFontSize(p);
    const expected = (paragraphLineHeightPx(p, baseFs) - 0.25 * baseFs) * px;
    const probe = doc.createElement("span");
    probe.style.cssText = "display:inline-block;width:0;height:0;vertical-align:baseline";
    div.insertBefore(probe, div.firstChild);
    // 零高度 inline-block 的底边就坐在基线上。
    const measured = probe.getBoundingClientRect().bottom - div.getBoundingClientRect().top;
    probe.remove();
    if (!Number.isFinite(measured) || measured <= 0) continue;
    const delta = expected - measured;
    // 只做亚行高级别的微调。量出离谱的值（字体还没加载完、或无布局环境）宁可不动，
    // 否则补偿本身会变成新的"文字乱跳"。
    if (Math.abs(delta) > paragraphLineHeightPx(p, baseFs) * px * 0.5) continue;
    div.style.position = "relative";
    div.style.top = `${delta}px`;
  }
}

/**
 * 把光标放进 overlay：优先落在鼠标双击的那个字符位置（原生文本框的手感），
 * 拿不到命中点时折叠到文末。
 *
 * 不做全选：全选会给整段文字盖一层选区高亮（视觉上"文字变了"），而且用户接着
 * 敲第一个字就会把整段内容替换掉。
 */
export function placeCaretIn(
  editor: HTMLElement,
  doc: Document,
  at?: { clientX: number; clientY: number },
): void {
  const sel = doc.defaultView?.getSelection();
  if (!sel) return;
  type CaretDoc = Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  };
  const cdoc = doc as CaretDoc;
  let range: Range | null = null;
  if (at) {
    if (typeof cdoc.caretRangeFromPoint === "function") {
      range = cdoc.caretRangeFromPoint(at.clientX, at.clientY);
    } else if (typeof cdoc.caretPositionFromPoint === "function") {
      const pos = cdoc.caretPositionFromPoint(at.clientX, at.clientY);
      if (pos) {
        range = doc.createRange();
        range.setStart(pos.offsetNode, pos.offset);
        range.collapse(true);
      }
    }
    // 命中点可能落在 overlay 之外（点在内边距上、或被其它元素接住）→ 退化到文末。
    if (range && !editor.contains(range.startContainer)) range = null;
  }
  if (!range) {
    range = doc.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
  }
  sel.removeAllRanges();
  sel.addRange(range);
}

/**
 * 从 overlay 读回段落纯文本。
 *
 * bullet 是我们注入的展示元素（不是用户文本），读之前必须摘掉再放回 —— innerText
 * 走渲染文本，绝对定位的 bullet 也会被算进去，否则每次提交都会把 "•" / "1." 追加
 * 到正文里，反复编辑就变成 "1.1.1.标题"。
 */
function textNodesIn(para: HTMLElement): Text[] {
  const out: Text[] = [];
  const walk = (node: Node): void => {
    if (node instanceof Element && node.hasAttribute(BULLET_ATTR)) return;
    if (node.nodeType === 3) {
      out.push(node as Text);
      return;
    }
    for (const child of Array.from(node.childNodes)) walk(child);
  };
  walk(para);
  return out;
}

function locateOffset(editor: HTMLElement, container: Node, offset: number): { paragraph: number; index: number } | null {
  const paras = Array.from(editor.children) as HTMLElement[];
  for (let pi = 0; pi < paras.length; pi++) {
    const para = paras[pi]!;
    const nodes = textNodesIn(para);
    let index = 0;
    for (const node of nodes) {
      if (node === container) return { paragraph: pi, index: index + offset };
      index += node.data.length;
    }
    if (container === para) {
      let childIndex = 0;
      let charIndex = 0;
      for (const node of nodes) {
        if (childIndex === offset) return { paragraph: pi, index: charIndex };
        childIndex += 1;
        charIndex += node.data.length;
      }
      return { paragraph: pi, index: charIndex };
    }
  }
  return null;
}

/** 把编辑框里的非折叠选区换成段落内的字符区间。竖排堆叠不拆。 */
export function textCharRangesFromSelection(editor: HTMLElement, sel: Selection): TextCharRange[] | null {
  if (editor.hasAttribute(STACK_ATTR) || sel.rangeCount === 0 || sel.isCollapsed) return null;
  const range = sel.getRangeAt(0);
  if (!editor.contains(range.startContainer) || !editor.contains(range.endContainer)) return null;
  const start = locateOffset(editor, range.startContainer, range.startOffset);
  const end = locateOffset(editor, range.endContainer, range.endOffset);
  if (!start || !end) return null;
  const forward = start.paragraph < end.paragraph || (start.paragraph === end.paragraph && start.index <= end.index);
  const from = forward ? start : end;
  const to = forward ? end : start;
  const paras = Array.from(editor.children) as HTMLElement[];
  const out: TextCharRange[] = [];
  for (let pi = from.paragraph; pi <= to.paragraph; pi++) {
    const para = paras[pi];
    if (!para) continue;
    const length = textNodesIn(para).reduce((sum, node) => sum + node.data.length, 0);
    const a = pi === from.paragraph ? from.index : 0;
    const b = pi === to.paragraph ? to.index : length;
    if (b > a) out.push({ paragraph: pi, start: a, end: b });
  }
  return out.length > 0 ? out : null;
}

function splitSpanAt(span: HTMLElement, local: number): void {
  const text = span.firstChild;
  if (!text || text.nodeType !== 3) return;
  const data = text as Text;
  if (local <= 0 || local >= data.data.length) return;
  const rest = data.splitText(local);
  const clone = span.cloneNode(false) as HTMLElement;
  clone.appendChild(rest);
  span.after(clone);
}

/** 拖动取色时只给选区里的字上色，不改模型。 */
export function paintEditorRangeColor(editor: HTMLElement, ranges: readonly TextCharRange[], color: string): void {
  if (editor.hasAttribute(STACK_ATTR)) return;
  const paras = Array.from(editor.children) as HTMLElement[];
  for (const range of ranges) {
    const para = paras[range.paragraph];
    if (!para) continue;
    for (const cut of [range.end, range.start]) {
      const nodes = textNodesIn(para);
      let index = 0;
      for (const node of nodes) {
        const local = cut - index;
        const span = node.parentElement;
        if (span && local > 0 && local < node.data.length) {
          splitSpanAt(span, local);
          break;
        }
        index += node.data.length;
      }
    }
    let index = 0;
    for (const node of textNodesIn(para)) {
      const next = index + node.data.length;
      if (next > range.start && index < range.end && node.parentElement) node.parentElement.style.color = color;
      index = next;
    }
  }
}

function pointAt(editor: HTMLElement, paragraph: number, index: number): { node: Text; offset: number } | null {
  const para = editor.children[paragraph] as HTMLElement | undefined;
  if (!para) return null;
  let cursor = 0;
  const nodes = textNodesIn(para);
  for (const node of nodes) {
    const next = cursor + node.data.length;
    if (index <= next) return { node, offset: index - cursor };
    cursor = next;
  }
  const last = nodes[nodes.length - 1];
  if (!last) return null;
  return { node: last, offset: last.data.length };
}

export function selectTextCharRanges(editor: HTMLElement, ranges: readonly TextCharRange[]): void {
  const sel = editor.ownerDocument.getSelection();
  if (!sel || ranges.length === 0) return;
  const first = ranges[0]!;
  const last = ranges[ranges.length - 1]!;
  const start = pointAt(editor, first.paragraph, first.start);
  const end = pointAt(editor, last.paragraph, last.end);
  if (!start || !end) return;
  const range = editor.ownerDocument.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);
  sel.removeAllRanges();
  sel.addRange(range);
}

const CHAR_SELECTION_HIGHLIGHT = "ppt-char-selection";
const CHAR_SELECTION_STYLE_ID = "ppt-char-selection-style";
const CHAR_SELECTION_MARK = "data-ppt-char-sel";
const CHAR_SELECTION_COLOR = "rgba(10, 132, 255, 0.35)";

interface HighlightRegistryLike {
  set(name: string, highlight: object): void;
  delete(name: string): void;
}

function highlightApi(doc: Document): {
  Highlight: new (...ranges: Range[]) => object;
  highlights: HighlightRegistryLike;
} | null {
  const view = doc.defaultView as
    | (Window & {
        Highlight?: new (...ranges: Range[]) => object;
        CSS?: { highlights?: HighlightRegistryLike };
      })
    | null;
  if (!view?.Highlight || !view.CSS?.highlights) return null;
  return { Highlight: view.Highlight, highlights: view.CSS.highlights };
}

function ensureCharSelectionStyle(doc: Document): void {
  if (doc.getElementById(CHAR_SELECTION_STYLE_ID)) return;
  const style = doc.createElement("style");
  style.id = CHAR_SELECTION_STYLE_ID;
  // 焦点在字号或字体框时，浏览器不画 contenteditable 的 ::selection。
  style.textContent =
    `::highlight(${CHAR_SELECTION_HIGHLIGHT}){background-color:${CHAR_SELECTION_COLOR}}`;
  (doc.head ?? doc.documentElement).appendChild(style);
}

function rangesForPinnedSelection(editor: HTMLElement, ranges: readonly TextCharRange[]): Range[] {
  const doc = editor.ownerDocument;
  const live: Range[] = [];
  for (const range of ranges) {
    if (range.end <= range.start) continue;
    const start = pointAt(editor, range.paragraph, range.start);
    const end = pointAt(editor, range.paragraph, range.end);
    if (!start || !end) continue;
    const dom = doc.createRange();
    dom.setStart(start.node, start.offset);
    dom.setEnd(end.node, end.offset);
    live.push(dom);
  }
  return live;
}

function clearSpanSelection(doc: Document): void {
  for (const el of Array.from(doc.querySelectorAll(`[${CHAR_SELECTION_MARK}]`))) {
    if (!(el instanceof HTMLElement)) continue;
    const saved = el.getAttribute(CHAR_SELECTION_MARK) ?? "";
    const splitAt = saved.indexOf("\n");
    el.style.backgroundColor = splitAt >= 0 ? saved.slice(0, splitAt) : "";
    el.style.color = splitAt >= 0 ? saved.slice(splitAt + 1) : "";
    el.removeAttribute(CHAR_SELECTION_MARK);
  }
}

function paintSpanSelection(editor: HTMLElement, ranges: readonly TextCharRange[]): void {
  const doc = editor.ownerDocument;
  clearSpanSelection(doc);
  if (editor.hasAttribute(STACK_ATTR)) return;
  const paras = Array.from(editor.children) as HTMLElement[];
  for (const range of ranges) {
    const para = paras[range.paragraph];
    if (!para || range.end <= range.start) continue;
    for (const cut of [range.end, range.start]) {
      const nodes = textNodesIn(para);
      let index = 0;
      for (const node of nodes) {
        const local = cut - index;
        const span = node.parentElement;
        if (span && local > 0 && local < node.data.length) {
          splitSpanAt(span, local);
          break;
        }
        index += node.data.length;
      }
    }
    let index = 0;
    for (const node of textNodesIn(para)) {
      const next = index + node.data.length;
      const span = node.parentElement;
      if (next > range.start && index < range.end && span && span !== para && !span.hasAttribute(CHAR_SELECTION_MARK)) {
        span.setAttribute(CHAR_SELECTION_MARK, `${span.style.backgroundColor}\n${span.style.color}`);
        span.style.backgroundColor = CHAR_SELECTION_COLOR;
      }
      index = next;
    }
  }
}

/**
 * 字符选区的底色。编辑框没有焦点时系统选中色不画，字号和字体框却必须留着焦点，
 * 所以这里另画一层，不跟着焦点走。编辑框自己有焦点时不要调用，避免和系统选中色叠两层。
 */
export function paintPinnedCharSelection(editor: HTMLElement, ranges: readonly TextCharRange[]): void {
  const doc = editor.ownerDocument;
  clearPinnedCharSelection(doc);
  if (ranges.length === 0 || editor.hasAttribute(STACK_ATTR)) return;
  const api = highlightApi(doc);
  if (!api) {
    paintSpanSelection(editor, ranges);
    return;
  }
  const live = rangesForPinnedSelection(editor, ranges);
  if (live.length === 0) return;
  ensureCharSelectionStyle(doc);
  api.highlights.set(CHAR_SELECTION_HIGHLIGHT, new api.Highlight(...live));
  // 系统选区还在时，Chrome 不画这层底色，即使编辑框已经没有焦点。
  // 字符区间记在编辑状态里，不靠这层选区。
  const sel = doc.getSelection();
  if (sel && !sel.isCollapsed && sel.anchorNode && editor.contains(sel.anchorNode)) sel.removeAllRanges();
}

export function clearPinnedCharSelection(doc: Document): void {
  highlightApi(doc)?.highlights.delete(CHAR_SELECTION_HIGHLIGHT);
  clearSpanSelection(doc);
}

export function readEditorParagraphs(editor: HTMLElement): string[] {
  const bullets = Array.from(editor.querySelectorAll(`[${BULLET_ATTR}]`)).map((el) => ({
    el,
    parent: el.parentNode,
    next: el.nextSibling,
  }));
  for (const b of bullets) b.el.remove();
  let raw: string;
  try {
    if (editor.hasAttribute(STACK_ATTR)) {
      const kids = Array.from(editor.children) as HTMLElement[];
      const lines = kids.map((el) => el.textContent ?? "");
      return lines.length === 0 ? [""] : lines;
    }
    raw = plainTextOf(editor);
  } finally {
    for (const b of bullets) b.parent?.insertBefore(b.el, b.next);
  }
  const trimmed = raw!.endsWith("\n") ? raw!.slice(0, -1) : raw!;
  if (trimmed.length === 0) return [""];
  return trimmed.split(/\r?\n/);
}

// innerText 在浏览器里已把块级 / <br> 规范成 \n，是最贴近"用户看到的行"的读法。
// jsdom 等无布局环境没有 innerText，退化成按块级子节点拼行（测试用）。
function plainTextOf(editor: HTMLElement): string {
  const native = (editor as HTMLElement & { innerText?: string }).innerText;
  if (typeof native === "string") return native;
  const lines: string[] = [];
  const walkBlock = (el: Element): void => {
    const parts: string[] = [];
    for (const node of Array.from(el.childNodes)) {
      if (node.nodeType === 3) parts.push(node.nodeValue ?? "");
      else if (node.nodeName === "BR") parts.push("");
      else if (node.nodeType === 1) parts.push((node as Element).textContent ?? "");
    }
    lines.push(parts.join(""));
  };
  for (const child of Array.from(editor.children)) walkBlock(child);
  if (lines.length === 0) lines.push(editor.textContent ?? "");
  return lines.join("\n");
}

function hasAnyText(p: TextParagraph): boolean {
  for (const r of p.runs) if (r.text && r.text !== "") return true;
  return false;
}

function solidCss(color: string, alpha?: number): string {
  return alpha !== undefined && alpha < 1 ? hexWithAlpha(color, alpha) : color;
}

function strokeToCssColor(stroke: Stroke | undefined): string | undefined {
  if (!stroke) return undefined;
  const paint = stroke.paint;
  if (!paint || paint.kind !== "solid") return undefined;
  return solidCss(paint.color, paint.alpha);
}

interface CssBackground {
  background: string;
  backgroundSize?: string;
  backgroundPosition?: string;
  backgroundRepeat?: string;
}

/**
 * Paint → CSS background。text frame 的 fill 绝大多数是 solid（表格单元格、
 * placeholder 底色、callout 框），渐变 / 图片按近似映射，pattern 等退化为透明。
 * OOXML 的 linear angle 以"从左到右 = 0°、顺时针为正"计，CSS `linear-gradient`
 * 的 0deg 是"从下往上"，两者相差 90°。
 */
function paintToCssBackground(paint: Paint | undefined): CssBackground {
  if (!paint || paint.kind === "none") return { background: "transparent" };
  if (paint.kind === "solid") return { background: solidCss(paint.color, paint.alpha) };
  if (paint.kind === "linear") {
    const stops = paint.stops
      .map((st) => `${solidCss(st.color, st.alpha)} ${Math.round(st.offset * 100)}%`)
      .join(", ");
    return { background: `linear-gradient(${paint.angle + 90}deg, ${stops})` };
  }
  if (paint.kind === "radial") {
    const stops = paint.stops
      .map((st) => `${solidCss(st.color, st.alpha)} ${Math.round(st.offset * 100)}%`)
      .join(", ");
    return { background: `radial-gradient(circle, ${stops})` };
  }
  if (paint.kind === "image") {
    return {
      background: `url("${paint.src}")`,
      backgroundSize:
        paint.fit === "contain" ? "contain" : paint.fit === "tile" ? "auto" : "cover",
      backgroundPosition: "center",
      backgroundRepeat: paint.fit === "tile" ? "repeat" : "no-repeat",
    };
  }
  return { background: "transparent" };
}

// ----------------------------------------------------------------------------
// 已知未镜像项（编辑期视觉近似，提交后由 renderer 输出权威外观）：
//   - 横排 numCol / rtlCol 多栏：overlay 始终单栏（竖排堆叠的 spcCol / 折列已镜像）。
//   - 逐行行高：renderer 按每个 visual line 的最大字号算行高，overlay 按段落最大
//     字号统一算（同段内混排差异极大的字号时会有几 px 偏差）。
//   - tabStops、prstTxWarp、run.fill 渐变字、picture bullet、vertOverflow=ellipsis 的省略号。
//   - 自身 flipH/flipV 的字形反镜像（祖先 group 的翻转已由 overlayWorldTransformCss
//     处理；叶子自身的翻转仍不镜像，提交后由 renderer 输出权威外观）。
// 新增渲染特性时，如果它会改变"文字看起来的样子"，要回头在这里补上映射，
// 否则又会出现"双击进入编辑样式变了"的回归。
// ----------------------------------------------------------------------------
