import { showDialog } from "./dialog";
import { formatByteSize, oleEmbedByteSize, isOleEmbedOverLimit } from "./ole-cmd";
import { t } from "./i18n";

export interface OleInsertResult {
  fileName: string;
  embedSrc: string;
  showAsIcon: boolean;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

function acceptOleFile(file: File): boolean {
  if (!file.size) return false;
  const name = file.name.toLowerCase();
  return /\.(xlsx?|docx?|pptx?|pdf|bin|txt|csv|rtf|odt|ods|odp)$/i.test(name) || file.type.startsWith("application/");
}

export function openOleInsertDialog(doc: Document): Promise<OleInsertResult | null> {
  return showDialog<OleInsertResult>(doc, {
    title: t("dialog.ole.title"),
    width: 420,
    okLabel: t("dialog.ole.insert"),
    okEnabled: false,
    buildBody: (body, ctx) => {
      const hint = doc.createElement("p");
      hint.textContent = t("dialog.ole.hint");
      hint.style.cssText = "margin:0 0 12px;font-size:12px;color:var(--muted-foreground)";
      body.appendChild(hint);

      const drop = doc.createElement("div");
      drop.style.cssText =
        "border:1px dashed var(--border,#555);border-radius:8px;padding:16px 12px;text-align:center;font-size:12px;color:var(--muted-foreground);margin-bottom:10px;cursor:pointer";
      drop.textContent = t("dialog.ole.dropHint");
      body.appendChild(drop);

      const fileLabel = doc.createElement("p");
      fileLabel.style.cssText = "margin:0 0 8px;font-size:12px;color:var(--muted-foreground);min-height:18px";
      fileLabel.textContent = t("dialog.ole.noFile");
      body.appendChild(fileLabel);

      const browse = doc.createElement("button");
      browse.type = "button";
      browse.textContent = t("dialog.ole.browse");
      browse.style.cssText =
        "padding:8px 12px;border:1px solid var(--border);border-radius:6px;background:var(--secondary);color:var(--foreground);cursor:pointer;font:inherit;margin-bottom:12px";
      body.appendChild(browse);

      const iconRow = doc.createElement("label");
      iconRow.style.cssText = "display:flex;align-items:center;gap:8px;font-size:12px;cursor:pointer";
      const iconCb = doc.createElement("input");
      iconCb.type = "checkbox";
      iconCb.checked = true;
      iconCb.style.accentColor = "var(--primary)";
      const iconText = doc.createElement("span");
      iconText.textContent = t("dialog.ole.showAsIcon");
      iconRow.append(iconCb, iconText);
      body.appendChild(iconRow);

      let picked: { fileName: string; embedSrc: string } | null = null;
      let loading = false;

      const setPicked = async (file: File): Promise<void> => {
        if (loading) return;
        if (!acceptOleFile(file)) {
          fileLabel.textContent = t("dialog.ole.unsupported");
          picked = null;
          ctx.setOkEnabled(false);
          return;
        }
        loading = true;
        browse.disabled = true;
        fileLabel.textContent = t("dialog.ole.loading");
        try {
          const embedSrc = await readFileAsDataUrl(file);
          picked = { fileName: file.name, embedSrc };
          const bytes = oleEmbedByteSize(embedSrc);
          const sizeLabel = bytes != null ? ` · ${formatByteSize(bytes)}` : "";
          const warn = bytes != null && isOleEmbedOverLimit(bytes) ? ` · ${t("dialog.ole.largeWarning")}` : "";
          fileLabel.textContent = `${file.name}${sizeLabel}${warn}`;
          ctx.setOkEnabled(true);
        } catch {
          fileLabel.textContent = t("dialog.ole.loadFailed");
          picked = null;
          ctx.setOkEnabled(false);
        } finally {
          loading = false;
          browse.disabled = false;
        }
      };

      const openPicker = (): void => {
        const inp = doc.createElement("input");
        inp.type = "file";
        inp.accept = ".xlsx,.xls,.docx,.doc,.pptx,.ppt,.pdf,.bin,application/*";
        inp.addEventListener("change", () => {
          const file = inp.files?.[0];
          if (file) void setPicked(file);
        });
        inp.click();
      };

      browse.addEventListener("click", openPicker);
      drop.addEventListener("click", openPicker);
      drop.addEventListener("dragover", (e) => {
        e.preventDefault();
        drop.style.borderColor = "var(--primary,#3b82f6)";
      });
      drop.addEventListener("dragleave", () => {
        drop.style.borderColor = "";
      });
      drop.addEventListener("drop", (e) => {
        e.preventDefault();
        drop.style.borderColor = "";
        const file = e.dataTransfer?.files?.[0];
        if (file) void setPicked(file);
      });

      return () => {
        if (!picked) return null;
        return {
          fileName: picked.fileName,
          embedSrc: picked.embedSrc,
          showAsIcon: iconCb.checked,
        };
      };
    },
  });
}
