import type { EmbeddedFont } from "@ppt/core";
import { dataUrlToBytes } from "./zip-write";
import { sfntToEotFntdata } from "./font-eot";
import { esc, xmlHeader } from "./xml-util";

export const FONT_REL_TYPE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/font";

type FontSlot = "regular" | "bold" | "italic" | "boldItalic";

export interface EmbeddedFontGroup {
  typeface: string;
  slots: Partial<Record<FontSlot, EmbeddedFont>>;
}

export interface EmbeddedFontRegistrar {
  registerFont(src: string): string;
}

export interface EmbeddedFontListItem {
  name: string;
  relId: string;
  bytes: Uint8Array;
}

export class DeckEmbeddedFontRegistry implements EmbeddedFontRegistrar {
  private srcToName = new Map<string, string>();
  private files = new Map<string, Uint8Array>();
  private nextIdx = 1;

  registerFont(src: string): string {
    const hit = this.srcToName.get(src);
    if (hit) return hit;
    const decoded = dataUrlToBytes(src);
    const sfnt = decoded?.bytes ?? new Uint8Array(0);
    const fntdata = sfntToEotFntdata(sfnt);
    const name = `font${this.nextIdx++}.fntdata`;
    this.srcToName.set(src, name);
    this.files.set(name, fntdata);
    return name;
  }

  createPartTable(): SlideEmbeddedFontTable {
    return new SlideEmbeddedFontTable(this);
  }

  fileEntries(): Array<{ name: string; bytes: Uint8Array }> {
    return [...this.files.entries()].map(([name, bytes]) => ({ name, bytes }));
  }
}

class SlideEmbeddedFontTable implements EmbeddedFontRegistrar {
  private srcToRelIdx = new Map<string, number>();
  private items: Array<{ name: string; bytes: Uint8Array }> = [];

  constructor(private deck: DeckEmbeddedFontRegistry) {}

  registerFont(src: string): string {
    const existing = this.srcToRelIdx.get(src);
    if (existing !== undefined) return `rIdFont${existing}`;
    const name = this.deck.registerFont(src);
    const bytes = this.deck.fileEntries().find((e) => e.name === name)?.bytes ?? new Uint8Array(0);
    const idx = this.items.length + 1;
    this.items.push({ name, bytes });
    this.srcToRelIdx.set(src, idx);
    return `rIdFont${idx}`;
  }

  list(): EmbeddedFontListItem[] {
    return this.items.map((it, i) => ({
      name: it.name,
      bytes: it.bytes,
      relId: `rIdFont${i + 1}`,
    }));
  }
}

function fontToSlot(weight: number, style: string): FontSlot {
  const bold = weight >= 600;
  const italic = style === "italic";
  if (bold && italic) return "boldItalic";
  if (bold) return "bold";
  if (italic) return "italic";
  return "regular";
}

/** Collapse parser-expanded `pres.fonts` (incl. alias faces) into OOXML embeddedFont groups. */
export function groupEmbeddedFontsForExport(fonts: EmbeddedFont[]): EmbeddedFontGroup[] {
  const groups = new Map<string, Map<FontSlot, EmbeddedFont>>();

  for (const f of fonts) {
    const suffix = /( Bold Italic| Bold| Italic)$/.exec(f.family);
    if (suffix && f.weight === 400 && f.style === "normal") continue;

    const base = suffix ? f.family.slice(0, -suffix[0].length) : f.family;
    const slot = fontToSlot(f.weight, f.style);
    let slots = groups.get(base);
    if (!slots) {
      slots = new Map();
      groups.set(base, slots);
    }
    const prev = slots.get(slot);
    if (!prev || f.src.length > prev.src.length) slots.set(slot, f);
  }

  return [...groups.entries()].map(([typeface, slots]) => ({ typeface, slots: Object.fromEntries(slots) }));
}

export function renderEmbeddedFontLst(
  groups: EmbeddedFontGroup[],
  fonts: EmbeddedFontRegistrar,
): string {
  if (!groups.length) return "";
  const blocks = groups.map((g) => {
    const slots: string[] = [];
    const order: FontSlot[] = ["regular", "bold", "italic", "boldItalic"];
    for (const slot of order) {
      const face = g.slots[slot];
      if (!face?.src) continue;
      const relId = fonts.registerFont(face.src);
      slots.push(`<p:${slot} r:id="${relId}"/>`);
    }
    if (!slots.length) return "";
    return `<p:embeddedFont><p:font typeface="${esc(g.typeface)}"/>${slots.join("")}</p:embeddedFont>`;
  });
  const body = blocks.filter(Boolean).join("");
  return body ? `<p:embeddedFontLst>${body}</p:embeddedFontLst>` : "";
}

export function embeddedFontsSnapshot(fonts: EmbeddedFont[] | undefined): string {
  if (!fonts?.length) return "";
  return JSON.stringify(
    fonts.map((f) => ({ family: f.family, weight: f.weight, style: f.style, src: f.src })),
  );
}

export function embeddedFontsChanged(
  current: EmbeddedFont[] | undefined,
  snapshot: string | undefined,
): boolean {
  return embeddedFontsSnapshot(current) !== (snapshot ?? "");
}

export function renderPresentationFontRels(
  items: Array<Pick<EmbeddedFontListItem, "name" | "relId">>,
): string {
  return items
    .map((f) => `<Relationship Id="${f.relId}" Type="${FONT_REL_TYPE}" Target="fonts/${f.name}"/>`)
    .join("");
}

export { xmlHeader };
