import { showDialog } from "./dialog.js";
import { t } from "./i18n/index.js";
import { normalizeWebEmbedUrl } from "@sliiu/present-core";
export function openWebEmbedDialog(doc) {
    return showDialog(doc, {
        title: t("dialog.webEmbed.title"),
        width: 480,
        okLabel: t("dialog.webEmbed.insert"),
        okEnabled: false,
        buildBody: (body, ctx) => {
            const hint = doc.createElement("p");
            hint.textContent = t("dialog.webEmbed.hint");
            hint.style.cssText = "margin:0 0 12px;font-size:12px;color:var(--muted-foreground);line-height:1.45";
            body.appendChild(hint);
            const urlLbl = doc.createElement("label");
            urlLbl.textContent = t("dialog.webEmbed.urlLabel");
            urlLbl.style.cssText = "display:block;color:var(--muted-foreground);margin-bottom:4px;font-size:12px";
            const urlInput = doc.createElement("input");
            urlInput.type = "url";
            urlInput.placeholder = t("dialog.webEmbed.urlPlaceholder");
            urlInput.style.cssText =
                "width:100%;box-sizing:border-box;padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:var(--background);color:var(--foreground);font:inherit";
            body.append(urlLbl, urlInput);
            const examples = doc.createElement("p");
            examples.textContent = t("dialog.webEmbed.examples");
            examples.style.cssText = "margin:10px 0 0;font-size:11px;color:var(--muted-foreground);line-height:1.4";
            body.appendChild(examples);
            const sync = () => {
                const norm = normalizeWebEmbedUrl(urlInput.value);
                ctx.setOkEnabled(norm !== null);
            };
            urlInput.addEventListener("input", sync);
            sync();
            setTimeout(() => urlInput.focus(), 0);
            return () => {
                const norm = normalizeWebEmbedUrl(urlInput.value);
                if (!norm)
                    return null;
                return { embed: norm };
            };
        },
    });
}
