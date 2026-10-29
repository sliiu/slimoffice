"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.decodeIconDescr = exports.encodeIconDescr = void 0;
exports.openIconPickerDialog = openIconPickerDialog;
const dialog_1 = require("./dialog");
const i18n_1 = require("./i18n");
const ui_style_1 = require("./ui-style");
const icons_1 = require("./icons");
const icon_descr_1 = require("./icon-descr");
Object.defineProperty(exports, "encodeIconDescr", { enumerable: true, get: function () { return icon_descr_1.encodeIconDescr; } });
Object.defineProperty(exports, "decodeIconDescr", { enumerable: true, get: function () { return icon_descr_1.decodeIconDescr; } });
const lucide_export_1 = require("./lucide-export");
/** Insert → Icons：从 Lucide 库挑选矢量图标。更换已有图标时带上当前颜色和标题。 */
function openIconPickerDialog(doc, opts) {
    const allIds = (0, lucide_export_1.listLucideIconIds)();
    return (0, dialog_1.showDialog)(doc, {
        title: opts?.title ?? (0, i18n_1.t)("dialog.icon.title"),
        width: 560,
        okLabel: "",
        buildBody: (body, ctx) => {
            const colorRow = doc.createElement("div");
            colorRow.style.cssText = "display:flex;align-items:center;gap:10px;margin-bottom:10px";
            const colorLbl = doc.createElement("span");
            colorLbl.textContent = (0, i18n_1.t)("dialog.icon.color");
            colorLbl.style.cssText = "color:var(--muted-foreground);font-size:12px";
            const colorInput = doc.createElement("input");
            colorInput.type = "color";
            const initial = opts?.color;
            colorInput.value = initial && /^#[0-9a-fA-F]{6}$/.test(initial) ? initial : "#111827";
            colorInput.className = ui_style_1.COLOR_SWATCH_CLASS;
            colorInput.style.cssText = "width:36px;height:28px";
            colorRow.append(colorLbl, colorInput);
            body.appendChild(colorRow);
            const search = doc.createElement("input");
            search.type = "search";
            search.placeholder = (0, i18n_1.t)("dialog.icon.search");
            search.style.cssText =
                "width:100%;box-sizing:border-box;background:var(--background);color:var(--foreground);border:1px solid var(--border);border-radius:4px;padding:8px 10px;font:inherit;margin-bottom:10px";
            body.appendChild(search);
            const gridWrap = doc.createElement("div");
            gridWrap.className = "ppt-scroll";
            gridWrap.style.cssText = "max-height:360px;overflow:auto;border:1px solid var(--border);border-radius:6px;padding:8px";
            body.appendChild(gridWrap);
            const pick = (iconId) => {
                ctx.close({ iconId, color: colorInput.value });
            };
            const renderGrid = (ids) => {
                gridWrap.replaceChildren();
                const grid = doc.createElement("div");
                grid.style.cssText = "display:grid;grid-template-columns:repeat(8,minmax(0,1fr));gap:4px";
                for (const id of ids) {
                    const btn = doc.createElement("button");
                    btn.type = "button";
                    btn.title = id;
                    btn.style.cssText = [
                        "display:flex",
                        "align-items:center",
                        "justify-content:center",
                        "aspect-ratio:1",
                        "border:1px solid var(--border)",
                        "border-radius:4px",
                        "background:var(--card)",
                        "cursor:pointer",
                        "color:var(--foreground)",
                        "padding:6px",
                    ].join(";");
                    btn.appendChild((0, icons_1.lucideSvg)(doc, id, 20));
                    btn.addEventListener("mouseenter", () => {
                        btn.style.borderColor = "var(--primary)";
                        btn.style.background = "var(--secondary)";
                    });
                    btn.addEventListener("mouseleave", () => {
                        btn.style.borderColor = "var(--border)";
                        btn.style.background = "var(--card)";
                    });
                    btn.addEventListener("click", () => pick(id));
                    grid.appendChild(btn);
                }
                gridWrap.appendChild(grid);
            };
            const filterIds = () => {
                const q = search.value.trim().toLowerCase();
                if (!q)
                    return [...lucide_export_1.POPULAR_LUCIDE_ICONS].filter((id) => allIds.includes(id));
                return allIds.filter((id) => id.includes(q)).slice(0, 240);
            };
            renderGrid(filterIds());
            search.addEventListener("input", () => renderGrid(filterIds()));
        },
    });
}
