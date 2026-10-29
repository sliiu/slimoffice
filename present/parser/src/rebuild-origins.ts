// 缓存恢复后重建 round-trip 基线（__origin）。
//
// 背景：从 IndexedDB 恢复 Presentation 时，JSON 序列化丢掉了所有非可枚举属性。
// reattachPresentationSource 会把原始 archive 字节重新挂回 __source，让 writePptx 继续走
// round-trip surgical patch；但它**不会**恢复挂在每个 shape / run 上的 __origin 基线。
// 没有 __origin，serializer 的"改没改"判定退化为"present = dirty"，会把**未编辑**的文字 /
// 填充按显式样式重写（脚本拆分、继承字体、空段 endParaRPr 等解析期伪差异都会触发），
// 表现为"恢复会话后随便动一下就把别处文字 / 样式改坏"。
//
// 这里用 __source 里的原始字节**重新解析**出一份基线 Presentation（与首次打开同样带 __origin），
// 再按 shape id（文字按段/run 下标）把基线的 __origin 嫁接回恢复出来的（可能已编辑的）模型：
//   - 未编辑的 shape/run：origin == 当前值 → serializer 判定"没改" → 保留原始字节（幂等）。
//   - 已编辑的 shape/run：origin == 原始值、当前值已变 → 判定"改了" → 正常回写。
//   - 新增 shape（基线里没有同 id）：无 origin → 按显式写出（正确）。
// 即把"缓存恢复后的会话"拉回到与"刚打开文件"等价的 round-trip 基线状态。
import type {
  Presentation,
  Shape,
  Layer,
  SlideMaster,
  SlideLayout,
  Slide,
  SlideSource,
  SlideLikeSource,
} from "@ppt/core";
import { preserveOrigin } from "@ppt/core";
import { strFromU8 } from "fflate";
import { parseFromArchive } from "./parse";
import type { PptxArchive } from "./zip";

function normalizePath(p: string): string {
  let s = p.replace(/\\/g, "/");
  if (s.startsWith("/")) s = s.slice(1);
  return s;
}

// 用已解压的 part 字节 Map 直接构造 PptxArchive（无需重新打 zip）。与 zip.ts loadArchive
// 返回的访问器形态一致。
function buildArchiveFromFiles(files: Map<string, Uint8Array>): PptxArchive {
  const m = new Map<string, Uint8Array>();
  for (const [k, v] of files) m.set(normalizePath(k), v);
  return {
    files: m,
    getText: (p) => {
      const b = m.get(normalizePath(p));
      return b ? strFromU8(b) : undefined;
    },
    getBytes: (p) => m.get(normalizePath(p)),
    has: (p) => m.has(normalizePath(p)),
    list: (prefix) => {
      const ps = prefix ? normalizePath(prefix) : "";
      const out: string[] = [];
      for (const k of m.keys()) if (k.startsWith(ps)) out.push(k);
      return out;
    },
  };
}

type ShapeContainer = { layers?: Layer[]; shapes?: Shape[] };

function collectShapes(container: ShapeContainer): Shape[] {
  const out: Shape[] = [];
  const walk = (arr?: Shape[]): void => {
    if (!arr) return;
    for (const s of arr) {
      out.push(s);
      if (s.kind === "group") walk(s.children);
    }
  };
  if (Array.isArray(container.layers)) for (const l of container.layers) walk(l.shapes);
  if (Array.isArray(container.shapes)) walk(container.shapes);
  return out;
}

function graftShapeOrigin(target: Shape, base: Shape): void {
  preserveOrigin(target, base);
  // 文字 run 的 explicitRPr 基线：按段下标 + run 下标对齐。结构未变（未编辑文字）时逐一命中；
  // 文字被编辑导致 run 数变化时，错位的那几个 run 拿不到正确 origin，但它们本就是被编辑过的，
  // 至多多写一次，不影响未编辑内容。
  const tp = (target as { paragraphs?: Array<{ runs?: unknown[] }> }).paragraphs;
  const bp = (base as { paragraphs?: Array<{ runs?: unknown[] }> }).paragraphs;
  if (Array.isArray(tp) && Array.isArray(bp)) {
    for (let p = 0; p < tp.length && p < bp.length; p++) {
      const tr = tp[p]?.runs;
      const br = bp[p]?.runs;
      if (Array.isArray(tr) && Array.isArray(br)) {
        for (let r = 0; r < tr.length && r < br.length; r++) {
          if (tr[r] && br[r] && typeof tr[r] === "object" && typeof br[r] === "object") {
            preserveOrigin(tr[r] as object, br[r]);
          }
        }
      }
    }
  }
}

function graftContainerOrigins(target: ShapeContainer, base: ShapeContainer): void {
  const idx = new Map<string, Shape>();
  for (const s of collectShapes(base)) idx.set(s.id, s);
  for (const s of collectShapes(target)) {
    const b = idx.get(s.id);
    if (b) graftShapeOrigin(s, b);
  }
}

// 背景快照（slide.__source.bgSnapshot / rawMainShapes）同样是解析期基线，JSON 持久化会丢。
// reattachPresentationSource 只补了 partPath，bgSnapshot/rawMainShapes 仍为 undefined →
// serializer 找不到背景基线就会把 `<p:bg>` 重写、把背景图当新媒体重复注册（slide1 的
// rId 漂移 + image 重复即此因）。这里从基线把它们补回。
function graftSourceSnapshot(
  target: { __source?: SlideSource | SlideLikeSource },
  base: { __source?: SlideSource | SlideLikeSource },
): void {
  const ts = target.__source;
  const bs = base.__source;
  if (!ts || !bs) return;
  if (ts.bgSnapshot === undefined && bs.bgSnapshot !== undefined) ts.bgSnapshot = bs.bgSnapshot;
  const tsAny = ts as SlideSource;
  const bsAny = bs as SlideSource;
  if (tsAny.rawMainShapes === undefined && bsAny.rawMainShapes !== undefined) {
    tsAny.rawMainShapes = bsAny.rawMainShapes;
  }
  // timing/transition/notes 解析期快照同样丢失于 JSON 持久化 —— 从基线补回，
  // 让缓存恢复后的会话能正确识别"动画/切换/备注编辑过没有"。
  if (tsAny.timingSnapshot === undefined && bsAny.timingSnapshot !== undefined) {
    tsAny.timingSnapshot = bsAny.timingSnapshot;
  }
  if (tsAny.transitionSnapshot === undefined && bsAny.transitionSnapshot !== undefined) {
    tsAny.transitionSnapshot = bsAny.transitionSnapshot;
  }
  if (tsAny.notesSnapshot === undefined && bsAny.notesSnapshot !== undefined) {
    tsAny.notesSnapshot = bsAny.notesSnapshot;
  }
  if (tsAny.notesPartPath === undefined && bsAny.notesPartPath !== undefined) {
    tsAny.notesPartPath = bsAny.notesPartPath;
  }
  if (tsAny.commentsSnapshot === undefined && bsAny.commentsSnapshot !== undefined) {
    tsAny.commentsSnapshot = bsAny.commentsSnapshot;
  }
  if (tsAny.commentsPartPath === undefined && bsAny.commentsPartPath !== undefined) {
    tsAny.commentsPartPath = bsAny.commentsPartPath;
  }
}

/**
 * 用 pres.__source 的原始字节重建并嫁接 round-trip 基线（__origin）到 pres 上。
 * 在 reattachPresentationSource 之后调用。返回是否成功（无 __source 或重解析失败时为 false）。
 */
export function rebuildOriginsFromSource(pres: Presentation): boolean {
  const src = (pres as Presentation & { __source?: { files?: Map<string, Uint8Array> } }).__source;
  if (!src?.files?.size) return false;
  let baseline: Presentation;
  try {
    baseline = parseFromArchive(buildArchiveFromFiles(src.files));
  } catch (e) {
    console.warn("[parser] rebuildOriginsFromSource: re-parse failed, skipping", e);
    return false;
  }
  // slide 基线按 partPath 对齐（不是按下标）：用户删页 / 重排后再从缓存恢复时，
  // pres.slides[i] 未必对应 baseline.slides[i]；partPath 是 reattach 阶段按持久化
  // 映射挂回来的稳定键。partPath 缺失（新增 slide）→ 没有基线可嫁接，跳过（正确：
  // 新 slide 本就该按显式写出）。
  const baseByPath = new Map<string, Slide>();
  for (const b of baseline.slides) {
    const p = b.__source?.partPath;
    if (p) baseByPath.set(p, b);
  }
  const slides: Slide[] = pres.slides ?? [];
  for (const slide of slides) {
    const p = slide.__source?.partPath;
    const b = p ? baseByPath.get(p) : undefined;
    if (b) {
      graftContainerOrigins(slide, b);
      graftSourceSnapshot(slide, b);
    }
  }
  // master / layout 的 id 派生自 part 文件名（idFromPath），JSON 持久化不丢 → 按 id 对齐。
  const bMasterById = new Map<string, SlideMaster>();
  for (const bm of baseline.masters ?? []) bMasterById.set(bm.id, bm);
  for (const pm of pres.masters ?? []) {
    const bm = bMasterById.get(pm.id);
    if (!bm) continue;
    graftContainerOrigins(pm, bm);
    graftSourceSnapshot(pm, bm);
    const bLayoutById = new Map<string, SlideLayout>();
    for (const bl of bm.layouts ?? []) bLayoutById.set(bl.id, bl);
    for (const pl of pm.layouts ?? []) {
      const bl = bLayoutById.get(pl.id);
      if (bl) {
        graftContainerOrigins(pl, bl);
        graftSourceSnapshot(pl, bl);
      }
    }
  }
  return true;
}
