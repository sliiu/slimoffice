export interface SheetCell {
  /** What the cell shows. A formula stays as text; nothing is evaluated. */
  value: string;
  bold?: boolean;
}

export interface Worksheet {
  name: string;
  /** Row, then column. Only cells that hold something are present. */
  cells: SheetCell[][];
}

export interface Workbook {
  sheets: Worksheet[];
  /** Original package parts, keyed by path. Writing puts these back unchanged. */
  source?: Map<string, Uint8Array>;
  /** Set when a cell changed. Until then, writing puts the original bytes back. */
  edited?: boolean;
}
