import { z } from "zod";
import type { SkillSpec, SkillStage } from "./types.js";
/** 区分"完全缺 frontmatter"与"frontmatter 损坏"——UI 文案不一样。 */
export declare class MissingFrontmatterError extends Error {
    constructor();
}
/** 通用解析错误（含行号 / 字段定位）。 */
export declare class SkillParseError extends Error {
    readonly line?: number | undefined;
    constructor(message: string, line?: number | undefined);
}
/** zod schema —— 给宿主存储 save 时再过一遍。 */
export declare const SkillSpecSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    description: z.ZodString;
    stage: z.ZodType<SkillStage, unknown, z.core.$ZodTypeInternals<SkillStage, unknown>>;
    briefFields: z.ZodDefault<z.ZodOptional<z.ZodArray<z.ZodType<"audience" | "extraNotes" | "goals" | "language" | "scenario" | "slideCount" | "styleFamily" | "topic", unknown, z.core.$ZodTypeInternals<"audience" | "extraNotes" | "goals" | "language" | "scenario" | "slideCount" | "styleFamily" | "topic", unknown>>>>>;
    briefCustom: z.ZodDefault<z.ZodOptional<z.ZodArray<z.ZodString>>>;
    styleFamilies: z.ZodDefault<z.ZodOptional<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        hint: z.ZodString;
    }, z.core.$strip>>>>;
    visualSystems: z.ZodDefault<z.ZodOptional<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodOptional<z.ZodString>;
        extends: z.ZodOptional<z.ZodEnum<{
            brutalist: "brutalist";
            "dark-tech": "dark-tech";
            "data-dense": "data-dense";
            editorial: "editorial";
            "photo-editorial": "photo-editorial";
            "soft-rounded": "soft-rounded";
            swiss: "swiss";
        }>>;
        voice: z.ZodOptional<z.ZodEnum<{
            grotesk: "grotesk";
            humanist: "humanist";
            "neo-grotesk": "neo-grotesk";
            serif: "serif";
        }>>;
        typeScale: z.ZodOptional<z.ZodObject<{
            display: z.ZodOptional<z.ZodNumber>;
            displayCjk: z.ZodOptional<z.ZodNumber>;
            h1: z.ZodOptional<z.ZodNumber>;
            h2: z.ZodOptional<z.ZodNumber>;
            body: z.ZodOptional<z.ZodNumber>;
            caption: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strict>>;
        grid: z.ZodOptional<z.ZodObject<{
            columns: z.ZodOptional<z.ZodNumber>;
            gutter: z.ZodOptional<z.ZodNumber>;
            margin: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strict>>;
        density: z.ZodOptional<z.ZodEnum<{
            airy: "airy";
            tight: "tight";
        }>>;
        bans: z.ZodOptional<z.ZodObject<{
            roundedCorners: z.ZodOptional<z.ZodBoolean>;
            shadows: z.ZodOptional<z.ZodBoolean>;
            gradients: z.ZodOptional<z.ZodBoolean>;
            centeredDisplay: z.ZodOptional<z.ZodBoolean>;
        }, z.core.$strict>>;
        fonts: z.ZodOptional<z.ZodObject<{
            display: z.ZodOptional<z.ZodString>;
            body: z.ZodOptional<z.ZodString>;
            mono: z.ZodOptional<z.ZodString>;
        }, z.core.$strict>>;
        fontFamilies: z.ZodOptional<z.ZodArray<z.ZodString>>;
        canvas: z.ZodOptional<z.ZodObject<{
            radius: z.ZodOptional<z.ZodNumber>;
            shadow: z.ZodOptional<z.ZodBoolean>;
            glow: z.ZodOptional<z.ZodBoolean>;
            tone: z.ZodOptional<z.ZodEnum<{
                dark: "dark";
                light: "light";
            }>>;
            ruleWidth: z.ZodOptional<z.ZodNumber>;
            displayTreatment: z.ZodOptional<z.ZodEnum<{
                glow: "glow";
                gradient: "gradient";
                none: "none";
                outline: "outline";
                shadow: "shadow";
            }>>;
            character: z.ZodOptional<z.ZodString>;
        }, z.core.$strict>>;
        palette: z.ZodOptional<z.ZodObject<{
            bg: z.ZodString;
            surface: z.ZodOptional<z.ZodString>;
            ink: z.ZodString;
            muted: z.ZodOptional<z.ZodString>;
            line: z.ZodOptional<z.ZodString>;
            accent: z.ZodString;
            accentSoft: z.ZodOptional<z.ZodString>;
        }, z.core.$strict>>;
        aliases: z.ZodOptional<z.ZodArray<z.ZodString>>;
    }, z.core.$strict>>>>;
    body: z.ZodString;
}, z.core.$strip>;
/** 解析单个 raw `.md` 文本为 SkillSpec；失败抛错。 */
export declare function parseSkill(raw: string, opts?: {
    builtin?: boolean;
}): SkillSpec;
/**
 * 由表单字段（id / name / description / stage / body）反向构造 raw `.md`。
 * UI 编辑器保存时用：让 HostSkillStore 永远只接受 raw 形态，与 .md 上传走同一条路。
 */
export declare function stringifySkill(spec: SkillSpec): string;
/**
 * UI 上"frontmatter 缺失补全"用：把整段当成 body、附加用户填写的 metadata，
 * 输出可被 parseSkill 接受的 raw 字符串。
 */
export declare function composeRawFromUserInput(args: {
    id: string;
    name: string;
    description: string;
    stage: SkillStage;
    briefFields?: SkillSpec["briefFields"];
    briefCustom?: SkillSpec["briefCustom"];
    styleFamilies?: SkillSpec["styleFamilies"];
    body: string;
}): string;
