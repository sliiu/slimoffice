// 阶段 A：OOXML 子树模板（preset template registry）
//
// 当前 presets/ 下的硬编码 keyframe 是对 PowerPoint preset 行为的近似，丢失了：
//   - cTn.delay/dur/accel/decel/autoRev/repeatCount/fill 等精确 timing 字段
//   - animEffect filter 的 prLst 完整结构（仅记录字符串）
//   - animMotion path 的 OOXML 原生表达（如 "M 0 0 L 0.5 0.3 E"）
//   - 多个 anim 行为的容器组织（par/seq/withEffect 等）
//
// 子树模板的设计：每个 preset 由一棵预先构造的 TimeNode 子树描述，spid 占位用
// 字面量 "$tgt"，加载时 deepClone + 占位符替换，然后嵌入 timing 树，走完整 compile 路径。
//
// 这样：preset 展开 = 一次 OOXML 子树克隆，与 PowerPoint 写出的 PPT 完全等价。

import type { TimeNode } from "../types";

export interface PresetTemplate {
  // PowerPoint 同一显示名可能对应多个 presetID（不同主版本兼容），都映射到同一模板。
  ids: number[];
  name: string;
  // 是否吃 presetSubtype（方向：top/bottom/left/right/topLeft/...）。
  supportsSubtype?: boolean;
  // 子树根：通常是 par/seq 容器；叶子节点的 tgtEl.spTgt.spid 填字面量 "$tgt"，
  // 展开时由 expandPresetTemplate 替换为真实 spid。
  template: TimeNode;
  // 同一 presetID 下不同 presetSubtype 的子树变体（提取时保留）。
  // 展开时若 PresetExpandCtx.presetSubtype 命中此 map，优先使用变体模板。
  _subtypes?: Record<number, TimeNode>;
}

export interface PresetRegistry {
  entr: PresetTemplate[];
  exit: PresetTemplate[];
  emph: PresetTemplate[];
  path: PresetTemplate[];
}

// expand 上下文：调用方提供目标 spid + （可选）覆盖 cTn.dur / presetSubtype。
export interface PresetExpandCtx {
  // 目标 shape id（OOXML 内的 spid 字符串，不含 "sp_" 前缀）。
  tgtSpid: string;
  // 文本子选择（PowerPoint 段落级 entrance/exit 时用）。
  pRg?: { st: number; end: number };
  charRg?: { st: number; end: number };
  // PowerPoint UI 设置的方向（subtype，位标志）：1=上、2=右、4=下、8=左，角方向相加。
  presetSubtype?: number;
  // 覆盖根 cTn.dur（毫秒）；模板中若已显式设置 dur，则不覆盖。
  durMs?: number;
  // 覆盖根 cTn.delay（毫秒）。
  delayMs?: number;
}
