import { type SkillLintContext } from "./lint.js";
import type { SkillSpec } from "./types.js";
export declare function lintSkill(spec: Pick<SkillSpec, "stage" | "body" | "styleFamilies" | "visualSystems">, ctx?: SkillLintContext): string[];
export type { SkillLintContext };
