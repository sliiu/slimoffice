// 阶段 A2 数据：从 samples/*.pptx 提取的真实 OOXML preset 子树。
// 来源：scripts/extract-preset-templates.mjs；每个 (presetClass, presetID, subtype) 取首次出现。
//
// 字段：{ entr|exit|emph|path: { "<id>[.<subtype>]": TimeNode } }
// 所有 spid 已被替换为占位符 "$tgt"；展开时由 expandPresetTemplate 替换为真实 spid。

import raw from "./extracted.json";
import type { TimeNode } from "../../types";

interface ExtractedDB {
  entr: Record<string, TimeNode>;
  exit: Record<string, TimeNode>;
  emph: Record<string, TimeNode>;
  path: Record<string, TimeNode>;
}

export const EXTRACTED_PRESETS: ExtractedDB = raw as unknown as ExtractedDB;
