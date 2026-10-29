// §19.5.11 a:animScale — 缩放动画行为。
//
// @by/@from/@to.x/.y 单位 1/100000，含义为目标缩放比例（multiplier），不是增量。
//   100000 → 1.0x（原大小）
//   105000 → 1.05x
//   150000 → 1.5x
//   50000  → 0.5x
// 这是 PowerPoint / PPTXJS / pptx-viewer 都遵循的行为；ECMA-376 §19.5.11 只写
// "specifies the percentage by which to scale"，没明确 additive vs multiplier，
// 但实测和参考实现一致——因此我们也按 multiplier 处理。
//
// 历史 bug：之前实现 by → 1 + by_ratio（additive），导致 by=105000 被解为 2.05x，
// 让"放大震荡"类 emphasis（emph#26 等）末态变成原 2 倍多，配合附带的 fade out 视觉
// 上元素直接消失（因为放大区域覆盖屏幕外，且 opacity 被淡出 hold 在 0）。
//
// 输出走 scaleX/scaleY（动画乘子）；§20.1.7.6 flipH/flipV 的静态翻转由 renderer
// 在最终 transform 公式里以 shape.transform.scaleX/scaleY (±1) 单独乘入，与
// 动画 scaleX/scaleY 解耦。

import type { InterpKey } from "../interp";
import type { AnimScaleNode } from "../types";
import type { EasingFn } from "../../types";
import type { AtomTrack } from "../compile/types";

export function compileAnimScale(
  node: AnimScaleNode,
  dur: number,
  parentEasing: EasingFn | undefined,
): AtomTrack[] {
  const out: AtomTrack[] = [];
  const conv = (p: { x: number; y: number }): [number, number] => [p.x / 100000, p.y / 100000];
  for (const [idx, prop] of [
    [0, "scaleX"],
    [1, "scaleY"],
  ] as Array<[0 | 1, "scaleX" | "scaleY"]>) {
    const keys: InterpKey[] = [];
    if (node.by) {
      const b = conv(node.by);
      keys.push({ time: 0, value: 1 });
      keys.push({ time: dur, value: b[idx], easing: parentEasing });
    } else if (node.from || node.to) {
      if (node.from) keys.push({ time: 0, value: conv(node.from)[idx] });
      if (node.to) keys.push({ time: dur, value: conv(node.to)[idx], easing: parentEasing });
    }
    if (keys.length > 0) out.push({ kind: "prop", property: prop, valueKind: "number", keys, relative: false });
  }
  return out;
}
