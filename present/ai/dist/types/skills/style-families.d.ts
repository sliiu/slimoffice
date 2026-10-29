import type { SkillView } from "./types.js";
export interface CustomStyleFamilyDef {
    /** lower_snake id */
    id: string;
    /** 英文 styleHint 关键词 —— 喂给 outline / design-spec / theme prompt */
    hint: string;
}
/** 归一化 family id（kebab → snake，与 skill id 同规则）。 */
export declare function normalizeStyleFamilyId(raw: string): string;
/**
 * 解析 frontmatter `styleFamilies` csv。
 * 格式：`id:hint, id2` —— 冒号后是 hint；无冒号则 hint=id。
 */
export declare function parseStyleFamiliesCsv(raw: string | undefined): CustomStyleFamilyDef[];
export declare function formatStyleFamiliesCsv(defs: CustomStyleFamilyDef[] | undefined): string;
/** 从 enabled generate-affecting skills 合并自定义族（不含 builtin）。 */
export declare function resolveCustomStyleFamilies(skills: Array<Pick<SkillView, "enabled" | "stage" | "source" | "styleFamilies">>): CustomStyleFamilyDef[];
/** 内置 + 自定义族 id 全集 —— 见 registry.getKnownStyleFamilyIds（含 enabled 过滤）。 */
export declare function isBuiltinStyleFamilyId(id: string): boolean;
