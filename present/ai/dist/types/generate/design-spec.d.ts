import { z } from "zod";
import { type GuidanceInput } from "./schema.js";
import type { HostSkillStore } from "../skills/types.js";
/** 按当前已知 styleFamily（builtin + enabled user skill 自定义）构建 zod schema。 */
export declare function buildDesignSpecSchema(allowedFamilyIds: readonly string[]): z.ZodObject<{
    styleFamily: z.ZodEnum<{
        [x: string]: string;
    }>;
    themeId: z.ZodEnum<{
        academic: "academic";
        ai: "ai";
        business: "business";
        creative: "creative";
        dark: "dark";
        editorial: "editorial";
        ink: "ink";
        luxe: "luxe";
        minimal: "minimal";
        nature: "nature";
        pastel: "pastel";
        tech: "tech";
        terminal: "terminal";
        warm: "warm";
    }>;
    paletteLock: z.ZodOptional<z.ZodBoolean>;
    layoutMenu: z.ZodArray<z.ZodEnum<{
        agenda: "agenda";
        banner: "banner";
        bullets: "bullets";
        cards: "cards";
        chart: "chart";
        closing: "closing";
        comparison: "comparison";
        content: "content";
        cover: "cover";
        hero: "hero";
        "image-text": "image-text";
        metrics: "metrics";
        process: "process";
        quote: "quote";
        section: "section";
        stat: "stat";
        table: "table";
        timeline: "timeline";
        "two-column": "two-column";
    }>>;
    imagePlan: z.ZodObject<{
        vibe: z.ZodOptional<z.ZodString>;
        fullBleed: z.ZodOptional<z.ZodBoolean>;
        ratio: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
    doDont: z.ZodOptional<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
/** 默认 schema（仅 builtin 族）—— 测试 / 无 host 时用。 */
export declare const DesignSpecSchema: z.ZodObject<{
    styleFamily: z.ZodEnum<{
        [x: string]: string;
    }>;
    themeId: z.ZodEnum<{
        academic: "academic";
        ai: "ai";
        business: "business";
        creative: "creative";
        dark: "dark";
        editorial: "editorial";
        ink: "ink";
        luxe: "luxe";
        minimal: "minimal";
        nature: "nature";
        pastel: "pastel";
        tech: "tech";
        terminal: "terminal";
        warm: "warm";
    }>;
    paletteLock: z.ZodOptional<z.ZodBoolean>;
    layoutMenu: z.ZodArray<z.ZodEnum<{
        agenda: "agenda";
        banner: "banner";
        bullets: "bullets";
        cards: "cards";
        chart: "chart";
        closing: "closing";
        comparison: "comparison";
        content: "content";
        cover: "cover";
        hero: "hero";
        "image-text": "image-text";
        metrics: "metrics";
        process: "process";
        quote: "quote";
        section: "section";
        stat: "stat";
        table: "table";
        timeline: "timeline";
        "two-column": "two-column";
    }>>;
    imagePlan: z.ZodObject<{
        vibe: z.ZodOptional<z.ZodString>;
        fullBleed: z.ZodOptional<z.ZodBoolean>;
        ratio: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
    doDont: z.ZodOptional<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
export type DesignSpec = z.infer<ReturnType<typeof buildDesignSpecSchema>>;
export declare function designSpecSystemPrompt(skillFragments: string[], host?: HostSkillStore): string;
export declare function designSpecUserPrompt(g: GuidanceInput): string;
/**
 * 用 code 约束校正一份 DesignSpec：
 *   - 若 guidance 显式指定了 styleFamily，以它为准（用户意图优先于模型选择）；
 *   - 从 layoutMenu 移除该族禁用的版式（bannedLayoutsForFamily）；
 *   - imagePlan.fullBleed / ratio / vibe 与 STYLE_FAMILY_IMAGERY 对齐（族策略优先；自定义族无硬策略）。
 */
export declare function clampDesignSpec(spec: DesignSpec, guidance: GuidanceInput): DesignSpec;
export declare function renderDesignBrief(spec: DesignSpec, host?: HostSkillStore): string;
