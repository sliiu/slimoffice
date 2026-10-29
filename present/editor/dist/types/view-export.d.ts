import type { VbaModuleKind, VbaModuleMeta, VbaProjectMeta } from "@sliiu/present-core";
/** One-line auxiliary window count for chips and copy summaries. */
export declare function formatAuxWindowCountLine(count: number): string;
export interface AuxSessionSummary {
    sessionId?: string;
    auxWindowCount: number;
    fileName?: string;
    slideIndex?: number;
    windowIndex?: number | null;
    isAuxChild?: boolean;
}
/** Plain-text summary of the current auxiliary editor session (parent or child). */
export declare function exportAuxSessionSummaryText(summary: AuxSessionSummary): string;
/** Plain-text VBA project metadata summary for copy / support tickets. */
export declare function exportVbaProjectSummaryText(meta: VbaProjectMeta | undefined, opts?: {
    hasProjectBytes?: boolean;
}): string;
/** Plain-text procedure index across all modules (read-only). */
export declare function exportVbaProcedureIndexText(projectBytes: Uint8Array, modules: Array<Pick<VbaModuleMeta, "name" | "streamName">>, codepage?: number): string;
/** Count modules by VBA kind. */
export declare function summarizeVbaModuleKinds(modules: readonly VbaModuleMeta[]): Partial<Record<VbaModuleKind, number>>;
export declare function filterVbaModulesByKind(modules: readonly VbaModuleMeta[], kind: VbaModuleKind | "all"): VbaModuleMeta[];
/** Plain-text module inventory (no procedure bodies). */
export declare function exportVbaModuleInventoryText(meta: VbaProjectMeta | undefined): string;
/** Total procedure count across readable modules. */
export declare function countVbaProceduresInProject(projectBytes: Uint8Array, modules: Array<Pick<VbaModuleMeta, "name" | "streamName">>, codepage?: number): number;
/** One-line module kind breakdown, e.g. `standard×2, class×1`. */
export declare function formatVbaModuleKindsLine(modules: readonly VbaModuleMeta[]): string;
/** One-line auxiliary session summary for chips and compact copy. */
export declare function formatAuxSessionCompactLine(summary: AuxSessionSummary): string;
/** Compact VBA project summary (no per-module listing). */
export declare function exportVbaProjectCompactText(meta: VbaProjectMeta | undefined, opts?: {
    hasProjectBytes?: boolean;
    procedureCount?: number;
}): string;
/** Procedure index with optional module-kind filter header. */
export declare function exportVbaProcedureIndexFilteredText(projectBytes: Uint8Array, modules: readonly VbaModuleMeta[], kind: VbaModuleKind | "all", codepage?: number): string;
/** One-line VBA project stats for dialogs and copy chips. */
export declare function formatVbaProjectStatsLine(meta: VbaProjectMeta | undefined, opts?: {
    procedureCount?: number;
    hasProjectBytes?: boolean;
}): string;
/** Module with the most indexed procedures (ties → first in list). */
export declare function vbaModuleWithMostProcedures(projectBytes: Uint8Array, modules: readonly VbaModuleMeta[], codepage?: number): {
    moduleName: string;
    count: number;
} | null;
/** Compact module inventory (comma-separated module names). */
export declare function exportVbaModuleInventoryCompactText(meta: VbaProjectMeta | undefined): string;
/** Compact procedure index (truncated per module). */
export declare function exportVbaProcedureIndexCompactText(projectBytes: Uint8Array, modules: readonly VbaModuleMeta[], kind?: VbaModuleKind | "all", codepage?: number): string;
/** Labeled compact auxiliary session text for copy. */
export declare function exportAuxSessionCompactText(summary: AuxSessionSummary): string;
/** One-line view workspace stats (aux + optional VBA + layout). */
export declare function formatViewWorkspaceStatsLine(opts: {
    aux: AuxSessionSummary;
    vbaMeta?: VbaProjectMeta;
    procedureCount?: number;
    hasProjectBytes?: boolean;
    layout?: {
        mode: string;
        windowCount: number;
        screenWidth: number;
        screenHeight: number;
    };
}): string;
/** One-line view workspace readiness for status chips. */
export declare function formatViewReadinessLine(opts: {
    aux: AuxSessionSummary;
    vbaMeta?: VbaProjectMeta;
    hasProjectBytes?: boolean;
    procedureCount?: number;
    layout?: {
        mode: string;
        windowCount: number;
    };
}): string;
/** Average procedures per module (0 if no modules). */
export declare function averageVbaProceduresPerModule(projectBytes: Uint8Array, modules: readonly VbaModuleMeta[], codepage?: number): number;
/** Module names with zero indexed procedures. */
export declare function vbaModulesWithoutProcedures(projectBytes: Uint8Array, modules: readonly VbaModuleMeta[], codepage?: number): string[];
/** Modules with at least one indexed procedure. */
export declare function countVbaModulesWithProcedures(projectBytes: Uint8Array, modules: readonly VbaModuleMeta[], codepage?: number): number;
/** Count of modules with zero indexed procedures. */
export declare function countVbaModulesWithoutProcedures(projectBytes: Uint8Array, modules: readonly VbaModuleMeta[], codepage?: number): number;
/** One-line module procedure coverage, e.g. `2 with procedures · 1 empty · avg 1.5/module`. */
export declare function formatVbaModuleCoverageBreakdownLine(projectBytes: Uint8Array, modules: readonly VbaModuleMeta[], codepage?: number): string;
/** Module with the fewest procedures among non-empty modules (ties → first in list). */
export declare function vbaModuleWithFewestProcedures(projectBytes: Uint8Array, modules: readonly VbaModuleMeta[], codepage?: number): {
    moduleName: string;
    count: number;
} | null;
/** One-line spread between fewest and busiest non-empty modules. */
export declare function formatVbaProcedureSpreadLine(projectBytes: Uint8Array, modules: readonly VbaModuleMeta[], codepage?: number): string;
/** Labeled VBA module coverage export for copy. */
export declare function exportVbaModuleCoverageText(projectBytes: Uint8Array, modules: readonly VbaModuleMeta[], codepage?: number): string;
/** One-line auxiliary session coverage for status chips. */
export declare function formatAuxSessionCoverageBreakdownLine(summary: AuxSessionSummary): string;
/** Labeled auxiliary session coverage export for copy. */
export declare function exportAuxSessionCoverageText(summary: AuxSessionSummary): string;
/** Comma-separated empty module list for copy. */
export declare function exportVbaEmptyModulesText(projectBytes: Uint8Array, modules: readonly VbaModuleMeta[], codepage?: number): string;
/** One-line VBA readiness for status chips. */
export declare function formatVbaReadinessLine(meta: VbaProjectMeta | undefined, opts?: {
    procedureCount?: number;
    hasProjectBytes?: boolean;
}): string;
/** Labeled VBA readiness export for copy. */
export declare function exportVbaReadinessText(meta: VbaProjectMeta | undefined, opts?: {
    procedureCount?: number;
    hasProjectBytes?: boolean;
    projectBytes?: Uint8Array;
    codepage?: number;
}): string;
/** One-line layout readiness for status chips. */
export declare function formatLayoutReadinessLine(layout?: {
    mode: string;
    windowCount: number;
    screenWidth?: number;
    screenHeight?: number;
}): string;
/** Labeled layout readiness export for copy. */
export declare function exportLayoutReadinessText(layout: {
    mode: string;
    windowCount: number;
    screenWidth: number;
    screenHeight: number;
}): string;
/** Labeled view workspace readiness export for copy. */
export declare function exportViewReadinessText(opts: {
    aux: AuxSessionSummary;
    vbaMeta?: VbaProjectMeta;
    procedureCount?: number;
    hasProjectBytes?: boolean;
    projectBytes?: Uint8Array;
    codepage?: number;
    layout?: {
        mode: string;
        windowCount: number;
        screenWidth?: number;
        screenHeight?: number;
    };
}): string;
/** Labeled view workspace stats export for copy. */
export declare function exportViewWorkspaceStatsText(opts: {
    aux: AuxSessionSummary;
    vbaMeta?: VbaProjectMeta;
    procedureCount?: number;
    hasProjectBytes?: boolean;
    layout?: {
        mode: string;
        windowCount: number;
        screenWidth: number;
        screenHeight: number;
    };
}): string;
/** Plain-text workspace summary for parent editor (aux + optional VBA). */
export declare function exportViewWorkspaceSummaryText(opts: {
    aux: AuxSessionSummary;
    vbaMeta?: VbaProjectMeta;
    layout?: {
        mode: string;
        windowCount: number;
        screenWidth: number;
        screenHeight: number;
    };
}): string;
/** Compact workspace summary (one-liners). */
export declare function exportViewWorkspaceCompactText(opts: {
    aux: AuxSessionSummary;
    vbaMeta?: VbaProjectMeta;
    layout?: {
        mode: string;
        windowCount: number;
        screenWidth: number;
        screenHeight: number;
    };
}): string;
