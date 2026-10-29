// §19.5.7 a:animClr — 颜色动画行为。

import { lookupAttr } from "../attr-map";
import { applyColorBy, resolveAnimColor } from "../color";
import type { InterpKey } from "../interp";
import type { AnimClrNode } from "../types";
import type { EasingFn } from "../../types";
import type { AtomTrack, CompileCtx } from "../compile/types";

export function compileAnimClr(
  node: AnimClrNode,
  ctx: CompileCtx,
  dur: number,
  parentEasing: EasingFn | undefined,
): AtomTrack[] {
  const names = node.cBhvr.attrNameLst ?? ["fillcolor.rgb"];
  const spec = lookupAttr(names[0]!) ?? lookupAttr("fillcolor.rgb");
  if (!spec) return [];
  const keys: InterpKey[] = [];
  const fromHex = resolveAnimColor(node.from, ctx.colorCtx);
  const toHex = resolveAnimColor(node.to, ctx.colorCtx);
  if (fromHex) keys.push({ time: 0, value: fromHex });
  if (toHex) keys.push({ time: dur, value: toHex, easing: parentEasing });
  if (!toHex && node.by) {
    const space = node.clrSpc ?? "rgb";
    const dir = node.dir ?? "cw";
    if (fromHex) {
      // 显式 from + by：编译期就能算出终点颜色，仍走标准 keyframes 插值。
      const computed = applyColorBy(fromHex, node.by, space, dir);
      if (computed) keys.push({ time: dur, value: computed, easing: parentEasing });
    } else {
      // §19.5.7 by-only animClr：base 是 runtime 当前色，编译期算不出 keyframe value。
      // 输出"colorBy"标记 + 占位 keys，runtime 抓 base 后按 progress 缩放 by 并合成。
      // PowerPoint 实测样本的多数 animClr（如 emphasis 色彩闪烁、变色）都走此路径。
      return [
        {
          kind: "prop",
          property: spec.property,
          valueKind: "color",
          keys: [
            { time: 0, value: "#000000" },
            { time: dur, value: "#000000", easing: parentEasing },
          ],
          colorBy: { by: node.by, clrSpc: space, dir },
        },
      ];
    }
  }
  if (keys.length === 0) return [];
  return [{ kind: "prop", property: spec.property, valueKind: "color", keys }];
}
