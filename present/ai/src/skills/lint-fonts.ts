// lintSkill + 字体预设感知：完整 @ppt/ai 宿主（playground / editor）用这个版本，
// visual-system `fontFamilies` 里加载不到的字体名会被警告。console-export 走纯版 lint.ts。

import { findFontPreset } from "@ppt/themes";
import { lintSkill as lintSkillCore, type SkillLintContext } from "./lint";
import type { SkillSpec } from "./types";

export function lintSkill(
  spec: Pick<SkillSpec, "stage" | "body" | "styleFamilies" | "visualSystems">,
  ctx: SkillLintContext = {},
): string[] {
  return lintSkillCore(spec, { isKnownFontFamily: (family) => !!findFontPreset(family), ...ctx });
}

export type { SkillLintContext };
