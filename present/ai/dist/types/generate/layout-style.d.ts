import { z } from "zod";
import type { GeneratedThemeSpec } from "../themes.js";
import type { HostSkillStore } from "../skills/types.js";
/** 布局风格生成的简报字段（GuidanceInput / ThemeGuidance 的公共子集）。 */
export interface LayoutStyleGuidance {
    topic?: string | undefined;
    audience?: string | undefined;
    scenario?: string | undefined;
    styleFamily?: string | undefined;
    extraNotes?: string | undefined;
    styleHint?: string | undefined;
}
export declare const LayoutStyleSpecSchema: z.ZodObject<{
    name: z.ZodString;
    description: z.ZodString;
    grid: z.ZodPrefault<z.ZodObject<{
        marginX: z.ZodDefault<z.ZodCatch<z.ZodNumber>>;
        marginY: z.ZodDefault<z.ZodCatch<z.ZodNumber>>;
        gutter: z.ZodDefault<z.ZodCatch<z.ZodNumber>>;
    }, z.core.$strip>>;
    typography: z.ZodPrefault<z.ZodObject<{
        displayScale: z.ZodDefault<z.ZodCatch<z.ZodNumber>>;
        titleAlign: z.ZodDefault<z.ZodCatch<z.ZodEnum<{
            middle: "middle";
            start: "start";
        }>>>;
        titleWeight: z.ZodDefault<z.ZodCatch<z.ZodUnion<readonly [z.ZodLiteral<600>, z.ZodLiteral<700>, z.ZodLiteral<800>, z.ZodLiteral<900>]>>>;
        bodyLineHeight: z.ZodDefault<z.ZodCatch<z.ZodNumber>>;
        bodyMeasure: z.ZodDefault<z.ZodCatch<z.ZodNumber>>;
    }, z.core.$strip>>;
    composition: z.ZodPrefault<z.ZodObject<{
        coverAnchor: z.ZodDefault<z.ZodCatch<z.ZodEnum<{
            "band-right": "band-right";
            "bottom-left": "bottom-left";
            center: "center";
        }>>>;
        sectionStyle: z.ZodDefault<z.ZodCatch<z.ZodEnum<{
            "chip-number": "chip-number";
            "ghost-number": "ghost-number";
            "masthead-left": "masthead-left";
        }>>>;
        heroAnchor: z.ZodDefault<z.ZodCatch<z.ZodEnum<{
            "bottom-left": "bottom-left";
            center: "center";
        }>>>;
        titleAccent: z.ZodDefault<z.ZodCatch<z.ZodEnum<{
            dot: "dot";
            masthead: "masthead";
            none: "none";
            prompt: "prompt";
            underline: "underline";
        }>>>;
        panelStyle: z.ZodDefault<z.ZodCatch<z.ZodEnum<{
            flat: "flat";
            open: "open";
            soft: "soft";
        }>>>;
        panelRadius: z.ZodDefault<z.ZodCatch<z.ZodNumber>>;
        dividerStyle: z.ZodDefault<z.ZodCatch<z.ZodEnum<{
            accent: "accent";
            hairline: "hairline";
            none: "none";
        }>>>;
        ghostGlyphs: z.ZodDefault<z.ZodCatch<z.ZodBoolean>>;
        firstBulletEmphasis: z.ZodDefault<z.ZodCatch<z.ZodBoolean>>;
    }, z.core.$strip>>;
    motifs: z.ZodPrefault<z.ZodObject<{
        edgeBand: z.ZodDefault<z.ZodCatch<z.ZodEnum<{
            left: "left";
            none: "none";
            right: "right";
            top: "top";
        }>>>;
        pageNumber: z.ZodDefault<z.ZodCatch<z.ZodBoolean>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type LayoutStyleSpec = z.infer<typeof LayoutStyleSpecSchema>;
/** 解析 + 兜底：任何非法输入回退到全默认（渲染永不因 style 崩）。 */
export declare function clampLayoutStyle(raw: unknown): LayoutStyleSpec;
export declare const LAYOUT_STYLE_ARCHETYPES: ReadonlyArray<{
    id: string;
    hint: string;
}>;
export declare function layoutStyleSystemPrompt(host?: HostSkillStore, styleFamily?: string): string;
export declare function layoutStyleUserPrompt(guidance: LayoutStyleGuidance, themeSpec?: Pick<GeneratedThemeSpec, "name" | "description" | "mode" | "decoration"> | undefined): string;
