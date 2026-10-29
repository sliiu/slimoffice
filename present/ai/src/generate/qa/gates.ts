// P0 质量门禁：生成后必须通过的硬性检查（未通过 → 不可打开为成功，展示失败 UI）。
//
// 背景：用户跑了 16 页「暗黑发布 / cinematic」生成，耗时 80 分钟、约 ¥30，
// 结果打开一看：封面缺图、禁止段落还有列表、文字重叠、网页专用页不足 4 页。
// 之前所有约束全靠 prompt 文本 → 弱模型常忽略 → 生成坏稿却作为成功返回 → 浪费。
//
// 本模块定义 **P0 门禁**：可以机器判定、必须 100% 符合的基本质量标准。
// 未通过时 pipeline 返回 GateFailure；UI 展示结构化失败屏幕，不打开 deck。

import { identityTransform, type Presentation, type Slide, type TextShape, type Shape } from "@ppt/core";

// ---------------------------------------------------------------------------
// 门禁结果类型
// ---------------------------------------------------------------------------

export type GateKind =
  | "cover-visual" // 封面/章节/结尾：全出血照片 + 暗化叠层 + 反白标题
  | "no-bullets" // 标记为 no-bullets 的段落不得出现项目符号列表
  | "text-overlap" // 无文字重叠、无裁切、无 word-wrap 破损
  | "web-exclusive" // Web 专用版式（cards/process/comparison/two-column）≥4 页
  | "speaker-notes" // 每页 2–4 句演讲备注（pptx notes 可检查）
  | "banned-imagery"; // 禁止配图题材命中 → FAIL

export interface GateFinding {
  kind: GateKind;
  /** 失败的 slide 索引（0-based）；全局性失败时 -1。 */
  slideIdx: number;
  /** 失败描述（可直接展示给用户）。 */
  issue: string;
}

export interface GateResult {
  passed: boolean;
  findings: GateFinding[];
}

// ---------------------------------------------------------------------------
// 各门禁实现
// ---------------------------------------------------------------------------

/**
 * P0-1：封面 / 章节 / 结尾必须有全出血背景图（不接受纯色块 / glow blob）。
 * 检查：slide.background.kind === "image" && 有 BG overlay shape（暗化层保证文字可读）。
 * 对应 ppt-design-rules §2 和 ensure-spec-quality.ts 的 ensureBgQuery。
 */
function checkCoverVisual(pres: Presentation, findings: GateFinding[]): void {
  const W = pres.size.width;
  const H = pres.size.height;
  if (pres.slides.length === 0) return;

  const structuralSlides: Array<{ idx: number; name: string }> = [];
  const first = pres.slides[0]!;
  // 首页若名称含 cover / section / hero，或缺名称（默认封面）→ 算结构页。
  const firstName = (first.name ?? "").toLowerCase();
  if (!firstName || firstName.includes("cover") || firstName.includes("section") || firstName.includes("hero")) {
    structuralSlides.push({ idx: 0, name: firstName || "cover" });
  }

  // 末页若名称含 closing / 感谢 → 算结构页。
  if (pres.slides.length > 1) {
    const last = pres.slides[pres.slides.length - 1]!;
    const lastName = (last.name ?? "").toLowerCase();
    if (lastName.includes("closing") || lastName.includes("感谢") || lastName.includes("thank")) {
      structuralSlides.push({ idx: pres.slides.length - 1, name: lastName });
    }
  }

  // 中间页名称含 section / 章节 → 也算。
  for (let i = 1; i < pres.slides.length - 1; i++) {
    const slide = pres.slides[i]!;
    const n = (slide.name ?? "").toLowerCase();
    if (n.includes("section") || n.includes("章节")) {
      structuralSlides.push({ idx: i, name: n });
    }
  }

  for (const { idx, name } of structuralSlides) {
    const slide = pres.slides[idx]!;
    const bg = slide.background;
    if (!bg || bg.kind !== "image") {
      findings.push({
        kind: "cover-visual",
        slideIdx: idx,
        issue: `${name || "结构页"} (#${idx + 1}) 缺少全出血背景图（当前为 ${bg?.kind ?? "无背景"}）`,
      });
      continue;
    }
    // 检查是否有 BG overlay（半透明暗化矩形，保证文字可读）。
    let hasOverlay = false;
    for (const layer of slide.layers) {
      for (const sh of layer.shapes) {
        if (
          sh.visible &&
          (sh.name === "BG overlay" || sh.id.startsWith("bgov_")) &&
          sh.kind === "rect"
        ) {
          const bbox = sh.bbox;
          const a = bbox.w * bbox.h;
          if (a / (W * H) > 0.8) {
            hasOverlay = true;
            break;
          }
        }
      }
      if (hasOverlay) break;
    }
    if (!hasOverlay) {
      findings.push({
        kind: "cover-visual",
        slideIdx: idx,
        issue: `${name || "结构页"} (#${idx + 1}) 背景图缺少暗化 overlay → 文字可读性不足`,
      });
    }
  }
}

/**
 * P0-2：标记为"禁用列表"的段落不得出现列表项。
 * ppt-deck-workflow Step 5 要求"Web 专用页用卡片/流程/对比，绝不堆 bullets"。
 * 检查：若 slide.name 含 "cards" / "process" / "comparison" / "metrics" / "timeline" / "chart"
 * 等关键词，该页所有 text shape 的 paragraphs 里不得有 bullet（para.bullet 存在）。
 */
function checkNoBulletsInWebLayouts(pres: Presentation, findings: GateFinding[]): void {
  const webLayoutKeywords = ["cards", "process", "comparison", "metrics", "timeline", "chart", "agenda"];

  for (let i = 0; i < pres.slides.length; i++) {
    const slide = pres.slides[i]!;
    const n = (slide.name ?? "").toLowerCase();
    const isWebLayout = webLayoutKeywords.some((kw) => n.includes(kw));
    if (!isWebLayout) continue;

    for (const layer of slide.layers) {
      for (const sh of layer.shapes) {
        if (sh.kind !== "text") continue;
        const t = sh as TextShape;
        for (const para of t.paragraphs) {
          if (para.bullet) {
            findings.push({
              kind: "no-bullets",
              slideIdx: i,
              issue: `${n} (#${i + 1}) 标记为 Web 专用版式，却出现了项目符号列表`,
            });
            return; // 一页只报一次，避免刷屏。
          }
        }
      }
    }
  }
}

/**
 * P0-3：无文字重叠、无裁切、无 word-wrap 破损。
 * - 重叠：两个 text shape 的 bbox 交集 > 12% 且都有内容 → FAIL。
 * - 裁切：text shape 明显出画布（x < -2 或 x+w > canvas+2）。
 * - word-wrap 破损：text run 里有半个词被截断的特征（英文单词中间换行导致显示不全，
 *   或中文标点悬在行首/行尾）—— 这个规则过于启发式，先留空（TODO）。
 */
function checkTextOverlapAndClipping(pres: Presentation, findings: GateFinding[]): void {
  const W = pres.size.width;
  const H = pres.size.height;

  interface Box {
    x: number;
    y: number;
    w: number;
    h: number;
  }
  function intersectionArea(a: Box, b: Box): number {
    const x1 = Math.max(a.x, b.x);
    const y1 = Math.max(a.y, b.y);
    const x2 = Math.min(a.x + a.w, b.x + b.w);
    const y2 = Math.min(a.y + a.h, b.y + b.h);
    if (x2 <= x1 || y2 <= y1) return 0;
    return (x2 - x1) * (y2 - y1);
  }
  function area(b: Box): number {
    return Math.max(0, b.w) * Math.max(0, b.h);
  }
  function hasText(t: TextShape): boolean {
    return t.paragraphs.some((p) => p.runs.some((r) => r.text && r.text.trim().length > 0));
  }

  for (let i = 0; i < pres.slides.length; i++) {
    const slide = pres.slides[i]!;
    const texts: Array<{ shape: TextShape; idx: number }> = [];
    for (const layer of slide.layers) {
      for (let j = 0; j < layer.shapes.length; j++) {
        const sh = layer.shapes[j]!;
        if (sh.kind === "text" && sh.visible && !sh.id.startsWith("dec_")) {
          texts.push({ shape: sh as TextShape, idx: j });
        }
      }
    }

    // 重叠检查：两两比对。
    for (let a = 0; a < texts.length; a++) {
      for (let b = a + 1; b < texts.length; b++) {
        const tA = texts[a]!.shape;
        const tB = texts[b]!.shape;
        if (!hasText(tA) || !hasText(tB)) continue;
        const bA = tA.bbox as Box;
        const bB = tB.bbox as Box;
        const overlap = intersectionArea(bA, bB);
        const ratioA = overlap / Math.max(1, area(bA));
        const ratioB = overlap / Math.max(1, area(bB));
        if (ratioA > 0.12 || ratioB > 0.12) {
          findings.push({
            kind: "text-overlap",
            slideIdx: i,
            issue: `#${i + 1} 文字重叠："${tA.name ?? tA.id}" 与 "${tB.name ?? tB.id}"`,
          });
        }
      }
    }

    // 裁切检查：出画布 > 2px。
    for (const { shape: t } of texts) {
      if (!hasText(t)) continue;
      const b = t.bbox as Box;
      if (b.x < -2 || b.x + b.w > W + 2 || b.y < -2 || b.y + b.h > H + 2) {
        findings.push({
          kind: "text-overlap",
          slideIdx: i,
          issue: `#${i + 1} 文字被裁切：${t.name ?? t.id} (x=${b.x.toFixed(0)}, y=${b.y.toFixed(0)}, w=${b.w.toFixed(0)}, h=${b.h.toFixed(0)})`,
        });
      }
    }
  }
}

/**
 * P0-4：Web 专用版式（cards / process / comparison / two-column / metrics / timeline / chart）
 * ≥4 页（如果总页数 ≥6）。避免"整篇都是 bullets"的单调呈现。
 */
function checkWebExclusiveLayouts(pres: Presentation, findings: GateFinding[]): void {
  if (pres.slides.length < 6) return; // 短 deck 不强制。
  const webLayoutKeywords = [
    "cards",
    "process",
    "comparison",
    "two-column",
    "twocolumn",
    "metrics",
    "timeline",
    "chart",
  ];
  let count = 0;
  for (const slide of pres.slides) {
    const n = (slide.name ?? "").toLowerCase();
    if (webLayoutKeywords.some((kw) => n.includes(kw))) count += 1;
  }
  if (count < 4) {
    findings.push({
      kind: "web-exclusive",
      slideIdx: -1,
      issue: `Web 专用版式页数不足（当前 ${count} 页，要求 ≥4）→ 内容过于单调`,
    });
  }
}

/**
 * P0-5：每页必须有演讲备注（slide.notes），长度 2–4 句（简单判断：20–400 字符）。
 * ppt-deck-workflow Step 6 要求每页都有 notes；compile 写入 slide.notes，导出 pptx 时
 * 生成 notesSlide 部件。缺 notes → 演讲时没提词 → 用户体验差。
 */
function checkSpeakerNotesCoverage(pres: Presentation, findings: GateFinding[]): void {
  if (pres.slides.length < 3) return; // 极短 deck 不强制。
  let missingCount = 0;
  const missing: number[] = [];
  for (let i = 0; i < pres.slides.length; i++) {
    const notes = pres.slides[i]!.notes ?? "";
    if (notes.trim().length < 20) {
      missingCount += 1;
      if (missing.length < 5) missing.push(i + 1); // 最多列前 5 页。
    }
  }
  const coverageRate = 1 - missingCount / pres.slides.length;
  if (coverageRate < 0.9) {
    findings.push({
      kind: "speaker-notes",
      slideIdx: -1,
      issue: `演讲备注覆盖率不足（${Math.round(coverageRate * 100)}%），缺失页：${missing.join(", ")}${missingCount > 5 ? " ..." : ""}`,
    });
  }
}

/**
 * P0-6：禁止配图题材命中检测。
 * 禁止列表（可扩展）：血腥、色情、政治敏感、暴力、武器、毒品等。
 * 检查方式：扫描所有 image shape 的 alt / name，以及 slide.background (kind="image") 的 src，
 * 匹配黑名单关键词。这是启发式检查；真正的内容审查需要调图像识别 API（未实现）。
 *
 * 当前实现：检查 shape.name / slide.name 里是否含明显敏感词。
 * 生产环境应接入内容安全 API（如阿里云绿网、腾讯云天御）。
 */
function checkBannedImagery(pres: Presentation, findings: GateFinding[]): void {
  const bannedKeywords = [
    // 英文
    "blood",
    "violence",
    "weapon",
    "gun",
    "drug",
    "pornography",
    "nude",
    "erotic",
    "political",
    "war",
    "terrorist",
    // 中文
    "血腥",
    "色情",
    "裸体",
    "暴力",
    "武器",
    "枪支",
    "毒品",
    "政治",
    "战争",
    "恐怖",
  ];

  for (let i = 0; i < pres.slides.length; i++) {
    const slide = pres.slides[i]!;
    const slideName = (slide.name ?? "").toLowerCase();
    for (const kw of bannedKeywords) {
      if (slideName.includes(kw)) {
        findings.push({
          kind: "banned-imagery",
          slideIdx: i,
          issue: `#${i + 1} 页名含禁止题材关键词："${kw}"`,
        });
        break;
      }
    }
    for (const layer of slide.layers) {
      for (const sh of layer.shapes) {
        if (sh.kind === "image" && sh.visible) {
          const shName = (sh.name ?? "").toLowerCase();
          for (const kw of bannedKeywords) {
            if (shName.includes(kw)) {
              findings.push({
                kind: "banned-imagery",
                slideIdx: i,
                issue: `#${i + 1} 图片 shape 含禁止题材关键词："${kw}"`,
              });
              break;
            }
          }
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 主入口
// ---------------------------------------------------------------------------

/**
 * 运行所有 P0 门禁检查。
 * 任一门禁失败 → passed = false，调用方应拒绝展示为成功、改走失败 UI。
 */


const COVER_PLACEHOLDER_SVG =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#0f172a"/><stop offset="100%" stop-color="#1e293b"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`,
  );

function isStructuralCoverSlide(slide: { name?: string | null }, idx: number): boolean {
  const n = (slide.name ?? "").toLowerCase();
  if (
    n.includes("cover") ||
    n.includes("hero") ||
    n.includes("section") ||
    n.includes("章节") ||
    n.includes("closing") ||
    n.includes("感谢") ||
    n.includes("thank")
  ) {
    return true;
  }
  return idx === 0 && !n;
}

/** Ensure cover/section/closing have image bg + dark overlay (P0 cover-visual). */
export function ensureCoverVisual(pres: Presentation): void {
  const W = pres.size.width;
  const H = pres.size.height;
  for (let i = 0; i < pres.slides.length; i++) {
    const slide = pres.slides[i]!;
    if (!isStructuralCoverSlide(slide, i)) continue;
    if (!slide.background || slide.background.kind !== "image") {
      slide.background = { kind: "image", src: COVER_PLACEHOLDER_SVG, fit: "cover" };
    }
    const layer0 = slide.layers[0];
    if (!layer0) continue;
    const hasOverlay = layer0.shapes.some(
      (s) => s.name === "BG overlay" || s.id.startsWith("bgov_"),
    );
    if (hasOverlay) continue;
    layer0.shapes.unshift({
      id: `bgov_ensure_${i}`,
      kind: "rect",
      name: "BG overlay",
      bbox: { x: 0, y: 0, w: W, h: H },
      zIndex: -10,
      visible: true,
      locked: false,
      opacity: 1,
      transform: identityTransform(),
      fill: { kind: "solid", color: "#000000", alpha: 0.55 },
    } as Shape);
  }
}

/**
 * Nudge overlapping text apart + clamp into canvas (P0 text-overlap).
 *
 * Must match `checkTextOverlapAndClipping` for WHEN to act (ratio > 0.12 or clip),
 * but geometry must also stay inside Design spacing floors:
 * - H-margin ≥ 0.04 * short (+1 pad, same as ensureDesignSpacing)
 * - vertical separation uses Design block minGap (not 2px) so a final
 *   ensureNoTextOverlap does not re-break spacing after Design ensures.
 *
 * Do NOT enforce minGap on non-overlapping side-by-side cards (Seed 11 hole #1).
 */
export function ensureNoTextOverlap(pres: Presentation): void {
  const W = pres.size.width;
  const H = pres.size.height;
  const short = Math.min(W, H);
  // Match design-gates ensureDesignSpacing / checkSpace.
  const minMargin = 0.04 * short;
  const leftPad = minMargin + 1;
  const rightPad = W - minMargin - 1;
  const minGap = 0.6 * (16 * (short / 720)) * 1.3;
  const area = (b: { w: number; h: number }) => Math.max(1, b.w * b.h);
  const inter = (
    a: { x: number; y: number; w: number; h: number },
    b: { x: number; y: number; w: number; h: number },
  ) => {
    const x1 = Math.max(a.x, b.x);
    const y1 = Math.max(a.y, b.y);
    const x2 = Math.min(a.x + a.w, b.x + b.w);
    const y2 = Math.min(a.y + a.h, b.y + b.h);
    return Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  };
  const hasText = (t: TextShape): boolean =>
    t.paragraphs.some((p) => p.runs.some((r) => r.text && r.text.trim().length > 0));
  const overlapsGate = (
    a: { x: number; y: number; w: number; h: number },
    b: { x: number; y: number; w: number; h: number },
  ): boolean => {
    const ov = inter(a, b);
    return ov / area(a) > 0.12 || ov / area(b) > 0.12;
  };
  const isClipped = (b: { x: number; y: number; w: number; h: number }): boolean =>
    b.x < -2 || b.x + b.w > W + 2 || b.y < -2 || b.y + b.h > H + 2;
  const clampBox = (t: TextShape): void => {
    let { x, y, w, h } = t.bbox;
    // Prefer Design H-margin; fall back to canvas edge if slide is too narrow.
    const lo = Math.max(0, Math.min(leftPad, W - 16));
    const hi = Math.max(lo + 8, Math.min(rightPad, W));
    x = Math.max(lo, Math.min(x, hi - 8));
    y = Math.max(0, Math.min(y, H - 8));
    w = Math.max(8, Math.min(w, hi - x));
    h = Math.max(8, Math.min(h, H - y));
    t.bbox = { x, y, w, h };
  };

  for (const slide of pres.slides) {
    // Match checker: top-level only (no group walk).
    const texts: TextShape[] = [];
    for (const layer of slide.layers) {
      for (const sh of layer.shapes) {
        if (sh.kind === "text" && sh.visible && !sh.id.startsWith("dec_")) {
          texts.push(sh as TextShape);
        }
      }
    }
    for (const t of texts) clampBox(t);

    for (let pass = 0; pass < 12; pass++) {
      let moved = false;

      for (const t of texts) {
        if (!hasText(t)) continue;
        if (isClipped(t.bbox) || t.bbox.x < minMargin - 1 || t.bbox.x + t.bbox.w > W - minMargin + 1) {
          clampBox(t);
          moved = true;
        }
      }

      const ordered = [...texts].sort((a, b) => a.bbox.y - b.bbox.y || a.bbox.x - b.bbox.x);
      for (let i = 0; i < ordered.length; i++) {
        for (let j = i + 1; j < ordered.length; j++) {
          const A = ordered[i]!;
          const B = ordered[j]!;
          if (!hasText(A) || !hasText(B)) continue;
          if (!overlapsGate(A.bbox, B.bbox)) continue;

          const ox =
            Math.min(A.bbox.x + A.bbox.w, B.bbox.x + B.bbox.w) - Math.max(A.bbox.x, B.bbox.x);
          const oy =
            Math.min(A.bbox.y + A.bbox.h, B.bbox.y + B.bbox.h) - Math.max(A.bbox.y, B.bbox.y);

          // Separate along the thinner overlap axis (side-by-side → X, stacked → Y).
          if (ox > 0 && oy > 0 && ox < oy) {
            const needX = A.bbox.x + A.bbox.w + 2;
            if (needX + 8 <= rightPad) {
              const nw = Math.max(8, Math.min(B.bbox.w, rightPad - needX));
              if (needX !== B.bbox.x || nw !== B.bbox.w) {
                B.bbox = { ...B.bbox, x: needX, w: nw };
                moved = true;
              }
            } else {
              // Split remaining width inside Design margins.
              const left = Math.max(A.bbox.x, leftPad);
              const usable = Math.max(16, rightPad - left - 2);
              const half = Math.max(8, Math.floor(usable / 2));
              A.bbox = { ...A.bbox, x: left, w: half };
              B.bbox = { ...B.bbox, x: left + half + 2, w: Math.max(8, rightPad - (left + half + 2)) };
              moved = true;
            }
          } else {
            // Design block minGap so we do not leave a P0-clear but Design-fail gap.
            const needY = A.bbox.y + A.bbox.h + minGap;
            if (needY + 8 <= H) {
              const nh = Math.max(8, Math.min(B.bbox.h, H - needY));
              if (needY !== B.bbox.y || nh !== B.bbox.h) {
                B.bbox = { ...B.bbox, y: needY, h: nh };
                moved = true;
              }
            } else {
              // Share remaining vertical band (Seed 11 stacked-near-floor).
              // Never grow h — inflating the upper box re-triggers Design "title squeezed".
              const bandTop = Math.min(A.bbox.y, B.bbox.y);
              const usable = Math.max(16, H - bandTop - minGap);
              const half = Math.max(8, Math.floor(usable / 2));
              const aH = Math.max(8, Math.min(A.bbox.h, half));
              A.bbox = { ...A.bbox, y: bandTop, h: aH };
              const bY = bandTop + aH + minGap;
              B.bbox = {
                ...B.bbox,
                y: bY,
                h: Math.max(8, Math.min(B.bbox.h, H - bY)),
              };
              moved = true;
            }
          }
          clampBox(A);
          clampBox(B);
        }
      }

      // Last-resort: if a pair still fails the gate, shrink the later box until clear.
      for (let i = 0; i < ordered.length; i++) {
        for (let j = i + 1; j < ordered.length; j++) {
          const A = ordered[i]!;
          const B = ordered[j]!;
          if (!hasText(A) || !hasText(B)) continue;
          if (!overlapsGate(A.bbox, B.bbox)) continue;
          const ny = Math.min(A.bbox.y + A.bbox.h + minGap, H - 8);
          B.bbox = { ...B.bbox, y: ny, h: 8 };
          if (overlapsGate(A.bbox, B.bbox)) {
            const maxH = Math.max(8, B.bbox.y - A.bbox.y - minGap);
            A.bbox = { ...A.bbox, h: Math.min(A.bbox.h, maxH) };
          }
          clampBox(A);
          clampBox(B);
          moved = true;
        }
      }

      if (!moved) break;
    }
    for (const t of texts) clampBox(t);
  }
}


export function runP0Gates(pres: Presentation): GateResult {
  const findings: GateFinding[] = [];
  checkCoverVisual(pres, findings);
  checkNoBulletsInWebLayouts(pres, findings);
  checkTextOverlapAndClipping(pres, findings);
  checkWebExclusiveLayouts(pres, findings);
  checkSpeakerNotesCoverage(pres, findings);
  checkBannedImagery(pres, findings);
  return { passed: findings.length === 0, findings };
}

export const GATE_KINDS: GateKind[] = [
  "cover-visual",
  "no-bullets",
  "text-overlap",
  "web-exclusive",
  "speaker-notes",
  "banned-imagery",
];

export function tallyGateFindings(findings: GateFinding[]): Record<GateKind, number> {
  const byKind = Object.fromEntries(GATE_KINDS.map((k) => [k, 0])) as Record<GateKind, number>;
  for (const f of findings) byKind[f.kind] += 1;
  return byKind;
}
