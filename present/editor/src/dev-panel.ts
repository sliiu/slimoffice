// Developer diagnostics panel (insert-object inventory + Morph pair audit).
// Shown as a right-rail tab only while the host has `body.dev-mode`.

import type { CommandStack, Presentation, Shape, Slide } from "@ppt/core";
import {
  auditMorphDeck,
  auditMorphSlides,
  exportMorphAuditText,
  exportMorphDeckAuditText,
  exportMorphDeckCompactText,
  exportMorphDeckFilteredCompactText,
  exportMorphDeckIssuesCompactText,
  exportMorphDeckReadinessText,
  exportMorphIssuesCompactText,
  exportMorphPairCompactText,
  exportMorphPairCoverageText,
  exportMorphReadinessText,
  exportMorphUnmatchedShapesText,
  findFirstIssueMorphPair,
  findHighestPathCoverageMorphPair,
  findLowestPathCoverageMorphPair,
  findMostIssueMorphPair,
  findStrongestMorphPair,
  findWeakestMorphPair,
  formatMorphDeckChromeLines,
  formatMorphMatchReasonBreakdown,
  formatMorphReadinessLine,
} from "@ppt/transition-fx";
import { t } from "./i18n";
import {
  collectInsertShapesInDeck,
  collectInsertShapesOnSlide,
  collectLargeInsertShapesOnSlide,
  copyTextToClipboard,
  exportDeckInsertByKindCompactText,
  exportDeckInsertByKindText,
  exportInsertLargestShapeText,
  exportInsertReadinessText,
  exportInsertSlideCoverageText,
  exportInsertUnsizedShapesText,
  exportLargeInsertCompactText,
  exportLargeInsertReportText,
  exportSlideInsertCompactText,
  exportSlideInsertInventoryText,
  filterInsertRefsByKind,
  formatInsertDeckStatsLine,
  formatInsertInventoryStatsLine,
  formatInsertKindBreakdownLine,
  formatInsertLargestShapeLine,
  formatInsertReadinessLine,
  formatInsertSlideCoverageBreakdownLine,
  exportInsertShapeCompactText,
  exportInsertShapeSummary,
  slideWithFewestInsertShapes,
  slideWithFirstWithoutInsertShapes,
  slideWithLargestInsertPayload,
  slideWithMostInsertShapes,
  slideWithMostLargeInsertShapes,
  type InsertShapeKind,
} from "./insert-meta";
import { SCROLL_CLASS } from "./ui-style";

export interface DevDumpAction {
  label: string;
  run: () => void;
}

export interface DevDumpSection {
  title: string;
  actions: readonly DevDumpAction[];
}

export interface DevPanelOpts {
  pres: Presentation;
  stack: CommandStack;
  currentSlide(): number;
  gotoSlide?: (index: number) => void;
  getSelectedShapes?: () => readonly Shape[];
  extraSections?: () => readonly DevDumpSection[];
}

export interface DevPanelHandle {
  el: HTMLElement;
  refresh(): void;
  destroy(): void;
}

export function mountDevPanel(parent: HTMLElement, opts: DevPanelOpts): DevPanelHandle {
  const doc = parent.ownerDocument;
  const el = doc.createElement("div");
  el.className = `ppt-dev-panel ${SCROLL_CLASS}`;
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

  let kindFilter: InsertShapeKind | "all" = "all";

  const muted = "font-size:11px;color:var(--muted-foreground);margin-bottom:8px;line-height:1.45";

  const sectionWrap = (title: string): HTMLElement => {
    const wrap = doc.createElement("div");
    wrap.style.cssText = "margin-bottom:14px;padding-bottom:12px;border-bottom:1px solid var(--border)";
    const h = doc.createElement("div");
    h.textContent = title;
    h.style.cssText =
      "color:var(--muted-foreground);font-size:11px;text-transform:uppercase;margin-bottom:8px;letter-spacing:.4px";
    wrap.appendChild(h);
    return wrap;
  };

  const line = (text: string, extraCss = ""): HTMLElement => {
    const d = doc.createElement("div");
    d.style.cssText = muted + extraCss;
    d.textContent = text;
    return d;
  };

  const mkBtn = (label: string, onClick: () => void): HTMLButtonElement => {
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

  const btnRow = (...buttons: HTMLElement[]): HTMLElement => {
    const row = doc.createElement("div");
    row.style.cssText = "display:flex;flex-wrap:wrap;gap:6px";
    for (const b of buttons) row.appendChild(b);
    return row;
  };

  const buildInsertSection = (slide: Slide | undefined, slideIndex: number): HTMLElement => {
    const wrap = sectionWrap(t("inspector.section.insertInventory"));
    const refs = slide ? collectInsertShapesOnSlide(slide) : [];
    wrap.appendChild(line(formatInsertDeckStatsLine(opts.pres)));
    wrap.appendChild(line(formatInsertReadinessLine(opts.pres)));
    wrap.appendChild(
      line(
        t("inspector.insertInventory.kindBreakdown", {
          breakdown: formatInsertKindBreakdownLine(opts.pres),
        }),
      ),
    );
    wrap.appendChild(
      line(
        t("inspector.insertInventory.slideCoverage", {
          breakdown: formatInsertSlideCoverageBreakdownLine(opts.pres),
        }),
      ),
    );
    wrap.appendChild(line(formatInsertLargestShapeLine(opts.pres)));

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

    const renderKindFilters = (): void => {
      filterRow.replaceChildren();
      const deckRefs = collectInsertShapesInDeck(opts.pres);
      const mk = (kind: InsertShapeKind | "all", label: string): void => {
        const b = doc.createElement("button");
        b.type = "button";
        const active = kindFilter === kind;
        b.style.cssText = `font:inherit;font-size:10px;padding:2px 8px;border-radius:999px;cursor:pointer;border:1px solid ${
          active ? "var(--primary)" : "var(--border,#3a3a3a)"
        };background:${active ? "var(--accent,#333333)" : "transparent"};color:inherit`;
        const count = kind === "all" ? deckRefs.length : filterInsertRefsByKind(deckRefs, kind).length;
        b.textContent = count ? `${label} (${count})` : label;
        b.addEventListener("click", () => {
          kindFilter = kind;
          renderKindFilters();
          renderList();
        });
        filterRow.appendChild(b);
      };
      mk("all", t("inspector.insertInventory.filterAll"));
      mk("ole", t("inspector.insertInventory.filterOle"));
      mk("model3d", t("inspector.insertInventory.filterModel3d"));
      mk("video", t("inspector.insertInventory.filterVideo"));
      mk("audio", t("inspector.insertInventory.filterAudio"));
      mk("smartart", t("inspector.insertInventory.filterSmartArt"));
      filterRow.style.display = deckRefs.length ? "flex" : "none";
    };

    const renderList = (): void => {
      const deckRefs = collectInsertShapesInDeck(opts.pres);
      const filteredDeck = filterInsertRefsByKind(deckRefs, kindFilter);
      const slideRefs = kindFilter === "all" ? refs : refs.filter((ref) => ref.kind === kindFilter);
      head.textContent = slideRefs.length
        ? t("inspector.insertInventory.count", { n: slideRefs.length })
        : t("inspector.insertInventory.noneOnSlide");
      if (slideRefs.length && slide) {
        const largeCount = collectLargeInsertShapesOnSlide(slide).filter((item) =>
          kindFilter === "all" ? true : item.kind === kindFilter,
        ).length;
        stats.style.display = "";
        stats.textContent =
          largeCount > 0
            ? `${formatInsertInventoryStatsLine(slideRefs)} · ${t("inspector.insertInventory.large", { n: largeCount })}`
            : formatInsertInventoryStatsLine(slideRefs);
      } else {
        stats.style.display = "none";
        stats.textContent = "";
      }
      const largeIds = new Set(
        slide
          ? collectLargeInsertShapesOnSlide(slide)
              .filter((item) => (kindFilter === "all" ? true : item.kind === kindFilter))
              .map((item) => item.id)
          : [],
      );
      list.replaceChildren();
      for (const ref of slideRefs) {
        const li = doc.createElement("li");
        li.textContent = largeIds.has(ref.id)
          ? `${ref.kind}: ${ref.label} (${t("inspector.insertInventory.largeTag")})`
          : `${ref.kind}: ${ref.label}`;
        list.appendChild(li);
      }
      if (!slideRefs.length && kindFilter !== "all" && filteredDeck.length) {
        const hint = doc.createElement("li");
        hint.style.fontStyle = "italic";
        hint.textContent = t("inspector.insertInventory.noneOnSlideFiltered", {
          n: filteredDeck.length,
        });
        list.appendChild(hint);
      }
    };

    renderKindFilters();
    renderList();

    const buttons: HTMLElement[] = [
      mkBtn(t("inspector.insertInventory.copyReadiness"), () => {
        void copyTextToClipboard(exportInsertReadinessText(opts.pres));
      }),
      mkBtn(t("inspector.insertInventory.copyKindBreakdown"), () => {
        void copyTextToClipboard(
          `${t("inspector.insertInventory.kindBreakdown", { breakdown: formatInsertKindBreakdownLine(opts.pres) })}\n${formatInsertDeckStatsLine(opts.pres)}`,
        );
      }),
      mkBtn(t("inspector.insertInventory.copySlideCoverage"), () => {
        void copyTextToClipboard(exportInsertSlideCoverageText(opts.pres));
      }),
      mkBtn(t("inspector.insertInventory.copyLargestShape"), () => {
        void copyTextToClipboard(exportInsertLargestShapeText(opts.pres));
      }),
      mkBtn(t("inspector.insertInventory.copyUnsized"), () => {
        void copyTextToClipboard(exportInsertUnsizedShapesText(opts.pres));
      }),
    ];
    if (slide) {
      buttons.push(
        mkBtn(t("inspector.insertInventory.copy"), () => {
          void copyTextToClipboard(exportSlideInsertInventoryText(slide, slideIndex));
        }),
        mkBtn(t("inspector.insertInventory.copySlideCompact"), () => {
          void copyTextToClipboard(exportSlideInsertCompactText(slide, slideIndex));
        }),
      );
    }
    buttons.push(
      mkBtn(t("inspector.insertInventory.copyDeck"), () => {
        void copyTextToClipboard(exportDeckInsertByKindText(opts.pres, kindFilter));
      }),
      mkBtn(t("inspector.insertInventory.copyLarge"), () => {
        void copyTextToClipboard(exportLargeInsertReportText(opts.pres));
      }),
      mkBtn(t("inspector.insertInventory.copyDeckCompact"), () => {
        void copyTextToClipboard(exportDeckInsertByKindCompactText(opts.pres, kindFilter));
      }),
      mkBtn(t("inspector.insertInventory.copyLargeCompact"), () => {
        void copyTextToClipboard(exportLargeInsertCompactText(opts.pres));
      }),
    );
    const busiestIdx = slideWithMostInsertShapes(opts.pres);
    if (busiestIdx != null && opts.gotoSlide) {
      buttons.push(
        mkBtn(t("inspector.insertInventory.gotoBusiest"), () => opts.gotoSlide?.(busiestIdx)),
      );
    }
    const mostLargeIdx = slideWithMostLargeInsertShapes(opts.pres);
    if (mostLargeIdx != null && opts.gotoSlide) {
      buttons.push(
        mkBtn(t("inspector.insertInventory.gotoMostLarge"), () => opts.gotoSlide?.(mostLargeIdx)),
      );
    }
    const largestPayloadIdx = slideWithLargestInsertPayload(opts.pres);
    if (largestPayloadIdx != null && opts.gotoSlide) {
      buttons.push(
        mkBtn(t("inspector.insertInventory.gotoLargestPayload"), () => opts.gotoSlide?.(largestPayloadIdx)),
      );
    }
    const fewestIdx = slideWithFewestInsertShapes(opts.pres);
    if (fewestIdx != null && opts.gotoSlide && fewestIdx !== busiestIdx) {
      buttons.push(mkBtn(t("inspector.insertInventory.gotoFewest"), () => opts.gotoSlide?.(fewestIdx)));
    }
    const firstEmptyIdx = slideWithFirstWithoutInsertShapes(opts.pres);
    if (firstEmptyIdx != null && opts.gotoSlide) {
      buttons.push(
        mkBtn(t("inspector.insertInventory.gotoFirstEmpty"), () => opts.gotoSlide?.(firstEmptyIdx)),
      );
    }
    wrap.appendChild(btnRow(...buttons));
    return wrap;
  };

  const buildMorphSection = (): HTMLElement => {
    const wrap = sectionWrap(t("developer.section.morph"));
    const idx = opts.currentSlide();
    const from = opts.pres.slides[idx];
    const to = opts.pres.slides[idx + 1];
    const multi = opts.pres.slides.length >= 2;

    if (!from || !to) {
      wrap.appendChild(line(t("ribbon.transition.morphStatsNoNext")));
    } else {
      const report = auditMorphSlides(from, to);
      const breakdown = report.pairs.length ? ` · ${formatMorphMatchReasonBreakdown(report)}` : "";
      const stats = line(formatMorphReadinessLine(report) + breakdown);
      stats.style.color = "#a3e635";
      wrap.appendChild(stats);
    }
    if (multi) {
      const deckLines = formatMorphDeckChromeLines(opts.pres);
      wrap.appendChild(line(deckLines.stats));
      wrap.appendChild(line(deckLines.readiness));
      wrap.appendChild(
        line(
          t("ribbon.transition.morphPairCoverage", {
            breakdown: deckLines.pairCoverage,
          }),
        ),
      );
      wrap.appendChild(line(deckLines.lowestPath));
    }

    const copyPair = (run: () => void): (() => void) => () => {
      if (!from || !to) return;
      run();
    };
    const buttons: HTMLElement[] = [];
    if (from && to) {
      const report = () => auditMorphSlides(from, to);
      buttons.push(
        mkBtn(t("ribbon.transition.copyMorphAudit"), copyPair(() => {
          void copyTextToClipboard(exportMorphAuditText(report(), { fromSlide: idx, toSlide: idx + 1 }));
        })),
        mkBtn(t("ribbon.transition.copyMorphIssues"), copyPair(() => {
          void copyTextToClipboard(
            exportMorphAuditText(report(), { fromSlide: idx, toSlide: idx + 1, filter: "issues" }),
          );
        })),
        mkBtn(t("ribbon.transition.copyMorphIssuesCompact"), copyPair(() => {
          void copyTextToClipboard(exportMorphIssuesCompactText(report(), { fromSlide: idx, toSlide: idx + 1 }));
        })),
        mkBtn(t("ribbon.transition.copyMorphPairCompact"), copyPair(() => {
          void copyTextToClipboard(exportMorphPairCompactText(report(), { fromSlide: idx, toSlide: idx + 1 }));
        })),
        mkBtn(t("ribbon.transition.copyMorphReadiness"), copyPair(() => {
          void copyTextToClipboard(exportMorphReadinessText(report(), { fromSlide: idx, toSlide: idx + 1 }));
        })),
      );
    }
    if (multi) {
      buttons.push(
        mkBtn(t("ribbon.transition.copyMorphDeckAudit"), () => {
          void copyTextToClipboard(exportMorphDeckAuditText(opts.pres));
        }),
        mkBtn(t("ribbon.transition.copyMorphDeckCompact"), () => {
          void copyTextToClipboard(exportMorphDeckCompactText(opts.pres));
        }),
        mkBtn(t("ribbon.transition.copyMorphDeckIssuesCompact"), () => {
          void copyTextToClipboard(exportMorphDeckIssuesCompactText(opts.pres));
        }),
        mkBtn(t("ribbon.transition.copyMorphDeckReadiness"), () => {
          void copyTextToClipboard(exportMorphDeckReadinessText(opts.pres));
        }),
        mkBtn(t("ribbon.transition.copyMorphDeckFiltered"), () => {
          void copyTextToClipboard(exportMorphDeckFilteredCompactText(opts.pres, "issues"));
        }),
        mkBtn(t("ribbon.transition.copyMorphPairCoverage"), () => {
          void copyTextToClipboard(exportMorphPairCoverageText(opts.pres));
        }),
        mkBtn(t("ribbon.transition.copyMorphUnmatched"), () => {
          void copyTextToClipboard(exportMorphUnmatchedShapesText(opts.pres));
        }),
      );
    }
    if (multi && opts.gotoSlide) {
      const jump = (find: () => { fromIndex: number } | null | undefined, label: string): void => {
        buttons.push(
          mkBtn(label, () => {
            const entry = find();
            if (entry) opts.gotoSlide?.(entry.fromIndex);
          }),
        );
      };
      const deck = () => auditMorphDeck(opts.pres);
      jump(() => findWeakestMorphPair(deck()), t("ribbon.transition.gotoWeakestMorph"));
      jump(() => findStrongestMorphPair(deck()), t("ribbon.transition.gotoStrongestMorph"));
      jump(() => findMostIssueMorphPair(deck()), t("ribbon.transition.gotoMostIssueMorph"));
      jump(() => findHighestPathCoverageMorphPair(deck()), t("ribbon.transition.gotoHighestPathMorph"));
      jump(() => findFirstIssueMorphPair(deck()), t("ribbon.transition.gotoFirstIssueMorph"));
      jump(() => findLowestPathCoverageMorphPair(deck()), t("ribbon.transition.gotoLowestPathMorph"));
    }
    if (buttons.length) wrap.appendChild(btnRow(...buttons));
    return wrap;
  };

  const buildActionSection = (title: string, actions: readonly DevDumpAction[]): HTMLElement => {
    const wrap = sectionWrap(title);
    wrap.appendChild(btnRow(...actions.map((action) => mkBtn(action.label, action.run))));
    return wrap;
  };

  const shapeDumpLabel = (shape: Shape): string => {
    if (shape.kind === "ole") return `Embedded ${shape.embedFileName ?? shape.name ?? shape.id}`;
    if (shape.kind === "model3d") return `3D ${shape.objectName ?? shape.name ?? shape.id}`;
    if (shape.kind === "video" || shape.kind === "audio") return `${shape.kind} ${shape.name ?? shape.id}`;
    if (shape.kind === "group" && shape.smartArtMeta) {
      return `Diagram ${shape.smartArtMeta.layout} (${shape.name ?? shape.id})`;
    }
    return `${shape.kind} ${shape.name ?? shape.id}`;
  };

  const buildSelectionSection = (): HTMLElement => {
    const wrap = sectionWrap(t("developer.section.selection"));
    const dumpable = (opts.getSelectedShapes?.() ?? []).filter(
      (shape) => exportInsertShapeSummary(shape) != null || exportInsertShapeCompactText(shape) != null,
    );
    if (!dumpable.length) {
      wrap.appendChild(line(t("developer.selection.none")));
      return wrap;
    }
    for (const shape of dumpable) {
      wrap.appendChild(line(shapeDumpLabel(shape)));
      const summary = exportInsertShapeSummary(shape);
      const compact = exportInsertShapeCompactText(shape);
      const buttons: HTMLElement[] = [];
      if (summary) {
        buttons.push(
          mkBtn(t("inspector.copySummary"), () => {
            void copyTextToClipboard(summary);
          }),
        );
      }
      if (compact) {
        buttons.push(
          mkBtn(t("inspector.copyCompact"), () => {
            void copyTextToClipboard(compact);
          }),
        );
      }
      if (buttons.length) wrap.appendChild(btnRow(...buttons));
    }
    return wrap;
  };

  const render = (): void => {
    // 面板收起或当前不是开发者页时祖先是 display:none，offsetParent 为空。
    // 全稿 Morph / 插入对象审计只在这一页真正可见时跑，切页不能为它付费。
    if (!el.isConnected || el.offsetParent === null) return;
    const slideIndex = opts.currentSlide();
    const slide = opts.pres.slides[slideIndex];
    el.replaceChildren();
    const intro = doc.createElement("p");
    intro.textContent = t("developer.intro");
    intro.style.cssText = "margin:0 0 12px;font-size:11px;line-height:1.45;color:var(--muted-foreground)";
    el.appendChild(intro);
    el.appendChild(buildSelectionSection());
    for (const section of opts.extraSections?.() ?? []) {
      if (!section.actions.length) continue;
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
    destroy(): void {
      unsub();
      el.remove();
    },
  };
}
