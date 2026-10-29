import type { Presentation, Slide, SlideMaster, SlideSize } from "@sliiu/present-core";
/** Notes page canvas (portrait; defaults to slide H×W when notesSize missing). */
export declare function notesCanvasSize(pres: Presentation): SlideSize;
/** Handout master uses slide dimensions in PowerPoint. */
export declare function handoutCanvasSize(pres: Presentation): SlideSize;
export declare function ensureNotesMasters(pres: Presentation): SlideMaster[];
export declare function ensureHandoutMasters(pres: Presentation): SlideMaster[];
/** Deckgen / blank decks may have no slide master; create a blank one on demand. */
export declare function ensureSlideMasters(pres: Presentation): SlideMaster[];
export declare function buildAuxMasterPseudoSlide(pres: Presentation, kind: "notesMaster" | "handoutMaster", masterId: string): Slide | undefined;
