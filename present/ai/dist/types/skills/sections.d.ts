export interface SkillSection {
    /** 小节标题文本（不含 `#`）；null = 首个标题前的 preamble。 */
    heading: string | null;
    /** 含标题的完整原文（用于原样重组，保留 markdown / 空行）。 */
    text: string;
    /** 命中的 styleFamily 列表（小写）；null = 无 applies 约束（全局）。 */
    applies: string[] | null;
    /** 命中的 layout 列表（小写）；null = 无 layout 约束。 */
    layout: string[] | null;
    /** generate / chat；null = 两阶段都注入。 */
    stages: Array<"generate" | "chat"> | null;
    /** 是否为验收 checklist 小节。 */
    isChecklist: boolean;
}
export interface SectionFilterContext {
    /** 当前风格族 id；空 / 缺省 = auto（不按族过滤）。 */
    styleFamily?: string;
    /** 当前页的 layout kind 列表；缺省 = 不按 layout 过滤。 */
    layoutKinds?: string[];
    /** chat vs generate（outline/slide/theme 都算 generate）。缺省 = 不按阶段过滤。 */
    stage?: "generate" | "chat";
}
/** 把 skill body 切成小节（含首个标题前的 preamble）。 */
export declare function parseSkillSections(body: string): SkillSection[];
/**
 * 按上下文过滤 skill body：只留命中的 + 全局小节。
 * 无过滤上下文（既无 styleFamily / layoutKinds / stage）→ 原样返回。
 */
export declare function filterSkillBody(body: string, ctx: SectionFilterContext): string;
/** 抽取 body 里的 checklist 小节文本（供 art-director 验收 rubric）。 */
export declare function extractChecklistSections(body: string): string[];
