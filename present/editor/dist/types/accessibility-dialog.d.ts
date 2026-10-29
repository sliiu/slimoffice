import type { Presentation } from "@sliiu/present-core";
import { type AccessibilityIssue } from "./accessibility-audit.js";
export declare function openAccessibilityDialog(doc: Document, pres: Presentation, onJumpToSlide: (idx: number, shapeId?: string) => void, onFixIssue?: (issue: AccessibilityIssue) => void, onFixAllContrast?: (issues: AccessibilityIssue[]) => void, onFixAlt?: (issue: AccessibilityIssue, descr: string) => void): void;
