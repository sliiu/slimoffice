import type { DeckSection, EditCommand, Presentation } from "@sliiu/present-core";
/** Replace the deck section list (undoable). */
export declare class SetDeckSectionsCmd implements EditCommand {
    private next;
    readonly label = "Set sections";
    private prev?;
    constructor(next: DeckSection[]);
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
export declare function addSectionAt(sections: DeckSection[] | undefined, startIndex: number, name: string, id?: string): DeckSection[];
export declare function renameSection(sections: DeckSection[] | undefined, id: string, name: string): DeckSection[];
/** Remove the section heading only; slides stay in the deck and join the previous section. */
export declare function removeSection(sections: DeckSection[] | undefined, id: string): DeckSection[];
