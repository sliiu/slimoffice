// 扫描 OoxmlTiming 提取入场目标 - 用于初始化阶段把入场目标 opacity 设为 0。
// 兼容 PowerPoint 的 "hidden until entrance" 行为。
//
// §19.5.37 iterate 处理：当 entrance leaf 处于 iterate 容器内时，单条 leaf
// 在 walk/编译阶段会被 expandIterateSlices 拆成 N 个带 pRg/charRg 的子目标。
// 初始隐藏必须与之对齐，否则会出现"shape 整体被 hide，但 atom 只 set 一个段落
// → 该段落 opacity=1，其它仍 0"或反之"shape 整体 hide，paragraph atom 被它压制，
// 永远显示不出来"的视觉错位。本扫描器同样消费 iterate 信息，给每个段落/字符切片
// 各发一份 EntranceTarget。

import * as types from "./types";

export interface EntranceTarget {
  spid: string;
  paraRange?: { st: number; end: number };
  charRange?: { st: number; end: number };
}

export interface TextSliceInfo {
  pRg?: { st: number; end: number };
  charRg?: { st: number; end: number };
}

export interface CollectOpts {
  /**
   * 为指定 spid 返回 iterate type 对应的 text slice 列表。返回 null/undefined
   * 视为该 shape 没有可拆分的文本（仍按整体 spid 处理）。
   */
  getTextSlices?: (spid: string, type: "el" | "wd" | "lt") => TextSliceInfo[] | null | undefined;
}

export function collectEntranceTargets(
  timing: types.OoxmlTiming | undefined,
  opts: CollectOpts = {},
): EntranceTarget[] {
  if (!timing) return [];
  const out: EntranceTarget[] = [];
  const seen = new Set<string>();
  const addTarget = (t: EntranceTarget): void => {
    const key = `${t.spid}|${t.paraRange?.st ?? ""}|${t.paraRange?.end ?? ""}|${t.charRange?.st ?? ""}|${t.charRange?.end ?? ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(t);
  };

  const visit = (n: types.TimeNode, insideEntr: boolean, iterate: types.Iterate | undefined): void => {
    const cTn = types.getCTn(n);
    const here = insideEntr || cTn.presetClass === "entr";
    // §19.5.18 cTn.iterate 仅在最近的 par/seq 容器层有效；嵌套时由内向外覆盖。
    const iter = cTn.iterate ?? iterate;
    if (types.isBehavior(n)) {
      if (here && n.cBhvr.tgtEl.spTgt?.spid) {
        const spTgt = n.cBhvr.tgtEl.spTgt;
        const basePRg = spTgt.txEl?.pRg;
        const baseCharRg = spTgt.txEl?.charRg;
        // iterate 容器：参考 walk.ts/expandIterateSlices 的拆分规则——每个 slice
        // 各发一份 EntranceTarget；过滤到 leaf 自身已限定的 pRg/charRg 范围内。
        if (iter && opts.getTextSlices) {
          const slices = opts.getTextSlices(spTgt.spid, iter.type) ?? [];
          const filtered = slices.filter((sl) => {
            if (basePRg) {
              const p = sl.pRg?.st ?? -1;
              if (p < basePRg.st || p > basePRg.end) return false;
            }
            if (baseCharRg && sl.charRg) {
              if (sl.charRg.st < baseCharRg.st || sl.charRg.end > baseCharRg.end) return false;
            }
            return true;
          });
          if (filtered.length > 0) {
            for (const sl of filtered) {
              addTarget({
                spid: spTgt.spid,
                paraRange: sl.pRg,
                charRange: sl.charRg,
              });
            }
            return;
          }
        }
        addTarget({
          spid: spTgt.spid,
          paraRange: basePRg,
          charRange: baseCharRg,
        });
      }
      return;
    }
    for (const c of types.getChildren(n)) visit(c, here, iter);
  };

  for (const root of timing.tnLst) visit(root, false, undefined);
  return out;
}
