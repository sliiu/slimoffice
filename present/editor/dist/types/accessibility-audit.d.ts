import type { Presentation } from "@sliiu/present-core";
import { type MessageKey } from "./i18n.js";
export type AccessibilityIssueKind = "contrast" | "empty-slide" | "tiny-text" | "missing-alt" | "image-overlap" | "missing-title";
export interface AccessibilityIssue {
    slideIndex: number;
    shapeId?: string;
    shapeName?: string;
    kind: AccessibilityIssueKind;
    /** Locale-specific text captured when the issue was built. Prefer `accessibilityIssueDetail`. */
    detail: string;
    /** When set, UI and copied reports re-translate instead of reusing `detail`. */
    detailKey?: MessageKey;
    detailParams?: Record<string, string | number>;
    /** When set, Review dialog can offer a one-click contrast fix. */
    suggestedColor?: string;
}
export interface AccessibilityReport {
    issues: AccessibilityIssue[];
    passed: number;
    checkedSlides: number;
}
/** Issue explanation in the current locale. Falls back to the stored `detail` string. */
export declare function accessibilityIssueDetail(issue: AccessibilityIssue): string;
/** Issues that can be fixed with SetTextStyleCmd color patch. */
export declare function contrastIssuesFromReport(report: AccessibilityReport): AccessibilityIssue[];
/** Issues that can be fixed with SetImageDescrCmd. */
export declare function missingAltIssuesFromReport(report: AccessibilityReport): AccessibilityIssue[];
/** Per-kind issue counts for filter chips / summary. */
export declare function summarizeAccessibilityByKind(report: AccessibilityReport): Partial<Record<AccessibilityIssueKind, number>>;
/** Suggested alt text from a non-generic shape name. */
export declare function suggestedImageAltText(shapeName: string | undefined): string;
/** 只读 WCAG 对比度 / 空页 / 过小字号 / 图片替代文本 / 图层遮挡扫描（不修改 presentation）。 */
export declare function auditPresentationAccessibility(pres: Presentation): AccessibilityReport;
