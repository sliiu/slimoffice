// 从 Slide.ooxmlTiming 派生 "初始 hide / 段落级 hide" 状态。
//
// 背景：parser 在解析 PPTX 时，会扫描 entrance preset 的目标，把对应 shape.opacity
// 设 0、或把段落/字符 range 写入 slide.initialParaOverrides / initialCharOverrides。
// 渲染层渲染时按这些"初始 hide"展现，等动画 fire 才把它们恢复可见——这是 PowerPoint
// "hidden until entrance" 行为。
//
// 但 parser 这一步只发生在解析阶段。编辑器里用户后续 add / remove entrance 动画时，
// shape.opacity 与 initialOverrides 不会自动跟随更新；如果不再处理，新增的入场动画
// 在播放时不会有视觉效果（shape 一直可见 → "动画无效"）。
//
// 这里把该逻辑做成纯函数，与 parser 算法保持一致（hasVisibleBaseFill / _text 子形状
// 路径 / iterate 切片等关键细节），供 editor 在 destroy / 进入放映前调用。

import { ooxml } from "@ppt/animation";
import type {
  InitialCharRangeOverride,
  InitialParaOverride,
  Slide,
} from "./slide";
import type { Shape, TextShape } from "./shape";

export interface InitialEntranceState {
  // 整 shape 需要 opacity=0 的目标（image / 无文字 group / 带可见 base fill 的文本框）。
  hiddenShapes: Set<Shape>;
  // 文本段落 / 字符 range hide（写入 Slide.initialParaOverrides / initialCharOverrides）。
  paraOverrides: InitialParaOverride[];
  charOverrides: InitialCharRangeOverride[];
}

/**
 * 扫描 slide.ooxmlTiming 中的 entrance preset 目标，按与 parser 相同的算法
 * 决定哪些 shape 需要整体 hide、哪些段落/字符 range 需要 hide。
 *
 * 不修改 slide；调用方决定如何 apply（见 applyInitialEntranceState）。
 */
export function computeInitialEntranceState(slide: Slide): InitialEntranceState {
  const empty: InitialEntranceState = {
    hiddenShapes: new Set(),
    paraOverrides: [],
    charOverrides: [],
  };
  if (!slide.ooxmlTiming) return empty;
  const shapeIndex = buildShapeIndex(slide);

  const textSlicesFor = (
    spid: string,
    kind: "el" | "wd" | "lt",
  ): Array<{ pRg?: { st: number; end: number }; charRg?: { st: number; end: number } }> | null => {
    const paras = findTextParagraphs(shapeIndex, spid);
    if (!paras) return null;
    if (kind === "el") return paras.map((_, i) => ({ pRg: { st: i, end: i } }));
    const out: Array<{ pRg?: { st: number; end: number }; charRg?: { st: number; end: number } }> = [];
    for (let p = 0; p < paras.length; p++) {
      const txt = paras[p]!.runs.map((r) => r.text ?? "").join("");
      if (kind === "wd") {
        let i = 0;
        while (i < txt.length) {
          while (i < txt.length && /\s/.test(txt[i]!)) i++;
          if (i >= txt.length) break;
          const st = i;
          if (isCjkChar(txt[i]!)) i++;
          else while (i < txt.length && !/\s/.test(txt[i]!) && !isCjkChar(txt[i]!)) i++;
          if (i > st) out.push({ pRg: { st: p, end: p }, charRg: { st, end: i } });
        }
      } else {
        for (let c = 0; c < txt.length; ) {
          const cp = txt.codePointAt(c)!;
          const step = cp > 0xffff ? 2 : 1;
          out.push({ pRg: { st: p, end: p }, charRg: { st: c, end: c + step } });
          c += step;
        }
      }
    }
    return out;
  };

  const sliceMap = new Map<
    string,
    { whole: boolean; paras: Set<number>; charRgs: Array<{ paraIdx: number; st: number; end: number }> }
  >();
  const ensure = (spid: string): { whole: boolean; paras: Set<number>; charRgs: Array<{ paraIdx: number; st: number; end: number }> } => {
    let v = sliceMap.get(spid);
    if (!v) {
      v = { whole: false, paras: new Set(), charRgs: [] };
      sliceMap.set(spid, v);
    }
    return v;
  };
  for (const t of ooxml.collectEntranceTargets(slide.ooxmlTiming, { getTextSlices: textSlicesFor })) {
    const slot = ensure(t.spid);
    if (t.paraRange && !t.charRange) {
      for (let p = t.paraRange.st; p <= t.paraRange.end; p++) slot.paras.add(p);
    } else if (t.charRange) {
      const paraIdx = t.paraRange?.st ?? 0;
      slot.charRgs.push({ paraIdx, st: t.charRange.st, end: t.charRange.end });
    } else {
      slot.whole = true;
    }
  }

  const hiddenShapes = new Set<Shape>();
  const paraOverrides: InitialParaOverride[] = [];
  const charOverrides: InitialCharRangeOverride[] = [];
  for (const [spid, info] of sliceMap) {
    const baseId = `sp_${spid}`;
    const hasFineGrained = info.paras.size > 0 || info.charRgs.length > 0;
    const baseShape = shapeIndex.get(baseId);
    if (info.whole && !hasFineGrained) {
      if (baseShape) hiddenShapes.add(baseShape);
      continue;
    }
    // 与 parser 一致：段落级 entrance 若 group 自带可见 base fill（如蓝色按钮），
    // 必须整体 hide，否则 base 一开始就会显示出来。
    if (baseShape && hasVisibleBaseFill(shapeIndex, baseId)) {
      hiddenShapes.add(baseShape);
    }
    let shapeId = baseId;
    if (!shapeIndex.has(shapeId)) continue;
    if (baseShape?.kind === "group" && shapeIndex.has(`${baseId}_text`)) {
      shapeId = `${baseId}_text`;
    }
    for (const paraIdx of info.paras) {
      paraOverrides.push({ shapeId, paraIdx, opacity: 0 });
    }
    for (const r of info.charRgs) {
      charOverrides.push({
        shapeId,
        paraIdx: r.paraIdx,
        unit: "char",
        start: r.st,
        end: r.end,
        opacity: 0,
      });
    }
  }
  return { hiddenShapes, paraOverrides, charOverrides };
}

/**
 * 把 computeInitialEntranceState 的结果写回 slide：
 *   - 列入 hiddenShapes 的 shape：opacity 置 0；
 *   - paraOverrides / charOverrides：覆盖原值（length=0 则置 undefined 与 parser 行为一致）。
 *
 * 注意：除了 hiddenShapes 之外的 shape 不会被本函数主动改回 opacity=1，
 * 调用方需自行确保"被 user 删除入场动画的 shape"先恢复可见再调用（见 editor.destroy）。
 */
export function applyInitialEntranceState(slide: Slide, state: InitialEntranceState): void {
  for (const s of state.hiddenShapes) s.opacity = 0;
  slide.initialParaOverrides = state.paraOverrides.length ? state.paraOverrides : undefined;
  slide.initialCharOverrides = state.charOverrides.length ? state.charOverrides : undefined;
}

function buildShapeIndex(slide: Slide): Map<string, Shape> {
  const map = new Map<string, Shape>();
  const walk = (s: Shape): void => {
    if (!map.has(s.id)) map.set(s.id, s);
    if (s.kind === "group") for (const c of s.children) walk(c);
  };
  for (const layer of slide.layers) for (const s of layer.shapes) walk(s);
  return map;
}

function findTextParagraphs(shapeIndex: Map<string, Shape>, spid: string): TextShape["paragraphs"] | null {
  const baseId = `sp_${spid}`;
  const candidate = shapeIndex.get(`${baseId}_text`) ?? shapeIndex.get(baseId);
  if (!candidate) return null;
  if (candidate.kind === "text") return candidate.paragraphs;
  if (candidate.kind === "group") {
    const stack: Shape[] = [...candidate.children];
    while (stack.length) {
      const cur = stack.pop()!;
      if (cur.kind === "text") return cur.paragraphs;
      if (cur.kind === "group") stack.push(...cur.children);
    }
  }
  return null;
}

function hasVisibleBaseFill(shapeIndex: Map<string, Shape>, baseId: string): boolean {
  const candidate = shapeIndex.get(`${baseId}_base`) ?? shapeIndex.get(baseId);
  if (!candidate) return false;
  const fill = (candidate as unknown as { fill?: { kind?: string } | null }).fill;
  if (!fill) return false;
  if (fill.kind === "none") return false;
  return true;
}

// 与 parser 一致：PowerPoint by-word 把 CJK / 假名 / 全角符号 视作每字独立词。
function isCjkChar(ch: string): boolean {
  const cp = ch.codePointAt(0);
  if (cp === undefined) return false;
  return (
    (cp >= 0x2e80 && cp <= 0x303f) ||
    (cp >= 0x3040 && cp <= 0x30ff) ||
    (cp >= 0x3400 && cp <= 0x4dbf) ||
    (cp >= 0x4e00 && cp <= 0x9fff) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe30 && cp <= 0xfe4f) ||
    (cp >= 0xff00 && cp <= 0xffef) ||
    (cp >= 0x20000 && cp <= 0x2ffff)
  );
}
