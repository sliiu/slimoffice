export type DocAlign = "left" | "center" | "right" | "both" | "distribute";

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
  /** CSS pixels for complex-script text, from `szCs`. The latin size is used where this is absent. */
  fontSizeCs?: number;
  /** Bold for complex-script text, from `bCs`. */
  boldCs?: boolean;
  /** Italic for complex-script text, from `iCs`. */
  italicCs?: boolean;
  /** Font family name from rFonts, the ascii face. */
  font?: string;
  /** The east-asian face from rFonts, used when the run holds CJK text. */
  fontEastAsia?: string;
  /** #rrggbb. */
  color?: string;
  /** The color follows the window text, from `w:val="auto"`. It paints as the page's text color. */
  colorAuto?: boolean;
  /** The theme color scheme slot this color came from, such as "accent1". The color itself is the slot resolved. */
  themeColor?: string;
  /** Character style name from rStyle. */
  runStyle?: string;
  /** The underline's own color, #rrggbb, from `u/@w:color`. Absent follows the text. */
  underlineColor?: string;
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
  /** A border around the run, one side at a time. */
  border?: DocBorder;
  /** Shading behind the run, #rrggbb. */
  shading?: string;
  /** Fit the run into this width, in twips, from `fitText`. */
  fitText?: number;
  /** East-asian layout: combined characters, vertical text, or a two-in-one line. */
  eastAsianLayout?: { id?: string; combine?: boolean; vert?: boolean; twoInOne?: boolean };
  /** The pronunciation shown above the run, from `ruby`. The run's text is the base. */
  ruby?: string;
  /** The run reads right to left, from `rtl`. */
  rtl?: boolean;
  /** The run is complex-script text, from `cs`. */
  complex?: boolean;
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
  /** A move range starts or ends at this run. The id ties the start to its end, and the markup is what gets written back. */
  moveRange?: { kind: "moveFrom" | "moveTo"; edge: "start" | "end"; id: string; raw: string };
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
/** One piece of a formula laid out for the page: stacked, shifted, rooted, delimited, or set in a matrix. */
export type DocFormula =
  | { text: string }
  | { kind: "frac"; top: DocFormula[]; bottom: DocFormula[] }
  | { kind: "sup" | "sub" | "subsup"; base: DocFormula[]; script: DocFormula[]; upper?: DocFormula[] }
  | { kind: "root"; body: DocFormula[]; degree: DocFormula[] }
  | { kind: "delim"; open: string; close: string; body: DocFormula[] }
  | { kind: "nary"; sign: string; body: DocFormula[]; sub?: DocFormula[]; sup?: DocFormula[] }
  | { kind: "func"; name: DocFormula[]; body: DocFormula[] }
  | { kind: "bar"; body: DocFormula[]; under?: boolean }
  | { kind: "matrix"; rows: DocFormula[][] };

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
  /** Lines of the document grid before and after the paragraph, from `beforeLines` and `afterLines`. */
  beforeLines?: number;
  afterLines?: number;
  /** Word picks the space before or after this paragraph itself, from `beforeAutospacing` and `afterAutospacing`. */
  beforeAuto?: boolean;
  afterAuto?: boolean;
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
  /** The same indents measured in hundredths of a character, from `leftChars`, `rightChars`, `firstLineChars`, and `hangingChars`. */
  leftChars?: number;
  rightChars?: number;
  firstLineChars?: number;
  hangingChars?: number;
}

export interface DocParagraph {
  style?: string;
  align?: DocAlign;
  numbering?: DocNumbering;
  spacing?: DocSpacing;
  indent?: DocIndent;
  /** Paragraph shading, #rrggbb. */
  shading?: string;
  /** A border around the paragraph, one side at a time. */
  border?: DocBorder;
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
  /** A frame this paragraph sits in, from `framePr`: where it is and how wide. */
  frame?: DocFrame;
  /** Text direction inside the paragraph. */
  direction?: "lr" | "tb" | "rl";
  /** How the line of text sits on its baseline, from `textAlignment`. */
  textAlign?: string;
  /** How tightly text wraps a shape this paragraph belongs to. */
  tightWrap?: string;
  /** The div this paragraph belongs to. */
  divId?: string;
  /** Conditional formatting of a table style, from `cnfStyle`. */
  rowStyle?: string;
  /** This paragraph is a caption, numbered per kind ("Figure 1"). */
  caption?: string;
  /** Line numbers skip this paragraph, from `suppressLineNumbers`. */
  noLineNumbers?: boolean;
  /** This paragraph is the body of a footnote or an endnote, shown at the bottom of the page. */
  note?: { kind: "footnote" | "endnote"; id: string };
  /** This paragraph is the separator Word draws above the notes, or the one it draws when a note continues onto the next page. */
  noteSeparator?: { kind: "footnote" | "endnote"; type: "separator" | "continuationSeparator" };
  /** Tab stops, in twips from the left margin. A leader is the line that fills the gap: dot, hyphen, underscore, middleDot, or none. */
  tabs?: Array<{ pos: number; align?: "left" | "center" | "right" | "decimal"; leader?: string }>;
  runs: DocRun[];
}

export interface DocCell {
  paragraphs: DocParagraph[];
  /** How many columns this cell covers. */
  span?: number;
  /** "restart" begins a vertical merge, "continue" extends the one above. */
  vMerge?: "restart" | "continue";
  shading?: string;
  /** A border around the cell, one side at a time. */
  border?: DocBorder;
  /** Where the cell's text sits between its top and bottom. */
  align?: "top" | "center" | "bottom";
}

export interface DocTable {
  rows: DocCell[][];
  /** Column widths, in twips, one per column. */
  widths?: number[];
  /** Row heights, in twips, one per row, from `trHeight`. Absent means the row is as tall as its content. */
  rowHeights?: number[];
  /** "exact" keeps the row at its height; "atLeast" lets it grow past it. One per row, beside `rowHeights`. */
  rowRules?: Array<"exact" | "atLeast" | undefined>;
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
  /** Page background from settings, the background element, or webSettings, #rrggbb. */
  background?: string;
  /** The left margin webSettings stores for the web view, in pixels. */
  webMargin?: number;
  /** Gutter, in twips. */
  gutter?: number;
  /** Distance from the page edge to the header and footer, in twips. */
  headerDistance?: number;
  footerDistance?: number;
  /** Line numbers restart each page. */
  lineNumbers?: boolean;
  /** The first line's number, from `lnNumType/@w:start`. */
  lineStart?: number;
  /** A border around the page, one side at a time. */
  border?: DocBorder;
  /** Text direction for the section. */
  direction?: "lr" | "tb" | "rl";
  /** How this section starts: a new page, a new column, or on the same page. */
  break?: "nextPage" | "continuous" | "evenPage" | "oddPage" | "nextColumn";
  /** Each column's width, in twips, when the columns are not equal. */
  columnWidths?: number[];
  /** Where the page's text sits between the margins. */
  verticalAlign?: "top" | "center" | "both" | "bottom";
  /** The document grid: how many lines and characters the page is ruled for. */
  grid?: { type?: string; linePitch?: number; charSpace?: number };
  /** Page numbering: where it starts, and how it is written. */
  pageNumber?: { start?: number; format?: string };
  /** The section's text runs right to left, from `bidi`. */
  bidi?: boolean;
  /** The gutter sits on the right, from `rtlGutter`. */
  rtlGutter?: boolean;
  /** Endnotes print at the end of the section instead of the document, from `endnotePr`. */
  endnotesHere?: boolean;
  /** Where footnotes and endnotes start counting, and how they are numbered. */
  notes?: { footnoteStart?: number; footnoteRestart?: string; endnoteStart?: number; endnoteRestart?: string };
}

/** One side of a border. `style` is the line, `size` its width in eighths of a point, `color` #rrggbb. */
export interface DocBorderSide {
  style?: string;
  size?: number;
  color?: string;
}

/** A border read one side at a time, so each side keeps its own line and width. */
export interface DocBorder {
  top?: DocBorderSide;
  left?: DocBorderSide;
  bottom?: DocBorderSide;
  right?: DocBorderSide;
}

/** A paragraph frame, from `framePr`. Distances are in twips. */
export interface DocFrame {
  width?: number;
  height?: number;
  x?: number;
  y?: number;
  anchorX?: string;
  anchorY?: string;
  wrap?: string;
  /** A drop cap: how many lines it drops, and how far it sits from the text. */
  dropCap?: { lines: number; space?: number };
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
  /** The character style linked to this paragraph style, from `w:link`. */
  link?: string;
  /** "paragraph", "character", or "table". A paragraph style is the default. */
  type?: "character" | "table";
  align?: DocAlign;
  /** Space before and after, from the style's `w:spacing`. A paragraph's own spacing wins. */
  spacing?: DocSpacing;
  /** Left, right, first-line, and hanging indent, from the style's `w:ind`. A paragraph's own indent wins. */
  indent?: DocIndent;
  /** Paragraph shading, from the style's `w:shd`. */
  shading?: string;
  /** A border around the paragraph, from the style's `w:pBdr`. */
  border?: DocBorder;
  /** A page break sits before a paragraph that uses this style. */
  pageBreakBefore?: boolean;
  /** Outline level, 0 for the top, from the style's `w:outlineLvl`. */
  outline?: number;
  /** Paragraph switches the style turns on, such as `keepNext` and `widowControl`. */
  marks?: string[];
  /** A frame the style puts the paragraph in, from `w:framePr`. */
  frame?: DocFrame;
  /** Text direction the style sets, from `w:textDirection`. */
  direction?: "lr" | "tb" | "rl";
  /** How the line sits on its baseline, from the style's `w:textAlignment`. */
  textAlign?: string;
  /** The list the style puts the paragraph in, from `w:numPr`. */
  numbering?: DocNumbering;
  /** Tab stops the style sets. */
  tabs?: DocParagraph["tabs"];
  bold?: boolean;
  italic?: boolean;
  fontSize?: number;
  font?: string;
  color?: string;
}

/** What styles.xml says to use when a paragraph or a run names nothing. */
export interface DocDefaults {
  font?: string;
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  color?: string;
  /** Paragraph spacing from `pPrDefault`, underneath every style. */
  spacing?: DocSpacing;
  /** Paragraph indent from `pPrDefault`, underneath every style. */
  indent?: DocIndent;
  align?: DocAlign;
}

/** One latent style: a style Word knows about and builds the first time it is used. */
export interface DocLatentStyle {
  name: string;
  /** How many of them are built in. */
  count?: number;
}

/** Named styles from styles.xml, keyed by styleId, plus the defaults and the latent styles beside them. */
export interface DocStyleTable {
  styles: Record<string, DocStyle>;
  defaults?: DocDefaults;
  /** The paragraph style Word uses when a paragraph names none, from `w:default="1"`. */
  defaultParagraph?: string;
  latent?: DocLatentStyle[];
}

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
  /** A picture used as the bullet, from `numPicBullet`. `image` is its relationship id. */
  picture?: { image: string; imageBytes?: Uint8Array; imageType?: string };
  /** First value at this level. Defaults to 1. */
  start?: number;
  /** Number format: decimal, lowerLetter, upperRoman, and the rest Word stores. */
  format?: string;
  /** The level's own indent, from its `w:pPr/w:ind`. A paragraph's own indent wins. */
  indent?: DocIndent;
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

/** A page number written in the format the section asks for. Decimal is the plain number. */
export function formatPageNumber(value: number, format: string | undefined): string {
  if (format === "lowerRoman" || format === "upperRoman") {
    const roman = toRoman(value);
    return format === "lowerRoman" ? roman.toLowerCase() : roman;
  }
  if (format === "lowerLetter" || format === "upperLetter") {
    const letter = value > 0 && value <= 26 ? String.fromCharCode(96 + value) : String(value);
    return format === "upperLetter" ? letter.toUpperCase() : letter;
  }
  return String(value);
}

function toRoman(value: number): string {
  const numerals: Array<[number, string]> = [[1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"], [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
  let rest = Math.max(0, Math.floor(value));
  let out = "";
  for (const [amount, numeral] of numerals) while (rest >= amount) {
    out += numeral;
    rest -= amount;
  }
  return out || String(value);
}

/** Fills PAGE and NUMPAGES fields with the page they fall on and the page count. Other fields keep the text they already show. */
export function resolvePageFields(document: Document, pages: number[]): void {
  const total = Math.max(1, ...pages, 0);
  let seen = 0;
  for (const section of document.sections) {
    const start = section.page.pageNumber?.start;
    const format = section.page.pageNumber?.format;
    for (const block of section.blocks) {
      const page = (pages[seen] ?? 1) + (start !== undefined ? start - 1 : 0);
      if (isDocParagraph(block)) fillPage(block, page, total, format);
      else if (isDocTable(block)) {
        for (const row of block.rows) for (const cell of row) for (const paragraph of cell.paragraphs) fillPage(paragraph, page, total, format);
      }
      seen += 1;
    }
  }
}

function fillPage(paragraph: DocParagraph, page: number, total: number, format: string | undefined): void {
  for (const run of paragraph.runs) {
    const field = run.field?.trim().toUpperCase();
    if (field === "PAGE") run.text = formatPageNumber(page, format);
    else if (field === "NUMPAGES") run.text = String(total);
  }
}

/** What a table formula shows. SUM, AVERAGE, MIN, MAX, and COUNT each take LEFT, RIGHT, ABOVE, or BELOW; anything else stays as written. */
export function formulaResult(rows: DocCell[][], row: number, col: number, instruction: string): string {
  const formula = /^\s*=\s*(SUM|AVERAGE|MIN|MAX|COUNT)\s*\(\s*(LEFT|RIGHT|ABOVE|BELOW)\s*\)/i.exec(instruction);
  if (!formula?.[1] || !formula[2]) return "";
  const direction = formula[2].toUpperCase();
  const cells = direction === "LEFT" ? (rows[row]?.slice(0, col) ?? [])
    : direction === "RIGHT" ? (rows[row]?.slice(col + 1) ?? [])
    : direction === "ABOVE" ? rows.slice(0, row).map((line) => line[col]).filter((cell): cell is DocCell => cell !== undefined)
    : rows.slice(row + 1).map((line) => line[col]).filter((cell): cell is DocCell => cell !== undefined);
  const values = cells.map(cellValue);
  const name = formula[1].toUpperCase();
  if (name === "COUNT") return String(values.filter((value) => value !== 0).length);
  if (!values.length) return "0";
  if (name === "MIN") return String(Math.min(...values));
  if (name === "MAX") return String(Math.max(...values));
  const total = values.reduce((sum, value) => sum + value, 0);
  return name === "AVERAGE" ? String(total / values.length) : String(total);
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

/** The formatting a style contributes, following `basedOn` so the named style wins over the one it inherits. Document defaults sit underneath. */
export function styleOf(styles: DocStyleTable | undefined, name: string | undefined): DocStyle {
  const merged: DocStyle = {};
  const defaults = styles?.defaults;
  if (defaults?.bold) merged.bold = true;
  if (defaults?.italic) merged.italic = true;
  if (defaults?.fontSize) merged.fontSize = defaults.fontSize;
  if (defaults?.font) merged.font = defaults.font;
  if (defaults?.color) merged.color = defaults.color;
  if (defaults?.spacing) merged.spacing = defaults.spacing;
  if (defaults?.indent) merged.indent = defaults.indent;
  if (defaults?.align) merged.align = defaults.align;
  if (!styles?.styles || !name) return merged;
  const chain: DocStyle[] = [];
  const seen = new Set<string>();
  for (let current: string | undefined = name; current && !seen.has(current); ) {
    const style: DocStyle | undefined = styles.styles[current];
    if (!style) break;
    seen.add(current);
    chain.push(style);
    current = style.basedOn;
  }
  for (const style of chain.reverse()) {
    if (style.align) merged.align = style.align;
    // A style sets only the sides it names. The inherited spacing and indent stay.
    if (style.spacing) merged.spacing = { ...merged.spacing, ...style.spacing };
    if (style.indent) merged.indent = { ...merged.indent, ...style.indent };
    if (style.shading) merged.shading = style.shading;
    if (style.border) merged.border = { ...merged.border, ...style.border };
    if (style.pageBreakBefore) merged.pageBreakBefore = true;
    if (style.outline !== undefined) merged.outline = style.outline;
    if (style.marks) merged.marks = [...new Set([...(merged.marks ?? []), ...style.marks])];
    if (style.frame) merged.frame = { ...merged.frame, ...style.frame };
    if (style.direction) merged.direction = style.direction;
    if (style.textAlign) merged.textAlign = style.textAlign;
    if (style.numbering) merged.numbering = style.numbering;
    if (style.tabs) merged.tabs = style.tabs;
    if (style.bold) merged.bold = true;
    if (style.italic) merged.italic = true;
    if (style.fontSize) merged.fontSize = style.fontSize;
    if (style.font) merged.font = style.font;
    if (style.color) merged.color = style.color;
  }
  // The link belongs to the named style, not to the one it inherits.
  const link = chain[0]?.link;
  if (link) merged.link = link;
  return merged;
}
