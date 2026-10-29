"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.openPhotoAlbumDialog = openPhotoAlbumDialog;
const dialog_1 = require("./dialog");
const i18n_1 = require("./i18n");
const ui_style_1 = require("./ui-style");
function stripExtension(name) {
    const i = name.lastIndexOf(".");
    return i > 0 ? name.slice(0, i) : name;
}
async function readImageFiles(files) {
    const list = [...files].filter((f) => f.type.startsWith("image/"));
    const out = [];
    for (const file of list) {
        const src = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(file);
        });
        const natural = await new Promise((resolve) => {
            const img = new Image();
            img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
            img.onerror = () => resolve(undefined);
            img.src = src;
        });
        out.push({
            src,
            natural,
            caption: stripExtension(file.name),
        });
    }
    return out;
}
function openPhotoAlbumDialog(doc, onApply) {
    const overlay = doc.createElement("div");
    overlay.className = "local-picker-overlay";
    overlay.style.cssText =
        ui_style_1.DIALOG_OVERLAY_CSS;
    const modal = doc.createElement("div");
    modal.style.cssText =
        "background:var(--popover);color:var(--popover-foreground);border:1px solid var(--border);border-radius:var(--radius-modal,12px);box-shadow:var(--shadow-lg);padding:16px 18px;width:min(460px,92vw);display:flex;flex-direction:column;gap:12px";
    const title = doc.createElement("h3");
    title.style.margin = "0";
    title.textContent = (0, i18n_1.t)("photoAlbum.title");
    modal.appendChild(title);
    const hint = doc.createElement("p");
    hint.style.cssText = "margin:0;font-size:12px;color:var(--muted-foreground,#a1a1aa);line-height:1.45";
    hint.textContent = (0, i18n_1.t)("photoAlbum.hint");
    modal.appendChild(hint);
    const fileRow = doc.createElement("div");
    fileRow.style.cssText = "display:flex;flex-direction:column;gap:6px";
    const fileLabel = doc.createElement("label");
    fileLabel.style.fontSize = "13px";
    fileLabel.textContent = (0, i18n_1.t)("photoAlbum.pictures");
    const fileInput = doc.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "image/*";
    fileInput.multiple = true;
    fileInput.style.cssText = "font:inherit;color:inherit";
    const fileCount = doc.createElement("span");
    fileCount.style.cssText = "font-size:12px;color:var(--muted-foreground,#a1a1aa)";
    fileCount.textContent = (0, i18n_1.t)("photoAlbum.noFiles");
    fileInput.addEventListener("change", () => {
        const n = fileInput.files?.length ?? 0;
        fileCount.textContent = n ? (0, i18n_1.t)("photoAlbum.fileCount", { n: String(n) }) : (0, i18n_1.t)("photoAlbum.noFiles");
    });
    fileRow.append(fileLabel, fileInput, fileCount);
    modal.appendChild(fileRow);
    const layoutRow = doc.createElement("div");
    layoutRow.style.cssText = "display:flex;flex-direction:column;gap:6px;font-size:13px";
    const layoutLabel = doc.createElement("label");
    layoutLabel.textContent = (0, i18n_1.t)("photoAlbum.layout");
    const layoutSelect = doc.createElement("select");
    layoutSelect.style.cssText =
        "background:var(--background);color:inherit;border:1px solid var(--border);border-radius:4px;padding:6px 8px;font:inherit";
    const layouts = [
        { id: "fitToSlide", label: (0, i18n_1.t)("photoAlbum.layout.fitToSlide") },
        { id: "2pic", label: (0, i18n_1.t)("photoAlbum.layout.2pic") },
        { id: "4pic", label: (0, i18n_1.t)("photoAlbum.layout.4pic") },
    ];
    for (const opt of layouts) {
        const o = doc.createElement("option");
        o.value = opt.id;
        o.textContent = opt.label;
        layoutSelect.appendChild(o);
    }
    layoutRow.append(layoutLabel, layoutSelect);
    modal.appendChild(layoutRow);
    const checkRow = doc.createElement("div");
    checkRow.style.cssText = "display:flex;flex-direction:column;gap:6px;font-size:13px";
    const captionsLab = doc.createElement("label");
    captionsLab.style.cssText = "display:flex;align-items:center;gap:8px;cursor:pointer";
    const captionsCb = doc.createElement("input");
    captionsCb.type = "checkbox";
    captionsCb.checked = true;
    captionsLab.append(captionsCb, doc.createTextNode((0, i18n_1.t)("photoAlbum.showCaptions")));
    const bwLab = doc.createElement("label");
    bwLab.style.cssText = "display:flex;align-items:center;gap:8px;cursor:pointer";
    const bwCb = doc.createElement("input");
    bwCb.type = "checkbox";
    bwLab.append(bwCb, doc.createTextNode((0, i18n_1.t)("photoAlbum.bw")));
    checkRow.append(captionsLab, bwLab);
    modal.appendChild(checkRow);
    const status = doc.createElement("div");
    status.style.cssText = "font-size:12px;color:var(--destructive);min-height:1em";
    modal.appendChild(status);
    let modalDismiss;
    const close = () => {
        modalDismiss?.release();
        overlay.remove();
    };
    const row = doc.createElement("div");
    row.style.cssText = "display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap";
    const createBtn = doc.createElement("button");
    createBtn.type = "button";
    createBtn.textContent = (0, i18n_1.t)("photoAlbum.create");
    createBtn.style.cssText =
        "background:var(--primary);color:var(--primary-foreground);border:none;border-radius:4px;padding:8px 14px;cursor:pointer;font:inherit";
    createBtn.addEventListener("click", () => {
        void (async () => {
            const files = fileInput.files;
            if (!files?.length) {
                status.textContent = (0, i18n_1.t)("photoAlbum.needFiles");
                return;
            }
            status.textContent = "";
            createBtn.disabled = true;
            try {
                const images = await readImageFiles(files);
                if (!images.length) {
                    status.textContent = (0, i18n_1.t)("photoAlbum.needFiles");
                    return;
                }
                const album = {
                    layout: layoutSelect.value,
                    showCaptions: captionsCb.checked,
                    bw: bwCb.checked || undefined,
                };
                onApply({ images, album });
                close();
            }
            catch {
                status.textContent = (0, i18n_1.t)("photoAlbum.readError");
            }
            finally {
                createBtn.disabled = false;
            }
        })();
    });
    const cancel = doc.createElement("button");
    cancel.type = "button";
    cancel.textContent = (0, i18n_1.t)("photoAlbum.cancel");
    cancel.style.cssText =
        "background:transparent;color:inherit;border:1px solid var(--border);border-radius:4px;padding:8px 14px;cursor:pointer;font:inherit";
    cancel.addEventListener("click", close);
    row.append(createBtn, cancel);
    modal.appendChild(row);
    overlay.appendChild(modal);
    modalDismiss = (0, dialog_1.bindEditorModal)({ doc, overlay, panel: modal, onCancel: close });
    doc.body.appendChild(overlay);
}
