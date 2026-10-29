// 编辑器内嵌模态对话框（取代浏览器原生 prompt / confirm / alert）。
//
// 设计原则：
//   1. 一个通用 showDialog 框架：负责 overlay / panel / 标题 / 关闭 / Esc / 点击外部关闭。
//      具体业务面板（WordArt 样式选择、Symbol picker、Hyperlink 编辑器）只需声明
//      内容构造器和一个 onSubmit 回调。
//   2. 全部使用与 ribbon / inspector / context-menu 一致的暗色 token 主题，
//      保持视觉风格统一。
//   3. 返回 Promise：resolve(value) 表示用户确认提交，resolve(null) 表示取消。
//      —— 让调用方写法对称：const v = await openWordArt(doc); if (!v) return;
//   4. 不依赖任何 React / Vue 等框架，只用原生 DOM。
import { t } from "./i18n/index.js";
import { mkLucideIconButton } from "./icons.js";
import { CHECK_CLASS, COLOR_SWATCH_CLASS, DIALOG_INPUT_CSS, Z_MODAL, closeRibbonMoreDialogs } from "./ui-style.js";
import { isSafeExternalUrl, sanitizeExternalUrl } from "@sliiu/present-core";
import { bindFontFamilyCombobox } from "./font-list.js";
import { fontPxFromPt, formatFontPt } from "./font-size.js";
import { bindCombobox, bindModalDismiss } from "@sliiu/present-ui";
/** Editor task dialog: backdrop, Esc, Enter, title close, and one task at a time. */
export function bindEditorModal(opts) {
    return bindModalDismiss({
        ...opts,
        layer: "task",
        closeLabel: opts.closeLabel ?? t("dialog.dismiss"),
    });
}
export function showDialog(doc, opts) {
    closeRibbonMoreDialogs(doc);
    return new Promise((resolve) => {
        const overlay = doc.createElement("div");
        overlay.dataset.pptDialog = "1";
        overlay.style.cssText = [
            "position:fixed",
            "inset:0",
            "background:var(--overlay-backdrop, rgba(0,0,0,0.65))",
            `z-index:${Z_MODAL}`,
            "display:flex",
            "align-items:center",
            "justify-content:center",
            "font:12px system-ui,sans-serif",
        ].join(";");
        const panel = doc.createElement("div");
        panel.style.cssText = [
            "background:var(--popover)",
            "color:var(--popover-foreground)",
            "border:1px solid var(--border)",
            "border-radius:var(--radius-modal, 12px)",
            "box-shadow:var(--shadow-lg)",
            `min-width:${opts.width ?? 420}px`,
            "max-width:90vw",
            "max-height:90vh",
            "display:flex",
            "flex-direction:column",
            "overflow:hidden",
        ].join(";");
        overlay.appendChild(panel);
        // 标题栏
        const header = doc.createElement("div");
        header.style.cssText = [
            "display:flex",
            "align-items:center",
            "padding:10px 14px",
            "background:color-mix(in srgb, var(--card) 85%, transparent)",
            "border-bottom:1px solid var(--border)",
            "font-size:13px",
            "font-weight:600",
        ].join(";");
        const titleEl = doc.createElement("span");
        titleEl.textContent = opts.title;
        titleEl.style.flex = "1";
        const closeBtn = mkLucideIconButton(doc, "x", "", t("dialog.dismiss"), 14);
        closeBtn.style.cssText =
            "background:transparent;color:var(--muted-foreground);border:none;padding:0 4px;cursor:pointer;font:inherit;display:inline-flex;align-items:center;justify-content:center";
        closeBtn.addEventListener("click", () => close(null));
        header.append(titleEl, closeBtn);
        panel.appendChild(header);
        // 内容区
        const body = doc.createElement("div");
        body.className = "ppt-scroll";
        body.style.cssText = [
            "padding:14px",
            "overflow:auto",
            "flex:1",
            "min-height:0",
        ].join(";");
        panel.appendChild(body);
        // 默认按钮区
        const footer = doc.createElement("div");
        footer.style.cssText = [
            "display:flex",
            "gap:8px",
            "padding:10px 14px",
            "background:var(--card)",
            "border-top:1px solid var(--border)",
            "justify-content:flex-end",
        ].join(";");
        const cancelBtn = doc.createElement("button");
        cancelBtn.textContent = opts.cancelLabel ?? t("dialog.cancel");
        cancelBtn.style.cssText = btnStyle(false);
        cancelBtn.addEventListener("click", () => close(null));
        const okBtn = doc.createElement("button");
        okBtn.textContent = opts.okLabel ?? t("dialog.ok");
        okBtn.style.cssText = btnStyle(true);
        okBtn.addEventListener("click", () => submit());
        let okEnabled = opts.okEnabled ?? true;
        const updateOkState = () => {
            okBtn.disabled = !okEnabled;
            okBtn.style.opacity = okEnabled ? "1" : "0.4";
            okBtn.style.cursor = okEnabled ? "pointer" : "default";
        };
        updateOkState();
        if (opts.okLabel !== "") {
            if (!opts.hideCancel)
                footer.append(cancelBtn);
            footer.append(okBtn);
            panel.appendChild(footer);
        }
        let closed = false;
        let getResult = null;
        let release = () => { };
        const finish = (value) => {
            if (closed)
                return;
            closed = true;
            release();
            overlay.remove();
            resolve(value);
        };
        const submit = () => {
            if (closed || !okEnabled || !getResult)
                return false;
            const v = getResult();
            // null 表示业务校验未通过 → 保持对话框开启；非空则关闭并 resolve。
            if (v === null || v === undefined)
                return false;
            finish(v);
            return true;
        };
        const close = (value) => {
            finish(value);
        };
        const ctx = {
            doc,
            close,
            setOkEnabled: (enabled) => {
                okEnabled = enabled;
                updateOkState();
            },
            triggerSubmit: () => submit(),
        };
        const ret = opts.buildBody(body, ctx);
        if (typeof ret === "function")
            getResult = ret;
        if (!closed) {
            release = bindEditorModal({
                doc,
                overlay,
                onCancel: () => close(null),
                onSubmit: () => submit(),
                closeButton: false,
            }).release;
        }
        doc.body.appendChild(overlay);
    });
}
function btnStyle(primary) {
    if (primary) {
        return [
            "background:var(--primary)",
            "color:var(--primary-foreground)",
            "border:1px solid var(--primary)",
            "border-radius:var(--radius-md)",
            "padding:6px 16px",
            "cursor:pointer",
            "font:inherit",
            "font-weight:500",
        ].join(";");
    }
    return [
        "background:transparent",
        "color:var(--foreground)",
        "border:1px solid var(--input)",
        "border-radius:var(--radius-md)",
        "padding:6px 16px",
        "cursor:pointer",
        "font:inherit",
    ].join(";");
}
// ---------- 业务对话框：WordArt 编辑器 ----------
//
// 设计：
//   1. 完整的 WordArt 状态（text + fontFamily + fontSize + bold + italic +
//      fill + outline + shadow）—— 与 OOXML §21.1.2.3.x rPr 对齐。
//   2. 内置 9 个 PowerPoint 风格的 preset；用户点击 preset → 覆盖所有字段；
//      之后用户可以自由微调任意字段（点击 preset 后字段不再被锁定）。
//   3. 实时预览面板：上方一个大区域，按当前所有字段渲染 "Aa" 样张。
//   4. 编辑模式：传入 existing 时，所有字段按现有 shape 反推后预填；提交后由
//      调用方决定是 AddShape 还是 SetTextStyle。
// WordArt 预设与状态类型 —— 抽到 DOM-free 的 word-art-presets.ts
// （@sliiu/present-ai 的 Node MCP server 也要用），这里 re-export 保持既有 import 面不变。
import { PRESET_FONT_DEFAULT, WORDART_PRESETS, defaultWordArtState, } from "./word-art-presets.js";
export { WORDART_PRESETS, defaultWordArtState, };
// 字体下拉选项 —— PowerPoint 对 WordArt 不强制特定字体，给一组常见 PPT 默认字体。
// 第一项与默认主题字体一致。
const WORDART_FONT_OPTIONS = [
    { value: PRESET_FONT_DEFAULT, label: "Calibri" },
    { value: "'Calibri Light', 'PingFang SC', sans-serif", label: "Calibri Light" },
    { value: "Arial, sans-serif", label: "Arial" },
    { value: "'Arial Black', sans-serif", label: "Arial Black" },
    { value: "Impact, sans-serif", label: "Impact" },
    { value: "Helvetica, Arial, sans-serif", label: "Helvetica" },
    { value: "'Times New Roman', serif", label: "Times New Roman" },
    { value: "Georgia, serif", label: "Georgia" },
    { value: "'Courier New', monospace", label: "Courier New" },
    { value: "'Comic Sans MS', cursive", label: "Comic Sans MS" },
    { value: "Verdana, sans-serif", label: "Verdana" },
];
// 把 shadow kind 翻译成可视化 CSS（dialog 预览 + gallery 缩略图用）。
export function wordArtShadowCss(kind, color) {
    if (!kind)
        return "";
    if (kind === "hard")
        return `text-shadow:3px 3px 0 ${color}`;
    if (kind === "glow")
        return `text-shadow:0 0 6px ${color},0 0 10px ${color}`;
    if (kind === "inner")
        return `text-shadow:0 1px 1px ${withAlpha(color, 0.7)}`;
    if (kind === "reflection")
        return `-webkit-box-reflect:below 3px linear-gradient(transparent, ${withAlpha(color, 0.35)})`;
    return `text-shadow:2px 2px 4px ${withAlpha(color, 0.6)}`;
}
export function wordArtFillCss(state) {
    const g = state.fillGradient;
    if (g) {
        return [
            `background-image:linear-gradient(${g.angle}deg, ${g.from}, ${g.to})`,
            "-webkit-background-clip:text",
            "background-clip:text",
            "color:transparent",
            "-webkit-text-fill-color:transparent",
        ].join(";");
    }
    const show = state.fillColor !== "transparent";
    return "color:" + (show ? state.fillColor : "transparent");
}
// 把 #rrggbb / #rrggbbaa 包成 rgba(...)，用于 gallery 预览的半透明阴影。
function withAlpha(hex, a) {
    if (!/^#[0-9a-f]{6}$/i.test(hex))
        return hex;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${a})`;
}
export function openWordArtDialog(doc, initial, 
// editing=true 时 OK 按钮显示「应用」而非「插入」，并且默认按钮区显示 Apply 字样。
editing = false) {
    return showDialog(doc, {
        title: editing ? t("dialog.wordart.titleEdit") : t("dialog.wordart.title"),
        width: 600,
        buildBody: (body, ctx) => {
            void ctx;
            // 当前编辑状态。所有字段对 state 的修改都会触发 updatePreview()。
            const state = { ...initial };
            // ---- preset gallery ----
            const galleryLbl = doc.createElement("div");
            galleryLbl.textContent = t("dialog.wordart.presetLabel");
            galleryLbl.style.cssText = "color:var(--muted-foreground);margin-bottom:6px;font-size:11px;letter-spacing:.4px;text-transform:uppercase";
            body.appendChild(galleryLbl);
            const gallery = doc.createElement("div");
            // 5×3 网格，对齐 PowerPoint 2013+ Office 默认 WordArt gallery 的 15 格布局。
            // 用浅灰底（#f3f4f6 类）让带白填充的样式（如 fillWhiteOutlineAccent1Soft）可见。
            gallery.style.cssText = "display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:14px";
            const cells = [];
            for (const p of WORDART_PRESETS) {
                const cell = doc.createElement("button");
                cell.title = t(`dialog.wordart.preset.${p.id}`);
                const s = p.state;
                cell.style.cssText = [
                    "border:2px solid transparent",
                    "border-radius:6px",
                    "padding:10px 4px",
                    "cursor:pointer",
                    "font-size:26px",
                    s.bold ? "font-weight:700" : "font-weight:400",
                    // 浅色棋盘格背景，让白色/透明 fill 与彩色 fill 都看得清。
                    "background:#f3f4f6",
                    wordArtFillCss(s),
                    "min-height:64px",
                    "font-family:" + s.fontFamily,
                    s.italic ? "font-style:italic" : "",
                    s.outlineColor ? `-webkit-text-stroke:${s.outlineWidth}px ${s.outlineColor}` : "",
                    s.shadowKind ? wordArtShadowCss(s.shadowKind, s.shadowColor) : "",
                    "transition:border-color .12s",
                ].filter(Boolean).join(";");
                cell.textContent = "A";
                cell.addEventListener("click", () => {
                    Object.assign(state, p.state);
                    syncFromState();
                    for (const c of cells)
                        c.style.borderColor = "transparent";
                    cell.style.borderColor = "var(--primary)";
                });
                cells.push(cell);
                gallery.appendChild(cell);
            }
            body.appendChild(gallery);
            // ---- 文字 ----
            const textInput = mkInput(doc, "text", state.text);
            textInput.placeholder = initial.text || "";
            body.appendChild(mkField(doc, t("dialog.wordart.textLabel"), textInput));
            // ---- 字体行：family / size / bold / italic ----
            const fontRow = doc.createElement("div");
            fontRow.style.cssText = "display:grid;grid-template-columns:1fr 80px auto auto;gap:8px;margin-bottom:10px;align-items:end";
            const familyInput = doc.createElement("input");
            familyInput.type = "text";
            familyInput.style.cssText = inputStyle();
            familyInput.value = state.fontFamily;
            const familyCombo = bindCombobox(familyInput, {
                options: WORDART_FONT_OPTIONS.map((f) => ({ value: f.value, label: f.label })),
                optionStyle: (item) => `font-family:${item.value}`,
                onChange: (v) => {
                    state.fontFamily = v;
                    updatePreview();
                },
            });
            familyCombo.el.style.width = "100%";
            const sizeInput = mkInput(doc, "number", formatFontPt(state.fontSize));
            sizeInput.min = "6";
            sizeInput.max = "400";
            const boldBtn = mkToggleBtn(doc, "B", state.bold);
            boldBtn.style.fontWeight = "700";
            const italicBtn = mkToggleBtn(doc, "I", state.italic);
            italicBtn.style.fontStyle = "italic";
            const familyField = mkField(doc, t("dialog.wordart.fontLabel"), familyCombo.el);
            const sizeField = mkField(doc, t("dialog.wordart.sizeLabel"), sizeInput);
            // 把已经包好的 field 直接插入 grid。flex 让 label 在同一行的高度对齐。
            familyField.style.marginBottom = "0";
            sizeField.style.marginBottom = "0";
            fontRow.append(familyField, sizeField, boldBtn, italicBtn);
            body.appendChild(fontRow);
            // ---- Fill 行 ----
            const fillBox = doc.createElement("div");
            fillBox.style.cssText = "display:flex;gap:10px;align-items:center;margin-bottom:8px";
            const fillEnable = mkCheck(doc, t("dialog.wordart.fillEnable"), state.fillColor !== "transparent");
            const fillSwatch = mkColor(doc, state.fillColor === "transparent" ? "#1d4ed8" : state.fillColor);
            const fillLabel = doc.createElement("span");
            fillLabel.textContent = t("dialog.wordart.fillLabel");
            fillLabel.style.color = "var(--muted-foreground)";
            const gradientEnable = mkCheck(doc, t("dialog.wordart.gradientEnable"), state.fillGradient !== null);
            const gradientSwatch = mkColor(doc, state.fillGradient?.to ?? "#ffffff");
            fillBox.append(fillLabel, fillSwatch, fillEnable, gradientEnable, gradientSwatch);
            body.appendChild(fillBox);
            // ---- Outline 行 ----
            const outlineBox = doc.createElement("div");
            outlineBox.style.cssText = "display:flex;gap:10px;align-items:center;margin-bottom:8px";
            const outlineEnable = mkCheck(doc, t("dialog.wordart.outlineEnable"), state.outlineColor !== null);
            const outlineSwatch = mkColor(doc, state.outlineColor ?? "#1e3a8a");
            const outlineWidthInp = mkInput(doc, "number", String(state.outlineWidth));
            outlineWidthInp.min = "0";
            outlineWidthInp.max = "20";
            outlineWidthInp.step = "0.5";
            outlineWidthInp.style.width = "70px";
            const outlineLabel = doc.createElement("span");
            outlineLabel.textContent = t("dialog.wordart.outlineLabel");
            outlineLabel.style.color = "var(--muted-foreground)";
            const widthLabel = doc.createElement("span");
            widthLabel.textContent = t("dialog.wordart.widthLabel");
            widthLabel.style.color = "var(--muted-foreground)";
            outlineBox.append(outlineLabel, outlineSwatch, widthLabel, outlineWidthInp, outlineEnable);
            body.appendChild(outlineBox);
            // ---- Shadow 行（支持 4 种类型：none / soft / hard / glow） ----
            const shadowBox = doc.createElement("div");
            shadowBox.style.cssText = "display:flex;gap:10px;align-items:center;margin-bottom:14px";
            const shadowLabel = doc.createElement("span");
            shadowLabel.textContent = t("dialog.wordart.shadowLabel");
            shadowLabel.style.color = "var(--muted-foreground)";
            const shadowKindSel = doc.createElement("select");
            shadowKindSel.style.cssText = inputStyle();
            shadowKindSel.style.width = "auto";
            const SHADOW_KINDS = [
                { value: "", key: "dialog.wordart.shadow.none" },
                { value: "soft", key: "dialog.wordart.shadow.soft" },
                { value: "hard", key: "dialog.wordart.shadow.hard" },
                { value: "glow", key: "dialog.wordart.shadow.glow" },
                { value: "inner", key: "dialog.wordart.shadow.inner" },
                { value: "reflection", key: "dialog.wordart.shadow.reflection" },
            ];
            for (const k of SHADOW_KINDS) {
                const o = doc.createElement("option");
                o.value = k.value;
                o.textContent = t(k.key);
                shadowKindSel.appendChild(o);
            }
            shadowKindSel.value = state.shadowKind ?? "";
            const shadowSwatch = mkColor(doc, state.shadowColor);
            shadowBox.append(shadowLabel, shadowKindSel, shadowSwatch);
            body.appendChild(shadowBox);
            // ---- 实时预览 ----
            const previewLbl = doc.createElement("div");
            previewLbl.textContent = t("dialog.wordart.previewLabel");
            previewLbl.style.cssText = "color:var(--muted-foreground);margin-bottom:6px;font-size:11px;letter-spacing:.4px;text-transform:uppercase";
            body.appendChild(previewLbl);
            const preview = doc.createElement("div");
            preview.style.cssText = [
                "background:var(--editor-stage)",
                "border:1px solid var(--border)",
                "border-radius:6px",
                "padding:18px 14px",
                "min-height:80px",
                "display:flex",
                "align-items:center",
                "justify-content:center",
                "overflow:hidden",
                "text-align:center",
            ].join(";");
            const previewText = doc.createElement("span");
            preview.appendChild(previewText);
            body.appendChild(preview);
            // 把 state 写回所有 input 控件（preset 切换 / 初次进入）。
            function syncFromState() {
                textInput.value = state.text;
                familyCombo.setValue(state.fontFamily);
                sizeInput.value = formatFontPt(state.fontSize);
                toggleBtn(boldBtn, state.bold);
                toggleBtn(italicBtn, state.italic);
                fillEnable.checked = state.fillColor !== "transparent";
                if (state.fillColor !== "transparent")
                    fillSwatch.value = state.fillColor;
                gradientEnable.checked = state.fillGradient !== null;
                if (state.fillGradient)
                    gradientSwatch.value = normalizeColorForInput(state.fillGradient.to);
                outlineEnable.checked = state.outlineColor !== null;
                if (state.outlineColor)
                    outlineSwatch.value = state.outlineColor;
                outlineWidthInp.value = String(state.outlineWidth);
                shadowKindSel.value = state.shadowKind ?? "";
                shadowSwatch.value = normalizeColorForInput(state.shadowColor);
                updatePreview();
            }
            function updatePreview() {
                const tx = state.text || initial.text || "Aa";
                previewText.textContent = tx;
                previewText.style.cssText = [
                    "font-family:" + state.fontFamily,
                    "font-size:" + Math.min(state.fontSize, 56) + "px",
                    state.bold ? "font-weight:700" : "font-weight:400",
                    state.italic ? "font-style:italic" : "",
                    wordArtFillCss(state),
                    "letter-spacing:0.5px",
                    "line-height:1.1",
                    state.outlineColor ? `-webkit-text-stroke:${state.outlineWidth}px ${state.outlineColor}` : "",
                    state.shadowKind ? wordArtShadowCss(state.shadowKind, state.shadowColor) : "",
                ].filter(Boolean).join(";");
            }
            // 字段事件 → 写回 state → updatePreview。
            textInput.addEventListener("input", () => { state.text = textInput.value; updatePreview(); });
            sizeInput.addEventListener("input", () => {
                const n = Number(sizeInput.value);
                if (Number.isFinite(n) && n > 0) {
                    state.fontSize = fontPxFromPt(n, 6, 400);
                    updatePreview();
                }
            });
            boldBtn.addEventListener("click", () => { state.bold = !state.bold; toggleBtn(boldBtn, state.bold); updatePreview(); });
            italicBtn.addEventListener("click", () => { state.italic = !state.italic; toggleBtn(italicBtn, state.italic); updatePreview(); });
            fillEnable.addEventListener("change", () => {
                state.fillColor = fillEnable.checked ? fillSwatch.value : "transparent";
                updatePreview();
            });
            fillSwatch.addEventListener("input", () => {
                if (fillEnable.checked) {
                    state.fillColor = fillSwatch.value;
                    if (state.fillGradient)
                        state.fillGradient = { ...state.fillGradient, from: fillSwatch.value };
                    updatePreview();
                }
            });
            gradientEnable.addEventListener("change", () => {
                state.fillGradient = gradientEnable.checked
                    ? { from: state.fillColor === "transparent" ? fillSwatch.value : state.fillColor, to: gradientSwatch.value, angle: 90 }
                    : null;
                updatePreview();
            });
            gradientSwatch.addEventListener("input", () => {
                if (!state.fillGradient)
                    return;
                state.fillGradient = { ...state.fillGradient, to: gradientSwatch.value };
                updatePreview();
            });
            outlineEnable.addEventListener("change", () => {
                state.outlineColor = outlineEnable.checked ? outlineSwatch.value : null;
                updatePreview();
            });
            outlineSwatch.addEventListener("input", () => {
                if (outlineEnable.checked) {
                    state.outlineColor = outlineSwatch.value;
                    updatePreview();
                }
            });
            outlineWidthInp.addEventListener("input", () => {
                const n = Number(outlineWidthInp.value);
                if (Number.isFinite(n) && n >= 0) {
                    state.outlineWidth = n;
                    updatePreview();
                }
            });
            shadowKindSel.addEventListener("change", () => {
                const v = shadowKindSel.value;
                state.shadowKind = v === "" ? null : v;
                updatePreview();
            });
            shadowSwatch.addEventListener("input", () => {
                // 始终保留颜色 —— 用户可以先选好颜色再切到 soft/hard/glow，体验更顺。
                state.shadowColor = shadowSwatch.value;
                updatePreview();
            });
            setTimeout(() => textInput.focus(), 0);
            updatePreview();
            return () => {
                const text = state.text.trim();
                if (!text)
                    return null;
                return { ...state, text };
            };
        },
        okLabel: editing ? t("dialog.wordart.apply") : t("dialog.wordart.ok"),
    });
}
// ---------- WordArt dialog 用的小控件工厂 ----------
function mkInput(doc, type, value) {
    const i = doc.createElement("input");
    i.type = type;
    i.value = value;
    i.style.cssText = inputStyle();
    return i;
}
function mkField(doc, label, control) {
    const wrap = doc.createElement("div");
    wrap.style.cssText = "margin-bottom:10px";
    const lbl = doc.createElement("label");
    lbl.textContent = label;
    lbl.style.cssText = "display:block;color:var(--muted-foreground);margin-bottom:4px";
    wrap.append(lbl, control);
    return wrap;
}
function mkColor(doc, value) {
    const i = doc.createElement("input");
    i.type = "color";
    // <input type=color> 不支持 "transparent" / 命名色 / 8 位 hex；统一规范成 #rrggbb。
    i.value = normalizeColorForInput(value);
    i.className = COLOR_SWATCH_CLASS;
    i.style.cssText = "width:32px";
    return i;
}
function normalizeColorForInput(v) {
    if (/^#[0-9a-f]{6}$/i.test(v))
        return v;
    if (/^#[0-9a-f]{3}$/i.test(v)) {
        const r = v[1], g = v[2], b = v[3];
        return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
    }
    return "#000000";
}
function mkCheck(doc, label, checked) {
    const wrap = doc.createElement("label");
    wrap.style.cssText = "display:inline-flex;align-items:center;gap:6px;color:var(--foreground);cursor:pointer";
    const cb = doc.createElement("input");
    cb.type = "checkbox";
    cb.className = CHECK_CLASS;
    cb.checked = checked;
    const span = doc.createElement("span");
    span.textContent = label;
    wrap.append(cb, span);
    Object.defineProperty(wrap, "checked", {
        get: () => cb.checked,
        set: (v) => { cb.checked = v; },
    });
    // change 事件透传给内部 cb，调用方写 wrap.addEventListener("change", ...) 也能 work。
    const origAdd = wrap.addEventListener.bind(wrap);
    wrap.addEventListener = ((type, listener, opts) => {
        if (type === "change" || type === "input")
            cb.addEventListener(type, listener, opts);
        else
            origAdd(type, listener, opts);
    });
    return wrap;
}
function mkToggleBtn(doc, label, on) {
    const b = doc.createElement("button");
    b.textContent = label;
    b.style.cssText = [
        "background:" + (on ? "var(--primary)" : "var(--secondary)"),
        "color:" + (on ? "var(--primary-foreground)" : "var(--foreground)"),
        "border:1px solid " + (on ? "var(--primary)" : "var(--border)"),
        "border-radius:4px",
        "padding:6px 12px",
        "cursor:pointer",
        "font:inherit",
        "min-width:32px",
    ].join(";");
    return b;
}
function toggleBtn(b, on) {
    b.style.background = on ? "var(--primary)" : "var(--secondary)";
    b.style.color = on ? "var(--primary-foreground)" : "var(--foreground)";
    b.style.borderColor = on ? "var(--primary)" : "var(--border)";
}
// ---------- 业务对话框：Symbol picker ----------
// 常用 Unicode 符号库，按主题分组。覆盖 PowerPoint Insert > Symbol 中最常用的子集。
const SYMBOL_GROUPS = [
    { titleKey: "dialog.symbol.cat.basic", chars: ["★", "☆", "♠", "♣", "♥", "♦", "✓", "✗", "✦", "✧", "✪", "✰", "✱", "❀", "❁", "✿"] },
    { titleKey: "dialog.symbol.cat.arrows", chars: ["←", "→", "↑", "↓", "↔", "↕", "⇐", "⇒", "⇑", "⇓", "⇔", "↩", "↪", "↺", "↻", "⤴", "⤵"] },
    { titleKey: "dialog.symbol.cat.math", chars: ["±", "×", "÷", "≠", "≈", "≤", "≥", "∞", "∑", "∏", "√", "∫", "∂", "∇", "∝", "≡", "∈", "∉", "∪", "∩", "⊂", "⊃", "∅", "∀", "∃"] },
    { titleKey: "dialog.symbol.cat.currency", chars: ["$", "€", "£", "¥", "¢", "¤", "₩", "₹", "₽", "₿", "฿"] },
    { titleKey: "dialog.symbol.cat.punct", chars: ["…", "—", "–", "·", "•", "‣", "§", "¶", "©", "®", "™", "°", "′", "″"] },
    { titleKey: "dialog.symbol.cat.misc", chars: ["☀", "☁", "☂", "☃", "☎", "✉", "✏", "✂", "⚡", "⚙", "⚠", "♿", "♻", "☮", "☯", "✈", "♨"] },
    { titleKey: "dialog.symbol.cat.greek", chars: ["α", "β", "γ", "δ", "ε", "ζ", "η", "θ", "λ", "μ", "π", "σ", "φ", "ω", "Δ", "Σ", "Π", "Φ", "Ω"] },
];
export function openSymbolPicker(doc) {
    return showDialog(doc, {
        title: t("dialog.symbol.title"),
        width: 520,
        okLabel: "",
        buildBody: (body, ctx) => {
            // 自定义输入：让用户直接粘贴或敲入符号
            const customRow = doc.createElement("div");
            customRow.style.cssText = "display:flex;gap:8px;align-items:center;margin-bottom:12px";
            const customLbl = doc.createElement("span");
            customLbl.textContent = t("dialog.symbol.customLabel");
            customLbl.style.cssText = "color:var(--muted-foreground)";
            const customInput = doc.createElement("input");
            customInput.type = "text";
            customInput.maxLength = 4;
            customInput.style.cssText = "width:80px;font-size:18px;text-align:center;" + DIALOG_INPUT_CSS;
            const customBtn = doc.createElement("button");
            customBtn.textContent = t("dialog.symbol.insert");
            customBtn.style.cssText = btnStyle(true);
            const submitCustom = () => {
                const v = customInput.value;
                if (!v)
                    return;
                ctx.close(v);
            };
            customBtn.addEventListener("click", submitCustom);
            // Enter 在 customInput 上触发插入（框架级 Enter handler 不知道这个语义；
            // 我们 stopPropagation 防止它再次冒泡触发框架默认 submit）。
            customInput.addEventListener("keydown", (e) => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    e.stopPropagation();
                    submitCustom();
                }
            });
            customRow.append(customLbl, customInput, customBtn);
            body.appendChild(customRow);
            for (const grp of SYMBOL_GROUPS) {
                const h = doc.createElement("div");
                h.textContent = t(grp.titleKey);
                h.style.cssText = "color:var(--muted-foreground);font-size:10px;letter-spacing:.4px;text-transform:uppercase;margin:8px 2px 4px";
                body.appendChild(h);
                const grid = doc.createElement("div");
                grid.style.cssText = "display:grid;grid-template-columns:repeat(12,minmax(32px,1fr));gap:2px";
                for (const ch of grp.chars) {
                    const cell = doc.createElement("button");
                    cell.textContent = ch;
                    cell.title = `U+${ch.codePointAt(0)?.toString(16).toUpperCase().padStart(4, "0")}`;
                    cell.style.cssText = [
                        "background:transparent",
                        "color:var(--foreground)",
                        "border:1px solid var(--border)",
                        "border-radius:3px",
                        "cursor:pointer",
                        "padding:6px 0",
                        "font:inherit",
                        "font-size:18px",
                        "min-height:34px",
                    ].join(";");
                    cell.addEventListener("mouseenter", () => {
                        cell.style.background = "var(--primary)";
                        cell.style.borderColor = "var(--primary)";
                    });
                    cell.addEventListener("mouseleave", () => {
                        cell.style.background = "transparent";
                        cell.style.borderColor = "var(--border)";
                    });
                    cell.addEventListener("click", () => ctx.close(ch));
                    grid.appendChild(cell);
                }
                body.appendChild(grid);
            }
        },
    });
}
// ---------- 业务对话框：Hyperlink 编辑器 ----------
// OOXML §17.16.22 / §22.1.2.51 hlink kind：导航动作 + 仅播放声音。
//
// 解释：
//   - url：跳到外部 URL；target = url
//   - slide：跳到指定 slide 索引（1-based 给用户看）；target = "<index>"
//   - next/prev/first/last/back/endShow：内置导航动作，不需要 target
const HYPERLINK_KINDS = [
    { kind: "url", labelKey: "dialog.hyperlink.kind.url" },
    { kind: "slide", labelKey: "dialog.hyperlink.kind.slide" },
    { kind: "next", labelKey: "dialog.hyperlink.kind.next" },
    { kind: "prev", labelKey: "dialog.hyperlink.kind.prev" },
    { kind: "first", labelKey: "dialog.hyperlink.kind.first" },
    { kind: "last", labelKey: "dialog.hyperlink.kind.last" },
    { kind: "back", labelKey: "dialog.hyperlink.kind.back" },
    { kind: "endShow", labelKey: "dialog.hyperlink.kind.endShow" },
    { kind: "sound", labelKey: "dialog.hyperlink.kind.sound" },
];
export function openHyperlinkDialog(doc, context) {
    return showDialog(doc, {
        title: t("dialog.hyperlink.title"),
        width: 480,
        buildBody: (body, ctx) => {
            const existing = context.existing;
            // kind 选择
            const kindLbl = doc.createElement("label");
            kindLbl.textContent = t("dialog.hyperlink.kindLabel");
            kindLbl.style.cssText = "display:block;color:var(--muted-foreground);margin-bottom:4px";
            const kindSel = doc.createElement("select");
            kindSel.style.cssText = inputStyle() + ";margin-bottom:10px";
            for (const k of HYPERLINK_KINDS) {
                const o = doc.createElement("option");
                o.value = k.kind;
                o.textContent = t(k.labelKey);
                kindSel.appendChild(o);
            }
            kindSel.value = existing?.kind ?? "url";
            body.append(kindLbl, kindSel);
            // url 输入（kind=url 时显示）
            const urlBox = doc.createElement("div");
            urlBox.style.cssText = "margin-bottom:10px";
            const urlLbl = doc.createElement("label");
            urlLbl.textContent = t("dialog.hyperlink.urlLabel");
            urlLbl.style.cssText = "display:block;color:var(--muted-foreground);margin-bottom:4px";
            const urlInput = doc.createElement("input");
            urlInput.type = "url";
            urlInput.placeholder = "https://example.com";
            urlInput.value = existing?.kind === "url" ? (existing.target ?? "") : "";
            urlInput.style.cssText = inputStyle();
            urlBox.append(urlLbl, urlInput);
            body.appendChild(urlBox);
            // slide 选择（kind=slide 时显示）
            const slideBox = doc.createElement("div");
            slideBox.style.cssText = "margin-bottom:10px";
            const slideLbl = doc.createElement("label");
            slideLbl.textContent = t("dialog.hyperlink.slideLabel");
            slideLbl.style.cssText = "display:block;color:var(--muted-foreground);margin-bottom:4px";
            const slideSel = doc.createElement("select");
            slideSel.style.cssText = inputStyle();
            const total = Math.max(1, context.totalSlides);
            for (let i = 0; i < total; i++) {
                const o = doc.createElement("option");
                o.value = String(i + 1);
                o.textContent = t("dialog.hyperlink.slideOption", { n: i + 1 });
                slideSel.appendChild(o);
            }
            // 回填：现有 target 是 1-based 字符串。
            const existingSlideTarget = existing?.kind === "slide" && existing.target ? Number(existing.target) : context.currentSlideIdx + 1;
            slideSel.value = String(Math.max(1, Math.min(total, existingSlideTarget)));
            slideBox.append(slideLbl, slideSel);
            body.appendChild(slideBox);
            // tooltip
            const tipLbl = doc.createElement("label");
            tipLbl.textContent = t("dialog.hyperlink.tooltipLabel");
            tipLbl.style.cssText = "display:block;color:var(--muted-foreground);margin-bottom:4px;margin-top:6px";
            const tipInput = doc.createElement("input");
            tipInput.type = "text";
            tipInput.value = existing?.tooltip ?? "";
            tipInput.style.cssText = inputStyle();
            body.append(tipLbl, tipInput);
            const soundBox = doc.createElement("div");
            soundBox.style.cssText = "margin-top:10px";
            const soundLbl = doc.createElement("label");
            soundLbl.textContent = t("dialog.hyperlink.soundLabel");
            soundLbl.style.cssText = "display:block;color:var(--muted-foreground);margin-bottom:4px";
            let soundSrc = existing?.sound?.src ?? "";
            let soundName = existing?.sound?.name ?? "";
            const soundStatus = doc.createElement("span");
            soundStatus.style.cssText = "font-size:12px;color:var(--foreground);margin-right:8px";
            const refreshSoundStatus = () => {
                soundStatus.textContent = soundSrc
                    ? (soundName || t("dialog.hyperlink.soundAttached"))
                    : t("dialog.hyperlink.soundNone");
            };
            refreshSoundStatus();
            const soundFile = doc.createElement("input");
            soundFile.type = "file";
            soundFile.accept = "audio/*";
            soundFile.style.display = "none";
            const soundBrowse = doc.createElement("button");
            soundBrowse.type = "button";
            soundBrowse.textContent = t("dialog.hyperlink.browseSound");
            soundBrowse.style.cssText = "margin-right:6px;cursor:pointer;font:inherit";
            soundBrowse.addEventListener("click", () => soundFile.click());
            const soundClear = doc.createElement("button");
            soundClear.type = "button";
            soundClear.textContent = t("dialog.hyperlink.clearSound");
            soundClear.style.cssText = "cursor:pointer;font:inherit";
            soundClear.addEventListener("click", () => {
                soundSrc = "";
                soundName = "";
                soundFile.value = "";
                refreshSoundStatus();
                sync();
            });
            soundFile.addEventListener("change", () => {
                const f = soundFile.files?.[0];
                if (!f)
                    return;
                const reader = new FileReader();
                reader.onload = () => {
                    soundSrc = String(reader.result ?? "");
                    soundName = f.name;
                    refreshSoundStatus();
                    sync();
                };
                reader.readAsDataURL(f);
            });
            soundBox.append(soundLbl, soundStatus, soundBrowse, soundClear, soundFile);
            body.appendChild(soundBox);
            // 根据 kind 显示 / 隐藏对应字段
            const sync = () => {
                const k = kindSel.value;
                urlBox.style.display = k === "url" ? "block" : "none";
                slideBox.style.display = k === "slide" ? "block" : "none";
                const okEnabled = k === "url" ? isSafeExternalUrl(urlInput.value)
                    : k === "slide" ? slideSel.value !== ""
                        : k === "sound" ? soundSrc.length > 0
                            : true;
                ctx.setOkEnabled(okEnabled);
            };
            kindSel.addEventListener("change", sync);
            urlInput.addEventListener("input", sync);
            slideSel.addEventListener("change", sync);
            sync();
            setTimeout(() => (kindSel.value === "url" ? urlInput : kindSel).focus(), 0);
            // 移除现有超链接的快捷按钮：只在已有 hyperlink 时显示
            if (existing) {
                const remove = doc.createElement("button");
                remove.textContent = t("dialog.hyperlink.remove");
                remove.style.cssText = [
                    "background:transparent",
                    "color:var(--destructive)",
                    "border:1px solid color-mix(in srgb, var(--destructive) 40%, transparent)",
                    "border-radius:4px",
                    "padding:6px 12px",
                    "cursor:pointer",
                    "font:inherit",
                    "margin-top:14px",
                ].join(";");
                remove.addEventListener("click", () => ctx.close("remove"));
                body.appendChild(remove);
            }
            return () => {
                const k = kindSel.value;
                const tooltip = tipInput.value.trim() || undefined;
                const sound = soundSrc
                    ? { src: soundSrc, ...(soundName ? { name: soundName } : {}) }
                    : undefined;
                if (k === "url") {
                    const target = sanitizeExternalUrl(urlInput.value);
                    if (!target)
                        return null;
                    return { kind: "url", target, tooltip, sound };
                }
                if (k === "slide") {
                    return { kind: "slide", target: slideSel.value, tooltip, sound };
                }
                if (k === "sound") {
                    if (!sound)
                        return null;
                    return { kind: "sound", tooltip, sound };
                }
                return { kind: k, tooltip, sound };
            };
        },
        okLabel: t("dialog.hyperlink.ok"),
    });
}
function inputStyle() {
    return "width:100%;box-sizing:border-box;" + DIALOG_INPUT_CSS;
}
export function openTextPromptDialog(doc, opts) {
    return showDialog(doc, {
        title: opts.title,
        okEnabled: false,
        buildBody: (body, ctx) => {
            if (opts.label) {
                const lbl = doc.createElement("label");
                lbl.textContent = opts.label;
                lbl.style.cssText = "display:block;color:var(--muted-foreground);margin-bottom:6px";
                body.appendChild(lbl);
            }
            const input = opts.multiline === false
                ? doc.createElement("input")
                : doc.createElement("textarea");
            input.value = opts.initial ?? "";
            if (opts.placeholder)
                input.placeholder = opts.placeholder;
            if (input instanceof HTMLTextAreaElement) {
                input.rows = 4;
                input.style.cssText = `${inputStyle()};resize:vertical;min-height:88px`;
            }
            else {
                input.type = "text";
                input.style.cssText = inputStyle();
            }
            const sync = () => ctx.setOkEnabled(input.value.trim().length > 0);
            input.addEventListener("input", sync);
            sync();
            body.appendChild(input);
            setTimeout(() => input.focus(), 0);
            return () => {
                const v = input.value.trim();
                return v || null;
            };
        },
    });
}
const HEADER_DEFAULT_STYLE = {
    fontFamily: "sans-serif",
    fontSize: 14,
    color: "var(--border)",
    bold: false,
    italic: false,
    underline: false,
    align: "middle",
};
const FOOTER_DEFAULT_STYLE = {
    fontFamily: "sans-serif",
    fontSize: 12,
    color: "#6b7280",
    bold: false,
    italic: false,
    underline: false,
    align: "middle",
};
export function openHeaderFooterDialog(doc, initial) {
    return showDialog(doc, {
        title: t("dialog.headerFooter.title"),
        width: 540,
        buildBody: (body, ctx) => {
            // 把当前两段文字 + 样式收拢到两个 state 对象，方便预览实时刷新。
            const hStyle = { ...HEADER_DEFAULT_STYLE, ...(initial?.headerStyle ?? {}) };
            const fStyle = { ...FOOTER_DEFAULT_STYLE, ...(initial?.footerStyle ?? {}) };
            // ── 区块通用 helper（标题 + 内容容器）
            const mkSection = (title) => {
                const wrap = doc.createElement("div");
                wrap.style.cssText = "margin-bottom:14px";
                const h = doc.createElement("div");
                h.textContent = title;
                h.style.cssText = "color:var(--muted-foreground);font-size:11px;text-transform:uppercase;margin-bottom:6px;letter-spacing:.4px";
                const inner = doc.createElement("div");
                wrap.append(h, inner);
                return { wrap, inner };
            };
            // ── 文字输入区
            const textSect = mkSection(t("dialog.headerFooter.section.text"));
            const hLabel = doc.createElement("label");
            hLabel.textContent = t("dialog.headerFooter.headerLabel");
            hLabel.style.cssText = "display:block;color:var(--foreground);margin-bottom:4px;font-size:11px";
            const hInput = doc.createElement("input");
            hInput.type = "text";
            hInput.value = initial?.headerText ?? "";
            hInput.placeholder = t("editor.headerFooter.headerPrompt");
            hInput.style.cssText = inputStyle();
            const hBox = doc.createElement("div");
            hBox.style.cssText = "margin-bottom:8px";
            hBox.append(hLabel, hInput);
            textSect.inner.appendChild(hBox);
            const fLabel = doc.createElement("label");
            fLabel.textContent = t("dialog.headerFooter.footerLabel");
            fLabel.style.cssText = "display:block;color:var(--foreground);margin-bottom:4px;font-size:11px";
            const fInput = doc.createElement("input");
            fInput.type = "text";
            fInput.value = initial?.footerText ?? "";
            fInput.placeholder = t("editor.headerFooter.footerPrompt");
            fInput.style.cssText = inputStyle();
            const fBox = doc.createElement("div");
            fBox.append(fLabel, fInput);
            textSect.inner.appendChild(fBox);
            body.appendChild(textSect.wrap);
            // ── 样式编辑：分别给 Header / Footer 一组控件。
            const styleSect = mkSection(t("dialog.headerFooter.section.style"));
            const tabs = doc.createElement("div");
            tabs.style.cssText = "display:flex;gap:6px;margin-bottom:8px";
            const hTabBtn = mkStyleTabBtn(doc, t("dialog.headerFooter.headerLabel"), true);
            const fTabBtn = mkStyleTabBtn(doc, t("dialog.headerFooter.footerLabel"), false);
            tabs.append(hTabBtn, fTabBtn);
            styleSect.inner.appendChild(tabs);
            const hEditor = buildStyleEditor(doc, hStyle, () => syncPreview());
            const fEditor = buildStyleEditor(doc, fStyle, () => syncPreview());
            styleSect.inner.appendChild(hEditor.el);
            styleSect.inner.appendChild(fEditor.el);
            fEditor.el.style.display = "none";
            const setActiveTab = (which) => {
                if (which === "h") {
                    hTabBtn.dataset.active = "1";
                    fTabBtn.dataset.active = "0";
                    hTabBtn.style.background = "var(--secondary)";
                    hTabBtn.style.borderColor = "var(--primary)";
                    fTabBtn.style.background = "transparent";
                    hTabBtn.style.borderColor = "var(--border)";
                    hEditor.el.style.display = "block";
                    fEditor.el.style.display = "none";
                }
                else {
                    fTabBtn.dataset.active = "1";
                    hTabBtn.dataset.active = "0";
                    fTabBtn.style.background = "var(--secondary)";
                    fTabBtn.style.borderColor = "var(--primary)";
                    hTabBtn.style.background = "transparent";
                    hTabBtn.style.borderColor = "var(--border)";
                    fEditor.el.style.display = "block";
                    hEditor.el.style.display = "none";
                }
            };
            setActiveTab("h");
            hTabBtn.addEventListener("click", () => setActiveTab("h"));
            fTabBtn.addEventListener("click", () => setActiveTab("f"));
            body.appendChild(styleSect.wrap);
            // ── 预览区
            const previewSect = mkSection(t("dialog.headerFooter.section.preview"));
            const previewWrap = doc.createElement("div");
            previewWrap.style.cssText = [
                "background:var(--editor-stage)",
                "border:1px solid var(--border)",
                "border-radius:4px",
                "padding:10px 12px",
                "min-height:72px",
                "display:flex",
                "flex-direction:column",
                "justify-content:space-between",
                "gap:6px",
            ].join(";");
            const hPreview = doc.createElement("div");
            const fPreview = doc.createElement("div");
            previewWrap.append(hPreview, fPreview);
            previewSect.inner.appendChild(previewWrap);
            const styleToCss = (s) => {
                const align = s.align === "start" ? "left" : s.align === "end" ? "right" : "center";
                return [
                    `font-family:${s.fontFamily ?? "sans-serif"}`,
                    `font-size:${(s.fontSize ?? 14)}px`,
                    `color:${s.color ?? "#cbd5e1"}`,
                    `font-weight:${s.bold ? 700 : 400}`,
                    `font-style:${s.italic ? "italic" : "normal"}`,
                    `text-decoration:${s.underline ? "underline" : "none"}`,
                    `text-align:${align}`,
                ].join(";");
            };
            const placeholderText = t("dialog.headerFooter.previewSample");
            const syncPreview = () => {
                hPreview.style.cssText = styleToCss(hStyle);
                fPreview.style.cssText = styleToCss(fStyle);
                hPreview.textContent = hInput.value || placeholderText;
                fPreview.textContent = fInput.value || placeholderText;
            };
            hInput.addEventListener("input", syncPreview);
            fInput.addEventListener("input", syncPreview);
            syncPreview();
            body.appendChild(previewSect.wrap);
            // ── 范围（应用到所有幻灯片）
            const scopeBox = doc.createElement("div");
            scopeBox.style.cssText = "display:flex;align-items:center;gap:8px;margin-bottom:12px";
            const cb = doc.createElement("input");
            cb.type = "checkbox";
            cb.id = "ppt-hf-apply-all";
            cb.checked = initial?.applyAll ?? true;
            const cbLbl = doc.createElement("label");
            cbLbl.htmlFor = cb.id;
            cbLbl.textContent = t("dialog.headerFooter.applyAll");
            cbLbl.style.color = "var(--foreground)";
            cbLbl.style.cursor = "pointer";
            scopeBox.append(cb, cbLbl);
            body.appendChild(scopeBox);
            // ── 删除按钮：清空所有 header / footer
            const removeBtn = doc.createElement("button");
            removeBtn.textContent = t("dialog.headerFooter.removeAll");
            removeBtn.style.cssText = [
                "background:transparent",
                "color:var(--destructive)",
                "border:1px solid var(--border)",
                "border-radius:4px",
                "padding:6px 12px",
                "cursor:pointer",
                "font:inherit",
            ].join(";");
            removeBtn.addEventListener("click", () => {
                ctx.close({
                    headerText: "",
                    footerText: "",
                    headerStyle: hStyle,
                    footerStyle: fStyle,
                    applyAll: cb.checked,
                    remove: true,
                });
            });
            body.appendChild(removeBtn);
            setTimeout(() => hInput.focus(), 0);
            return () => {
                // 注意：headerText / footerText 都为空也是合法的——等价于"删除全部"。
                return {
                    headerText: hInput.value.trim(),
                    footerText: fInput.value.trim(),
                    headerStyle: hStyle,
                    footerStyle: fStyle,
                    applyAll: cb.checked,
                };
            };
        },
    });
}
// 在 dialog 内部用：构造 Header / Footer 切换 tab 按钮（两个互斥的扁平 chip 风格）。
function mkStyleTabBtn(doc, label, active) {
    const b = doc.createElement("button");
    b.textContent = label;
    b.style.cssText = [
        active ? "background:var(--secondary)" : "background:transparent",
        "color:var(--foreground)",
        `border:1px solid ${active ? "var(--primary)" : "var(--border)"}`,
        "border-radius:4px",
        "padding:4px 12px",
        "cursor:pointer",
        "font:inherit",
    ].join(";");
    return b;
}
// 构造单组样式编辑控件（共 Header / Footer 各一份），所有交互直接写回 style 引用。
function buildStyleEditor(doc, style, onChange) {
    const wrap = doc.createElement("div");
    wrap.style.cssText = [
        "display:grid",
        "grid-template-columns:repeat(2, minmax(0, 1fr))",
        "gap:8px 12px",
        "padding:8px",
        "background:var(--background)",
        "border:1px solid var(--border)",
        "border-radius:4px",
    ].join(";");
    const rowLabel = (text) => {
        const l = doc.createElement("label");
        l.textContent = text;
        l.style.cssText = "color:var(--muted-foreground);font-size:11px;display:block;margin-bottom:3px";
        return l;
    };
    const cell = (label, control) => {
        const c = doc.createElement("div");
        c.append(rowLabel(label), control);
        return c;
    };
    const fontInput = doc.createElement("input");
    fontInput.type = "text";
    fontInput.value = style.fontFamily ?? "";
    fontInput.style.cssText = inputStyle();
    const fontCombo = bindFontFamilyCombobox(fontInput, (v) => {
        style.fontFamily = v.trim() || undefined;
        onChange();
    });
    fontCombo.el.style.width = "100%";
    wrap.appendChild(cell(t("dialog.headerFooter.fontLabel"), fontCombo.el));
    // 字号
    const sizeInput = doc.createElement("input");
    sizeInput.type = "number";
    sizeInput.min = "6";
    sizeInput.max = "96";
    sizeInput.step = "1";
    sizeInput.value = formatFontPt(style.fontSize ?? 14);
    sizeInput.style.cssText = inputStyle();
    sizeInput.addEventListener("input", () => {
        const v = Number(sizeInput.value);
        if (Number.isFinite(v) && v >= 6 && v <= 96) {
            style.fontSize = fontPxFromPt(v);
            onChange();
        }
    });
    wrap.appendChild(cell(t("dialog.headerFooter.sizeLabel"), sizeInput));
    // 颜色
    const colorInput = doc.createElement("input");
    colorInput.type = "color";
    colorInput.value = normalizeColorForPreview(style.color ?? "var(--border)");
    colorInput.className = COLOR_SWATCH_CLASS;
    colorInput.style.cssText = "width:100%;height:30px;box-sizing:border-box";
    colorInput.addEventListener("input", () => {
        style.color = colorInput.value;
        onChange();
    });
    wrap.appendChild(cell(t("dialog.headerFooter.colorLabel"), colorInput));
    // 对齐：start / middle / end
    const alignWrap = doc.createElement("div");
    alignWrap.style.cssText = "display:flex;gap:4px";
    const alignOpts = [
        ["start", t("dialog.headerFooter.align.left")],
        ["middle", t("dialog.headerFooter.align.center")],
        ["end", t("dialog.headerFooter.align.right")],
    ];
    for (const [val, lbl] of alignOpts) {
        const b = doc.createElement("button");
        b.textContent = lbl;
        b.dataset.align = val;
        b.style.cssText = mkChipBtnStyle(style.align === val);
        b.addEventListener("click", () => {
            style.align = val;
            // 同步所有 align 按钮的高亮
            for (const sib of Array.from(alignWrap.children)) {
                const isOn = sib.dataset.align === val;
                sib.style.cssText = mkChipBtnStyle(isOn);
            }
            onChange();
        });
        alignWrap.appendChild(b);
    }
    wrap.appendChild(cell(t("dialog.headerFooter.align"), alignWrap));
    // 粗 / 斜 / 下划线
    const styleRow = doc.createElement("div");
    styleRow.style.cssText = "display:flex;gap:6px;grid-column:span 2";
    const mkStyleToggle = (label, cssDecor, getter, setter) => {
        const b = doc.createElement("button");
        b.textContent = label;
        b.style.cssText = mkChipBtnStyle(getter()) + ";min-width:36px;" + cssDecor;
        b.addEventListener("click", () => {
            const next = !getter();
            setter(next);
            b.style.cssText = mkChipBtnStyle(next) + ";min-width:36px;" + cssDecor;
            onChange();
        });
        return b;
    };
    styleRow.appendChild(mkStyleToggle("B", "font-weight:700", () => !!style.bold, (v) => (style.bold = v)));
    styleRow.appendChild(mkStyleToggle("I", "font-style:italic", () => !!style.italic, (v) => (style.italic = v)));
    styleRow.appendChild(mkStyleToggle("U", "text-decoration:underline", () => !!style.underline, (v) => (style.underline = v)));
    wrap.appendChild(styleRow);
    return { el: wrap };
}
function mkChipBtnStyle(active) {
    return [
        active ? "background:var(--secondary)" : "background:transparent",
        "color:var(--foreground)",
        `border:1px solid ${active ? "var(--primary)" : "var(--border)"}`,
        "border-radius:4px",
        "padding:4px 10px",
        "cursor:pointer",
        "font:inherit",
        "line-height:1",
    ].join(";");
}
function normalizeColorForPreview(c) {
    if (/^#[0-9a-f]{6}$/i.test(c))
        return c;
    if (/^#[0-9a-f]{3}$/i.test(c))
        return "#" + c[1] + c[1] + c[2] + c[2] + c[3] + c[3];
    if (/^#[0-9a-f]{8}$/i.test(c))
        return c.slice(0, 7);
    return "var(--border)";
}
