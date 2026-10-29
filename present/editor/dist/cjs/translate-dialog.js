"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchTranslation = fetchTranslation;
exports.openTranslateDialog = openTranslateDialog;
const dialog_1 = require("./dialog");
const proofing_language_1 = require("./proofing-language");
const i18n_1 = require("./i18n");
const ui_style_1 = require("./ui-style");
async function fetchTranslation(text, fromTag, toTag) {
    const q = text.trim();
    if (!q)
        return "";
    const pair = `${fromTag}|${toTag}`;
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(q)}&langpair=${encodeURIComponent(pair)}`;
    const res = await fetch(url);
    if (!res.ok)
        throw new Error((0, i18n_1.t)("translate.fetchFailed"));
    const data = (await res.json());
    if (data.responseStatus && data.responseStatus !== 200) {
        throw new Error((0, i18n_1.t)("translate.fetchFailed"));
    }
    const out = data.responseData?.translatedText?.trim();
    if (!out)
        throw new Error((0, i18n_1.t)("translate.fetchFailed"));
    return out;
}
function openTranslateDialog(doc, opts) {
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
        "background:var(--popover);color:var(--popover-foreground);border:1px solid var(--border);border-radius:var(--radius-modal,12px);box-shadow:var(--shadow-lg);padding:16px 18px;width:min(520px,92vw);display:flex;flex-direction:column;gap:10px";
    const title = doc.createElement("h3");
    title.style.margin = "0";
    title.textContent = (0, i18n_1.t)("translate.title");
    modal.appendChild(title);
    const langRow = doc.createElement("div");
    langRow.style.cssText = "display:flex;gap:8px;align-items:center;flex-wrap:wrap";
    const mkLangSel = (value) => {
        const sel = doc.createElement("select");
        sel.style.cssText =
            "background:var(--background);color:inherit;border:1px solid var(--border);border-radius:4px;padding:4px 8px;font:inherit";
        for (const l of proofing_language_1.PROOFING_LANGUAGES) {
            const o = doc.createElement("option");
            o.value = l.id;
            o.textContent = (0, i18n_1.t)(l.labelKey);
            sel.appendChild(o);
        }
        sel.value = value;
        return sel;
    };
    const fromSel = mkLangSel(opts.fromLang);
    const toSel = mkLangSel(opts.toLang);
    langRow.append((0, i18n_1.t)("translate.from"), " ", fromSel, " ", (0, i18n_1.t)("translate.to"), " ", toSel);
    modal.appendChild(langRow);
    const src = doc.createElement("textarea");
    src.value = opts.sourceText;
    src.rows = 4;
    src.style.cssText =
        "width:100%;box-sizing:border-box;background:var(--background);color:inherit;border:1px solid var(--border);border-radius:4px;padding:8px;font:inherit;resize:vertical";
    modal.appendChild(src);
    const dst = doc.createElement("textarea");
    dst.readOnly = true;
    dst.rows = 4;
    dst.placeholder = (0, i18n_1.t)("translate.resultPlaceholder");
    dst.style.cssText = src.style.cssText;
    modal.appendChild(dst);
    const status = doc.createElement("div");
    status.style.cssText = "font-size:12px;color:var(--muted-foreground,#a1a1aa)";
    modal.appendChild(status);
    const tagFor = (id) => proofing_language_1.PROOFING_LANGUAGES.find((l) => l.id === id)?.tag ?? "en";
    const runTranslate = async () => {
        status.textContent = (0, i18n_1.t)("translate.loading");
        try {
            dst.value = await fetchTranslation(src.value, tagFor(fromSel.value), tagFor(toSel.value));
            status.textContent = "";
        }
        catch (e) {
            dst.value = "";
            status.textContent = e instanceof Error ? e.message : (0, i18n_1.t)("translate.fetchFailed");
        }
    };
    const footer = doc.createElement("div");
    footer.style.cssText = "display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap";
    const translateBtn = doc.createElement("button");
    translateBtn.type = "button";
    translateBtn.textContent = (0, i18n_1.t)("translate.run");
    translateBtn.style.cssText =
        "background:var(--primary);color:var(--primary-foreground);border:none;border-radius:4px;padding:6px 12px;cursor:pointer;font:inherit";
    translateBtn.addEventListener("click", () => void runTranslate());
    const applyBtn = doc.createElement("button");
    applyBtn.type = "button";
    applyBtn.textContent = (0, i18n_1.t)("translate.replace");
    applyBtn.style.cssText = translateBtn.style.cssText;
    applyBtn.addEventListener("click", () => {
        if (!dst.value.trim())
            return;
        opts.onApply(dst.value.trim());
        dismiss();
    });
    const cancel = doc.createElement("button");
    cancel.type = "button";
    cancel.textContent = (0, i18n_1.t)("translate.close");
    cancel.style.cssText =
        "background:var(--secondary);color:var(--foreground);border:1px solid var(--border);border-radius:var(--radius-sm,6px);padding:6px 12px;cursor:pointer;font:inherit";
    cancel.addEventListener("click", dismiss);
    footer.append(translateBtn, applyBtn, cancel);
    modal.appendChild(footer);
    overlay.appendChild(modal);
    modalDismiss = (0, dialog_1.bindEditorModal)({
        doc,
        overlay,
        panel: modal,
        onCancel: dismiss,
        onSubmit: () => {
            void runTranslate();
        },
    });
    doc.body.appendChild(overlay);
    if (opts.sourceText.trim())
        void runTranslate();
}
