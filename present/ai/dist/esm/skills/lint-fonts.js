// lintSkill + 字体预设感知：完整 @sliiu/present-ai 宿主（playground / editor）用这个版本，
// visual-system `fontFamilies` 里加载不到的字体名会被警告。console-export 走纯版 lint.ts。
import { findFontPreset } from "@sliiu/present-themes";
import { lintSkill as lintSkillCore } from "./lint.js";
export function lintSkill(spec, ctx = {}) {
    return lintSkillCore(spec, { isKnownFontFamily: (family) => !!findFontPreset(family), ...ctx });
}
