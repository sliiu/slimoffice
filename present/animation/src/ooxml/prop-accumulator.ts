// ECMA-376 §19.5.14 cBhvr.additive 合成：
//   "base"（默认）→ 直接覆盖该 (target, prop) 的当前合成结果
//   "repl"        → 同 base，替换
//   "sum"         → base + value（base = atom 启动那一刻 prop 的值，atom 生命周期内固定）
//   "mult"        → base * value
//   "none"        → 跳过
//
// 每帧 runtime tickActive 开头调用 beginFrame()，遍历所有 active atom 的 PropTrack
// 时调用 contribute(); 帧末调用 flush() 把合成结果一次性 setProperty 到目标。
//
// 关键设计：sum/mult 的 base 必须跨帧持久。
//   每帧 beginFrame 只清 entries（本帧合成结果），baseSnapshot 跨帧保留，
//   仅在 atom 首次见到 (atomId,target,key) 时拿一次 target.getProperty() 存起来。
//   否则每帧重新拿 target 上一帧 flush 后的中间值作 base，会导致 sum 在 dur 内反复累加
//   （t=0.032 时 cur=0+5.76°→entry=5.76°→target=5.76°；下一帧 cur=5.76°+11.52°→17.28°…
//   末态 SceneNode.rotation ≠ by，整个动画飞出预期）。
//
// 非数值类型（color/string/bool/point）在 sum/mult 下退化为 repl（覆盖）。

import type { Animatable } from "../types";

export type AdditiveMode = "base" | "sum" | "repl" | "mult" | "none";

interface Entry {
  value: unknown;
  overridden: boolean;
}

export class PropertyAccumulator {
  private entries = new Map<string, Entry>();
  // baseSnapshot 以 atomId 维度持久化，避免每帧重抓 target.getProperty 导致 sum 误累加。
  private baseSnapshot = new Map<string, unknown>();
  // 当前帧内已见过的 atom（用于在 frame 结束时回收 stale snapshot）。
  private seenAtomKeys = new Set<string>();

  beginFrame(): void {
    this.entries.clear();
    this.seenAtomKeys.clear();
  }

  // frame 末调用：移除本帧未触达的 baseSnapshot（atom 已退出 active），
  // 这样下次该 atom 重启时会重新抓 base。
  endFrame(): void {
    for (const k of [...this.baseSnapshot.keys()]) {
      if (!this.seenAtomKeys.has(k)) this.baseSnapshot.delete(k);
    }
  }

  contribute(
    target: Animatable | null,
    targetId: string,
    key: string,
    value: unknown,
    additive: AdditiveMode | undefined,
    atomId?: string,
  ): void {
    if (value === undefined) return;
    const mode: AdditiveMode = additive ?? "base";
    if (mode === "none") return;
    const k = `${targetId}::${key}`;
    if (mode === "base" || mode === "repl") {
      this.entries.set(k, { value, overridden: true });
      return;
    }
    if (mode === "sum") {
      const base = this.baseFor(target, atomId, k, key, 0);
      if (typeof base === "number" && typeof value === "number") {
        // 同 prop 多个 sum atom：把各 atom 的 by 累加到本帧 entry（entry 保留累计），
        // entry 初始值 = base；后续 contribute 再叠加 value。
        const prev = this.entries.get(k);
        const carry = prev && typeof prev.value === "number" ? prev.value : base;
        this.entries.set(k, { value: carry + value, overridden: prev?.overridden ?? false });
      } else {
        this.entries.set(k, { value, overridden: true });
      }
      return;
    }
    if (mode === "mult") {
      const base = this.baseFor(target, atomId, k, key, 1);
      if (typeof base === "number" && typeof value === "number") {
        const prev = this.entries.get(k);
        const carry = prev && typeof prev.value === "number" ? prev.value : base;
        this.entries.set(k, { value: carry * value, overridden: prev?.overridden ?? false });
      } else {
        this.entries.set(k, { value, overridden: true });
      }
    }
  }

  flush(resolve: (id: string) => Animatable | null): void {
    for (const [k, entry] of this.entries) {
      const sep = k.indexOf("::");
      if (sep < 0) continue;
      const tid = k.slice(0, sep);
      const key = k.slice(sep + 2);
      const target = resolve(tid);
      if (target && entry.value !== undefined) {
        target.setProperty(key, entry.value);
      }
    }
    this.endFrame();
  }

  // sum/mult 的 base：以 atomId 维度首帧抓一次，之后帧复用，避免被中间帧 flush 写回的值污染。
  // 没传 atomId（旧调用方）时退回到 per-prop 一次性抓取，行为与历史一致。
  private baseFor(
    target: Animatable | null,
    atomId: string | undefined,
    k: string,
    key: string,
    fallback: number,
  ): unknown {
    const snapKey = atomId ? `${atomId}::${k}` : k;
    this.seenAtomKeys.add(snapKey);
    if (this.baseSnapshot.has(snapKey)) return this.baseSnapshot.get(snapKey);
    const snap = target?.getProperty(key);
    const usable = snap === undefined ? fallback : snap;
    this.baseSnapshot.set(snapKey, usable);
    return usable;
  }
}
