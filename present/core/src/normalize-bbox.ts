// 通用 shape bbox 归一化：把"宽和高都明显超出幻灯片"的媒体（image / video / audio）
// 强制 fit 回 slide 内部并居中。
//
// 设计理由（必读）：
//   - image / video / audio 的 bbox 经常来自外部"原生像素"：
//       · 编辑器 pickMediaFile 读 <video>.videoWidth/Height 当默认尺寸；
//       · 解析嵌入式媒体（特别是高分辨率截屏 / 4K 视频）；
//       · 历史 .ppt 二进制解析时的尺寸推断；
//     宽和高同时大于 slide 时，编辑器里 selection 8 个手柄全画在舞台外
//     （stage 元素是裁切到 slide 边界的），用户看不到 / 抓不到。
//
//   - 只超一边的媒体是作者摆好的：伸出页外的袖子、从页底伸上来的手臂、
//     横向 bleed。把它们缩进页内并居中会盖住正文。宽和高都没超（含正好
//     铺满的全屏图）也不动。
//
//   - 其余 shape（rect / ellipse / line / path / text / group / chart）即使
//     大于 slide 也通常是有意为之（全屏背景、入场起点、跨页装饰），绝不应当动。
//
// 与 OOXML 的关系：本 transform 改的是内存模型的 shape.bbox，serializer 会按
// 修正后的 EMU 写回 a:xfrm/off + a:xfrm/ext —— 是合法的 OOXML 操作，不破坏文件。

import type { Rect } from "./geometry";
import type { Shape } from "./shape";
import type { Presentation } from "./slide";

export interface NormalizeBboxOptions {
  // 宽、高都大于该比例 * slide 才视为"过大"。默认 1.0。只超一边，或正好铺满，不动。
  oversizeThreshold?: number;
  // 修正后目标尺寸的最大占比。默认 0.8，与 insertImage / insertVideo 一致，
  // 给四周留 10% 余量，方便用户继续拖动 / 缩放。
  maxFitRatio?: number;
}

export interface NormalizeBboxFit {
  slideIdx: number;
  shapeId: string;
  from: Rect;
  to: Rect;
}

export interface NormalizeBboxResult {
  fittedShapes: NormalizeBboxFit[];
}

export function normalizeBboxes(
  pres: Presentation,
  options: NormalizeBboxOptions = {},
): NormalizeBboxResult {
  const oversize = options.oversizeThreshold ?? 1.0;
  const maxFit = options.maxFitRatio ?? 0.8;
  const sw = pres.size.width;
  const sh = pres.size.height;
  const fittedShapes: NormalizeBboxFit[] = [];
  if (sw <= 0 || sh <= 0) return { fittedShapes };
  for (let si = 0; si < pres.slides.length; si++) {
    const slide = pres.slides[si];
    if (!slide) continue;
    for (const layer of slide.layers) {
      for (const shape of layer.shapes) {
        // 只处理顶层 shape：如果媒体在 group 里，整 group 的 bbox 决定可见性
        // 和选择 —— 让用户去调 group，不去拆 group 内部坐标。
        if (!isFittableMedia(shape)) continue;
        const b = shape.bbox;
        // 只在宽和高同时越界时介入。只超一边是页外延伸，不是原生像素误当 slide 坐标。
        if (b.w <= sw * oversize || b.h <= sh * oversize) continue;
        const aspect = b.w > 0 && b.h > 0 ? b.w / b.h : sw / sh;
        let nw = sw * maxFit;
        let nh = nw / aspect;
        if (nh > sh * maxFit) {
          nh = sh * maxFit;
          nw = nh * aspect;
        }
        const nx = (sw - nw) / 2;
        const ny = (sh - nh) / 2;
        const from = { ...b };
        const to: Rect = { x: nx, y: ny, w: nw, h: nh };
        shape.bbox = to;
        fittedShapes.push({ slideIdx: si, shapeId: shape.id, from, to });
      }
    }
  }
  return { fittedShapes };
}

function isFittableMedia(s: Shape): boolean {
  return s.kind === "image" || s.kind === "video" || s.kind === "audio";
}
