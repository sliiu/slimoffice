"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.slideEntryHasStructureDiff = exports.slideEntryHasTextPatches = exports.summarizeCompareEntries = exports.comparePresentationMeta = exports.comparedSlideParagraphs = exports.compareDeckTexts = exports.compareDeckStructured = void 0;
exports.openCompareDialog = openCompareDialog;
const dialog_1 = require("./dialog");
const parser_1 = require("@sliiu/present-parser");
const compare_deck_1 = require("./compare-deck");
const review_export_1 = require("./review-export");
const i18n_1 = require("./i18n");
const insert_meta_1 = require("./insert-meta");
const ui_style_1 = require("./ui-style");
var compare_deck_2 = require("./compare-deck");
Object.defineProperty(exports, "compareDeckStructured", { enumerable: true, get: function () { return compare_deck_2.compareDeckStructured; } });
Object.defineProperty(exports, "compareDeckTexts", { enumerable: true, get: function () { return compare_deck_2.compareDeckTexts; } });
Object.defineProperty(exports, "comparedSlideParagraphs", { enumerable: true, get: function () { return compare_deck_2.comparedSlideParagraphs; } });
Object.defineProperty(exports, "comparePresentationMeta", { enumerable: true, get: function () { return compare_deck_2.comparePresentationMeta; } });
Object.defineProperty(exports, "summarizeCompareEntries", { enumerable: true, get: function () { return compare_deck_2.summarizeCompareEntries; } });
Object.defineProperty(exports, "slideEntryHasTextPatches", { enumerable: true, get: function () { return compare_deck_2.slideEntryHasTextPatches; } });
Object.defineProperty(exports, "slideEntryHasStructureDiff", { enumerable: true, get: function () { return compare_deck_2.slideEntryHasStructureDiff; } });
function structureKindLabel(kind) {
    return (0, i18n_1.t)(`compare.struct.${kind}`);
}
function entryMatchesFilter(e, filter) {
    if (e.status === "same")
        return false;
    if (filter === "all")
        return true;
    if (filter === "text")
        return (0, compare_deck_1.slideEntryHasTextPatches)(e);
    return (0, compare_deck_1.slideEntryHasStructureDiff)(e);
}
function openCompareDialog(doc, ctx) {
    let other = null;
    let entries = [];
    let activeFilter = "all";
    const overlay = doc.createElement("div");
    overlay.className = "local-picker-overlay";
    overlay.style.cssText =
        ui_style_1.DIALOG_OVERLAY_CSS;
    const modal = doc.createElement("div");
    modal.style.cssText =
        "background:var(--popover);color:var(--popover-foreground);border:1px solid var(--border);border-radius:var(--radius-modal,12px);box-shadow:var(--shadow-lg);padding:16px 18px;width:min(720px,94vw);max-height:88vh;display:flex;flex-direction:column;gap:10px";
    const title = doc.createElement("h3");
    title.style.margin = "0";
    title.textContent = (0, i18n_1.t)("compare.title");
    modal.appendChild(title);
    const hint = doc.createElement("p");
    hint.style.cssText = "margin:0;font-size:12px;color:var(--muted-foreground,#a1a1aa)";
    hint.textContent = (0, i18n_1.t)("compare.hint");
    modal.appendChild(hint);
    const fileRow = doc.createElement("div");
    fileRow.style.cssText = "display:flex;gap:8px;align-items:center;flex-wrap:wrap";
    const fileInput = doc.createElement("input");
    fileInput.type = "file";
    fileInput.accept = ".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation";
    const fileLabel = doc.createElement("span");
    fileLabel.style.fontSize = "12px";
    fileLabel.textContent = (0, i18n_1.t)("compare.noFile");
    fileRow.append(fileInput, fileLabel);
    modal.appendChild(fileRow);
    const metaBanner = doc.createElement("div");
    metaBanner.style.cssText =
        "display:none;font-size:12px;line-height:1.45;padding:8px 10px;border-radius:6px;background:rgba(234,179,8,.12);border:1px solid rgba(234,179,8,.35)";
    modal.appendChild(metaBanner);
    const statsRow = doc.createElement("div");
    statsRow.style.cssText =
        "display:none;font-size:12px;color:var(--muted-foreground,#a1a1aa);line-height:1.45";
    modal.appendChild(statsRow);
    const coverageRow = doc.createElement("div");
    coverageRow.style.cssText =
        "display:none;font-size:11px;color:var(--muted-foreground,#a1a1aa);line-height:1.45";
    modal.appendChild(coverageRow);
    const filterRow = doc.createElement("div");
    filterRow.style.cssText = "display:none;flex-wrap:wrap;gap:6px";
    modal.appendChild(filterRow);
    const list = doc.createElement("div");
    list.style.cssText = "flex:1;overflow:auto;border:1px solid var(--border);border-radius:6px;min-height:220px";
    modal.appendChild(list);
    const acceptAllBtn = doc.createElement("button");
    acceptAllBtn.type = "button";
    acceptAllBtn.textContent = (0, i18n_1.t)("compare.acceptAll");
    acceptAllBtn.style.cssText =
        "background:var(--success);color:var(--success-foreground);border:none;border-radius:var(--radius-sm,6px);padding:6px 12px;cursor:pointer;font:inherit";
    acceptAllBtn.style.display = "none";
    const updateAcceptAll = () => {
        const n = entries.filter((e) => e.status === "changed" && (0, compare_deck_1.slideEntryHasTextPatches)(e)).length;
        acceptAllBtn.style.display = n > 0 ? "" : "none";
    };
    const renderStatsAndFilters = () => {
        const diffEntries = entries.filter((e) => e.status !== "same");
        if (!diffEntries.length) {
            statsRow.style.display = "none";
            coverageRow.style.display = "none";
            filterRow.style.display = "none";
            filterRow.replaceChildren();
            return;
        }
        const s = (0, compare_deck_1.summarizeCompareEntries)(entries);
        statsRow.style.display = "";
        statsRow.textContent = (0, review_export_1.formatCompareReadinessLine)(entries);
        coverageRow.style.display = "";
        coverageRow.textContent = (0, i18n_1.t)("compare.slideCoverage", {
            breakdown: (0, review_export_1.formatCompareSlideCoverageBreakdownLine)(entries),
        });
        statsRow.title = (0, i18n_1.t)("compare.stats", {
            changed: s.changed,
            added: s.added,
            removed: s.removed,
            text: s.withTextPatches,
            structure: s.withStructure,
        });
        filterRow.style.display = "flex";
        filterRow.replaceChildren();
        const mkFilter = (id, label) => {
            const b = doc.createElement("button");
            b.type = "button";
            const active = activeFilter === id;
            b.style.cssText = `font:inherit;font-size:11px;padding:3px 8px;border-radius:999px;cursor:pointer;border:1px solid ${active ? "var(--primary)" : "var(--border,#3a3a3a)"};background:${active ? "var(--accent,#333333)" : "transparent"};color:inherit`;
            b.textContent = label;
            b.addEventListener("click", () => {
                activeFilter = id;
                renderStatsAndFilters();
                renderList();
            });
            filterRow.appendChild(b);
        };
        mkFilter("all", (0, i18n_1.t)("compare.filter.all"));
        mkFilter("text", (0, i18n_1.t)("compare.filter.text"));
        mkFilter("structure", (0, i18n_1.t)("compare.filter.structure"));
    };
    let modalDismiss;
    const close = () => {
        modalDismiss?.release();
        overlay.remove();
    };
    const statusLabel = (e) => {
        switch (e.status) {
            case "same":
                return (0, i18n_1.t)("compare.status.same");
            case "changed":
                return (0, i18n_1.t)("compare.status.changed");
            case "added":
                return (0, i18n_1.t)("compare.status.added");
            case "removed":
                return (0, i18n_1.t)("compare.status.removed");
        }
    };
    const renderDetails = (parent, e) => {
        const details = doc.createElement("div");
        details.style.cssText =
            "margin-top:6px;padding:6px 8px;background:var(--secondary,#111827);border-radius:4px;font-size:11px;line-height:1.45";
        if (e.structure?.length) {
            const head = doc.createElement("div");
            head.style.fontWeight = "600";
            head.textContent = (0, i18n_1.t)("compare.section.structure");
            details.appendChild(head);
            const ul = doc.createElement("ul");
            ul.style.cssText = "margin:4px 0 8px;padding-left:18px";
            for (const s of e.structure) {
                const li = doc.createElement("li");
                li.textContent = (0, i18n_1.t)("compare.struct.row", {
                    kind: structureKindLabel(s.kind),
                    before: s.before ?? "—",
                    after: s.after ?? "—",
                });
                ul.appendChild(li);
            }
            details.appendChild(ul);
        }
        const shapeDiffs = e.textShapes ?? [];
        if (shapeDiffs.length) {
            const head = doc.createElement("div");
            head.style.fontWeight = "600";
            head.textContent = (0, i18n_1.t)("compare.section.textShapes");
            details.appendChild(head);
            const ul = doc.createElement("ul");
            ul.style.cssText = "margin:4px 0 0;padding-left:18px";
            for (const d of shapeDiffs) {
                const li = doc.createElement("li");
                if (d.textChanged) {
                    li.textContent = (0, i18n_1.t)("compare.textShape.text", {
                        n: d.shapeIndex,
                        before: d.before || "—",
                        after: d.after || "—",
                    });
                }
                else if (d.bboxMoved) {
                    li.textContent = (0, i18n_1.t)("compare.textShape.moved", { n: d.shapeIndex });
                }
                ul.appendChild(li);
            }
            details.appendChild(ul);
        }
        if (details.childElementCount)
            parent.appendChild(details);
    };
    const renderMeta = () => {
        if (!other) {
            metaBanner.style.display = "none";
            return;
        }
        const meta = (0, compare_deck_1.comparePresentationMeta)(ctx.pres, other);
        const prot = meta.find((m) => m.kind === "protection");
        if (!prot) {
            metaBanner.style.display = "none";
            return;
        }
        metaBanner.style.display = "";
        metaBanner.textContent = (0, i18n_1.t)("compare.meta.protection", {
            before: prot.before,
            after: prot.after,
        });
    };
    const renderList = () => {
        list.replaceChildren();
        if (!entries.length) {
            list.textContent = (0, i18n_1.t)("compare.empty");
            return;
        }
        for (const e of entries) {
            if (!entryMatchesFilter(e, activeFilter))
                continue;
            const row = doc.createElement("div");
            row.style.cssText =
                "display:flex;flex-direction:column;padding:8px 10px;border-bottom:1px solid var(--border);font-size:13px";
            const top = doc.createElement("div");
            top.style.cssText = "display:flex;align-items:center;gap:8px";
            const label = doc.createElement("span");
            label.style.flex = "1";
            label.textContent = (0, i18n_1.t)("compare.slideRow", { n: e.slideIdx + 1, status: statusLabel(e) });
            const viewBtn = doc.createElement("button");
            viewBtn.type = "button";
            viewBtn.textContent = (0, i18n_1.t)("compare.view");
            viewBtn.style.cssText =
                "background:transparent;border:1px solid var(--border);border-radius:4px;padding:3px 8px;cursor:pointer;font:inherit;font-size:12px";
            viewBtn.addEventListener("click", () => {
                ctx.gotoSlide(e.slideIdx);
                close();
            });
            top.append(label, viewBtn);
            if (e.status === "changed" && other && (0, compare_deck_1.slideEntryHasTextPatches)(e)) {
                const accept = doc.createElement("button");
                accept.type = "button";
                accept.textContent = (0, i18n_1.t)("compare.accept");
                accept.style.cssText =
                    "background:var(--primary);color:var(--primary-foreground);border:none;border-radius:4px;padding:3px 8px;cursor:pointer;font:inherit;font-size:12px";
                accept.addEventListener("click", () => {
                    ctx.acceptSlide(e.slideIdx, other);
                    entries = (0, compare_deck_1.compareDeckStructured)(ctx.pres, other);
                    renderMeta();
                    renderStatsAndFilters();
                    renderList();
                });
                const reject = doc.createElement("button");
                reject.type = "button";
                reject.textContent = (0, i18n_1.t)("compare.reject");
                reject.style.cssText = viewBtn.style.cssText;
                reject.addEventListener("click", () => {
                    entries = entries.filter((x) => x.slideIdx !== e.slideIdx);
                    renderStatsAndFilters();
                    renderList();
                });
                top.append(accept, reject);
            }
            row.appendChild(top);
            renderDetails(row, e);
            list.appendChild(row);
        }
        if (!list.childElementCount) {
            list.textContent =
                entries.some((e) => e.status !== "same") && activeFilter !== "all"
                    ? (0, i18n_1.t)("compare.noFilterMatch")
                    : (0, i18n_1.t)("compare.allSame");
        }
        updateAcceptAll();
        renderStatsAndFilters();
    };
    acceptAllBtn.addEventListener("click", () => {
        if (!other)
            return;
        const indices = entries
            .filter((e) => e.status === "changed" && (0, compare_deck_1.slideEntryHasTextPatches)(e))
            .map((e) => e.slideIdx);
        if (!indices.length)
            return;
        if (ctx.acceptAllSlides)
            ctx.acceptAllSlides(other, indices);
        else
            for (const idx of indices)
                ctx.acceptSlide(idx, other);
        entries = (0, compare_deck_1.compareDeckStructured)(ctx.pres, other);
        renderMeta();
        renderStatsAndFilters();
        renderList();
    });
    fileInput.addEventListener("change", () => {
        const file = fileInput.files?.[0];
        if (!file)
            return;
        fileLabel.textContent = file.name;
        void (async () => {
            fileLabel.textContent = (0, i18n_1.t)("compare.loading");
            try {
                const buf = await file.arrayBuffer();
                other = await (0, parser_1.parsePptx)(buf);
                entries = (0, compare_deck_1.compareDeckStructured)(ctx.pres, other);
                renderMeta();
                fileLabel.textContent = file.name;
                activeFilter = "all";
                renderStatsAndFilters();
                renderList();
            }
            catch {
                fileLabel.textContent = (0, i18n_1.t)("compare.parseFailed");
                other = null;
                entries = [];
                renderStatsAndFilters();
                renderList();
            }
        })();
    });
    const footer = doc.createElement("div");
    footer.style.cssText = "display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap";
    const copyDump = async (text) => {
        const ok = await (0, insert_meta_1.copyTextToClipboard)(text);
        if (!ok)
            throw new Error("copy failed");
    };
    const jumpDump = (idx) => {
        if (idx == null)
            return false;
        ctx.gotoSlide(idx);
        close();
        return true;
    };
    const requireOther = () => other ?? false;
    footer.append((0, ui_style_1.createDevOnlyActionSelect)(doc, (0, i18n_1.t)("developer.dumpMenu"), [
        {
            label: (0, i18n_1.t)("compare.copyReport"),
            run: async () => {
                const src = requireOther();
                if (!src)
                    return false;
                await copyDump((0, review_export_1.exportCompareReportText)(entries, (0, compare_deck_1.comparePresentationMeta)(ctx.pres, src), { filter: activeFilter }));
            },
        },
        {
            label: (0, i18n_1.t)("compare.copyStats"),
            run: async () => {
                if (!requireOther())
                    return false;
                await copyDump((0, review_export_1.formatCompareStatsLine)(entries));
            },
        },
        {
            label: (0, i18n_1.t)("compare.copyCompact"),
            run: async () => {
                const src = requireOther();
                if (!src)
                    return false;
                await copyDump((0, review_export_1.exportCompareCompactText)(entries, (0, compare_deck_1.comparePresentationMeta)(ctx.pres, src), {
                    filter: activeFilter,
                }));
            },
        },
        {
            label: (0, i18n_1.t)("compare.copyAccept"),
            run: async () => {
                if (!requireOther())
                    return false;
                await copyDump((0, review_export_1.exportCompareAcceptIndicesText)(entries));
            },
        },
        {
            label: (0, i18n_1.t)("compare.copyReadiness"),
            run: async () => {
                if (!requireOther())
                    return false;
                await copyDump((0, review_export_1.exportCompareReadinessText)(entries));
            },
        },
        {
            label: (0, i18n_1.t)("compare.copyStructure"),
            run: async () => {
                if (!requireOther())
                    return false;
                await copyDump((0, review_export_1.exportCompareStructureIndicesText)(entries));
            },
        },
        {
            label: (0, i18n_1.t)("compare.copySlideCoverage"),
            run: async () => {
                if (!requireOther())
                    return false;
                await copyDump((0, review_export_1.exportCompareSlideCoverageText)(entries));
            },
        },
        { label: (0, i18n_1.t)("compare.gotoMostChanged"), run: () => jumpDump((0, review_export_1.slideWithMostCompareChanges)(entries)) },
        {
            label: (0, i18n_1.t)("compare.gotoMostStructure"),
            run: () => jumpDump((0, review_export_1.slideWithMostStructureCompareChanges)(entries)),
        },
        { label: (0, i18n_1.t)("compare.gotoFirstChange"), run: () => jumpDump((0, review_export_1.slideWithFirstCompareChange)(entries)) },
        { label: (0, i18n_1.t)("compare.gotoFewestChanges"), run: () => jumpDump((0, review_export_1.slideWithFewestCompareChanges)(entries)) },
    ], { done: (0, i18n_1.t)("compare.copiedReport"), failed: (0, i18n_1.t)("compare.copyFailed") }), acceptAllBtn);
    const cancel = doc.createElement("button");
    cancel.type = "button";
    cancel.textContent = (0, i18n_1.t)("compare.close");
    cancel.style.cssText =
        "background:var(--secondary);color:var(--foreground);border:1px solid var(--border);border-radius:var(--radius-sm,6px);padding:6px 12px;cursor:pointer;font:inherit";
    cancel.addEventListener("click", close);
    footer.appendChild(cancel);
    modal.appendChild(footer);
    overlay.appendChild(modal);
    modalDismiss = (0, dialog_1.bindEditorModal)({ doc, overlay, panel: modal, onCancel: close });
    doc.body.appendChild(overlay);
    renderList();
}
