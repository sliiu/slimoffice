// §19.5.6 a:anim — 关键帧驱动的通用动画行为。

import { lookupAttr } from "../attr-map";
import type { DecodeCtx } from "../attr-map";
import { evalExpr } from "../expr";
import type { InterpKey } from "../interp";
import type { AnimNode, TimeAnimValue } from "../types";
import type { EasingFn } from "../../types";
import { decodeTavValue, tavEasing } from "../compile/helpers";
import type { AtomTrack } from "../compile/types";

// §19.5.71 tav@fmla 里的 $ 是整段行为的进度，不是该关键帧自己的 tm。
// PowerPoint 的 Zoom 回弹把整条曲线写在 tm="0" 的 fmla 上，末帧 val="1"
// 只是占位。按 tm 把 $ 定死再线性插到字面量 1，ppt_w/ppt_h 会被解成整页那么大。
const FMLA_SAMPLES = 17;

function progressFormulaKeys(
  tavs: TimeAnimValue[],
  dur: number,
  dec: (raw: string) => unknown,
  ctx: DecodeCtx,
): InterpKey[] | null {
  const dynamic = tavs.find((t) => t.fmla?.includes("$"));
  if (!dynamic?.fmla) return null;
  const keys: InterpKey[] = [];
  const steps = FMLA_SAMPLES - 1;
  for (let i = 0; i < FMLA_SAMPLES; i++) {
    const u = i / steps;
    const raw = evalExpr(dynamic.fmla, { ...ctx, extra: { $: u } });
    if (!Number.isFinite(raw)) continue;
    const v = dec(String(raw));
    if (v === undefined) continue;
    keys.push({ time: u * dur, value: v });
  }
  return keys.length >= 2 ? keys : null;
}

export function compileAnim(
  node: AnimNode,
  ctx: DecodeCtx,
  dur: number,
  parentEasing: EasingFn | undefined,
): AtomTrack[] {
  const names = node.cBhvr.attrNameLst ?? [];
  const tavs = node.tavLst ?? [];
  const out: AtomTrack[] = [];
  for (const name of names) {
    const spec = lookupAttr(name);
    if (!spec) continue;
    // §19.5.6 dec: from/to/values/tav.val 用"绝对目标值"解码；decBy: by 用"相对增量"解码。
    // 对位置/尺寸类属性两者不同（见 attr-map.ts）；其他属性 decBy 回退到 dec。
    const dec = (s: string): unknown => spec.decode?.(s, ctx) ?? s;
    const decBy = (s: string): unknown =>
      (spec.decodeBy ?? spec.decode)?.(s, ctx) ?? s;
    const keys: InterpKey[] = [];
    const formulaKeys = tavs.length > 0 ? progressFormulaKeys(tavs, dur, dec, ctx) : null;
    if (formulaKeys) {
      keys.push(...formulaKeys);
    } else if (tavs.length > 0) {
      for (let i = 0; i < tavs.length; i++) {
        const t = tavs[i]!;
        const tm = t.tm !== undefined ? (t.tm / 100000) * dur : (i / Math.max(1, tavs.length - 1)) * dur;
        const v = decodeTavValue(t, spec.kind, dec, ctx);
        if (v !== undefined) keys.push({ time: tm, value: v, easing: tavEasing(t, parentEasing) });
      }
    } else {
      const fromV = node.from !== undefined ? dec(node.from) : undefined;
      const toV = node.to !== undefined ? dec(node.to) : undefined;
      const byV = node.by !== undefined ? decBy(node.by) : undefined;
      if (fromV !== undefined && toV !== undefined) {
        keys.push({ time: 0, value: fromV });
        keys.push({ time: dur, value: toV, easing: parentEasing });
      } else if (byV !== undefined) {
        keys.push({ time: 0, value: 0 });
        keys.push({ time: dur, value: byV, easing: parentEasing });
      } else if (toV !== undefined) {
        keys.push({ time: dur, value: toV, easing: parentEasing });
      }
    }
    if (keys.length === 0) continue;
    out.push({
      kind: "prop",
      property: spec.property,
      valueKind: spec.kind,
      keys,
      relative: node.by !== undefined && node.from === undefined && node.to === undefined,
      calcMode: node.calcMode,
    });
  }
  return out;
}
