import type { Presentation, Slide } from "@sliiu/present-core";
import { type VisualSystemId } from "../../deckgen/ids.js";
import { themeFromAuthoredLook } from "../../deckgen/color-theme.js";
/** Visible title of a slide: title placeholder first, else the largest text. */
export declare function slideTitleText(slide: Slide): string | undefined;
/**
 * Default rows: section pages when the deck has ≥ 2, else every content page (not cover, not the
 * close, not an existing agenda). `indexOffset` shifts targets for the slide about to be inserted.
 */
export declare function agendaRowsFromDeck(pres: Presentation, insertAt: number): Array<{
    title: string;
    target: number;
}>;
/** VisualSystem + ColorTheme for a new deckgen page inside this deck (deckgen decks keep theirs). */
export declare function lookForDeck(pres: Presentation): {
    systemId: VisualSystemId;
    theme: ReturnType<typeof themeFromAuthoredLook>;
};
/** Compile one agenda canvas into an editor Slide that fits this deck (size, master, background). */
export declare function buildAgendaSlide(pres: Presentation, opts: {
    title: string;
    rows: Array<{
        title: string;
        body?: string;
        target: number;
    }>;
    cjk?: boolean;
}): Slide;
export declare const agendaTools: import("...js").ToolDef<{
    insertAt?: number | undefined;
    title?: string | undefined;
    items?: {
        title: string;
        body?: string | undefined;
        target: number;
    }[] | undefined;
}>[];
