"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mountSelectionPane = mountSelectionPane;
const commands_1 = require("./commands");
const i18n_1 = require("./i18n");
const icons_1 = require("./icons");
function isDecoration(shape) {
    return shape.id.startsWith("dec_") || shape.id.startsWith("bgov_");
}
function mountSelectionPane(opts) {
    const el = opts.doc.createElement("div");
    el.className = "ppt-scroll";
    el.style.cssText =
        "flex:1 1 0;min-height:0;overflow:auto;padding:8px;display:flex;flex-direction:column;gap:2px;background:var(--editor-panel,#191919);font:var(--font-sans, ui-sans-serif, system-ui, sans-serif)";
    const refresh = () => {
        el.innerHTML = "";
        const slide = opts.getSlide();
        if (!slide) {
            const empty = opts.doc.createElement("p");
            empty.style.cssText = "color:var(--muted-foreground);font-size:12px;padding:8px;margin:0";
            empty.textContent = (0, i18n_1.t)("selectionPane.empty");
            el.appendChild(empty);
            return;
        }
        const shapes = [];
        for (const layer of slide.layers) {
            for (const sh of layer.shapes) {
                if (!isDecoration(sh))
                    shapes.push(sh);
            }
        }
        if (shapes.length === 0) {
            const empty = opts.doc.createElement("p");
            empty.style.cssText = "color:var(--muted-foreground);font-size:12px;padding:8px;margin:0";
            empty.textContent = (0, i18n_1.t)("selectionPane.noShapes");
            el.appendChild(empty);
            return;
        }
        for (let i = shapes.length - 1; i >= 0; i--) {
            const sh = shapes[i];
            const row = opts.doc.createElement("div");
            row.style.cssText =
                "display:flex;align-items:center;gap:6px;padding:6px 8px;border-radius:var(--radius-sm,6px);cursor:pointer;border:1px solid transparent;transition:background-color .12s ease,border-color .12s ease";
            const selected = opts.selection.has(sh.id);
            if (selected) {
                row.style.background = "var(--accent,#333333)";
                row.style.borderColor = "var(--primary)";
            }
            row.addEventListener("mouseenter", () => {
                if (!opts.selection.has(sh.id))
                    row.style.background = "var(--accent,#333333)";
            });
            row.addEventListener("mouseleave", () => {
                if (!opts.selection.has(sh.id)) {
                    row.style.background = "transparent";
                    row.style.borderColor = "transparent";
                }
            });
            const eye = (0, icons_1.mkLucideIconButton)(opts.doc, sh.visible ? "eye" : "eye-off", "", sh.visible ? (0, i18n_1.t)("selectionPane.hide") : (0, i18n_1.t)("selectionPane.show"), 14);
            eye.style.cssText = [
                "background:transparent",
                "color:var(--foreground)",
                "border:1px solid transparent",
                "border-radius:4px",
                "width:26px",
                "height:24px",
                "cursor:pointer",
                "display:inline-flex",
                "align-items:center",
                "justify-content:center",
                "flex:0 0 auto",
                "opacity:" + (sh.visible ? "1" : "0.55"),
            ].join(";");
            eye.addEventListener("mouseenter", () => {
                eye.style.background = "var(--accent,#333333)";
            });
            eye.addEventListener("mouseleave", () => {
                eye.style.background = "transparent";
            });
            eye.addEventListener("click", (e) => {
                e.stopPropagation();
                opts.stack.execute(new commands_1.SetShapeVisibleCmd(opts.currentSlide(), sh.id, !sh.visible));
                refresh();
            });
            const label = opts.doc.createElement("span");
            label.style.cssText =
                "flex:1;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--foreground)";
            label.textContent = `${sh.name || sh.kind} \u00b7 ${sh.kind}`;
            row.append(eye, label);
            row.addEventListener("click", () => {
                opts.onSelectShape(sh.id);
                refresh();
            });
            el.appendChild(row);
        }
    };
    let selectionRefreshRaf = 0;
    const unsub = opts.selection.subscribe(() => {
        if (!el.offsetParent)
            return;
        const win = opts.doc.defaultView;
        if (!win?.requestAnimationFrame) {
            refresh();
            return;
        }
        if (selectionRefreshRaf)
            return;
        selectionRefreshRaf = win.requestAnimationFrame(() => {
            selectionRefreshRaf = 0;
            refresh();
        });
    });
    refresh();
    return {
        el,
        refresh,
        destroy() {
            unsub();
            el.remove();
        },
    };
}
