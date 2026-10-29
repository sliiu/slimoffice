import type { HostSkillStore } from "../../skills/types.js";
import type { GuidanceInput, Outline, OutlineItem } from "../schema.js";
import type { Manuscript, SlideBrief } from "./roles.js";
export declare function researchSystemPrompt(host?: HostSkillStore): string;
export declare function researchUserPrompt(guidance: GuidanceInput, outline: Outline): string;
export declare function contentOrganizerSystemPrompt(): string;
export declare function contentOrganizerUserPrompt(args: {
    outline: Outline;
    item: OutlineItem;
    slideIdx: number;
    manuscript: Manuscript;
    language?: string;
}): string;
export declare function organizeDeckSystemPrompt(host?: HostSkillStore): string;
export declare function organizeDeckUserPrompt(args: {
    outline: Outline;
    manuscript: Manuscript;
    language?: string;
}): string;
export declare function painterSystemPrompt(args: {
    host?: HostSkillStore;
    mode: "freeform" | "reference";
    allowImagery: boolean;
    styleFamily?: string;
    hasDesignBrief?: boolean;
}): string;
export declare function painterUserPrompt(args: {
    outline: Outline;
    item: OutlineItem;
    slideIdx: number;
    brief: SlideBrief;
    manuscript: Manuscript;
    language?: string;
    styleFamily?: string;
    designBrief?: string;
    slotMap?: string;
    size: {
        width: number;
        height: number;
    };
    palette?: Record<string, string>;
    guidance?: GuidanceInput;
    snapshot?: string;
    findings?: string;
}): string;
export declare function directorSystemPrompt(args: {
    host?: HostSkillStore;
    styleFamily?: string;
    hasDesignBrief?: boolean;
}): string;
export declare function directorUserPrompt(args: {
    outline: Outline;
    size: {
        width: number;
        height: number;
    };
    snapshot: string;
    language?: string;
    styleFamily?: string;
    palette?: Record<string, string>;
    guidance?: GuidanceInput;
}): string;
export declare function reflectorSystemPrompt(host?: HostSkillStore): string;
export declare function reflectorUserPrompt(outline: Outline, guidance?: GuidanceInput, findings?: string): string;
export declare function themeAgentUserPrompt(guidance: GuidanceInput): string;
export declare function motionAgentUserPrompt(args: {
    style?: string;
    topic?: string;
}): string;
