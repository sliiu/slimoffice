"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.openEmbedFontsDialog = openEmbedFontsDialog;
const dialog_1 = require("./dialog");
const core_1 = require("@sliiu/present-core");
const themes_1 = require("@sliiu/present-themes");
const embed_fonts_cmd_1 = require("./embed-fonts-cmd");
const font_embed_fetch_1 = require("./font-embed-fetch");
const i18n_1 = require("./i18n");
const ui_style_1 = require("./ui-style");
function openEmbedFontsDialog(doc, pres, stack) {
    const families = (0, core_1.collectUsedTypefaces)(pres);
    const usedFaces = (0, core_1.collectUsedFontFaces)(pres);
    const pendingFiles = new Map();
    const overlay = doc.createElement("div");
    overlay.className = "local-picker-overlay";
    overlay.style.cssText =
        ui_style_1.DIALOG_OVERLAY_CSS;
    const modal = doc.createElement("div");
    modal.style.cssText =
        "background:var(--popover);color:var(--popover-foreground);border:1px solid var(--border);border-radius:var(--radius-modal,12px);box-shadow:var(--shadow-lg);padding:16px 18px;width:min(520px,94vw);max-height:85vh;display:flex;flex-direction:column;gap:12px";
    const title = doc.createElement("h3");
    title.style.margin = "0";
    title.textContent = (0, i18n_1.t)("embedFonts.title");
    modal.appendChild(title);
    const hint = doc.createElement("p");
    hint.style.cssText = "margin:0;font-size:12px;color:var(--muted-foreground,#a1a1aa);line-height:1.45";
    hint.textContent = (0, i18n_1.t)("embedFonts.hint");
    modal.appendChild(hint);
    const list = doc.createElement("div");
    list.style.cssText = "overflow:auto;flex:1;min-height:120px;border:1px solid var(--border,#3a3a3a);border-radius:6px";
    const status = doc.createElement("div");
    status.style.cssText = "font-size:12px;color:var(--destructive);min-height:1em";
    let modalDismiss;
    const close = () => {
        modalDismiss?.release();
        overlay.remove();
    };
    const renderList = () => {
        list.replaceChildren();
        if (!families.length) {
            const empty = doc.createElement("div");
            empty.style.cssText = "padding:12px;font-size:13px;color:var(--muted-foreground,#a1a1aa)";
            empty.textContent = (0, i18n_1.t)("embedFonts.noFontsUsed");
            list.appendChild(empty);
            return;
        }
        for (const family of families) {
            const row = doc.createElement("div");
            row.style.cssText =
                "display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid var(--border,#3a3a3a);font-size:13px";
            const name = doc.createElement("span");
            name.style.flex = "1";
            name.textContent = family;
            row.appendChild(name);
            const badge = doc.createElement("span");
            badge.style.cssText = "font-size:11px;color:var(--muted-foreground,#a1a1aa)";
            badge.textContent = (0, core_1.isTypefaceEmbedded)(pres, family)
                ? (0, i18n_1.t)("embedFonts.statusEmbedded")
                : (0, i18n_1.t)("embedFonts.statusMissing");
            row.appendChild(badge);
            if (!(0, core_1.isTypefaceEmbedded)(pres, family)) {
                const browse = doc.createElement("button");
                browse.type = "button";
                browse.textContent = (0, i18n_1.t)("embedFonts.browse");
                browse.style.cssText =
                    "font:inherit;font-size:11px;padding:4px 8px;border-radius:4px;border:1px solid var(--border);background:var(--secondary);color:inherit;cursor:pointer";
                const input = doc.createElement("input");
                input.type = "file";
                input.accept = ".ttf,.otf,.woff,font/ttf,font/otf";
                input.style.display = "none";
                browse.addEventListener("click", () => input.click());
                input.addEventListener("change", () => {
                    const file = input.files?.[0];
                    if (file) {
                        pendingFiles.set(family, file);
                        badge.textContent = (0, i18n_1.t)("embedFonts.statusReady", { name: file.name });
                    }
                });
                row.appendChild(browse);
                row.appendChild(input);
            }
            list.appendChild(row);
        }
    };
    renderList();
    modal.appendChild(list);
    modal.appendChild(status);
    const subsetLab = doc.createElement("label");
    subsetLab.style.cssText = "display:flex;align-items:center;gap:8px;font-size:12px";
    const subsetCb = doc.createElement("input");
    subsetCb.type = "checkbox";
    subsetCb.checked = pres.options?.saveSubsetFonts ?? false;
    subsetLab.append(subsetCb, doc.createTextNode((0, i18n_1.t)("embedFonts.saveSubset")));
    modal.appendChild(subsetLab);
    const row = doc.createElement("div");
    row.style.cssText = "display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap";
    const embedGoogleBtn = doc.createElement("button");
    embedGoogleBtn.type = "button";
    embedGoogleBtn.textContent = (0, i18n_1.t)("embedFonts.embedGoogle");
    embedGoogleBtn.style.cssText =
        "background:var(--secondary);color:inherit;border:1px solid var(--border);border-radius:4px;padding:8px 12px;cursor:pointer;font:inherit";
    const embedBtn = doc.createElement("button");
    embedBtn.type = "button";
    embedBtn.textContent = (0, i18n_1.t)("embedFonts.embed");
    embedBtn.style.cssText =
        "background:var(--primary);color:var(--primary-foreground);border:none;border-radius:4px;padding:8px 14px;cursor:pointer;font:inherit";
    const cancel = doc.createElement("button");
    cancel.type = "button";
    cancel.textContent = (0, i18n_1.t)("embedFonts.cancel");
    cancel.style.cssText =
        "background:transparent;color:inherit;border:1px solid var(--border);border-radius:4px;padding:8px 14px;cursor:pointer;font:inherit";
    const readFileBytes = (file) => file.arrayBuffer().then((ab) => new Uint8Array(ab));
    const buildAdditions = async (googleOnly) => {
        const out = [];
        for (const family of families) {
            const file = pendingFiles.get(family);
            if (file) {
                const bytes = await readFileBytes(file);
                const mime = file.name.toLowerCase().endsWith(".otf") ? "font/otf" : "font/ttf";
                out.push({
                    family,
                    weight: 400,
                    style: "normal",
                    src: (0, core_1.bytesToFontDataUrl)(bytes, mime),
                    format: mime.includes("otf") ? "opentype" : "truetype",
                });
                continue;
            }
            if (!googleOnly)
                continue;
            if (!(0, themes_1.findFontPreset)(family))
                continue;
            const usedWeights = usedFaces.filter((f) => f.family === family).map((f) => f.weight);
            const weights = new Set([400]);
            const max = usedWeights.length ? Math.max(...usedWeights) : 400;
            if (max >= 800)
                weights.add(800);
            else if (max >= 600)
                weights.add(700);
            for (const weight of weights) {
                if ((0, core_1.isFontFaceEmbedded)(pres, family, weight))
                    continue;
                const src = await (0, font_embed_fetch_1.fetchPresetFontDataUrl)(family, weight);
                if (!src && weight >= 800) {
                    const fallback = await (0, font_embed_fetch_1.fetchPresetFontDataUrl)(family, 700);
                    if (fallback) {
                        out.push({ family, weight: 700, style: "normal", src: fallback, format: "truetype" });
                    }
                    continue;
                }
                if (!src)
                    continue;
                out.push({ family, weight, style: "normal", src, format: "truetype" });
            }
        }
        return out;
    };
    const runEmbed = async (googleOnly) => {
        status.textContent = "";
        embedBtn.disabled = true;
        embedGoogleBtn.disabled = true;
        try {
            const additions = await buildAdditions(googleOnly);
            if (!additions.length) {
                status.textContent = (0, i18n_1.t)("embedFonts.nothingToEmbed");
                return;
            }
            stack.execute(new embed_fonts_cmd_1.EmbedFontsCmd(additions, {
                embedTrueTypeFonts: true,
                saveSubsetFonts: subsetCb.checked,
            }));
            close();
        }
        catch {
            status.textContent = (0, i18n_1.t)("embedFonts.readError");
        }
        finally {
            embedBtn.disabled = false;
            embedGoogleBtn.disabled = false;
        }
    };
    embedGoogleBtn.addEventListener("click", () => void runEmbed(true));
    embedBtn.addEventListener("click", () => void runEmbed(false));
    cancel.addEventListener("click", close);
    modalDismiss = (0, dialog_1.bindEditorModal)({ doc, overlay, panel: modal, onCancel: close });
    row.append(embedGoogleBtn, embedBtn, cancel);
    modal.appendChild(row);
    overlay.appendChild(modal);
    doc.body.appendChild(overlay);
}
