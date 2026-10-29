import type { Presentation } from "@sliiu/present-core";
export interface DesignerAiFinding {
    slideIdx: number;
    severity: string;
    category: string;
    issue: string;
    suggestion: string;
}
export interface DesignerAiResult {
    overall: string;
    score: number;
    findings: DesignerAiFinding[];
    pendingFixes?: number;
    onApplySafeFixes?: () => {
        applied: number;
        skipped: number;
    };
}
export interface DesignerDialogOptions {
    pres: Presentation;
    onJumpToSlide: (idx: number) => void;
    aiAvailable?: boolean;
    onRunAiReview?: (signal: AbortSignal) => Promise<DesignerAiResult | null>;
    onAfterApplyFixes?: () => void;
}
export declare function openDesignerDialog(doc: Document, opts: DesignerDialogOptions): void;
