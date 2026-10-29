"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.openAccessibilityDialog = openAccessibilityDialog;
const dialog_1 = require("./dialog");
const i18n_1 = require("./i18n");
const accessibility_audit_1 = require("./accessibility-audit");
const review_export_1 = require("./review-export");
const insert_meta_1 = require("./insert-meta");
const ui_style_1 = require("./ui-style");
function openAccessibilityDialog(doc, pres, onJumpToSlide, onFixIssue, onFixAllContrast, onFixAlt) {
    let report = (0, accessibility_audit_1.auditPresentationAccessibility)(pres);
    let activeFilter = "all";
    const overlay = doc.createElement("div");
    overlay.className = "local-picker-overlay";
    overlay.style.cssText =
        ui_style_1.DIALOG_OVERLAY_CSS;
    let modalDismiss;
    const dismiss = () => {
        modalDismiss?.release();
        overlay.remove();
    };
    const modal = doc.createElement("div");
    modal.style.cssText =
        "background:var(--popover);color:var(--popover-foreground);border:1px solid var(--border);border-radius:var(--radius-modal,12px);box-shadow:var(--shadow-lg);padding:16px 18px;width:min(520px,92vw);max-height:80vh;display:flex;flex-direction:column;gap:10px";
    const title = doc.createElement("h3");
    title.style.margin = "0";
    title.textContent = (0, i18n_1.t)("accessibility.title");
    modal.appendChild(title);
    const summary = doc.createElement("p");
    summary.style.cssText = "margin:0;font-size:12px;color:var(--muted-foreground,#a1a1aa);line-height:1.45";
    modal.appendChild(summary);
    const filterRow = doc.createElement("div");
    filterRow.style.cssText = "display:none;flex-wrap:wrap;gap:6px";
    modal.appendChild(filterRow);
    const list = doc.createElement("div");
    list.className = "ppt-scroll";
    list.style.cssText =
        "flex:1 1 auto;overflow:auto;display:flex;flex-direction:column;gap:6px;min-height:220px;border:1px solid var(--border);border-radius:var(--radius-md,6px);padding:8px";
    const kindLabel = (k) => {
        switch (k) {
            case "contrast":
                return (0, i18n_1.t)("accessibility.kind.contrast");
            case "empty-slide":
                return (0, i18n_1.t)("accessibility.kind.emptySlide");
            case "tiny-text":
                return (0, i18n_1.t)("accessibility.kind.tinyText");
            case "missing-alt":
                return (0, i18n_1.t)("accessibility.kind.missingAlt");
            case "image-overlap":
                return (0, i18n_1.t)("accessibility.kind.imageOverlap");
            case "missing-title":
                return (0, i18n_1.t)("accessibility.kind.missingTitle");
        }
    };
    const filteredIssues = () => {
        if (activeFilter === "all")
            return report.issues;
        return report.issues.filter((i) => i.kind === activeFilter);
    };
    const renderFilters = () => {
        filterRow.replaceChildren();
        if (report.issues.length === 0)
            return;
        const byKind = (0, accessibility_audit_1.summarizeAccessibilityByKind)(report);
        const order = [
            "contrast",
            "missing-alt",
            "missing-title",
            "image-overlap",
            "tiny-text",
            "empty-slide",
        ];
        const kindsPresent = order.filter((k) => byKind[k]);
        if (kindsPresent.length < 2) {
            filterRow.style.display = "none";
            return;
        }
        filterRow.style.display = "flex";
        const mkChip = (kind, label, count) => {
            const b = doc.createElement("button");
            b.type = "button";
            const active = activeFilter === kind;
            b.style.cssText = `font:inherit;font-size:11px;padding:3px 8px;border-radius:999px;cursor:pointer;border:1px solid ${active ? "var(--primary)" : "var(--border,#3a3a3a)"};background:${active ? "var(--accent,#333333)" : "transparent"};color:inherit`;
            b.textContent = count === undefined ? label : `${label} (${count})`;
            b.addEventListener("click", () => {
                activeFilter = kind;
                renderFilters();
                renderIssues();
            });
            filterRow.appendChild(b);
        };
        mkChip("all", (0, i18n_1.t)("accessibility.filterAll"), report.issues.length);
        for (const k of order) {
            const n = byKind[k];
            if (n)
                mkChip(k, kindLabel(k), n);
        }
    };
    const renderIssues = () => {
        list.replaceChildren();
        const issues = filteredIssues();
        if (report.issues.length === 0) {
            const ok = doc.createElement("p");
            ok.style.cssText = "margin:8px 0;color:var(--success);font-size:13px";
            ok.textContent = (0, i18n_1.t)("accessibility.noIssues");
            list.appendChild(ok);
            return;
        }
        if (issues.length === 0) {
            const empty = doc.createElement("p");
            empty.style.cssText = "margin:8px 0;font-size:12px;color:var(--muted-foreground,#a1a1aa)";
            empty.textContent = (0, i18n_1.t)("accessibility.noFilterMatch");
            list.appendChild(empty);
            return;
        }
        for (const issue of issues) {
            const row = doc.createElement("div");
            row.style.cssText =
                "border:1px solid var(--border,#3a3a3a);border-radius:var(--radius-md,6px);padding:8px 10px;background:var(--secondary)";
            const head = doc.createElement("div");
            head.style.cssText = "display:flex;align-items:center;gap:8px;margin-bottom:4px;flex-wrap:wrap";
            const badge = doc.createElement("span");
            badge.style.cssText =
                "font-size:10px;text-transform:uppercase;letter-spacing:.04em;padding:2px 6px;border-radius:4px;background:color-mix(in srgb, var(--primary) 18%, transparent);color:var(--primary-soft)";
            badge.textContent = kindLabel(issue.kind);
            const meta = doc.createElement("span");
            meta.style.flex = "1";
            meta.style.fontSize = "11px";
            meta.style.color = "var(--muted-foreground,#a1a1aa)";
            meta.textContent = (0, i18n_1.t)("accessibility.slideN", { n: issue.slideIndex + 1 });
            const actions = doc.createElement("div");
            actions.style.cssText = "display:flex;gap:6px;margin-left:auto;flex-wrap:wrap";
            const jump = doc.createElement("button");
            jump.type = "button";
            jump.textContent = issue.shapeId ? (0, i18n_1.t)("accessibility.selectShape") : (0, i18n_1.t)("accessibility.goTo");
            jump.style.cssText =
                "background:transparent;border:1px solid var(--border);border-radius:4px;padding:2px 8px;cursor:pointer;font:inherit;font-size:11px;color:inherit";
            jump.addEventListener("click", () => {
                onJumpToSlide(issue.slideIndex, issue.shapeId);
                dismiss();
            });
            actions.appendChild(jump);
            if (issue.kind === "contrast" && issue.shapeId && issue.suggestedColor && onFixIssue) {
                const fix = doc.createElement("button");
                fix.type = "button";
                fix.textContent = (0, i18n_1.t)("accessibility.fixContrast");
                fix.style.cssText =
                    "background:var(--success);color:var(--success-foreground);border:none;border-radius:var(--radius-sm,6px);padding:2px 8px;cursor:pointer;font:inherit;font-size:11px";
                fix.addEventListener("click", () => {
                    onFixIssue(issue);
                    fix.disabled = true;
                    fix.textContent = (0, i18n_1.t)("accessibility.fixed");
                    refreshReport();
                });
                actions.appendChild(fix);
            }
            if (issue.kind === "missing-alt" && issue.shapeId && onFixAlt) {
                const altInput = doc.createElement("input");
                altInput.type = "text";
                altInput.placeholder = (0, i18n_1.t)("accessibility.altPlaceholder");
                altInput.value = (0, accessibility_audit_1.suggestedImageAltText)(issue.shapeName);
                altInput.style.cssText =
                    "flex:1 1 120px;min-width:100px;font:inherit;font-size:11px;padding:2px 6px;border-radius:4px;border:1px solid var(--border);background:var(--background);color:inherit";
                const fixAlt = doc.createElement("button");
                fixAlt.type = "button";
                fixAlt.textContent = (0, i18n_1.t)("accessibility.fixAlt");
                fixAlt.style.cssText =
                    "background:var(--primary);color:var(--primary-foreground);border:none;border-radius:4px;padding:2px 8px;cursor:pointer;font:inherit;font-size:11px";
                fixAlt.addEventListener("click", () => {
                    const descr = altInput.value.trim();
                    if (!descr)
                        return;
                    onFixAlt(issue, descr);
                    fixAlt.disabled = true;
                    altInput.disabled = true;
                    fixAlt.textContent = (0, i18n_1.t)("accessibility.fixed");
                    refreshReport();
                });
                const altRow = doc.createElement("div");
                altRow.style.cssText = "display:flex;gap:6px;margin-top:6px;flex-wrap:wrap;width:100%";
                altRow.append(altInput, fixAlt);
                head.append(badge, meta, actions);
                const detail = doc.createElement("div");
                detail.style.fontSize = "12px";
                const name = issue.shapeName ? `${issue.shapeName}: ` : "";
                detail.textContent = `${name}${(0, accessibility_audit_1.accessibilityIssueDetail)(issue)}`;
                row.append(head, detail, altRow);
                list.appendChild(row);
                continue;
            }
            head.append(badge, meta, actions);
            const detail = doc.createElement("div");
            detail.style.fontSize = "12px";
            const name = issue.shapeName ? `${issue.shapeName}: ` : "";
            detail.textContent = `${name}${(0, accessibility_audit_1.accessibilityIssueDetail)(issue)}`;
            row.append(head, detail);
            list.appendChild(row);
        }
    };
    const refreshReport = () => {
        report = (0, accessibility_audit_1.auditPresentationAccessibility)(pres);
        const readiness = (0, review_export_1.accessibilityReadinessPercent)(report);
        summary.textContent =
            report.issues.length === 0
                ? `${(0, i18n_1.t)("accessibility.allClear", { slides: report.checkedSlides, passed: report.passed })} · ${readiness}%`
                : `${(0, i18n_1.t)("accessibility.summary", {
                    issues: report.issues.length,
                    slides: report.checkedSlides,
                    passed: report.passed,
                })} · ${readiness}%`;
        if (activeFilter !== "all" && !report.issues.some((i) => i.kind === activeFilter)) {
            activeFilter = "all";
        }
        renderFilters();
        renderIssues();
    };
    refreshReport();
    modal.appendChild(list);
    const footer = doc.createElement("div");
    footer.style.cssText = "display:flex;justify-content:flex-end;align-items:center;gap:8px;flex-wrap:wrap";
    const copyDump = async (text) => {
        const ok = await (0, insert_meta_1.copyTextToClipboard)(text);
        if (!ok)
            throw new Error("copy failed");
    };
    const jumpDump = (idx) => {
        if (idx == null)
            return false;
        onJumpToSlide(idx);
        dismiss();
        return true;
    };
    footer.append((0, ui_style_1.createDevOnlyActionSelect)(doc, (0, i18n_1.t)("developer.dumpMenu"), [
        { label: (0, i18n_1.t)("accessibility.copyReport"), run: () => copyDump((0, review_export_1.exportAccessibilityReportText)(report, { kind: activeFilter })) },
        { label: (0, i18n_1.t)("accessibility.copyCompact"), run: () => copyDump((0, review_export_1.exportAccessibilityCompactText)(report, { kind: activeFilter })) },
        { label: (0, i18n_1.t)("accessibility.copyDeckReview"), run: () => copyDump((0, review_export_1.exportDeckReviewSummaryText)(pres, { a11yReport: report })) },
        { label: (0, i18n_1.t)("accessibility.copyDeckCompact"), run: () => copyDump((0, review_export_1.exportDeckReviewCompactText)(pres, { a11yReport: report })) },
        { label: (0, i18n_1.t)("accessibility.copyBreakdown"), run: () => copyDump((0, review_export_1.exportAccessibilityKindBreakdownText)(report)) },
        { label: (0, i18n_1.t)("accessibility.copyReadiness"), run: () => copyDump((0, review_export_1.exportAccessibilityReadinessText)(report)) },
        { label: (0, i18n_1.t)("accessibility.copyDeckReadiness"), run: () => copyDump((0, review_export_1.exportDeckReviewReadinessText)(pres, { a11yReport: report })) },
        { label: (0, i18n_1.t)("accessibility.copyDeckStats"), run: () => copyDump((0, review_export_1.formatDeckReviewStatsLine)(pres, { a11yReport: report })) },
        { label: (0, i18n_1.t)("accessibility.copySlideCoverage"), run: () => copyDump((0, review_export_1.exportA11ySlideCoverageText)(report)) },
        {
            label: (0, i18n_1.t)("accessibility.gotoBusiest"),
            run: () => jumpDump(activeFilter === "all"
                ? (0, review_export_1.slideWithMostAccessibilityIssues)(report)
                : (0, review_export_1.slideWithMostIssuesOfKind)(report, activeFilter)),
        },
        { label: (0, i18n_1.t)("accessibility.gotoFirstIssue"), run: () => jumpDump((0, review_export_1.slideWithFirstAccessibilityIssue)(report)) },
        { label: (0, i18n_1.t)("accessibility.gotoFewestIssues"), run: () => jumpDump((0, review_export_1.slideWithFewestAccessibilityIssues)(report)) },
    ], { done: (0, i18n_1.t)("accessibility.copiedReport"), failed: (0, i18n_1.t)("accessibility.copyFailed") }));
    if (onFixAllContrast && (0, accessibility_audit_1.contrastIssuesFromReport)(report).length > 0) {
        const fixAll = doc.createElement("button");
        fixAll.type = "button";
        fixAll.textContent = (0, i18n_1.t)("accessibility.fixAllContrast");
        fixAll.style.cssText =
            "background:var(--success);color:var(--success-foreground);border:none;border-radius:var(--radius-sm,6px);padding:6px 12px;cursor:pointer;font:inherit";
        fixAll.addEventListener("click", () => {
            const fixes = (0, accessibility_audit_1.contrastIssuesFromReport)(report);
            onFixAllContrast(fixes);
            refreshReport();
        });
        footer.appendChild(fixAll);
    }
    if (onFixAlt && (0, accessibility_audit_1.missingAltIssuesFromReport)(report).length > 1) {
        const fixAllAlt = doc.createElement("button");
        fixAllAlt.type = "button";
        fixAllAlt.textContent = (0, i18n_1.t)("accessibility.fixAllAlt");
        fixAllAlt.style.cssText =
            "background:var(--primary);color:var(--primary-foreground);border:none;border-radius:4px;padding:6px 12px;cursor:pointer;font:inherit";
        fixAllAlt.addEventListener("click", () => {
            for (const issue of (0, accessibility_audit_1.missingAltIssuesFromReport)(report)) {
                const descr = (0, accessibility_audit_1.suggestedImageAltText)(issue.shapeName);
                if (descr)
                    onFixAlt(issue, descr);
            }
            refreshReport();
        });
        footer.appendChild(fixAllAlt);
    }
    const close = doc.createElement("button");
    close.type = "button";
    close.textContent = (0, i18n_1.t)("accessibility.close");
    close.style.cssText =
        "background:var(--primary);color:var(--primary-foreground);border:none;border-radius:4px;padding:6px 12px;cursor:pointer;font:inherit";
    close.addEventListener("click", dismiss);
    footer.appendChild(close);
    modal.appendChild(footer);
    overlay.appendChild(modal);
    modalDismiss = (0, dialog_1.bindEditorModal)({ doc, overlay, panel: modal, onCancel: dismiss });
    doc.body.appendChild(overlay);
}
