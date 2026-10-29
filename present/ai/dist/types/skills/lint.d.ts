import type { SkillSpec } from "./types.js";
export interface SkillLintContext {
    /** 额外已知 styleFamily（含本 skill 自声明的 styleFamilies）。 */
    extraStyleFamilies?: string[];
    /**
     * 判断 visual-system `fontFamilies` 里的名字能否被加载（宿主注入 @sliiu/present-themes 的
     * findFontPreset；控制台等轻宿主不传则跳过该项检查，避免把 themes 包拖进 bundle）。
     */
    isKnownFontFamily?: (family: string) => boolean;
}
/**
 * 返回人类可读的 warning 列表（空数组 = 无问题）。
 */
export declare function lintSkill(spec: Pick<SkillSpec, "stage" | "body" | "styleFamilies" | "visualSystems">, ctx?: SkillLintContext): string[];
