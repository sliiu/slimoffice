import type { DeckSection, EditCommand, Presentation } from "@ppt/core";

function deepCloneSections(sections: DeckSection[] | undefined): DeckSection[] | undefined {
  return sections ? sections.map((s) => ({ ...s })) : undefined;
}

/** Replace the deck section list (undoable). */
export class SetDeckSectionsCmd implements EditCommand {
  readonly label = "Set sections";
  private prev?: DeckSection[];

  constructor(private next: DeckSection[]) {}

  apply(pres: Presentation): void {
    if (!this.prev) this.prev = deepCloneSections(pres.sections);
    pres.sections = this.next.length > 0 ? this.next.map((s) => ({ ...s })) : undefined;
  }

  revert(pres: Presentation): void {
    pres.sections = deepCloneSections(this.prev);
  }
}

export function addSectionAt(
  sections: DeckSection[] | undefined,
  startIndex: number,
  name: string,
  id = `sec_${startIndex}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
): DeckSection[] {
  const next = [...(sections ?? [])];
  const existing = next.findIndex((s) => s.startIndex === startIndex);
  if (existing >= 0) {
    next[existing] = { ...next[existing]!, name };
  } else {
    next.push({ id, name, startIndex });
  }
  next.sort((a, b) => a.startIndex - b.startIndex);
  return next;
}

export function renameSection(
  sections: DeckSection[] | undefined,
  id: string,
  name: string,
): DeckSection[] {
  const trimmed = name.trim();
  return (sections ?? []).map((s) => (s.id === id ? { ...s, name: trimmed || s.name } : { ...s }));
}

/** Remove the section heading only; slides stay in the deck and join the previous section. */
export function removeSection(sections: DeckSection[] | undefined, id: string): DeckSection[] {
  return (sections ?? []).filter((s) => s.id !== id);
}
