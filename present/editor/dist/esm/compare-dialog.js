import { bindEditorModal } from "./dialog.js";
import { parsePptx } from "@sliiu/present-parser";
import { compareDeckStructured, comparePresentationMeta, slideEntryHasStructureDiff, slideEntryHasTextPatches, summarizeCompareEntries, } from "./compare-deck.js";
import { exportCompareReportText, exportCompareCompactText, exportCompareReadinessText, exportCompareSlideCoverageText, exportCompareStructureIndicesText, formatCompareSlideCoverageBreakdownLine, formatCompareStatsLine, formatCompareReadinessLine, slideWithMostCompareChanges, slideWithMostStructureCompareChanges, slideWithFirstCompareChange, slideWithFewestCompareChanges, exportCompareAcceptIndicesText } from "./review-export.js";
import { t } from "./i18n/index.js";
import { copyTextToClipboard } from "./insert-meta.js";
import { DIALOG_OVERLAY_CSS, createDevOnlyActionSelect } from "./ui-style.js";
export { compareDeckStructured, compareDeckTexts, comparedSlideParagraphs, comparePresentationMeta, summarizeCompareEntries, slideEntryHasTextPatches, slideEntryHasStructureDiff } from "./compare-deck.js";
function structureKindLabel(kind) {
    return t(`compare.struct.${kind}`);
}
function entryMatchesFilter(e, filter) {
    if (e.status === "same")
        return false;
    if (filter === "all")
        return true;
    if (filter === "text")
        return slideEntryHasTextPatches(e);
    return slideEntryHasStructureDiff(e);
}
export function openCompareDialog(doc, ctx) {
    let other = null;
    let entries = [];
    let activeFilter = "all";
    const overlay = doc.createElement("div");
    overlay.className = "local-picker-overlay";
    overlay.style.cssText =
        DIALOG_OVERLAY_CSS;
    const modal = doc.createElement("div");
    modal.style.cssText =
        "background:var(--popover);color:var(--popover-foreground);border:1px solid var(--border);border-radius:var(--radius-modal,12px);box-shadow:var(--shadow-lg);padding:16px 18px;width:min(720px,94vw);max-height:88vh;display:flex;flex-direction:column;gap:10px";
    const title = doc.createElement("h3");
    title.style.margin = "0";
    title.textContent = t("compare.title");
    modal.appendChild(title);
    const hint = doc.createElement("p");
    hint.style.cssText = "margin:0;font-size:12px;color:var(--muted-foreground,#a1a1aa)";
    hint.textContent = t("compare.hint");
    modal.appendChild(hint);
    const fileRow = doc.createElement("div");
    fileRow.style.cssText = "display:flex;gap:8px;align-items:center;flex-wrap:wrap";
    const fileInput = doc.createElement("input");
    fileInput.type = "file";
    fileInput.accept = ".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation";
    const fileLabel = doc.createElement("span");
    fileLabel.style.fontSize = "12px";
    fileLabel.textContent = t("compare.noFile");
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
    acceptAllBtn.textContent = t("compare.acceptAll");
    acceptAllBtn.style.cssText =
        "background:var(--success);color:var(--success-foreground);border:none;border-radius:var(--radius-sm,6px);padding:6px 12px;cursor:pointer;font:inherit";
    acceptAllBtn.style.display = "none";
    const updateAcceptAll = () => {
        const n = entries.filter((e) => e.status === "changed" && slideEntryHasTextPatches(e)).length;
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
        const s = summarizeCompareEntries(entries);
        statsRow.style.display = "";
        statsRow.textContent = formatCompareReadinessLine(entries);
        coverageRow.style.display = "";
        coverageRow.textContent = t("compare.slideCoverage", {
            breakdown: formatCompareSlideCoverageBreakdownLine(entries),
        });
        statsRow.title = t("compare.stats", {
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
        mkFilter("all", t("compare.filter.all"));
        mkFilter("text", t("compare.filter.text"));
        mkFilter("structure", t("compare.filter.structure"));
    };
    let modalDismiss;
    const close = () => {
        modalDismiss?.release();
        overlay.remove();
    };
    const statusLabel = (e) => {
        switch (e.status) {
            case "same":
                return t("compare.status.same");
            case "changed":
                return t("compare.status.changed");
            case "added":
                return t("compare.status.added");
            case "removed":
                return t("compare.status.removed");
        }
    };
    const renderDetails = (parent, e) => {
        const details = doc.createElement("div");
        details.style.cssText =
            "margin-top:6px;padding:6px 8px;background:var(--secondary,#111827);border-radius:4px;font-size:11px;line-height:1.45";
        if (e.structure?.length) {
            const head = doc.createElement("div");
            head.style.fontWeight = "600";
            head.textContent = t("compare.section.structure");
            details.appendChild(head);
            const ul = doc.createElement("ul");
            ul.style.cssText = "margin:4px 0 8px;padding-left:18px";
            for (const s of e.structure) {
                const li = doc.createElement("li");
                li.textContent = t("compare.struct.row", {
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
            head.textContent = t("compare.section.textShapes");
            details.appendChild(head);
            const ul = doc.createElement("ul");
            ul.style.cssText = "margin:4px 0 0;padding-left:18px";
            for (const d of shapeDiffs) {
                const li = doc.createElement("li");
                if (d.textChanged) {
                    li.textContent = t("compare.textShape.text", {
                        n: d.shapeIndex,
                        before: d.before || "—",
                        after: d.after || "—",
                    });
                }
                else if (d.bboxMoved) {
                    li.textContent = t("compare.textShape.moved", { n: d.shapeIndex });
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
        const meta = comparePresentationMeta(ctx.pres, other);
        const prot = meta.find((m) => m.kind === "protection");
        if (!prot) {
            metaBanner.style.display = "none";
            return;
        }
        metaBanner.style.display = "";
        metaBanner.textContent = t("compare.meta.protection", {
            before: prot.before,
            after: prot.after,
        });
    };
    const renderList = () => {
        list.replaceChildren();
        if (!entries.length) {
            list.textContent = t("compare.empty");
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
            label.textContent = t("compare.slideRow", { n: e.slideIdx + 1, status: statusLabel(e) });
            const viewBtn = doc.createElement("button");
            viewBtn.type = "button";
            viewBtn.textContent = t("compare.view");
            viewBtn.style.cssText =
                "background:transparent;border:1px solid var(--border);border-radius:4px;padding:3px 8px;cursor:pointer;font:inherit;font-size:12px";
            viewBtn.addEventListener("click", () => {
                ctx.gotoSlide(e.slideIdx);
                close();
            });
            top.append(label, viewBtn);
            if (e.status === "changed" && other && slideEntryHasTextPatches(e)) {
                const accept = doc.createElement("button");
                accept.type = "button";
                accept.textContent = t("compare.accept");
                accept.style.cssText =
                    "background:var(--primary);color:var(--primary-foreground);border:none;border-radius:4px;padding:3px 8px;cursor:pointer;font:inherit;font-size:12px";
                accept.addEventListener("click", () => {
                    ctx.acceptSlide(e.slideIdx, other);
                    entries = compareDeckStructured(ctx.pres, other);
                    renderMeta();
                    renderStatsAndFilters();
                    renderList();
                });
                const reject = doc.createElement("button");
                reject.type = "button";
                reject.textContent = t("compare.reject");
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
                    ? t("compare.noFilterMatch")
                    : t("compare.allSame");
        }
        updateAcceptAll();
        renderStatsAndFilters();
    };
    acceptAllBtn.addEventListener("click", () => {
        if (!other)
            return;
        const indices = entries
            .filter((e) => e.status === "changed" && slideEntryHasTextPatches(e))
            .map((e) => e.slideIdx);
        if (!indices.length)
            return;
        if (ctx.acceptAllSlides)
            ctx.acceptAllSlides(other, indices);
        else
            for (const idx of indices)
                ctx.acceptSlide(idx, other);
        entries = compareDeckStructured(ctx.pres, other);
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
            fileLabel.textContent = t("compare.loading");
            try {
                const buf = await file.arrayBuffer();
                other = await parsePptx(buf);
                entries = compareDeckStructured(ctx.pres, other);
                renderMeta();
                fileLabel.textContent = file.name;
                activeFilter = "all";
                renderStatsAndFilters();
                renderList();
            }
            catch {
                fileLabel.textContent = t("compare.parseFailed");
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
        const ok = await copyTextToClipboard(text);
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
    footer.append(createDevOnlyActionSelect(doc, t("developer.dumpMenu"), [
        {
            label: t("compare.copyReport"),
            run: async () => {
                const src = requireOther();
                if (!src)
                    return false;
                await copyDump(exportCompareReportText(entries, comparePresentationMeta(ctx.pres, src), { filter: activeFilter }));
            },
        },
        {
            label: t("compare.copyStats"),
            run: async () => {
                if (!requireOther())
                    return false;
                await copyDump(formatCompareStatsLine(entries));
            },
        },
        {
            label: t("compare.copyCompact"),
            run: async () => {
                const src = requireOther();
                if (!src)
                    return false;
                await copyDump(exportCompareCompactText(entries, comparePresentationMeta(ctx.pres, src), {
                    filter: activeFilter,
                }));
            },
        },
        {
            label: t("compare.copyAccept"),
            run: async () => {
                if (!requireOther())
                    return false;
                await copyDump(exportCompareAcceptIndicesText(entries));
            },
        },
        {
            label: t("compare.copyReadiness"),
            run: async () => {
                if (!requireOther())
                    return false;
                await copyDump(exportCompareReadinessText(entries));
            },
        },
        {
            label: t("compare.copyStructure"),
            run: async () => {
                if (!requireOther())
                    return false;
                await copyDump(exportCompareStructureIndicesText(entries));
            },
        },
        {
            label: t("compare.copySlideCoverage"),
            run: async () => {
                if (!requireOther())
                    return false;
                await copyDump(exportCompareSlideCoverageText(entries));
            },
        },
        { label: t("compare.gotoMostChanged"), run: () => jumpDump(slideWithMostCompareChanges(entries)) },
        {
            label: t("compare.gotoMostStructure"),
            run: () => jumpDump(slideWithMostStructureCompareChanges(entries)),
        },
        { label: t("compare.gotoFirstChange"), run: () => jumpDump(slideWithFirstCompareChange(entries)) },
        { label: t("compare.gotoFewestChanges"), run: () => jumpDump(slideWithFewestCompareChanges(entries)) },
    ], { done: t("compare.copiedReport"), failed: t("compare.copyFailed") }), acceptAllBtn);
    const cancel = doc.createElement("button");
    cancel.type = "button";
    cancel.textContent = t("compare.close");
    cancel.style.cssText =
        "background:var(--secondary);color:var(--foreground);border:1px solid var(--border);border-radius:var(--radius-sm,6px);padding:6px 12px;cursor:pointer;font:inherit";
    cancel.addEventListener("click", close);
    footer.appendChild(cancel);
    modal.appendChild(footer);
    overlay.appendChild(modal);
    modalDismiss = bindEditorModal({ doc, overlay, panel: modal, onCancel: close });
    doc.body.appendChild(overlay);
    renderList();
}
