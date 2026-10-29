"use strict";
// Developer diagnostics panel (insert-object inventory + Morph pair audit).
// Shown as a right-rail tab only while the host has `body.dev-mode`.
Object.defineProperty(exports, "__esModule", { value: true });
exports.mountDevPanel = mountDevPanel;
const transition_fx_1 = require("@sliiu/present-transition-fx");
const i18n_1 = require("./i18n");
const insert_meta_1 = require("./insert-meta");
const ui_style_1 = require("./ui-style");
function mountDevPanel(parent, opts) {
    const doc = parent.ownerDocument;
    const el = doc.createElement("div");
    el.className = `ppt-dev-panel ${ui_style_1.SCROLL_CLASS}`;
    el.style.cssText = [
        "flex:1 1 auto",
        "min-height:0",
        "overflow:auto",
        "background:var(--editor-panel,#191919)",
        "color:var(--foreground)",
        "font:12px/1.4 system-ui,sans-serif",
        "padding:14px 14px",
    ].join(";");
    parent.appendChild(el);
    let kindFilter = "all";
    const muted = "font-size:11px;color:var(--muted-foreground);margin-bottom:8px;line-height:1.45";
    const sectionWrap = (title) => {
        const wrap = doc.createElement("div");
        wrap.style.cssText = "margin-bottom:14px;padding-bottom:12px;border-bottom:1px solid var(--border)";
        const h = doc.createElement("div");
        h.textContent = title;
        h.style.cssText =
            "color:var(--muted-foreground);font-size:11px;text-transform:uppercase;margin-bottom:8px;letter-spacing:.4px";
        wrap.appendChild(h);
        return wrap;
    };
    const line = (text, extraCss = "") => {
        const d = doc.createElement("div");
        d.style.cssText = muted + extraCss;
        d.textContent = text;
        return d;
    };
    const mkBtn = (label, onClick) => {
        const b = doc.createElement("button");
        b.type = "button";
        b.textContent = label;
        b.style.cssText = [
            "background:var(--card)",
            "color:var(--foreground)",
            "border:1px solid var(--border)",
            "border-radius:4px",
            "padding:4px 8px",
            "cursor:pointer",
            "font:inherit",
            "font-size:10px",
        ].join(";");
        b.addEventListener("mouseenter", () => (b.style.background = "var(--secondary)"));
        b.addEventListener("mouseleave", () => (b.style.background = "var(--card)"));
        b.addEventListener("click", onClick);
        return b;
    };
    const btnRow = (...buttons) => {
        const row = doc.createElement("div");
        row.style.cssText = "display:flex;flex-wrap:wrap;gap:6px";
        for (const b of buttons)
            row.appendChild(b);
        return row;
    };
    const buildInsertSection = (slide, slideIndex) => {
        const wrap = sectionWrap((0, i18n_1.t)("inspector.section.insertInventory"));
        const refs = slide ? (0, insert_meta_1.collectInsertShapesOnSlide)(slide) : [];
        wrap.appendChild(line((0, insert_meta_1.formatInsertDeckStatsLine)(opts.pres)));
        wrap.appendChild(line((0, insert_meta_1.formatInsertReadinessLine)(opts.pres)));
        wrap.appendChild(line((0, i18n_1.t)("inspector.insertInventory.kindBreakdown", {
            breakdown: (0, insert_meta_1.formatInsertKindBreakdownLine)(opts.pres),
        })));
        wrap.appendChild(line((0, i18n_1.t)("inspector.insertInventory.slideCoverage", {
            breakdown: (0, insert_meta_1.formatInsertSlideCoverageBreakdownLine)(opts.pres),
        })));
        wrap.appendChild(line((0, insert_meta_1.formatInsertLargestShapeLine)(opts.pres)));
        const filterRow = doc.createElement("div");
        filterRow.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px";
        wrap.appendChild(filterRow);
        const head = doc.createElement("div");
        head.style.cssText = muted;
        wrap.appendChild(head);
        const stats = doc.createElement("div");
        stats.style.cssText = muted;
        wrap.appendChild(stats);
        const list = doc.createElement("ul");
        list.style.cssText =
            "margin:0 0 8px;padding-left:18px;font-size:11px;line-height:1.45;color:var(--muted-foreground)";
        wrap.appendChild(list);
        const renderKindFilters = () => {
            filterRow.replaceChildren();
            const deckRefs = (0, insert_meta_1.collectInsertShapesInDeck)(opts.pres);
            const mk = (kind, label) => {
                const b = doc.createElement("button");
                b.type = "button";
                const active = kindFilter === kind;
                b.style.cssText = `font:inherit;font-size:10px;padding:2px 8px;border-radius:999px;cursor:pointer;border:1px solid ${active ? "var(--primary)" : "var(--border,#3a3a3a)"};background:${active ? "var(--accent,#333333)" : "transparent"};color:inherit`;
                const count = kind === "all" ? deckRefs.length : (0, insert_meta_1.filterInsertRefsByKind)(deckRefs, kind).length;
                b.textContent = count ? `${label} (${count})` : label;
                b.addEventListener("click", () => {
                    kindFilter = kind;
                    renderKindFilters();
                    renderList();
                });
                filterRow.appendChild(b);
            };
            mk("all", (0, i18n_1.t)("inspector.insertInventory.filterAll"));
            mk("ole", (0, i18n_1.t)("inspector.insertInventory.filterOle"));
            mk("model3d", (0, i18n_1.t)("inspector.insertInventory.filterModel3d"));
            mk("video", (0, i18n_1.t)("inspector.insertInventory.filterVideo"));
            mk("audio", (0, i18n_1.t)("inspector.insertInventory.filterAudio"));
            mk("smartart", (0, i18n_1.t)("inspector.insertInventory.filterSmartArt"));
            filterRow.style.display = deckRefs.length ? "flex" : "none";
        };
        const renderList = () => {
            const deckRefs = (0, insert_meta_1.collectInsertShapesInDeck)(opts.pres);
            const filteredDeck = (0, insert_meta_1.filterInsertRefsByKind)(deckRefs, kindFilter);
            const slideRefs = kindFilter === "all" ? refs : refs.filter((ref) => ref.kind === kindFilter);
            head.textContent = slideRefs.length
                ? (0, i18n_1.t)("inspector.insertInventory.count", { n: slideRefs.length })
                : (0, i18n_1.t)("inspector.insertInventory.noneOnSlide");
            if (slideRefs.length && slide) {
                const largeCount = (0, insert_meta_1.collectLargeInsertShapesOnSlide)(slide).filter((item) => kindFilter === "all" ? true : item.kind === kindFilter).length;
                stats.style.display = "";
                stats.textContent =
                    largeCount > 0
                        ? `${(0, insert_meta_1.formatInsertInventoryStatsLine)(slideRefs)} · ${(0, i18n_1.t)("inspector.insertInventory.large", { n: largeCount })}`
                        : (0, insert_meta_1.formatInsertInventoryStatsLine)(slideRefs);
            }
            else {
                stats.style.display = "none";
                stats.textContent = "";
            }
            const largeIds = new Set(slide
                ? (0, insert_meta_1.collectLargeInsertShapesOnSlide)(slide)
                    .filter((item) => (kindFilter === "all" ? true : item.kind === kindFilter))
                    .map((item) => item.id)
                : []);
            list.replaceChildren();
            for (const ref of slideRefs) {
                const li = doc.createElement("li");
                li.textContent = largeIds.has(ref.id)
                    ? `${ref.kind}: ${ref.label} (${(0, i18n_1.t)("inspector.insertInventory.largeTag")})`
                    : `${ref.kind}: ${ref.label}`;
                list.appendChild(li);
            }
            if (!slideRefs.length && kindFilter !== "all" && filteredDeck.length) {
                const hint = doc.createElement("li");
                hint.style.fontStyle = "italic";
                hint.textContent = (0, i18n_1.t)("inspector.insertInventory.noneOnSlideFiltered", {
                    n: filteredDeck.length,
                });
                list.appendChild(hint);
            }
        };
        renderKindFilters();
        renderList();
        const buttons = [
            mkBtn((0, i18n_1.t)("inspector.insertInventory.copyReadiness"), () => {
                void (0, insert_meta_1.copyTextToClipboard)((0, insert_meta_1.exportInsertReadinessText)(opts.pres));
            }),
            mkBtn((0, i18n_1.t)("inspector.insertInventory.copyKindBreakdown"), () => {
                void (0, insert_meta_1.copyTextToClipboard)(`${(0, i18n_1.t)("inspector.insertInventory.kindBreakdown", { breakdown: (0, insert_meta_1.formatInsertKindBreakdownLine)(opts.pres) })}\n${(0, insert_meta_1.formatInsertDeckStatsLine)(opts.pres)}`);
            }),
            mkBtn((0, i18n_1.t)("inspector.insertInventory.copySlideCoverage"), () => {
                void (0, insert_meta_1.copyTextToClipboard)((0, insert_meta_1.exportInsertSlideCoverageText)(opts.pres));
            }),
            mkBtn((0, i18n_1.t)("inspector.insertInventory.copyLargestShape"), () => {
                void (0, insert_meta_1.copyTextToClipboard)((0, insert_meta_1.exportInsertLargestShapeText)(opts.pres));
            }),
            mkBtn((0, i18n_1.t)("inspector.insertInventory.copyUnsized"), () => {
                void (0, insert_meta_1.copyTextToClipboard)((0, insert_meta_1.exportInsertUnsizedShapesText)(opts.pres));
            }),
        ];
        if (slide) {
            buttons.push(mkBtn((0, i18n_1.t)("inspector.insertInventory.copy"), () => {
                void (0, insert_meta_1.copyTextToClipboard)((0, insert_meta_1.exportSlideInsertInventoryText)(slide, slideIndex));
            }), mkBtn((0, i18n_1.t)("inspector.insertInventory.copySlideCompact"), () => {
                void (0, insert_meta_1.copyTextToClipboard)((0, insert_meta_1.exportSlideInsertCompactText)(slide, slideIndex));
            }));
        }
        buttons.push(mkBtn((0, i18n_1.t)("inspector.insertInventory.copyDeck"), () => {
            void (0, insert_meta_1.copyTextToClipboard)((0, insert_meta_1.exportDeckInsertByKindText)(opts.pres, kindFilter));
        }), mkBtn((0, i18n_1.t)("inspector.insertInventory.copyLarge"), () => {
            void (0, insert_meta_1.copyTextToClipboard)((0, insert_meta_1.exportLargeInsertReportText)(opts.pres));
        }), mkBtn((0, i18n_1.t)("inspector.insertInventory.copyDeckCompact"), () => {
            void (0, insert_meta_1.copyTextToClipboard)((0, insert_meta_1.exportDeckInsertByKindCompactText)(opts.pres, kindFilter));
        }), mkBtn((0, i18n_1.t)("inspector.insertInventory.copyLargeCompact"), () => {
            void (0, insert_meta_1.copyTextToClipboard)((0, insert_meta_1.exportLargeInsertCompactText)(opts.pres));
        }));
        const busiestIdx = (0, insert_meta_1.slideWithMostInsertShapes)(opts.pres);
        if (busiestIdx != null && opts.gotoSlide) {
            buttons.push(mkBtn((0, i18n_1.t)("inspector.insertInventory.gotoBusiest"), () => opts.gotoSlide?.(busiestIdx)));
        }
        const mostLargeIdx = (0, insert_meta_1.slideWithMostLargeInsertShapes)(opts.pres);
        if (mostLargeIdx != null && opts.gotoSlide) {
            buttons.push(mkBtn((0, i18n_1.t)("inspector.insertInventory.gotoMostLarge"), () => opts.gotoSlide?.(mostLargeIdx)));
        }
        const largestPayloadIdx = (0, insert_meta_1.slideWithLargestInsertPayload)(opts.pres);
        if (largestPayloadIdx != null && opts.gotoSlide) {
            buttons.push(mkBtn((0, i18n_1.t)("inspector.insertInventory.gotoLargestPayload"), () => opts.gotoSlide?.(largestPayloadIdx)));
        }
        const fewestIdx = (0, insert_meta_1.slideWithFewestInsertShapes)(opts.pres);
        if (fewestIdx != null && opts.gotoSlide && fewestIdx !== busiestIdx) {
            buttons.push(mkBtn((0, i18n_1.t)("inspector.insertInventory.gotoFewest"), () => opts.gotoSlide?.(fewestIdx)));
        }
        const firstEmptyIdx = (0, insert_meta_1.slideWithFirstWithoutInsertShapes)(opts.pres);
        if (firstEmptyIdx != null && opts.gotoSlide) {
            buttons.push(mkBtn((0, i18n_1.t)("inspector.insertInventory.gotoFirstEmpty"), () => opts.gotoSlide?.(firstEmptyIdx)));
        }
        wrap.appendChild(btnRow(...buttons));
        return wrap;
    };
    const buildMorphSection = () => {
        const wrap = sectionWrap((0, i18n_1.t)("developer.section.morph"));
        const idx = opts.currentSlide();
        const from = opts.pres.slides[idx];
        const to = opts.pres.slides[idx + 1];
        const multi = opts.pres.slides.length >= 2;
        if (!from || !to) {
            wrap.appendChild(line((0, i18n_1.t)("ribbon.transition.morphStatsNoNext")));
        }
        else {
            const report = (0, transition_fx_1.auditMorphSlides)(from, to);
            const breakdown = report.pairs.length ? ` · ${(0, transition_fx_1.formatMorphMatchReasonBreakdown)(report)}` : "";
            const stats = line((0, transition_fx_1.formatMorphReadinessLine)(report) + breakdown);
            stats.style.color = "#a3e635";
            wrap.appendChild(stats);
        }
        if (multi) {
            const deckLines = (0, transition_fx_1.formatMorphDeckChromeLines)(opts.pres);
            wrap.appendChild(line(deckLines.stats));
            wrap.appendChild(line(deckLines.readiness));
            wrap.appendChild(line((0, i18n_1.t)("ribbon.transition.morphPairCoverage", {
                breakdown: deckLines.pairCoverage,
            })));
            wrap.appendChild(line(deckLines.lowestPath));
        }
        const copyPair = (run) => () => {
            if (!from || !to)
                return;
            run();
        };
        const buttons = [];
        if (from && to) {
            const report = () => (0, transition_fx_1.auditMorphSlides)(from, to);
            buttons.push(mkBtn((0, i18n_1.t)("ribbon.transition.copyMorphAudit"), copyPair(() => {
                void (0, insert_meta_1.copyTextToClipboard)((0, transition_fx_1.exportMorphAuditText)(report(), { fromSlide: idx, toSlide: idx + 1 }));
            })), mkBtn((0, i18n_1.t)("ribbon.transition.copyMorphIssues"), copyPair(() => {
                void (0, insert_meta_1.copyTextToClipboard)((0, transition_fx_1.exportMorphAuditText)(report(), { fromSlide: idx, toSlide: idx + 1, filter: "issues" }));
            })), mkBtn((0, i18n_1.t)("ribbon.transition.copyMorphIssuesCompact"), copyPair(() => {
                void (0, insert_meta_1.copyTextToClipboard)((0, transition_fx_1.exportMorphIssuesCompactText)(report(), { fromSlide: idx, toSlide: idx + 1 }));
            })), mkBtn((0, i18n_1.t)("ribbon.transition.copyMorphPairCompact"), copyPair(() => {
                void (0, insert_meta_1.copyTextToClipboard)((0, transition_fx_1.exportMorphPairCompactText)(report(), { fromSlide: idx, toSlide: idx + 1 }));
            })), mkBtn((0, i18n_1.t)("ribbon.transition.copyMorphReadiness"), copyPair(() => {
                void (0, insert_meta_1.copyTextToClipboard)((0, transition_fx_1.exportMorphReadinessText)(report(), { fromSlide: idx, toSlide: idx + 1 }));
            })));
        }
        if (multi) {
            buttons.push(mkBtn((0, i18n_1.t)("ribbon.transition.copyMorphDeckAudit"), () => {
                void (0, insert_meta_1.copyTextToClipboard)((0, transition_fx_1.exportMorphDeckAuditText)(opts.pres));
            }), mkBtn((0, i18n_1.t)("ribbon.transition.copyMorphDeckCompact"), () => {
                void (0, insert_meta_1.copyTextToClipboard)((0, transition_fx_1.exportMorphDeckCompactText)(opts.pres));
            }), mkBtn((0, i18n_1.t)("ribbon.transition.copyMorphDeckIssuesCompact"), () => {
                void (0, insert_meta_1.copyTextToClipboard)((0, transition_fx_1.exportMorphDeckIssuesCompactText)(opts.pres));
            }), mkBtn((0, i18n_1.t)("ribbon.transition.copyMorphDeckReadiness"), () => {
                void (0, insert_meta_1.copyTextToClipboard)((0, transition_fx_1.exportMorphDeckReadinessText)(opts.pres));
            }), mkBtn((0, i18n_1.t)("ribbon.transition.copyMorphDeckFiltered"), () => {
                void (0, insert_meta_1.copyTextToClipboard)((0, transition_fx_1.exportMorphDeckFilteredCompactText)(opts.pres, "issues"));
            }), mkBtn((0, i18n_1.t)("ribbon.transition.copyMorphPairCoverage"), () => {
                void (0, insert_meta_1.copyTextToClipboard)((0, transition_fx_1.exportMorphPairCoverageText)(opts.pres));
            }), mkBtn((0, i18n_1.t)("ribbon.transition.copyMorphUnmatched"), () => {
                void (0, insert_meta_1.copyTextToClipboard)((0, transition_fx_1.exportMorphUnmatchedShapesText)(opts.pres));
            }));
        }
        if (multi && opts.gotoSlide) {
            const jump = (find, label) => {
                buttons.push(mkBtn(label, () => {
                    const entry = find();
                    if (entry)
                        opts.gotoSlide?.(entry.fromIndex);
                }));
            };
            const deck = () => (0, transition_fx_1.auditMorphDeck)(opts.pres);
            jump(() => (0, transition_fx_1.findWeakestMorphPair)(deck()), (0, i18n_1.t)("ribbon.transition.gotoWeakestMorph"));
            jump(() => (0, transition_fx_1.findStrongestMorphPair)(deck()), (0, i18n_1.t)("ribbon.transition.gotoStrongestMorph"));
            jump(() => (0, transition_fx_1.findMostIssueMorphPair)(deck()), (0, i18n_1.t)("ribbon.transition.gotoMostIssueMorph"));
            jump(() => (0, transition_fx_1.findHighestPathCoverageMorphPair)(deck()), (0, i18n_1.t)("ribbon.transition.gotoHighestPathMorph"));
            jump(() => (0, transition_fx_1.findFirstIssueMorphPair)(deck()), (0, i18n_1.t)("ribbon.transition.gotoFirstIssueMorph"));
            jump(() => (0, transition_fx_1.findLowestPathCoverageMorphPair)(deck()), (0, i18n_1.t)("ribbon.transition.gotoLowestPathMorph"));
        }
        if (buttons.length)
            wrap.appendChild(btnRow(...buttons));
        return wrap;
    };
    const buildActionSection = (title, actions) => {
        const wrap = sectionWrap(title);
        wrap.appendChild(btnRow(...actions.map((action) => mkBtn(action.label, action.run))));
        return wrap;
    };
    const shapeDumpLabel = (shape) => {
        if (shape.kind === "ole")
            return `Embedded ${shape.embedFileName ?? shape.name ?? shape.id}`;
        if (shape.kind === "model3d")
            return `3D ${shape.objectName ?? shape.name ?? shape.id}`;
        if (shape.kind === "video" || shape.kind === "audio")
            return `${shape.kind} ${shape.name ?? shape.id}`;
        if (shape.kind === "group" && shape.smartArtMeta) {
            return `Diagram ${shape.smartArtMeta.layout} (${shape.name ?? shape.id})`;
        }
        return `${shape.kind} ${shape.name ?? shape.id}`;
    };
    const buildSelectionSection = () => {
        const wrap = sectionWrap((0, i18n_1.t)("developer.section.selection"));
        const dumpable = (opts.getSelectedShapes?.() ?? []).filter((shape) => (0, insert_meta_1.exportInsertShapeSummary)(shape) != null || (0, insert_meta_1.exportInsertShapeCompactText)(shape) != null);
        if (!dumpable.length) {
            wrap.appendChild(line((0, i18n_1.t)("developer.selection.none")));
            return wrap;
        }
        for (const shape of dumpable) {
            wrap.appendChild(line(shapeDumpLabel(shape)));
            const summary = (0, insert_meta_1.exportInsertShapeSummary)(shape);
            const compact = (0, insert_meta_1.exportInsertShapeCompactText)(shape);
            const buttons = [];
            if (summary) {
                buttons.push(mkBtn((0, i18n_1.t)("inspector.copySummary"), () => {
                    void (0, insert_meta_1.copyTextToClipboard)(summary);
                }));
            }
            if (compact) {
                buttons.push(mkBtn((0, i18n_1.t)("inspector.copyCompact"), () => {
                    void (0, insert_meta_1.copyTextToClipboard)(compact);
                }));
            }
            if (buttons.length)
                wrap.appendChild(btnRow(...buttons));
        }
        return wrap;
    };
    const render = () => {
        // 面板收起或当前不是开发者页时祖先是 display:none，offsetParent 为空。
        // 全稿 Morph / 插入对象审计只在这一页真正可见时跑，切页不能为它付费。
        if (!el.isConnected || el.offsetParent === null)
            return;
        const slideIndex = opts.currentSlide();
        const slide = opts.pres.slides[slideIndex];
        el.replaceChildren();
        const intro = doc.createElement("p");
        intro.textContent = (0, i18n_1.t)("developer.intro");
        intro.style.cssText = "margin:0 0 12px;font-size:11px;line-height:1.45;color:var(--muted-foreground)";
        el.appendChild(intro);
        el.appendChild(buildSelectionSection());
        for (const section of opts.extraSections?.() ?? []) {
            if (!section.actions.length)
                continue;
            el.appendChild(buildActionSection(section.title, section.actions));
        }
        el.appendChild(buildInsertSection(slide, slideIndex));
        el.appendChild(buildMorphSection());
    };
    render();
    const unsub = opts.stack.subscribe(() => render());
    return {
        el,
        refresh: render,
        destroy() {
            unsub();
            el.remove();
        },
    };
}
