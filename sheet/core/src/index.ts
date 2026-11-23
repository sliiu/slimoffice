export type SheetAlign = "left" | "center" | "right" | "justify";
export type SheetVAlign = "top" | "middle" | "bottom";
export type SheetChartKind = "column" | "bar" | "line" | "pie" | "area" | "scatter";
export type SheetSparklineKind = "line" | "column" | "winLoss";
export type SheetShapeKind = "rect" | "ellipse" | "line" | "arrow" | "textBox" | "icon" | "smartArt" | "image";
export type SheetCfRule =
  | { type: "cellValue"; op: "gt" | "gte" | "lt" | "lte" | "eq" | "neq" | "between"; formula1: string; formula2?: string; fill?: string; color?: string }
  | { type: "expression"; formula: string; fill?: string; color?: string }
  | { type: "colorScale"; colors: [string, string] | [string, string, string] }
  | { type: "dataBar"; color: string }
  | { type: "iconSet"; set: "3TrafficLights" | "3Arrows" | "3Symbols" };

export interface SheetBorder {
  color?: string;
  style?: "thin" | "medium" | "thick" | "dashed" | "dotted";
}

export interface SheetCell {
  /** Displayed text. After calculation, a formula cell shows the result here. */
  value: string;
  /** Formula text without a leading "=". Present when the cell is a formula. */
  formula?: string;
  /** True when the formula is an array / spilled formula. */
  array?: boolean;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  font?: string;
  fontSize?: number;
  color?: string;
  fill?: string;
  numFmt?: string;
  align?: SheetAlign;
  valign?: SheetVAlign;
  wrap?: boolean;
  indent?: number;
  border?: { top?: SheetBorder; right?: SheetBorder; bottom?: SheetBorder; left?: SheetBorder };
  hyperlink?: string;
  comment?: string;
  /** Named cell style from `cellStyles`, when the cell uses one. */
  styleName?: string;
}

export interface SheetMerge {
  r1: number;
  c1: number;
  r2: number;
  c2: number;
}

export interface SheetChart {
  id: string;
  kind: SheetChartKind;
  title?: string;
  /** Data range as A1:B10 style relative to this sheet. */
  range: string;
  categories?: string;
}

export interface SheetSparkline {
  id: string;
  kind: SheetSparklineKind;
  data: string;
  location: string;
}

export interface SheetTable {
  id: string;
  name: string;
  r1: number;
  c1: number;
  r2: number;
  c2: number;
  headerRow?: boolean;
  style?: string;
}

export interface SheetPivot {
  id: string;
  name: string;
  source: string;
  rows?: string[];
  columns?: string[];
  values?: string[];
  /** How the value field is reduced. Defaults to a sum. */
  agg?: "sum" | "count" | "average";
  /** Cache field names, in the same order as each cache row. */
  fields?: string[];
  /** Flattened cache rows used for a minimal pivot preview. */
  cache?: string[][];
}

export interface SheetConditionalFormat {
  id: string;
  r1: number;
  c1: number;
  r2: number;
  c2: number;
  rule: SheetCfRule;
}

export interface SheetPageSetup {
  orientation?: "portrait" | "landscape";
  paperSize?: "A4" | "Letter" | "Legal";
  fitToWidth?: number;
  fitToHeight?: number;
  scale?: number;
  margins?: { left: number; right: number; top: number; bottom: number };
  printArea?: string;
  printTitles?: string;
  gridlines?: boolean;
  headings?: boolean;
  header?: string;
  footer?: string;
}

export interface SheetShape {
  id: string;
  kind: SheetShapeKind;
  text?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  fill?: string;
  stroke?: string;
}

export interface SheetValidation {
  id: string;
  r1: number;
  c1: number;
  r2: number;
  c2: number;
  type: "list" | "whole" | "decimal" | "textLength" | "custom";
  formula1?: string;
  formula2?: string;
  allowBlank?: boolean;
  error?: string;
}

export interface SheetFormControl {
  id: string;
  kind: "button" | "checkbox" | "list" | "spin";
  label?: string;
  linked?: string;
  checked?: boolean;
}

export interface SheetSlicer {
  id: string;
  name: string;
  source: string;
  field: string;
}

export interface SheetOutline {
  rows?: number[];
  cols?: number[];
  summaryBelow?: boolean;
}

export interface SheetTheme {
  name?: string;
  colors?: string[];
  fonts?: { major?: string; minor?: string };
}

export interface SheetXmlMap {
  id: string;
  name: string;
  root?: string;
}

export type ConsolidateFunc =
  | "sum"
  | "count"
  | "average"
  | "max"
  | "min"
  | "product"
  | "countNums"
  | "stdev"
  | "stdevp"
  | "var"
  | "varp";

/** One Data › Consolidate pass: how several ranges were combined, and where the result starts. */
export interface SheetConsolidation {
  func: ConsolidateFunc;
  sources: string[];
  dest: string;
  topRow?: boolean;
  leftCol?: boolean;
  links?: boolean;
  rows?: number;
  cols?: number;
}

export interface Worksheet {
  name: string;
  /** Row, then column. Only cells that hold something need be present. */
  cells: SheetCell[][];
  merges?: SheetMerge[];
  /** Column widths in characters (Excel-like). */
  colWidths?: number[];
  /** Row heights in points. */
  rowHeights?: number[];
  hiddenCols?: number[];
  hiddenRows?: number[];
  freeze?: { row: number; col: number };
  filter?: { r1: number; c1: number; r2: number; c2: number } | null;
  showGrid?: boolean;
  showHeaders?: boolean;
  protected?: boolean;
  allowEditRanges?: { name: string; range: string }[];
  charts?: SheetChart[];
  sparklines?: SheetSparkline[];
  tables?: SheetTable[];
  pivots?: SheetPivot[];
  conditionalFormats?: SheetConditionalFormat[];
  pageSetup?: SheetPageSetup;
  shapes?: SheetShape[];
  validations?: SheetValidation[];
  formControls?: SheetFormControl[];
  slicers?: SheetSlicer[];
  outline?: SheetOutline;
  pageBreaks?: { rows?: number[]; cols?: number[] };
  /** What-if data tables. `ref` is the result block; the inputs are the cells Excel substitutes. */
  dataTables?: { ref: string; rowInput?: string; colInput?: string }[];
  xmlMaps?: SheetXmlMap[];
  consolidation?: SheetConsolidation;
}

export interface WorkbookName {
  name: string;
  refersTo: string;
  /** Sheet index for a sheet-scoped name such as a print area. */
  localSheet?: number;
}

export interface Workbook {
  sheets: Worksheet[];
  names?: WorkbookName[];
  theme?: SheetTheme;
  /** Original package parts, keyed by path. Writing puts these back unchanged when possible. */
  source?: Map<string, Uint8Array>;
  /** Module names from the VBA project, when the workbook has one. The code is never run. */
  vbaModules?: string[];
  /** Set when a cell or structure changed. Until then, writing puts the original bytes back. */
  edited?: boolean;
  calcMode?: "auto" | "manual";
}
