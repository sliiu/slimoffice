import type { SkillView } from "./types.js";
/** Keys aligned with GuidanceInput / generate wizard content fields. */
export declare const GENERATE_BRIEF_FIELD_IDS: readonly ["topic", "audience", "scenario", "goals", "styleFamily", "slideCount", "language", "extraNotes"];
export type GenerateBriefFieldId = (typeof GENERATE_BRIEF_FIELD_IDS)[number];
export declare function isGenerateBriefFieldId(s: string): s is GenerateBriefFieldId;
/** Parse `briefFields: audience, scenario, goals` from skill frontmatter. */
export declare function parseBriefFieldsCsv(raw: string | undefined): GenerateBriefFieldId[];
export declare function formatBriefFieldsCsv(fields: GenerateBriefFieldId[] | undefined): string;
export interface BriefFieldValues {
    topic: string;
    audience: string;
    scenario: string;
    goals: string;
    styleFamily: string;
    /** Design P1 visual system (wizard default A). */
    visualSystem: "A" | "B";
    slideCount: string;
    language: string;
    extraNotes: string;
}
export interface ResolvedBriefField {
    field: GenerateBriefFieldId;
    /** Skill display names that requested this field. */
    requestedBy: string[];
}
export interface ResolvedCustomBriefField {
    /** 自由文本 label（skill frontmatter `briefCustom` 里的原文，如"品牌主色"）。 */
    label: string;
    /** Skill display names that requested this field. */
    requestedBy: string[];
}
/**
 * Union free-form briefCustom labels from enabled generate-affecting skills.
 * 同名 label（大小写不敏感）合并 requestedBy；显示用第一次出现的原文。
 */
export declare function resolveCustomBriefFields(skills: Array<Pick<SkillView, "id" | "name" | "enabled" | "stage" | "briefCustom">>): ResolvedCustomBriefField[];
/** Union briefFields from enabled skills that affect the generate path. */
export declare function resolveRequiredBriefFields(skills: Array<Pick<SkillView, "id" | "name" | "enabled" | "stage" | "briefFields">>): ResolvedBriefField[];
export declare function isBriefFieldFilled(field: GenerateBriefFieldId, values: BriefFieldValues): boolean;
/** True if any skill (enabled or not) declares this field in briefFields. */
export declare function isSkillGatedBriefField(skills: Array<Pick<SkillView, "stage" | "briefFields">>, field: GenerateBriefFieldId): boolean;
/** Content-step visibility: always on unless skill-gated and no enabled skill requests it. */
export declare function isBriefFieldVisibleForGenerate(skills: Array<Pick<SkillView, "id" | "name" | "enabled" | "stage" | "briefFields">>, field: GenerateBriefFieldId): boolean;
