"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mountSlideSorterView = mountSlideSorterView;
exports.mountOutlineView = mountOutlineView;
exports.mountNotesPageView = mountNotesPageView;
const slide_commands_1 = require("./slide-commands");
const renderer_1 = require("@sliiu/present-renderer");
const virtual_list_1 = require("./virtual-list");
const i18n_1 = require("./i18n");
function collectSlideText(slide) {
    const lines = [];
    const walk = (s) => {
        if (s.kind === "text" && s.paragraphs) {
            for (const p of s.paragraphs) {
                const txt = p.runs.map((r) => r.text).join("").trim();
                if (txt)
                    lines.push(txt);
            }
        }
        if (s.kind === "group")
            for (const c of s.children)
                walk(c);
    };
    for (const layer of slide.layers) {
        if (!layer.visible)
            continue;
        for (const s of layer.shapes)
            walk(s);
    }
    return lines;
}
function renderThumb(host, slide, size, masters) {
    host.replaceChildren();
    const chrome = (0, renderer_1.stageChromeBackground)(slide);
    const transparent = chrome === "transparent";
    try {
        const scene = (0, renderer_1.createScene)(slide, size, { masters });
        const be = new renderer_1.SvgBackend(scene, host, { transparent, preview: true });
        if (!transparent)
            be.root.style.background = chrome;
        be.root.setAttribute("preserveAspectRatio", "xMidYMid meet");
        be.flush();
    }
    catch {
        host.textContent = "—";
    }
}
function sorterRowHeight(presSize, cellWidth) {
    const thumbH = (cellWidth * presSize.height) / presSize.width;
    return thumbH + 44;
}
function buildSorterCard(doc, slide, i, currentIndex, pres, opts) {
    const card = doc.createElement("button");
    card.type = "button";
    card.draggable = !!opts.onMoveSlide;
    card.dataset.index = String(i);
    card.style.cssText = [
        "display:flex",
        "flex-direction:column",
        "gap:6px",
        "padding:8px",
        "border-radius:6px",
        `border:2px solid ${i === currentIndex ? "var(--primary)" : "transparent"}`,
        "background:var(--card)",
        "cursor:pointer",
        "text-align:left",
        "width:100%",
        "min-width:0",
        "box-sizing:border-box",
        slide.show === false ? "opacity:0.55" : "",
    ]
        .filter(Boolean)
        .join(";");
    const label = doc.createElement("div");
    label.style.cssText =
        "font:11px/1.3 system-ui,sans-serif;color:var(--muted-foreground);overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
    label.textContent = `${i + 1}. ${slide.name}${slide.show === false ? ` (${(0, i18n_1.t)("view.sorter.hidden")})` : ""}`;
    const thumb = doc.createElement("div");
    thumb.style.cssText = `aspect-ratio:${pres.size.width}/${pres.size.height};background:#fff;border-radius:3px;overflow:hidden;box-shadow:var(--shadow-sm,0 1px 4px rgba(0,0,0,.12))`;
    card.append(label, thumb);
    card.addEventListener("click", () => opts.onSelect(i));
    if (opts.onMoveSlide) {
        card.addEventListener("dragstart", (e) => {
            opts.dragFrom.value = i;
            card.style.opacity = "0.45";
            e.dataTransfer?.setData("text/plain", String(i));
            if (e.dataTransfer)
                e.dataTransfer.effectAllowed = "move";
        });
        card.addEventListener("dragend", () => {
            opts.dragFrom.value = null;
            card.style.opacity = "";
            for (const c of card.parentElement?.querySelectorAll("[data-drag-over]") ?? []) {
                c.removeAttribute("data-drag-over");
                c.style.outline = "";
            }
        });
        card.addEventListener("dragover", (e) => {
            if (opts.dragFrom.value === null)
                return;
            e.preventDefault();
            if (e.dataTransfer)
                e.dataTransfer.dropEffect = "move";
            card.setAttribute("data-drag-over", "1");
            card.style.outline = "2px dashed var(--primary)";
        });
        card.addEventListener("dragleave", () => {
            card.removeAttribute("data-drag-over");
            card.style.outline = "";
        });
        card.addEventListener("drop", (e) => {
            e.preventDefault();
            card.removeAttribute("data-drag-over");
            card.style.outline = "";
            if (opts.dragFrom.value === null)
                return;
            const from = opts.dragFrom.value;
            opts.dragFrom.value = null;
            const to = (0, slide_commands_1.computeSlideMoveTarget)(from, i);
            if (to === null)
                return;
            opts.onMoveSlide?.(from, to);
        });
    }
    if (opts.renderThumbNow) {
        renderThumb(thumb, slide, pres.size, pres.masters);
    }
    return card;
}
function mountSlideSorterView(host, opts) {
    const doc = host.ownerDocument;
    const el = doc.createElement("div");
    el.className = "ppt-scroll";
    el.style.cssText = "position:absolute;inset:0;overflow:auto;padding:16px;background:var(--background)";
    host.appendChild(el);
    const grid = doc.createElement("div");
    const SORTER_MIN_CELL = 200;
    const SORTER_GAP = 14;
    grid.style.cssText = [
        "display:grid",
        "width:100%",
        "box-sizing:border-box",
        `grid-template-columns:repeat(auto-fill,minmax(min(${SORTER_MIN_CELL}px,100%),1fr))`,
        `gap:${SORTER_GAP}px`,
        "align-items:start",
        "justify-items:stretch",
    ].join(";");
    el.appendChild(grid);
    const dragFrom = { value: null };
    let virtualGrid = null;
    let thumbObserver = null;
    let virtualCols = 0;
    const contentWidth = () => {
        const pad = 32;
        return Math.max(0, (el.clientWidth || grid.clientWidth || 720) - pad);
    };
    const refresh = () => {
        virtualGrid?.destroy();
        virtualGrid = null;
        thumbObserver?.disconnect();
        thumbObserver = null;
        grid.replaceChildren();
        dragFrom.value = null;
        const currentIndex = opts.getCurrentIndex();
        const n = opts.pres.slides.length;
        const useVirtual = n > virtual_list_1.VIRTUAL_LIST_THRESHOLD;
        if (!useVirtual) {
            grid.style.display = "grid";
            grid.style.position = "";
            grid.style.width = "100%";
            virtualCols = 0;
            thumbObserver = new IntersectionObserver((entries) => {
                for (const ent of entries) {
                    if (!ent.isIntersecting)
                        continue;
                    const thumb = ent.target;
                    if (thumb.dataset.rendered === "1")
                        continue;
                    thumb.dataset.rendered = "1";
                    const i = Number(thumb.dataset.index);
                    const slide = opts.pres.slides[i];
                    if (slide)
                        renderThumb(thumb, slide, opts.pres.size, opts.pres.masters);
                    thumbObserver?.unobserve(thumb);
                }
            }, { root: el, rootMargin: "200px" });
            opts.pres.slides.forEach((slide, i) => {
                const card = buildSorterCard(doc, slide, i, currentIndex, opts.pres, {
                    onSelect: opts.onSelect,
                    onMoveSlide: opts.onMoveSlide,
                    dragFrom,
                });
                const thumb = card.lastElementChild;
                thumb.dataset.index = String(i);
                thumb.dataset.rendered = "0";
                thumb.replaceChildren();
                thumbObserver.observe(thumb);
                grid.appendChild(card);
            });
            return;
        }
        grid.style.display = "block";
        grid.style.position = "relative";
        grid.style.width = "100%";
        const cols = (0, virtual_list_1.gridColumnCount)(contentWidth(), SORTER_MIN_CELL, SORTER_GAP);
        virtualCols = cols;
        const cellW = (Math.max(SORTER_MIN_CELL, contentWidth()) - SORTER_GAP * (cols - 1)) / cols;
        const rowH = sorterRowHeight(opts.pres.size, cellW);
        virtualGrid = (0, virtual_list_1.createVirtualGrid)({
            scrollRoot: el,
            container: grid,
            itemCount: n,
            columnCount: cols,
            rowHeight: rowH,
            gap: SORTER_GAP,
            render: (i, cell) => {
                cell.replaceChildren();
                const slide = opts.pres.slides[i];
                const card = buildSorterCard(doc, slide, i, currentIndex, opts.pres, {
                    onSelect: opts.onSelect,
                    onMoveSlide: opts.onMoveSlide,
                    dragFrom,
                    renderThumbNow: true,
                });
                cell.appendChild(card);
            },
        });
    };
    const columnObserver = typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            if (opts.pres.slides.length <= virtual_list_1.VIRTUAL_LIST_THRESHOLD)
                return;
            const cols = (0, virtual_list_1.gridColumnCount)(contentWidth(), SORTER_MIN_CELL, SORTER_GAP);
            if (cols !== virtualCols)
                refresh();
        })
        : null;
    columnObserver?.observe(el);
    refresh();
    return {
        el,
        refresh,
        destroy: () => {
            columnObserver?.disconnect();
            virtualGrid?.destroy();
            thumbObserver?.disconnect();
            el.remove();
        },
    };
}
function mountOutlineView(host, opts) {
    const doc = host.ownerDocument;
    const el = doc.createElement("div");
    el.className = "ppt-scroll";
    el.style.cssText = "position:absolute;inset:0;overflow:auto;padding:12px 16px;background:var(--background)";
    host.appendChild(el);
    const refresh = () => {
        el.replaceChildren();
        opts.pres.slides.forEach((slide, i) => {
            const block = doc.createElement("button");
            block.type = "button";
            block.style.cssText = [
                "display:block",
                "width:100%",
                "text-align:left",
                "margin:0 0 8px",
                "padding:10px 12px",
                "border-radius:6px",
                `border:1px solid ${i === opts.currentIndex ? "var(--primary)" : "var(--border)"}`,
                "background:var(--card)",
                "color:var(--foreground)",
                "cursor:pointer",
                slide.show === false ? "opacity:0.55" : "",
            ]
                .filter(Boolean)
                .join(";");
            const title = doc.createElement("div");
            title.style.cssText = "font:600 13px/1.3 system-ui,sans-serif;margin-bottom:4px";
            title.textContent = `${i + 1}. ${slide.name}`;
            block.appendChild(title);
            const lines = collectSlideText(slide);
            if (lines.length) {
                const body = doc.createElement("div");
                body.style.cssText =
                    "font:12px/1.5 system-ui,sans-serif;color:var(--muted-foreground);white-space:pre-wrap";
                body.textContent = lines.slice(0, 12).join("\n");
                block.appendChild(body);
            }
            else {
                const empty = doc.createElement("div");
                empty.style.cssText =
                    "font:12px system-ui,sans-serif;color:var(--muted-foreground);font-style:italic";
                empty.textContent = (0, i18n_1.t)("view.outline.empty");
                block.appendChild(empty);
            }
            block.addEventListener("click", () => opts.onSelect(i));
            el.appendChild(block);
        });
    };
    refresh();
    return {
        el,
        refresh,
        destroy: () => el.remove(),
    };
}
/** Notes Page：单页幻灯片缩略图 + 下方可编辑备注（打印备注页布局）。 */
function mountNotesPageView(host, opts) {
    const doc = host.ownerDocument;
    const el = doc.createElement("div");
    el.className = "ppt-scroll";
    el.style.cssText =
        "position:absolute;inset:0;overflow:auto;padding:24px;background:var(--background);display:flex;flex-direction:column;align-items:center;gap:16px";
    host.appendChild(el);
    const page = doc.createElement("div");
    page.style.cssText =
        "width:min(720px,100%);display:flex;flex-direction:column;gap:12px;background:var(--card);border:1px solid var(--border);border-radius:8px;padding:16px;box-shadow:var(--shadow-lg,0 2px 12px rgba(0,0,0,.12))";
    el.appendChild(page);
    const header = doc.createElement("div");
    header.style.cssText = "font:600 13px/1.3 system-ui,sans-serif;color:var(--foreground)";
    page.appendChild(header);
    const thumb = doc.createElement("div");
    thumb.style.cssText = `aspect-ratio:${opts.pres.size.width}/${opts.pres.size.height};background:#fff;border-radius:4px;overflow:hidden;box-shadow:var(--shadow-sm,0 1px 4px rgba(0,0,0,.12))`;
    page.appendChild(thumb);
    const notesLabel = doc.createElement("div");
    notesLabel.style.cssText =
        "font:11px/1.3 system-ui,sans-serif;color:var(--muted-foreground);text-transform:uppercase;margin-top:4px";
    notesLabel.textContent = (0, i18n_1.t)("view.notesPage.notesLabel");
    page.appendChild(notesLabel);
    const notesArea = doc.createElement("textarea");
    notesArea.spellcheck = opts.spellcheck ?? false;
    notesArea.style.cssText = [
        "width:100%",
        "min-height:180px",
        "resize:vertical",
        "background:var(--background)",
        "color:var(--foreground)",
        "caret-color:var(--foreground)",
        "border:1px solid var(--border)",
        "border-radius:6px",
        "padding:10px 12px",
        "font:14px/1.6 ui-sans-serif,system-ui,sans-serif",
        "box-sizing:border-box",
    ].join(";");
    notesArea.placeholder = (0, i18n_1.t)("editor.notes.placeholder");
    page.appendChild(notesArea);
    const nav = doc.createElement("div");
    nav.style.cssText =
        "display:flex;gap:8px;flex-wrap:wrap;justify-content:center;max-width:720px;width:100%";
    el.appendChild(nav);
    let editingIdx = opts.getCurrentIndex();
    let shownIdx = -1;
    let notesBaseline = "";
    const commitNotes = () => {
        const raw = notesArea.value;
        if (raw === notesBaseline)
            return;
        notesBaseline = raw;
        const next = raw.trim().length > 0 ? raw : undefined;
        opts.onNotesChange(editingIdx, next);
    };
    notesArea.addEventListener("blur", () => commitNotes());
    notesArea.addEventListener("input", () => {
        const raw = notesArea.value;
        if (raw === notesBaseline)
            return;
        notesBaseline = raw;
        const next = raw.trim().length > 0 ? raw : undefined;
        opts.onNotesChange(editingIdx, next);
    });
    const syncPage = () => {
        const slide = opts.pres.slides[editingIdx];
        if (!slide)
            return;
        const switched = shownIdx !== editingIdx;
        header.textContent = `${editingIdx + 1}. ${slide.name}${slide.show === false ? ` (${(0, i18n_1.t)("view.sorter.hidden")})` : ""}`;
        if (switched) {
            renderThumb(thumb, slide, opts.pres.size, opts.pres.masters);
            shownIdx = editingIdx;
            el.scrollTop = 0;
        }
        const v = opts.getNotes(editingIdx);
        notesBaseline = v;
        if (notesArea.value !== v)
            notesArea.value = v;
    };
    const refresh = () => {
        editingIdx = opts.getCurrentIndex();
        nav.replaceChildren();
        opts.pres.slides.forEach((slide, i) => {
            const btn = doc.createElement("button");
            btn.type = "button";
            btn.textContent = String(i + 1);
            btn.title = slide.name;
            if (i === editingIdx)
                btn.setAttribute("aria-current", "page");
            btn.style.cssText = [
                "width:32px",
                "height:28px",
                "border-radius:4px",
                `border:1px solid ${i === editingIdx ? "var(--primary)" : "var(--border)"}`,
                `background:${i === editingIdx ? "var(--secondary)" : "var(--card)"}`,
                "color:var(--foreground)",
                "cursor:pointer",
                "font:12px system-ui,sans-serif",
                slide.show === false ? "opacity:0.5" : "",
            ]
                .filter(Boolean)
                .join(";");
            btn.addEventListener("click", () => {
                if (i === editingIdx)
                    return;
                commitNotes();
                opts.onSelect(i);
                refresh();
            });
            nav.appendChild(btn);
        });
        syncPage();
    };
    refresh();
    return {
        el,
        refresh,
        destroy: () => el.remove(),
        setSpellcheck: (on) => {
            notesArea.spellcheck = on;
        },
    };
}
