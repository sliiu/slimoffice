import { createTranslator } from "../i18n.js";
/** Speaker notes for the current slide during playback. */
export const notesPanelPlugin = {
    id: "official:notes-panel",
    name: "Speaker Notes",
    version: "1.0.0",
    activate(ctx) {
        const tr = createTranslator(ctx.locale);
        const body = ctx.ui.rootElement().ownerDocument.createElement("div");
        body.style.cssText =
            "white-space:pre-wrap;line-height:1.55;font-size:13px;color:var(--ppt-dock-fg,#e2e8f0);min-height:48px;";
        const refresh = (visibleIndex) => {
            const abs = ctx.presentation.visibleOrder[visibleIndex];
            const slide = abs !== undefined ? ctx.presentation.slides[abs] : undefined;
            const text = slide?.notes?.trim();
            body.textContent = text || tr("notes.empty");
        };
        ctx.ui.addPanel({
            id: "notes-panel",
            title: tr("notes.panel.title"),
            order: 30,
            initialOpen: false,
            render: (host) => {
                host.appendChild(body);
                refresh(ctx.player.current());
            },
        });
        const off = ctx.events.on("slidechange", (e) => refresh(e.visibleIndex));
        refresh(ctx.player.current());
        return () => off();
    },
};
