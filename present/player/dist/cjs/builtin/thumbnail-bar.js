"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.thumbnailBarPlugin = void 0;
const i18n_1 = require("../i18n");
/** Thumbnail strip for quick slide navigation. */
exports.thumbnailBarPlugin = {
    id: "official:thumbnail-bar",
    name: "Slide Thumbnails",
    version: "1.0.0",
    activate(ctx) {
        const tr = (0, i18n_1.createTranslator)(ctx.locale);
        let container = null;
        const itemEls = new Map();
        const thumbHandles = [];
        const highlight = (v) => {
            for (const [k, el] of itemEls) {
                el.style.borderColor = k === v ? "var(--ppt-accent,#3b82f6)" : "transparent";
            }
        };
        const renderAll = () => {
            if (!container)
                return;
            while (thumbHandles.length)
                thumbHandles.pop().destroy();
            container.replaceChildren();
            itemEls.clear();
            const total = ctx.player.total();
            const visibleOrder = ctx.presentation.visibleOrder;
            const ar = `${ctx.presentation.size.width} / ${ctx.presentation.size.height}`;
            for (let v = 0; v < total; v++) {
                const absI = visibleOrder[v];
                const slide = ctx.presentation.slides[absI];
                const item = document.createElement("div");
                item.style.cssText = [
                    "cursor:pointer",
                    "border:2px solid transparent",
                    "border-radius:4px",
                    "overflow:hidden",
                    "flex:0 0 auto",
                    "transition:border-color .15s",
                ].join(";");
                const idxLabel = document.createElement("div");
                idxLabel.textContent = `${v + 1}. ${slide?.name ?? ""}`;
                idxLabel.style.cssText =
                    "font-size:11px;padding:4px 6px;color:var(--ppt-panel-head-fg,#94a3b8);";
                item.appendChild(idxLabel);
                const thumbHost = document.createElement("div");
                thumbHost.style.cssText = `aspect-ratio:${ar};width:100%;background:#fff;display:block;overflow:hidden;`;
                item.appendChild(thumbHost);
                item.addEventListener("click", () => ctx.player.goto(v));
                container.appendChild(item);
                itemEls.set(v, item);
                try {
                    thumbHandles.push(ctx.thumbnail.mount(thumbHost, v));
                }
                catch (e) {
                    ctx.log("thumbnail mount failed", v, e);
                    thumbHost.textContent = "—";
                }
            }
            highlight(ctx.player.current());
        };
        ctx.ui.addPanel({
            id: "thumbnail-bar",
            title: tr("thumb.panel.title"),
            order: 10,
            render: (body) => {
                body.classList.add("ppt-thumb-list");
                container = body;
                renderAll();
            },
        });
        const off = ctx.events.on("slidechange", (e) => highlight(e.visibleIndex));
        return () => {
            off();
            while (thumbHandles.length)
                thumbHandles.pop().destroy();
        };
    },
};
