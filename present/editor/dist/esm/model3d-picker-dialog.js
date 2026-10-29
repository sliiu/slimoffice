import { MODEL3D_PRESETS } from "@sliiu/present-core";
import { showDialog } from "./dialog.js";
import { t } from "./i18n/index.js";
import { loadModel3DFromFile, loadModel3DFromUrl, loadModel3DPresetAsDataUrl, MODEL3D_CUSTOM_PRESET_ID, } from "./model3d-load.js";
export function openModel3DPickerDialog(doc, opts = {}) {
    const baseUrl = opts.assetsBaseUrl ?? "/";
    return showDialog(doc, {
        title: t("dialog.model3d.title"),
        width: 480,
        okLabel: "",
        buildBody: (body, ctx) => {
            const hint = doc.createElement("p");
            hint.textContent = t("dialog.model3d.hint");
            hint.style.cssText = "margin:0 0 12px;font-size:12px;color:var(--muted-foreground)";
            body.appendChild(hint);
            const status = doc.createElement("p");
            status.style.cssText = "margin:0 0 8px;font-size:12px;color:var(--muted-foreground);min-height:18px";
            body.appendChild(status);
            const grid = doc.createElement("div");
            grid.style.cssText = "display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-bottom:12px";
            body.appendChild(grid);
            const urlRow = doc.createElement("div");
            urlRow.style.cssText = "display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap";
            const urlInput = doc.createElement("input");
            urlInput.type = "url";
            urlInput.placeholder = t("dialog.model3d.urlPlaceholder");
            urlInput.style.cssText =
                "flex:1;min-width:200px;padding:8px 10px;border:1px solid var(--border);border-radius:6px;background:var(--background);color:var(--foreground);font:inherit";
            const urlBtn = doc.createElement("button");
            urlBtn.type = "button";
            urlBtn.textContent = t("dialog.model3d.loadUrl");
            urlBtn.style.cssText =
                "padding:8px 12px;border:1px solid var(--border);border-radius:6px;background:var(--secondary);color:var(--foreground);cursor:pointer;font:inherit;white-space:nowrap";
            urlRow.append(urlInput, urlBtn);
            body.appendChild(urlRow);
            const browse = doc.createElement("button");
            browse.type = "button";
            browse.textContent = t("dialog.model3d.browse");
            browse.style.cssText =
                "padding:8px 12px;border:1px solid var(--border);border-radius:6px;background:var(--secondary);color:var(--foreground);cursor:pointer;font:inherit";
            body.appendChild(browse);
            const setBusy = (busy, msg = "") => {
                status.textContent = msg;
                browse.disabled = busy;
                urlBtn.disabled = busy;
                urlInput.disabled = busy;
                for (const b of grid.querySelectorAll("button")) {
                    b.disabled = busy;
                }
            };
            const pickLoaded = (glbSrc, label) => {
                ctx.close({ presetId: MODEL3D_CUSTOM_PRESET_ID, glbSrc, label });
            };
            for (const preset of MODEL3D_PRESETS) {
                const btn = doc.createElement("button");
                btn.type = "button";
                btn.style.cssText = [
                    "display:flex",
                    "flex-direction:column",
                    "align-items:center",
                    "gap:6px",
                    "padding:12px 8px",
                    "border:1px solid var(--border)",
                    "border-radius:8px",
                    "background:var(--card)",
                    "color:var(--foreground)",
                    "cursor:pointer",
                    "font:inherit",
                    "min-height:72px",
                ].join(";");
                const icon = doc.createElement("span");
                icon.textContent = "▣";
                icon.style.cssText = "font-size:22px;line-height:1;opacity:.85";
                const label = doc.createElement("span");
                label.textContent = preset.label;
                label.style.cssText = "font-size:11px;text-align:center";
                btn.append(icon, label);
                btn.addEventListener("click", () => {
                    void (async () => {
                        setBusy(true, t("dialog.model3d.loading"));
                        try {
                            const glbSrc = await loadModel3DPresetAsDataUrl(preset, baseUrl);
                            ctx.close({ presetId: preset.id, glbSrc, label: preset.label });
                        }
                        catch {
                            status.textContent = t("dialog.model3d.loadFailed");
                            setBusy(false);
                        }
                    })();
                });
                grid.appendChild(btn);
            }
            body.appendChild(browse);
            const drop = doc.createElement("div");
            drop.style.cssText =
                "border:1px dashed var(--border,#555);border-radius:8px;padding:12px;text-align:center;font-size:12px;color:var(--muted-foreground);margin-top:10px;cursor:pointer";
            drop.textContent = t("dialog.model3d.dropHint");
            body.appendChild(drop);
            const loadFile = (file) => {
                void (async () => {
                    setBusy(true, t("dialog.model3d.loading"));
                    try {
                        const loaded = await loadModel3DFromFile(file);
                        pickLoaded(loaded.glbSrc, loaded.label);
                    }
                    catch {
                        status.textContent = t("dialog.model3d.loadFailed");
                        setBusy(false);
                    }
                })();
            };
            drop.addEventListener("click", () => browse.click());
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
                    loadFile(file);
            });
            urlBtn.addEventListener("click", () => {
                const url = urlInput.value.trim();
                if (!url) {
                    status.textContent = t("dialog.model3d.urlRequired");
                    return;
                }
                void (async () => {
                    setBusy(true, t("dialog.model3d.loading"));
                    try {
                        const loaded = await loadModel3DFromUrl(url);
                        pickLoaded(loaded.glbSrc, loaded.label);
                    }
                    catch {
                        status.textContent = t("dialog.model3d.loadFailed");
                        setBusy(false);
                    }
                })();
            });
            browse.addEventListener("click", () => {
                const inp = doc.createElement("input");
                inp.type = "file";
                inp.accept = ".glb,.gltf,model/gltf-binary,model/gltf+json";
                inp.addEventListener("change", () => {
                    const file = inp.files?.[0];
                    if (!file)
                        return;
                    loadFile(file);
                });
                inp.click();
            });
        },
    });
}
