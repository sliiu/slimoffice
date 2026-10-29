/**
 * Real slide master + layouts for a deckgen Presentation.
 *
 * Canvas pages keep their authored shapes on the slide. The master holds the
 * theme background, type styles, shared chrome, and placeholder layouts so
 * Master View / "new slide" / layout switching have something real to edit.
 * Solid pages inherit `master.background`; photo canvases keep their own
 * background and hide master chrome (`showMasterSp: false`).
 */
import { type SlideMaster } from "@sliiu/present-core";
import { type VisualSystem } from "./visual-system.js";
import { type ColorTheme } from "./color-theme.js";
export declare function deckgenMasterId(systemId: string, themeId: string): string;
export declare function deckgenLayoutId(masterId: string, layout: string): string;
/** OOXML ST_SlideLayoutType for a deckgen layout name. */
export declare function ooxmlTypeForLayout(layout: string): string;
/**
 * One master covering the locked layout catalog plus any extra canvas layout names.
 */
export declare function buildDeckgenMasters(system: VisualSystem, theme: ColorTheme, extraLayouts?: readonly string[]): SlideMaster[];
