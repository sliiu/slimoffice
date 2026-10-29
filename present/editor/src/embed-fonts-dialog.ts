import { bindEditorModal } from "./dialog";
import type { CommandStack, EmbeddedFont, Presentation } from "@ppt/core";
import { collectUsedFontFaces, collectUsedTypefaces, isFontFaceEmbedded, isTypefaceEmbedded, bytesToFontDataUrl } from "@ppt/core";
import { findFontPreset } from "@ppt/themes";
import { EmbedFontsCmd } from "./embed-fonts-cmd";
import { fetchPresetFontDataUrl } from "./font-embed-fetch";
import { t } from "./i18n";
import { DIALOG_OVERLAY_CSS } from "./ui-style";

export function openEmbedFontsDialog(
  doc: Document,
  pres: Presentation,
  stack: CommandStack,
): void {
  const families = collectUsedTypefaces(pres);
  const usedFaces = collectUsedFontFaces(pres);
  const pendingFiles = new Map<string, File>();

  const overlay = doc.createElement("div");
  overlay.className = "local-picker-overlay";
  overlay.style.cssText =
    DIALOG_OVERLAY_CSS;

  const modal = doc.createElement("div");
  modal.style.cssText =
    "background:var(--popover);color:var(--popover-foreground);border:1px solid var(--border);border-radius:var(--radius-modal,12px);box-shadow:var(--shadow-lg);padding:16px 18px;width:min(520px,94vw);max-height:85vh;display:flex;flex-direction:column;gap:12px";

  const title = doc.createElement("h3");
  title.style.margin = "0";
  title.textContent = t("embedFonts.title");
  modal.appendChild(title);

  const hint = doc.createElement("p");
  hint.style.cssText = "margin:0;font-size:12px;color:var(--muted-foreground,#a1a1aa);line-height:1.45";
  hint.textContent = t("embedFonts.hint");
  modal.appendChild(hint);

  const list = doc.createElement("div");
  list.style.cssText = "overflow:auto;flex:1;min-height:120px;border:1px solid var(--border,#3a3a3a);border-radius:6px";

  const status = doc.createElement("div");
  status.style.cssText = "font-size:12px;color:var(--destructive);min-height:1em";

  let modalDismiss: { release: () => void } | undefined;
  const close = (): void => {
    modalDismiss?.release();
    overlay.remove();
  };

  const renderList = (): void => {
    list.replaceChildren();
    if (!families.length) {
      const empty = doc.createElement("div");
      empty.style.cssText = "padding:12px;font-size:13px;color:var(--muted-foreground,#a1a1aa)";
      empty.textContent = t("embedFonts.noFontsUsed");
      list.appendChild(empty);
      return;
    }
    for (const family of families) {
      const row = doc.createElement("div");
      row.style.cssText =
        "display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid var(--border,#3a3a3a);font-size:13px";
      const name = doc.createElement("span");
      name.style.flex = "1";
      name.textContent = family;
      row.appendChild(name);

      const badge = doc.createElement("span");
      badge.style.cssText = "font-size:11px;color:var(--muted-foreground,#a1a1aa)";
      badge.textContent = isTypefaceEmbedded(pres, family)
        ? t("embedFonts.statusEmbedded")
        : t("embedFonts.statusMissing");
      row.appendChild(badge);

      if (!isTypefaceEmbedded(pres, family)) {
        const browse = doc.createElement("button");
        browse.type = "button";
        browse.textContent = t("embedFonts.browse");
        browse.style.cssText =
          "font:inherit;font-size:11px;padding:4px 8px;border-radius:4px;border:1px solid var(--border);background:var(--secondary);color:inherit;cursor:pointer";
        const input = doc.createElement("input");
        input.type = "file";
        input.accept = ".ttf,.otf,.woff,font/ttf,font/otf";
        input.style.display = "none";
        browse.addEventListener("click", () => input.click());
        input.addEventListener("change", () => {
          const file = input.files?.[0];
          if (file) {
            pendingFiles.set(family, file);
            badge.textContent = t("embedFonts.statusReady", { name: file.name });
          }
        });
        row.appendChild(browse);
        row.appendChild(input);
      }
      list.appendChild(row);
    }
  };

  renderList();
  modal.appendChild(list);
  modal.appendChild(status);

  const subsetLab = doc.createElement("label");
  subsetLab.style.cssText = "display:flex;align-items:center;gap:8px;font-size:12px";
  const subsetCb = doc.createElement("input");
  subsetCb.type = "checkbox";
  subsetCb.checked = pres.options?.saveSubsetFonts ?? false;
  subsetLab.append(subsetCb, doc.createTextNode(t("embedFonts.saveSubset")));
  modal.appendChild(subsetLab);

  const row = doc.createElement("div");
  row.style.cssText = "display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap";

  const embedGoogleBtn = doc.createElement("button");
  embedGoogleBtn.type = "button";
  embedGoogleBtn.textContent = t("embedFonts.embedGoogle");
  embedGoogleBtn.style.cssText =
    "background:var(--secondary);color:inherit;border:1px solid var(--border);border-radius:4px;padding:8px 12px;cursor:pointer;font:inherit";

  const embedBtn = doc.createElement("button");
  embedBtn.type = "button";
  embedBtn.textContent = t("embedFonts.embed");
  embedBtn.style.cssText =
    "background:var(--primary);color:var(--primary-foreground);border:none;border-radius:4px;padding:8px 14px;cursor:pointer;font:inherit";

  const cancel = doc.createElement("button");
  cancel.type = "button";
  cancel.textContent = t("embedFonts.cancel");
  cancel.style.cssText =
    "background:transparent;color:inherit;border:1px solid var(--border);border-radius:4px;padding:8px 14px;cursor:pointer;font:inherit";

  const readFileBytes = (file: File): Promise<Uint8Array> =>
    file.arrayBuffer().then((ab) => new Uint8Array(ab));

  const buildAdditions = async (googleOnly: boolean): Promise<EmbeddedFont[]> => {
    const out: EmbeddedFont[] = [];
    for (const family of families) {
      const file = pendingFiles.get(family);
      if (file) {
        const bytes = await readFileBytes(file);
        const mime = file.name.toLowerCase().endsWith(".otf") ? "font/otf" : "font/ttf";
        out.push({
          family,
          weight: 400,
          style: "normal",
          src: bytesToFontDataUrl(bytes, mime),
          format: mime.includes("otf") ? "opentype" : "truetype",
        });
        continue;
      }
      if (!googleOnly) continue;
      if (!findFontPreset(family)) continue;
      const usedWeights = usedFaces.filter((f) => f.family === family).map((f) => f.weight);
      const weights = new Set<number>([400]);
      const max = usedWeights.length ? Math.max(...usedWeights) : 400;
      if (max >= 800) weights.add(800);
      else if (max >= 600) weights.add(700);
      for (const weight of weights) {
        if (isFontFaceEmbedded(pres, family, weight)) continue;
        const src = await fetchPresetFontDataUrl(family, weight);
        if (!src && weight >= 800) {
          const fallback = await fetchPresetFontDataUrl(family, 700);
          if (fallback) {
            out.push({ family, weight: 700, style: "normal", src: fallback, format: "truetype" });
          }
          continue;
        }
        if (!src) continue;
        out.push({ family, weight, style: "normal", src, format: "truetype" });
      }
    }
    return out;
  };

  const runEmbed = async (googleOnly: boolean): Promise<void> => {
    status.textContent = "";
    embedBtn.disabled = true;
    embedGoogleBtn.disabled = true;
    try {
      const additions = await buildAdditions(googleOnly);
      if (!additions.length) {
        status.textContent = t("embedFonts.nothingToEmbed");
        return;
      }
      stack.execute(
        new EmbedFontsCmd(additions, {
          embedTrueTypeFonts: true,
          saveSubsetFonts: subsetCb.checked,
        }),
      );
      close();
    } catch {
      status.textContent = t("embedFonts.readError");
    } finally {
      embedBtn.disabled = false;
      embedGoogleBtn.disabled = false;
    }
  };

  embedGoogleBtn.addEventListener("click", () => void runEmbed(true));
  embedBtn.addEventListener("click", () => void runEmbed(false));
  cancel.addEventListener("click", close);
  modalDismiss = bindEditorModal({ doc, overlay, panel: modal, onCancel: close });

  row.append(embedGoogleBtn, embedBtn, cancel);
  modal.appendChild(row);
  overlay.appendChild(modal);
  doc.body.appendChild(overlay);
}
