// Find / Replace —— 全 deck 文本搜索与替换（含表格 cell、group 内 text shape）。
// 非模态浮动面板，Find Next 时自动跳转 slide 并选中命中 shape。
import { SetParagraphsCmd } from "./commands.js";
import { findShape } from "./selection.js";
import { t } from "./i18n/index.js";
import { CHECK_CLASS, DIALOG_BTN_PRIMARY_CSS, DIALOG_BTN_SECONDARY_CSS, DIALOG_INPUT_CSS, Z_FIND_REPLACE } from "./ui-style.js";
function paragraphText(p) {
    return p.runs.map((r) => r.text).join("");
}
function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function deepClone(v) {
    return JSON.parse(JSON.stringify(v));
}
function redistributeText(baseRuns, next) {
    if (baseRuns.length === 0)
        return [{ text: next }];
    if (baseRuns.length === 1)
        return [{ ...deepClone(baseRuns[0]), text: next }];
    const lens = baseRuns.map((r) => r.text.length);
    const total = lens.reduce((a, b) => a + b, 0);
    if (total === 0) {
        return baseRuns.map((r, i) => ({ ...deepClone(r), text: i === 0 ? next : "" }));
    }
    let consumed = 0;
    const out = [];
    for (let i = 0; i < baseRuns.length; i++) {
        const isLast = i === baseRuns.length - 1;
        const portion = isLast ? next.length - consumed : Math.round((lens[i] / total) * next.length);
        const slice = next.slice(consumed, consumed + Math.max(0, portion));
        out.push({ ...deepClone(baseRuns[i]), text: slice });
        consumed += slice.length;
    }
    return out;
}
function walkTextShapes(shapes, out) {
    for (const s of shapes) {
        if (s.kind === "text") {
            out.push({ shapeId: s.id, text: s });
            continue;
        }
        if (s.kind !== "group")
            continue;
        for (const c of s.children) {
            if (c.kind === "text" && !c.cellMeta?.hidden) {
                out.push({ shapeId: c.id, text: c });
            }
            else if (c.kind === "group") {
                walkTextShapes([c], out);
            }
        }
    }
}
/** 收集 deck 内所有文本命中（按 slide → shape → para → offset 顺序）。 */
export function collectTextHits(pres, query, opts) {
    const q = query;
    if (!q)
        return [];
    const caseSensitive = opts?.caseSensitive ?? false;
    const flags = caseSensitive ? "g" : "gi";
    const re = new RegExp(escapeRegex(q), flags);
    const hits = [];
    for (let slideIdx = 0; slideIdx < pres.slides.length; slideIdx++) {
        const slide = pres.slides[slideIdx];
        const targets = [];
        for (const layer of slide.layers) {
            if (!layer.visible)
                continue;
            walkTextShapes(layer.shapes, targets);
        }
        for (const { shapeId, text } of targets) {
            text.paragraphs.forEach((para, paraIdx) => {
                const flat = paragraphText(para);
                re.lastIndex = 0;
                let m;
                while ((m = re.exec(flat)) !== null) {
                    hits.push({
                        slideIdx,
                        shapeId,
                        paraIdx,
                        start: m.index,
                        end: m.index + m[0].length,
                    });
                    if (m[0].length === 0) {
                        re.lastIndex++;
                    }
                }
            });
        }
    }
    return hits;
}
export function replaceParagraphRange(paragraphs, paraIdx, start, end, replacement) {
    const next = paragraphs.map(deepClone);
    const p = next[paraIdx];
    if (!p)
        return next;
    const flat = paragraphText(p);
    const merged = flat.slice(0, start) + replacement + flat.slice(end);
    next[paraIdx] = { ...p, runs: redistributeText(p.runs, merged) };
    return next;
}
export function replaceAllInParagraphs(paragraphs, find, replace, caseSensitive) {
    if (!find)
        return null;
    const flags = caseSensitive ? "g" : "gi";
    const re = new RegExp(escapeRegex(find), flags);
    let changed = false;
    const next = paragraphs.map((para) => {
        const flat = paragraphText(para);
        const merged = flat.replace(re, replace);
        if (merged === flat)
            return para;
        changed = true;
        return { ...deepClone(para), runs: redistributeText(para.runs, merged) };
    });
    return changed ? next : null;
}
function hitKey(h) {
    return `${h.slideIdx}:${h.shapeId}:${h.paraIdx}:${h.start}`;
}
function navigateToHit(ctx, hit) {
    ctx.gotoSlide(hit.slideIdx);
    ctx.selectShape(hit.shapeId);
}
function inputStyle() {
    return "width:100%;box-sizing:border-box;" + DIALOG_INPUT_CSS;
}
function btnStyle(primary = false) {
    return primary ? DIALOG_BTN_PRIMARY_CSS : DIALOG_BTN_SECONDARY_CSS;
}
export function openFindReplacePanel(doc, ctx, mode = "find") {
    doc.querySelectorAll("[data-ppt-find-replace]").forEach((n) => n.remove());
    let hits = [];
    let cursor = -1;
    const panel = doc.createElement("div");
    panel.dataset.pptFindReplace = "1";
    panel.style.cssText = [
        "position:fixed",
        "top:72px",
        "right:16px",
        `z-index:${Z_FIND_REPLACE}`,
        "width:min(420px,calc(100vw - 32px))",
        "background:var(--popover)",
        "color:var(--popover-foreground)",
        "border:1px solid var(--border)",
        "border-radius:var(--radius-lg)",
        "box-shadow:var(--shadow-lg)",
        "font:12px system-ui,sans-serif",
        "display:flex",
        "flex-direction:column",
    ].join(";");
    const header = doc.createElement("div");
    header.style.cssText =
        "display:flex;align-items:center;padding:8px 12px;border-bottom:1px solid var(--border);font-weight:600;font-size:13px";
    const title = doc.createElement("span");
    title.style.flex = "1";
    const closeBtn = doc.createElement("button");
    closeBtn.textContent = "×";
    closeBtn.title = t("findReplace.close");
    closeBtn.style.cssText =
        "background:transparent;border:none;color:var(--muted-foreground);cursor:pointer;font-size:18px;line-height:1;padding:0 4px";
    header.append(title, closeBtn);
    panel.appendChild(header);
    const body = doc.createElement("div");
    body.style.cssText = "padding:12px;display:flex;flex-direction:column;gap:8px";
    panel.appendChild(body);
    const findLbl = doc.createElement("label");
    findLbl.textContent = t("findReplace.findLabel");
    findLbl.style.cssText = "color:var(--muted-foreground)";
    const findInput = doc.createElement("input");
    findInput.type = "text";
    findInput.style.cssText = inputStyle();
    const replaceBox = doc.createElement("div");
    replaceBox.style.display = mode === "replace" ? "flex" : "none";
    replaceBox.style.flexDirection = "column";
    replaceBox.style.gap = "4px";
    const replaceLbl = doc.createElement("label");
    replaceLbl.textContent = t("findReplace.replaceLabel");
    replaceLbl.style.cssText = "color:var(--muted-foreground)";
    const replaceInput = doc.createElement("input");
    replaceInput.type = "text";
    replaceInput.style.cssText = inputStyle();
    replaceBox.append(replaceLbl, replaceInput);
    const caseRow = doc.createElement("label");
    caseRow.style.cssText = "display:flex;align-items:center;gap:6px;color:var(--muted-foreground);cursor:pointer";
    const caseCb = doc.createElement("input");
    caseCb.type = "checkbox";
    caseCb.className = CHECK_CLASS;
    const caseText = doc.createElement("span");
    caseText.textContent = t("findReplace.matchCase");
    caseRow.append(caseCb, caseText);
    const status = doc.createElement("div");
    status.style.cssText = "color:var(--muted-foreground);min-height:18px;font-size:11px";
    const btnRow = doc.createElement("div");
    btnRow.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;margin-top:4px";
    const mkBtn = (label, primary = false) => {
        const b = doc.createElement("button");
        b.textContent = label;
        b.style.cssText = btnStyle(primary);
        return b;
    };
    const findPrevBtn = mkBtn(t("findReplace.findPrev"));
    const findNextBtn = mkBtn(t("findReplace.findNext"), true);
    const replaceBtn = mkBtn(t("findReplace.replace"));
    const replaceAllBtn = mkBtn(t("findReplace.replaceAll"));
    replaceBtn.style.display = mode === "replace" ? "" : "none";
    replaceAllBtn.style.display = mode === "replace" ? "" : "none";
    btnRow.append(findPrevBtn, findNextBtn, replaceBtn, replaceAllBtn);
    body.append(findLbl, findInput, replaceBox, caseRow, status, btnRow);
    doc.body.appendChild(panel);
    const setTitle = () => {
        title.textContent = mode === "replace" ? t("findReplace.titleReplace") : t("findReplace.titleFind");
    };
    setTitle();
    const refreshStatus = () => {
        if (!findInput.value.trim()) {
            status.textContent = "";
            return;
        }
        if (hits.length === 0) {
            status.textContent = t("findReplace.noMatches");
            return;
        }
        const hit = hits[cursor];
        if (!hit) {
            status.textContent = t("findReplace.matchCount", { n: hits.length });
            return;
        }
        status.textContent = t("findReplace.matchStatus", {
            current: cursor + 1,
            total: hits.length,
            slide: hit.slideIdx + 1,
        });
    };
    const rebuildHits = (keepCursorKey) => {
        hits = collectTextHits(ctx.getPresentation(), findInput.value, {
            caseSensitive: caseCb.checked,
        });
        if (hits.length === 0) {
            cursor = -1;
        }
        else if (keepCursorKey) {
            const idx = hits.findIndex((h) => hitKey(h) === keepCursorKey);
            cursor = idx >= 0 ? idx : 0;
        }
        else {
            cursor = -1;
        }
        refreshStatus();
    };
    const goToCursor = () => {
        const hit = hits[cursor];
        if (!hit)
            return;
        navigateToHit(ctx, hit);
        refreshStatus();
    };
    const findNext = () => {
        const q = findInput.value;
        if (!q)
            return;
        if (hits.length === 0 || cursor < 0) {
            rebuildHits();
            if (hits.length === 0)
                return;
            cursor = 0;
        }
        else {
            cursor = (cursor + 1) % hits.length;
        }
        goToCursor();
    };
    const findPrev = () => {
        const q = findInput.value;
        if (!q)
            return;
        if (hits.length === 0) {
            rebuildHits();
            if (hits.length === 0)
                return;
            cursor = hits.length - 1;
        }
        else if (cursor < 0) {
            cursor = hits.length - 1;
        }
        else {
            cursor = (cursor - 1 + hits.length) % hits.length;
        }
        goToCursor();
    };
    const applyReplaceCurrent = () => {
        const hit = hits[cursor];
        if (!hit)
            return;
        const slide = ctx.getPresentation().slides[hit.slideIdx];
        if (!slide)
            return;
        const shape = findShape(slide, hit.shapeId);
        if (!shape || shape.kind !== "text")
            return;
        const nextParas = replaceParagraphRange(shape.paragraphs, hit.paraIdx, hit.start, hit.end, replaceInput.value);
        const keyBefore = hitKey(hit);
        ctx.executeCommand(new SetParagraphsCmd(hit.slideIdx, hit.shapeId, nextParas));
        rebuildHits(keyBefore);
        if (hits.length > 0) {
            if (cursor >= hits.length)
                cursor = hits.length - 1;
            goToCursor();
        }
    };
    const applyReplaceAll = () => {
        const find = findInput.value;
        if (!find)
            return;
        const replace = replaceInput.value;
        const caseSensitive = caseCb.checked;
        const pres = ctx.getPresentation();
        const cmds = [];
        for (let slideIdx = 0; slideIdx < pres.slides.length; slideIdx++) {
            const slide = pres.slides[slideIdx];
            const targets = [];
            for (const layer of slide.layers) {
                if (!layer.visible)
                    continue;
                walkTextShapes(layer.shapes, targets);
            }
            for (const { shapeId, text } of targets) {
                const next = replaceAllInParagraphs(text.paragraphs, find, replace, caseSensitive);
                if (next)
                    cmds.push(new SetParagraphsCmd(slideIdx, shapeId, next));
            }
        }
        if (cmds.length === 0) {
            status.textContent = t("findReplace.noMatches");
            return;
        }
        if (ctx.executeBatch) {
            ctx.executeBatch(t("findReplace.replaceAll"), cmds);
        }
        else {
            for (const cmd of cmds)
                ctx.executeCommand(cmd);
        }
        rebuildHits();
        if (hits.length > 0) {
            cursor = 0;
            goToCursor();
        }
    };
    findInput.addEventListener("input", () => {
        cursor = -1;
        rebuildHits();
    });
    caseCb.addEventListener("change", () => {
        cursor = -1;
        rebuildHits();
    });
    findNextBtn.addEventListener("click", findNext);
    findPrevBtn.addEventListener("click", findPrev);
    replaceBtn.addEventListener("click", applyReplaceCurrent);
    replaceAllBtn.addEventListener("click", applyReplaceAll);
    findInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            if (e.shiftKey)
                findPrev();
            else
                findNext();
        }
        else if (e.key === "Escape") {
            e.preventDefault();
            close();
        }
    });
    const onDocKey = (e) => {
        if (e.key === "Escape" && doc.body.contains(panel)) {
            e.preventDefault();
            close();
        }
    };
    doc.addEventListener("keydown", onDocKey);
    const close = () => {
        doc.removeEventListener("keydown", onDocKey);
        panel.remove();
    };
    closeBtn.addEventListener("click", close);
    findInput.focus();
    return {
        close,
        focusFind: () => findInput.focus(),
    };
}
