// 阶段 A：preset OOXML 子树模板表 + 展开器。
// 公开 API 给 compile 路径接入，逐步替换 presets/ 下的近似 keyframe 实现。

export { expandPresetTemplate, presetTemplateSubtypeKind, presetTemplateSubtypes } from "./expand";
export { derivableSubtypes, deriveSubtypeVariant, subtypeKind, type SubtypeKind } from "./derive";
export {
  findPresetTemplate,
  hasPresetTemplate,
  listPresetTemplates,
  registerPresetTemplate,
} from "./registry";
export type { PresetExpandCtx, PresetRegistry, PresetTemplate } from "./types";
