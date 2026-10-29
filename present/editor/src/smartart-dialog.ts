import type { SmartArtLayoutKind } from "@ppt/core";
import { SMARTART_LAYOUT_KINDS, SMARTART_LAYOUT_LABELS } from "@ppt/core";
import { showDialog } from "./dialog";
import { t } from "./i18n";

export interface SmartArtPickerResult {
  layout: SmartArtLayoutKind;
}

const LAYOUTS: SmartArtLayoutKind[] = SMARTART_LAYOUT_KINDS;

const LAYOUT_ICONS: Record<SmartArtLayoutKind, string> = {
  list: "☰",
  process: "→",
  chevron: "›",
  cycle: "↻",
  pyramid: "△",
  hierarchy: "⎇",
  matrix: "▦",
  funnel: "▽",
  timeline: "◷",
  radial: "◎",
  stacked: "▤",
  equation: "∑",
  orgChart: "⎔",
  venn: "◯",
  target: "⊚",
  blockCycle: "▢",
  pictureAccent: "🖼",
  arrowRibbon: "↗",
  horizontalList: "☷",
  processVertical: "↓",
  invertedPyramid: "▽",
  pie: "◔",
  balance: "⚖",
  opposingArrows: "↔",
  gear: "⚙",
  horizontalHierarchy: "⇉",
  converging: "⇒",
  alternating: "↯",
  hexagon: "⬡",
  pictureCaption: "▣",
};

export function openSmartArtDialog(doc: Document): Promise<SmartArtPickerResult | null> {
  return showDialog<SmartArtPickerResult>(doc, {
    title: t("dialog.smartArt.title"),
    width: 560,
    okLabel: "",
    buildBody: (body, ctx) => {
      const hint = doc.createElement("p");
      hint.textContent = t("dialog.smartArt.hint");
      hint.style.cssText = "margin:0 0 12px;font-size:12px;color:var(--muted-foreground)";
      body.appendChild(hint);

      const grid = doc.createElement("div");
      grid.style.cssText = "display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;max-height:360px;overflow:auto";
      body.appendChild(grid);

      for (const layout of LAYOUTS) {
        const btn = doc.createElement("button");
        btn.type = "button";
        btn.style.cssText = [
          "display:flex",
          "flex-direction:column",
          "align-items:center",
          "gap:6px",
          "padding:12px 8px",
          "border:1px solid var(--border)",
          "border-radius:8px",
          "background:var(--card)",
          "cursor:pointer",
          "color:var(--foreground)",
          "font:inherit",
          "min-height:88px",
        ].join(";");
        const icon = doc.createElement("span");
        icon.style.fontSize = "22px";
        icon.textContent = LAYOUT_ICONS[layout];
        const label = doc.createElement("span");
        label.style.fontSize = "11px";
        label.textContent = t(`dialog.smartArt.layout.${layout}` as never) || SMARTART_LAYOUT_LABELS[layout];
        btn.append(icon, label);
        btn.addEventListener("click", () => ctx.close({ layout }));
        grid.appendChild(btn);
      }
    },
  });
}
