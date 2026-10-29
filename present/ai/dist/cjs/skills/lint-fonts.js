"use strict";
// lintSkill + 字体预设感知：完整 @sliiu/present-ai 宿主（playground / editor）用这个版本，
// visual-system `fontFamilies` 里加载不到的字体名会被警告。console-export 走纯版 lint.ts。
Object.defineProperty(exports, "__esModule", { value: true });
exports.lintSkill = lintSkill;
const themes_1 = require("@sliiu/present-themes");
const lint_1 = require("./lint");
function lintSkill(spec, ctx = {}) {
    return (0, lint_1.lintSkill)(spec, { isKnownFontFamily: (family) => !!(0, themes_1.findFontPreset)(family), ...ctx });
}
