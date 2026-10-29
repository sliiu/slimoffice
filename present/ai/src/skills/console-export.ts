// 控制台 / 轻量宿主专用导出 —— 不含 registry（避免 ?raw builtin .md 进 bundle）。

export {
  parseSkill,
  stringifySkill,
  composeRawFromUserInput,
  SkillSpecSchema,
  MissingFrontmatterError,
  SkillParseError,
} from "./parse";
export { lintSkill } from "./lint";
export {
  GENERATE_BRIEF_FIELD_IDS,
  parseBriefFieldsCsv,
  formatBriefFieldsCsv,
} from "./brief-fields";
export { parseStyleFamiliesCsv, formatStyleFamiliesCsv } from "./style-families";
export { CustomVisualSystemSchema, formatCustomVisualSystemBlock, type CustomVisualSystemDef } from "../deckgen/custom-system";
export type { SkillSpec, SkillStage } from "./types";
export type { CustomStyleFamilyDef } from "./style-families";
