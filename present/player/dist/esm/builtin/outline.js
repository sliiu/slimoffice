import { createTranslator } from "../i18n.js";
/** Slide outline navigation (by slide name). */
export const outlinePlugin = {
    id: "official:outline",
    name: "Outline",
    version: "1.0.0",
    activate(ctx) {
        const tr = createTranslator(ctx.locale);
        const items = [];
        const highlight = (cur) => {
            for (const it of items) {
                const on = it.v === cur;
                it.li.style.background = on ? "rgba(59,130,246,.25)" : "";
                it.li.style.color = on ? "#fff" : "var(--ppt-panel-head-fg,#cbd5e1)";
            }
        };
        ctx.ui.addPanel({
            id: "outline",
            title: tr("outline.panel.title"),
            order: 20,
            render: (body) => {
                const ul = document.createElement("ul");
                ul.style.cssText =
                    "list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:4px;";
                items.length = 0;
                ctx.presentation.visibleOrder.forEach((absI, v) => {
                    const slide = ctx.presentation.slides[absI];
                    const li = document.createElement("li");
                    li.textContent = `${v + 1}. ${slide.name || tr("outline.untitled")}`;
                    li.style.cssText =
                        "padding:6px 8px;border-radius:4px;cursor:pointer;color:var(--ppt-panel-head-fg,#cbd5e1);";
                    li.addEventListener("mouseenter", () => {
                        if (ctx.player.current() !== v)
                            li.style.background = "rgba(255,255,255,.08)";
                    });
                    li.addEventListener("mouseleave", () => {
                        if (ctx.player.current() !== v)
                            li.style.background = "";
                    });
                    li.addEventListener("click", () => ctx.player.goto(v));
                    ul.appendChild(li);
                    items.push({ v, li });
                });
                body.appendChild(ul);
                highlight(ctx.player.current());
            },
        });
        const off = ctx.events.on("slidechange", (e) => highlight(e.visibleIndex));
        return () => off();
    },
};
