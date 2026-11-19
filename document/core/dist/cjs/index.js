"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_PAGE = void 0;
exports.isDocRaw = isDocRaw;
exports.isDocTable = isDocTable;
exports.isDocParagraph = isDocParagraph;
exports.listMarker = listMarker;
exports.citationText = citationText;
exports.bibliographyLines = bibliographyLines;
exports.mergedText = mergedText;
exports.mergeFieldName = mergeFieldName;
exports.mergedCopies = mergedCopies;
exports.tableOfContents = tableOfContents;
exports.headingLevel = headingLevel;
exports.indexLines = indexLines;
exports.pageNumber = pageNumber;
exports.resolvePageFields = resolvePageFields;
exports.formulaResult = formulaResult;
exports.misspellings = misspellings;
exports.styleOf = styleOf;
function isDocRaw(block) {
    return "raw" in block && !("runs" in block) && !("rows" in block);
}
function isDocTable(block) {
    return "rows" in block;
}
function isDocParagraph(block) {
    return "runs" in block;
}
exports.DEFAULT_PAGE = {
    width: 12240,
    height: 15840,
    margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 },
};
/** The marker a list paragraph shows. "%1" is this paragraph's own count; "%2" and beyond come from `counts`, one per level. */
function listMarker(numbering, paragraph, counts = 1) {
    if (!paragraph.numbering)
        return "";
    const level = numbering?.[paragraph.numbering.id]?.[paragraph.numbering.level];
    if (level?.bullet)
        return level.bullet;
    const list = Array.isArray(counts) ? counts : [counts];
    const own = list[paragraph.numbering.level] ?? list[0] ?? 1;
    const text = level?.text;
    if (!text)
        return `${formatNumber(own, level?.format)}.`;
    return text.replace(/%(\d+)/g, (_, depth) => {
        const index = Number(depth) - 1;
        const value = list[index] ?? (index === paragraph.numbering.level ? own : 0);
        return formatNumber(value, numbering?.[paragraph.numbering.id]?.[index]?.format);
    });
}
/** The text a citation shows: "(Smith, 2020, p. 12)". */
function citationText(sources, citation) {
    const found = sources?.find((item) => item.tag === citation.source);
    const who = found ? firstAuthor(found.authors) : citation.source;
    const when = found?.year ? `, ${found.year}` : "";
    const where = citation.pages ? `, p. ${citation.pages}` : "";
    return `(${who}${when}${where})`;
}
/** A decimal value in the numbering format Word stored. Unknown formats stay decimal. */
function formatNumber(value, format) {
    if (format === "lowerLetter" || format === "upperLetter")
        return letter(value, format === "upperLetter");
    if (format === "lowerRoman" || format === "upperRoman")
        return roman(value, format === "upperRoman");
    return String(value);
}
function letter(value, upper) {
    let rest = Math.max(1, value);
    let out = "";
    while (rest > 0) {
        rest -= 1;
        out = String.fromCharCode((upper ? 65 : 97) + (rest % 26)) + out;
        rest = Math.floor(rest / 26);
    }
    return out;
}
function roman(value, upper) {
    const digits = [[1000, "m"], [900, "cm"], [500, "d"], [400, "cd"], [100, "c"], [90, "xc"], [50, "l"], [40, "xl"], [10, "x"], [9, "ix"], [5, "v"], [4, "iv"], [1, "i"]];
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
function firstAuthor(authors) {
    const first = authors.split(/\s*(?:,|;| and )\s*/)[0]?.trim() ?? authors;
    return first.split(/\s+/).at(-1) || first;
}
/** The bibliography, one line per source, in the order the sources were added. */
function bibliographyLines(sources) {
    return (sources ?? []).map((item) => {
        const place = item.publisher ? `. ${item.publisher}` : "";
        return `${item.authors} (${item.year}). ${item.title}${place}.`;
    });
}
/** One paragraph of the story with every merge field filled in for one recipient. Missing fields stay blank. */
function mergedText(paragraph, recipient) {
    return paragraph.runs
        .filter((run) => !run.deleted)
        .map((run) => (run.field?.trim().startsWith("MERGEFIELD") ? recipient.fields[mergeFieldName(run.field)] ?? "" : run.text))
        .join("");
}
/** The column a MERGEFIELD instruction names. */
function mergeFieldName(instruction) {
    const named = /MERGEFIELD\s+"?([^"\\\s]+)"?/i.exec(instruction);
    return named?.[1] ?? "";
}
/** One copy of the story per recipient, paragraphs joined by blank lines. */
function mergedCopies(document) {
    const recipients = document.recipients ?? [];
    return recipients.map((recipient) => document.sections
        .flatMap((section) => section.blocks.filter(isDocParagraph))
        .map((paragraph) => mergedText(paragraph, recipient))
        .join("\n"));
}
/** A table of contents: one line per heading, with its outline level and the page it falls on. */
function tableOfContents(document, pages, depth = 3) {
    const lines = [];
    let seen = 0;
    for (const section of document.sections) {
        for (const block of section.blocks) {
            const page = pages[seen] ?? 1;
            if (isDocParagraph(block)) {
                const level = headingLevel(block);
                if (level && level <= depth)
                    lines.push({ level, text: block.runs.filter((run) => !run.deleted).map((run) => run.text).join(""), page });
            }
            seen += 1;
        }
    }
    return lines;
}
const HEADING_LEVELS = { Heading1: 1, Heading2: 2, Heading3: 3, Heading4: 4, Heading5: 5, Heading6: 6, "1": 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6 };
/** The outline level of a heading paragraph, or 0 when it is not a heading. */
function headingLevel(paragraph) {
    return HEADING_LEVELS[paragraph.style ?? ""] ?? 0;
}
/** The index: one line per term, with the pages it appears on. A "see" entry points elsewhere instead. */
function indexLines(document, pages) {
    const byTerm = new Map();
    let seen = 0;
    for (const section of document.sections) {
        for (const block of section.blocks) {
            const page = pages[seen] ?? 1;
            if (isDocParagraph(block)) {
                for (const run of block.runs) {
                    if (!run.indexEntry)
                        continue;
                    const entry = byTerm.get(run.indexEntry.text) ?? { pages: new Set() };
                    if (run.indexEntry.see)
                        entry.see = run.indexEntry.see;
                    else
                        entry.pages.add(page);
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
function pageNumber(pages, index) {
    return pages[index] ?? 1;
}
/** Fills PAGE and NUMPAGES fields with the page they fall on and the page count. Other fields keep the text they already show. */
function resolvePageFields(document, pages) {
    const total = Math.max(1, ...pages, 0);
    let seen = 0;
    for (const section of document.sections) {
        for (const block of section.blocks) {
            const page = pages[seen] ?? 1;
            if (isDocParagraph(block))
                fillPage(block, page, total);
            else if (isDocTable(block)) {
                for (const row of block.rows)
                    for (const cell of row)
                        for (const paragraph of cell.paragraphs)
                            fillPage(paragraph, page, total);
            }
            seen += 1;
        }
    }
}
function fillPage(paragraph, page, total) {
    for (const run of paragraph.runs) {
        const field = run.field?.trim().toUpperCase();
        if (field === "PAGE")
            run.text = String(page);
        else if (field === "NUMPAGES")
            run.text = String(total);
    }
}
/** What a table formula shows. `=SUM(LEFT)` and `=SUM(ABOVE)` add the numbers in that direction; anything else stays as written. */
function formulaResult(rows, row, col, instruction) {
    const formula = /^\s*=\s*SUM\s*\(\s*(LEFT|ABOVE)\s*\)/i.exec(instruction);
    if (!formula?.[1])
        return "";
    const cells = formula[1].toUpperCase() === "LEFT" ? (rows[row]?.slice(0, col) ?? []) : rows.slice(0, row).map((line) => line[col]).filter((cell) => cell !== undefined);
    const total = cells.reduce((sum, cell) => sum + cellValue(cell), 0);
    return String(total);
}
/** The words a spell check would flag: tokens that are not in the dictionary. */
function misspellings(text, dictionary) {
    const words = text.match(/[A-Za-z']+/g) ?? [];
    const flagged = new Set();
    for (const word of words) {
        const lower = word.toLowerCase();
        if (lower.length > 1 && !dictionary.has(lower))
            flagged.add(word);
    }
    return [...flagged];
}
function cellValue(cell) {
    const value = Number(cell.paragraphs.flatMap((paragraph) => paragraph.runs.filter((run) => !run.deleted).map((run) => run.text)).join("").trim());
    return Number.isFinite(value) ? value : 0;
}
/** The formatting a style contributes, following `basedOn` so the named style wins over the one it inherits. */
function styleOf(styles, name) {
    const merged = {};
    if (!styles || !name)
        return merged;
    const chain = [];
    const seen = new Set();
    for (let current = name; current && !seen.has(current);) {
        const style = styles[current];
        if (!style)
            break;
        seen.add(current);
        chain.push(style);
        current = style.basedOn;
    }
    for (const style of chain.reverse()) {
        if (style.align)
            merged.align = style.align;
        if (style.bold)
            merged.bold = true;
        if (style.italic)
            merged.italic = true;
        if (style.fontSize)
            merged.fontSize = style.fontSize;
        if (style.font)
            merged.font = style.font;
        if (style.color)
            merged.color = style.color;
    }
    return merged;
}
