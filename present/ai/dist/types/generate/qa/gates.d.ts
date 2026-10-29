import { type Presentation } from "@sliiu/present-core";
export type GateKind = "cover-visual" | "no-bullets" | "text-overlap" | "web-exclusive" | "speaker-notes" | "banned-imagery";
export interface GateFinding {
    kind: GateKind;
    /** 失败的 slide 索引（0-based）；全局性失败时 -1。 */
    slideIdx: number;
    /** 失败描述（可直接展示给用户）。 */
    issue: string;
}
export interface GateResult {
    passed: boolean;
    findings: GateFinding[];
}
/** Ensure cover/section/closing have image bg + dark overlay (P0 cover-visual). */
export declare function ensureCoverVisual(pres: Presentation): void;
/**
 * Nudge overlapping text apart + clamp into canvas (P0 text-overlap).
 *
 * Must match `checkTextOverlapAndClipping` for WHEN to act (ratio > 0.12 or clip),
 * but geometry must also stay inside Design spacing floors:
 * - H-margin ≥ 0.04 * short (+1 pad, same as ensureDesignSpacing)
 * - vertical separation uses Design block minGap (not 2px) so a final
 *   ensureNoTextOverlap does not re-break spacing after Design ensures.
 *
 * Do NOT enforce minGap on non-overlapping side-by-side cards (Seed 11 hole #1).
 */
export declare function ensureNoTextOverlap(pres: Presentation): void;
export declare function runP0Gates(pres: Presentation): GateResult;
export declare const GATE_KINDS: GateKind[];
export declare function tallyGateFindings(findings: GateFinding[]): Record<GateKind, number>;
