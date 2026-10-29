import type { Presentation } from "@sliiu/present-core";
export type DesignSuggestionSeverity = "error" | "warn" | "info";
export type DesignSuggestionCategory = "contrast" | "layout" | "imagery" | "typography" | "consistency" | "empty" | "density" | "placeholder";
export interface DesignSuggestion {
    id: string;
    severity: DesignSuggestionSeverity;
    category: DesignSuggestionCategory;
    slideIndex?: number;
    shapeId?: string;
    title: string;
    detail: string;
    action?: string;
}
export interface DesignAuditReport {
    suggestions: DesignSuggestion[];
    /** Heuristic 0–100; higher = fewer issues. */
    score: number;
    summary: string;
}
/** Read-only deck design audit (contrast, rhythm, imagery, density). Does not mutate presentation. */
export declare function auditPresentationDesign(pres: Presentation): DesignAuditReport;
