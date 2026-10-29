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

export const SLIDE_LAYOUT_WHITELIST = [
  "title",
  "obj",
  "secHead",
  "twoObj",
  "twoTxTwoObj",
  "titleOnly",
  "blank",
  "objTx",
  "picTx",
] as const;

export type SlideLayoutWhitelistType = (typeof SLIDE_LAYOUT_WHITELIST)[number];

const ALIASES: Record<string, SlideLayoutWhitelistType> = {
  titleSlide: "title",
  titleAndContent: "obj",
  sectionHead: "secHead",
  sectionHeader: "secHead",
  twoContent: "twoObj",
  comparison: "twoTxTwoObj",
  twoTxTwoObj: "twoTxTwoObj",
  contentWithCaption: "objTx",
  picAndCaption: "picTx",
  pictureCaption: "picTx",
  picTx: "picTx",
};

export function canonicalSlideLayoutType(type?: string): string | undefined {
  if (!type) return undefined;
  const key = type.trim();
  if (!key) return undefined;
  return ALIASES[key] ?? key;
}

export function isWhitelistedSlideLayout(type?: string): boolean {
  const canonical = canonicalSlideLayoutType(type);
  return !!canonical && (SLIDE_LAYOUT_WHITELIST as readonly string[]).includes(canonical);
}

export function filterLayoutsToWhitelist<T extends { type?: string }>(layouts: T[]): T[] {
  const filtered = layouts.filter((entry) => isWhitelistedSlideLayout(entry.type));
  return filtered.length > 0 ? filtered : layouts;
}
