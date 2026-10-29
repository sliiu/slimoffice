"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.speakerNotesEditorPlugin = void 0;
const core_1 = require("@sliiu/present-core");
const define_1 = require("../define");
/** Editor dock panel showing speaker notes for the current slide. */
exports.speakerNotesEditorPlugin = (0, define_1.defineEditorPlugin)({
    id: core_1.OFFICIAL_EDITOR_PLUGIN_IDS.speakerNotes,
    name: "Speaker notes",
    version: "1.0.0",
    activate(ctx) {
        const doc = ctx.editor.hostElement().ownerDocument;
        const body = doc.createElement("div");
        body.style.cssText =
            "white-space:pre-wrap;line-height:1.55;font-size:13px;min-height:64px;color:var(--foreground,#e2e8f0);";
        const panel = ctx.ui.addPanel({
            id: "speaker-notes-panel",
            title: ctx.locale.startsWith("zh") ? "演讲者备注" : "Speaker notes",
            initialOpen: false,
            order: 20,
            render: (host) => {
                host.appendChild(body);
            },
        });
        const refresh = () => {
            const pres = ctx.editor.getPresentation();
            const slide = pres.slides[ctx.editor.getSlideIndex()];
            const text = slide?.notes?.trim();
            const zh = ctx.locale.startsWith("zh");
            body.textContent = text || (zh ? "（本页无备注）" : "(No speaker notes on this slide)");
        };
        const offs = [
            ctx.events.on("slidechange", refresh),
            ctx.events.on("command", refresh),
            ctx.events.on("presentationchange", refresh),
        ];
        refresh();
        return () => {
            for (const off of offs)
                off();
            panel.remove();
        };
    },
});
