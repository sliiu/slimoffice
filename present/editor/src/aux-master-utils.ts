import type { Presentation, Slide, SlideMaster, SlideSize } from "@ppt/core";

/** Notes page canvas (portrait; defaults to slide H×W when notesSize missing). */
export function notesCanvasSize(pres: Presentation): SlideSize {
  if (pres.notesSize) return pres.notesSize;
  return { width: pres.size.height, height: pres.size.width };
}

/** Handout master uses slide dimensions in PowerPoint. */
export function handoutCanvasSize(pres: Presentation): SlideSize {
  return pres.size;
}

function defaultNotesMaster(): SlideMaster {
  return {
    id: "notesMaster1",
    name: "Notes Master",
    shapes: [],
    background: { kind: "solid", color: "#ffffff" },
  };
}

function defaultHandoutMaster(): SlideMaster {
  return {
    id: "handoutMaster1",
    name: "Handout Master",
    shapes: [],
    background: { kind: "solid", color: "#ffffff" },
  };
}

function defaultSlideMaster(pres: Presentation): SlideMaster {
  const bg = pres.theme?.colors?.bg1 ?? "#ffffff";
  return {
    id: "slideMaster1",
    name: "Slide Master",
    shapes: [],
    background: { kind: "solid", color: bg },
    layouts: [
      {
        id: "blankLayout1",
        name: "Blank",
        type: "blank",
        shapes: [],
      },
    ],
  };
}

export function ensureNotesMasters(pres: Presentation): SlideMaster[] {
  if (!pres.notesMasters?.length) {
    pres.notesMasters = [defaultNotesMaster()];
  }
  return pres.notesMasters;
}

export function ensureHandoutMasters(pres: Presentation): SlideMaster[] {
  if (!pres.handoutMasters?.length) {
    pres.handoutMasters = [defaultHandoutMaster()];
  }
  return pres.handoutMasters;
}

/** Deckgen / blank decks may have no slide master; create a blank one on demand. */
export function ensureSlideMasters(pres: Presentation): SlideMaster[] {
  if (!pres.masters?.length) {
    pres.masters = [defaultSlideMaster(pres)];
  }
  return pres.masters;
}

export function buildAuxMasterPseudoSlide(
  pres: Presentation,
  kind: "notesMaster" | "handoutMaster",
  masterId: string,
): Slide | undefined {
  const masters = kind === "notesMaster" ? pres.notesMasters : pres.handoutMasters;
  const master = masters?.find((m) => m.id === masterId);
  if (!master) return undefined;
  return {
    id: `__${kind}_${master.id}`,
    name: master.name,
    index: -1,
    background: master.background,
    layers: [
      {
        id: "main",
        name: kind === "notesMaster" ? "Notes Master" : "Handout Master",
        visible: true,
        locked: false,
        shapes: master.shapes,
      },
    ],
    hf: master.hf,
    clrMapOverride: undefined,
  };
}
