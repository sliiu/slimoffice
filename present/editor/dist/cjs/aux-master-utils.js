"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notesCanvasSize = notesCanvasSize;
exports.handoutCanvasSize = handoutCanvasSize;
exports.ensureNotesMasters = ensureNotesMasters;
exports.ensureHandoutMasters = ensureHandoutMasters;
exports.ensureSlideMasters = ensureSlideMasters;
exports.buildAuxMasterPseudoSlide = buildAuxMasterPseudoSlide;
/** Notes page canvas (portrait; defaults to slide H×W when notesSize missing). */
function notesCanvasSize(pres) {
    if (pres.notesSize)
        return pres.notesSize;
    return { width: pres.size.height, height: pres.size.width };
}
/** Handout master uses slide dimensions in PowerPoint. */
function handoutCanvasSize(pres) {
    return pres.size;
}
function defaultNotesMaster() {
    return {
        id: "notesMaster1",
        name: "Notes Master",
        shapes: [],
        background: { kind: "solid", color: "#ffffff" },
    };
}
function defaultHandoutMaster() {
    return {
        id: "handoutMaster1",
        name: "Handout Master",
        shapes: [],
        background: { kind: "solid", color: "#ffffff" },
    };
}
function defaultSlideMaster(pres) {
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
function ensureNotesMasters(pres) {
    if (!pres.notesMasters?.length) {
        pres.notesMasters = [defaultNotesMaster()];
    }
    return pres.notesMasters;
}
function ensureHandoutMasters(pres) {
    if (!pres.handoutMasters?.length) {
        pres.handoutMasters = [defaultHandoutMaster()];
    }
    return pres.handoutMasters;
}
/** Deckgen / blank decks may have no slide master; create a blank one on demand. */
function ensureSlideMasters(pres) {
    if (!pres.masters?.length) {
        pres.masters = [defaultSlideMaster(pres)];
    }
    return pres.masters;
}
function buildAuxMasterPseudoSlide(pres, kind, masterId) {
    const masters = kind === "notesMaster" ? pres.notesMasters : pres.handoutMasters;
    const master = masters?.find((m) => m.id === masterId);
    if (!master)
        return undefined;
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
