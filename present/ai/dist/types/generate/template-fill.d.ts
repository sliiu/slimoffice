import { type Presentation, type SlideMaster, type Template } from "@sliiu/present-core";
import type { Outline } from "./schema.js";
import type { GenerateOptions } from "./types.js";
import type { HostSkillStore } from "../skills/types.js";
import type { GuidanceInput } from "./schema.js";
export interface TemplateLayoutChoice {
    id: string;
    name: string;
    type: string;
    /** 占位符 type，按版式里的顺序，可重复（双栏两个 body）。 */
    placeholders: string[];
}
export declare function layoutsFromMasters(masters: readonly SlideMaster[] | undefined): TemplateLayoutChoice[];
export declare function layoutsFromTemplate(template: Template): TemplateLayoutChoice[];
export declare function templateUsesPlaceholders(template: Template): boolean;
export interface ResolvedVisualSource {
    /** 成稿填占位符，不走自由画布。 */
    fillPlaceholders: boolean;
    /** 没有任何文字占位符时，整页构图。和 fillPlaceholders 互斥。 */
    composition?: string;
    /** 有文字占位符时，大纲只跟疏密。 */
    density?: string;
}
/**
 * 有文字占位符就填占位符，页上构图只留下疏密。
 * 没有文字占位符、但记下了页上构图时，整页走自由画布。
 * 没有构图说明时，仍按版式模板填（含只有母版、没有幻灯片的上传）。
 */
export declare function resolveVisualSource(template?: Template, looseComposition?: string): ResolvedVisualSource;
/** 事实放不下专用版式时，写进带正文占位符的那一版；没有就用文字占位符最多的。 */
export declare function contentLayout(choices: readonly TemplateLayoutChoice[]): TemplateLayoutChoice | undefined;
export declare function assignTemplateLayouts(outline: Outline, choices: readonly TemplateLayoutChoice[]): Outline;
export declare function presentationFromTemplateOutline(template: Template, outline: Outline): Presentation;
/**
 * 占位符填完之后补对比度，以及框里放不下的字。不挪占位符的位置。
 * 缩排和自由画布走同一套质检。
 */
export declare function repairTemplateDeck(pres: Presentation): void;
export declare function templateOutlineSystemPrompt(choices: readonly TemplateLayoutChoice[], guidance: GuidanceInput, host?: HostSkillStore): string;
export declare function animateTemplateDeck(pres: Presentation, opts: GenerateOptions, outline?: Outline): void;
