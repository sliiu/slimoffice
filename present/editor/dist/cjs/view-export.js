"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatAuxWindowCountLine = formatAuxWindowCountLine;
exports.exportAuxSessionSummaryText = exportAuxSessionSummaryText;
exports.exportVbaProjectSummaryText = exportVbaProjectSummaryText;
exports.exportVbaProcedureIndexText = exportVbaProcedureIndexText;
exports.summarizeVbaModuleKinds = summarizeVbaModuleKinds;
exports.filterVbaModulesByKind = filterVbaModulesByKind;
exports.exportVbaModuleInventoryText = exportVbaModuleInventoryText;
exports.countVbaProceduresInProject = countVbaProceduresInProject;
exports.formatVbaModuleKindsLine = formatVbaModuleKindsLine;
exports.formatAuxSessionCompactLine = formatAuxSessionCompactLine;
exports.exportVbaProjectCompactText = exportVbaProjectCompactText;
exports.exportVbaProcedureIndexFilteredText = exportVbaProcedureIndexFilteredText;
exports.formatVbaProjectStatsLine = formatVbaProjectStatsLine;
exports.vbaModuleWithMostProcedures = vbaModuleWithMostProcedures;
exports.exportVbaModuleInventoryCompactText = exportVbaModuleInventoryCompactText;
exports.exportVbaProcedureIndexCompactText = exportVbaProcedureIndexCompactText;
exports.exportAuxSessionCompactText = exportAuxSessionCompactText;
exports.formatViewWorkspaceStatsLine = formatViewWorkspaceStatsLine;
exports.formatViewReadinessLine = formatViewReadinessLine;
exports.averageVbaProceduresPerModule = averageVbaProceduresPerModule;
exports.vbaModulesWithoutProcedures = vbaModulesWithoutProcedures;
exports.countVbaModulesWithProcedures = countVbaModulesWithProcedures;
exports.countVbaModulesWithoutProcedures = countVbaModulesWithoutProcedures;
exports.formatVbaModuleCoverageBreakdownLine = formatVbaModuleCoverageBreakdownLine;
exports.vbaModuleWithFewestProcedures = vbaModuleWithFewestProcedures;
exports.formatVbaProcedureSpreadLine = formatVbaProcedureSpreadLine;
exports.exportVbaModuleCoverageText = exportVbaModuleCoverageText;
exports.formatAuxSessionCoverageBreakdownLine = formatAuxSessionCoverageBreakdownLine;
exports.exportAuxSessionCoverageText = exportAuxSessionCoverageText;
exports.exportVbaEmptyModulesText = exportVbaEmptyModulesText;
exports.formatVbaReadinessLine = formatVbaReadinessLine;
exports.exportVbaReadinessText = exportVbaReadinessText;
exports.formatLayoutReadinessLine = formatLayoutReadinessLine;
exports.exportLayoutReadinessText = exportLayoutReadinessText;
exports.exportViewReadinessText = exportViewReadinessText;
exports.exportViewWorkspaceStatsText = exportViewWorkspaceStatsText;
exports.exportViewWorkspaceSummaryText = exportViewWorkspaceSummaryText;
exports.exportViewWorkspaceCompactText = exportViewWorkspaceCompactText;
const parser_1 = require("@sliiu/present-parser");
const MODULE_KIND_LABEL = {
    standard: "standard",
    document: "document",
    class: "class",
};
/** One-line auxiliary window count for chips and copy summaries. */
function formatAuxWindowCountLine(count) {
    if (count <= 0)
        return "No auxiliary editor windows";
    return count === 1 ? "1 auxiliary editor window" : `${count} auxiliary editor windows`;
}
/** Plain-text summary of the current auxiliary editor session (parent or child). */
function exportAuxSessionSummaryText(summary) {
    const lines = ["Auxiliary editor session"];
    if (summary.sessionId)
        lines.push(`Session: ${summary.sessionId}`);
    lines.push(`Role: ${summary.isAuxChild ? "auxiliary child window" : "parent editor"}`);
    if (summary.fileName?.trim())
        lines.push(`File: ${summary.fileName.trim()}`);
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
function moduleKindLine(kind) {
    return MODULE_KIND_LABEL[kind] ?? kind;
}
/** Plain-text VBA project metadata summary for copy / support tickets. */
function exportVbaProjectSummaryText(meta, opts = {}) {
    const lines = ["VBA project (read-only)"];
    if (meta?.projectName)
        lines.push(`Project: ${meta.projectName}`);
    if (meta?.codepage)
        lines.push(`Code page: ${meta.codepage}`);
    if (meta?.byteSize)
        lines.push(`Size: ${meta.byteSize.toLocaleString()} B`);
    lines.push(`Modules: ${meta?.modules?.length ?? 0}`);
    if (opts.hasProjectBytes)
        lines.push("Project bytes: available");
    else
        lines.push("Project bytes: unavailable");
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
function exportVbaProcedureIndexText(projectBytes, modules, codepage = 1252) {
    const index = (0, parser_1.indexVbaProceduresInProject)(projectBytes, modules, codepage);
    const lines = ["VBA procedure index (read-only)"];
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
function summarizeVbaModuleKinds(modules) {
    const out = {};
    for (const module of modules) {
        out[module.kind] = (out[module.kind] ?? 0) + 1;
    }
    return out;
}
function filterVbaModulesByKind(modules, kind) {
    if (kind === "all")
        return [...modules];
    return modules.filter((module) => module.kind === kind);
}
/** Plain-text module inventory (no procedure bodies). */
function exportVbaModuleInventoryText(meta) {
    const modules = meta?.modules ?? [];
    const lines = ["VBA module inventory (read-only)"];
    if (meta?.projectName)
        lines.push(`Project: ${meta.projectName}`);
    lines.push(`Modules: ${modules.length}`);
    const kinds = summarizeVbaModuleKinds(modules);
    const kindParts = Object.entries(kinds).map(([kind, n]) => `${kind}×${n}`);
    if (kindParts.length)
        lines.push(`Kinds: ${kindParts.join(", ")}`);
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
function countVbaProceduresInProject(projectBytes, modules, codepage = 1252) {
    return (0, parser_1.indexVbaProceduresInProject)(projectBytes, modules, codepage).reduce((sum, entry) => sum + entry.procedures.length, 0);
}
/** One-line module kind breakdown, e.g. `standard×2, class×1`. */
function formatVbaModuleKindsLine(modules) {
    const kinds = summarizeVbaModuleKinds(modules);
    const parts = Object.entries(kinds).map(([kind, count]) => `${kind}×${count}`);
    return parts.length ? parts.join(", ") : "none";
}
/** One-line auxiliary session summary for chips and compact copy. */
function formatAuxSessionCompactLine(summary) {
    const parts = [summary.isAuxChild ? "aux child" : "parent"];
    if (summary.sessionId)
        parts.push(`session ${summary.sessionId}`);
    if (summary.fileName?.trim())
        parts.push(summary.fileName.trim());
    if (summary.slideIndex != null && summary.slideIndex >= 0) {
        parts.push(`slide ${summary.slideIndex + 1}`);
    }
    if (summary.windowIndex != null && summary.windowIndex > 0) {
        parts.push(`window ${summary.windowIndex}`);
    }
    if (!summary.isAuxChild)
        parts.push(formatAuxWindowCountLine(summary.auxWindowCount));
    return parts.join(" · ");
}
/** Compact VBA project summary (no per-module listing). */
function exportVbaProjectCompactText(meta, opts = {}) {
    const modules = meta?.modules ?? [];
    const lines = ["VBA project (compact)"];
    if (meta?.projectName)
        lines.push(`Project: ${meta.projectName}`);
    lines.push(`Modules: ${modules.length} · ${formatVbaModuleKindsLine(modules)}`);
    if (opts.procedureCount != null)
        lines.push(`Procedures: ${opts.procedureCount}`);
    lines.push(opts.hasProjectBytes ? "Project bytes: available" : "Project bytes: unavailable");
    if (meta?.warnings?.length)
        lines.push(`Warnings: ${meta.warnings.length}`);
    return lines.join("\n");
}
/** Procedure index with optional module-kind filter header. */
function exportVbaProcedureIndexFilteredText(projectBytes, modules, kind, codepage = 1252) {
    const filtered = filterVbaModulesByKind(modules, kind);
    const body = exportVbaProcedureIndexText(projectBytes, filtered, codepage);
    if (kind === "all")
        return body;
    return [`VBA procedure index (filter: ${kind})`, "", body].join("\n");
}
/** One-line VBA project stats for dialogs and copy chips. */
function formatVbaProjectStatsLine(meta, opts = {}) {
    const modules = meta?.modules ?? [];
    const parts = [`${modules.length} module(s)`];
    if (modules.length)
        parts.push(formatVbaModuleKindsLine(modules));
    if (opts.procedureCount != null)
        parts.push(`${opts.procedureCount} procedure(s)`);
    if (opts.hasProjectBytes != null) {
        parts.push(opts.hasProjectBytes ? "bytes available" : "bytes unavailable");
    }
    if (meta?.byteSize)
        parts.push(`${meta.byteSize.toLocaleString()} B`);
    return parts.join(" · ");
}
/** Module with the most indexed procedures (ties → first in list). */
function vbaModuleWithMostProcedures(projectBytes, modules, codepage = 1252) {
    const index = (0, parser_1.indexVbaProceduresInProject)(projectBytes, [...modules], codepage);
    let best = null;
    for (const entry of index) {
        const count = entry.procedures.length;
        if (!count)
            continue;
        if (!best || count > best.count) {
            best = { moduleName: entry.moduleName, count };
        }
    }
    return best;
}
/** Compact module inventory (comma-separated module names). */
function exportVbaModuleInventoryCompactText(meta) {
    const modules = meta?.modules ?? [];
    const parts = ["VBA modules (compact)"];
    if (meta?.projectName)
        parts.push(meta.projectName);
    parts.push(`${modules.length} module(s)`);
    if (modules.length) {
        parts.push(modules.map((m) => `${m.name}(${moduleKindLine(m.kind)})`).join(", "));
    }
    else {
        parts.push("none");
    }
    return parts.join(" · ");
}
/** Compact procedure index (truncated per module). */
function exportVbaProcedureIndexCompactText(projectBytes, modules, kind = "all", codepage = 1252) {
    const filtered = filterVbaModulesByKind(modules, kind);
    const index = (0, parser_1.indexVbaProceduresInProject)(projectBytes, filtered, codepage);
    const parts = [
        kind === "all" ? "VBA procedures (compact)" : `VBA procedures (compact · ${kind})`,
    ];
    let total = 0;
    for (const entry of index) {
        total += entry.procedures.length;
        if (!entry.procedures.length)
            continue;
        const list = entry.procedures.length > 6
            ? `${entry.procedures.slice(0, 6).join(", ")} +${entry.procedures.length - 6}`
            : entry.procedures.join(", ");
        parts.push(`${entry.moduleName}: ${list}`);
    }
    parts.push(`total ${total}`);
    return parts.join(" · ");
}
/** Labeled compact auxiliary session text for copy. */
function exportAuxSessionCompactText(summary) {
    return ["Aux session (compact)", formatAuxSessionCompactLine(summary)].join(" · ");
}
/** One-line view workspace stats (aux + optional VBA + layout). */
function formatViewWorkspaceStatsLine(opts) {
    const parts = [
        opts.aux.isAuxChild ? "aux child" : "parent",
        opts.aux.auxWindowCount > 0
            ? `${opts.aux.auxWindowCount} aux window(s)`
            : "no aux windows",
    ];
    if (opts.aux.fileName?.trim())
        parts.push(opts.aux.fileName.trim());
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
function formatViewReadinessLine(opts) {
    const parts = ["View ready"];
    if (!opts.aux.isAuxChild && opts.aux.auxWindowCount > 0) {
        parts.push(`${opts.aux.auxWindowCount} aux window(s)`);
    }
    const moduleCount = opts.vbaMeta?.modules?.length ?? 0;
    if (moduleCount) {
        parts.push(`VBA ${moduleCount} module(s)`);
        parts.push(opts.hasProjectBytes ? "source readable" : "source unavailable");
        if (opts.procedureCount != null)
            parts.push(`${opts.procedureCount} procedure(s)`);
    }
    if (opts.layout) {
        parts.push(`last layout ${opts.layout.mode} · ${opts.layout.windowCount} window(s)`);
    }
    return parts.join(" · ");
}
/** Average procedures per module (0 if no modules). */
function averageVbaProceduresPerModule(projectBytes, modules, codepage = 1252) {
    if (!modules.length)
        return 0;
    const total = countVbaProceduresInProject(projectBytes, [...modules], codepage);
    return Math.round((total / modules.length) * 10) / 10;
}
/** Module names with zero indexed procedures. */
function vbaModulesWithoutProcedures(projectBytes, modules, codepage = 1252) {
    return (0, parser_1.indexVbaProceduresInProject)(projectBytes, [...modules], codepage)
        .filter((entry) => !entry.procedures.length)
        .map((entry) => entry.moduleName);
}
/** Modules with at least one indexed procedure. */
function countVbaModulesWithProcedures(projectBytes, modules, codepage = 1252) {
    return (0, parser_1.indexVbaProceduresInProject)(projectBytes, [...modules], codepage).filter((entry) => entry.procedures.length > 0).length;
}
/** Count of modules with zero indexed procedures. */
function countVbaModulesWithoutProcedures(projectBytes, modules, codepage = 1252) {
    return vbaModulesWithoutProcedures(projectBytes, modules, codepage).length;
}
/** One-line module procedure coverage, e.g. `2 with procedures · 1 empty · avg 1.5/module`. */
function formatVbaModuleCoverageBreakdownLine(projectBytes, modules, codepage = 1252) {
    if (!modules.length)
        return "Module coverage: none";
    const withProcs = countVbaModulesWithProcedures(projectBytes, modules, codepage);
    const empty = countVbaModulesWithoutProcedures(projectBytes, modules, codepage);
    const parts = [`${withProcs} with procedure(s)`, `${empty} empty`];
    const avg = averageVbaProceduresPerModule(projectBytes, modules, codepage);
    if (avg > 0)
        parts.push(`avg ${avg}/module`);
    return parts.join(" · ");
}
/** Module with the fewest procedures among non-empty modules (ties → first in list). */
function vbaModuleWithFewestProcedures(projectBytes, modules, codepage = 1252) {
    const index = (0, parser_1.indexVbaProceduresInProject)(projectBytes, [...modules], codepage);
    let best = null;
    for (const entry of index) {
        const count = entry.procedures.length;
        if (count <= 0)
            continue;
        if (!best || count < best.count) {
            best = { moduleName: entry.moduleName, count };
        }
    }
    return best;
}
/** One-line spread between fewest and busiest non-empty modules. */
function formatVbaProcedureSpreadLine(projectBytes, modules, codepage = 1252) {
    const busiest = vbaModuleWithMostProcedures(projectBytes, modules, codepage);
    const fewest = vbaModuleWithFewestProcedures(projectBytes, modules, codepage);
    if (!busiest && !fewest)
        return "Procedure spread: none";
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
function exportVbaModuleCoverageText(projectBytes, modules, codepage = 1252) {
    return [
        "VBA module coverage",
        formatVbaModuleCoverageBreakdownLine(projectBytes, modules, codepage),
        formatVbaProcedureSpreadLine(projectBytes, modules, codepage),
        exportVbaEmptyModulesText(projectBytes, modules, codepage),
    ].join("\n");
}
/** One-line auxiliary session coverage for status chips. */
function formatAuxSessionCoverageBreakdownLine(summary) {
    const parts = [summary.isAuxChild ? "auxiliary child" : "parent editor"];
    if (!summary.isAuxChild) {
        parts.push(summary.auxWindowCount > 0
            ? `${summary.auxWindowCount} aux window(s)`
            : "no aux windows");
    }
    else if (summary.windowIndex != null && summary.windowIndex > 0) {
        parts.push(`window ${summary.windowIndex}`);
    }
    if (summary.slideIndex != null && summary.slideIndex >= 0) {
        parts.push(`slide ${summary.slideIndex + 1}`);
    }
    return parts.join(" · ");
}
/** Labeled auxiliary session coverage export for copy. */
function exportAuxSessionCoverageText(summary) {
    return [
        "Aux session coverage",
        formatAuxSessionCoverageBreakdownLine(summary),
        formatAuxSessionCompactLine(summary),
    ].join("\n");
}
/** Comma-separated empty module list for copy. */
function exportVbaEmptyModulesText(projectBytes, modules, codepage = 1252) {
    const empty = vbaModulesWithoutProcedures(projectBytes, modules, codepage);
    if (!empty.length)
        return "VBA empty modules: none";
    return `VBA empty modules (${empty.length}): ${empty.join(", ")}`;
}
/** One-line VBA readiness for status chips. */
function formatVbaReadinessLine(meta, opts = {}) {
    const modules = meta?.modules ?? [];
    const parts = ["VBA ready"];
    parts.push(`${modules.length} module(s)`);
    if (modules.length)
        parts.push(formatVbaModuleKindsLine(modules));
    if (opts.procedureCount != null)
        parts.push(`${opts.procedureCount} procedure(s)`);
    if (opts.hasProjectBytes != null) {
        parts.push(opts.hasProjectBytes ? "source readable" : "source unavailable");
    }
    return parts.join(" · ");
}
/** Labeled VBA readiness export for copy. */
function exportVbaReadinessText(meta, opts = {}) {
    const lines = [
        "VBA readiness",
        formatVbaReadinessLine(meta, opts),
        formatVbaProjectStatsLine(meta, opts),
    ];
    if (opts.projectBytes && meta?.modules?.length) {
        const codepage = opts.codepage ?? 1252;
        lines.push(formatVbaModuleCoverageBreakdownLine(opts.projectBytes, meta.modules, codepage));
        lines.push(formatVbaProcedureSpreadLine(opts.projectBytes, meta.modules, codepage));
        lines.push(`Avg procedures/module: ${averageVbaProceduresPerModule(opts.projectBytes, meta.modules, codepage)}`);
        lines.push(exportVbaEmptyModulesText(opts.projectBytes, meta.modules, codepage));
    }
    return lines.join("\n");
}
/** One-line layout readiness for status chips. */
function formatLayoutReadinessLine(layout) {
    if (!layout)
        return "Layout: none applied";
    const parts = [`Layout ready ${layout.mode}`, `${layout.windowCount} window(s)`];
    if (layout.screenWidth && layout.screenHeight) {
        parts.push(`${layout.screenWidth}×${layout.screenHeight}`);
    }
    return parts.join(" · ");
}
/** Labeled layout readiness export for copy. */
function exportLayoutReadinessText(layout) {
    return ["Layout readiness", formatLayoutReadinessLine(layout)].join("\n");
}
/** Labeled view workspace readiness export for copy. */
function exportViewReadinessText(opts) {
    const lines = [
        "View readiness",
        formatViewReadinessLine(opts),
        formatAuxSessionCoverageBreakdownLine(opts.aux),
        formatViewWorkspaceStatsLine({
            aux: opts.aux,
            vbaMeta: opts.vbaMeta,
            procedureCount: opts.procedureCount,
            hasProjectBytes: opts.hasProjectBytes,
            layout: opts.layout?.screenWidth && opts.layout.screenHeight
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
        lines.push(formatVbaModuleCoverageBreakdownLine(opts.projectBytes, opts.vbaMeta.modules, opts.codepage ?? opts.vbaMeta.codepage ?? 1252));
        lines.push(formatVbaProcedureSpreadLine(opts.projectBytes, opts.vbaMeta.modules, opts.codepage ?? opts.vbaMeta.codepage ?? 1252));
    }
    if (opts.layout)
        lines.push(formatLayoutReadinessLine(opts.layout));
    return lines.join("\n");
}
/** Labeled view workspace stats export for copy. */
function exportViewWorkspaceStatsText(opts) {
    return ["View workspace stats", formatViewWorkspaceStatsLine(opts)].join("\n");
}
/** Plain-text workspace summary for parent editor (aux + optional VBA). */
function exportViewWorkspaceSummaryText(opts) {
    const lines = ["View workspace summary", exportAuxSessionSummaryText(opts.aux)];
    if (opts.vbaMeta) {
        lines.push("");
        lines.push(exportVbaModuleInventoryText(opts.vbaMeta));
    }
    if (opts.layout) {
        lines.push("");
        lines.push(`Last layout: ${opts.layout.mode} · ${opts.layout.windowCount} window(s) · ${opts.layout.screenWidth}×${opts.layout.screenHeight}`);
    }
    return lines.join("\n");
}
/** Compact workspace summary (one-liners). */
function exportViewWorkspaceCompactText(opts) {
    const lines = ["View workspace (compact)", formatAuxSessionCompactLine(opts.aux)];
    if (opts.vbaMeta) {
        const modules = opts.vbaMeta.modules ?? [];
        lines.push(`VBA: ${modules.length} module(s) · ${formatVbaModuleKindsLine(modules)}`);
    }
    if (opts.layout) {
        lines.push(`Layout: ${opts.layout.mode} · ${opts.layout.windowCount} window(s) · ${opts.layout.screenWidth}×${opts.layout.screenHeight}`);
    }
    return lines.join("\n");
}
