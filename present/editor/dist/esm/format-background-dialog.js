import { showDialog } from "./dialog.js";
import { t } from "./i18n/index.js";
import { appendPaintEditor } from "./paint-editor-ui.js";
/** Design → Format Background：与 inspector 背景区相同的 paint 编辑器，以对话框呈现。 */
export function openFormatBackgroundDialog(doc, opts) {
    void showDialog(doc, {
        title: t("dialog.formatBackground.title"),
        width: 460,
        okLabel: "",
        buildBody: (body, ctx) => {
            const hint = doc.createElement("p");
            hint.textContent = t("dialog.formatBackground.hint");
            hint.style.cssText = "margin:0 0 10px;color:var(--muted-foreground);font-size:12px;line-height:1.45";
            body.appendChild(hint);
            const editor = doc.createElement("div");
            body.appendChild(editor);
            const p = opts.getPaint();
            const fallback = p?.kind === "solid" ? p.color : "#ffffff";
            const rebuild = () => {
                editor.replaceChildren();
                appendPaintEditor(doc, editor, {
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
