import type { GuidanceInput, OutlineLayoutHint, SlideSpecZ } from "../schema.js";
/** 连续 text-heavy 的升级轮换次序。outline 阶段的节奏兜底也复用（保持两级一致）。 */
export declare const UPGRADE_FROM_BULLETS: OutlineLayoutHint[];
/** 这一页配图的语义种子：deck 主题 + 大纲给这页写的 imageIdea。 */
interface ImageSeed {
    topic?: string;
    idea?: string;
}
export declare function remapSlideSpec(kind: OutlineLayoutHint, spec: SlideSpecZ, seed?: ImageSeed): SlideSpecZ;
/**
 * 兜底配图关键词。种子优先级：
 *   1. 大纲的 imageIdea —— LLM 已经按"主体 + 场景 + 光线"写好的英文方向，最贴题；
 *   2. topic + title 里的拉丁片段；
 *   3. 纯非拉丁（中文 deck 最常见）→ 原样保留标题/主题作为主体。
 *
 * 第 3 条以前直接返回 "cinematic abstract gradient soft bokeh atmosphere" 这类通用词，
 * 于是整篇中文 PPT 每页都在抓同一批抽象光斑图 —— 这正是"配图跟主题完全不符"的来源。
 * 图库搜中文基本必然 miss，但 miss 之后会回退 AI 生图，而生图模型完全读得懂中文主体；
 * 给它真实主体远好过给它一句放之四海而皆准的氛围词。
 */
export declare function defaultImageQuery(kind: "bg" | "inline" | "hero", title: string, topic: string | undefined, imageIdea?: string): string;
/**
 * 确定性提升 SlideSpec 质量（mutate 副本，返回新数组）：
 *   1. 开场/收束版式
 *   2. 打破连续 text-heavy（升级为 cards/banner/…）
 *   3. 视觉页补 bgImageQuery；image-text 补 imageQuery
 *   4. 缺 notes 时补演讲备注
 */
export declare function ensureSlideSpecQuality(specs: SlideSpecZ[], guidance: GuidanceInput, opts?: {
    /** 非整篇时跳过开场/收束强制（参考路径的 fallback 子集）。 */
    partial?: boolean;
    /**
     * 与 `specs` 下标对齐的大纲 imageIdea。大纲阶段 LLM 已经为每页写好了"主体 +
     * 场景 + 光线"的英文配图方向；补 query 时优先用它，而不是从标题硬抠关键词。
     */
    imageIdeas?: Array<string | undefined>;
}): {
    specs: SlideSpecZ[];
    fixes: string[];
};
export {};
