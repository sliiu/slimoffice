"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SetDeckSectionsCmd = void 0;
exports.addSectionAt = addSectionAt;
exports.renameSection = renameSection;
exports.removeSection = removeSection;
function deepCloneSections(sections) {
    return sections ? sections.map((s) => ({ ...s })) : undefined;
}
/** Replace the deck section list (undoable). */
class SetDeckSectionsCmd {
    next;
    label = "Set sections";
    prev;
    constructor(next) {
        this.next = next;
    }
    apply(pres) {
        if (!this.prev)
            this.prev = deepCloneSections(pres.sections);
        pres.sections = this.next.length > 0 ? this.next.map((s) => ({ ...s })) : undefined;
    }
    revert(pres) {
        pres.sections = deepCloneSections(this.prev);
    }
}
exports.SetDeckSectionsCmd = SetDeckSectionsCmd;
function addSectionAt(sections, startIndex, name, id = `sec_${startIndex}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`) {
    const next = [...(sections ?? [])];
    const existing = next.findIndex((s) => s.startIndex === startIndex);
    if (existing >= 0) {
        next[existing] = { ...next[existing], name };
    }
    else {
        next.push({ id, name, startIndex });
    }
    next.sort((a, b) => a.startIndex - b.startIndex);
    return next;
}
function renameSection(sections, id, name) {
    const trimmed = name.trim();
    return (sections ?? []).map((s) => (s.id === id ? { ...s, name: trimmed || s.name } : { ...s }));
}
/** Remove the section heading only; slides stay in the deck and join the previous section. */
function removeSection(sections, id) {
    return (sections ?? []).filter((s) => s.id !== id);
}
