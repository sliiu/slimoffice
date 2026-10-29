import type { DeckSection, Presentation } from "./slide";

/** presentation tags part 中 SlimPPT 幻灯片节元数据键名。 */
export const SECTIONS_META_TAG = "SlimPPT.Sections.v1";

interface DeckSectionsMetaV1 {
  v: 1;
  sections: DeckSection[];
}

export function normalizeDeckSections(
  sections: DeckSection[] | undefined,
  slideCount?: number,
): DeckSection[] {
  if (!sections?.length) return [];
  let out = sections.filter(
    (s) =>
      typeof s.name === "string" &&
      s.name.trim().length > 0 &&
      typeof s.startIndex === "number" &&
      Number.isFinite(s.startIndex) &&
      s.startIndex >= 0,
  );
  if (slideCount !== undefined) {
    out = out.filter((s) => s.startIndex < slideCount);
  }
  out.sort((a, b) => a.startIndex - b.startIndex);
  const seen = new Set<number>();
  out = out.filter((s) => {
    if (seen.has(s.startIndex)) return false;
    seen.add(s.startIndex);
    return true;
  });
  return out.map((s) => ({
    id: typeof s.id === "string" && s.id.trim() ? s.id.trim() : `sec_${s.startIndex}`,
    name: s.name.trim(),
    startIndex: Math.floor(s.startIndex),
  }));
}

/** 序列化 `pres.sections`（经 tags 侧车 round-trip）。 */
export function buildDeckSectionsMeta(pres: Presentation): string | undefined {
  const sections = normalizeDeckSections(pres.sections, pres.slides.length);
  if (!sections.length) return undefined;
  const payload: DeckSectionsMetaV1 = { v: 1, sections };
  return JSON.stringify(payload);
}

export function applyDeckSectionsMeta(
  pres: Presentation,
  raw: string | undefined,
): void {
  if (!raw?.trim()) return;
  try {
    const o = JSON.parse(raw) as DeckSectionsMetaV1;
    if (o.v !== 1 || !Array.isArray(o.sections)) return;
    const sections = normalizeDeckSections(o.sections, pres.slides.length);
    pres.sections = sections.length ? sections : undefined;
  } catch {
    // ignore malformed sidecar
  }
}
