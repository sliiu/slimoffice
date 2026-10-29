/**
 * Locked editor chrome: the Slide properties group only offers the 9
 * OOXML “standard” layouts PowerPoint ships on a blank deck.
 *
 * Types follow ECMA-376 ST_SlideLayoutType. Template masters in this repo
 * use a few aliases (`sectionHead` vs `secHead`); those map to the same 9.
 *
 * If a deck has none of the 9 (odd imported masters), the picker falls
 * back to the full list so layout capability is not lost.
 */
export declare const SLIDE_LAYOUT_WHITELIST: readonly ["title", "obj", "secHead", "twoObj", "twoTxTwoObj", "titleOnly", "blank", "objTx", "picTx"];
export type SlideLayoutWhitelistType = (typeof SLIDE_LAYOUT_WHITELIST)[number];
export declare function canonicalSlideLayoutType(type?: string): string | undefined;
export declare function isWhitelistedSlideLayout(type?: string): boolean;
export declare function filterLayoutsToWhitelist<T extends {
    type?: string;
}>(layouts: T[]): T[];
