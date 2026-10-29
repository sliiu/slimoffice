import type { GuidanceInput, PresentationSpec } from "../schema.js";
export declare const FULL_BLEED_ROLES: readonly ["cover", "section", "closing", "hero"];
export declare const NO_BULLET_LAYOUTS: readonly ["cards", "process", "comparison", "metrics", "timeline", "chart", "agenda"];
export declare const WEB_EXCLUSIVE_LAYOUTS: readonly ["cards", "process", "comparison", "two-column"];
export declare const WEB_EXCLUSIVE_COUNT_KINDS: readonly ["cards", "process", "comparison", "two-column", "twocolumn", "metrics", "timeline", "chart"];
export declare const WEB_EXCLUSIVE_MIN_PAGES = 4;
export declare const WEB_EXCLUSIVE_DECK_MIN_SLIDES = 6;
export interface GenerateBriefConstraints {
    fullBleedRoles: typeof FULL_BLEED_ROLES;
    noBulletLayouts: typeof NO_BULLET_LAYOUTS;
    webExclusiveLayouts: typeof WEB_EXCLUSIVE_LAYOUTS;
    webExclusiveMinPages: typeof WEB_EXCLUSIVE_MIN_PAGES;
}
export declare const GENERATE_BRIEF_CONSTRAINTS: GenerateBriefConstraints;
export declare function isFullBleedRole(kind: string | undefined): boolean;
export declare function isNoBulletLayout(kind: string | undefined): boolean;
export declare function isWebExclusiveKind(kind: string | undefined): boolean;
export declare function applyCompileConstraints(spec: PresentationSpec, guidance?: Partial<GuidanceInput>): {
    spec: PresentationSpec;
    fixes: string[];
};
