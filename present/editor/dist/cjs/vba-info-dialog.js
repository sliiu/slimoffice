"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.openVbaInfoDialog = openVbaInfoDialog;
const dialog_1 = require("./dialog");
const core_1 = require("@sliiu/present-core");
const core_2 = require("@sliiu/present-core");
const parser_1 = require("@sliiu/present-parser");
const i18n_1 = require("./i18n");
const view_export_1 = require("./view-export");
const ui_style_1 = require("./ui-style");
function moduleKindLabel(kind) {
    if (kind === "standard")
        return (0, i18n_1.t)("vbaInfo.kindStandard");
    if (kind === "document")
        return (0, i18n_1.t)("vbaInfo.kindDocument");
    return (0, i18n_1.t)("vbaInfo.kindClass");
}
function downloadBytes(doc, bytes, fileName, mime) {
    const blob = typeof bytes === "string"
        ? new Blob([bytes], { type: mime })
        : new Blob([new Uint8Array(bytes)], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = doc.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
}
/** Read-only VBA project summary — macros are never executed in SlimPPT. */
function openVbaInfoDialog(doc, pres) {
    if (!(0, core_2.presentationHasVbaProject)(pres))
        return;
    const meta = pres.vbaProject;
    const projectBytes = pres.__source?.files.get(core_1.VBA_PROJECT_PART_PATH);
    const overlay = doc.createElement("div");
    overlay.className = "local-picker-overlay";
    overlay.style.cssText = ui_style_1.DIALOG_OVERLAY_CSS;
    const modal = doc.createElement("div");
    modal.style.cssText =
        ui_style_1.DIALOG_MODAL_BASE_CSS + ";width:min(720px,96vw);max-height:88vh;gap:12px";
    const title = doc.createElement("h3");
    title.style.margin = "0";
    title.textContent = (0, i18n_1.t)("vbaInfo.title");
    modal.appendChild(title);
    const hint = doc.createElement("p");
    hint.style.cssText = "margin:0;font-size:12px;color:var(--muted-foreground,#a1a1aa);line-height:1.45";
    hint.textContent = (0, i18n_1.t)("vbaInfo.hint");
    modal.appendChild(hint);
    const statsLine = doc.createElement("p");
    statsLine.style.cssText = "margin:0;font-size:11px;color:var(--muted-foreground,#a1a1aa);line-height:1.45";
    modal.appendChild(statsLine);
    const readinessLine = doc.createElement("p");
    readinessLine.style.cssText = "margin:0;font-size:11px;color:var(--muted-foreground,#a1a1aa);line-height:1.35";
    modal.appendChild(readinessLine);
    const moduleCoverageLine = doc.createElement("p");
    moduleCoverageLine.style.cssText = readinessLine.style.cssText;
    modal.appendChild(moduleCoverageLine);
    const stats = doc.createElement("div");
    stats.style.cssText = "font-size:13px;line-height:1.5";
    const lines = [];
    if (meta?.projectName)
        lines.push(`${(0, i18n_1.t)("vbaInfo.projectName")}: ${meta.projectName}`);
    if (meta?.codepage)
        lines.push(`${(0, i18n_1.t)("vbaInfo.codepage")}: ${meta.codepage}`);
    if (meta?.byteSize)
        lines.push(`${(0, i18n_1.t)("vbaInfo.byteSize")}: ${meta.byteSize.toLocaleString()} B`);
    lines.push(`${(0, i18n_1.t)("vbaInfo.moduleCount")}: ${meta?.modules?.length ?? 0}`);
    const modules = meta?.modules ?? [];
    if (modules.length) {
        lines.push(`${(0, i18n_1.t)("vbaInfo.moduleKinds")}: ${(0, view_export_1.formatVbaModuleKindsLine)(modules)}`);
    }
    if (projectBytes?.length && modules.length) {
        const procCount = (0, view_export_1.countVbaProceduresInProject)(projectBytes, modules, meta?.codepage ?? 1252);
        lines.push(`${(0, i18n_1.t)("vbaInfo.procedureCount")}: ${procCount}`);
    }
    statsLine.textContent = (0, view_export_1.formatVbaProjectStatsLine)(meta, {
        procedureCount: projectBytes?.length && modules.length
            ? (0, view_export_1.countVbaProceduresInProject)(projectBytes, modules, meta?.codepage ?? 1252)
            : undefined,
        hasProjectBytes: Boolean(projectBytes?.length),
    });
    const procCount = projectBytes?.length && modules.length
        ? (0, view_export_1.countVbaProceduresInProject)(projectBytes, modules, meta?.codepage ?? 1252)
        : undefined;
    readinessLine.textContent = (0, view_export_1.formatVbaReadinessLine)(meta, {
        procedureCount: procCount,
        hasProjectBytes: Boolean(projectBytes?.length),
    });
    if (projectBytes?.length && modules.length) {
        moduleCoverageLine.textContent = (0, view_export_1.formatVbaModuleCoverageBreakdownLine)(projectBytes, modules, meta?.codepage ?? 1252);
    }
    else {
        moduleCoverageLine.style.display = "none";
    }
    stats.textContent = lines.join("\n");
    modal.appendChild(stats);
    const summaryActions = doc.createElement("div");
    summaryActions.style.cssText = "display:flex;gap:6px;flex-wrap:wrap";
    const copyDump = (text) => {
        void navigator.clipboard?.writeText(text);
    };
    const dumpActions = [
        {
            label: (0, i18n_1.t)("vbaInfo.copySummary"),
            run: () => {
                copyDump((0, view_export_1.exportVbaProjectSummaryText)(meta, { hasProjectBytes: Boolean(projectBytes?.length) }));
            },
        },
        {
            label: (0, i18n_1.t)("vbaInfo.copyCompactSummary"),
            run: () => {
                const n = projectBytes?.length && modules.length
                    ? (0, view_export_1.countVbaProceduresInProject)(projectBytes, modules, meta?.codepage ?? 1252)
                    : undefined;
                copyDump((0, view_export_1.exportVbaProjectCompactText)(meta, {
                    hasProjectBytes: Boolean(projectBytes?.length),
                    procedureCount: n,
                }));
            },
        },
        { label: (0, i18n_1.t)("vbaInfo.copyModuleInventory"), run: () => copyDump((0, view_export_1.exportVbaModuleInventoryText)(meta)) },
        {
            label: (0, i18n_1.t)("vbaInfo.copyModuleInventoryCompact"),
            run: () => copyDump((0, view_export_1.exportVbaModuleInventoryCompactText)(meta)),
        },
        {
            label: (0, i18n_1.t)("vbaInfo.copyReadiness"),
            run: () => copyDump((0, view_export_1.exportVbaReadinessText)(meta, {
                procedureCount: procCount,
                hasProjectBytes: Boolean(projectBytes?.length),
                projectBytes: projectBytes ?? undefined,
                codepage: meta?.codepage ?? 1252,
            })),
        },
    ];
    if (projectBytes?.length) {
        dumpActions.push({
            label: (0, i18n_1.t)("vbaInfo.copyProcedureIndex"),
            run: () => copyDump((0, view_export_1.exportVbaProcedureIndexFilteredText)(projectBytes, modules, kindFilter, meta?.codepage ?? 1252)),
        }, {
            label: (0, i18n_1.t)("vbaInfo.copyProcedureIndexCompact"),
            run: () => copyDump((0, view_export_1.exportVbaProcedureIndexCompactText)(projectBytes, modules, kindFilter, meta?.codepage ?? 1252)),
        }, {
            label: (0, i18n_1.t)("vbaInfo.gotoBusiestModule"),
            run: () => {
                const busiest = (0, view_export_1.vbaModuleWithMostProcedures)(projectBytes, modules, meta?.codepage ?? 1252);
                if (!busiest)
                    return false;
                search.value = busiest.moduleName;
                renderModules(busiest.moduleName);
            },
        }, {
            label: (0, i18n_1.t)("vbaInfo.copyEmptyModules"),
            run: () => copyDump((0, view_export_1.exportVbaEmptyModulesText)(projectBytes, modules, meta?.codepage ?? 1252)),
        }, {
            label: (0, i18n_1.t)("vbaInfo.gotoEmptyModule"),
            run: () => {
                const first = (0, view_export_1.vbaModulesWithoutProcedures)(projectBytes, modules, meta?.codepage ?? 1252)[0];
                if (!first)
                    return false;
                search.value = first;
                renderModules(first);
            },
        }, {
            label: (0, i18n_1.t)("vbaInfo.copyModuleCoverage"),
            run: () => copyDump((0, view_export_1.exportVbaModuleCoverageText)(projectBytes, modules, meta?.codepage ?? 1252)),
        }, {
            label: (0, i18n_1.t)("vbaInfo.gotoFewestProceduresModule"),
            run: () => {
                const fewest = (0, view_export_1.vbaModuleWithFewestProcedures)(projectBytes, modules, meta?.codepage ?? 1252);
                if (!fewest)
                    return false;
                search.value = fewest.moduleName;
                renderModules(fewest.moduleName);
            },
        });
    }
    summaryActions.appendChild((0, ui_style_1.createDevOnlyActionSelect)(doc, (0, i18n_1.t)("developer.dumpMenu"), dumpActions));
    modal.appendChild(summaryActions);
    const filterRow = doc.createElement("div");
    filterRow.style.cssText = "display:flex;flex-wrap:wrap;gap:6px";
    modal.appendChild(filterRow);
    const search = doc.createElement("input");
    search.type = "search";
    search.placeholder = (0, i18n_1.t)("vbaInfo.search");
    search.style.cssText = "width:100%;box-sizing:border-box;" + ui_style_1.DIALOG_INPUT_CSS;
    modal.appendChild(search);
    const procSearch = doc.createElement("input");
    procSearch.type = "search";
    procSearch.placeholder = (0, i18n_1.t)("vbaInfo.searchProcedures");
    procSearch.style.cssText = search.style.cssText;
    modal.appendChild(procSearch);
    const procHits = doc.createElement("div");
    procHits.style.cssText =
        "display:none;flex-wrap:wrap;gap:4px;max-height:72px;overflow:auto;font-size:11px";
    modal.appendChild(procHits);
    const body = doc.createElement("div");
    body.style.cssText =
        "display:grid;grid-template-columns:minmax(0,0.9fr) minmax(0,1.1fr);gap:10px;min-height:240px";
    if (window.matchMedia("(max-width: 640px)").matches) {
        body.style.gridTemplateColumns = "1fr";
    }
    const list = doc.createElement("div");
    list.style.cssText =
        "overflow:auto;max-height:300px;border:1px solid var(--border);border-radius:var(--radius-md,8px);font-size:13px;background:var(--secondary)";
    const rightCol = doc.createElement("div");
    rightCol.style.cssText = "display:flex;flex-direction:column;gap:8px;min-height:0";
    const procHead = doc.createElement("div");
    procHead.style.cssText = "font-size:11px;color:var(--muted-foreground,#a1a1aa)";
    procHead.textContent = (0, i18n_1.t)("vbaInfo.procedures");
    const procList = doc.createElement("div");
    procList.style.cssText =
        "display:flex;flex-wrap:wrap;gap:4px;max-height:56px;overflow:auto;font-size:11px";
    const preview = doc.createElement("pre");
    preview.style.cssText =
        "margin:0;flex:1;overflow:auto;max-height:240px;border:1px solid var(--border);border-radius:var(--radius-md,8px);padding:10px;font-size:11px;line-height:1.45;background:var(--background);white-space:pre-wrap;word-break:break-word";
    preview.textContent = (0, i18n_1.t)("vbaInfo.selectModule");
    const previewActions = doc.createElement("div");
    previewActions.style.cssText = "display:flex;gap:6px;flex-wrap:wrap";
    let selectedRow = null;
    let selectedModule = null;
    let selectedSource = "";
    let kindFilter = "all";
    const readModuleSource = (moduleName, streamName) => {
        if (!projectBytes || !streamName)
            return null;
        return (0, parser_1.readVbaModuleSource)(projectBytes, { name: moduleName, streamName }, meta?.codepage ?? 1252);
    };
    const renderProcedures = (source) => {
        procList.replaceChildren();
        const procs = (0, parser_1.parseVbaModuleProcedures)(source);
        if (!procs.length) {
            const empty = doc.createElement("span");
            empty.style.color = "var(--muted-foreground,#a1a1aa)";
            empty.textContent = (0, i18n_1.t)("vbaInfo.noProcedures");
            procList.appendChild(empty);
            return;
        }
        for (const name of procs) {
            const chip = doc.createElement("button");
            chip.type = "button";
            chip.textContent = name;
            chip.style.cssText =
                "background:var(--secondary);border:1px solid var(--border);border-radius:var(--radius-sm,6px);padding:2px 8px;cursor:pointer;font:inherit;font-size:11px";
            chip.title = (0, i18n_1.t)("vbaInfo.scrollToProcedure");
            chip.addEventListener("click", () => {
                const idx = source.toLowerCase().indexOf(name.toLowerCase());
                if (idx >= 0) {
                    const before = source.slice(0, idx).split("\n").length - 1;
                    preview.scrollTop = Math.max(0, before * 14 - 20);
                }
            });
            procList.appendChild(chip);
        }
    };
    const showPreview = (moduleName, streamName) => {
        selectedModule = { name: moduleName, streamName };
        const source = readModuleSource(moduleName, streamName);
        if (!source?.trim()) {
            selectedSource = "";
            preview.textContent = (0, i18n_1.t)("vbaInfo.sourceUnavailable");
            renderProcedures("");
            return;
        }
        selectedSource = source;
        const max = 12000;
        preview.textContent = source.length > max ? `${source.slice(0, max)}\n\n…` : source;
        renderProcedures(source);
    };
    const renderKindFilters = () => {
        filterRow.replaceChildren();
        const mk = (kind, label) => {
            const b = doc.createElement("button");
            b.type = "button";
            const active = kindFilter === kind;
            b.style.cssText = `font:inherit;font-size:11px;padding:3px 8px;border-radius:999px;cursor:pointer;border:1px solid ${active ? "var(--primary)" : "var(--border)"};background:${active ? "var(--accent)" : "transparent"};color:inherit`;
            b.textContent = label;
            b.addEventListener("click", () => {
                kindFilter = kind;
                renderKindFilters();
                renderModules(search.value);
            });
            filterRow.appendChild(b);
        };
        mk("all", (0, i18n_1.t)("vbaInfo.filterAll"));
        mk("standard", (0, i18n_1.t)("vbaInfo.kindStandard"));
        mk("document", (0, i18n_1.t)("vbaInfo.kindDocument"));
        mk("class", (0, i18n_1.t)("vbaInfo.kindClass"));
    };
    const renderModules = (query) => {
        list.replaceChildren();
        const q = query.trim().toLowerCase();
        const filtered = modules.filter((m) => {
            if (kindFilter !== "all" && m.kind !== kindFilter)
                return false;
            if (!q)
                return true;
            return (m.name.toLowerCase().includes(q) ||
                (m.streamName?.toLowerCase().includes(q) ?? false) ||
                m.kind.toLowerCase().includes(q));
        });
        selectedRow = null;
        if (!filtered.length) {
            const empty = doc.createElement("div");
            empty.style.cssText = "padding:10px;color:var(--muted-foreground,#a1a1aa)";
            empty.textContent = modules.length ? (0, i18n_1.t)("vbaInfo.noSearchResults") : meta?.warnings?.length
                ? (0, i18n_1.t)("vbaInfo.modulesUnavailable")
                : (0, i18n_1.t)("vbaInfo.noModules");
            list.appendChild(empty);
            preview.textContent = (0, i18n_1.t)("vbaInfo.selectModule");
            selectedModule = null;
            selectedSource = "";
            renderProcedures("");
            return;
        }
        for (const m of filtered) {
            const row = doc.createElement("div");
            row.style.cssText =
                "padding:8px 10px;border-bottom:1px solid var(--border);cursor:pointer;transition:background-color .12s ease";
            row.textContent = `${m.name} — ${moduleKindLabel(m.kind)}`;
            row.addEventListener("mouseenter", () => {
                if (selectedRow !== row)
                    row.style.background = "var(--accent)";
            });
            row.addEventListener("mouseleave", () => {
                if (selectedRow !== row)
                    row.style.background = "";
            });
            row.addEventListener("click", () => {
                if (selectedRow)
                    selectedRow.style.background = "";
                selectedRow = row;
                row.style.background = "color-mix(in srgb, var(--primary) 12%, var(--accent))";
                showPreview(m.name, m.streamName);
            });
            list.appendChild(row);
        }
        if (filtered.length === 1) {
            const only = filtered[0];
            const firstRow = list.firstElementChild;
            selectedRow = firstRow;
            firstRow.style.background = "color-mix(in srgb, var(--primary) 12%, var(--accent))";
            showPreview(only.name, only.streamName);
        }
    };
    const copyBtn = doc.createElement("button");
    copyBtn.type = "button";
    copyBtn.textContent = (0, i18n_1.t)("vbaInfo.copySource");
    copyBtn.style.cssText = ui_style_1.DIALOG_BTN_SECONDARY_CSS.replace("padding:6px 12px", "padding:4px 10px");
    copyBtn.addEventListener("click", () => {
        if (!selectedSource)
            return;
        void navigator.clipboard?.writeText(selectedSource);
    });
    const exportModuleBtn = doc.createElement("button");
    exportModuleBtn.type = "button";
    exportModuleBtn.textContent = (0, i18n_1.t)("vbaInfo.exportModule");
    exportModuleBtn.style.cssText = copyBtn.style.cssText;
    exportModuleBtn.addEventListener("click", () => {
        if (!selectedModule || !selectedSource)
            return;
        const stem = selectedModule.name.replace(/[^\w.-]+/g, "_");
        downloadBytes(doc, (0, parser_1.formatVbaBasExport)(selectedModule.name, selectedSource), `${stem}.bas`, "text/plain");
    });
    previewActions.append(copyBtn, exportModuleBtn);
    rightCol.append(procHead, procList, preview, previewActions);
    const renderProcedureHits = (query) => {
        procHits.replaceChildren();
        const q = query.trim();
        if (!q || !projectBytes?.length) {
            procHits.style.display = "none";
            return;
        }
        const hits = (0, parser_1.searchVbaProceduresInProject)(projectBytes, modules, q, meta?.codepage ?? 1252);
        if (!hits.length) {
            procHits.style.display = "none";
            return;
        }
        procHits.style.display = "flex";
        for (const hit of hits.slice(0, 24)) {
            const chip = doc.createElement("button");
            chip.type = "button";
            chip.textContent = `${hit.moduleName}.${hit.procedure}`;
            chip.style.cssText =
                "background:var(--secondary);border:1px solid var(--border);border-radius:var(--radius-sm,6px);padding:2px 8px;cursor:pointer;font:inherit;font-size:11px";
            chip.title = (0, i18n_1.t)("vbaInfo.openProcedure");
            chip.addEventListener("click", () => {
                search.value = hit.moduleName;
                renderModules(hit.moduleName);
                const rows = list.querySelectorAll("div");
                for (const row of rows) {
                    if (row.textContent?.startsWith(`${hit.moduleName} —`)) {
                        row.click();
                        const idx = selectedSource.toLowerCase().indexOf(hit.procedure.toLowerCase());
                        if (idx >= 0) {
                            const before = selectedSource.slice(0, idx).split("\n").length - 1;
                            preview.scrollTop = Math.max(0, before * 14 - 20);
                        }
                        break;
                    }
                }
            });
            procHits.appendChild(chip);
        }
    };
    search.addEventListener("input", () => renderModules(search.value));
    procSearch.addEventListener("input", () => renderProcedureHits(procSearch.value));
    renderKindFilters();
    renderModules("");
    body.appendChild(list);
    body.appendChild(rightCol);
    modal.appendChild(body);
    if (meta?.warnings?.length) {
        const warn = doc.createElement("div");
        warn.style.cssText = "font-size:11px;color:var(--warning)";
        warn.textContent = (0, i18n_1.t)("vbaInfo.warnings", { n: String(meta.warnings.length) });
        modal.appendChild(warn);
    }
    const row = doc.createElement("div");
    row.style.cssText = "display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap";
    let modalDismiss;
    const close = () => {
        modalDismiss?.release();
        overlay.remove();
    };
    if (projectBytes?.length) {
        const exportBtn = doc.createElement("button");
        exportBtn.type = "button";
        exportBtn.textContent = (0, i18n_1.t)("vbaInfo.exportProject");
        exportBtn.style.cssText = copyBtn.style.cssText;
        exportBtn.addEventListener("click", () => {
            const stem = (meta?.projectName || "vbaProject").replace(/[^\w.-]+/g, "_");
            downloadBytes(doc, projectBytes, `${stem}.bin`, "application/octet-stream");
        });
        row.appendChild(exportBtn);
        const exportAllBtn = doc.createElement("button");
        exportAllBtn.type = "button";
        exportAllBtn.textContent = (0, i18n_1.t)("vbaInfo.exportAllModules");
        exportAllBtn.style.cssText = copyBtn.style.cssText;
        exportAllBtn.addEventListener("click", () => {
            const text = (0, parser_1.exportAllVbaModulesBas)(projectBytes, modules, meta?.codepage ?? 1252);
            if (!text.trim())
                return;
            const stem = (meta?.projectName || "vbaProject").replace(/[^\w.-]+/g, "_");
            downloadBytes(doc, text, `${stem}-modules.bas`, "text/plain");
        });
        row.appendChild(exportAllBtn);
    }
    const closeBtn = doc.createElement("button");
    closeBtn.type = "button";
    closeBtn.textContent = (0, i18n_1.t)("vbaInfo.close");
    closeBtn.style.cssText = ui_style_1.DIALOG_BTN_PRIMARY_CSS.replace("padding:6px 12px", "padding:8px 14px");
    closeBtn.addEventListener("click", close);
    modalDismiss = (0, dialog_1.bindEditorModal)({ doc, overlay, panel: modal, onCancel: close });
    row.appendChild(closeBtn);
    modal.appendChild(row);
    overlay.appendChild(modal);
    doc.body.appendChild(overlay);
    search.focus();
}
