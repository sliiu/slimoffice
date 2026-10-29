"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.openOleInsertDialog = openOleInsertDialog;
const dialog_1 = require("./dialog");
const ole_cmd_1 = require("./ole-cmd");
const i18n_1 = require("./i18n");
function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error ?? new Error("read failed"));
        reader.readAsDataURL(file);
    });
}
function acceptOleFile(file) {
    if (!file.size)
        return false;
    const name = file.name.toLowerCase();
    return /\.(xlsx?|docx?|pptx?|pdf|bin|txt|csv|rtf|odt|ods|odp)$/i.test(name) || file.type.startsWith("application/");
}
function openOleInsertDialog(doc) {
    return (0, dialog_1.showDialog)(doc, {
        title: (0, i18n_1.t)("dialog.ole.title"),
        width: 420,
        okLabel: (0, i18n_1.t)("dialog.ole.insert"),
        okEnabled: false,
        buildBody: (body, ctx) => {
            const hint = doc.createElement("p");
            hint.textContent = (0, i18n_1.t)("dialog.ole.hint");
            hint.style.cssText = "margin:0 0 12px;font-size:12px;color:var(--muted-foreground)";
            body.appendChild(hint);
            const drop = doc.createElement("div");
            drop.style.cssText =
                "border:1px dashed var(--border,#555);border-radius:8px;padding:16px 12px;text-align:center;font-size:12px;color:var(--muted-foreground);margin-bottom:10px;cursor:pointer";
            drop.textContent = (0, i18n_1.t)("dialog.ole.dropHint");
            body.appendChild(drop);
            const fileLabel = doc.createElement("p");
            fileLabel.style.cssText = "margin:0 0 8px;font-size:12px;color:var(--muted-foreground);min-height:18px";
            fileLabel.textContent = (0, i18n_1.t)("dialog.ole.noFile");
            body.appendChild(fileLabel);
            const browse = doc.createElement("button");
            browse.type = "button";
            browse.textContent = (0, i18n_1.t)("dialog.ole.browse");
            browse.style.cssText =
                "padding:8px 12px;border:1px solid var(--border);border-radius:6px;background:var(--secondary);color:var(--foreground);cursor:pointer;font:inherit;margin-bottom:12px";
            body.appendChild(browse);
            const iconRow = doc.createElement("label");
            iconRow.style.cssText = "display:flex;align-items:center;gap:8px;font-size:12px;cursor:pointer";
            const iconCb = doc.createElement("input");
            iconCb.type = "checkbox";
            iconCb.checked = true;
            iconCb.style.accentColor = "var(--primary)";
            const iconText = doc.createElement("span");
            iconText.textContent = (0, i18n_1.t)("dialog.ole.showAsIcon");
            iconRow.append(iconCb, iconText);
            body.appendChild(iconRow);
            let picked = null;
            let loading = false;
            const setPicked = async (file) => {
                if (loading)
                    return;
                if (!acceptOleFile(file)) {
                    fileLabel.textContent = (0, i18n_1.t)("dialog.ole.unsupported");
                    picked = null;
                    ctx.setOkEnabled(false);
                    return;
                }
                loading = true;
                browse.disabled = true;
                fileLabel.textContent = (0, i18n_1.t)("dialog.ole.loading");
                try {
                    const embedSrc = await readFileAsDataUrl(file);
                    picked = { fileName: file.name, embedSrc };
                    const bytes = (0, ole_cmd_1.oleEmbedByteSize)(embedSrc);
                    const sizeLabel = bytes != null ? ` · ${(0, ole_cmd_1.formatByteSize)(bytes)}` : "";
                    const warn = bytes != null && (0, ole_cmd_1.isOleEmbedOverLimit)(bytes) ? ` · ${(0, i18n_1.t)("dialog.ole.largeWarning")}` : "";
                    fileLabel.textContent = `${file.name}${sizeLabel}${warn}`;
                    ctx.setOkEnabled(true);
                }
                catch {
                    fileLabel.textContent = (0, i18n_1.t)("dialog.ole.loadFailed");
                    picked = null;
                    ctx.setOkEnabled(false);
                }
                finally {
                    loading = false;
                    browse.disabled = false;
                }
            };
            const openPicker = () => {
                const inp = doc.createElement("input");
                inp.type = "file";
                inp.accept = ".xlsx,.xls,.docx,.doc,.pptx,.ppt,.pdf,.bin,application/*";
                inp.addEventListener("change", () => {
                    const file = inp.files?.[0];
                    if (file)
                        void setPicked(file);
                });
                inp.click();
            };
            browse.addEventListener("click", openPicker);
            drop.addEventListener("click", openPicker);
            drop.addEventListener("dragover", (e) => {
                e.preventDefault();
                drop.style.borderColor = "var(--primary,#3b82f6)";
            });
            drop.addEventListener("dragleave", () => {
                drop.style.borderColor = "";
            });
            drop.addEventListener("drop", (e) => {
                e.preventDefault();
                drop.style.borderColor = "";
                const file = e.dataTransfer?.files?.[0];
                if (file)
                    void setPicked(file);
            });
            return () => {
                if (!picked)
                    return null;
                return {
                    fileName: picked.fileName,
                    embedSrc: picked.embedSrc,
                    showAsIcon: iconCb.checked,
                };
            };
        },
    });
}
