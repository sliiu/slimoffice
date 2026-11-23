export type DocAlign = "left" | "center" | "right" | "both";

export type DocUnderline = "single" | "double" | "dotted" | "dash" | "wave";

export type DocBreak = "page" | "column" | "line";

export interface DocRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: DocUnderline;
  strike?: boolean;
  /** "superscript" or "subscript". */
  vertAlign?: "superscript" | "subscript";
  /** #rrggbb highlight behind the run. */
  highlight?: string;
  /** CSS pixels. */
  fontSize?: number;
  /** Font family name from rFonts, the ascii face. */
  font?: string;
  /** The east-asian face from rFonts, used when the run holds CJK text. */
  fontEastAsia?: string;
  /** #rrggbb. */
  color?: string;
  /** Character style name from rStyle. */
  runStyle?: string;
  /** Shown in capitals. */
  caps?: boolean;
  /** Shown in small capitals. */
  smallCaps?: boolean;
  /** A double strikethrough. */
  doubleStrike?: boolean;
  /** Hidden text. It is kept and written back, but not shown. */
  hidden?: boolean;
  /** Emphasis mark under the run: dot, comma, circle, underDot. */
  emphasis?: string;
  /** Language tag from `lang`, such as "zh-CN". */
  lang?: string;
  /** Extra space between characters and the next, in twips, from `kern`. */
  kern?: number;
  /** Switches Word stores on the run and this model only keeps: outline, shadow, emboss, imprint, effect. */
  marks?: string[];
  /** Markup this model does not edit, kept so a rewrite puts it back: a border, shading, fit text, east-asian layout. */
  kept?: string[];
  /** Character scale in percent. 100 is unchanged. */
  scale?: number;
  /** Extra space between characters, in twips. */
  spacing?: number;
  /** Raise or lower the run, in half-points. Positive raises. */
  position?: number;
  /** Id of a comment anchored at this run. */
  comment?: string;
  /** Relationship id of an embedded picture. */
  image?: string;
  /** Decoded picture bytes, filled in while parsing so the view can paint it. */
  imageBytes?: Uint8Array;
  /** MIME type guessed from the picture part. */
  imageType?: string;
  /** Picture size in EMUs (914400 per inch), from the drawing extent. */
  imageWidth?: number;
  imageHeight?: number;
  /** How much of each edge is cropped away, in percent of the picture. */
  crop?: { left?: number; top?: number; right?: number; bottom?: number };
  /** A break that sits before this run's text. */
  breakBefore?: DocBreak;
  /** w:tab before this run's text. */
  tabBefore?: boolean;
  /** External or internal target of a hyperlink wrapping this run. */
  link?: string;
  /** Bookmark name that starts at this run. */
  bookmark?: string;
  /** Markup kept as it was read, for a run the model does not edit (a symbol, a field, a footnote reference). */
  raw?: string;
  /** This run came from a tracked insertion. */
  inserted?: boolean;
  /** This run came from a tracked deletion. The text is kept so it can be read; writing puts the original markup back. */
  deleted?: boolean;
  /** A field instruction, such as " TOC \\o "1-3" \\h " or " REF Heading1 \\h ". The run's text is the result Word would show. */
  field?: string;
  /** This run is a watermark, painted faintly behind the page. */
  watermark?: boolean;
  /** How text wraps around this run's drawing: inline, square, tight, behind, or in front. */
  wrap?: "inline" | "square" | "tight" | "behind" | "front";
  /** Where the drawing sits across the page. */
  align?: "center" | "right";
  /** The drawings grouped into this one, by their relationship id. */
  grouped?: string[];
  /** How far the drawing is turned, in degrees. */
  rotation?: number;
  /** A citation. `source` is the source's tag; `pages` is the cited page range. */
  citation?: { source: string; pages?: string };
  /** An index entry. `text` is the term; `see` points at another entry instead of a page number. */
  indexEntry?: { text: string; see?: string };
  /** The kind a SEQ field numbers, such as "Figure". */
  caption?: string;
}

/** A block kept as markup: a content control, a formula, or tracked changes. Editing the story leaves it where it was. */
/** One piece of a formula laid out for the page: stacked for a fraction, shifted for a script, rooted for a radical. */
export type DocFormula =
  | { text: string }
  | { kind: "frac"; top: DocFormula[]; bottom: DocFormula[] }
  | { kind: "sup" | "sub"; base: DocFormula[]; script: DocFormula[] }
  | { kind: "root"; body: DocFormula[]; degree: DocFormula[] };

export interface DocRawBlock {
  raw: string;
  /** The text inside the markup, so the block can be read and edited without touching its structure. */
  text?: string;
  /** Set for a formula, so the page can lay it out instead of showing its text flat. */
  formula?: DocFormula[];
  /** Set for a content control: the paragraphs inside it, edited like any other paragraph. */
  content?: DocParagraph[];
  /** The control's own properties, kept so writing puts them back around the edited paragraphs. */
  control?: string;
}

export function isDocRaw(block: DocBlock): block is DocRawBlock {
  return "raw" in block && !("runs" in block) && !("rows" in block);
}

export interface DocNumbering {
  /** numbering.xml numId. */
  id: string;
  /** Level, zero based. */
  level: number;
}

export interface DocSpacing {
  /** Twips before the paragraph. */
  before?: number;
  /** Twips after the paragraph. */
  after?: number;
  /** Line spacing in twips when rule is "exact" or "atLeast"; a 240-based multiple when "auto". */
  line?: number;
  lineRule?: "auto" | "exact" | "atLeast";
}

export interface DocIndent {
  /** Twips. */
  left?: number;
  right?: number;
  firstLine?: number;
  hanging?: number;
}

export interface DocParagraph {
  style?: string;
  align?: DocAlign;
  numbering?: DocNumbering;
  spacing?: DocSpacing;
  indent?: DocIndent;
  /** Paragraph shading, #rrggbb. */
  shading?: string;
  /** A border around the paragraph, #rrggbb. */
  border?: string;
  /** A page break sits before this paragraph. */
  pageBreakBefore?: boolean;
  /** Kept on the same page as the paragraph after it. */
  keepNext?: boolean;
  /** Kept on one page, not split across a page break. */
  keepLines?: boolean;
  /** Widow and orphan control is on. */
  widowControl?: boolean;
  /** Outline level, 0 for the top. */
  outline?: number;
  /** Switches Word stores on the paragraph and this model only keeps, such as wordWrap, bidi, snapToGrid. */
  marks?: string[];
  /** Markup this model does not edit, kept so a rewrite puts it back: frame properties, text direction, a div id. */
  kept?: string[];
  /** This paragraph is a caption, numbered per kind ("Figure 1"). */
  caption?: string;
  /** This paragraph is the body of a footnote or an endnote, shown at the bottom of the page. */
  note?: { kind: "footnote" | "endnote"; id: string };
  /** Tab stops, in twips from the left margin. */
  tabs?: Array<{ pos: number; align?: "left" | "center" | "right" | "decimal" }>;
  runs: DocRun[];
}

export interface DocCell {
  paragraphs: DocParagraph[];
  /** How many columns this cell covers. */
  span?: number;
  /** "restart" begins a vertical merge, "continue" extends the one above. */
  vMerge?: "restart" | "continue";
  shading?: string;
  /** A border around the cell, #rrggbb. */
  border?: string;
}

export interface DocTable {
  rows: DocCell[][];
  /** Column widths, in twips, one per column. */
  widths?: number[];
  /** The first row repeats as a header on each page. */
  header?: boolean;
  /** Set when pagination splits the table across pages: the table it was cut from, and the first row's index there. */
  source?: { table: DocTable; from: number };
}

export type DocBlock = DocParagraph | DocTable | DocRawBlock;

export function isDocTable(block: DocBlock): block is DocTable {
  return "rows" in block;
}

export function isDocParagraph(block: DocBlock): block is DocParagraph {
  return "runs" in block;
}

export interface DocPageSetup {
  /** Twips. Defaults are US Letter with one-inch margins. */
  width: number;
  height: number;
  landscape?: boolean;
  margin: { top: number; bottom: number; left: number; right: number };
  /** Column count. 1 means a single column. */
  columns?: number;
  /** Space between columns, in twips. */
  columnSpace?: number;
  /** A line between columns. */
  columnSeparator?: boolean;
  /** Page background from settings or the background element, #rrggbb. */
  background?: string;
  /** Gutter, in twips. */
  gutter?: number;
  /** Distance from the page edge to the header and footer, in twips. */
  headerDistance?: number;
  footerDistance?: number;
  /** Line numbers restart each page. */
  lineNumbers?: boolean;
  /** A border around the page, #rrggbb. */
  border?: string;
  /** Text direction for the section. */
  direction?: "lr" | "tb" | "rl";
  /** How this section starts: a new page, a new column, or on the same page. */
  break?: "nextPage" | "continuous" | "evenPage" | "oddPage" | "nextColumn";
}

export interface DocSection {
  page: DocPageSetup;
  header: DocParagraph[];
  footer: DocParagraph[];
  /** Shown on the first page when `titlePage` is set. */
  firstHeader?: DocParagraph[];
  firstFooter?: DocParagraph[];
  /** Shown on even pages. */
  evenHeader?: DocParagraph[];
  evenFooter?: DocParagraph[];
  /** This section's first page uses the first header and footer. */
  titlePage?: boolean;
  /** Package path of each header and footer part, so an edit can be written back to it. */
  headerPart?: string;
  footerPart?: string;
  firstHeaderPart?: string;
  evenHeaderPart?: string;
  firstFooterPart?: string;
  evenFooterPart?: string;
  blocks: DocBlock[];
}

/** A comment anchored in the story. */
export interface DocComment {
  id: string;
  author: string;
  text: string;
}

/** Formatting a named style contributes. A paragraph's own formatting wins. */
export interface DocStyle {
  basedOn?: string;
  align?: DocAlign;
  bold?: boolean;
  italic?: boolean;
  fontSize?: number;
  font?: string;
  color?: string;
}

/** Named styles from styles.xml, keyed by styleId. */
export type DocStyleTable = Record<string, DocStyle>;

/** One work a citation can point at. */
export interface DocSource {
  /** The tag a citation uses, for example "Smith2020". */
  tag: string;
  /** "book", "article", "report", or whatever the user typed. */
  type: string;
  /** Author names, shown as written. */
  authors: string;
  title: string;
  year: string;
  /** Where it was published: a journal, a publisher, a place. */
  publisher?: string;
}

/** The theme's color scheme. Names are the scheme's own: dk1, lt1, accent1, and so on. Values are #rrggbb. */
export type DocThemeColors = Record<string, string>;

/** The theme's font scheme: one face for latin text, one for east-asian text. */
export interface DocThemeFonts {
  latin?: string;
  eastAsia?: string;
}

/** word/theme/theme1.xml, read so a run that names a theme color or a theme font can resolve it. */
export interface DocTheme {
  colors: DocThemeColors;
  fonts: DocThemeFonts;
}

/** The mail merge Word stored in settings.xml: what kind of document this is, and where the data comes from. */
export interface DocMailMerge {
  /** mainDocumentType: formLetters, mailingLabels, envelopes, catalog, or email. */
  document?: string;
  /** dataType: textFile, database, spreadsheet, native, or odso. */
  data?: string;
  /** The data source the merge reads from. */
  source?: string;
  /** How the source connects: file, or a connection string. */
  link?: string;
}

/** One person a mail merge writes a copy for. */
export interface DocRecipient {
  /** Column name to value, matching the fields in the story ("FirstName", "Address"). */
  fields: Record<string, string>;
}

export interface Document {
  sections: DocSection[];
  /** numbering.xml resolved by numId, so a list can paint its marker. */
  numbering?: DocNumberingTable;
  /** styles.xml, so a paragraph style can paint what the runs do not say themselves. */
  styles?: DocStyleTable;
  /** The theme, so a theme color or a theme font resolves to a real one. */
  theme?: DocTheme;
  /** The bibliography a citation draws from. */
  sources?: DocSource[];
  /** The people a mail merge writes one copy each for. */
  recipients?: DocRecipient[];
  /** The mail merge Word stored in settings.xml. */
  mailMerge?: DocMailMerge;
  /** When set, typing records each change as a tracked insertion or deletion. */
  tracking?: boolean;
  /** Comments anchored in the story. */
  comments?: DocComment[];
  /** The document hyphenates words at line ends. */
  hyphenation?: boolean;
  /** How the document is shown: print, web (reading), outline, or normal (draft). Print is the default. */
  view?: "print" | "web" | "outline" | "normal";
  /** Zoom in percent. 100 is the default. */
  zoom?: number;
  /** The file contains a macro project. It is never run. */
  macros?: boolean;
  /** Editing is turned off, so the story can be read but not changed. */
  readOnly?: boolean;
  /** Every file under word/media/, keyed by its package path, whether or not the story shows it. */
  media?: Map<string, Uint8Array>;
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

/** One level of a numbering definition, enough to paint a bullet or a number. */
export interface DocNumberingLevel {
  /** "%1." style text. Empty means a bullet. */
  text: string;
  /** Bullet glyph when there is no number text. */
  bullet?: string;
  /** First value at this level. Defaults to 1. */
  start?: number;
  /** Number format: decimal, lowerLetter, upperRoman, and the rest Word stores. */
  format?: string;
}

/** Resolved numbering, keyed by numId. Filled in by the parser from numbering.xml. */
export type DocNumberingTable = Record<string, DocNumberingLevel[]>;

/** The marker a list paragraph shows. "%1" is this paragraph's own count; "%2" and beyond come from `counts`, one per level. */
export function listMarker(numbering: DocNumberingTable | undefined, paragraph: DocParagraph, counts: number | number[] = 1): string {
  if (!paragraph.numbering) return "";
  const level = numbering?.[paragraph.numbering.id]?.[paragraph.numbering.level];
  if (level?.bullet) return level.bullet;
  const list = Array.isArray(counts) ? counts : [counts];
  const own = list[paragraph.numbering.level] ?? list[0] ?? 1;
  const text = level?.text;
  if (!text) return `${formatNumber(own, level?.format)}.` ;
  return text.replace(/%(\d+)/g, (_, depth) => {
    const index = Number(depth) - 1;
    const value = list[index] ?? (index === paragraph.numbering!.level ? own : 0);
    return formatNumber(value, numbering?.[paragraph.numbering!.id]?.[index]?.format);
  });
}

/** The text a citation shows: "(Smith, 2020, p. 12)". */
export function citationText(sources: DocSource[] | undefined, citation: { source: string; pages?: string }): string {
  const found = sources?.find((item) => item.tag === citation.source);
  const who = found ? firstAuthor(found.authors) : citation.source;
  const when = found?.year ? `, ${found.year}` : "";
  const where = citation.pages ? `, p. ${citation.pages}` : "";
  return `(${who}${when}${where})`;
}

/** A decimal value in the numbering format Word stored. Unknown formats stay decimal. */
function formatNumber(value: number, format: string | undefined): string {
  if (format === "lowerLetter" || format === "upperLetter") return letter(value, format === "upperLetter");
  if (format === "lowerRoman" || format === "upperRoman") return roman(value, format === "upperRoman");
  return String(value);
}

function letter(value: number, upper: boolean): string {
  let rest = Math.max(1, value);
  let out = "";
  while (rest > 0) {
    rest -= 1;
    out = String.fromCharCode((upper ? 65 : 97) + (rest % 26)) + out;
    rest = Math.floor(rest / 26);
  }
  return out;
}

function roman(value: number, upper: boolean): string {
  const digits: Array<[number, string]> = [[1000, "m"], [900, "cm"], [500, "d"], [400, "cd"], [100, "c"], [90, "xc"], [50, "l"], [40, "xl"], [10, "x"], [9, "ix"], [5, "v"], [4, "iv"], [1, "i"]];
  let rest = Math.max(1, Math.min(value, 3999));
  let out = "";
  for (const [amount, glyph] of digits) {
    while (rest >= amount) {
      out += glyph;
      rest -= amount;
    }
  }
  return upper ? out.toUpperCase() : out;
}

function firstAuthor(authors: string): string {
  const first = authors.split(/\s*(?:,|;| and )\s*/)[0]?.trim() ?? authors;
  return first.split(/\s+/).at(-1) || first;
}

/** The bibliography, one line per source, in the order the sources were added. */
export function bibliographyLines(sources: DocSource[] | undefined): string[] {
  return (sources ?? []).map((item) => {
    const place = item.publisher ? `. ${item.publisher}` : "";
    return `${item.authors} (${item.year}). ${item.title}${place}.`;
  });
}

/** One paragraph of the story with every merge field filled in for one recipient. Missing fields stay blank. */
export function mergedText(paragraph: DocParagraph, recipient: DocRecipient): string {
  return paragraph.runs
    .filter((run) => !run.deleted)
    .map((run) => (run.field?.trim().startsWith("MERGEFIELD") ? recipient.fields[mergeFieldName(run.field)] ?? "" : run.text))
    .join("");
}

/** The column a MERGEFIELD instruction names. */
export function mergeFieldName(instruction: string): string {
  const named = /MERGEFIELD\s+"?([^"\\\s]+)"?/i.exec(instruction);
  return named?.[1] ?? "";
}

/** One copy of the story per recipient, paragraphs joined by blank lines. */
export function mergedCopies(document: Document): string[] {
  const recipients = document.recipients ?? [];
  return recipients.map((recipient) =>
    document.sections
      .flatMap((section) => section.blocks.filter(isDocParagraph))
      .map((paragraph) => mergedText(paragraph, recipient))
      .join("\n"),
  );
}

/** A table of contents: one line per heading, with its outline level and the page it falls on. */
export function tableOfContents(document: Document, pages: number[], depth = 3): Array<{ level: number; text: string; page: number }> {
  const lines: Array<{ level: number; text: string; page: number }> = [];
  let seen = 0;
  for (const section of document.sections) {
    for (const block of section.blocks) {
      const page = pages[seen] ?? 1;
      if (isDocParagraph(block)) {
        const level = headingLevel(block);
        if (level && level <= depth) lines.push({ level, text: block.runs.filter((run) => !run.deleted).map((run) => run.text).join(""), page });
      }
      seen += 1;
    }
  }
  return lines;
}

const HEADING_LEVELS: Record<string, number> = { Heading1: 1, Heading2: 2, Heading3: 3, Heading4: 4, Heading5: 5, Heading6: 6, "1": 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6 };

/** The outline level of a heading paragraph, or 0 when it is not a heading. */
export function headingLevel(paragraph: DocParagraph): number {
  return HEADING_LEVELS[paragraph.style ?? ""] ?? 0;
}

/** The index: one line per term, with the pages it appears on. A "see" entry points elsewhere instead. */
export function indexLines(document: Document, pages: number[]): Array<{ term: string; pages: number[]; see?: string }> {
  const byTerm = new Map<string, { pages: Set<number>; see?: string }>();
  let seen = 0;
  for (const section of document.sections) {
    for (const block of section.blocks) {
      const page = pages[seen] ?? 1;
      if (isDocParagraph(block)) {
        for (const run of block.runs) {
          if (!run.indexEntry) continue;
          const entry = byTerm.get(run.indexEntry.text) ?? { pages: new Set<number>() };
          if (run.indexEntry.see) entry.see = run.indexEntry.see;
          else entry.pages.add(page);
          byTerm.set(run.indexEntry.text, entry);
        }
      }
      seen += 1;
    }
  }
  return [...byTerm.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([term, entry]) => ({ term, pages: [...entry.pages].sort((a, b) => a - b), ...(entry.see ? { see: entry.see } : {}) }));
}

/** The number a page field shows. Word numbers pages from 1 through the whole document. */
export function pageNumber(pages: number[], index: number): number {
  return pages[index] ?? 1;
}

/** Fills PAGE and NUMPAGES fields with the page they fall on and the page count. Other fields keep the text they already show. */
export function resolvePageFields(document: Document, pages: number[]): void {
  const total = Math.max(1, ...pages, 0);
  let seen = 0;
  for (const section of document.sections) {
    for (const block of section.blocks) {
      const page = pages[seen] ?? 1;
      if (isDocParagraph(block)) fillPage(block, page, total);
      else if (isDocTable(block)) {
        for (const row of block.rows) for (const cell of row) for (const paragraph of cell.paragraphs) fillPage(paragraph, page, total);
      }
      seen += 1;
    }
  }
}

function fillPage(paragraph: DocParagraph, page: number, total: number): void {
  for (const run of paragraph.runs) {
    const field = run.field?.trim().toUpperCase();
    if (field === "PAGE") run.text = String(page);
    else if (field === "NUMPAGES") run.text = String(total);
  }
}

/** What a table formula shows. `=SUM(LEFT)` and `=SUM(ABOVE)` add the numbers in that direction; anything else stays as written. */
export function formulaResult(rows: DocCell[][], row: number, col: number, instruction: string): string {
  const formula = /^\s*=\s*SUM\s*\(\s*(LEFT|ABOVE)\s*\)/i.exec(instruction);
  if (!formula?.[1]) return "";
  const cells = formula[1].toUpperCase() === "LEFT" ? (rows[row]?.slice(0, col) ?? []) : rows.slice(0, row).map((line) => line[col]).filter((cell): cell is DocCell => cell !== undefined);
  const total = cells.reduce((sum, cell) => sum + cellValue(cell), 0);
  return String(total);
}

/** The words a spell check would flag: tokens that are not in the dictionary. */
export function misspellings(text: string, dictionary: ReadonlySet<string>): string[] {
  const words = text.match(/[A-Za-z']+/g) ?? [];
  const flagged = new Set<string>();
  for (const word of words) {
    const lower = word.toLowerCase();
    if (lower.length > 1 && !dictionary.has(lower)) flagged.add(word);
  }
  return [...flagged];
}

function cellValue(cell: DocCell): number {
  const value = Number(cell.paragraphs.flatMap((paragraph) => paragraph.runs.filter((run) => !run.deleted).map((run) => run.text)).join("").trim());
  return Number.isFinite(value) ? value : 0;
}

/** The formatting a style contributes, following `basedOn` so the named style wins over the one it inherits. */
export function styleOf(styles: DocStyleTable | undefined, name: string | undefined): DocStyle {
  const merged: DocStyle = {};
  if (!styles || !name) return merged;
  const chain: DocStyle[] = [];
  const seen = new Set<string>();
  for (let current: string | undefined = name; current && !seen.has(current); ) {
    const style: DocStyle | undefined = styles[current];
    if (!style) break;
    seen.add(current);
    chain.push(style);
    current = style.basedOn;
  }
  for (const style of chain.reverse()) {
    if (style.align) merged.align = style.align;
    if (style.bold) merged.bold = true;
    if (style.italic) merged.italic = true;
    if (style.fontSize) merged.fontSize = style.fontSize;
    if (style.font) merged.font = style.font;
    if (style.color) merged.color = style.color;
  }
  return merged;
}
