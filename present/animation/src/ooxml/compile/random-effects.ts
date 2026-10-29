// 把 presetID=24 (Random Effects) 替换为伪随机选择的具体效果。
//
// Random Effects 在 OOXML 中的编码特点（参考 §19.5.18 cTn / §19.5.8 animEffect）：
//   - presetID=24, presetClass=entr 或 exit
//   - childTnLst 通常只包含 visibility=visible 的 <p:set>（dur=1ms）和占位
//     <p:anim to="" calcmode="lin" valueType="num"/>（dur=1ms）
//   - 没有 animEffect filter；duration 全 1ms
//
// PowerPoint 运行时会从基础效果池中随机选一个 preset 来播放。这里在 compileTiming
// 入口把"占位 preset 容器"替换为池中某个真实 preset 的展开子树，让后续编译/渲染
// 链路无需特化处理。
//
// 选择策略：
//   - 用 (tgtSpid + presetClass) 的哈希做种子 → 同一形状同一 entr/exit 选择稳定，
//     不同形状互不相同，还原"每个元素各自随机"的语义。
//   - 池子里**剔除** Random Effects (24) 和 Random Bars (14)（避免双重 random）。
//
// 注意：这是"通用"转换，不针对具体 PPT；只要 OOXML 满足 presetID=24 + 空效果都会
// 生效。出品 PPT 里"已写好真实 filter 的 Random Effects 容器"（罕见）也能识别——
// 我们只在 childTnLst 内没有任何 animEffect 时才替换。

import { expandPresetTemplate, findPresetTemplate } from "../presets-template";
import { getCTn, getChildren, isContainer } from "../types";
import type { CTn, PresetClass, TimeNode } from "../types";

const RANDOM_EFFECTS_PRESET_ID = 24;
// PowerPoint 默认 Random Effects 时长约 500ms（与 Wipe/Box 等基础效果一致）。
const RANDOM_EFFECT_DEFAULT_DUR_MS = 500;

// Entrance 池：preset id + 已知有模板的 subtype。
const RANDOM_ENTR_POOL: ReadonlyArray<{ id: number; sub: number }> = [
  { id: 3, sub: 10 }, // Blinds
  { id: 4, sub: 16 }, // Box
  { id: 5, sub: 10 }, // Checkerboard
  { id: 6, sub: 16 }, // Circle
  { id: 8, sub: 16 }, // Diamond
  { id: 10, sub: 0 }, // Fade
  { id: 12, sub: 4 }, // Plus
  { id: 16, sub: 21 }, // Split / Barn
  { id: 18, sub: 12 }, // Strips
  { id: 22, sub: 1 }, // Wipe
];

// Exit 池：与 entrance 对称，subtype 取 exit 表中常用值。
const RANDOM_EXIT_POOL: ReadonlyArray<{ id: number; sub: number }> = [
  { id: 3, sub: 10 },
  { id: 4, sub: 32 },
  { id: 5, sub: 10 },
  { id: 6, sub: 32 },
  { id: 8, sub: 32 },
  { id: 10, sub: 0 },
  { id: 12, sub: 4 },
  { id: 16, sub: 21 },
  { id: 18, sub: 12 },
  { id: 22, sub: 8 },
];

export function substituteRandomEffects(root: TimeNode): TimeNode {
  walkAndSubstitute(root);
  return root;
}

function walkAndSubstitute(node: TimeNode): void {
  if (isContainer(node)) {
    const cTn = getCTn(node);
    if (isRandomEffectsContainer(cTn)) {
      tryReplaceWithRandom(cTn);
      // 替换后 childTnLst 是新 template 内容；继续递归对其内部依然安全（不会再有 24）。
    }
    for (const c of getChildren(node)) walkAndSubstitute(c);
  }
}

function isRandomEffectsContainer(cTn: CTn): boolean {
  if (cTn.presetID !== RANDOM_EFFECTS_PRESET_ID) return false;
  if (cTn.presetClass !== "entr" && cTn.presetClass !== "exit") return false;
  // 已经包含真实 animEffect 的不动（极少见的"已展开 Random Effects 容器"，保留原行为）。
  if (containsAnimEffect(cTn.childTnLst ?? [])) return false;
  return true;
}

function containsAnimEffect(nodes: TimeNode[]): boolean {
  for (const n of nodes) {
    if (n.kind === "animEffect") return true;
    if (isContainer(n) && containsAnimEffect(getChildren(n))) return true;
  }
  return false;
}

function tryReplaceWithRandom(cTn: CTn): void {
  const tgtSpid = findTgtSpid(cTn.childTnLst ?? []);
  // 无法确定目标 shape 就跳过——保留原 1ms 占位（视觉上仍是瞬时显隐，至少不是空白）。
  if (!tgtSpid) return;
  const cls = cTn.presetClass as PresetClass;
  const pool = cls === "entr" ? RANDOM_ENTR_POOL : RANDOM_EXIT_POOL;
  const seed = hashString(tgtSpid + ":" + cls);
  const choice = pool[seed % pool.length]!;
  const tpl = findPresetTemplate(cls, choice.id);
  if (!tpl) return;
  const expanded = expandPresetTemplate(tpl, {
    tgtSpid,
    presetSubtype: choice.sub,
    durMs: RANDOM_EFFECT_DEFAULT_DUR_MS,
  });
  const expandedCTn = getCTn(expanded);
  if (!expandedCTn.childTnLst) return;
  // 用 template 子树替换 childTnLst；保留外层 cTn 本身的 nodeType/grpId/stCondLst 等。
  // 同步更新 presetID/presetSubtype 字段，便于编辑器 UI 和回写序列化时反映"已固化为该效果"。
  cTn.childTnLst = expandedCTn.childTnLst;
  cTn.presetID = choice.id;
  cTn.presetSubtype = choice.sub;
  if (typeof cTn.dur !== "number" || cTn.dur < 50) {
    cTn.dur = RANDOM_EFFECT_DEFAULT_DUR_MS;
  }
}

// 在 childTnLst 中找第一个带 spTgt.spid 的行为节点（cBhvr.tgtEl.spTgt.spid）。
function findTgtSpid(nodes: TimeNode[]): string | undefined {
  for (const n of nodes) {
    if (isContainer(n)) {
      const inner = findTgtSpid(getChildren(n));
      if (inner) return inner;
      continue;
    }
    if ("cBhvr" in n) {
      const spid = n.cBhvr.tgtEl?.spTgt?.spid;
      if (spid && spid !== "$tgt") return spid;
    } else if ("cMediaNode" in n) {
      const spid = n.cMediaNode.tgtEl?.spTgt?.spid;
      if (spid && spid !== "$tgt") return spid;
    }
  }
  return undefined;
}

// 32-bit FNV-1a hash → 稳定且与平台无关，足够做 random pool 选择的种子。
function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}
