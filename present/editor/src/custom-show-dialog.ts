import type { CustomShow, Presentation } from "@ppt/core";
import { showDialog } from "./dialog";
import { t } from "./i18n";

export interface CustomShowDialogResult {
  action: "play" | "save";
  shows: CustomShow[];
}

function genCustomShowId(): string {
  return `cust_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

/** Slideshow → Custom Show：管理自定义放映子集。 */
export function openCustomShowDialog(
  doc: Document,
  pres: Presentation,
  opts: {
    onPlay?: (indices: number[]) => void;
  } = {},
): void {
  const shows: CustomShow[] = (pres.customShows ?? []).map((s) => ({
    ...s,
    slideIndices: s.slideIndices ?? indicesFromRIds(pres, s.slideRIds),
  }));

  void showDialog<CustomShowDialogResult>(doc, {
    title: t("dialog.customShow.title"),
    width: 480,
    okLabel: t("dialog.customShow.save"),
    buildBody: (body, ctx) => {
      const listWrap = doc.createElement("div");
      listWrap.style.cssText = "display:flex;flex-direction:column;gap:8px;margin-bottom:12px";
      body.appendChild(listWrap);

      const nameInput = doc.createElement("input");
      nameInput.type = "text";
      nameInput.placeholder = t("dialog.customShow.namePlaceholder");
      nameInput.style.cssText =
        "width:100%;background:var(--background);color:var(--foreground);border:1px solid var(--border);border-radius:4px;padding:6px 8px;font:inherit";
      body.appendChild(nameInput);

      const pickLabel = doc.createElement("div");
      pickLabel.textContent = t("dialog.customShow.pickSlides");
      pickLabel.style.cssText = "margin:10px 0 6px;font-size:11px;color:var(--muted-foreground);text-transform:uppercase";
      body.appendChild(pickLabel);

      const checks = doc.createElement("div");
      checks.style.cssText = "max-height:200px;overflow:auto;border:1px solid var(--border);border-radius:4px;padding:8px;display:flex;flex-direction:column;gap:4px";
      const selected = new Set<number>();
      pres.slides.forEach((slide, i) => {
        if (slide.show === false) return;
        const lab = doc.createElement("label");
        lab.style.cssText = "display:flex;align-items:center;gap:6px;cursor:pointer;font-size:12px";
        const cb = doc.createElement("input");
        cb.type = "checkbox";
        cb.addEventListener("change", () => {
          if (cb.checked) selected.add(i);
          else selected.delete(i);
        });
        lab.append(cb, doc.createTextNode(`${i + 1}. ${slide.name}`));
        checks.appendChild(lab);
      });
      body.appendChild(checks);

      const btnRow = doc.createElement("div");
      btnRow.style.cssText = "display:flex;gap:8px;margin-top:10px;flex-wrap:wrap";
      const addBtn = doc.createElement("button");
      addBtn.textContent = t("dialog.customShow.add");
      addBtn.style.cssText =
        "background:var(--secondary);color:var(--foreground);border:1px solid var(--border);border-radius:4px;padding:6px 10px;cursor:pointer;font:inherit";
      addBtn.addEventListener("click", () => {
        const name = nameInput.value.trim() || t("dialog.customShow.defaultName", { n: shows.length + 1 });
        const indices = [...selected].sort((a, b) => a - b);
        if (indices.length === 0) return;
        shows.push({ id: genCustomShowId(), name, slideRIds: [], slideIndices: indices });
        nameInput.value = "";
        selected.clear();
        checks.querySelectorAll<HTMLInputElement>("input[type=checkbox]").forEach((c) => { c.checked = false; });
        renderList();
      });
      btnRow.appendChild(addBtn);
      body.appendChild(btnRow);

      const renderList = (): void => {
        listWrap.replaceChildren();
        if (shows.length === 0) {
          const empty = doc.createElement("p");
          empty.textContent = t("dialog.customShow.empty");
          empty.style.cssText = "margin:0;color:var(--muted-foreground);font-size:12px";
          listWrap.appendChild(empty);
          return;
        }
        for (const show of shows) {
          const row = doc.createElement("div");
          row.style.cssText =
            "display:flex;align-items:center;gap:8px;padding:8px;background:var(--card);border:1px solid var(--border);border-radius:4px";
          const meta = doc.createElement("div");
          meta.style.flex = "1";
          const title = doc.createElement("div");
          title.style.fontWeight = "600";
          title.textContent = show.name;
          const sub = doc.createElement("div");
          sub.style.cssText = "font-size:11px;color:var(--muted-foreground)";
          const idx = show.slideIndices ?? [];
          sub.textContent = t("dialog.customShow.slideCount", { n: idx.length });
          meta.append(title, sub);
          const playBtn = doc.createElement("button");
          playBtn.textContent = t("dialog.customShow.play");
          playBtn.style.cssText =
            "background:var(--primary);color:var(--primary-foreground);border:none;border-radius:4px;padding:4px 10px;cursor:pointer;font:inherit";
          playBtn.addEventListener("click", () => {
            const indices = show.slideIndices ?? [];
            if (indices.length === 0) return;
            pres.customShows = shows.map(cloneShow);
            opts.onPlay?.(indices);
            ctx.close({ action: "play", shows: pres.customShows });
          });
          const delBtn = doc.createElement("button");
          delBtn.textContent = "×";
          delBtn.title = t("dialog.customShow.delete");
          delBtn.style.cssText =
            "background:transparent;color:var(--muted-foreground);border:1px solid var(--border);border-radius:4px;width:28px;height:28px;cursor:pointer;font:inherit";
          delBtn.addEventListener("click", () => {
            const pos = shows.indexOf(show);
            if (pos >= 0) shows.splice(pos, 1);
            renderList();
          });
          row.append(meta, playBtn, delBtn);
          listWrap.appendChild(row);
        }
      };

      renderList();

      return () => {
        pres.customShows = shows.length ? shows.map(cloneShow) : undefined;
        return { action: "save" as const, shows: pres.customShows ?? [] };
      };
    },
  });
}

function cloneShow(s: CustomShow): CustomShow {
  return {
    id: s.id,
    name: s.name,
    slideRIds: [...s.slideRIds],
    slideIndices: s.slideIndices ? [...s.slideIndices] : undefined,
  };
}

function indicesFromRIds(pres: Presentation, rIds: string[]): number[] {
  if (!rIds.length) return [];
  const out: number[] = [];
  pres.slides.forEach((slide, i) => {
    const src = slide.__source as { relId?: string } | undefined;
    const rid = src?.relId;
    if (rid && rIds.includes(rid)) out.push(i);
  });
  return out;
}
