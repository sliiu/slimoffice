import type { EmbeddedFont } from "@sliiu/present-core";
import { xmlHeader } from "./xml-util.js";
export declare const FONT_REL_TYPE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/font";
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
export declare class DeckEmbeddedFontRegistry implements EmbeddedFontRegistrar {
    private srcToName;
    private files;
    private nextIdx;
    registerFont(src: string): string;
    createPartTable(): SlideEmbeddedFontTable;
    fileEntries(): Array<{
        name: string;
        bytes: Uint8Array;
    }>;
}
declare class SlideEmbeddedFontTable implements EmbeddedFontRegistrar {
    private deck;
    private srcToRelIdx;
    private items;
    constructor(deck: DeckEmbeddedFontRegistry);
    registerFont(src: string): string;
    list(): EmbeddedFontListItem[];
}
/** Collapse parser-expanded `pres.fonts` (incl. alias faces) into OOXML embeddedFont groups. */
export declare function groupEmbeddedFontsForExport(fonts: EmbeddedFont[]): EmbeddedFontGroup[];
export declare function renderEmbeddedFontLst(groups: EmbeddedFontGroup[], fonts: EmbeddedFontRegistrar): string;
export declare function embeddedFontsSnapshot(fonts: EmbeddedFont[] | undefined): string;
export declare function embeddedFontsChanged(current: EmbeddedFont[] | undefined, snapshot: string | undefined): boolean;
export declare function renderPresentationFontRels(items: Array<Pick<EmbeddedFontListItem, "name" | "relId">>): string;
export { xmlHeader };
