import { bindEditorModal } from "./dialog";
import type { PhotoAlbum } from "@ppt/core";
import { t } from "./i18n";
import type { PhotoAlbumImageInput, PhotoAlbumLayoutId } from "./photo-album-layout";
import { DIALOG_OVERLAY_CSS } from "./ui-style";

export interface PhotoAlbumDialogResult {
  images: PhotoAlbumImageInput[];
  album: PhotoAlbum;
}

function stripExtension(name: string): string {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(0, i) : name;
}

async function readImageFiles(files: FileList | File[]): Promise<PhotoAlbumImageInput[]> {
  const list = [...files].filter((f) => f.type.startsWith("image/"));
  const out: PhotoAlbumImageInput[] = [];
  for (const file of list) {
    const src = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    const natural = await new Promise<{ w: number; h: number } | undefined>((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => resolve(undefined);
      img.src = src;
    });
    out.push({
      src,
      natural,
      caption: stripExtension(file.name),
    });
  }
  return out;
}

export function openPhotoAlbumDialog(
  doc: Document,
  onApply: (result: PhotoAlbumDialogResult) => void,
): void {
  const overlay = doc.createElement("div");
  overlay.className = "local-picker-overlay";
  overlay.style.cssText =
    DIALOG_OVERLAY_CSS;

  const modal = doc.createElement("div");
  modal.style.cssText =
    "background:var(--popover);color:var(--popover-foreground);border:1px solid var(--border);border-radius:var(--radius-modal,12px);box-shadow:var(--shadow-lg);padding:16px 18px;width:min(460px,92vw);display:flex;flex-direction:column;gap:12px";

  const title = doc.createElement("h3");
  title.style.margin = "0";
  title.textContent = t("photoAlbum.title");
  modal.appendChild(title);

  const hint = doc.createElement("p");
  hint.style.cssText = "margin:0;font-size:12px;color:var(--muted-foreground,#a1a1aa);line-height:1.45";
  hint.textContent = t("photoAlbum.hint");
  modal.appendChild(hint);

  const fileRow = doc.createElement("div");
  fileRow.style.cssText = "display:flex;flex-direction:column;gap:6px";
  const fileLabel = doc.createElement("label");
  fileLabel.style.fontSize = "13px";
  fileLabel.textContent = t("photoAlbum.pictures");
  const fileInput = doc.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "image/*";
  fileInput.multiple = true;
  fileInput.style.cssText = "font:inherit;color:inherit";
  const fileCount = doc.createElement("span");
  fileCount.style.cssText = "font-size:12px;color:var(--muted-foreground,#a1a1aa)";
  fileCount.textContent = t("photoAlbum.noFiles");
  fileInput.addEventListener("change", () => {
    const n = fileInput.files?.length ?? 0;
    fileCount.textContent = n ? t("photoAlbum.fileCount", { n: String(n) }) : t("photoAlbum.noFiles");
  });
  fileRow.append(fileLabel, fileInput, fileCount);
  modal.appendChild(fileRow);

  const layoutRow = doc.createElement("div");
  layoutRow.style.cssText = "display:flex;flex-direction:column;gap:6px;font-size:13px";
  const layoutLabel = doc.createElement("label");
  layoutLabel.textContent = t("photoAlbum.layout");
  const layoutSelect = doc.createElement("select");
  layoutSelect.style.cssText =
    "background:var(--background);color:inherit;border:1px solid var(--border);border-radius:4px;padding:6px 8px;font:inherit";
  const layouts: Array<{ id: PhotoAlbumLayoutId; label: string }> = [
    { id: "fitToSlide", label: t("photoAlbum.layout.fitToSlide") },
    { id: "2pic", label: t("photoAlbum.layout.2pic") },
    { id: "4pic", label: t("photoAlbum.layout.4pic") },
  ];
  for (const opt of layouts) {
    const o = doc.createElement("option");
    o.value = opt.id;
    o.textContent = opt.label;
    layoutSelect.appendChild(o);
  }
  layoutRow.append(layoutLabel, layoutSelect);
  modal.appendChild(layoutRow);

  const checkRow = doc.createElement("div");
  checkRow.style.cssText = "display:flex;flex-direction:column;gap:6px;font-size:13px";
  const captionsLab = doc.createElement("label");
  captionsLab.style.cssText = "display:flex;align-items:center;gap:8px;cursor:pointer";
  const captionsCb = doc.createElement("input");
  captionsCb.type = "checkbox";
  captionsCb.checked = true;
  captionsLab.append(captionsCb, doc.createTextNode(t("photoAlbum.showCaptions")));
  const bwLab = doc.createElement("label");
  bwLab.style.cssText = "display:flex;align-items:center;gap:8px;cursor:pointer";
  const bwCb = doc.createElement("input");
  bwCb.type = "checkbox";
  bwLab.append(bwCb, doc.createTextNode(t("photoAlbum.bw")));
  checkRow.append(captionsLab, bwLab);
  modal.appendChild(checkRow);

  const status = doc.createElement("div");
  status.style.cssText = "font-size:12px;color:var(--destructive);min-height:1em";
  modal.appendChild(status);

  let modalDismiss: { release: () => void } | undefined;
  const close = (): void => {
    modalDismiss?.release();
    overlay.remove();
  };

  const row = doc.createElement("div");
  row.style.cssText = "display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap";
  const createBtn = doc.createElement("button");
  createBtn.type = "button";
  createBtn.textContent = t("photoAlbum.create");
  createBtn.style.cssText =
    "background:var(--primary);color:var(--primary-foreground);border:none;border-radius:4px;padding:8px 14px;cursor:pointer;font:inherit";
  createBtn.addEventListener("click", () => {
    void (async () => {
      const files = fileInput.files;
      if (!files?.length) {
        status.textContent = t("photoAlbum.needFiles");
        return;
      }
      status.textContent = "";
      createBtn.disabled = true;
      try {
        const images = await readImageFiles(files);
        if (!images.length) {
          status.textContent = t("photoAlbum.needFiles");
          return;
        }
        const album: PhotoAlbum = {
          layout: layoutSelect.value as PhotoAlbumLayoutId,
          showCaptions: captionsCb.checked,
          bw: bwCb.checked || undefined,
        };
        onApply({ images, album });
        close();
      } catch {
        status.textContent = t("photoAlbum.readError");
      } finally {
        createBtn.disabled = false;
      }
    })();
  });
  const cancel = doc.createElement("button");
  cancel.type = "button";
  cancel.textContent = t("photoAlbum.cancel");
  cancel.style.cssText =
    "background:transparent;color:inherit;border:1px solid var(--border);border-radius:4px;padding:8px 14px;cursor:pointer;font:inherit";
  cancel.addEventListener("click", close);
  row.append(createBtn, cancel);
  modal.appendChild(row);

  overlay.appendChild(modal);
  modalDismiss = bindEditorModal({ doc, overlay, panel: modal, onCancel: close });
  doc.body.appendChild(overlay);
}
