import type { VbaModuleKind, VbaModuleMeta, VbaProjectMeta } from "@ppt/core";
import { indexVbaProceduresInProject } from "@ppt/parser";

const MODULE_KIND_LABEL: Record<string, string> = {
  standard: "standard",
  document: "document",
  class: "class",
};

/** One-line auxiliary window count for chips and copy summaries. */
export function formatAuxWindowCountLine(count: number): string {
  if (count <= 0) return "No auxiliary editor windows";
  return count === 1 ? "1 auxiliary editor window" : `${count} auxiliary editor windows`;
}

export interface AuxSessionSummary {
  sessionId?: string;
  auxWindowCount: number;
  fileName?: string;
  slideIndex?: number;
  windowIndex?: number | null;
  isAuxChild?: boolean;
}

/** Plain-text summary of the current auxiliary editor session (parent or child). */
export function exportAuxSessionSummaryText(summary: AuxSessionSummary): string {
  const lines: string[] = ["Auxiliary editor session"];
  if (summary.sessionId) lines.push(`Session: ${summary.sessionId}`);
  lines.push(`Role: ${summary.isAuxChild ? "auxiliary child window" : "parent editor"}`);
  if (summary.fileName?.trim()) lines.push(`File: ${summary.fileName.trim()}`);
  if (summary.slideIndex != null && summary.slideIndex >= 0) {
    lines.push(`Slide: ${summary.slideIndex + 1}`);
  }
  if (summary.windowIndex != null && summary.windowIndex > 0) {
    lines.push(`Window index: ${summary.windowIndex}`);
  }
  if (!summary.isAuxChild) {
    lines.push(formatAuxWindowCountLine(summary.auxWindowCount));
  }
  return lines.join("\n");
}

function moduleKindLine(kind: string): string {
  return MODULE_KIND_LABEL[kind] ?? kind;
}

/** Plain-text VBA project metadata summary for copy / support tickets. */
export function exportVbaProjectSummaryText(
  meta: VbaProjectMeta | undefined,
  opts: { hasProjectBytes?: boolean } = {},
): string {
  const lines: string[] = ["VBA project (read-only)"];
  if (meta?.projectName) lines.push(`Project: ${meta.projectName}`);
  if (meta?.codepage) lines.push(`Code page: ${meta.codepage}`);
  if (meta?.byteSize) lines.push(`Size: ${meta.byteSize.toLocaleString()} B`);
  lines.push(`Modules: ${meta?.modules?.length ?? 0}`);
  if (opts.hasProjectBytes) lines.push("Project bytes: available");
  else lines.push("Project bytes: unavailable");
  if (meta?.warnings?.length) {
    lines.push(`Warnings: ${meta.warnings.join(", ")}`);
  }
  for (const m of meta?.modules ?? []) {
    const stream = m.streamName ? ` · ${m.streamName}` : "";
    lines.push(`  - ${m.name} (${moduleKindLine(m.kind)})${stream}`);
  }
  return lines.join("\n");
}

/** Plain-text procedure index across all modules (read-only). */
export function exportVbaProcedureIndexText(
  projectBytes: Uint8Array,
  modules: Array<Pick<VbaModuleMeta, "name" | "streamName">>,
  codepage = 1252,
): string {
  const index = indexVbaProceduresInProject(projectBytes, modules, codepage);
  const lines: string[] = ["VBA procedure index (read-only)"];
  let total = 0;
  for (const entry of index) {
    total += entry.procedures.length;
    if (!entry.procedures.length) {
      lines.push(`${entry.moduleName}: (none)`);
      continue;
    }
    lines.push(`${entry.moduleName}: ${entry.procedures.join(", ")}`);
  }
  lines.push(`Total procedures: ${total}`);
  return lines.join("\n");
}

/** Count modules by VBA kind. */
export function summarizeVbaModuleKinds(
  modules: readonly VbaModuleMeta[],
): Partial<Record<VbaModuleKind, number>> {
  const out: Partial<Record<VbaModuleKind, number>> = {};
  for (const module of modules) {
    out[module.kind] = (out[module.kind] ?? 0) + 1;
  }
  return out;
}

export function filterVbaModulesByKind(
  modules: readonly VbaModuleMeta[],
  kind: VbaModuleKind | "all",
): VbaModuleMeta[] {
  if (kind === "all") return [...modules];
  return modules.filter((module) => module.kind === kind);
}

/** Plain-text module inventory (no procedure bodies). */
export function exportVbaModuleInventoryText(meta: VbaProjectMeta | undefined): string {
  const modules = meta?.modules ?? [];
  const lines: string[] = ["VBA module inventory (read-only)"];
  if (meta?.projectName) lines.push(`Project: ${meta.projectName}`);
  lines.push(`Modules: ${modules.length}`);
  const kinds = summarizeVbaModuleKinds(modules);
  const kindParts = Object.entries(kinds).map(([kind, n]) => `${kind}×${n}`);
  if (kindParts.length) lines.push(`Kinds: ${kindParts.join(", ")}`);
  lines.push("");
  if (!modules.length) {
    lines.push("No modules listed.");
    return lines.join("\n");
  }
  for (const module of modules) {
    const stream = module.streamName ? ` · ${module.streamName}` : "";
    lines.push(`- ${module.name} (${moduleKindLine(module.kind)})${stream}`);
  }
  return lines.join("\n");
}

/** Total procedure count across readable modules. */
export function countVbaProceduresInProject(
  projectBytes: Uint8Array,
  modules: Array<Pick<VbaModuleMeta, "name" | "streamName">>,
  codepage = 1252,
): number {
  return indexVbaProceduresInProject(projectBytes, modules, codepage).reduce(
    (sum, entry) => sum + entry.procedures.length,
    0,
  );
}

/** One-line module kind breakdown, e.g. `standard×2, class×1`. */
export function formatVbaModuleKindsLine(modules: readonly VbaModuleMeta[]): string {
  const kinds = summarizeVbaModuleKinds(modules);
  const parts = Object.entries(kinds).map(([kind, count]) => `${kind}×${count}`);
  return parts.length ? parts.join(", ") : "none";
}

/** One-line auxiliary session summary for chips and compact copy. */
export function formatAuxSessionCompactLine(summary: AuxSessionSummary): string {
  const parts: string[] = [summary.isAuxChild ? "aux child" : "parent"];
  if (summary.sessionId) parts.push(`session ${summary.sessionId}`);
  if (summary.fileName?.trim()) parts.push(summary.fileName.trim());
  if (summary.slideIndex != null && summary.slideIndex >= 0) {
    parts.push(`slide ${summary.slideIndex + 1}`);
  }
  if (summary.windowIndex != null && summary.windowIndex > 0) {
    parts.push(`window ${summary.windowIndex}`);
  }
  if (!summary.isAuxChild) parts.push(formatAuxWindowCountLine(summary.auxWindowCount));
  return parts.join(" · ");
}

/** Compact VBA project summary (no per-module listing). */
export function exportVbaProjectCompactText(
  meta: VbaProjectMeta | undefined,
  opts: { hasProjectBytes?: boolean; procedureCount?: number } = {},
): string {
  const modules = meta?.modules ?? [];
  const lines: string[] = ["VBA project (compact)"];
  if (meta?.projectName) lines.push(`Project: ${meta.projectName}`);
  lines.push(`Modules: ${modules.length} · ${formatVbaModuleKindsLine(modules)}`);
  if (opts.procedureCount != null) lines.push(`Procedures: ${opts.procedureCount}`);
  lines.push(opts.hasProjectBytes ? "Project bytes: available" : "Project bytes: unavailable");
  if (meta?.warnings?.length) lines.push(`Warnings: ${meta.warnings.length}`);
  return lines.join("\n");
}

/** Procedure index with optional module-kind filter header. */
export function exportVbaProcedureIndexFilteredText(
  projectBytes: Uint8Array,
  modules: readonly VbaModuleMeta[],
  kind: VbaModuleKind | "all",
  codepage = 1252,
): string {
  const filtered = filterVbaModulesByKind(modules, kind);
  const body = exportVbaProcedureIndexText(projectBytes, filtered, codepage);
  if (kind === "all") return body;
  return [`VBA procedure index (filter: ${kind})`, "", body].join("\n");
}

/** One-line VBA project stats for dialogs and copy chips. */
export function formatVbaProjectStatsLine(
  meta: VbaProjectMeta | undefined,
  opts: { procedureCount?: number; hasProjectBytes?: boolean } = {},
): string {
  const modules = meta?.modules ?? [];
  const parts: string[] = [`${modules.length} module(s)`];
  if (modules.length) parts.push(formatVbaModuleKindsLine(modules));
  if (opts.procedureCount != null) parts.push(`${opts.procedureCount} procedure(s)`);
  if (opts.hasProjectBytes != null) {
    parts.push(opts.hasProjectBytes ? "bytes available" : "bytes unavailable");
  }
  if (meta?.byteSize) parts.push(`${meta.byteSize.toLocaleString()} B`);
  return parts.join(" · ");
}

/** Module with the most indexed procedures (ties → first in list). */
export function vbaModuleWithMostProcedures(
  projectBytes: Uint8Array,
  modules: readonly VbaModuleMeta[],
  codepage = 1252,
): { moduleName: string; count: number } | null {
  const index = indexVbaProceduresInProject(projectBytes, [...modules], codepage);
  let best: { moduleName: string; count: number } | null = null;
  for (const entry of index) {
    const count = entry.procedures.length;
    if (!count) continue;
    if (!best || count > best.count) {
      best = { moduleName: entry.moduleName, count };
    }
  }
  return best;
}

/** Compact module inventory (comma-separated module names). */
export function exportVbaModuleInventoryCompactText(meta: VbaProjectMeta | undefined): string {
  const modules = meta?.modules ?? [];
  const parts: string[] = ["VBA modules (compact)"];
  if (meta?.projectName) parts.push(meta.projectName);
  parts.push(`${modules.length} module(s)`);
  if (modules.length) {
    parts.push(modules.map((m) => `${m.name}(${moduleKindLine(m.kind)})`).join(", "));
  } else {
    parts.push("none");
  }
  return parts.join(" · ");
}

/** Compact procedure index (truncated per module). */
export function exportVbaProcedureIndexCompactText(
  projectBytes: Uint8Array,
  modules: readonly VbaModuleMeta[],
  kind: VbaModuleKind | "all" = "all",
  codepage = 1252,
): string {
  const filtered = filterVbaModulesByKind(modules, kind);
  const index = indexVbaProceduresInProject(projectBytes, filtered, codepage);
  const parts: string[] = [
    kind === "all" ? "VBA procedures (compact)" : `VBA procedures (compact · ${kind})`,
  ];
  let total = 0;
  for (const entry of index) {
    total += entry.procedures.length;
    if (!entry.procedures.length) continue;
    const list =
      entry.procedures.length > 6
        ? `${entry.procedures.slice(0, 6).join(", ")} +${entry.procedures.length - 6}`
        : entry.procedures.join(", ");
    parts.push(`${entry.moduleName}: ${list}`);
  }
  parts.push(`total ${total}`);
  return parts.join(" · ");
}

/** Labeled compact auxiliary session text for copy. */
export function exportAuxSessionCompactText(summary: AuxSessionSummary): string {
  return ["Aux session (compact)", formatAuxSessionCompactLine(summary)].join(" · ");
}

/** One-line view workspace stats (aux + optional VBA + layout). */
export function formatViewWorkspaceStatsLine(opts: {
  aux: AuxSessionSummary;
  vbaMeta?: VbaProjectMeta;
  procedureCount?: number;
  hasProjectBytes?: boolean;
  layout?: { mode: string; windowCount: number; screenWidth: number; screenHeight: number };
}): string {
  const parts: string[] = [
    opts.aux.isAuxChild ? "aux child" : "parent",
    opts.aux.auxWindowCount > 0
      ? `${opts.aux.auxWindowCount} aux window(s)`
      : "no aux windows",
  ];
  if (opts.aux.fileName?.trim()) parts.push(opts.aux.fileName.trim());
  if (opts.aux.slideIndex != null && opts.aux.slideIndex >= 0) {
    parts.push(`slide ${opts.aux.slideIndex + 1}`);
  }
  if (opts.vbaMeta) {
    parts.push(`VBA ${formatVbaProjectStatsLine(opts.vbaMeta, {
      procedureCount: opts.procedureCount,
      hasProjectBytes: opts.hasProjectBytes,
    })}`);
  }
  if (opts.layout) {
    parts.push(`layout ${opts.layout.mode} · ${opts.layout.windowCount} window(s)`);
  }
  return parts.join(" · ");
}

/** One-line view workspace readiness for status chips. */
export function formatViewReadinessLine(opts: {
  aux: AuxSessionSummary;
  vbaMeta?: VbaProjectMeta;
  hasProjectBytes?: boolean;
  procedureCount?: number;
  layout?: { mode: string; windowCount: number };
}): string {
  const parts: string[] = ["View ready"];
  if (!opts.aux.isAuxChild && opts.aux.auxWindowCount > 0) {
    parts.push(`${opts.aux.auxWindowCount} aux window(s)`);
  }
  const moduleCount = opts.vbaMeta?.modules?.length ?? 0;
  if (moduleCount) {
    parts.push(`VBA ${moduleCount} module(s)`);
    parts.push(opts.hasProjectBytes ? "source readable" : "source unavailable");
    if (opts.procedureCount != null) parts.push(`${opts.procedureCount} procedure(s)`);
  }
  if (opts.layout) {
    parts.push(`last layout ${opts.layout.mode} · ${opts.layout.windowCount} window(s)`);
  }
  return parts.join(" · ");
}

/** Average procedures per module (0 if no modules). */
export function averageVbaProceduresPerModule(
  projectBytes: Uint8Array,
  modules: readonly VbaModuleMeta[],
  codepage = 1252,
): number {
  if (!modules.length) return 0;
  const total = countVbaProceduresInProject(projectBytes, [...modules], codepage);
  return Math.round((total / modules.length) * 10) / 10;
}

/** Module names with zero indexed procedures. */
export function vbaModulesWithoutProcedures(
  projectBytes: Uint8Array,
  modules: readonly VbaModuleMeta[],
  codepage = 1252,
): string[] {
  return indexVbaProceduresInProject(projectBytes, [...modules], codepage)
    .filter((entry) => !entry.procedures.length)
    .map((entry) => entry.moduleName);
}

/** Modules with at least one indexed procedure. */
export function countVbaModulesWithProcedures(
  projectBytes: Uint8Array,
  modules: readonly VbaModuleMeta[],
  codepage = 1252,
): number {
  return indexVbaProceduresInProject(projectBytes, [...modules], codepage).filter(
    (entry) => entry.procedures.length > 0,
  ).length;
}

/** Count of modules with zero indexed procedures. */
export function countVbaModulesWithoutProcedures(
  projectBytes: Uint8Array,
  modules: readonly VbaModuleMeta[],
  codepage = 1252,
): number {
  return vbaModulesWithoutProcedures(projectBytes, modules, codepage).length;
}

/** One-line module procedure coverage, e.g. `2 with procedures · 1 empty · avg 1.5/module`. */
export function formatVbaModuleCoverageBreakdownLine(
  projectBytes: Uint8Array,
  modules: readonly VbaModuleMeta[],
  codepage = 1252,
): string {
  if (!modules.length) return "Module coverage: none";
  const withProcs = countVbaModulesWithProcedures(projectBytes, modules, codepage);
  const empty = countVbaModulesWithoutProcedures(projectBytes, modules, codepage);
  const parts = [`${withProcs} with procedure(s)`, `${empty} empty`];
  const avg = averageVbaProceduresPerModule(projectBytes, modules, codepage);
  if (avg > 0) parts.push(`avg ${avg}/module`);
  return parts.join(" · ");
}

/** Module with the fewest procedures among non-empty modules (ties → first in list). */
export function vbaModuleWithFewestProcedures(
  projectBytes: Uint8Array,
  modules: readonly VbaModuleMeta[],
  codepage = 1252,
): { moduleName: string; count: number } | null {
  const index = indexVbaProceduresInProject(projectBytes, [...modules], codepage);
  let best: { moduleName: string; count: number } | null = null;
  for (const entry of index) {
    const count = entry.procedures.length;
    if (count <= 0) continue;
    if (!best || count < best.count) {
      best = { moduleName: entry.moduleName, count };
    }
  }
  return best;
}

/** One-line spread between fewest and busiest non-empty modules. */
export function formatVbaProcedureSpreadLine(
  projectBytes: Uint8Array,
  modules: readonly VbaModuleMeta[],
  codepage = 1252,
): string {
  const busiest = vbaModuleWithMostProcedures(projectBytes, modules, codepage);
  const fewest = vbaModuleWithFewestProcedures(projectBytes, modules, codepage);
  if (!busiest && !fewest) return "Procedure spread: none";
  if (busiest && fewest && busiest.moduleName === fewest.moduleName) {
    return `Procedure spread: ${busiest.moduleName} ×${busiest.count}`;
  }
  if (busiest && fewest) {
    return `Procedure spread: ${fewest.count}–${busiest.count} (${fewest.moduleName} → ${busiest.moduleName})`;
  }
  const only = busiest ?? fewest;
  return only ? `Procedure spread: ${only.moduleName} ×${only.count}` : "Procedure spread: none";
}

/** Labeled VBA module coverage export for copy. */
export function exportVbaModuleCoverageText(
  projectBytes: Uint8Array,
  modules: readonly VbaModuleMeta[],
  codepage = 1252,
): string {
  return [
    "VBA module coverage",
    formatVbaModuleCoverageBreakdownLine(projectBytes, modules, codepage),
    formatVbaProcedureSpreadLine(projectBytes, modules, codepage),
    exportVbaEmptyModulesText(projectBytes, modules, codepage),
  ].join("\n");
}

/** One-line auxiliary session coverage for status chips. */
export function formatAuxSessionCoverageBreakdownLine(summary: AuxSessionSummary): string {
  const parts = [summary.isAuxChild ? "auxiliary child" : "parent editor"];
  if (!summary.isAuxChild) {
    parts.push(
      summary.auxWindowCount > 0
        ? `${summary.auxWindowCount} aux window(s)`
        : "no aux windows",
    );
  } else if (summary.windowIndex != null && summary.windowIndex > 0) {
    parts.push(`window ${summary.windowIndex}`);
  }
  if (summary.slideIndex != null && summary.slideIndex >= 0) {
    parts.push(`slide ${summary.slideIndex + 1}`);
  }
  return parts.join(" · ");
}

/** Labeled auxiliary session coverage export for copy. */
export function exportAuxSessionCoverageText(summary: AuxSessionSummary): string {
  return [
    "Aux session coverage",
    formatAuxSessionCoverageBreakdownLine(summary),
    formatAuxSessionCompactLine(summary),
  ].join("\n");
}

/** Comma-separated empty module list for copy. */
export function exportVbaEmptyModulesText(
  projectBytes: Uint8Array,
  modules: readonly VbaModuleMeta[],
  codepage = 1252,
): string {
  const empty = vbaModulesWithoutProcedures(projectBytes, modules, codepage);
  if (!empty.length) return "VBA empty modules: none";
  return `VBA empty modules (${empty.length}): ${empty.join(", ")}`;
}

/** One-line VBA readiness for status chips. */
export function formatVbaReadinessLine(
  meta: VbaProjectMeta | undefined,
  opts: { procedureCount?: number; hasProjectBytes?: boolean } = {},
): string {
  const modules = meta?.modules ?? [];
  const parts: string[] = ["VBA ready"];
  parts.push(`${modules.length} module(s)`);
  if (modules.length) parts.push(formatVbaModuleKindsLine(modules));
  if (opts.procedureCount != null) parts.push(`${opts.procedureCount} procedure(s)`);
  if (opts.hasProjectBytes != null) {
    parts.push(opts.hasProjectBytes ? "source readable" : "source unavailable");
  }
  return parts.join(" · ");
}

/** Labeled VBA readiness export for copy. */
export function exportVbaReadinessText(
  meta: VbaProjectMeta | undefined,
  opts: {
    procedureCount?: number;
    hasProjectBytes?: boolean;
    projectBytes?: Uint8Array;
    codepage?: number;
  } = {},
): string {
  const lines = [
    "VBA readiness",
    formatVbaReadinessLine(meta, opts),
    formatVbaProjectStatsLine(meta, opts),
  ];
  if (opts.projectBytes && meta?.modules?.length) {
    const codepage = opts.codepage ?? 1252;
    lines.push(
      formatVbaModuleCoverageBreakdownLine(opts.projectBytes, meta.modules, codepage),
    );
    lines.push(formatVbaProcedureSpreadLine(opts.projectBytes, meta.modules, codepage));
    lines.push(
      `Avg procedures/module: ${averageVbaProceduresPerModule(opts.projectBytes, meta.modules, codepage)}`,
    );
    lines.push(exportVbaEmptyModulesText(opts.projectBytes, meta.modules, codepage));
  }
  return lines.join("\n");
}

/** One-line layout readiness for status chips. */
export function formatLayoutReadinessLine(
  layout?: { mode: string; windowCount: number; screenWidth?: number; screenHeight?: number },
): string {
  if (!layout) return "Layout: none applied";
  const parts = [`Layout ready ${layout.mode}`, `${layout.windowCount} window(s)`];
  if (layout.screenWidth && layout.screenHeight) {
    parts.push(`${layout.screenWidth}×${layout.screenHeight}`);
  }
  return parts.join(" · ");
}

/** Labeled layout readiness export for copy. */
export function exportLayoutReadinessText(layout: {
  mode: string;
  windowCount: number;
  screenWidth: number;
  screenHeight: number;
}): string {
  return ["Layout readiness", formatLayoutReadinessLine(layout)].join("\n");
}

/** Labeled view workspace readiness export for copy. */
export function exportViewReadinessText(opts: {
  aux: AuxSessionSummary;
  vbaMeta?: VbaProjectMeta;
  procedureCount?: number;
  hasProjectBytes?: boolean;
  projectBytes?: Uint8Array;
  codepage?: number;
  layout?: { mode: string; windowCount: number; screenWidth?: number; screenHeight?: number };
}): string {
  const lines = [
    "View readiness",
    formatViewReadinessLine(opts),
    formatAuxSessionCoverageBreakdownLine(opts.aux),
    formatViewWorkspaceStatsLine({
      aux: opts.aux,
      vbaMeta: opts.vbaMeta,
      procedureCount: opts.procedureCount,
      hasProjectBytes: opts.hasProjectBytes,
      layout:
        opts.layout?.screenWidth && opts.layout.screenHeight
          ? {
              mode: opts.layout.mode,
              windowCount: opts.layout.windowCount,
              screenWidth: opts.layout.screenWidth,
              screenHeight: opts.layout.screenHeight,
            }
          : undefined,
    }),
  ];
  if (opts.projectBytes && opts.vbaMeta?.modules?.length) {
    lines.push(
      formatVbaModuleCoverageBreakdownLine(
        opts.projectBytes,
        opts.vbaMeta.modules,
        opts.codepage ?? opts.vbaMeta.codepage ?? 1252,
      ),
    );
    lines.push(
      formatVbaProcedureSpreadLine(
        opts.projectBytes,
        opts.vbaMeta.modules,
        opts.codepage ?? opts.vbaMeta.codepage ?? 1252,
      ),
    );
  }
  if (opts.layout) lines.push(formatLayoutReadinessLine(opts.layout));
  return lines.join("\n");
}

/** Labeled view workspace stats export for copy. */
export function exportViewWorkspaceStatsText(opts: {
  aux: AuxSessionSummary;
  vbaMeta?: VbaProjectMeta;
  procedureCount?: number;
  hasProjectBytes?: boolean;
  layout?: { mode: string; windowCount: number; screenWidth: number; screenHeight: number };
}): string {
  return ["View workspace stats", formatViewWorkspaceStatsLine(opts)].join("\n");
}

/** Plain-text workspace summary for parent editor (aux + optional VBA). */
export function exportViewWorkspaceSummaryText(opts: {
  aux: AuxSessionSummary;
  vbaMeta?: VbaProjectMeta;
  layout?: { mode: string; windowCount: number; screenWidth: number; screenHeight: number };
}): string {
  const lines: string[] = ["View workspace summary", exportAuxSessionSummaryText(opts.aux)];
  if (opts.vbaMeta) {
    lines.push("");
    lines.push(exportVbaModuleInventoryText(opts.vbaMeta));
  }
  if (opts.layout) {
    lines.push("");
    lines.push(
      `Last layout: ${opts.layout.mode} · ${opts.layout.windowCount} window(s) · ${opts.layout.screenWidth}×${opts.layout.screenHeight}`,
    );
  }
  return lines.join("\n");
}

/** Compact workspace summary (one-liners). */
export function exportViewWorkspaceCompactText(opts: {
  aux: AuxSessionSummary;
  vbaMeta?: VbaProjectMeta;
  layout?: { mode: string; windowCount: number; screenWidth: number; screenHeight: number };
}): string {
  const lines: string[] = ["View workspace (compact)", formatAuxSessionCompactLine(opts.aux)];
  if (opts.vbaMeta) {
    const modules = opts.vbaMeta.modules ?? [];
    lines.push(`VBA: ${modules.length} module(s) · ${formatVbaModuleKindsLine(modules)}`);
  }
  if (opts.layout) {
    lines.push(
      `Layout: ${opts.layout.mode} · ${opts.layout.windowCount} window(s) · ${opts.layout.screenWidth}×${opts.layout.screenHeight}`,
    );
  }
  return lines.join("\n");
}
