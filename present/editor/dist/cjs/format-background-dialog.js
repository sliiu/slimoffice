"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.openFormatBackgroundDialog = openFormatBackgroundDialog;
const dialog_1 = require("./dialog");
const i18n_1 = require("./i18n");
const paint_editor_ui_1 = require("./paint-editor-ui");
/** Design → Format Background：与 inspector 背景区相同的 paint 编辑器，以对话框呈现。 */
function openFormatBackgroundDialog(doc, opts) {
    void (0, dialog_1.showDialog)(doc, {
        title: (0, i18n_1.t)("dialog.formatBackground.title"),
        width: 460,
        okLabel: "",
        buildBody: (body, ctx) => {
            const hint = doc.createElement("p");
            hint.textContent = (0, i18n_1.t)("dialog.formatBackground.hint");
            hint.style.cssText = "margin:0 0 10px;color:var(--muted-foreground);font-size:12px;line-height:1.45";
            body.appendChild(hint);
            const editor = doc.createElement("div");
            body.appendChild(editor);
            const p = opts.getPaint();
            const fallback = p?.kind === "solid" ? p.color : "#ffffff";
            const rebuild = () => {
                editor.replaceChildren();
                (0, paint_editor_ui_1.appendPaintEditor)(doc, editor, {
                    getPaint: opts.getPaint,
                    apply: opts.apply,
                    modes: ["none", "solid", "linear", "radial", "image", "pattern"],
                    fallbackSolid: fallback,
                    newImageAlpha: opts.newImageAlpha ?? 0.55,
                    onTypeChange: rebuild,
                });
            };
            rebuild();
        },
    });
}
