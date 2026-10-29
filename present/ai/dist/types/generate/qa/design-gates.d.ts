import type { Presentation } from "@sliiu/present-core";
import { type VisualSystemId } from "../visual-system.js";
export type DesignGateKind = "type-floor" | "spacing" | "layout-catalog" | "visual-system";
export interface DesignGateFinding {
    kind: DesignGateKind;
    slideIdx: number;
    issue: string;
}
export interface DesignGateResult {
    passed: boolean;
    findings: DesignGateFinding[];
}
export interface DesignGateOptions {
    visualSystem?: VisualSystemId | string;
}
export declare const DESIGN_LAYOUT_CATALOG: readonly [...("agenda" | "banner" | "bullets" | "cards" | "chart" | "closing" | "comparison" | "content" | "cover" | "hero" | "image-text" | "metrics" | "process" | "quote" | "section" | "stat" | "table" | "timeline" | "two-column")[], "hero-fullbleed", "section-break", "title-body", "cards-2", "cards-3", "cards-4", "process-h", "stat-row", "closing-cta"];
export declare function canonicalizeLayoutId(raw: string): string;
export declare function isInDesignCatalog(id: string): boolean;
export declare function isDesignWebExclusive(id: string): boolean;
export declare const TYPE_FLOORS_PT: {
    readonly coverSectionTitle: 36;
    readonly inSectionMajor: 28;
    readonly subtitle: 20;
    readonly bodyCard: 16;
    readonly footnote: 12;
};
/**
 * Keep compile layout kinds on slide.name when they are already in the catalog.
 * Only fill empty / invented names (titles, "Title Slide", …) from outline hints
 * or a positional fallback — never clobber a remapped compile kind with the
 * original outline layoutHint (that used to fail layout-catalog and P0 web quota).
 */
export declare function ensureDesignLayoutCatalog(pres: Presentation, hints?: Array<string | undefined>): void;
/** Nudge geometry so Design spacing floors pass (in-place, best-effort). */
export declare function ensureDesignSpacing(pres: Presentation): void;
/** Raise undersized text runs to Design type floors (in-place). */
export declare function ensureDesignTypeFloors(pres: Presentation): void;
/** Cap title line-count proxy so Design type-floor "title squeezed" clears (in-place).
 *  Heuristic uses bbox.h / (size*1.25) when text is a single explicit line — shrink height
 *  (and bump size if needed). Must run AFTER spacing scale.
 */
export declare function ensureDesignTitleLines(pres: Presentation): void;
export declare function runDesignGates(pres: Presentation, opts?: DesignGateOptions): DesignGateResult;
export declare const DESIGN_GATE_KINDS: DesignGateKind[];
export declare function tallyDesignGateFindings(findings: DesignGateFinding[]): Record<DesignGateKind, number>;
