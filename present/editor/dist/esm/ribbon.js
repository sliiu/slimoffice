import { isEditingBlockedError } from "@sliiu/present-core";
import { paintedTextColor } from "./live-color.js";
import { t } from "./i18n/index.js";
import { DEFAULT_AID_OPACITY, DEFAULT_GRID_AID_COLOR, DEFAULT_GUIDE_AID_COLOR, openAidColorPopover } from "./aid-color.js";
import { SHAPE_BY_ID } from "./shape-library.js";
import { bindEditorModal } from "./dialog.js";
import { openShapePickerDialog } from "./shape-picker-dialog.js";
import { bindFontFamilyCombobox } from "./font-list.js";
import { DEFAULT_FONT_PT, fontPxFromPt, formatFontPt, ptToPx, pxToPt } from "./font-size.js";
import { appendLabelWithIcon, fillLucideIcon, lucideSvg, mkLucideIconButton, svgIcon } from "./icons.js";
import { closeRibbonMoreUnlessFromMoreDialog, hasOpenRibbonPopover, ensureUiStyles, COLOR_SWATCH_CLASS, Z_RIBBON_MORE, Z_RIBBON_MORE_BACKDROP, Z_RIBBON_POPOVER, } from "./ui-style.js";
import { TRANSITION_OPTIONS, transitionKindLabel } from "./transition-panel.js";
import { QUICK_BAR_TOOL_IDS, listCommandGroups, listExportFormats, listQuickBar, } from "./chrome-plan-b.js";
const PRESENTATION_VIEW_ICON = {
    normal: "panel-left",
    sorter: "layout-grid",
    outline: "list-collapse",
    reading: "book-open",
    notesPage: "sticky-note",
};
const PRESENTATION_VIEW_LABEL = {
    normal: "ribbon.view.normal",
    sorter: "ribbon.view.sorter",
    outline: "ribbon.view.outline",
    reading: "ribbon.view.reading",
    notesPage: "ribbon.view.notesPage",
};
function runRibbonCommand(fn) {
    try {
        fn();
    }
    catch (e) {
        if (!isEditingBlockedError(e))
            throw e;
    }
}
// 横向滚动容器默认只能用触控板横滑 / 拖滚动条触达；鼠标滚轮只有纵向 delta，
// 把它转成横向滚动，避免"分组太多但看不到、也划不动"的死角。
function enableWheelHorizontalScroll(el) {
    el.addEventListener("wheel", (ev) => {
        if (ev.deltaY === 0 || ev.deltaX !== 0)
            return;
        if (el.scrollWidth <= el.clientWidth)
            return;
        ev.preventDefault();
        el.scrollLeft += ev.deltaY;
    }, { passive: false });
}
// 两行 24px 控件 + 分组标题；过矮会把字体/段落整组挤进「更多」。
const RIBBON_CONTENT_HEIGHT_PX = 72;
const RIBBON_GROUP_GAP_PX = 2;
function ribbonRowWidth(widths, start, end, gap) {
    if (end <= start)
        return 0;
    let sum = 0;
    for (let i = start; i < end; i++)
        sum += widths[i];
    return sum + gap * (end - start - 1);
}
/** 保序切成至多两行，使组宽尽量小（先填满第一行再换行）。 */
function twoRowPackWidth(widths, gap) {
    const n = widths.length;
    if (n === 0)
        return 0;
    if (n === 1)
        return Math.ceil(widths[0]);
    let best = ribbonRowWidth(widths, 0, n, gap);
    for (let split = 1; split < n; split++) {
        const score = Math.max(ribbonRowWidth(widths, 0, split, gap), ribbonRowWidth(widths, split, n, gap));
        if (score < best)
            best = score;
    }
    return Math.ceil(best);
}
/** 若再放下一个控件只略增组宽，优先填满第一行，避免行尾大块空白。 */
function fillFirstRowWidth(widths, packed, gap) {
    let row1 = 0;
    let count = 0;
    for (const w of widths) {
        const next = count === 0 ? w : row1 + gap + w;
        if (next <= packed) {
            row1 = next;
            count++;
            continue;
        }
        if (count > 0 && next <= packed + Math.max(16, w * 0.2))
            return Math.ceil(next);
        return packed;
    }
    return packed;
}
function collectRibbonGroupItems(group) {
    return Array.from(group.querySelectorAll(":scope > .ppt-ribbon-group__rows > .ppt-ribbon-group__row > *"))
        .filter((el) => !el.hidden && el.style.display !== "none");
}
function itemOuterWidth(el) {
    const w = el.getBoundingClientRect().width;
    const cs = el.ownerDocument.defaultView?.getComputedStyle(el);
    const ml = Number.parseFloat(cs?.marginLeft ?? "0") || 0;
    const mr = Number.parseFloat(cs?.marginRight ?? "0") || 0;
    return Math.ceil(w + ml + mr);
}
function countWrappedRows(items) {
    const ys = items
        .map((el) => el.getBoundingClientRect())
        .filter((r) => r.width > 0)
        .map((r) => r.top)
        .sort((a, b) => a - b);
    if (ys.length === 0)
        return 0;
    // 同一行控件高度差（色板 22px vs 按钮 24px）会差 1–2px，不能按精确 Y 计数。
    let rows = 1;
    let prev = ys[0];
    for (const y of ys) {
        if (y - prev > 8) {
            rows++;
            prev = y;
        }
    }
    return rows;
}
function packRibbonGroup(group, oneRow) {
    const rowsWrap = group.firstElementChild;
    if (!rowsWrap?.classList.contains("ppt-ribbon-group__rows"))
        return;
    const items = collectRibbonGroupItems(group);
    const widths = items.map(itemOuterWidth).filter((w) => w > 0);
    if (widths.length === 0 || oneRow) {
        rowsWrap.style.maxWidth = "";
        return;
    }
    const widest = Math.max(...widths);
    const fullRow = ribbonRowWidth(widths, 0, widths.length, RIBBON_GROUP_GAP_PX);
    let packed = Math.max(twoRowPackWidth(widths, RIBBON_GROUP_GAP_PX), widest);
    packed = fillFirstRowWidth(widths, packed, RIBBON_GROUP_GAP_PX);
    rowsWrap.style.maxWidth = `${packed + 1}px`;
    // 实际换行可能比理论切分多占一行（margin / 亚像素），按真实 Y 行数加宽。
    let guard = 0;
    while (countWrappedRows(items) > 2 && packed < fullRow && guard++ < 24) {
        packed = Math.min(fullRow, packed + Math.max(8, widest));
        rowsWrap.style.maxWidth = `${packed + 1}px`;
    }
}
function attachRibbonHoverTips(root) {
    const doc = root.ownerDocument;
    const tip = doc.createElement("div");
    tip.className = "ppt-ribbon-tooltip";
    tip.setAttribute("role", "tooltip");
    tip.hidden = true;
    doc.body.appendChild(tip);
    let showTimer = 0;
    let hideTimer = 0;
    let current = null;
    const hide = () => {
        window.clearTimeout(showTimer);
        window.clearTimeout(hideTimer);
        tip.hidden = true;
        tip.textContent = "";
        current = null;
    };
    const textFor = (el) => {
        // 挪走原生 title，只走我们自己的延迟提示，避免系统 tooltip 再弹一层。
        if (el.title) {
            el.setAttribute("data-ppt-tip", el.title);
            el.removeAttribute("title");
        }
        const raw = (el.getAttribute("data-ppt-tip") || el.getAttribute("aria-label") || "").trim();
        if (!raw)
            return "";
        const visible = (el.innerText || "").replace(/\s+/g, " ").trim();
        if (visible && visible === raw)
            return "";
        return raw;
    };
    const controlFrom = (node) => {
        if (!(node instanceof Element))
            return null;
        const el = node.closest("button, input, select, [title]");
        return el && root.contains(el) ? el : null;
    };
    const place = (el) => {
        const r = el.getBoundingClientRect();
        tip.hidden = false;
        const tw = tip.offsetWidth;
        const th = tip.offsetHeight;
        const vw = doc.defaultView?.innerWidth ?? 1200;
        const vh = doc.defaultView?.innerHeight ?? 800;
        let left = r.left + (r.width - tw) / 2;
        left = Math.max(8, Math.min(left, vw - tw - 8));
        let top = r.bottom + 6;
        if (top + th > vh - 8)
            top = Math.max(8, r.top - th - 6);
        tip.style.left = `${Math.round(left)}px`;
        tip.style.top = `${Math.round(top)}px`;
    };
    const onOver = (ev) => {
        const el = controlFrom(ev.target);
        if (!el)
            return;
        const text = textFor(el);
        if (!text) {
            if (current !== el)
                hide();
            return;
        }
        if (current === el && !tip.hidden)
            return;
        current = el;
        window.clearTimeout(hideTimer);
        window.clearTimeout(showTimer);
        showTimer = window.setTimeout(() => {
            if (current !== el)
                return;
            tip.textContent = text;
            place(el);
        }, 800);
    };
    const onOut = (ev) => {
        const next = controlFrom(ev.relatedTarget);
        if (next && textFor(next))
            return;
        hideTimer = window.setTimeout(hide, 60);
    };
    root.addEventListener("pointerover", onOver);
    root.addEventListener("pointerout", onOut);
    root.addEventListener("pointerdown", hide);
    doc.addEventListener("keydown", hide);
    return () => {
        hide();
        tip.remove();
        root.removeEventListener("pointerover", onOver);
        root.removeEventListener("pointerout", onOut);
        root.removeEventListener("pointerdown", hide);
        doc.removeEventListener("keydown", hide);
    };
}
export function buildRibbon(doc, a) {
    ensureUiStyles(doc);
    function styleRibbonField(el, sizing = "") {
        el.classList.add("ppt-ribbon-input");
        if (sizing)
            el.style.cssText = sizing;
    }
    const root = doc.createElement("div");
    root.className = "ppt-ribbon-root ppt-topbar";
    root.dataset.pptRibbonRoot = "1";
    root.dataset.pptTopbar = "1";
    root.setAttribute("role", "toolbar");
    root.setAttribute("aria-label", t("toolbar.label"));
    const cluster = doc.createElement("div");
    cluster.className = "ppt-topbar-cluster";
    root.appendChild(cluster);
    const stash = doc.createElement("div");
    stash.className = "ppt-topbar-stash";
    stash.hidden = true;
    stash.setAttribute("aria-hidden", "true");
    root.appendChild(stash);
    // 旧分组仍建在 contentRow 上，组装完再由顶栏菜单弹出，不再当 Tab 条。
    const contentRow = stash;
    const tabBtns = new Map();
    const tabPanels = new Map();
    const refreshHandlers = [];
    const panelCleanupFns = [];
    const tabShells = new Map();
    let openPopover = null;
    let openPopoverCleanup = null;
    let openPopoverAnchor = null;
    function controlLabel(el) {
        return (el.textContent ?? "").replace(/\s+/g, " ").trim();
    }
    /** 弹出层里：纯文字命令改成竖排菜单；带输入框 / 图标的组保持换行工具条。单项且文案与组名重复时藏起组名。 */
    function presentRibbonPanel(panel) {
        for (const group of Array.from(panel.children)) {
            if (!group.classList.contains("ppt-ribbon-group"))
                continue;
            const controls = Array.from(group.querySelectorAll(":scope > .ppt-ribbon-group__rows > .ppt-ribbon-group__row > *"));
            const menuLike = controls.length > 0 &&
                controls.every((el) => el.tagName === "BUTTON" && controlLabel(el).length > 0);
            group.classList.toggle("ppt-ribbon-group--menu", menuLike);
            group.classList.toggle("ppt-ribbon-group--tools", !menuLike);
            const label = group.querySelector(":scope > .ppt-ribbon-group__label");
            if (!label)
                continue;
            label.hidden = false;
            if (!menuLike || controls.length !== 1)
                continue;
            const only = controlLabel(controls[0]);
            const caption = (label.textContent ?? "").trim();
            if (caption && (only === caption || only.startsWith(caption)))
                label.hidden = true;
        }
    }
    function resetRibbonPanelPresentation(panel) {
        for (const span of Array.from(panel.querySelectorAll(".ppt-chrome-revealed-label")))
            span.remove();
        for (const group of Array.from(panel.querySelectorAll(".ppt-ribbon-group"))) {
            group.classList.remove("ppt-ribbon-group--menu", "ppt-ribbon-group--tools");
            const label = group.querySelector(":scope > .ppt-ribbon-group__label");
            if (label)
                label.hidden = false;
        }
    }
    /** 横铺功能区里，组名和唯一按钮重复时藏起组名（「打印」下面不再写「打印」）。 */
    function calmDuplicateLabels(panel) {
        for (const group of Array.from(panel.children)) {
            if (!group.classList.contains("ppt-ribbon-group"))
                continue;
            const controls = Array.from(group.querySelectorAll(":scope > .ppt-ribbon-group__rows > .ppt-ribbon-group__row > *"));
            const label = group.querySelector(":scope > .ppt-ribbon-group__label");
            if (!label || controls.length !== 1)
                continue;
            const only = controlLabel(controls[0]);
            const caption = (label.textContent ?? "").trim();
            if (caption && (only === caption || only.startsWith(caption)))
                label.hidden = true;
        }
    }
    /**
     * 这条命令里已经有纯图标时，其余带图标的按钮也收成 24px。
     * 标签展开后超出命令条时同样收起，避免最后一项被裁切。
     * 展开宽度记在 dataset 上，之后按条的 clientWidth 判断，避免为了测量来回改 class。
     */
    function markUniformIconStrip(strip) {
        let iconOnly = false;
        let namedIcon = false;
        for (const btn of Array.from(strip.querySelectorAll(".ppt-ribbon-btn"))) {
            if (btn.hidden || btn.style.display === "none" || btn.getClientRects().length === 0)
                continue;
            if (!btn.querySelector("svg"))
                continue;
            const text = (btn.innerText || "").replace(/\s+/g, " ").trim();
            if (!text)
                iconOnly = true;
            else if (!btn.classList.contains("ppt-ribbon-btn--keep-label"))
                namedIcon = true;
        }
        if (strip.clientWidth <= 0) {
            awaitCommandStripBox();
            return;
        }
        const collapsed = strip.classList.contains("ppt-command-strip--icon-uniform");
        if (!collapsed)
            strip.dataset.expandedScroll = String(strip.scrollWidth);
        const expanded = Number(strip.dataset.expandedScroll || strip.scrollWidth);
        // 收起后再展开要多出一截空隙，避免滚动条或 1px 抖动把 class 来回切换。
        const overflows = collapsed ? expanded > strip.clientWidth - 16 : expanded > strip.clientWidth + 1;
        const next = (iconOnly && namedIcon) || overflows;
        if (collapsed !== next) {
            strip.classList.toggle("ppt-command-strip--icon-uniform", next);
            if (!next)
                strip.dataset.expandedScroll = String(strip.scrollWidth);
        }
    }
    function mountRibbonStrip(host, panel) {
        calmDuplicateLabels(panel);
        panel.style.display = "flex";
        host.appendChild(panel);
    }
    function releaseStrip(host) {
        for (const panel of Array.from(host.querySelectorAll(".ppt-ribbon-panel"))) {
            // 列表打开时留在命令条上的样子，不是可收回 stash 的真面板。
            if (panel.dataset.pptStripHold === "1")
                continue;
            resetRibbonPanelPresentation(panel);
            panel.style.display = "flex";
            stash.appendChild(panel);
        }
        host.replaceChildren();
    }
    function shortCommandName(raw) {
        const cut = raw.split(/\s*[—–]|[（(]/)[0]?.trim() ?? raw.trim();
        return cut || raw.trim();
    }
    function buttonHasVisibleText(btn) {
        if (btn.querySelector(".ppt-chrome-revealed-label"))
            return true;
        return (btn.textContent ?? "").trim().length > 0;
    }
    /** 纯按钮面板里，图标按钮补上短文案，和已有「图标 + 文字」行对齐。 */
    function revealIconLabels(panel) {
        for (const btn of Array.from(panel.querySelectorAll("button"))) {
            if (buttonHasVisibleText(btn))
                continue;
            const name = shortCommandName(btn.getAttribute("aria-label") || btn.title || "");
            if (!name)
                continue;
            const span = doc.createElement("span");
            span.className = "ppt-chrome-revealed-label";
            span.textContent = name;
            btn.appendChild(span);
        }
    }
    function panelIsButtonsOnly(panel) {
        const controls = Array.from(panel.querySelectorAll("button, input, select, textarea"));
        return controls.length > 0 && controls.every((el) => el.tagName === "BUTTON");
    }
    function mountRibbonPanel(body, panel) {
        body.classList.add("ppt-command-host");
        if (panelIsButtonsOnly(panel))
            revealIconLabels(panel);
        presentRibbonPanel(panel);
        panel.style.display = "flex";
        body.appendChild(panel);
    }
    function chromeWentBack(pop) {
        const fn = pop.__pptChromeBack;
        return fn?.() ?? false;
    }
    function closeToolbarPopover() {
        if (!openPopover)
            return;
        const host = openPopover;
        for (const panel of host.querySelectorAll(".ppt-ribbon-panel")) {
            resetRibbonPanelPresentation(panel);
            stash.appendChild(panel);
            panel.style.display = "flex";
        }
        host.remove();
        openPopover = null;
        openPopoverAnchor?.setAttribute("aria-expanded", "false");
        openPopoverAnchor = null;
        const cleanup = openPopoverCleanup;
        openPopoverCleanup = null;
        cleanup?.();
    }
    function markPopoverAnchor(anchor) {
        openPopoverAnchor = anchor;
        anchor.setAttribute("aria-expanded", "true");
    }
    function positionPopover(pop, anchor) {
        const r = anchor.getBoundingClientRect();
        const pad = 8;
        const w = Math.max(pop.offsetWidth, 160);
        const h = pop.offsetHeight;
        const left = Math.min(Math.max(pad, r.left), Math.max(pad, window.innerWidth - w - pad));
        let top = r.bottom + 6;
        const opensDown = top + h <= window.innerHeight - pad || r.top - 6 - h < pad;
        if (!opensDown)
            top = Math.max(pad, r.top - 6 - h);
        else if (top + h > window.innerHeight - pad)
            top = Math.max(pad, window.innerHeight - h - pad);
        pop.style.left = `${left}px`;
        pop.style.top = `${top}px`;
        const originX = Math.round(Math.min(Math.max(12, r.left + r.width / 2 - left), Math.max(12, w - 12)));
        pop.style.transformOrigin = `${originX}px ${opensDown ? "top" : "bottom"}`;
    }
    function schedulePopoverPosition(pop, anchor) {
        requestAnimationFrame(() => {
            if (openPopover === pop)
                positionPopover(pop, anchor);
        });
    }
    function openPanelPopover(anchor, panels, label, onClosed) {
        closeToolbarPopover();
        const pop = doc.createElement("div");
        pop.className = "ppt-topbar-popover ppt-command-host";
        pop.setAttribute("role", "dialog");
        pop.setAttribute("aria-label", label);
        const scroll = doc.createElement("div");
        scroll.className = "ppt-command-scroll";
        for (const panel of panels)
            mountRibbonPanel(scroll, panel);
        pop.appendChild(scroll);
        doc.body.appendChild(pop);
        positionPopover(pop, anchor);
        schedulePopoverPosition(pop, anchor);
        openPopover = pop;
        markPopoverAnchor(anchor);
        const onDoc = (ev) => {
            const target = ev.target;
            if (!target)
                return;
            if (pop.contains(target) || anchor.contains(target))
                return;
            if (hasOpenRibbonPopover(doc))
                return;
            closeToolbarPopover();
        };
        const onKey = (ev) => {
            if (ev.key === "Escape" && !hasOpenRibbonPopover(doc)) {
                if (chromeWentBack(pop))
                    return;
                closeToolbarPopover();
            }
        };
        const onReposition = () => {
            if (openPopover === pop)
                positionPopover(pop, anchor);
        };
        doc.addEventListener("pointerdown", onDoc, true);
        doc.addEventListener("keydown", onKey);
        window.addEventListener("resize", onReposition);
        openPopoverCleanup = () => {
            doc.removeEventListener("pointerdown", onDoc, true);
            doc.removeEventListener("keydown", onKey);
            window.removeEventListener("resize", onReposition);
            onClosed?.();
        };
    }
    function openMenuPopover(anchor, label, items) {
        closeToolbarPopover();
        const pop = doc.createElement("div");
        pop.className = "ppt-topbar-menu";
        pop.setAttribute("role", "menu");
        pop.setAttribute("aria-label", label);
        for (const item of items) {
            const b = doc.createElement("button");
            b.type = "button";
            b.className = "ppt-topbar-menu-item";
            b.setAttribute("role", item.checked === undefined ? "menuitem" : "menuitemradio");
            if (item.checked !== undefined)
                b.setAttribute("aria-checked", item.checked ? "true" : "false");
            if (item.icon) {
                const icon = lucideSvg(doc, item.icon, 16);
                icon.setAttribute("aria-hidden", "true");
                b.append(icon, doc.createTextNode(item.label));
            }
            else {
                b.textContent = item.label;
            }
            if (item.hint)
                b.title = item.hint;
            if (item.experimental)
                b.dataset.toolbarItem = "experimental";
            b.addEventListener("click", () => {
                closeToolbarPopover();
                item.onSelect();
            });
            pop.appendChild(b);
        }
        doc.body.appendChild(pop);
        positionPopover(pop, anchor);
        openPopover = pop;
        markPopoverAnchor(anchor);
        (pop.querySelector('[aria-checked="true"]') ?? pop.querySelector("button"))?.focus();
        const onDoc = (ev) => {
            const target = ev.target;
            if (!target)
                return;
            if (pop.contains(target) || anchor.contains(target))
                return;
            closeToolbarPopover();
        };
        const onKey = (ev) => {
            if (ev.key === "Escape")
                closeToolbarPopover();
        };
        doc.addEventListener("pointerdown", onDoc, true);
        doc.addEventListener("keydown", onKey);
        openPopoverCleanup = () => {
            doc.removeEventListener("pointerdown", onDoc, true);
            doc.removeEventListener("keydown", onKey);
        };
    }
    function openChromePopover(anchor, label, className) {
        closeToolbarPopover();
        const pop = doc.createElement("div");
        pop.className = className;
        pop.setAttribute("role", "dialog");
        pop.setAttribute("aria-label", label);
        doc.body.appendChild(pop);
        positionPopover(pop, anchor);
        schedulePopoverPosition(pop, anchor);
        openPopover = pop;
        markPopoverAnchor(anchor);
        const onDoc = (ev) => {
            const target = ev.target;
            if (!target)
                return;
            if (pop.contains(target) || anchor.contains(target))
                return;
            if (hasOpenRibbonPopover(doc))
                return;
            closeToolbarPopover();
        };
        const onKey = (ev) => {
            if (ev.key === "Escape" && !hasOpenRibbonPopover(doc)) {
                if (chromeWentBack(pop))
                    return;
                closeToolbarPopover();
            }
        };
        const onReposition = () => {
            if (openPopover === pop)
                positionPopover(pop, anchor);
        };
        doc.addEventListener("pointerdown", onDoc, true);
        doc.addEventListener("keydown", onKey);
        window.addEventListener("resize", onReposition);
        openPopoverCleanup = () => {
            doc.removeEventListener("pointerdown", onDoc, true);
            doc.removeEventListener("keydown", onKey);
            window.removeEventListener("resize", onReposition);
        };
        return pop;
    }
    function mkChromeCard(label, hint, iconName, onSelect) {
        const b = doc.createElement("button");
        b.type = "button";
        b.className = "ppt-chrome-card";
        b.title = hint;
        b.setAttribute("aria-label", hint || label);
        const icon = lucideSvg(doc, iconName, 18);
        icon.classList.add("ppt-chrome-card-icon");
        const text = doc.createElement("span");
        text.textContent = label;
        b.append(icon, text);
        b.addEventListener("click", () => {
            closeToolbarPopover();
            onSelect();
        });
        return b;
    }
    function mkChromeMoreItem(label, hint, iconName, onSelect, drill = false) {
        const b = doc.createElement("button");
        b.type = "button";
        b.className = "ppt-chrome-more-item";
        b.title = hint;
        b.setAttribute("aria-label", hint || label);
        b.append(lucideSvg(doc, iconName, 14), doc.createTextNode(label));
        if (drill) {
            b.setAttribute("aria-haspopup", "dialog");
            const chev = lucideSvg(doc, "chevron-right", 14);
            chev.classList.add("ppt-chrome-drill");
            b.appendChild(chev);
        }
        b.addEventListener("click", () => onSelect());
        return b;
    }
    function hasInsertExtras() {
        return !!(a.insertWordArt ||
            a.insertSymbol ||
            a.insertEquation ||
            a.openPhotoAlbum ||
            a.insertOnlinePicture ||
            a.insertScreenshot ||
            a.openMediaLibrary ||
            a.insertSmartArt ||
            a.insertHyperlink ||
            a.insertWebEmbed ||
            a.setBookmark ||
            a.insertDateTimeField ||
            a.insertSlideNumberField ||
            a.insertHeaderFooter ||
            a.openOleInsert ||
            a.openModel3DPicker ||
            a.openRecordDialog);
    }
    function chromeHookFlags() {
        const filePanel = tabPanels.get("File");
        const insertPanel = tabPanels.get("Insert");
        const homePanel = tabPanels.get("Home");
        const drawPanel = tabPanels.get("Draw");
        const designPanel = tabPanels.get("Design");
        const formatPanel = tabPanels.get("Format");
        const slideshowPanel = tabPanels.get("Slideshow");
        const viewPanel = tabPanels.get("View");
        const reviewPanel = tabPanels.get("Review");
        const helpPanel = tabPanels.get("Help");
        const experimentalPanel = tabPanels.get("Experimental");
        return {
            insertSlide: !!a.insertSlide,
            insertText: true,
            insertImage: true,
            insertShape: true,
            insertTable: !!a.insertTable,
            insertChart: !!a.insertChart,
            insertIcon: !!a.insertIcon,
            insertVideo: !!a.insertVideo,
            insertAudio: !!a.insertAudio,
            insertExtras: hasInsertExtras(),
            canExportPdf: !!a.saveAs && (a.canExport?.("pdf") ?? false),
            canExportPng: !!a.saveAs && (a.canExport?.("png") ?? false),
            canExportHtml: !!a.saveAs && (a.canExport?.("html") ?? false),
            canExportHtmlZip: !!a.saveAs && (a.canExport?.("html-zip") ?? false),
            formatPainter: !!a.toggleFormatPainter,
            hasFile: !!filePanel && filePanel.children.length > 0,
            hasInsert: !!insertPanel && insertPanel.children.length > 0,
            hasLayout: !!a.openLayoutPicker,
            hasEdit: !!homePanel && homePanel.children.length > 0,
            hasDraw: !!drawPanel && drawPanel.children.length > 0,
            hasLook: !!designPanel && designPanel.children.length > 0,
            hasObject: !!formatPanel && formatPanel.children.length > 0,
            hasPresent: !!slideshowPanel && slideshowPanel.children.length > 0,
            hasWorkspace: !!viewPanel && viewPanel.children.length > 0,
            hasReview: !!reviewPanel && reviewPanel.children.length > 0,
            hasHelp: !!helpPanel && helpPanel.children.length > 0,
            hasExperimental: !!experimentalPanel && experimentalPanel.children.length > 0,
            hasTransitions: !!a.focusTransitionsPanel,
            hasAnimations: !!a.focusAnimationsPanel,
        };
    }
    function drawArmedShape(kind) {
        (a.armShapeDraw ?? a.insertShape)(kind);
    }
    function openQuickShapes(anchor) {
        openMenuPopover(anchor, t("toolbar.insert.shapeHint"), [
            ...COMMON_DRAW_SHAPES.map((shape) => ({
                label: t(shape.label),
                icon: shape.icon,
                onSelect: () => runRibbonCommand(() => drawArmedShape(shape.kind)),
            })),
            {
                label: t("ribbon.shape.moreLabel"),
                hint: t("ribbon.shape.more"),
                icon: "chevron-down",
                onSelect: () => {
                    void openShapePickerDialog(doc).then((kind) => {
                        if (kind)
                            runRibbonCommand(() => drawArmedShape(kind));
                    });
                },
            },
        ]);
        if (openPopover)
            openPopover.dataset.pptQuickShapes = "1";
    }
    function openExportChrome(anchor) {
        if (!a.saveAs)
            return;
        const formats = listExportFormats(chromeHookFlags());
        const pop = openChromePopover(anchor, t("toolbar.export"), "ppt-chrome-popover");
        pop.dataset.chromeSurface = "export";
        const h = doc.createElement("div");
        h.className = "ppt-chrome-section";
        h.textContent = t("toolbar.section.common");
        const grid = doc.createElement("div");
        grid.className = "ppt-chrome-common-grid";
        const pptxCard = mkChromeCard(t("toolbar.export.pptx"), t("toolbar.export.pptxHint"), "file-text", () => runRibbonCommand(() => a.saveAs?.("pptx")));
        pptxCard.classList.add("ppt-chrome-card--primary");
        const sub = doc.createElement("span");
        sub.className = "ppt-chrome-card-sub";
        sub.textContent = t("toolbar.export.pptxHint");
        pptxCard.appendChild(sub);
        grid.appendChild(pptxCard);
        pop.append(h, grid);
        const extra = formats.filter((fmt) => fmt !== "pptx");
        if (extra.length > 0) {
            const moreH = doc.createElement("div");
            moreH.className = "ppt-chrome-section ppt-chrome-section--more";
            moreH.textContent = t("toolbar.section.more");
            const list = doc.createElement("div");
            list.className = "ppt-chrome-more-list";
            const meta = {
                pdf: { label: "toolbar.export.pdf", hint: "toolbar.export.pdfHint", icon: "file" },
                png: { label: "toolbar.export.png", hint: "toolbar.export.pngHint", icon: "images" },
                html: { label: "toolbar.export.html", hint: "toolbar.export.htmlHint", icon: "file-code" },
                "html-zip": { label: "toolbar.export.htmlZip", hint: "toolbar.export.htmlZipHint", icon: "file-archive" },
            };
            for (const fmt of extra) {
                const m = meta[fmt];
                list.appendChild(mkChromeMoreItem(t(m.label), t(m.hint), m.icon, () => {
                    closeToolbarPopover();
                    runRibbonCommand(() => a.saveAs?.(fmt));
                }));
            }
            pop.append(moreH, list);
        }
    }
    function openShareChrome() {
        closeToolbarPopover();
        const url = a.getShareUrl?.() ?? "";
        const overlay = doc.createElement("div");
        overlay.className = "ppt-chrome-share-overlay";
        overlay.dataset.chromeSurface = "share";
        const modal = doc.createElement("div");
        modal.className = "ppt-chrome-share-modal";
        modal.setAttribute("role", "dialog");
        modal.setAttribute("aria-label", t("toolbar.share"));
        const title = doc.createElement("h3");
        title.className = "ppt-chrome-share-title";
        title.textContent = t("toolbar.share");
        const blurb = doc.createElement("p");
        blurb.className = "ppt-chrome-share-blurb";
        blurb.textContent = t("toolbar.share.blurb");
        const label = doc.createElement("label");
        label.className = "ppt-chrome-share-label";
        label.textContent = t("toolbar.share.linkLabel");
        const input = doc.createElement("input");
        input.className = "ppt-chrome-share-link";
        input.readOnly = true;
        input.value = url;
        input.placeholder = t("toolbar.share.linkEmpty");
        const actions = doc.createElement("div");
        actions.className = "ppt-chrome-share-actions";
        const cancel = doc.createElement("button");
        cancel.type = "button";
        cancel.className = "ppt-chrome-share-cancel";
        cancel.textContent = t("toolbar.share.cancel");
        const copy = doc.createElement("button");
        copy.type = "button";
        copy.className = "ppt-chrome-share-copy";
        copy.textContent = t("toolbar.share.copy");
        let modalDismiss;
        const close = () => {
            modalDismiss?.release();
            overlay.remove();
        };
        cancel.addEventListener("click", close);
        const copyLink = () => {
            const next = input.value.trim();
            if (next) {
                void navigator.clipboard.writeText(next).catch(() => {
                    input.select();
                    doc.execCommand("copy");
                });
                close();
                return;
            }
            close();
            runRibbonCommand(() => a.share?.());
        };
        copy.addEventListener("click", copyLink);
        actions.append(cancel, copy);
        modal.append(title, blurb, label, input, actions);
        overlay.appendChild(modal);
        modalDismiss = bindEditorModal({
            doc,
            overlay,
            panel: modal,
            onCancel: close,
            onSubmit: () => {
                copyLink();
            },
        });
        doc.body.appendChild(overlay);
    }
    function mkTopBtn(label, title, iconName) {
        const b = doc.createElement("button");
        b.type = "button";
        b.className = "ppt-topbar-btn";
        b.title = title;
        if (title)
            b.setAttribute("aria-label", title);
        if (iconName)
            appendLabelWithIcon(doc, b, iconName, label, 14);
        else
            b.textContent = label;
        return b;
    }
    function addShareSep(parent) {
        const d = doc.createElement("span");
        d.className = "ppt-topbar-share-sep";
        d.setAttribute("aria-hidden", "true");
        parent.appendChild(d);
    }
    function mkPanel() {
        const p = doc.createElement("div");
        p.className = "ppt-ribbon-panel";
        return p;
    }
    // 装不下的分组收进右侧「更多」dialog。
    // 带 data-ribbon-priority=high 的常用分组（历史/剪贴板/字体/段落）优先留在单行内，
    // 先挤掉低优先级分组，而不是按「靠左顺序」把字体整组推进更多。
    function setupRibbonOverflow(shell, panel) {
        shell.style.cssText = [
            "display:none",
            "flex-direction:row",
            "align-items:stretch",
            "justify-content:center",
            "width:100%",
            "min-width:0",
            "height:100%",
            "overflow:hidden",
            "padding:0 4px",
            "box-sizing:border-box",
        ].join(";");
        const cluster = doc.createElement("div");
        cluster.style.cssText = [
            "display:flex",
            "flex-direction:row",
            "align-items:stretch",
            "flex:0 1 auto",
            "min-width:0",
            "max-width:100%",
            "overflow:hidden",
        ].join(";");
        shell.insertBefore(cluster, panel);
        cluster.appendChild(panel);
        const expandBtn = mkLucideIconButton(doc, "chevron-down", "", t("ribbon.more"), 16);
        expandBtn.className = "ppt-ribbon-icon-btn";
        expandBtn.style.cssText = [
            "display:none",
            "flex-shrink:0",
            "border-left:1px solid var(--card)",
            "padding:0 10px",
        ].join(";");
        expandBtn.setAttribute("aria-haspopup", "dialog");
        expandBtn.setAttribute("aria-expanded", "false");
        cluster.appendChild(expandBtn);
        const dialogOverlay = doc.createElement("div");
        dialogOverlay.dataset.pptRibbonMoreBackdrop = "1";
        dialogOverlay.style.cssText =
            `position:fixed;inset:0;z-index:${Z_RIBBON_MORE_BACKDROP};background:transparent;display:none`;
        doc.body.appendChild(dialogOverlay);
        const dialog = doc.createElement("div");
        dialog.dataset.pptRibbonMore = "1";
        dialog.setAttribute("role", "dialog");
        dialog.setAttribute("aria-modal", "true");
        dialog.setAttribute("aria-label", t("ribbon.more"));
        // 与 ribbon root 同源排版（font:12px），分组从 panel 挪过来后仍继承同一字号；
        // 多行换行代替横向滚动，避免「更多」里再出现横滑条。
        dialog.style.cssText = [
            "position:fixed",
            `z-index:${Z_RIBBON_MORE}`,
            "display:none",
            "flex-direction:row",
            "flex-wrap:wrap",
            "justify-content:center",
            "align-items:stretch",
            "align-content:flex-start",
            "background:var(--secondary)",
            "color:var(--foreground)",
            "border:1px solid var(--border)",
            "border-radius:6px",
            "box-shadow:0 8px 24px rgba(0,0,0,.5)",
            "overflow:hidden",
            "padding:2px",
            "box-sizing:border-box",
            "font:12px system-ui,sans-serif",
            "user-select:none",
            `min-height:${RIBBON_CONTENT_HEIGHT_PX}px`,
        ].join(";");
        doc.body.appendChild(dialog);
        const EXPAND_BTN_WIDTH = 36;
        let dialogOpen = false;
        let widths;
        /** 与 widths 对应的分组稳定 id（dataset），避免只按 index 在顺序变化后错位。 */
        let widthKeys;
        const groupKey = (g, i) => g.dataset.ribbonGroup || `idx:${i}`;
        const isHighPriority = (g) => g.dataset.ribbonPriority === "high";
        const positionDialog = () => {
            const r = root.getBoundingClientRect();
            const vw = doc.defaultView?.innerWidth ?? 1200;
            const left = Math.max(8, Math.min(r.left, vw - r.width - 8));
            const width = Math.min(r.width, vw - 16);
            dialog.style.left = `${left}px`;
            dialog.style.width = `${width}px`;
            dialog.style.top = `${r.bottom + 4}px`;
        };
        const setGroupOverflowStyle = (g, inDialog) => {
            const rowsWrap = g.firstElementChild;
            if (inDialog) {
                g.style.maxWidth = "100%";
                g.style.flex = "0 1 auto";
                if (rowsWrap)
                    rowsWrap.style.maxWidth = "";
            }
            else {
                g.style.maxWidth = "";
                g.style.flex = "0 0 auto";
            }
        };
        const consolidateGroupsInPanel = () => {
            // 保持「原构造顺序」：panel 现有 + dialog 里的，按 data-ribbon-order 排序。
            const all = [
                ...Array.from(panel.children),
                ...Array.from(dialog.children),
            ];
            all.sort((a, b) => {
                const ao = Number(a.dataset.ribbonOrder ?? "0");
                const bo = Number(b.dataset.ribbonOrder ?? "0");
                return ao - bo;
            });
            for (const g of all) {
                setGroupOverflowStyle(g, false);
                panel.appendChild(g);
            }
        };
        const setDialogOpen = (v) => {
            dialogOpen = v;
            dialog.style.display = v ? "flex" : "none";
            dialogOverlay.style.display = v ? "block" : "none";
            expandBtn.setAttribute("aria-expanded", v ? "true" : "false");
            fillLucideIcon(doc, expandBtn, v ? "chevron-up" : "chevron-down", 16);
            if (v) {
                requestAnimationFrame(() => {
                    positionDialog();
                    requestAnimationFrame(positionDialog);
                });
            }
        };
        dialogOverlay.addEventListener("click", () => setDialogOpen(false));
        expandBtn.addEventListener("click", (ev) => {
            ev.stopPropagation();
            setDialogOpen(!dialogOpen);
        });
        const onDocKeydown = (ev) => {
            if (dialogOpen && ev.key === "Escape" && !hasOpenRibbonPopover(doc))
                setDialogOpen(false);
        };
        doc.addEventListener("keydown", onDocKeydown);
        // 子菜单（插件市场等）打开前会派发此事件，避免「更多」盖住 popover。
        const onCloseMore = () => setDialogOpen(false);
        doc.addEventListener("ppt-ribbon-close-more", onCloseMore);
        const pickVisible = (gs, w, budget) => {
            const n = gs.length;
            const visible = Array.from({ length: n }, () => true);
            let used = w.reduce((sum, x) => sum + x, 0);
            if (used <= budget)
                return visible;
            const dropRightmost = (onlyLow) => {
                for (let i = n - 1; i >= 0; i--) {
                    if (!visible[i])
                        continue;
                    if (onlyLow && isHighPriority(gs[i]))
                        continue;
                    return i;
                }
                return -1;
            };
            while (used > budget) {
                let idx = dropRightmost(true);
                if (idx < 0)
                    idx = dropRightmost(false);
                if (idx < 0)
                    break;
                visible[idx] = false;
                used -= w[idx];
            }
            return visible;
        };
        const relayout = () => {
            const shellStyle = doc.defaultView?.getComputedStyle(shell);
            const padX = (Number.parseFloat(shellStyle?.paddingLeft ?? "0") || 0)
                + (Number.parseFloat(shellStyle?.paddingRight ?? "0") || 0);
            const available = shell.clientWidth - padX;
            if (available <= 0)
                return;
            consolidateGroupsInPanel();
            const gs = Array.from(panel.children);
            if (gs.length === 0)
                return;
            // 首次挂载时补上稳定 order，供之后 consolidate 还原顺序。
            gs.forEach((g, i) => {
                if (g.dataset.ribbonOrder == null)
                    g.dataset.ribbonOrder = String(i);
                if (!g.dataset.ribbonGroup)
                    g.dataset.ribbonGroup = `g${i}`;
            });
            for (const g of gs)
                packRibbonGroup(g, true);
            void panel.offsetWidth;
            const oneRowMeasured = gs.map((g) => g.getBoundingClientRect().width);
            const oneRowSum = oneRowMeasured.reduce((sum, x) => sum + x, 0);
            if (!(oneRowMeasured.every((w) => w > 0) && oneRowSum <= available)) {
                for (const g of gs)
                    packRibbonGroup(g, false);
                // 写入 maxWidth 后必须强制回流，否则仍读到未换行前的整行宽度，溢出判断会把后半组全塞进「更多」。
                void panel.offsetWidth;
            }
            const measured = gs.map((g) => g.getBoundingClientRect().width);
            const keys = gs.map((g, i) => groupKey(g, i));
            if (measured.every((w) => w > 0)) {
                widths = measured;
                widthKeys = keys;
            }
            if (!widths || !widthKeys)
                return;
            // 按当前 gs 顺序取宽；若 key 对不上则重测。
            const w = gs.map((g, i) => {
                const k = groupKey(g, i);
                const j = widthKeys.indexOf(k);
                return j >= 0 ? widths[j] : measured[i];
            });
            const fullSum = w.reduce((sum, x) => sum + x, 0);
            const budget = fullSum > available ? available - EXPAND_BTN_WIDTH : available;
            const visible = pickVisible(gs, w, Math.max(0, budget));
            const hasOverflow = visible.some((v) => !v);
            expandBtn.style.display = hasOverflow ? "inline-flex" : "none";
            // 可见组按原顺序留在 panel；溢出组按原顺序进 dialog。
            for (let i = 0; i < gs.length; i++) {
                const g = gs[i];
                if (visible[i]) {
                    setGroupOverflowStyle(g, false);
                    if (g.parentElement !== panel)
                        panel.appendChild(g);
                }
                else {
                    setGroupOverflowStyle(g, true);
                    if (g.parentElement !== dialog)
                        dialog.appendChild(g);
                }
            }
            const sortIn = (parent) => {
                const kids = Array.from(parent.children);
                kids.sort((a, b) => Number(a.dataset.ribbonOrder ?? 0) - Number(b.dataset.ribbonOrder ?? 0));
                for (const k of kids)
                    parent.appendChild(k);
            };
            sortIn(panel);
            sortIn(dialog);
            if (!hasOverflow && dialogOpen)
                setDialogOpen(false);
            if (dialogOpen)
                positionDialog();
        };
        const ro = new ResizeObserver(relayout);
        ro.observe(shell);
        panel.__pptRelayout = relayout;
        panelCleanupFns.push(() => {
            ro.disconnect();
            doc.removeEventListener("keydown", onDocKeydown);
            doc.removeEventListener("ppt-ribbon-close-more", onCloseMore);
            consolidateGroupsInPanel();
            dialogOverlay.remove();
            dialog.remove();
        });
    }
    function mkGroup(title, opts) {
        const g = doc.createElement("div");
        g.className = "ppt-ribbon-group";
        if (opts?.priority)
            g.dataset.ribbonPriority = opts.priority;
        if (opts?.id)
            g.dataset.ribbonGroup = opts.id;
        const rowsWrap = doc.createElement("div");
        rowsWrap.className = "ppt-ribbon-group__rows";
        const row = doc.createElement("div");
        row.className = "ppt-ribbon-group__row";
        rowsWrap.appendChild(row);
        const h = doc.createElement("div");
        h.className = "ppt-ribbon-group__label";
        h.textContent = title;
        g.appendChild(rowsWrap);
        g.appendChild(h);
        const addRow = () => {
            const r = doc.createElement("div");
            r.className = "ppt-ribbon-group__row";
            rowsWrap.appendChild(r);
            return r;
        };
        return { group: g, row, addRow };
    }
    function tagRibbonLabel(btn) {
        btn.querySelector(":scope > span > span")?.classList.add("ppt-ribbon-btn__label");
    }
    function mkBtn(label, title, fn, iconName, disabled = false) {
        const b = doc.createElement("button");
        b.className = "ppt-ribbon-btn";
        b.title = title;
        if (title)
            b.setAttribute("aria-label", title);
        b.disabled = disabled;
        if (iconName) {
            b.classList.add("ppt-ribbon-btn--glyph");
            if (label) {
                b.classList.add("ppt-ribbon-btn--named");
                appendLabelWithIcon(doc, b, iconName, label, 12);
                tagRibbonLabel(b);
            }
            else {
                b.appendChild(lucideSvg(doc, iconName, 12));
            }
        }
        else {
            b.classList.add("ppt-ribbon-btn--text");
            b.textContent = label;
        }
        b.addEventListener("click", () => {
            if (b.disabled)
                return;
            runRibbonCommand(fn);
            b.blur();
        });
        return b;
    }
    // SVG 图标按钮 —— 与 mkBtn 视觉一致，但内容是单色矢量图标。
    // 主要给"对齐 / 分布 / 翻转 / 旋转"等需要稳定视觉语言的命令使用。
    function mkIconBtn(name, title, fn) {
        const b = doc.createElement("button");
        b.className = "ppt-ribbon-btn";
        b.title = title;
        if (title)
            b.setAttribute("aria-label", title);
        b.style.cssText = [
            "padding:0",
            "min-width:24px",
            "width:24px",
            "height:24px",
            "display:inline-flex",
            "align-items:center",
            "justify-content:center",
        ].join(";");
        b.appendChild(svgIcon(doc, name, 12));
        b.addEventListener("click", () => {
            if (b.disabled)
                return;
            runRibbonCommand(fn);
            b.blur();
        });
        return b;
    }
    function mkToggleBtn(label, title, getOn, fn, iconName) {
        const b = doc.createElement("button");
        b.className = "ppt-ribbon-btn";
        b.title = title;
        if (title)
            b.setAttribute("aria-label", title);
        if (iconName) {
            b.classList.add("ppt-ribbon-btn--glyph");
            if (label) {
                b.classList.add("ppt-ribbon-btn--named");
                appendLabelWithIcon(doc, b, iconName, label, 12);
                tagRibbonLabel(b);
            }
            else {
                b.appendChild(lucideSvg(doc, iconName, 12));
            }
        }
        else {
            b.classList.add("ppt-ribbon-btn--text");
            b.textContent = label;
        }
        const sync = () => {
            b.classList.toggle("ppt-ribbon-btn--pressed", getOn());
        };
        b.addEventListener("click", () => {
            if (b.disabled)
                return;
            runRibbonCommand(fn);
            sync();
            b.blur();
        });
        refreshHandlers.push(sync);
        sync();
        return b;
    }
    function mkColor(value, title, fn) {
        const i = doc.createElement("input");
        i.type = "color";
        i.value = value;
        i.title = title;
        i.setAttribute("aria-label", title);
        i.className = `ppt-ribbon-swatch ${COLOR_SWATCH_CLASS}`;
        i.style.cssText = "";
        i.addEventListener("input", () => runRibbonCommand(() => fn(i.value)));
        i.addEventListener("change", () => runRibbonCommand(() => fn(i.value)));
        return i;
    }
    function mkChoiceBtn(title, iconName, items, onPick, getCurrent) {
        const b = mkBtn("", title, () => {
            openChoiceMenu(doc, b, items.map(([value, label]) => ({ value, label })), onPick, getCurrent?.());
        }, iconName);
        return b;
    }
    function setCtlEnabled(el, on) {
        if (el instanceof HTMLButtonElement || el instanceof HTMLInputElement || el instanceof HTMLSelectElement) {
            el.disabled = !on;
        }
    }
    function enableWhen(els, pred) {
        const list = els.filter((el) => el instanceof HTMLElement);
        if (list.length === 0)
            return;
        refreshHandlers.push(() => {
            const on = pred();
            for (const el of list)
                setCtlEnabled(el, on);
        });
    }
    const selCount = () => a.selectionCount?.() ?? 0;
    const hasSel = () => selCount() > 0;
    const hasText = () => !!a.getCurrentTextRun();
    const isLocked = () => a.isSelectionLocked?.() ?? false;
    // ---------- HOME ----------
    const home = mkPanel();
    {
        const { group, row, addRow } = mkGroup(t("ribbon.group.history"), { priority: "high", id: "home-history" });
        const undoBtn = mkBtn("", t("ribbon.undo"), a.undo, "undo-2");
        const redoBtn = mkBtn("", t("ribbon.redo"), a.redo, "redo-2");
        row.appendChild(undoBtn);
        row.appendChild(redoBtn);
        enableWhen([undoBtn], () => a.canUndo?.() ?? false);
        enableWhen([redoBtn], () => a.canRedo?.() ?? false);
        if (a.listHistory && a.jumpToHistory) {
            const row2 = addRow();
            const histBtn = mkBtn("", t("ribbon.history.list"), () => {
                openHistoryMenu(doc, histBtn, a.listHistory(), (mark) => a.jumpToHistory?.(mark));
            }, "history");
            row2.appendChild(histBtn);
            enableWhen([histBtn], () => (a.canUndo?.() ?? false) || (a.canRedo?.() ?? false));
        }
        home.appendChild(group);
    }
    {
        const { group, row, addRow } = mkGroup(t("ribbon.group.clipboard"), { priority: "high", id: "home-clipboard" });
        const row2 = addRow();
        const cutBtn = a.cut ? mkBtn("", t("ribbon.cut"), a.cut, "scissors") : undefined;
        if (cutBtn)
            row.appendChild(cutBtn);
        const copyBtn = a.copy ? mkBtn("", t("ribbon.copy"), a.copy, "copy") : undefined;
        if (copyBtn)
            row.appendChild(copyBtn);
        if (a.paste) {
            const pasteBtn = mkBtn("", t("ribbon.paste"), a.paste, "clipboard-paste");
            enableWhen([pasteBtn], () => a.canPaste?.() ?? false);
            row.appendChild(pasteBtn);
        }
        if (a.openPasteSpecial) {
            const pasteSpecialBtn = mkChoiceBtn(t("ribbon.pasteSpecial"), "clipboard-type", [
                ["default", t("pasteSpecial.default")],
                ["inPlace", t("pasteSpecial.inPlace")],
                ["plain", t("pasteSpecial.plain")],
            ], (v) => a.openPasteSpecial?.(v));
            enableWhen([pasteSpecialBtn], () => a.canPaste?.() ?? false);
            row.appendChild(pasteSpecialBtn);
        }
        const dupBtn = mkBtn("", t("ribbon.duplicate"), a.duplicate, "copy-plus");
        const delBtn = mkBtn("", t("ribbon.delete"), a.remove, "trash-2");
        row2.appendChild(dupBtn);
        row2.appendChild(delBtn);
        enableWhen([cutBtn, dupBtn, delBtn], () => hasSel() && !isLocked());
        enableWhen([copyBtn], () => hasSel());
        if (a.toggleFormatPainter) {
            let fpClickTimer;
            const fpBtn = mkBtn("", t("ribbon.formatPainter.title"), () => {
                if (fpClickTimer)
                    return;
                fpClickTimer = setTimeout(() => {
                    fpClickTimer = undefined;
                    a.toggleFormatPainter?.(false);
                }, 220);
            }, "paintbrush");
            fpBtn.addEventListener("dblclick", (ev) => {
                ev.preventDefault();
                if (fpClickTimer) {
                    clearTimeout(fpClickTimer);
                    fpClickTimer = undefined;
                }
                a.toggleFormatPainter?.(true);
            });
            refreshHandlers.push(() => setToggle(fpBtn, a.isFormatPainterOn?.() ?? false));
            enableWhen([fpBtn], () => (a.isFormatPainterOn?.() ?? false) || selCount() === 1);
            row2.appendChild(fpBtn);
        }
        home.appendChild(group);
    }
    let fontFamilyInput;
    let fontFamilyCombo;
    let fontSizeInput;
    let fontColorInput;
    let boldBtn;
    let italicBtn;
    let underlineBtn;
    let supBtn;
    let subBtn;
    const SUP_BASELINE = 0.3;
    const SUB_BASELINE = -0.25;
    const INDENT_STEP = 27 * (96 / 72);
    {
        // 两行压缩宽度，避免整组被挤进「更多」；priority=high 保证优先留在常用区。
        const { group, row, addRow } = mkGroup(t("ribbon.group.font"), { priority: "high", id: "home-font" });
        const row2 = addRow();
        const fontCtl = [];
        fontFamilyInput = doc.createElement("input");
        fontFamilyInput.type = "text";
        fontFamilyInput.placeholder = t("ribbon.font.placeholder");
        fontFamilyInput.title = t("ribbon.font.list");
        fontFamilyInput.setAttribute("aria-label", t("ribbon.font.list"));
        fontFamilyInput.className = "ppt-ribbon-input";
        fontFamilyCombo = bindFontFamilyCombobox(fontFamilyInput, (v) => a.applyTextStyle({ fontFamily: v || undefined }));
        fontFamilyCombo.el.style.width = "96px";
        row.appendChild(fontFamilyCombo.el);
        fontCtl.push(fontFamilyInput);
        panelCleanupFns.push(() => fontFamilyCombo.destroy());
        fontSizeInput = doc.createElement("input");
        fontSizeInput.type = "number";
        fontSizeInput.min = "6";
        fontSizeInput.max = "96";
        fontSizeInput.step = "0.5";
        fontSizeInput.title = t("ribbon.font.size");
        fontSizeInput.setAttribute("aria-label", t("ribbon.font.size"));
        fontSizeInput.className = "ppt-ribbon-input";
        fontSizeInput.style.cssText = "width:46px;margin-left:2px";
        fontSizeInput.addEventListener("change", () => {
            const n = Number(fontSizeInput.value);
            if (Number.isFinite(n) && n > 0)
                a.applyTextStyle({ fontSize: fontPxFromPt(n) });
        });
        row.appendChild(fontSizeInput);
        fontCtl.push(fontSizeInput);
        // 字号增减按钮：每次 ±2pt，符合 PowerPoint 默认。
        const sizeUp = mkBtn("", t("ribbon.font.sizeUp"), () => {
            const cur = a.getCurrentTextRun();
            const pt = pxToPt(cur?.fontSize ?? ptToPx(DEFAULT_FONT_PT));
            a.applyTextStyle({ fontSize: fontPxFromPt(pt + 2) });
        }, "a-arrow-up");
        const sizeDown = mkBtn("", t("ribbon.font.sizeDown"), () => {
            const cur = a.getCurrentTextRun();
            const pt = pxToPt(cur?.fontSize ?? ptToPx(DEFAULT_FONT_PT));
            a.applyTextStyle({ fontSize: fontPxFromPt(pt - 2) });
        }, "a-arrow-down");
        row.appendChild(sizeUp);
        row.appendChild(sizeDown);
        fontCtl.push(sizeUp, sizeDown);
        fontColorInput = mkColor("#000000", t("ribbon.font.color"), (v) => a.applyTextStyle({ color: v }));
        row.appendChild(fontColorInput);
        fontCtl.push(fontColorInput);
        const highlightInput = mkColor("#ffff00", t("ribbon.font.highlight"), (v) => a.applyTextStyle({ highlight: v }));
        row.appendChild(highlightInput);
        fontCtl.push(highlightInput);
        if (a.toggleTextShadow) {
            const tsBtn = mkToggleBtn("", t("ribbon.font.textShadow"), () => a.isTextShadowOn?.() ?? false, () => a.toggleTextShadow?.(), "eclipse");
            row.appendChild(tsBtn);
            fontCtl.push(tsBtn);
        }
        boldBtn = mkBtn("", t("ribbon.font.bold"), () => {
            const cur = a.getCurrentTextRun();
            const on = isBold(cur?.fontWeight);
            a.applyTextStyle({ fontWeight: on ? 400 : 700 });
        }, "bold");
        italicBtn = mkBtn("", t("ribbon.font.italic"), () => {
            const cur = a.getCurrentTextRun();
            a.applyTextStyle({ italic: !cur?.italic });
        }, "italic");
        underlineBtn = mkBtn("", t("ribbon.font.underline"), () => {
            const cur = a.getCurrentTextRun();
            a.applyTextStyle({ underline: !cur?.underline });
        }, "underline");
        const strikeBtn = mkBtn("", t("ribbon.font.strike"), () => {
            const cur = a.getCurrentTextRun();
            const next = cur?.strikethrough && cur.strikethrough !== "none" ? "none" : "single";
            a.applyTextStyle({ strikethrough: next });
        }, "strikethrough");
        strikeBtn.style.textDecoration = "line-through";
        row2.appendChild(boldBtn);
        row2.appendChild(italicBtn);
        row2.appendChild(underlineBtn);
        row2.appendChild(strikeBtn);
        fontCtl.push(boldBtn, italicBtn, underlineBtn, strikeBtn);
        supBtn = mkBtn("", t("ribbon.font.superscript"), () => {
            const cur = a.getCurrentTextRun();
            const on = typeof cur?.baseline === "number" && cur.baseline > 0;
            a.applyTextStyle({ baseline: on ? 0 : SUP_BASELINE });
        }, "superscript");
        subBtn = mkBtn("", t("ribbon.font.subscript"), () => {
            const cur = a.getCurrentTextRun();
            const on = typeof cur?.baseline === "number" && cur.baseline < 0;
            a.applyTextStyle({ baseline: on ? 0 : SUB_BASELINE });
        }, "subscript");
        row2.appendChild(supBtn);
        row2.appendChild(subBtn);
        fontCtl.push(supBtn, subBtn);
        const spacingDown = mkBtn("", t("ribbon.font.spacingDown"), () => {
            const cur = a.getCurrentTextRun();
            const next = (cur?.letterSpacing ?? 0) - 0.5;
            a.applyTextStyle({ letterSpacing: next <= 0 ? null : next });
        }, "fold-horizontal");
        const spacingUp = mkBtn("", t("ribbon.font.spacingUp"), () => {
            const cur = a.getCurrentTextRun();
            a.applyTextStyle({ letterSpacing: (cur?.letterSpacing ?? 0) + 0.5 });
        }, "unfold-horizontal");
        row2.appendChild(spacingDown);
        row2.appendChild(spacingUp);
        fontCtl.push(spacingDown, spacingUp);
        if (a.clearTextFormatting) {
            const clearBtn = mkBtn("", t("ribbon.font.clearFormat"), a.clearTextFormatting, "remove-formatting");
            row2.appendChild(clearBtn);
            fontCtl.push(clearBtn);
        }
        if (a.applyChangeCase) {
            const caseBtn = mkBtn("", t("ribbon.font.changeCase"), () => {
                openChangeCasePicker(doc, caseBtn, (mode) => a.applyChangeCase?.(mode));
            }, "case-sensitive");
            row2.appendChild(caseBtn);
            fontCtl.push(caseBtn);
        }
        enableWhen(fontCtl, hasText);
        home.appendChild(group);
    }
    {
        const { group, row, addRow } = mkGroup(t("ribbon.group.paragraph"), { priority: "high", id: "home-paragraph" });
        const row2 = addRow();
        row.appendChild(mkIconBtn("alignParaLeft", t("ribbon.align.left"), () => a.applyAlign("start")));
        row.appendChild(mkIconBtn("alignParaCenter", t("ribbon.align.center"), () => a.applyAlign("middle")));
        row.appendChild(mkIconBtn("alignParaRight", t("ribbon.align.right"), () => a.applyAlign("end")));
        row.appendChild(mkIconBtn("alignParaJustify", t("ribbon.align.justify"), () => a.applyAlign("justify")));
        if (a.setTextVAlign) {
            row.appendChild(mkIconBtn("alignTop", t("ribbon.vAlign.top"), () => a.setTextVAlign?.("top")));
            row.appendChild(mkIconBtn("alignCenterV", t("ribbon.vAlign.middle"), () => a.setTextVAlign?.("middle")));
            row.appendChild(mkIconBtn("alignBottom", t("ribbon.vAlign.bottom"), () => a.setTextVAlign?.("bottom")));
        }
        if (a.applyParagraphSpacing) {
            row.appendChild(mkChoiceBtn(t("ribbon.paragraph.lineSpacing"), "unfold-vertical", [
                ["", t("ribbon.paragraph.lineSpacing.default")],
                ["1", "1.0"],
                ["1.15", "1.15"],
                ["1.5", "1.5"],
                ["2", "2.0"],
            ], (v) => {
                if (!v)
                    a.applyParagraphSpacing?.({ lineHeight: null, lineHeightPx: null });
                else
                    a.applyParagraphSpacing?.({ lineHeight: Number(v) });
            }, () => {
                const lh = a.getCurrentParagraph?.()?.lineHeight;
                if (lh === 1)
                    return "1";
                if (lh === 1.15)
                    return "1.15";
                if (lh === 1.5)
                    return "1.5";
                if (lh === 2)
                    return "2";
                return "";
            }));
        }
        if (a.setParagraphBullet) {
            const bulletBtn = mkBtn("", t("ribbon.bullet.title"), () => {
                a.setParagraphBullet?.({ kind: "char", char: "•" });
            }, "list");
            const bulletMore = mkBtn("", t("ribbon.bullet.title"), () => {
                openBulletPicker(doc, bulletMore, (def) => a.setParagraphBullet?.(def));
            }, "chevron-down");
            bulletMore.style.minWidth = "16px";
            bulletMore.style.padding = "4px 2px";
            row2.appendChild(bulletBtn);
            row2.appendChild(bulletMore);
            const numBtn = mkBtn("", t("ribbon.numbering.title"), () => {
                a.setParagraphBullet?.({ kind: "number", numType: "arabicPeriod" });
            }, "list-ordered");
            const numMore = mkBtn("", t("ribbon.numbering.title"), () => {
                openNumberingPicker(doc, numMore, (def) => a.setParagraphBullet?.(def));
            }, "chevron-down");
            numMore.style.minWidth = "16px";
            numMore.style.padding = "4px 2px";
            row2.appendChild(numBtn);
            row2.appendChild(numMore);
        }
        if (a.adjustIndent) {
            row2.appendChild(mkBtn("", t("ribbon.paragraph.indentDecrease"), () => a.adjustIndent?.(-INDENT_STEP), "indent-decrease"));
            row2.appendChild(mkBtn("", t("ribbon.paragraph.indentIncrease"), () => a.adjustIndent?.(INDENT_STEP), "indent-increase"));
        }
        if (a.convertToSmartArt) {
            row2.appendChild(mkBtn("", t("ribbon.convert.smartArtHint"), () => a.convertToSmartArt?.(), "route"));
        }
        if (a.setTextOrientation) {
            row2.appendChild(mkChoiceBtn(t("ribbon.textDir.orientation"), "rectangle-vertical", [
                ["horz", t("ribbon.textDir.horz")],
                ["vert", t("ribbon.textDir.vert")],
                ["vert270", t("ribbon.textDir.vert270")],
                ["eaVert", t("ribbon.textDir.eaVert")],
                ["wordArtVertRtl", t("ribbon.textDir.wordArtVert")],
            ], (v) => {
                if (v === "horz") {
                    a.setTextOrientation?.(null);
                    return;
                }
                if (v === "wordArtVertRtl") {
                    const cur = a.getTextOrientation?.();
                    if (cur === "wordArtVert" || cur === "wordArtVertRtl")
                        return;
                }
                a.setTextOrientation?.(v);
            }, () => {
                const cur = a.getTextOrientation?.() ?? "horz";
                return cur === "wordArtVert" ? "wordArtVertRtl" : cur;
            }));
        }
        enableWhen(Array.from(group.querySelectorAll("button, input, select")), hasText);
        home.appendChild(group);
    }
    {
        const { group, row, addRow } = mkGroup(t("ribbon.group.arrange"));
        const row2 = addRow();
        row.appendChild(mkBtn("", t("ribbon.arrange.bringFront"), a.bringFront, "arrow-up-to-line"));
        row.appendChild(mkBtn("", t("ribbon.arrange.sendBack"), a.sendBack, "arrow-down-to-line"));
        row2.appendChild(mkBtn("", t("ribbon.arrange.backward"), a.sendBackward, "arrow-down"));
        row2.appendChild(mkBtn("", t("ribbon.arrange.forward"), a.bringForward, "arrow-up"));
        enableWhen(Array.from(group.querySelectorAll("button")), hasSel);
        home.appendChild(group);
    }
    if (a.openFindReplace || a.focusLayersPanel) {
        const { group, row, addRow } = mkGroup(t("ribbon.group.editing"));
        const row2 = addRow();
        if (a.openFindReplace) {
            row.appendChild(mkBtn("", t("ribbon.find.title"), a.openFindReplace, "search"));
        }
        if (a.openReplace) {
            row.appendChild(mkBtn("", t("ribbon.replace.title"), a.openReplace, "arrow-left-right"));
        }
        if (a.focusLayersPanel) {
            row2.appendChild(mkBtn("", t("ribbon.selectionPane.title"), () => a.focusLayersPanel?.(), "list-tree"));
        }
        home.appendChild(group);
    }
    if (a.openLayoutPicker || a.resetSlideLayout || a.addSection || a.toggleCurrentSlideHidden) {
        const { group, row, addRow } = mkGroup(t("ribbon.group.slides"));
        const row2 = addRow();
        if (a.openLayoutPicker) {
            row.appendChild(mkBtn("", t("ribbon.slides.layout"), () => a.openLayoutPicker?.(), "layout-template"));
        }
        if (a.resetSlideLayout) {
            row.appendChild(mkBtn("", t("ribbon.slides.reset"), () => a.resetSlideLayout?.(), "rotate-ccw"));
        }
        if (a.addSection) {
            row2.appendChild(mkBtn("", t("ribbon.slides.section"), () => a.addSection?.(), "folder-plus"));
        }
        if (a.toggleCurrentSlideHidden) {
            row2.appendChild(mkToggleBtn("", t("ribbon.slideshow.hideSlide"), () => a.isCurrentSlideHidden?.() ?? false, () => {
                a.toggleCurrentSlideHidden?.();
            }, "eye-off"));
        }
        home.appendChild(group);
    }
    if (a.listQuickStyles && a.applyQuickStyle) {
        const { group, row, addRow } = mkGroup(t("ribbon.group.quickStyles"));
        const row2 = addRow();
        const presets = a.listQuickStyles();
        const split = Math.ceil(presets.length / 2);
        const appendSwatch = (parent, preset) => {
            const btn = doc.createElement("button");
            btn.type = "button";
            btn.className = "ppt-ribbon-swatch";
            btn.title = preset.label;
            btn.setAttribute("aria-label", preset.label);
            if (preset.preview === "outline") {
                btn.classList.add("ppt-ribbon-swatch--outline");
                btn.style.cssText =
                    `width:26px;height:22px;padding:0;box-sizing:border-box;border-radius:3px;background:transparent;border:2px solid ${preset.color};color:${preset.color}`;
            }
            else {
                btn.style.cssText =
                    `width:26px;height:22px;padding:0;border-radius:3px;background:${preset.color}`;
            }
            btn.addEventListener("click", () => {
                if (btn.disabled)
                    return;
                a.applyQuickStyle?.(preset.id);
            });
            parent.appendChild(btn);
        };
        for (const preset of presets.slice(0, split))
            appendSwatch(row, preset);
        for (const preset of presets.slice(split))
            appendSwatch(row2, preset);
        enableWhen(Array.from(group.querySelectorAll("button")), hasSel);
        home.appendChild(group);
    }
    contentRow.appendChild(home);
    tabPanels.set("Home", home);
    // ---------- INSERT ----------
    const insert = mkPanel();
    if (a.insertSlide) {
        const { group, row } = mkGroup(t("toolbar.insert.page"));
        row.appendChild(mkBtn(t("toolbar.insert.page"), t("toolbar.insert.pageHint"), () => a.insertSlide?.(), "plus"));
        insert.appendChild(group);
    }
    if (a.insertTable) {
        const { group, row } = mkGroup(t("toolbar.insert.tableShort"));
        row.appendChild(mkBtn(t("toolbar.insert.tableShort"), t("ribbon.insert.table"), () => a.insertTable?.(), "table"));
        insert.appendChild(group);
    }
    {
        // 常用快捷形状排在前面，「更多」放在这一组的最后，打开分类对话框。
        const { group, row, addRow } = mkGroup(t("ribbon.group.shapes"));
        for (const shape of COMMON_DRAW_SHAPES) {
            row.appendChild(mkBtn("", t(shape.label), () => drawArmedShape(shape.kind), shape.icon));
        }
        const row2 = addRow();
        for (const presetId of RIBBON_EXTRA_SHAPES) {
            const entry = SHAPE_BY_ID[presetId];
            const title = entry
                ? (() => {
                    const lbl = t(entry.labelKey);
                    return lbl !== entry.labelKey ? lbl : entry.fallback;
                })()
                : presetId;
            const b = doc.createElement("button");
            b.className = "ppt-ribbon-btn";
            b.title = title;
            if (title)
                b.setAttribute("aria-label", title);
            b.style.cssText =
                "padding:0;min-width:24px;width:24px;height:24px;display:inline-flex;align-items:center;justify-content:center";
            if (entry) {
                const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
                svg.setAttribute("viewBox", "0 0 24 24");
                svg.setAttribute("width", "12");
                svg.setAttribute("height", "12");
                svg.setAttribute("aria-hidden", "true");
                svg.style.color = "currentColor";
                svg.innerHTML = entry.icon;
                b.appendChild(svg);
            }
            b.addEventListener("click", () => {
                drawArmedShape(presetId);
                b.blur();
            });
            row2.appendChild(b);
        }
        const more = mkBtn(t("ribbon.shape.moreLabel"), t("ribbon.shape.more"), () => {
            void openShapePickerDialog(doc).then((kind) => {
                if (kind)
                    drawArmedShape(kind);
            });
        }, "chevron-down");
        more.classList.add("ppt-ribbon-btn--keep-label");
        row2.appendChild(more);
        insert.appendChild(group);
    }
    {
        const { group, row, addRow } = mkGroup(t("ribbon.group.text"));
        const row2 = addRow();
        row.appendChild(mkBtn("", t("ribbon.shape.textBox"), () => a.insertShape("text"), "type"));
        if (a.insertWordArt)
            row.appendChild(mkBtn("", t("ribbon.insert.wordArt"), () => a.insertWordArt?.(), "wand-sparkles"));
        if (a.insertSymbol)
            row2.appendChild(mkBtn("", t("ribbon.insert.symbol"), () => a.insertSymbol?.(), "omega"));
        if (a.insertIcon)
            row2.appendChild(mkBtn("", t("ribbon.insert.icons"), () => a.insertIcon?.(), "blocks"));
        if (a.insertEquation)
            row2.appendChild(mkBtn("", t("ribbon.insert.equation"), () => a.insertEquation?.(), "sigma"));
        insert.appendChild(group);
    }
    if (a.openModel3DPicker) {
        const { group, row } = mkGroup(t("ribbon.group.illustrations"));
        row.appendChild(mkBtn("", `${t("ribbon.insert.model3d")} — ${t("ribbon.insert.model3dHint")}`, () => a.openModel3DPicker?.(), "box"));
        insert.appendChild(group);
    }
    if (a.insertChart ||
        a.insertSmartArt ||
        a.insertHyperlink ||
        a.insertWebEmbed ||
        a.insertDateTimeField ||
        a.insertSlideNumberField ||
        a.setBookmark ||
        a.insertHeaderFooter ||
        a.openOleInsert) {
        const { group, row, addRow } = mkGroup(t("ribbon.group.insertExtras"));
        const row2 = addRow();
        if (a.insertChart)
            row.appendChild(mkBtn("", t("ribbon.insert.chart"), () => a.insertChart?.(), "chart-column"));
        if (a.insertSmartArt)
            row.appendChild(mkBtn("", t("ribbon.insert.smartArt"), () => a.insertSmartArt?.(), "network"));
        if (a.insertHyperlink)
            row.appendChild(mkBtn("", t("ribbon.insert.hyperlink"), () => a.insertHyperlink?.(), "link"));
        if (a.insertWebEmbed)
            row.appendChild(mkBtn("", t("ribbon.insert.webEmbed"), () => a.insertWebEmbed?.(), "monitor-play"));
        if (a.setBookmark)
            row2.appendChild(mkBtn(t("ribbon.insert.bookmarkLabel"), t("ribbon.insert.bookmark"), () => a.setBookmark?.(), "bookmark"));
        if (a.insertDateTimeField)
            row2.appendChild(mkBtn(t("ribbon.insert.dateTimeLabel"), t("ribbon.insert.dateTime"), () => a.insertDateTimeField?.(), "calendar"));
        if (a.insertSlideNumberField)
            row2.appendChild(mkBtn(t("ribbon.insert.slideNumberLabel"), t("ribbon.insert.slideNumber"), () => a.insertSlideNumberField?.(), "hash"));
        if (a.insertHeaderFooter)
            row2.appendChild(mkBtn("", t("ribbon.insert.headerFooter"), () => a.insertHeaderFooter?.(), "panel-top"));
        if (a.openOleInsert) {
            row2.appendChild(mkBtn(t("ribbon.insert.objectLabel"), `${t("ribbon.insert.object")} — ${t("ribbon.insert.objectHint")}`, () => a.openOleInsert?.(), "file-box"));
        }
        insert.appendChild(group);
    }
    {
        const { group, row, addRow } = mkGroup(t("ribbon.group.media"));
        const row2 = addRow();
        row.appendChild(mkBtn("", t("ribbon.media.picture"), a.insertImage, "image"));
        if (a.openPhotoAlbum) {
            row.appendChild(mkBtn(t("ribbon.media.photoAlbumLabel"), t("ribbon.media.photoAlbum"), () => a.openPhotoAlbum?.(), "images"));
        }
        if (a.insertOnlinePicture) {
            row.appendChild(mkBtn(t("ribbon.media.onlinePictureLabel"), t("ribbon.media.onlinePicture"), () => a.insertOnlinePicture?.(), "globe"));
        }
        if (a.insertScreenshot) {
            row.appendChild(mkBtn(t("ribbon.media.screenshotLabel"), t("ribbon.media.screenshot"), () => a.insertScreenshot?.(), "camera"));
        }
        if (a.openMediaLibrary) {
            row2.appendChild(mkBtn(t("ribbon.media.libraryLabel"), t("ribbon.media.library"), () => a.openMediaLibrary?.(), "library"));
        }
        if (a.insertVideo)
            row2.appendChild(mkBtn("", t("ribbon.media.video"), () => a.insertVideo?.(), "video"));
        if (a.insertAudio)
            row2.appendChild(mkBtn("", t("ribbon.media.audio"), () => a.insertAudio?.(), "music"));
        if (a.openRecordDialog) {
            row2.appendChild(mkBtn(t("ribbon.media.record"), t("ribbon.media.recordHint"), () => a.openRecordDialog?.(), "disc"));
        }
        insert.appendChild(group);
    }
    contentRow.appendChild(insert);
    tabPanels.set("Insert", insert);
    // ---------- DRAW ----------
    const draw = mkPanel();
    if (a.setInkMode && a.getInkMode) {
        const { group, row } = mkGroup(t("ribbon.group.ink"));
        const mkInkBtn = (label, title, mode, icon) => mkToggleBtn(label, title, () => a.getInkMode?.() === mode, () => {
            const cur = a.getInkMode?.();
            a.setInkMode?.(cur === mode ? null : mode);
            refreshHandlers.forEach((fn) => fn());
        }, icon);
        row.appendChild(mkInkBtn(t("ribbon.ink.pen"), t("ribbon.ink.penHint"), "pen", "pen"));
        row.appendChild(mkInkBtn(t("ribbon.ink.highlighter"), t("ribbon.ink.highlighterHint"), "highlighter", "highlighter"));
        row.appendChild(mkInkBtn(t("ribbon.ink.eraser"), t("ribbon.ink.eraserHint"), "eraser", "eraser"));
        if (a.setInkPenColor) {
            const colorInp = mkColor("#111827", t("ribbon.ink.color"), (v) => a.setInkPenColor?.(v));
            refreshHandlers.push(() => {
                const c = a.getInkPenColor?.();
                if (c && /^#[0-9a-fA-F]{6}$/.test(c) && colorInp.value.toLowerCase() !== c.toLowerCase()) {
                    colorInp.value = c;
                }
            });
            row.appendChild(colorInp);
        }
        if (a.setInkPenWidth) {
            row.appendChild(mkChoiceBtn(t("ribbon.ink.widthHint"), "sliders-horizontal", [2, 3, 5, 8, 12, 22].map((w) => [String(w), t("ribbon.ink.widthPt", { n: w })]), (v) => a.setInkPenWidth?.(Number(v)), () => String(a.getInkPenWidth?.() ?? 3)));
        }
        if (a.clearInkOnSlide) {
            row.appendChild(mkBtn("", t("ribbon.ink.clearHint"), () => a.clearInkOnSlide?.(), "brush-cleaning"));
        }
        if (a.convertInkToShape) {
            row.appendChild(mkBtn("", t("ribbon.ink.convert"), () => a.convertInkToShape?.(), "pen-line"));
        }
        if (a.convertInkToText) {
            row.appendChild(mkBtn("", t("ribbon.ink.convertText"), () => a.convertInkToText?.(), "scan-text"));
        }
        row.appendChild(mkBtn("", t("ribbon.ink.stopHint"), () => {
            a.setInkMode?.(null);
            refreshHandlers.forEach((fn) => fn());
        }, "mouse-pointer"));
        draw.appendChild(group);
    }
    contentRow.appendChild(draw);
    tabPanels.set("Draw", draw);
    // ---------- DESIGN ----------
    const design = mkPanel();
    {
        const { group, row } = mkGroup(t("ribbon.group.slideSize"));
        row.appendChild(mkBtn("16:9", t("ribbon.slideSize.widescreen"), () => a.setSlideAspect("16:9")));
        row.appendChild(mkBtn("4:3", t("ribbon.slideSize.standard"), () => a.setSlideAspect("4:3")));
        design.appendChild(group);
    }
    if (a.openThemeGallery) {
        const { group, row } = mkGroup(t("ribbon.group.themes"));
        const themeBtn = mkBtn(t("ribbon.themes.gallery"), t("ribbon.themes.galleryHint"), () => a.openThemeGallery());
        const syncThemeLabel = () => {
            const cur = a.getCurrentThemeId?.();
            themeBtn.textContent = cur
                ? t("ribbon.themes.galleryWithCurrent", { name: cur })
                : t("ribbon.themes.gallery");
            design.__pptRelayout?.();
        };
        refreshHandlers.push(syncThemeLabel);
        syncThemeLabel();
        row.appendChild(themeBtn);
        design.appendChild(group);
        const themeNote = doc.createElement("div");
        themeNote.className = "ppt-chrome-footnote";
        themeNote.textContent = t("toolbar.theme.colorStyle");
        design.appendChild(themeNote);
    }
    if (a.listThemeVariants && a.applyThemeVariant && a.listThemeVariants().length > 0) {
        const { group, row } = mkGroup(t("ribbon.group.variants"));
        const variantBtns = [];
        for (const v of a.listThemeVariants()) {
            const btn = doc.createElement("button");
            btn.type = "button";
            btn.className = "ppt-ribbon-swatch";
            btn.dataset.variantId = v.id;
            btn.title = v.label;
            btn.setAttribute("aria-label", v.label);
            btn.style.cssText =
                "width:26px;height:22px;padding:0;border-radius:3px;background:" +
                    v.swatch;
            btn.addEventListener("click", () => a.applyThemeVariant?.(v.id));
            variantBtns.push(btn);
            row.appendChild(btn);
        }
        refreshHandlers.push(() => {
            const fresh = a.listThemeVariants?.() ?? [];
            for (const btn of variantBtns) {
                const next = fresh.find((item) => item.id === btn.dataset.variantId);
                if (next)
                    btn.style.background = next.swatch;
            }
        });
        design.appendChild(group);
    }
    if (a.openDesigner) {
        const { group, row } = mkGroup(t("ribbon.group.designer"));
        row.appendChild(mkBtn(t("ribbon.designer.label"), t("ribbon.designer.hint"), () => a.openDesigner(), "sparkles"));
        design.appendChild(group);
    }
    {
        const { group, row } = mkGroup(t("ribbon.group.background"));
        row.appendChild(mkColor("#ffffff", t("ribbon.background.color"), (v) => a.setBackground(v)));
        if (a.openFormatBackground) {
            row.appendChild(mkBtn(t("ribbon.background.formatLabel"), t("ribbon.background.format"), () => a.openFormatBackground(), "paint-bucket"));
        }
        design.appendChild(group);
    }
    contentRow.appendChild(design);
    tabPanels.set("Design", design);
    // ---------- TRANSITIONS ----------
    const transitions = mkPanel();
    const transitionRefreshers = [];
    if (a.previewTransition || a.applyQuickTransition) {
        if (a.previewTransition) {
            const { group, row } = mkGroup(t("ribbon.group.transition"));
            row.appendChild(mkBtn(t("ribbon.transition.previewLabel"), t("ribbon.transition.preview"), () => a.previewTransition?.(), "play"));
            if (a.focusTransitionsPanel) {
                row.appendChild(mkBtn(t("ribbon.panels.transitions"), t("ribbon.panels.transitionsHint"), () => a.focusTransitionsPanel?.(), "blend"));
            }
            transitions.appendChild(group);
        }
        if (a.applyQuickTransition) {
            const { group, row } = mkGroup(t("ribbon.group.transition"));
            const quickKinds = new Set(["cut", "fade", "push", "wipe", "dissolve", "morph", "zoom"]);
            const kindItems = [];
            for (const cat of ["subtle", "exciting", "dynamic"]) {
                for (const o of TRANSITION_OPTIONS) {
                    if (o.category !== cat || !quickKinds.has(o.kind))
                        continue;
                    kindItems.push([o.kind, transitionKindLabel(o)]);
                }
            }
            kindItems.push(["__more__", t("ribbon.transition.moreEffects")]);
            const kindBtn = mkChoiceBtn(t("ribbon.transition.kind"), "blend", kindItems, (v) => {
                if (v === "__more__") {
                    a.focusTransitionsPanel?.();
                    transitionRefreshers.forEach((fn) => fn());
                    return;
                }
                const dur = Number(durInput.value);
                a.applyQuickTransition?.(v, Number.isFinite(dur) ? dur : undefined);
            }, () => {
                const cur = a.getCurrentTransition?.();
                if (!cur)
                    return "cut";
                return quickKinds.has(cur.kind) ? cur.kind : "__more__";
            });
            row.appendChild(kindBtn);
            transitions.appendChild(group);
            const { group: timeGroup, row: timeRow } = mkGroup(t("ribbon.group.timing"));
            const durInput = doc.createElement("input");
            durInput.type = "number";
            durInput.min = "0";
            durInput.step = "0.1";
            durInput.title = t("ribbon.transition.duration");
            styleRibbonField(durInput, "width:56px");
            durInput.addEventListener("change", () => {
                const cur = a.getCurrentTransition?.();
                if (!cur || cur.kind === "cut")
                    return;
                const n = Number(durInput.value);
                if (!Number.isFinite(n) || n < 0)
                    return;
                a.applyQuickTransition?.(cur.kind, n);
            });
            timeRow.appendChild(durInput);
            transitions.appendChild(timeGroup);
            transitionRefreshers.push(() => {
                const cur = a.getCurrentTransition?.();
                if (!cur) {
                    durInput.value = "0.6";
                    durInput.disabled = true;
                    return;
                }
                durInput.disabled = cur.kind === "cut";
                durInput.value = String(cur.duration);
            });
        }
        if (a.applyTransitionToAll) {
            const { group, row } = mkGroup(t("ribbon.group.apply"));
            const applyAllBtn = mkBtn(t("ribbon.transition.applyAll"), t("ribbon.transition.applyAllTitle"), () => a.applyTransitionToAll?.());
            row.appendChild(applyAllBtn);
            enableWhen([applyAllBtn], () => {
                const cur = a.getCurrentTransition?.();
                return !!cur && cur.kind !== "cut";
            });
            transitions.appendChild(group);
        }
    }
    contentRow.appendChild(transitions);
    tabPanels.set("Transitions", transitions);
    // ---------- ANIMATIONS ----------
    const animations = mkPanel();
    if (a.openAnimationPicker || a.focusAnimationsPanel || a.toggleAnimationPainter) {
        if (a.openAnimationPicker) {
            const { group, row } = mkGroup(t("ribbon.group.addAnimation"));
            const addAnimBtn = mkBtn(t("ribbon.anim.addLabel"), t("ribbon.anim.add"), () => a.openAnimationPicker?.(), "zap");
            row.appendChild(addAnimBtn);
            enableWhen([addAnimBtn], hasSel);
            animations.appendChild(group);
        }
        if (a.toggleAnimationPainter) {
            const { group, row } = mkGroup(t("ribbon.group.clipboard"));
            let apClickTimer;
            const apBtn = mkBtn("", t("ribbon.animationPainter.title"), () => {
                if (apClickTimer)
                    return;
                apClickTimer = setTimeout(() => {
                    apClickTimer = undefined;
                    a.toggleAnimationPainter?.(false);
                }, 220);
            }, "wand-2");
            apBtn.addEventListener("dblclick", (ev) => {
                ev.preventDefault();
                if (apClickTimer) {
                    clearTimeout(apClickTimer);
                    apClickTimer = undefined;
                }
                a.toggleAnimationPainter?.(true);
            });
            refreshHandlers.push(() => setToggle(apBtn, a.isAnimationPainterOn?.() ?? false));
            enableWhen([apBtn], () => (a.isAnimationPainterOn?.() ?? false) || selCount() === 1);
            row.appendChild(apBtn);
            animations.appendChild(group);
        }
        if (a.focusAnimationsPanel || a.toggleTimeline || a.toggleTimelinePanel) {
            const { group, row } = mkGroup(t("ribbon.group.animationPane"));
            if (a.focusAnimationsPanel) {
                row.appendChild(mkBtn(t("ribbon.panels.animations"), t("ribbon.panels.animationsHint"), () => a.focusAnimationsPanel?.(), "panel-right"));
            }
            const toggleTl = a.toggleTimeline ?? a.toggleTimelinePanel;
            const isTlOpen = a.isTimelineOn ?? a.isTimelinePanelOpen;
            if (toggleTl) {
                let timelineOn = isTlOpen?.() ?? false;
                const tlBtn = mkBtn(t("ribbon.panels.timelineLabel"), t("ribbon.panels.timelineHint"), () => {
                    timelineOn = toggleTl() ?? !timelineOn;
                    setToggle(tlBtn, timelineOn);
                }, "gantt-chart");
                refreshHandlers.push(() => {
                    timelineOn = isTlOpen?.() ?? timelineOn;
                    setToggle(tlBtn, timelineOn);
                });
                row.appendChild(tlBtn);
            }
            animations.appendChild(group);
        }
    }
    contentRow.appendChild(animations);
    tabPanels.set("Animations", animations);
    // ---------- FORMAT ----------
    // 仅在多选 / 单选 shape 时有意义；按钮 disabled 状态由 refresh 同步。
    const fmt = mkPanel();
    const formatRefreshers = [];
    if (a.setSelectionFill || a.setSelectionStroke) {
        const { group, row, addRow } = mkGroup(t("ribbon.group.shapeStyle"));
        const row2 = addRow();
        const skipSelEnable = new Set();
        if (a.setSelectionFill) {
            // 填充：左侧色块即当前色，点击打开取色器；右侧 "No fill" 清除填充。
            const fillColor = doc.createElement("input");
            fillColor.type = "color";
            fillColor.className = `ppt-ribbon-swatch ${COLOR_SWATCH_CLASS}`;
            fillColor.title = t("ribbon.shapeStyle.fill");
            fillColor.style.marginRight = "2px";
            fillColor.addEventListener("change", () => a.setSelectionFill?.(fillColor.value));
            row.appendChild(fillColor);
            const noFill = mkBtn("", t("ribbon.shapeStyle.noFill"), () => a.setSelectionFill?.("none"), "circle-off");
            row.appendChild(noFill);
            formatRefreshers.push(() => {
                const c = a.getSelectionFill?.();
                fillColor.value = c && /^#[0-9a-f]{6}$/i.test(c) ? c : "#3b82f6";
            });
            if (a.listFillGradientPresets && a.applyFillGradientPreset) {
                const gradBtn = mkBtn(t("ribbon.shapeStyle.gradientLabel"), t("ribbon.shapeStyle.gradient"), () => {
                    openFillGradientPicker(doc, gradBtn, a.listFillGradientPresets(), (id) => {
                        a.applyFillGradientPreset?.(id);
                    });
                }, "chevron-down");
                gradBtn.style.marginLeft = "4px";
                row.appendChild(gradBtn);
            }
        }
        if (a.setSelectionStroke) {
            const strokeColor = doc.createElement("input");
            strokeColor.type = "color";
            strokeColor.className = `ppt-ribbon-swatch ${COLOR_SWATCH_CLASS}`;
            strokeColor.title = t("ribbon.shapeStyle.stroke");
            strokeColor.style.marginRight = "2px";
            strokeColor.addEventListener("change", () => a.setSelectionStroke?.(strokeColor.value));
            row2.appendChild(strokeColor);
            const noStroke = mkBtn("", t("ribbon.shapeStyle.noStroke"), () => a.setSelectionStroke?.("none"), "square-slash");
            row2.appendChild(noStroke);
            if (a.setSelectionStrokeWidth) {
                const w = doc.createElement("input");
                w.type = "number";
                w.min = "0";
                w.step = "0.5";
                w.title = t("ribbon.shapeStyle.strokeWidth");
                w.value = "1";
                styleRibbonField(w, "width:42px;margin-left:4px");
                w.addEventListener("change", () => {
                    const n = Number(w.value);
                    if (Number.isFinite(n) && n >= 0)
                        a.setSelectionStrokeWidth?.(n);
                });
                row2.appendChild(w);
                formatRefreshers.push(() => {
                    const s = a.getSelectionStroke?.();
                    if (s?.width !== undefined)
                        w.value = String(s.width);
                });
            }
            if (a.setSelectionStrokeDash) {
                const dashOptions = [
                    ["solid", t("inspector.dash.solid")],
                    ["dash", t("inspector.dash.dash")],
                    ["dot", t("inspector.dash.dot")],
                    ["dashDot", t("inspector.dash.dashDot")],
                    ["lgDash", t("inspector.dash.lgDash")],
                    ["lgDashDot", t("inspector.dash.lgDashDot")],
                ];
                row2.appendChild(mkChoiceBtn(t("ribbon.shapeStyle.strokeDash"), "minus", dashOptions, (v) => a.setSelectionStrokeDash?.(v), () => a.getSelectionStroke?.()?.dashPreset ?? "solid"));
            }
            if (a.setSelectionLineArrows) {
                const arrowOptions = [
                    ["none", t("ribbon.shapeStyle.arrowNone")],
                    ["head", t("ribbon.shapeStyle.arrowHead")],
                    ["tail", t("ribbon.shapeStyle.arrowTail")],
                    ["both", t("ribbon.shapeStyle.arrowBoth")],
                ];
                const arrowBtn = mkChoiceBtn(t("ribbon.shapeStyle.arrowEnds"), "move-right", arrowOptions, (v) => a.setSelectionLineArrows?.(v), () => a.getSelectionLineArrows?.() ?? "none");
                row2.appendChild(arrowBtn);
                skipSelEnable.add(arrowBtn);
                formatRefreshers.push(() => {
                    setCtlEnabled(arrowBtn, hasSel() && (a.selectionHasLine?.() ?? false));
                });
            }
            formatRefreshers.push(() => {
                const s = a.getSelectionStroke?.();
                const c = s?.color;
                strokeColor.value = c && /^#[0-9a-f]{6}$/i.test(c) ? c : "#1e3a8a";
            });
        }
        enableWhen(Array.from(group.querySelectorAll("button, input")).filter((el) => !skipSelEnable.has(el)), hasSel);
        fmt.appendChild(group);
    }
    if (a.listShapeEffectPresets && a.applyShapeEffectPreset) {
        const { group, row } = mkGroup(t("ribbon.group.shapeEffects"));
        const fxBtn = mkBtn(t("ribbon.shapeEffects.label"), t("ribbon.shapeEffects.hint"), () => {
            openShapeEffectPicker(doc, fxBtn, a.listShapeEffectPresets(), (id) => {
                a.applyShapeEffectPreset?.(id);
            });
        }, "sparkles");
        row.appendChild(fxBtn);
        const clearFx = mkBtn("", t("ribbon.shapeEffects.clear"), () => a.applyShapeEffectPreset?.("none"), "slash");
        row.appendChild(clearFx);
        enableWhen([fxBtn, clearFx], hasSel);
        fmt.appendChild(group);
    }
    {
        const { group, row } = mkGroup(t("ribbon.group.arrange"));
        const grp = mkBtn("", t("ribbon.arrange.group"), () => a.groupSelection?.(), "group");
        const ung = mkBtn("", t("ribbon.arrange.ungroup"), () => a.ungroupSelection?.(), "ungroup");
        row.appendChild(grp);
        row.appendChild(ung);
        formatRefreshers.push(() => {
            setCtlEnabled(grp, selCount() >= 2);
            setCtlEnabled(ung, a.isSelectionGroup?.() ?? false);
        });
        fmt.appendChild(group);
    }
    {
        const { group, row, addRow } = mkGroup(t("ribbon.group.align"));
        const row2 = addRow();
        row.appendChild(mkIconBtn("alignLeft", t("ribbon.align.alignLeft"), () => a.alignSelection?.("left")));
        row.appendChild(mkIconBtn("alignCenterH", t("ribbon.align.alignCenterH"), () => a.alignSelection?.("centerH")));
        row.appendChild(mkIconBtn("alignRight", t("ribbon.align.alignRight"), () => a.alignSelection?.("right")));
        row2.appendChild(mkIconBtn("alignTop", t("ribbon.align.alignTop"), () => a.alignSelection?.("top")));
        row2.appendChild(mkIconBtn("alignCenterV", t("ribbon.align.alignCenterV"), () => a.alignSelection?.("centerV")));
        row2.appendChild(mkIconBtn("alignBottom", t("ribbon.align.alignBottom"), () => a.alignSelection?.("bottom")));
        enableWhen(Array.from(group.querySelectorAll("button")), hasSel);
        fmt.appendChild(group);
    }
    {
        const { group, row } = mkGroup(t("ribbon.group.distribute"));
        row.appendChild(mkIconBtn("distributeH", t("ribbon.distribute.h"), () => a.distributeSelection?.("h")));
        row.appendChild(mkIconBtn("distributeV", t("ribbon.distribute.v"), () => a.distributeSelection?.("v")));
        enableWhen(Array.from(group.querySelectorAll("button")), () => selCount() >= 3);
        fmt.appendChild(group);
    }
    {
        const { group, row, addRow } = mkGroup(t("ribbon.group.flipRotate"));
        const row2 = addRow();
        row.appendChild(mkIconBtn("flipH", t("ribbon.flip.h"), () => a.flipSelection?.("h")));
        row.appendChild(mkIconBtn("flipV", t("ribbon.flip.v"), () => a.flipSelection?.("v")));
        row2.appendChild(mkIconBtn("rotatePlus90", t("ribbon.rotate.plus90"), () => a.rotateSelection?.(90)));
        row2.appendChild(mkIconBtn("rotateMinus90", t("ribbon.rotate.minus90"), () => a.rotateSelection?.(-90)));
        enableWhen(Array.from(group.querySelectorAll("button")), hasSel);
        fmt.appendChild(group);
    }
    {
        const { group, row } = mkGroup(t("ribbon.group.lock"));
        const lockBtn = mkBtn("", t("ribbon.lock.lock"), () => a.lockSelection?.(), "lock");
        const unlockBtn = mkBtn("", t("ribbon.lock.unlock"), () => a.unlockSelection?.(), "lock-open");
        row.appendChild(lockBtn);
        row.appendChild(unlockBtn);
        formatRefreshers.push(() => {
            const n = selCount();
            const locked = isLocked();
            setCtlEnabled(lockBtn, n > 0 && !locked);
            setCtlEnabled(unlockBtn, n > 0 && locked);
        });
        fmt.appendChild(group);
    }
    refreshHandlers.push(() => {
        for (const fn of formatRefreshers)
            fn();
    });
    contentRow.appendChild(fmt);
    tabPanels.set("Format", fmt);
    // ---------- VIEW ----------
    const view = mkPanel();
    const viewRefreshers = [];
    if (a.setPresentationView && a.getPresentationView) {
        const { group, row, addRow } = mkGroup(t("ribbon.group.presentationViews"));
        const row2 = addRow();
        const viewModes = ["normal", "sorter", "outline", "reading", "notesPage"];
        viewModes.forEach((mode, i) => {
            const label = t(PRESENTATION_VIEW_LABEL[mode]);
            const btn = mkBtn(label, label, () => a.setPresentationView(mode), PRESENTATION_VIEW_ICON[mode]);
            viewRefreshers.push(() => {
                const masterOn = (a.isMasterViewOn?.() ?? false) ||
                    (a.isNotesMasterViewOn?.() ?? false) ||
                    (a.isHandoutMasterViewOn?.() ?? false);
                const on = !masterOn && a.getPresentationView?.() === mode;
                btn.style.background = "";
                btn.style.borderColor = "";
                setToggle(btn, on);
            });
            (i < 3 ? row : row2).appendChild(btn);
        });
        view.appendChild(group);
    }
    if (a.toggleMasterView || a.toggleNotesMasterView || a.toggleHandoutMasterView) {
        const { group, row } = mkGroup(t("ribbon.group.masterViews"));
        if (a.toggleMasterView) {
            row.appendChild(mkToggleBtn(t("ribbon.show.masterViewLabel"), t("ribbon.show.masterView"), () => a.isMasterViewOn?.() ?? false, () => {
                a.toggleMasterView?.();
                refresh();
            }));
        }
        if (a.toggleHandoutMasterView) {
            row.appendChild(mkToggleBtn(t("ribbon.show.handoutMasterLabel"), t("ribbon.show.handoutMaster"), () => a.isHandoutMasterViewOn?.() ?? false, () => {
                a.toggleHandoutMasterView?.();
                refresh();
            }));
        }
        if (a.toggleNotesMasterView) {
            row.appendChild(mkToggleBtn(t("ribbon.show.notesMasterLabel"), t("ribbon.show.notesMaster"), () => a.isNotesMasterViewOn?.() ?? false, () => {
                a.toggleNotesMasterView?.();
                refresh();
            }));
        }
        if (a.getMasterOutline && a.setMasterTarget && a.isMasterViewOn) {
            const masterBtn = mkBtn("", t("ribbon.show.masterTarget"), () => {
                const outline = a.getMasterOutline?.() ?? [];
                const cur = a.getMasterTarget?.();
                const curVal = cur ? (cur.layoutId ? `${cur.masterId}\u0000${cur.layoutId}` : cur.masterId) : "";
                const items = [];
                for (const m of outline) {
                    items.push({ value: m.masterId, label: `${m.name} (${t("ribbon.show.masterBody")})` });
                    for (const l of m.layouts) {
                        items.push({ value: `${m.masterId}\u0000${l.id}`, label: ` ${l.name}` });
                    }
                }
                openChoiceMenu(doc, masterBtn, items, (v) => {
                    const [masterId, layoutId] = v.split("\u0000");
                    if (masterId)
                        a.setMasterTarget(masterId, layoutId || undefined);
                }, curVal);
            }, "layout-dashboard");
            row.appendChild(masterBtn);
            const syncMasterBtn = () => {
                masterBtn.style.display = a.isMasterViewOn?.() ? "" : "none";
            };
            refreshHandlers.push(syncMasterBtn);
            syncMasterBtn();
        }
        view.appendChild(group);
    }
    {
        const { group, row, addRow } = mkGroup(t("ribbon.group.zoom"));
        const row2 = addRow();
        row.appendChild(mkBtn(t("ribbon.zoom.fit"), t("ribbon.zoom.fit"), () => a.setZoom("fit")));
        row.appendChild(mkBtn("50%", "50%", () => a.setZoom(0.5)));
        row.appendChild(mkBtn("100%", "100%", () => a.setZoom(1)));
        row2.appendChild(mkBtn("150%", "150%", () => a.setZoom(1.5)));
        row2.appendChild(mkBtn("200%", "200%", () => a.setZoom(2)));
        view.appendChild(group);
    }
    if (a.setColorViewMode && a.getColorViewMode) {
        const { group, row } = mkGroup(t("ribbon.group.colorView"));
        const colorModes = [
            ["color", t("ribbon.view.color"), "palette"],
            ["grayscale", t("ribbon.view.grayscale"), "contrast"],
            ["blackWhite", t("ribbon.view.blackWhite"), "moon"],
        ];
        for (const [mode, label, icon] of colorModes) {
            const btn = mkBtn(label, label, () => a.setColorViewMode(mode), icon);
            viewRefreshers.push(() => {
                const on = a.getColorViewMode?.() === mode;
                btn.style.background = "";
                btn.style.borderColor = "";
                setToggle(btn, on);
            });
            row.appendChild(btn);
        }
        view.appendChild(group);
    }
    {
        const { group, row, addRow } = mkGroup(t("ribbon.group.show"));
        const row2 = addRow();
        row.appendChild(mkToggleBtn(t("ribbon.show.gridLabel"), t("ribbon.show.grid"), () => a.isGridOn?.() ?? false, () => {
            a.toggleGrid();
        }));
        if (a.toggleRulers) {
            row.appendChild(mkToggleBtn(t("ribbon.show.rulersLabel"), t("ribbon.show.rulers"), () => a.isRulersOn?.() ?? false, () => {
                a.toggleRulers?.();
            }));
        }
        if (a.toggleGuides) {
            row.appendChild(mkToggleBtn(t("ribbon.show.guidesLabel"), t("ribbon.show.guides"), () => a.isGuidesOn?.() ?? false, () => {
                a.toggleGuides?.();
            }));
        }
        if (a.toggleNotes) {
            let notesOn = a.isNotesOn?.() ?? false;
            row2.appendChild(mkToggleBtn(t("ribbon.show.notesLabel"), t("ribbon.show.notes"), () => notesOn, () => {
                notesOn = a.toggleNotes?.() ?? !notesOn;
            }));
        }
        view.appendChild(group);
    }
    if (a.toggleSnapGrid || a.toggleSnapShapes) {
        const { group, row } = mkGroup(t("ribbon.group.snap"));
        if (a.toggleSnapGrid) {
            let snapG = a.isSnapGridOn?.() ?? false;
            row.appendChild(mkToggleBtn(t("ribbon.snap.gridLabel"), t("ribbon.snap.grid"), () => snapG, () => {
                snapG = a.toggleSnapGrid?.() ?? !snapG;
            }));
        }
        if (a.toggleSnapShapes) {
            let snapS = a.isSnapShapesOn?.() ?? true;
            row.appendChild(mkToggleBtn(t("ribbon.snap.shapesLabel"), t("ribbon.snap.shapes"), () => snapS, () => {
                snapS = a.toggleSnapShapes?.() ?? !snapS;
            }));
        }
        view.appendChild(group);
    }
    if (a.openNewWindow || a.closeAllAuxWindows || a.focusAuxWindow || a.arrangeAllWindows || a.arrangeSideBySideWindows || a.arrangeStackedWindows || a.cascadeWindows) {
        const { group, row, addRow } = mkGroup(t("ribbon.group.window"));
        const row2 = addRow();
        if (a.openNewWindow) {
            row.appendChild(mkBtn(t("ribbon.view.newWindowLabel"), t("ribbon.view.newWindow"), () => a.openNewWindow?.(), "square-stack"));
        }
        if (a.focusAuxWindow) {
            row.appendChild(mkBtn(t("ribbon.view.focusAuxLabel"), t("ribbon.view.focusAux"), () => a.focusAuxWindow?.(), "bring-to-front"));
        }
        if (a.closeAllAuxWindows) {
            row.appendChild(mkBtn(t("ribbon.view.closeAllAuxLabel"), t("ribbon.view.closeAllAux"), () => a.closeAllAuxWindows?.(), "panel-right-close"));
        }
        if (a.arrangeAllWindows) {
            row2.appendChild(mkBtn(t("ribbon.view.arrangeAllLabel"), t("ribbon.view.arrangeAll"), () => a.arrangeAllWindows?.(), "squares-unite"));
        }
        if (a.arrangeSideBySideWindows) {
            row2.appendChild(mkBtn(t("ribbon.view.sideBySideLabel"), t("ribbon.view.sideBySide"), () => a.arrangeSideBySideWindows?.(), "columns-2"));
        }
        if (a.arrangeStackedWindows) {
            row2.appendChild(mkBtn(t("ribbon.view.stackedLabel"), t("ribbon.view.stacked"), () => a.arrangeStackedWindows?.(), "rows-2"));
        }
        if (a.cascadeWindows) {
            row2.appendChild(mkBtn(t("ribbon.view.cascadeLabel"), t("ribbon.view.cascade"), () => a.cascadeWindows?.(), "gallery-horizontal-end"));
        }
        view.appendChild(group);
    }
    if (a.openVbaInfo && a.hasVbaProject?.()) {
        const { group, row } = mkGroup(t("ribbon.group.macros"));
        row.appendChild(mkBtn(t("ribbon.view.vbaInfoLabel"), t("ribbon.view.vbaInfo"), () => a.openVbaInfo?.(), "file-code"));
        view.appendChild(group);
    }
    if (a.openEditorPlugins) {
        const { group, row } = mkGroup(t("ribbon.group.editorPlugins"));
        const pluginsBtn = doc.createElement("button");
        pluginsBtn.className = "ppt-ribbon-btn";
        pluginsBtn.style.cssText =
            "padding:4px 10px;min-width:30px;display:inline-flex;align-items:center;gap:6px";
        pluginsBtn.title = t("ribbon.editorPlugins.button");
        pluginsBtn.setAttribute("aria-label", t("ribbon.editorPlugins.button"));
        appendLabelWithIcon(doc, pluginsBtn, "puzzle", t("ribbon.editorPlugins.label"), 14);
        const badge = doc.createElement("span");
        badge.style.cssText =
            "background:var(--primary);color:#fff;border-radius:9px;padding:1px 6px;font-size:10px;line-height:14px;min-width:14px;text-align:center";
        pluginsBtn.appendChild(badge);
        pluginsBtn.addEventListener("click", () => {
            a.openEditorPlugins?.(pluginsBtn);
            pluginsBtn.blur();
        });
        refreshHandlers.push(() => {
            const n = a.editorPluginCount?.() ?? 0;
            badge.textContent = String(n);
            badge.style.display = n > 0 ? "inline-block" : "none";
        });
        row.appendChild(pluginsBtn);
        view.appendChild(group);
    }
    // 「放映插件」已从 View tab 迁移到独立的 Slideshow tab（见下方 ---------- SLIDESHOW ----------）。
    // Panel toggles：让用户隐藏右侧属性/动画栏 或 底部时间轴，以释放舞台空间。
    if (a.togglePropertiesPanel || a.toggleTimelinePanel) {
        const { group, row } = mkGroup(t("ribbon.group.panels"));
        if (a.togglePropertiesPanel) {
            row.appendChild(mkToggleBtn(t("ribbon.panels.propertiesLabel"), t("ribbon.panels.properties"), () => a.isPropertiesPanelOpen?.() ?? true, () => {
                a.togglePropertiesPanel?.();
            }));
        }
        if (a.toggleTimelinePanel) {
            // 底部停靠栏（时间轴 / 备注 tab 共享）整体显隐。tab 切换交给 dock 内部，
            // 这里只读 live 的 dockOpen 状态。
            row.appendChild(mkToggleBtn(t("ribbon.panels.dockLabel"), t("ribbon.panels.dock"), () => a.isTimelinePanelOpen?.() ?? false, () => {
                a.toggleTimelinePanel?.();
            }));
        }
        view.appendChild(group);
    }
    refreshHandlers.push(() => {
        for (const fn of viewRefreshers)
            fn();
    });
    contentRow.appendChild(view);
    tabPanels.set("View", view);
    // ---------- REVIEW ----------
    const review = mkPanel();
    if (a.newComment || a.toggleComments || a.resolveSlideComments || a.reopenSlideComments) {
        const { group, row } = mkGroup(t("ribbon.group.comments"));
        if (a.newComment) {
            row.appendChild(mkBtn(t("ribbon.review.newCommentLabel"), t("ribbon.review.newComment"), () => a.newComment?.()));
        }
        if (a.resolveSlideComments) {
            const resolveBtn = mkBtn(t("ribbon.review.resolveSlideCommentsLabel"), t("ribbon.review.resolveSlideComments"), () => {
                if (a.hasOpenSlideComments && !a.hasOpenSlideComments())
                    return;
                a.resolveSlideComments?.();
            }, "check-check");
            row.appendChild(resolveBtn);
            enableWhen([resolveBtn], () => a.hasOpenSlideComments?.() ?? false);
        }
        if (a.reopenSlideComments) {
            const reopenBtn = mkBtn(t("ribbon.review.reopenSlideCommentsLabel"), t("ribbon.review.reopenSlideComments"), () => {
                if (a.hasResolvedSlideComments && !a.hasResolvedSlideComments())
                    return;
                a.reopenSlideComments?.();
            }, "rotate-ccw");
            row.appendChild(reopenBtn);
            enableWhen([reopenBtn], () => a.hasResolvedSlideComments?.() ?? false);
        }
        review.appendChild(group);
    }
    if (a.checkAccessibility || a.toggleSpelling || a.openThesaurus || a.openSmartLookup || a.openTranslate || a.openProofingLanguage || a.openCompare) {
        const { group, row, addRow } = mkGroup(t("ribbon.group.proofing"));
        const row2 = addRow();
        if (a.checkAccessibility) {
            row.appendChild(mkBtn(t("ribbon.review.checkAccessibilityLabel"), t("ribbon.review.checkAccessibility"), () => a.checkAccessibility?.()));
        }
        if (a.toggleSpelling) {
            let spellingOn = a.isSpellingOn?.() ?? false;
            row.appendChild(mkToggleBtn(t("ribbon.review.spellingLabel"), t("ribbon.review.spelling"), () => spellingOn, () => {
                spellingOn = a.toggleSpelling?.() ?? !spellingOn;
            }));
            refreshHandlers.push(() => {
                spellingOn = a.isSpellingOn?.() ?? spellingOn;
            });
        }
        if (a.openThesaurus) {
            row.appendChild(mkBtn(t("ribbon.review.thesaurusLabel"), t("ribbon.review.thesaurus"), () => a.openThesaurus?.()));
        }
        if (a.openSmartLookup) {
            row.appendChild(mkBtn(t("ribbon.review.smartLookupLabel"), t("ribbon.review.smartLookup"), () => a.openSmartLookup?.()));
        }
        if (a.openTranslate) {
            row2.appendChild(mkBtn(t("ribbon.review.translateLabel"), t("ribbon.review.translate"), () => a.openTranslate?.()));
        }
        if (a.openProofingLanguage) {
            row2.appendChild(mkBtn(t("ribbon.review.languageLabel"), t("ribbon.review.language"), () => a.openProofingLanguage?.()));
        }
        if (a.openCompare) {
            row.appendChild(mkBtn(t("ribbon.review.compareLabel"), t("ribbon.review.compare"), () => a.openCompare?.()));
        }
        review.appendChild(group);
    }
    if (a.openProtect) {
        const { group, row } = mkGroup(t("ribbon.group.protect"));
        row.appendChild(mkToggleBtn(t("ribbon.review.protectLabel"), t("ribbon.review.protect"), () => a.isProtected?.() ?? false, () => a.openProtect?.()));
        review.appendChild(group);
    }
    contentRow.appendChild(review);
    tabPanels.set("Review", review);
    // ---------- HELP ----------
    if (a.openHelp || a.openFeedback || a.openTraining || a.openEditorTour) {
        const help = mkPanel();
        const { group, row } = mkGroup(t("ribbon.group.help"));
        if (a.openEditorTour) {
            row.appendChild(mkBtn(t("ribbon.help.tourLabel"), t("ribbon.help.tour"), () => a.openEditorTour?.(), "map"));
        }
        if (a.openHelp) {
            row.appendChild(mkBtn(t("ribbon.help.helpLabel"), t("ribbon.help.help"), () => a.openHelp?.(), "circle-help"));
        }
        if (a.openFeedback) {
            row.appendChild(mkBtn(t("ribbon.help.feedbackLabel"), t("ribbon.help.feedback"), () => a.openFeedback?.(), "message-circle"));
        }
        if (a.openTraining) {
            row.appendChild(mkBtn(t("ribbon.help.trainingLabel"), t("ribbon.help.training"), () => a.openTraining?.(), "graduation-cap"));
        }
        help.appendChild(group);
        contentRow.appendChild(help);
        tabPanels.set("Help", help);
    }
    else {
        const btn = tabBtns.get("Help");
        if (btn)
            btn.style.display = "none";
    }
    // ---------- SLIDESHOW ----------
    // 「放映」tab：聚合所有放映入口（从头 / 从当前 / 窗口）和放映期相关的设置
    // （插件勾选、监视器选项等）。不依赖具体 player 实现 —— 三个入口都是宿主
    // 在 mountEditor 时注入的回调；缺失对应回调时按钮自动隐藏。
    const slideshow = mkPanel();
    {
        const { group, row } = mkGroup(t("ribbon.group.startShow"));
        if (a.startSlideshowFromBeginning) {
            row.appendChild(mkBtn(t("ribbon.slideshow.fromBeginningLabel"), t("ribbon.slideshow.fromBeginning"), () => a.startSlideshowFromBeginning?.(), "play"));
        }
        if (a.startSlideshowFromCurrent) {
            row.appendChild(mkBtn(t("ribbon.slideshow.fromCurrentLabel"), t("ribbon.slideshow.fromCurrent"), () => a.startSlideshowFromCurrent?.(), "skip-forward"));
        }
        slideshow.appendChild(group);
    }
    // 放映期行为开关：窗口模式 / 循环 / 隐藏当前页。都通过宿主提供的 get/set 闭包
    // 驱动，ribbon 不持有任何状态，刷新时通过 refreshHandlers 同步显示。
    if (a.toggleWindowedMode || a.toggleSlideshowLoop || a.toggleCurrentSlideHidden || a.togglePresenterView || a.toggleSlideshowUseTimings || a.toggleSlideshowPlayNarrations) {
        const { group, row, addRow } = mkGroup(t("ribbon.group.options"));
        const row2 = addRow();
        if (a.togglePresenterView) {
            row.appendChild(mkToggleBtn(t("ribbon.slideshow.presenterLabel"), t("ribbon.slideshow.presenter"), () => a.isPresenterViewOn?.() ?? false, () => {
                a.togglePresenterView?.();
            }));
        }
        if (a.toggleWindowedMode) {
            row.appendChild(mkToggleBtn(t("ribbon.slideshow.windowedLabel"), t("ribbon.slideshow.windowed"), () => a.isWindowedModeOn?.() ?? false, () => {
                a.toggleWindowedMode?.();
            }));
        }
        if (a.toggleSlideshowLoop) {
            row.appendChild(mkToggleBtn(t("ribbon.slideshow.loopLabel"), t("ribbon.slideshow.loop"), () => a.isSlideshowLoopOn?.() ?? false, () => {
                a.toggleSlideshowLoop?.();
            }));
        }
        if (a.toggleCurrentSlideHidden) {
            // 隐藏当前页的状态会随 slide 切换而变化（不同 slide 各自有 show 字段），
            // 所以这里直接每次从回调里取，再放到 refreshHandlers 里跟着 selection /
            // stack 变化一并 sync，确保切到不同 slide 时按钮状态对得上。
            row2.appendChild(mkToggleBtn(t("ribbon.slideshow.hideSlideLabel"), t("ribbon.slideshow.hideSlide"), () => a.isCurrentSlideHidden?.() ?? false, () => {
                a.toggleCurrentSlideHidden?.();
            }));
        }
        if (a.toggleSlideshowUseTimings) {
            row2.appendChild(mkToggleBtn(t("ribbon.slideshow.useTimingsLabel"), t("ribbon.slideshow.useTimings"), () => a.isSlideshowUseTimingsOn?.() ?? false, () => {
                a.toggleSlideshowUseTimings?.();
            }));
        }
        if (a.toggleSlideshowPlayNarrations) {
            row2.appendChild(mkToggleBtn(t("ribbon.slideshow.playNarrationsLabel"), t("ribbon.slideshow.playNarrations"), () => a.isSlideshowPlayNarrationsOn?.() ?? false, () => {
                a.toggleSlideshowPlayNarrations?.();
            }));
        }
        slideshow.appendChild(group);
    }
    if (a.openCustomShow || a.startRehearseTimings) {
        const { group, row } = mkGroup(t("ribbon.group.customShow"));
        if (a.openCustomShow) {
            row.appendChild(mkBtn(t("ribbon.slideshow.customShowLabel"), t("ribbon.slideshow.customShow"), () => a.openCustomShow(), "folder-kanban"));
        }
        if (a.startRehearseTimings) {
            row.appendChild(mkBtn(t("ribbon.slideshow.rehearseLabel"), t("ribbon.slideshow.rehearse"), () => a.startRehearseTimings(), "timer"));
        }
        if (a.startRecordSlideShowFromBeginning || a.startRecordSlideShowFromCurrent) {
            row.appendChild(mkBtn(t("ribbon.slideshow.recordLabel"), t("ribbon.slideshow.record"), () => a.startRecordSlideShowFromCurrent?.() ?? a.startRecordSlideShowFromBeginning?.(), "mic"));
        }
        slideshow.appendChild(group);
    }
    if (a.openSetupSlideShow) {
        const { group, row } = mkGroup(t("ribbon.group.setupShow"));
        row.appendChild(mkBtn(t("ribbon.slideshow.setupLabel"), t("ribbon.slideshow.setup"), () => a.openSetupSlideShow(), "presentation"));
        slideshow.appendChild(group);
    }
    if (a.openPlaybackPlugins) {
        const { group, row } = mkGroup(t("ribbon.group.playbackPlugins"));
        const pluginsBtn = doc.createElement("button");
        pluginsBtn.className = "ppt-ribbon-btn";
        pluginsBtn.style.cssText =
            "padding:4px 10px;min-width:30px;display:inline-flex;align-items:center;gap:6px";
        pluginsBtn.title = t("ribbon.playbackPlugins.button");
        pluginsBtn.setAttribute("aria-label", t("ribbon.playbackPlugins.button"));
        appendLabelWithIcon(doc, pluginsBtn, "puzzle", t("ribbon.playbackPlugins.label"), 14);
        const badge = doc.createElement("span");
        badge.style.cssText =
            "background:var(--primary);color:#fff;border-radius:9px;padding:1px 6px;font-size:10px;line-height:14px;min-width:14px;text-align:center";
        pluginsBtn.appendChild(badge);
        pluginsBtn.addEventListener("click", () => {
            a.openPlaybackPlugins?.(pluginsBtn);
            pluginsBtn.blur();
        });
        refreshHandlers.push(() => {
            const n = a.playbackPluginCount?.() ?? 0;
            badge.textContent = String(n);
            badge.style.display = n > 0 ? "inline-block" : "none";
        });
        row.appendChild(pluginsBtn);
        slideshow.appendChild(group);
    }
    contentRow.appendChild(slideshow);
    tabPanels.set("Slideshow", slideshow);
    // ---------- EXPERIMENTAL ----------
    const hasExperimentalActions = !!a.openCollab ||
        !!a.startLiveSlideshow ||
        !!a.openRecordDialog ||
        !!a.saveAsVideo ||
        !!a.startRecordSlideShowFromBeginning ||
        !!a.startRecordSlideShowFromCurrent;
    if (hasExperimentalActions) {
        const experimental = mkPanel();
        if (a.openCollab) {
            const { group, row } = mkGroup(t("ribbon.group.cloud"));
            row.appendChild(mkBtn(t("ribbon.file.collabLabel"), t("ribbon.file.collab"), () => a.openCollab?.(), "users"));
            experimental.appendChild(group);
        }
        if (a.startLiveSlideshow) {
            const { group, row } = mkGroup(t("ribbon.group.startShow"));
            row.appendChild(mkBtn(t("ribbon.slideshow.livePresentLabel"), t("ribbon.slideshow.livePresent"), () => a.startLiveSlideshow?.(), "radio"));
            experimental.appendChild(group);
        }
        if (a.startRecordSlideShowFromBeginning || a.startRecordSlideShowFromCurrent) {
            const { group, row } = mkGroup(t("ribbon.group.recordShow"));
            if (a.startRecordSlideShowFromBeginning) {
                row.appendChild(mkBtn(t("ribbon.record.fromBeginningLabel"), t("ribbon.record.fromBeginning"), () => a.startRecordSlideShowFromBeginning(), "mic"));
            }
            if (a.startRecordSlideShowFromCurrent) {
                row.appendChild(mkBtn(t("ribbon.record.fromCurrentLabel"), t("ribbon.record.fromCurrent"), () => a.startRecordSlideShowFromCurrent(), "mic-vocal"));
            }
            experimental.appendChild(group);
        }
        if (a.saveAsVideo) {
            const { group, row } = mkGroup(t("ribbon.group.exportVideo"));
            row.appendChild(mkBtn(t("ribbon.record.saveVideoLabel"), t("ribbon.record.saveVideo"), () => a.saveAsVideo(), "film"));
            experimental.appendChild(group);
        }
        if (a.openRecordDialog) {
            const { group, row } = mkGroup(t("ribbon.group.recordMedia"));
            row.appendChild(mkBtn(t("ribbon.record.mediaLabel"), t("ribbon.record.media"), () => a.openRecordDialog(), "webcam"));
            experimental.appendChild(group);
        }
        contentRow.appendChild(experimental);
        tabPanels.set("Experimental", experimental);
    }
    else {
        const btn = tabBtns.get("Experimental");
        if (btn)
            btn.style.display = "none";
    }
    // ---------- FILE ----------
    // 仅当至少有一个 File 钩子被传入时才显示 File tab —— 没有 saveAs / openFile /
    // newPresentation 也没有 print 时（例如纯只读演示），就把 File 标签从 tabRow
    // 中隐藏，而不是渲染一个全是空 op 的死面板。
    const hasFileActions = !!(a.save ||
        a.saveAs ||
        a.openFile ||
        a.openRecent ||
        a.newPresentation ||
        a.print ||
        a.share ||
        a.openAccount ||
        a.openOptions ||
        a.openEmbedFonts ||
        a.openProtect);
    if (hasFileActions) {
        const fileTab = mkPanel();
        // 把 File tab 拆成独立 group（导出 HTML/PDF/PNG 仅在顶栏 output-split，避免重复）：
        //   ① 文件 (新建 + 打开)
        //   ② 保存 (.pptx)
        //   ③ 打印
        if (a.newPresentation || a.openFile || a.openRecent) {
            const { group, row } = mkGroup(t("ribbon.group.file"));
            if (a.newPresentation)
                row.appendChild(mkBtn(t("ribbon.file.newLabel"), t("ribbon.file.new"), () => a.newPresentation?.()));
            if (a.openFile)
                row.appendChild(mkBtn(t("ribbon.file.openLabel"), t("ribbon.file.open"), () => a.openFile?.()));
            if (a.openRecent)
                row.appendChild(mkBtn(t("ribbon.file.recentLabel"), t("ribbon.file.recent"), () => a.openRecent?.()));
            fileTab.appendChild(group);
        }
        if (a.save || a.saveAs || a.openEmbedFonts) {
            const { group, row } = mkGroup(t("ribbon.group.save"));
            if (a.save) {
                row.appendChild(mkBtn(t("ribbon.file.saveLabel"), t("ribbon.file.save"), () => a.save?.()));
            }
            if (a.saveAs) {
                row.appendChild(mkBtn(t("ribbon.file.saveAsLabel"), t("ribbon.file.savePptx"), () => a.saveAs?.("pptx")));
                const exportBtn = mkBtn(t("toolbar.export"), t("toolbar.exportHint"), () => openExportChrome(exportBtn), "download");
                exportBtn.setAttribute("aria-haspopup", "dialog");
                exportBtn.dataset.pptFileExport = "1";
                row.appendChild(exportBtn);
            }
            if (a.openEmbedFonts) {
                row.appendChild(mkBtn(t("ribbon.file.embedFontsLabel"), t("ribbon.file.embedFonts"), () => a.openEmbedFonts?.(), "a-large-small"));
            }
            fileTab.appendChild(group);
        }
        if (a.print) {
            const { group, row } = mkGroup(t("ribbon.group.print"));
            row.appendChild(mkBtn(t("ribbon.file.printLabel"), t("ribbon.file.print"), () => a.print?.()));
            fileTab.appendChild(group);
        }
        if (a.share && (a.isShareAvailable?.() ?? true)) {
            const { group, row } = mkGroup(t("ribbon.group.share"));
            row.appendChild(mkBtn(t("ribbon.file.shareLabel"), t("ribbon.file.share"), () => a.share?.(), "share-2"));
            fileTab.appendChild(group);
        }
        if (a.openProtect) {
            const { group, row } = mkGroup(t("ribbon.group.protect"));
            row.appendChild(mkToggleBtn(t("ribbon.file.protectLabel"), t("ribbon.file.protect"), () => a.isProtected?.() ?? false, () => a.openProtect?.()));
            fileTab.appendChild(group);
        }
        if (a.openOptions || a.openAccount) {
            const { group, row } = mkGroup(t("ribbon.group.options"));
            if (a.openAccount) {
                row.appendChild(mkBtn(t("ribbon.file.accountLabel"), t("ribbon.file.account"), () => a.openAccount?.(), "circle-user"));
            }
            if (a.openOptions) {
                row.appendChild(mkBtn(t("ribbon.file.optionsLabel"), t("ribbon.file.options"), () => a.openOptions?.(), "settings-2"));
            }
            fileTab.appendChild(group);
        }
        contentRow.appendChild(fileTab);
        tabPanels.set("File", fileTab);
    }
    else {
        // 同步隐藏 tab 按钮。
        const btn = tabBtns.get("File");
        if (btn)
            btn.style.display = "none";
    }
    // 顶栏：Undo · Redo | Share（主题在「外观与对象」，导出在「文件」）；L|C|R 槽位。
    const topLeft = doc.createElement("div");
    topLeft.className = "ppt-topbar-left";
    topLeft.dataset.pptTopbarLeft = "1";
    const topCenter = doc.createElement("div");
    topCenter.className = "ppt-topbar-center";
    topCenter.dataset.pptTopbarCenter = "1";
    const topRight = doc.createElement("div");
    topRight.className = "ppt-topbar-right";
    topRight.dataset.pptTopbarRight = "1";
    cluster.append(topLeft, topCenter, topRight);
    const slideCountEl = doc.createElement("span");
    slideCountEl.className = "ppt-topbar-slide-count";
    slideCountEl.dataset.pptTopbarSlideCount = "1";
    topCenter.appendChild(slideCountEl);
    refreshHandlers.push(() => {
        const total = a.getSlideCount?.() ?? 0;
        if (total <= 0) {
            slideCountEl.textContent = "";
            return;
        }
        slideCountEl.textContent = t("editor.status.slide", {
            current: (a.getSlideIndex?.() ?? 0) + 1,
            total,
        });
    });
    const undoBtn = mkLucideIconButton(doc, "undo-2", "", t("toolbar.undo"), 16);
    undoBtn.className = "ppt-topbar-icon-btn";
    undoBtn.addEventListener("click", () => runRibbonCommand(a.undo));
    const redoBtn = mkLucideIconButton(doc, "redo-2", "", t("toolbar.redo"), 16);
    redoBtn.className = "ppt-topbar-icon-btn";
    redoBtn.addEventListener("click", () => runRibbonCommand(a.redo));
    refreshHandlers.push(() => {
        undoBtn.disabled = a.canUndo ? !a.canUndo() : false;
        redoBtn.disabled = a.canRedo ? !a.canRedo() : false;
    });
    topRight.append(undoBtn, redoBtn);
    if (a.share) {
        addShareSep(topRight);
        const shareBtn = mkTopBtn(t("toolbar.share"), t("toolbar.shareHint"), "share-2");
        shareBtn.classList.add("ppt-topbar-btn--share");
        refreshHandlers.push(() => {
            shareBtn.style.display = a.isShareAvailable && !a.isShareAvailable() ? "none" : "";
        });
        shareBtn.addEventListener("click", () => openShareChrome());
        topRight.appendChild(shareBtn);
    }
    if (a.close) {
        const x = mkLucideIconButton(doc, "x", "", t("editor.toolbar.exit"), 14);
        x.className = "ppt-topbar-icon-btn";
        x.style.color = "var(--destructive)";
        x.addEventListener("click", () => a.close?.());
        topRight.appendChild(x);
    }
    const zoomRefreshers = [];
    const refreshZoom = () => {
        for (const fn of zoomRefreshers)
            fn();
    };
    const mkBarIcon = (icon, label, run) => {
        const b = mkLucideIconButton(doc, icon, "ppt-view-bar-btn", label, 16);
        b.addEventListener("click", () => runRibbonCommand(run));
        return b;
    };
    // 视图条：左段是视图切换和标尺 · 参考线 · 网格，右段是放映 · 明暗 · 属性栏。缩放在状态栏右端。
    const viewBar = doc.createElement("div");
    viewBar.className = "ppt-view-bar";
    viewBar.dataset.pptViewBar = "1";
    viewBar.setAttribute("role", "toolbar");
    viewBar.setAttribute("aria-label", t("toolbar.view.label"));
    const viewLeft = doc.createElement("div");
    viewLeft.className = "ppt-view-bar-left";
    const viewRight = doc.createElement("div");
    viewRight.className = "ppt-view-bar-right";
    const viewCenter = doc.createElement("div");
    viewCenter.className = "ppt-view-bar-center";
    viewCenter.dataset.pptViewBarShow = "1";
    viewCenter.setAttribute("role", "group");
    viewCenter.setAttribute("aria-label", t("ribbon.group.show"));
    const addShowAid = (icon, label, dataKey, isOn, toggle) => {
        const b = mkBarIcon(icon, t(label), toggle);
        b.dataset[dataKey] = "1";
        refreshHandlers.push(() => {
            b.setAttribute("aria-pressed", isOn() ? "true" : "false");
        });
        viewCenter.appendChild(b);
        return b;
    };
    const bindAidColor = (btn, labelKey, getColor, setColor, getOpacity, setOpacity, resetColor, fallback) => {
        btn.addEventListener("contextmenu", (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            openAidColorPopover(doc, {
                anchor: btn,
                label: t(labelKey),
                resetLabel: t("ribbon.show.aidColorReset"),
                value: getColor(),
                fallback,
                onColor: setColor,
                opacityLabel: t("ribbon.show.aidOpacity"),
                opacity: getOpacity(),
                opacityFallback: DEFAULT_AID_OPACITY,
                onOpacity: setOpacity,
                onReset: resetColor,
            });
        });
    };
    if (a.toggleRulers) {
        addShowAid("ruler", "ribbon.show.rulers", "viewBarRulers", () => a.isRulersOn?.() ?? false, () => {
            a.toggleRulers?.();
        });
    }
    if (a.toggleGuides) {
        const guidesBtn = addShowAid("crosshair", "ribbon.show.guides", "viewBarGuides", () => a.isGuidesOn?.() ?? false, () => {
            a.toggleGuides?.();
        });
        if (guidesBtn && a.getGuideAidColor && a.setGuideAidColor && a.resetGuideAidColor) {
            bindAidColor(guidesBtn, "ribbon.show.guideColor", () => a.getGuideAidColor?.() ?? DEFAULT_GUIDE_AID_COLOR, (color) => a.setGuideAidColor?.(color), () => a.getGuideAidOpacity?.() ?? DEFAULT_AID_OPACITY, (opacity) => a.setGuideAidOpacity?.(opacity), () => a.resetGuideAidColor?.(), DEFAULT_GUIDE_AID_COLOR);
        }
    }
    const gridBtn = addShowAid("grid-3x3", "ribbon.show.grid", "viewBarGrid", () => a.isGridOn?.() ?? false, () => {
        a.toggleGrid();
    });
    if (gridBtn && a.getGridAidColor && a.setGridAidColor && a.resetGridAidColor) {
        bindAidColor(gridBtn, "ribbon.show.gridColor", () => a.getGridAidColor?.() ?? DEFAULT_GRID_AID_COLOR, (color) => a.setGridAidColor?.(color), () => a.getGridAidOpacity?.() ?? DEFAULT_AID_OPACITY, (opacity) => a.setGridAidOpacity?.(opacity), () => a.resetGridAidColor?.(), DEFAULT_GRID_AID_COLOR);
    }
    refreshHandlers.push(() => {
        viewCenter.hidden = (a.getPresentationView?.() ?? "normal") !== "normal";
    });
    viewBar.append(viewLeft, viewRight);
    if (a.setPresentationView && a.getPresentationView) {
        const seg = doc.createElement("div");
        seg.className = "ppt-view-seg";
        seg.setAttribute("role", "group");
        seg.setAttribute("aria-label", t("ribbon.group.presentationViews"));
        const segModes = ["normal", "sorter", "reading"];
        for (const mode of segModes) {
            const b = mkBarIcon(PRESENTATION_VIEW_ICON[mode], t(PRESENTATION_VIEW_LABEL[mode]), () => a.setPresentationView?.(mode));
            b.dataset.viewMode = mode;
            refreshHandlers.push(() => {
                b.setAttribute("aria-pressed", a.getPresentationView?.() === mode ? "true" : "false");
            });
            seg.appendChild(b);
        }
        viewLeft.appendChild(seg);
    }
    viewLeft.appendChild(viewCenter);
    const fromStart = a.startSlideshowFromBeginning;
    const fromCurrent = a.startSlideshowFromCurrent;
    if (fromStart || fromCurrent) {
        const modes = [];
        if (fromStart) {
            modes.push({
                id: "beginning",
                icon: "play",
                label: "ribbon.slideshow.fromBeginningLabel",
                hint: "ribbon.slideshow.fromBeginning",
                run: fromStart,
            });
        }
        if (fromCurrent) {
            modes.push({
                id: "current",
                icon: "skip-forward",
                label: "ribbon.slideshow.fromCurrentLabel",
                hint: "ribbon.slideshow.fromCurrent",
                run: fromCurrent,
            });
        }
        let playStart = modes[0].id;
        const activeMode = () => modes.find((mode) => mode.id === playStart) ?? modes[0];
        const play = doc.createElement("div");
        play.className = "ppt-view-bar-play";
        play.setAttribute("role", "group");
        const main = mkLucideIconButton(doc, activeMode().icon, "ppt-view-bar-btn ppt-view-bar-play-main", t(activeMode().hint), 16);
        main.dataset.viewBarPlay = "1";
        const syncPlayBtn = () => {
            const mode = activeMode();
            const label = t(mode.hint);
            fillLucideIcon(doc, main, mode.icon, 16);
            main.title = label;
            main.setAttribute("aria-label", label);
            if (main.hasAttribute("data-ppt-tip"))
                main.setAttribute("data-ppt-tip", label);
            play.setAttribute("aria-label", label);
        };
        syncPlayBtn();
        main.addEventListener("click", () => {
            closeToolbarPopover();
            runRibbonCommand(() => activeMode().run());
        });
        play.appendChild(main);
        if (modes.length > 1) {
            const more = mkLucideIconButton(doc, "chevron-down", "ppt-view-bar-btn ppt-view-bar-play-more", t("toolbar.view.presentMenu"), 12);
            more.dataset.viewBarPlayMenu = "1";
            more.setAttribute("aria-haspopup", "menu");
            more.setAttribute("aria-expanded", "false");
            more.addEventListener("click", () => {
                if (openPopover && more.getAttribute("aria-expanded") === "true") {
                    closeToolbarPopover();
                    return;
                }
                openMenuPopover(more, t("toolbar.view.presentMenu"), modes.map((mode) => ({
                    label: t(mode.label),
                    hint: t(mode.hint),
                    icon: mode.icon,
                    checked: mode.id === playStart,
                    onSelect: () => {
                        playStart = mode.id;
                        syncPlayBtn();
                    },
                })));
            });
            play.appendChild(more);
        }
        viewRight.appendChild(play);
    }
    if (a.toggleAppearance) {
        const dark = () => a.isDarkAppearance?.() ?? true;
        const b = mkBarIcon("sun", t("toolbar.view.toLight"), () => {
            a.toggleAppearance?.();
            refresh();
        });
        b.dataset.viewBarAppearance = "1";
        const syncAppearanceBtn = () => {
            const label = dark() ? t("toolbar.view.toLight") : t("toolbar.view.toDark");
            fillLucideIcon(doc, b, dark() ? "sun" : "moon", 16);
            b.title = label;
            b.setAttribute("aria-label", label);
            if (b.hasAttribute("data-ppt-tip"))
                b.setAttribute("data-ppt-tip", label);
        };
        refreshHandlers.push(syncAppearanceBtn);
        if (a.subscribeAppearance)
            panelCleanupFns.push(a.subscribeAppearance(syncAppearanceBtn));
        viewRight.appendChild(b);
    }
    if (a.togglePropertiesPanel) {
        const b = mkBarIcon("sliders-horizontal", t("toolbar.view.properties"), () => {
            a.togglePropertiesPanel?.();
            refresh();
        });
        b.dataset.viewBarProperties = "1";
        refreshHandlers.push(() => {
            b.setAttribute("aria-pressed", a.isPropertiesPanelOpen?.() ? "true" : "false");
        });
        viewRight.appendChild(b);
    }
    // 底部命令行：分组切换器 + 当前分组命令（单行，溢出出滚动条）+ 右侧列表。默认「常用」。
    const commandBar = doc.createElement("div");
    commandBar.className = "ppt-command-bar";
    commandBar.dataset.pptCommandBar = "1";
    commandBar.setAttribute("role", "toolbar");
    commandBar.setAttribute("aria-label", t("toolbar.group.label"));
    const groupPill = doc.createElement("button");
    groupPill.type = "button";
    groupPill.className = "ppt-group-pill";
    groupPill.dataset.pptGroupPill = "1";
    groupPill.setAttribute("aria-haspopup", "dialog");
    groupPill.setAttribute("aria-expanded", "false");
    groupPill.title = t("toolbar.group.switch");
    const groupPillLabel = doc.createElement("span");
    groupPillLabel.className = "ppt-group-pill-label";
    groupPill.append(groupPillLabel, lucideSvg(doc, "chevrons-up-down", 12));
    const commandStrip = doc.createElement("div");
    commandStrip.className = "ppt-command-strip";
    commandStrip.dataset.pptCommandStrip = "1";
    commandStrip.id = "ppt-command-strip";
    commandStrip.setAttribute("role", "group");
    enableWheelHorizontalScroll(commandStrip);
    let commandStripFitFrame = 0;
    let commandStripFitAgain = false;
    let commandStripAwaitFrame = 0;
    const awaitCommandStripBox = () => {
        if (commandStripAwaitFrame || !commandStrip.isConnected)
            return;
        const tick = () => {
            commandStripAwaitFrame = 0;
            if (!commandStrip.isConnected)
                return;
            if (commandStrip.clientWidth <= 0) {
                commandStripAwaitFrame = requestAnimationFrame(tick);
                return;
            }
            markUniformIconStrip(commandStrip);
        };
        commandStripAwaitFrame = requestAnimationFrame(tick);
    };
    const pumpCommandStripFit = () => {
        commandStripFitFrame = 0;
        if (!commandStripFitAgain)
            return;
        commandStripFitAgain = false;
        markUniformIconStrip(commandStrip);
        if (commandStripFitAgain)
            commandStripFitFrame = requestAnimationFrame(pumpCommandStripFit);
    };
    const commandStripObserver = new ResizeObserver(() => {
        commandStripFitAgain = true;
        if (!commandStripFitFrame)
            commandStripFitFrame = requestAnimationFrame(pumpCommandStripFit);
    });
    commandStripObserver.observe(commandStrip);
    const listBtn = mkLucideIconButton(doc, "list", "ppt-view-bar-btn ppt-command-list-btn", t("toolbar.group.list"), 16);
    listBtn.dataset.pptCommandList = "1";
    listBtn.setAttribute("aria-haspopup", "dialog");
    listBtn.setAttribute("aria-expanded", "false");
    commandBar.append(groupPill, commandStrip, listBtn);
    const panelOf = (name) => {
        const panel = tabPanels.get(name);
        if (!panel || panel.children.length === 0)
            return null;
        return panel;
    };
    const flags = chromeHookFlags();
    const quickMeta = {
        slide: {
            label: "toolbar.quick.slide",
            hint: "toolbar.quick.slideHint",
            icon: "plus",
            run: () => a.insertSlide?.(),
        },
        layout: {
            label: "toolbar.quick.layout",
            hint: "toolbar.quick.layoutHint",
            icon: "layout-template",
            run: () => a.openLayoutPicker?.(),
        },
        text: {
            label: "toolbar.insert.text",
            hint: "toolbar.insert.textHint",
            icon: "type",
            run: () => a.insertShape("text"),
        },
        insert: {
            label: "toolbar.quick.insert",
            hint: "toolbar.quick.insertHint",
            icon: "square-plus",
            run: () => selectGroup("insert"),
        },
        image: {
            label: "toolbar.insert.image",
            hint: "toolbar.insert.imageHint",
            icon: "image",
            run: () => a.insertImage(),
        },
        shape: {
            label: "toolbar.insert.shape",
            hint: "toolbar.insert.shapeHint",
            icon: "shapes",
            run: () => { },
        },
        icon: {
            label: "toolbar.insert.icon",
            hint: "ribbon.insert.icons",
            icon: "smile-plus",
            run: () => a.insertIcon?.(),
        },
        select: {
            label: "toolbar.quick.select",
            hint: "toolbar.quick.selectHint",
            icon: "mouse-pointer-2",
            run: () => {
                if (a.selectPointer)
                    a.selectPointer();
                else
                    a.setInkMode?.(null);
            },
        },
        formatPainter: {
            label: "toolbar.quick.formatPainter",
            hint: "ribbon.formatPainter.title",
            icon: "paintbrush",
            run: () => { },
        },
    };
    const commonRow = doc.createElement("div");
    commonRow.className = "ppt-command-common";
    for (const id of listQuickBar(flags)) {
        const meta = quickMeta[id];
        if (id === QUICK_BAR_TOOL_IDS[0]) {
            const sep = doc.createElement("span");
            sep.className = "ppt-command-sep";
            sep.setAttribute("aria-hidden", "true");
            commonRow.appendChild(sep);
        }
        const b = doc.createElement("button");
        b.type = "button";
        b.className = "ppt-quick-bar-btn";
        b.dataset.quickId = id;
        b.title = t(meta.hint);
        b.setAttribute("aria-label", t(meta.hint) || t(meta.label));
        appendLabelWithIcon(doc, b, meta.icon, t(meta.label), 16);
        if (id === "shape") {
            b.setAttribute("aria-haspopup", "menu");
            b.setAttribute("aria-expanded", "false");
            b.addEventListener("click", () => {
                if (openPopover && b.getAttribute("aria-expanded") === "true") {
                    closeToolbarPopover();
                    return;
                }
                openQuickShapes(b);
            });
        }
        else if (id === "formatPainter") {
            // 单击刷一次，双击连续刷（与「编辑与文本」里的格式刷一致）。
            let timer;
            b.addEventListener("click", () => {
                if (timer)
                    return;
                timer = setTimeout(() => {
                    timer = undefined;
                    runRibbonCommand(() => a.toggleFormatPainter?.(false));
                }, 220);
            });
            b.addEventListener("dblclick", (ev) => {
                ev.preventDefault();
                if (timer) {
                    clearTimeout(timer);
                    timer = undefined;
                }
                runRibbonCommand(() => a.toggleFormatPainter?.(true));
            });
            refreshHandlers.push(() => {
                const on = a.isFormatPainterOn?.() ?? false;
                b.setAttribute("aria-pressed", on ? "true" : "false");
                b.disabled = !on && selCount() !== 1;
            });
        }
        else {
            b.addEventListener("click", () => runRibbonCommand(meta.run));
        }
        commonRow.appendChild(b);
    }
    const groupLabel = (id) => {
        if (id === "common")
            return t("toolbar.section.common");
        if (id === "file")
            return t("toolbar.menu.file");
        if (id === "insert")
            return t("toolbar.insert");
        if (id === "editText")
            return t("toolbar.menu.editText");
        if (id === "draw")
            return t("toolbar.menu.draw");
        if (id === "lookObject")
            return t("toolbar.menu.lookObject");
        if (id === "present")
            return t("toolbar.menu.present");
        if (id === "workspace")
            return t("toolbar.menu.workspace");
        if (id === "review")
            return t("toolbar.menu.review");
        if (id === "help")
            return t("toolbar.menu.help");
        return t("toolbar.menu.experimental");
    };
    const groupPanels = {
        common: ["Insert"],
        file: ["File"],
        insert: ["Insert"],
        editText: ["Home"],
        draw: ["Draw"],
        lookObject: ["Design", "Format"],
        present: ["Slideshow"],
        workspace: ["View"],
        review: ["Review"],
        help: ["Help"],
        experimental: ["Experimental"],
    };
    const hasLookShortcuts = !!(a.focusTransitionsPanel || a.focusAnimationsPanel);
    const groups = listCommandGroups(flags).filter((id) => {
        if (id === "common")
            return true;
        if (id === "lookObject" && hasLookShortcuts)
            return true;
        return groupPanels[id].some((name) => panelOf(name));
    });
    const mountLookShortcuts = (host) => {
        if (!hasLookShortcuts)
            return;
        const { group, row } = mkGroup(t("toolbar.menu.lookObject"));
        if (a.focusTransitionsPanel) {
            row.appendChild(mkBtn(t("toolbar.menu.transitions"), t("toolbar.menu.transitions"), () => a.focusTransitionsPanel?.(), "blend"));
        }
        if (a.focusAnimationsPanel) {
            row.appendChild(mkBtn(t("toolbar.menu.animations"), t("toolbar.menu.animations"), () => a.focusAnimationsPanel?.(), "panel-right"));
        }
        host.appendChild(group);
    };
    let currentGroup = "common";
    const mountGroup = (id) => {
        releaseStrip(commandStrip);
        commandStrip.dataset.group = id;
        commandStrip.setAttribute("aria-label", groupLabel(id));
        if (id === "common") {
            commandStrip.appendChild(commonRow);
        }
        else {
            for (const name of groupPanels[id]) {
                const panel = panelOf(name);
                if (panel)
                    mountRibbonStrip(commandStrip, panel);
            }
            if (id === "lookObject")
                mountLookShortcuts(commandStrip);
        }
        commandStrip.classList.remove("ppt-command-strip--icon-uniform");
        delete commandStrip.dataset.expandedScroll;
        markUniformIconStrip(commandStrip);
        commandStrip.scrollLeft = 0;
        commandStrip.style.animation = "none";
        void commandStrip.offsetWidth;
        commandStrip.style.animation = "";
        listBtn.disabled = !groupPanels[id].some((name) => panelOf(name));
    };
    function selectGroup(id) {
        if (!groups.includes(id))
            return;
        currentGroup = id;
        groupPillLabel.textContent = groupLabel(id);
        groupPill.dataset.group = id;
        mountGroup(id);
    }
    /** 真面板要进列表弹层。先在命令条原位留一张不接收指针的样子，关掉弹层再挂回真面板。 */
    function holdStripAppearance(panels) {
        const holds = [];
        for (const panel of panels) {
            if (!commandStrip.contains(panel))
                continue;
            const hold = panel.cloneNode(true);
            hold.dataset.pptStripHold = "1";
            hold.setAttribute("inert", "");
            hold.setAttribute("aria-hidden", "true");
            hold.removeAttribute("id");
            for (const el of Array.from(hold.querySelectorAll("[id]")))
                el.removeAttribute("id");
            panel.before(hold);
            holds.push(hold);
        }
        return () => {
            for (const hold of holds)
                hold.remove();
        };
    }
    const openFullGroup = () => {
        const names = groupPanels[currentGroup];
        const panels = names.map((name) => panelOf(name)).filter((p) => !!p);
        if (panels.length === 0)
            return;
        const releaseHold = holdStripAppearance(panels);
        openPanelPopover(listBtn, panels, groupLabel(currentGroup), () => {
            releaseHold();
            mountGroup(currentGroup);
        });
    };
    listBtn.addEventListener("click", () => {
        if (openPopover && listBtn.getAttribute("aria-expanded") === "true") {
            closeToolbarPopover();
            return;
        }
        openFullGroup();
    });
    const openGroupPicker = () => {
        const pop = openChromePopover(groupPill, t("toolbar.group.switch"), "ppt-chrome-popover ppt-group-popover");
        pop.dataset.chromeSurface = "groups";
        const grid = doc.createElement("div");
        grid.className = "ppt-group-grid";
        grid.setAttribute("role", "listbox");
        grid.setAttribute("aria-label", t("toolbar.group.label"));
        const chips = [];
        for (const id of groups) {
            const chip = doc.createElement("button");
            chip.type = "button";
            chip.className = "ppt-group-chip";
            chip.setAttribute("role", "option");
            chip.dataset.group = id;
            chip.setAttribute("aria-selected", id === currentGroup ? "true" : "false");
            chip.tabIndex = id === currentGroup ? 0 : -1;
            chip.textContent = groupLabel(id);
            chip.addEventListener("click", () => {
                closeToolbarPopover();
                selectGroup(id);
            });
            chips.push(chip);
            grid.appendChild(chip);
        }
        grid.addEventListener("keydown", (ev) => {
            const step = ev.key === "ArrowRight" || ev.key === "ArrowDown" ? 1 : ev.key === "ArrowLeft" || ev.key === "ArrowUp" ? -1 : 0;
            if (!step && ev.key !== "Home" && ev.key !== "End")
                return;
            ev.preventDefault();
            const cur = chips.indexOf(doc.activeElement);
            const next = ev.key === "Home" ? 0 : ev.key === "End" ? chips.length - 1 : (Math.max(cur, 0) + step + chips.length) % chips.length;
            chips[next]?.focus();
        });
        pop.appendChild(grid);
        (chips.find((chip) => chip.dataset.group === currentGroup) ?? chips[0])?.focus();
    };
    groupPill.addEventListener("click", () => {
        if (openPopover && groupPill.getAttribute("aria-expanded") === "true") {
            closeToolbarPopover();
            return;
        }
        openGroupPicker();
    });
    // 状态栏两端：视图下拉 · 底栏（时间轴 / 备注）下拉。
    const statusStart = doc.createElement("div");
    statusStart.className = "ppt-status-start";
    const statusEnd = doc.createElement("div");
    statusEnd.className = "ppt-status-end";
    if (a.setPresentationView && a.getPresentationView) {
        const viewMenuBtn = doc.createElement("button");
        viewMenuBtn.type = "button";
        viewMenuBtn.className = "ppt-status-menu-btn";
        viewMenuBtn.dataset.pptStatusView = "1";
        viewMenuBtn.setAttribute("aria-haspopup", "menu");
        viewMenuBtn.setAttribute("aria-expanded", "false");
        viewMenuBtn.title = t("toolbar.view.menu");
        const label = doc.createElement("span");
        viewMenuBtn.append(label, lucideSvg(doc, "chevron-down", 12));
        refreshHandlers.push(() => {
            label.textContent = t(PRESENTATION_VIEW_LABEL[a.getPresentationView?.() ?? "normal"]);
        });
        viewMenuBtn.addEventListener("click", () => {
            if (openPopover && viewMenuBtn.getAttribute("aria-expanded") === "true") {
                closeToolbarPopover();
                return;
            }
            const current = a.getPresentationView?.() ?? "normal";
            const modes = ["normal", "outline", "sorter", "reading", "notesPage"];
            openMenuPopover(viewMenuBtn, t("toolbar.view.menu"), modes.map((mode) => ({
                label: t(PRESENTATION_VIEW_LABEL[mode]),
                icon: PRESENTATION_VIEW_ICON[mode],
                checked: mode === current,
                onSelect: () => runRibbonCommand(() => a.setPresentationView?.(mode)),
            })));
        });
        statusStart.appendChild(viewMenuBtn);
    }
    if (a.stepZoom && a.getZoomPercent) {
        const zoom = doc.createElement("div");
        zoom.className = "ppt-view-zoom";
        zoom.setAttribute("role", "group");
        zoom.setAttribute("aria-label", t("ribbon.group.zoom"));
        const out = mkBarIcon("minus", t("editor.status.zoom.out"), () => a.stepZoom?.(-1));
        const pct = doc.createElement("button");
        pct.type = "button";
        pct.className = "ppt-view-zoom-value";
        pct.title = t("editor.status.zoom.fitBtn");
        pct.addEventListener("click", () => {
            runRibbonCommand(() => a.setZoom(a.getZoomPercent?.().fit ? 1 : "fit"));
        });
        const inc = mkBarIcon("plus", t("editor.status.zoom.in"), () => a.stepZoom?.(1));
        zoomRefreshers.push(() => {
            const z = a.getZoomPercent?.();
            if (!z)
                return;
            pct.textContent = `${Math.round(z.percent)}%`;
            pct.setAttribute("aria-pressed", z.fit ? "true" : "false");
            pct.setAttribute("aria-label", `${pct.textContent} · ${t("editor.status.zoom.fitBtn")}`);
        });
        zoom.append(out, pct, inc);
        statusEnd.appendChild(zoom);
    }
    if (a.toggleTimeline || a.toggleNotes || a.toggleLecture) {
        const dockMenuBtn = doc.createElement("button");
        dockMenuBtn.type = "button";
        dockMenuBtn.className = "ppt-status-menu-btn";
        dockMenuBtn.dataset.pptStatusDock = "1";
        dockMenuBtn.setAttribute("aria-haspopup", "menu");
        dockMenuBtn.setAttribute("aria-expanded", "false");
        dockMenuBtn.title = t("toolbar.dock.menu");
        const dockLabel = doc.createElement("span");
        dockMenuBtn.append(dockLabel, lucideSvg(doc, "chevron-down", 12));
        refreshHandlers.push(() => {
            if (a.isTimelineOn?.())
                dockLabel.textContent = t("toolbar.timelineHandle");
            else if (a.isNotesOn?.())
                dockLabel.textContent = t("toolbar.notesHandle");
            else if (a.isLectureOn?.())
                dockLabel.textContent = t("toolbar.lectureHandle");
            else
                dockLabel.textContent = t("toolbar.dock.menuLabel");
        });
        dockMenuBtn.addEventListener("click", () => {
            if (openPopover && dockMenuBtn.getAttribute("aria-expanded") === "true") {
                closeToolbarPopover();
                return;
            }
            const items = [];
            if (a.toggleTimeline) {
                items.push({
                    label: t("toolbar.timelineHandle"),
                    hint: t("toolbar.timelineHandleHint"),
                    checked: a.isTimelineOn?.() ?? false,
                    onSelect: () => {
                        a.toggleTimeline?.();
                        refresh();
                    },
                });
            }
            if (a.toggleNotes) {
                items.push({
                    label: t("toolbar.notesHandle"),
                    hint: t("toolbar.notesHandleHint"),
                    checked: a.isNotesOn?.() ?? false,
                    onSelect: () => {
                        a.toggleNotes?.();
                        refresh();
                    },
                });
            }
            if (a.toggleLecture) {
                items.push({
                    label: t("toolbar.lectureHandle"),
                    hint: t("toolbar.lectureHandleHint"),
                    checked: a.isLectureOn?.() ?? false,
                    onSelect: () => {
                        a.toggleLecture?.();
                        refresh();
                    },
                });
            }
            openMenuPopover(dockMenuBtn, t("toolbar.dock.menu"), items);
        });
        statusEnd.appendChild(dockMenuBtn);
    }
    selectGroup("common");
    panelCleanupFns.push(() => {
        closeToolbarPopover();
        releaseStrip(commandStrip);
    });
    function refresh() {
        const run = a.getCurrentTextRun();
        if (run) {
            fontFamilyCombo.setValue(run.fontFamily ?? "");
            fontSizeInput.value = formatFontPt(run.fontSize ?? ptToPx(DEFAULT_FONT_PT));
            fontColorInput.value = normalizeHex(paintedTextColor(run) ?? "#000000");
            setToggle(boldBtn, isBold(run.fontWeight));
            setToggle(italicBtn, !!run.italic);
            setToggle(underlineBtn, !!run.underline);
            setToggle(supBtn, typeof run.baseline === "number" && run.baseline > 0);
            setToggle(subBtn, typeof run.baseline === "number" && run.baseline < 0);
        }
        else {
            fontFamilyCombo.setValue("");
            fontSizeInput.value = "";
            fontColorInput.value = "#000000";
            setToggle(boldBtn, false);
            setToggle(italicBtn, false);
            setToggle(underlineBtn, false);
            setToggle(supBtn, false);
            setToggle(subBtn, false);
        }
        for (const fn of refreshHandlers)
            fn();
        for (const fn of transitionRefreshers)
            fn();
        refreshZoom();
    }
    refresh();
    panelCleanupFns.push(attachRibbonHoverTips(root));
    panelCleanupFns.push(attachRibbonHoverTips(viewBar));
    panelCleanupFns.push(attachRibbonHoverTips(commandBar));
    function destroy() {
        for (const fn of panelCleanupFns)
            fn();
    }
    return {
        el: root,
        viewBar,
        commandBar,
        statusStart,
        statusEnd,
        refresh,
        refreshZoom,
        fitCommandStrip: () => markUniformIconStrip(commandStrip),
        destroy,
    };
}
function isBold(w) {
    if (w === undefined)
        return false;
    if (typeof w === "number")
        return w >= 600;
    return w === "bold" || w === "bolder";
}
function setToggle(b, on) {
    b.classList.toggle("ppt-ribbon-btn--pressed", on);
}
function normalizeHex(c) {
    if (/^#[0-9a-f]{6}$/i.test(c))
        return c;
    if (/^#[0-9a-f]{8}$/i.test(c))
        return c.slice(0, 7);
    if (/^#[0-9a-f]{3}$/i.test(c))
        return "#" + c[1] + c[1] + c[2] + c[2] + c[3] + c[3];
    return "#000000";
}
/** 常用形状：常用条「形状」和插入组形状类目前六个，一点即进入绘制。 */
const COMMON_DRAW_SHAPES = [
    { kind: "rect", label: "ribbon.shape.rect", icon: "square" },
    { kind: "ellipse", label: "ribbon.shape.ellipse", icon: "circle" },
    { kind: "triangle", label: "ribbon.shape.triangle", icon: "triangle" },
    { kind: "star", label: "ribbon.shape.star", icon: "star" },
    { kind: "line", label: "ribbon.shape.line", icon: "minus" },
    { kind: "arrow", label: "ribbon.shape.arrow", icon: "arrow-right" },
];
const RIBBON_EXTRA_SHAPES = [
    "roundRect",
    "pentagon",
    "hexagon",
    "diamond",
    "rightArrow",
    "flowChartProcess",
];
function openFillGradientPicker(doc, anchor, presets, onPick) {
    doc.querySelectorAll("[data-ppt-fill-gradient-picker]").forEach((n) => n.remove());
    const anchorRect = anchor.getBoundingClientRect();
    closeRibbonMoreUnlessFromMoreDialog(doc, anchor);
    const overlay = doc.createElement("div");
    overlay.dataset.pptFillGradientPicker = "1";
    overlay.style.cssText =
        `position:fixed;inset:0;z-index:${Z_RIBBON_POPOVER};background:transparent`;
    const panel = doc.createElement("div");
    panel.style.cssText = [
        "position:absolute",
        "background:var(--secondary)",
        "color:var(--foreground)",
        "border:1px solid var(--border)",
        "border-radius:6px",
        "box-shadow:0 8px 24px rgba(0,0,0,0.5)",
        "padding:8px",
        "display:grid",
        "grid-template-columns:repeat(3,1fr)",
        "gap:6px",
        "font:12px system-ui,sans-serif",
    ].join(";");
    overlay.appendChild(panel);
    doc.body.appendChild(overlay);
    for (const p of presets) {
        const cell = doc.createElement("button");
        cell.type = "button";
        cell.title = p.label;
        cell.style.cssText = [
            "width:72px",
            "height:48px",
            "border:1px solid var(--border)",
            "border-radius:4px",
            "cursor:pointer",
            "background:" + p.preview,
        ].join(";");
        cell.addEventListener("click", () => {
            onPick(p.id);
            overlay.remove();
        });
        panel.appendChild(cell);
    }
    const pw = panel.getBoundingClientRect().width;
    const ph = panel.getBoundingClientRect().height;
    const vw = doc.defaultView?.innerWidth ?? 1200;
    const vh = doc.defaultView?.innerHeight ?? 800;
    let left = anchorRect.left;
    let top = anchorRect.bottom + 4;
    if (left + pw > vw - 8)
        left = Math.max(8, vw - pw - 8);
    if (top + ph > vh - 8)
        top = Math.max(8, vh - ph - 8);
    panel.style.left = left + "px";
    panel.style.top = top + "px";
    const close = () => overlay.remove();
    overlay.addEventListener("click", (e) => {
        if (e.target === overlay)
            close();
    });
    doc.addEventListener("keydown", (e) => {
        if (e.key === "Escape")
            close();
    }, { once: true });
}
function openShapeEffectPicker(doc, anchor, presets, onPick) {
    doc.querySelectorAll("[data-ppt-shape-effect-picker]").forEach((n) => n.remove());
    const anchorRect = anchor.getBoundingClientRect();
    closeRibbonMoreUnlessFromMoreDialog(doc, anchor);
    const overlay = doc.createElement("div");
    overlay.dataset.pptShapeEffectPicker = "1";
    overlay.style.cssText =
        `position:fixed;inset:0;z-index:${Z_RIBBON_POPOVER};background:transparent`;
    const panel = doc.createElement("div");
    panel.style.cssText = [
        "position:absolute",
        "background:var(--secondary)",
        "color:var(--foreground)",
        "border:1px solid var(--border)",
        "border-radius:6px",
        "box-shadow:0 8px 24px rgba(0,0,0,0.5)",
        "padding:8px",
        "display:grid",
        "grid-template-columns:repeat(2,minmax(120px,1fr))",
        "gap:6px",
        "font:12px system-ui,sans-serif",
        "max-width:320px",
    ].join(";");
    overlay.appendChild(panel);
    doc.body.appendChild(overlay);
    for (const p of presets) {
        const cell = doc.createElement("button");
        cell.type = "button";
        cell.title = p.label;
        cell.style.cssText = [
            "display:flex",
            "align-items:center",
            "gap:8px",
            "padding:6px 8px",
            "border:1px solid var(--border)",
            "border-radius:4px",
            "cursor:pointer",
            "background:var(--card)",
            "color:inherit",
            "text-align:left",
            "font:inherit",
        ].join(";");
        const sw = doc.createElement("span");
        sw.style.cssText = [
            "width:28px",
            "height:28px",
            "border-radius:4px",
            "flex-shrink:0",
            "border:1px solid var(--border)",
            p.id === "none" ? "background:var(--secondary)" : `box-shadow:${p.swatch}`,
        ].join(";");
        const lbl = doc.createElement("span");
        lbl.textContent = p.label;
        lbl.style.fontSize = "11px";
        cell.append(sw, lbl);
        cell.addEventListener("click", () => {
            onPick(p.id);
            overlay.remove();
        });
        panel.appendChild(cell);
    }
    const pw = panel.getBoundingClientRect().width;
    const ph = panel.getBoundingClientRect().height;
    const vw = doc.defaultView?.innerWidth ?? 1200;
    const vh = doc.defaultView?.innerHeight ?? 800;
    let left = anchorRect.left;
    let top = anchorRect.bottom + 4;
    if (left + pw > vw - 8)
        left = Math.max(8, vw - pw - 8);
    if (top + ph > vh - 8)
        top = Math.max(8, vh - ph - 8);
    panel.style.left = left + "px";
    panel.style.top = top + "px";
    overlay.addEventListener("click", (e) => {
        if (e.target === overlay)
            overlay.remove();
    });
    doc.addEventListener("keydown", (e) => {
        if (e.key === "Escape")
            overlay.remove();
    }, { once: true });
}
// 通用的 anchor 下方浮层。点击外部 / Esc 关闭。用于 bullet / numbering 菜单。
function openAnchoredMenu(doc, anchor, build) {
    doc.querySelectorAll("[data-ppt-bullet-menu]").forEach((n) => n.remove());
    const anchorRect = anchor.getBoundingClientRect();
    closeRibbonMoreUnlessFromMoreDialog(doc, anchor);
    const overlay = doc.createElement("div");
    overlay.dataset.pptBulletMenu = "1";
    overlay.style.cssText =
        `position:fixed;inset:0;z-index:${Z_RIBBON_POPOVER};background:transparent`;
    const panel = doc.createElement("div");
    panel.className = "ppt-ribbon-menu";
    panel.style.cssText = [
        "position:absolute",
        "pointer-events:auto",
        "background:var(--secondary)",
        "color:var(--foreground)",
        "border:1px solid var(--border)",
        "border-radius:6px",
        "box-shadow:0 8px 24px rgba(0,0,0,0.5)",
        "padding:4px",
        "min-width:160px",
        "font:12px system-ui,sans-serif",
        "user-select:none",
    ].join(";");
    overlay.appendChild(panel);
    doc.body.appendChild(overlay);
    let left = anchorRect.left;
    let top = anchorRect.bottom + 4;
    const pw = panel.getBoundingClientRect().width;
    const ph = panel.getBoundingClientRect().height;
    const vw = doc.defaultView?.innerWidth ?? 1200;
    const vh = doc.defaultView?.innerHeight ?? 800;
    if (left + pw > vw - 8)
        left = Math.max(8, vw - pw - 8);
    if (top + ph > vh - 8)
        top = Math.max(8, vh - ph - 8);
    panel.style.left = left + "px";
    panel.style.top = top + "px";
    const close = () => {
        overlay.remove();
        doc.removeEventListener("keydown", onKey);
    };
    const onKey = (e) => {
        if (e.key === "Escape") {
            e.preventDefault();
            close();
        }
    };
    overlay.addEventListener("click", (e) => {
        if (e.target === overlay)
            close();
    });
    doc.addEventListener("keydown", onKey);
    build(panel, close);
}
function mkMenuItem(doc, label, fn) {
    const b = doc.createElement("button");
    b.type = "button";
    b.className = "ppt-ribbon-menu-item";
    b.textContent = label;
    // CSS :hover 在全屏透明 overlay 里经常不亮（Cursor 内置浏览器也一样），
    // 跟右键菜单一样用 pointerenter 显式加高亮类。
    b.addEventListener("pointerenter", () => b.classList.add("is-hover"));
    b.addEventListener("pointerleave", () => b.classList.remove("is-hover"));
    b.addEventListener("click", () => runRibbonCommand(fn));
    return b;
}
function openChoiceMenu(doc, anchor, items, onPick, current) {
    openAnchoredMenu(doc, anchor, (panel, close) => {
        for (const it of items) {
            const b = mkMenuItem(doc, it.label, () => {
                onPick(it.value);
                close();
            });
            if (current !== undefined && it.value === current)
                b.classList.add("ppt-ribbon-menu-item--current");
            panel.appendChild(b);
        }
    });
}
const HISTORY_LABEL_ALIAS = {
    Move: "cmd.move",
    Resize: "cmd.resize",
    Delete: "cmd.delete",
    "Edit text": "cmd.editText",
    "Set fill": "cmd.setFill",
    "Set stroke": "cmd.setStroke",
    "Text style": "cmd.textStyle",
    "Add shape": "cmd.addShape",
    Align: "cmd.align",
    "Slide size": "cmd.slideSize",
    Background: "cmd.background",
    Rotate: "cmd.rotate",
    Opacity: "cmd.opacity",
    Flip: "cmd.flip",
    Lock: "cmd.lock",
    Visibility: "cmd.visibility",
    "Media properties": "cmd.mediaProps",
    "Position / Size": "cmd.positionSize",
    Group: "cmd.group",
    Ungroup: "cmd.ungroup",
    Distribute: "cmd.distribute",
    Reorder: "cmd.reorder",
    Transition: "cmd.transition",
    "Add Animation": "cmd.addAnimation",
    "Remove Animation": "cmd.removeAnimation",
    "Reorder Animation": "cmd.reorderAnimation",
    "Update Animation": "cmd.updateAnimation",
    Hyperlink: "cmd.hyperlink",
    "Edit WordArt": "cmd.editWordArt",
    "Edit decorative text": "cmd.editWordArt",
    "Update SmartArt": "cmd.updateDiagram",
    "Update diagram": "cmd.updateDiagram",
    "Edit SmartArt items": "cmd.editDiagramItems",
    "Edit diagram items": "cmd.editDiagramItems",
    "Add SmartArt item": "cmd.addDiagramItem",
    "Add diagram item": "cmd.addDiagramItem",
    "Duplicate SmartArt item": "cmd.duplicateDiagramItem",
    "Duplicate diagram item": "cmd.duplicateDiagramItem",
    "Clear SmartArt pictures": "cmd.clearDiagramPictures",
    "Clear diagram pictures": "cmd.clearDiagramPictures",
    "Remove SmartArt item": "cmd.removeDiagramItem",
    "Remove diagram item": "cmd.removeDiagramItem",
    "Reorder SmartArt item": "cmd.reorderDiagramItem",
    "Reorder diagram item": "cmd.reorderDiagramItem",
    "Change SmartArt level": "cmd.changeDiagramLevel",
    "Change diagram level": "cmd.changeDiagramLevel",
    "Change SmartArt layout": "cmd.changeDiagramLayout",
    "Change diagram layout": "cmd.changeDiagramLayout",
    "Convert to SmartArt": "cmd.convertToDiagram",
    "Convert to diagram": "cmd.convertToDiagram",
    "Quick Style": "cmd.quickStyle",
};
function displayHistoryLabel(raw) {
    const key = HISTORY_LABEL_ALIAS[raw];
    return key ? t(key) : raw;
}
function openHistoryMenu(doc, anchor, entries, onJump) {
    openAnchoredMenu(doc, anchor, (panel, close) => {
        panel.classList.add("ppt-ribbon-history");
        const hint = doc.createElement("div");
        hint.className = "ppt-ribbon-history-hint";
        hint.textContent = t("ribbon.history.hint");
        panel.appendChild(hint);
        let currentBtn;
        for (const entry of entries) {
            const b = doc.createElement("button");
            b.type = "button";
            b.className = "ppt-ribbon-menu-item ppt-ribbon-history-item";
            if (entry.current)
                b.classList.add("ppt-ribbon-menu-item--current", "ppt-ribbon-history-item--current");
            if (!entry.applied)
                b.classList.add("ppt-ribbon-history-item--future");
            b.title = t("ribbon.history.jump");
            const dot = doc.createElement("span");
            dot.className = "ppt-ribbon-history-dot";
            const text = doc.createElement("span");
            text.className = "ppt-ribbon-history-label";
            text.textContent = displayHistoryLabel(entry.label);
            b.append(dot, text);
            if (entry.current) {
                const badge = doc.createElement("span");
                badge.className = "ppt-ribbon-history-badge";
                badge.textContent = t("ribbon.history.current");
                b.appendChild(badge);
                currentBtn = b;
            }
            b.addEventListener("pointerenter", () => b.classList.add("is-hover"));
            b.addEventListener("pointerleave", () => b.classList.remove("is-hover"));
            b.addEventListener("click", () => {
                if (!entry.current)
                    onJump(entry.mark);
                close();
            });
            panel.appendChild(b);
        }
        requestAnimationFrame(() => {
            const r = panel.getBoundingClientRect();
            const vw = doc.defaultView?.innerWidth ?? 1200;
            const vh = doc.defaultView?.innerHeight ?? 800;
            if (r.right > vw - 8)
                panel.style.left = `${Math.max(8, vw - r.width - 8)}px`;
            if (r.bottom > vh - 8)
                panel.style.top = `${Math.max(8, vh - r.height - 8)}px`;
            currentBtn?.scrollIntoView({ block: "nearest" });
        });
    });
}
// 项目符号字符菜单：常见 OOXML §21.1.2.4.3 buChar 字符。
function openBulletPicker(doc, anchor, onPick) {
    openAnchoredMenu(doc, anchor, (panel, close) => {
        const items = [
            [t("ribbon.bullet.menu.none"), undefined],
            [t("ribbon.bullet.menu.disc"), { kind: "char", char: "•" }],
            [t("ribbon.bullet.menu.circle"), { kind: "char", char: "○" }],
            [t("ribbon.bullet.menu.square"), { kind: "char", char: "■" }],
            [t("ribbon.bullet.menu.dash"), { kind: "char", char: "—" }],
            [t("ribbon.bullet.menu.star"), { kind: "char", char: "★" }],
            [t("ribbon.bullet.menu.check"), { kind: "char", char: "✓" }],
        ];
        for (const [label, def] of items) {
            panel.appendChild(mkMenuItem(doc, label, () => {
                onPick(def);
                close();
            }));
        }
    });
}
// 更改大小写菜单。
function openChangeCasePicker(doc, anchor, onPick) {
    openAnchoredMenu(doc, anchor, (panel, close) => {
        const items = [
            ["upper", t("ribbon.font.caseUpper")],
            ["lower", t("ribbon.font.caseLower")],
            ["title", t("ribbon.font.caseTitle")],
            ["sentence", t("ribbon.font.caseSentence")],
        ];
        for (const [mode, label] of items) {
            panel.appendChild(mkMenuItem(doc, label, () => {
                onPick(mode);
                close();
            }));
        }
    });
}
function openNumberingPicker(doc, anchor, onPick) {
    openAnchoredMenu(doc, anchor, (panel, close) => {
        const items = [
            [t("ribbon.numbering.menu.none"), undefined],
            [t("ribbon.numbering.menu.arabicPeriod"), { kind: "number", numType: "arabicPeriod" }],
            [t("ribbon.numbering.menu.arabicParenR"), { kind: "number", numType: "arabicParenR" }],
            [t("ribbon.numbering.menu.romanUcPeriod"), { kind: "number", numType: "romanUcPeriod" }],
            [t("ribbon.numbering.menu.romanLcPeriod"), { kind: "number", numType: "romanLcPeriod" }],
            [t("ribbon.numbering.menu.alphaUcPeriod"), { kind: "number", numType: "alphaUcPeriod" }],
            [t("ribbon.numbering.menu.alphaLcPeriod"), { kind: "number", numType: "alphaLcPeriod" }],
        ];
        for (const [label, def] of items) {
            panel.appendChild(mkMenuItem(doc, label, () => {
                onPick(def);
                close();
            }));
        }
    });
}
