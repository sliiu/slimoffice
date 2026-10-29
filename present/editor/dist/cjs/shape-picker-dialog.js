"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.openShapePickerDialog = openShapePickerDialog;
const dialog_1 = require("./dialog");
const i18n_1 = require("./i18n");
const shape_library_1 = require("./shape-library");
const CATEGORY_LABEL = {
    lines: "shapeLib.cat.lines",
    rect: "shapeLib.cat.rect",
    basic: "shapeLib.cat.basic",
    arrows: "shapeLib.cat.arrows",
    flowchart: "shapeLib.cat.flowchart",
    starsBanners: "shapeLib.cat.starsBanners",
    callouts: "shapeLib.cat.callouts",
};
/** Insert → 形状组末尾「更多」：按 OOXML 分类挑选预设，点中即关闭。 */
function openShapePickerDialog(doc) {
    return (0, dialog_1.showDialog)(doc, {
        title: (0, i18n_1.t)("toolbar.insert.moreShapes"),
        width: 560,
        okLabel: "",
        buildBody: (body, ctx) => {
            for (const cat of shape_library_1.CATEGORY_ORDER) {
                const entries = (0, shape_library_1.entriesByCategory)(cat);
                if (entries.length === 0)
                    continue;
                const h = doc.createElement("div");
                h.textContent = (0, i18n_1.t)(CATEGORY_LABEL[cat]);
                h.style.cssText =
                    "color:var(--muted-foreground);font-size:10px;letter-spacing:.4px;text-transform:uppercase;margin:8px 2px 4px";
                body.appendChild(h);
                const grid = doc.createElement("div");
                grid.style.cssText = "display:grid;grid-template-columns:repeat(10,36px);gap:4px";
                for (const e of entries) {
                    const lbl = (0, i18n_1.t)(e.labelKey);
                    const title = lbl !== e.labelKey ? lbl : e.fallback;
                    const cell = doc.createElement("button");
                    cell.type = "button";
                    cell.title = title;
                    cell.setAttribute("aria-label", title);
                    cell.dataset.pptShapeId = e.id;
                    cell.style.cssText = [
                        "width:36px",
                        "height:36px",
                        "background:transparent",
                        "color:var(--foreground)",
                        "border:1px solid var(--border)",
                        "border-radius:3px",
                        "cursor:pointer",
                        "display:flex",
                        "align-items:center",
                        "justify-content:center",
                        "padding:4px",
                    ].join(";");
                    cell.addEventListener("mouseenter", () => {
                        cell.style.background = "var(--primary)";
                        cell.style.borderColor = "var(--primary)";
                    });
                    cell.addEventListener("mouseleave", () => {
                        cell.style.background = "transparent";
                        cell.style.borderColor = "var(--border)";
                    });
                    cell.addEventListener("click", () => ctx.close(e.id));
                    const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
                    svg.setAttribute("viewBox", "0 0 24 24");
                    svg.setAttribute("width", "24");
                    svg.setAttribute("height", "24");
                    svg.setAttribute("aria-hidden", "true");
                    svg.style.color = "currentColor";
                    svg.innerHTML = e.icon;
                    cell.appendChild(svg);
                    grid.appendChild(cell);
                }
                body.appendChild(grid);
            }
        },
    });
}
