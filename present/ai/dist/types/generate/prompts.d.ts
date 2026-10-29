import type { GuidanceInput, Outline, OutlineItem } from "./schema.js";
import { type GeneratedThemeSpec } from "../themes.js";
import type { HostSkillStore } from "../skills/types.js";
export { guidanceStyleHint } from "./style-hint.js";
export declare function resolveGuidanceLanguage(g: GuidanceInput): string;
export declare function guidanceHardConstraints(g: GuidanceInput): string;
/** Edit-pass constraints: language + audience + extra notes. Slide count belongs to outline. */
export declare function guidancePaintConstraints(g: GuidanceInput): string;
export declare function outlineSystemPrompt(host?: HostSkillStore, styleFamily?: string, themeId?: string): string;
export declare function outlineUserPrompt(g: GuidanceInput): string;
export declare function slideSystemPrompt(host?: HostSkillStore, ctx?: {
    styleFamily?: string;
    layoutKinds?: string[];
}): string;
export declare function slideUserPrompt(args: {
    outline: Outline;
    index: number;
    item: OutlineItem;
    guidance: GuidanceInput;
}): string;
export declare function slotFillSystemPrompt(host?: HostSkillStore, styleFamily?: string): string;
export declare function slotFillUserPrompt(args: {
    outline: Outline;
    index: number;
    item: OutlineItem;
    guidance: GuidanceInput;
    slotsBlock: string;
}): string;
export interface ThemeGuidance {
    topic?: string;
    audience?: string;
    scenario?: string;
    styleHint?: string;
    mode?: "light" | "dark" | "auto";
    language?: string;
    /** 风格族 id（ppt_style_systems），用于 theme 阶段的 skill 小节路由（roadmap L2）。 */
    styleFamily?: string;
}
/**
 * 调色板原型库：给 LLM 的"起点菜单"。每次生成从中掷一枚"方向骰子"（见
 * generateTheme 的 varietyHint），显著提升 run-to-run 的调性差异 —— 否则模型
 * 十次里有八次收敛到"紫蓝 SaaS 渐变"。原型只约束氛围，不约束具体 hex。
 */
export declare const THEME_PALETTE_ARCHETYPES: ReadonlyArray<{
    id: string;
    hint: string;
}>;
export declare function themeSystemPrompt(host?: HostSkillStore, styleFamily?: string): string;
export declare function themeUserPrompt(g: ThemeGuidance): string;
export interface MotionGuidance {
    topic?: string;
    audience?: string;
    scenario?: string;
    styleHint?: string;
    language?: string;
    /** 当前 theme 的浓缩摘要（generateAndApplyTheme 把 GeneratedThemeSpec 折叠后传入）。 */
    themeContext?: ThemeContextForMotion;
}
export interface ThemeContextForMotion {
    name?: string;
    description?: string;
    mode?: "light" | "dark";
    accentVibe?: string;
    decoration?: GeneratedThemeSpec["decoration"];
}
export declare function motionSystemPrompt(): string;
export declare function motionUserPrompt(g: MotionGuidance): string;
