export interface DocRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  /** CSS pixels. */
  fontSize?: number;
  /** #rrggbb. */
  color?: string;
  image?: string;
}

export interface DocParagraph {
  style?: string;
  align?: "left" | "center" | "right" | "both";
  runs: DocRun[];
}

export interface DocTable {
  rows: DocParagraph[][][];
}

export type DocBlock = DocParagraph | DocTable;

export function isDocTable(block: DocBlock): block is DocTable {
  return "rows" in block;
}

export interface DocPageSetup {
  /** Twips. Defaults are US Letter with one-inch margins. */
  width: number;
  height: number;
  margin: { top: number; bottom: number; left: number; right: number };
}

export interface DocSection {
  page: DocPageSetup;
  header: DocParagraph[];
  footer: DocParagraph[];
  blocks: DocBlock[];
}

export interface Document {
  sections: DocSection[];
  /** Original package parts, keyed by path. Writing puts these back unchanged. */
  source?: Map<string, Uint8Array>;
  /** Set when the story changed. Until then, writing puts the original bytes back. */
  edited?: boolean;
}

export const DEFAULT_PAGE: DocPageSetup = {
  width: 12240,
  height: 15840,
  margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 },
};
