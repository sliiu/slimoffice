import { DEFAULT_PAGE, bibliographyLines, citationText, headingLevel, formulaResult, formatPageNumber, indexLines, isDocParagraph, misspellings, isDocRaw, isDocTable, listMarker, mergeFieldName, mergedCopies, resolvePageFields, styleOf, tableOfContents, } from "@sliiu/document-core";
import { paginate } from "@sliiu/document-renderer";
const SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 72];
const INDENT_STEP = 720;
const INDENT_EDGES = ["left", "right", "firstLine", "hanging"];
const SECTION_STARTS = ["nextPage", "continuous", "evenPage", "oddPage", "nextColumn"];
const RUN_SWITCHES = ["outline", "shadow", "emboss", "imprint", "effect"];
const PARAGRAPH_SWITCHES = ["suppressAutoHyphens", "kinsoku", "wordWrap", "overflowPunct", "topLinePunct", "autoSpaceDE", "autoSpaceDN", "bidi", "adjustRightInd", "snapToGrid", "contextualSpacing", "mirrorIndents", "suppressOverlap"];
/** Changes the letters without touching anything that is not a letter. */
function cased(text, mode) {
    if (mode === "upper")
        return text.toUpperCase();
    if (mode === "lower")
        return text.toLowerCase();
    if (mode === "toggle")
        return [...text].map((char) => (char === char.toUpperCase() ? char.toLowerCase() : char.toUpperCase())).join("");
    if (mode === "title")
        return text.replace(/\S+/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
    let sentence = true;
    return [...text].map((char) => {
        if (!/\p{L}/u.test(char)) {
            if (/[.!?]/.test(char))
                sentence = true;
            return char;
        }
        const next = sentence ? char.toUpperCase() : char.toLowerCase();
        sentence = false;
        return next;
    }).join("");
}
/** Pages you can edit. Headers and footers stay as opened; the story is what gets written back. */
export function mountDocument(host, doc, options = {}) {
    const locale = options.locale ?? "en";
    const zh = locale === "zh-CN";
    if (!doc.sections[0])
        doc.sections.push({ page: { ...DEFAULT_PAGE }, header: [], footer: [], blocks: [] });
    const history = { undo: [], redo: [] };
    let selected = { section: 0, block: 0 };
    let armed = false;
    let root = el("div", "doc-view");
    let hits = [];
    let hitIndex = 0;
    /** Formatting the painter copied, waiting for the next call to apply it. */
    let painted;
    /** The ruler and the heading navigation are drawn beside the pages. Both start hidden. */
    const viewState = { ruler: false, navigation: false };
    /** The current paragraph's runs, kept so a cut and paste carries the formatting with the text. */
    let clipped = [];
    const view = {
        destroy: () => root.remove(),
        undo,
        redo,
        canUndo: () => history.undo.length > 0,
        canRedo: () => history.redo.length > 0,
        bold: () => toggleMark("bold"),
        boldOn: () => markOn("bold"),
        italic: () => toggleMark("italic"),
        italicOn: () => markOn("italic"),
        underline,
        underlineOn: () => textRuns(current()).some((run) => run.underline),
        strike: () => toggleMark("strike"),
        strikeOn: () => markOn("strike"),
        superscript: () => toggleVert("superscript"),
        subscript: () => toggleVert("subscript"),
        vertAlignOn: (value) => textRuns(current()).some((run) => run.vertAlign === value),
        highlight,
        highlightOn: () => textRuns(current())[0]?.highlight,
        fontSize,
        fontSizeOn: () => textRuns(current())[0]?.fontSize,
        growFont: () => stepFont(1),
        shrinkFont: () => stepFont(-1),
        font,
        fontOn: () => shownFont(textRuns(current())[0]),
        color,
        colorOn: () => textRuns(current())[0]?.color,
        clearFormat,
        align,
        alignOn,
        indent,
        indentEdge,
        bullet,
        number,
        insertParagraph,
        insertTable,
        addRow,
        addColumn,
        deleteRow,
        deleteColumn,
        mergeCells,
        insertImage,
        link,
        unlink,
        linkOn: () => textRuns(current()).find((run) => run.link)?.link,
        bookmark,
        pageBreak,
        columnBreak,
        pageSize,
        landscape,
        landscapeOn: () => currentSection().page.landscape === true,
        margins,
        columns,
        columnsOn: () => currentSection().page.columns ?? 1,
        columnSpace,
        columnSeparator,
        columnSeparatorOn: () => currentSection().page.columnSeparator === true,
        columnWidths,
        verticalAlign,
        linePitch,
        charSpace,
        pageNumberFormat,
        pageColor,
        pageColorOn: () => currentSection().page.background,
        find,
        findNext,
        replace,
        replaceAll,
        acceptChange,
        rejectChange,
        compare,
        tableOfContents: contents,
        caption,
        crossReference,
        referenceTargets,
        addSource,
        cite,
        bibliography,
        indexEntry,
        insertIndex,
        addRecipient,
        recipientFields,
        mergeField,
        mailMerge: () => (doc.mailMerge ? { ...doc.mailMerge } : undefined),
        setMailMerge,
        contentControl,
        merge,
        envelope,
        labels,
        footnote: (value) => addNote("footnote", value),
        endnote: (value) => addNote("endnote", value),
        pageNumber: insertPageNumber,
        formula: insertFormula,
        equation,
        themeColors: () => ({ ...(doc.theme?.colors ?? {}) }),
        themeFont: () => doc.theme?.fonts.latin,
        view: () => doc.view ?? "print",
        setView,
        zoom: () => doc.zoom ?? 100,
        setZoom,
        ruler: () => viewState.ruler,
        toggleRuler,
        navigation: () => viewState.navigation,
        toggleNavigation,
        headings,
        goToHeading,
        macros: () => doc.macros === true,
        style: applyStyle,
        styles: () => Object.keys(doc.styles?.styles ?? {}),
        track: (on) => {
            doc.tracking = on;
            touch();
        },
        tracking: () => doc.tracking === true,
        painter: paint,
        painterOn: () => painted !== undefined,
        scale: (percent) => setRun("scale", percent),
        charSpacing: (value) => setRun("spacing", value),
        position: (value) => setRun("position", value),
        caps: () => toggleFlag("caps"),
        capsOn: () => flagOn("caps"),
        smallCaps: () => toggleFlag("smallCaps"),
        smallCapsOn: () => flagOn("smallCaps"),
        doubleStrike: () => toggleFlag("doubleStrike"),
        doubleStrikeOn: () => flagOn("doubleStrike"),
        hidden: () => toggleFlag("hidden"),
        hiddenOn: () => flagOn("hidden"),
        emphasis: () => toggleFlag("emphasis"),
        emphasisOn: () => flagOn("emphasis"),
        ruby: setRuby,
        rubyOn: () => textRuns(current())[0]?.ruby ?? "",
        changeCase,
        lang,
        kern,
        runStyle,
        runSwitch,
        shadowOn: () => switchOn("shadow"),
        runSwitchOn: switchOn,
        keepWithNext: () => toggleParagraph("keepNext"),
        keepWithNextOn: () => paragraphOn("keepNext"),
        keepLines: () => toggleParagraph("keepLines"),
        keepLinesOn: () => paragraphOn("keepLines"),
        widowControl: () => toggleParagraph("widowControl"),
        widowControlOn: () => paragraphOn("widowControl"),
        outline,
        outlineOn: () => current()?.outline,
        paragraphSwitch,
        wordWrapOn: () => paragraphSwitchOn("wordWrap"),
        paragraphSwitchOn,
        bidiOn: () => paragraphSwitchOn("bidi"),
        tabStop,
        cover,
        shape,
        icon,
        smartArt,
        chart,
        comment: addComment,
        comments: () => (doc.comments ?? []).map((item) => ({ ...item })),
        spelling: (dictionary) => misspellings(storyText(), dictionary),
        sort,
        lineSpacing,
        paragraphSpacing,
        shading,
        border,
        blankPage,
        symbol,
        dateTime,
        textBox,
        paper: pageSize,
        pageEdges,
        sectionBidi,
        sectionBidiOn: () => currentSection().page.bidi === true,
        rtlGutter,
        rtlGutterOn: () => currentSection().page.rtlGutter === true,
        endnotesHere,
        endnotesHereOn: () => currentSection().page.endnotesHere === true,
        noteStart,
        lineNumbers,
        lineNumbersOn: () => currentSection().page.lineNumbers === true,
        lineStart,
        underlineColor,
        underlineColorOn: () => textRuns(current())[0]?.underlineColor ?? "",
        noLineNumbers,
        noLineNumbersOn: () => current()?.noLineNumbers === true,
        pageBorder,
        direction,
        watermark,
        sectionBreak,
        sectionStart,
        columnWidth,
        headerRow,
        cellBorder,
        cellShading,
        runShading,
        runBorder,
        cellAlign,
        cellAlignOn: () => currentCell()?.align,
        rowHeight,
        dropCap,
        pageBreakBefore,
        pageBreakBeforeOn: () => current()?.pageBreakBefore === true,
        baseline,
        fitText,
        eastAsian,
        hyphenate,
        hyphenateOn: () => doc.hyphenation === true,
        readCaption,
        wrap,
        order,
        alignObject,
        group,
        rotate,
        crop,
        translate,
        protect,
        protected: () => doc.readOnly === true,
        selectAll,
        wordCount,
        speak,
        copy,
        cut,
        paste,
        reload: render,
    };
    render();
    return view;
    function render() {
        const span = captureSpan(root);
        applyTheme();
        const laid = paginate(doc);
        const numbers = pageNumbers(laid);
        resolvePageFields(doc, numbers);
        root = el("div", "doc-view");
        if (doc.hyphenation)
            root.dataset.hyphenate = "on";
        const mode = doc.view ?? "print";
        if (mode !== "print")
            root.dataset.view = mode;
        if (doc.zoom && doc.zoom !== 100)
            root.style.zoom = String(doc.zoom / 100);
        if (viewState.ruler)
            root.append(rulerNode());
        if (viewState.navigation)
            root.append(navigationNode());
        const shown = mode === "outline" ? laid.map((page) => ({ ...page, blocks: page.blocks.filter(outlined) })) : laid;
        shown.forEach((page, pageIndex) => {
            const paper = el("section", "doc-page");
            paper.style.width = mode === "print" ? `${page.width}px` : "auto";
            paper.style.minHeight = mode === "print" ? `${page.height}px` : "0";
            paper.style.padding = mode === "print" ? sides(page.margin) : page.webMargin ? `${page.webMargin}px` : "12px";
            if (page.background)
                paper.style.background = page.background;
            paintBorder(paper, page.border);
            if (page.columnWidths?.length)
                paper.dataset.columnWidths = page.columnWidths.join(" ");
            if (page.verticalAlign && page.verticalAlign !== "top")
                paper.style.alignContent = page.verticalAlign === "both" ? "space-between" : page.verticalAlign;
            if (page.linePitch)
                paper.style.setProperty("--doc-line-pitch", `${page.linePitch}px`);
            if (page.charSpace)
                paper.style.setProperty("--doc-char-space", `${page.charSpace}px`);
            if (page.direction === "tb")
                paper.style.writingMode = "vertical-rl";
            if (page.direction === "rl" || page.bidi)
                paper.style.direction = "rtl";
            if (page.lineNumbers) {
                paper.dataset.lineNumbers = "on";
                paper.style.counterReset = `doc-line ${page.lineStart ?? 1}`;
            }
            if (page.rtlGutter && page.direction !== "tb" && page.gutter)
                paper.style.paddingRight = `${page.margin.right * (96 / 1440) + page.gutter}px`;
            else if (page.direction !== "tb" && page.gutter)
                paper.style.paddingLeft = `${page.margin.left * (96 / 1440) + page.gutter}px`;
            if (mode === "print" && page.header.length)
                paper.append(story("header", page.header, page.headerKind, sectionIndexFor(page.blocks), pageIndex + 1, laid.length, page.headerDistance));
            const body = el("div", "doc-body");
            body.style.position = "relative";
            if (page.columns > 1) {
                body.style.columnCount = String(page.columns);
                body.style.columnGap = page.columnSpace ? `${page.columnSpace}px` : "24px";
                if (page.columnSeparator)
                    body.style.columnRule = "1px solid currentColor";
            }
            const sectionIndex = sectionIndexFor(page.blocks);
            const notes = [];
            let separator;
            for (const block of page.blocks) {
                if (isDocParagraph(block) && block.noteSeparator)
                    separator = block;
                else if (isDocParagraph(block) && block.note)
                    notes.push(block);
                else
                    body.append(renderBlock(block, sectionIndex));
            }
            paper.append(body);
            if (notes.length)
                paper.append(noteList(notes, sectionIndex, separator));
            if (mode === "print" && page.footer.length)
                paper.append(story("footer", page.footer, page.footerKind, sectionIndexFor(page.blocks), pageIndex + 1, laid.length, page.footerDistance));
            paper.dataset.page = String(pageIndex);
            root.append(paper);
        });
        const bar = host.querySelector(":scope > .office-toolbar");
        host.replaceChildren(...(bar ? [bar, root] : [root]));
        restoreSpan(root, span);
    }
    function sectionIndexFor(blocks) {
        const first = blocks[0];
        if (!first)
            return selected.section;
        const index = doc.sections.findIndex((section) => section.blocks.includes(first));
        return index < 0 ? selected.section : index;
    }
    function renderBlock(block, sectionIndex) {
        const section = doc.sections[sectionIndex];
        const origin = isDocTable(block) ? block.source : undefined;
        const blockIndex = section ? section.blocks.indexOf(origin?.table ?? block) : -1;
        if (isDocRaw(block))
            return rawBlock(block, { section: sectionIndex, block: blockIndex });
        if (isDocParagraph(block))
            return paragraph(block, { section: sectionIndex, block: blockIndex }, true);
        const table = el("table", "doc-table");
        if (block.widths?.length)
            table.style.tableLayout = "fixed";
        const repeated = origin && origin.from > 0 && origin.table.header ? 1 : 0;
        block.rows.forEach((row, sliceIndex) => {
            const rowIndex = origin ? (sliceIndex < repeated ? 0 : origin.from + sliceIndex - repeated) : sliceIndex;
            const rows = origin ? origin.table.rows : block.rows;
            const tr = document.createElement("tr");
            if (rowIndex === 0 && (origin ? origin.table.header : block.header))
                tr.dataset.header = "on";
            const rowHeight = block.rowHeights?.[sliceIndex];
            if (rowHeight) {
                tr.style.height = twips(rowHeight);
                if (block.rowRules?.[sliceIndex] === "exact")
                    tr.style.maxHeight = twips(rowHeight);
            }
            row.forEach((cell, colIndex) => {
                if (cell.vMerge === "continue")
                    return;
                const td = document.createElement("td");
                if (cell.span && cell.span > 1)
                    td.colSpan = cell.span;
                const continued = continuedRows(rows, rowIndex, colIndex);
                if (continued > 1)
                    td.rowSpan = continued;
                if (cell.shading)
                    td.style.background = cell.shading;
                paintBorder(td, cell.border);
                if (cell.align && cell.align !== "top")
                    td.style.verticalAlign = cell.align;
                const width = block.widths?.[colIndex];
                if (width)
                    td.style.width = twips(width);
                cell.paragraphs.forEach((item, paraIndex) => {
                    resolveFormula(rows, rowIndex, colIndex, item);
                    td.append(paragraph(item, { section: sectionIndex, block: blockIndex, row: rowIndex, col: colIndex, para: paraIndex }, true));
                });
                tr.append(td);
            });
            table.append(tr);
        });
        return table;
    }
    /** A header or footer. Its paragraphs edit the section's own copy, so the change is written back with the part. */
    function story(kind, items, storyKind, sectionIndex, page, total, distance) {
        const node = el("div", `doc-${kind}`);
        if (distance)
            node.style[kind === "header" ? "top" : "bottom"] = `${distance}px`;
        items.forEach((item, index) => {
            const spot = { section: sectionIndex, block: index, story: kind, storyKind };
            const para = paragraph(item, spot, true);
            for (const run of item.runs) {
                const field = run.field?.trim().toUpperCase();
                if (field !== "PAGE" && field !== "NUMPAGES")
                    continue;
                const rendered = para.querySelector(`[data-run="${item.runs.indexOf(run)}"]`);
                const numbering = doc.sections[sectionIndex]?.page.pageNumber;
                const shown = page + (numbering?.start !== undefined ? numbering.start - 1 : 0);
                if (rendered)
                    rendered.textContent = field === "PAGE" ? formatPageNumber(shown, numbering?.format) : String(total);
            }
            node.append(para);
        });
        return node;
    }
    /** A block kept as markup. Its text can be edited; the markup around it stays. */
    function rawBlock(block, spot) {
        const node = el("div", "doc-raw");
        stamp(node, spot);
        if (block.content) {
            node.dataset.control = "on";
            block.content.forEach((item, index) => node.append(paragraph(item, { section: spot.section, block: spot.block, control: index }, true)));
            return node;
        }
        const place = () => {
            selected = spot;
            arm();
            options.onSelection?.();
        };
        if (block.formula?.length) {
            node.append(formulaNode(block.formula, () => {
                block.text = formulaPlain(block.formula);
                touch();
            }, place));
            return node;
        }
        node.contentEditable = "true";
        node.textContent = block.text ?? block.raw.replace(/<[^>]+>/g, "").trim();
        node.addEventListener("focus", place);
        node.addEventListener("input", () => {
            if (doc.readOnly) {
                node.textContent = block.text ?? "";
                return;
            }
            block.text = node.textContent ?? "";
            touch();
        });
        return node;
    }
    /** Switches how the document is shown. An unknown mode is ignored. */
    function setView(mode) {
        if (!VIEW_MODES.includes(mode))
            return;
        if (!remember())
            return;
        if (mode === "print")
            delete doc.view;
        else
            doc.view = mode;
        finish();
    }
    /** Sets the zoom, in percent. 100 clears it. */
    function setZoom(percent) {
        if (!Number.isFinite(percent) || percent < 10 || percent > 500)
            return;
        if (!remember())
            return;
        if (Math.round(percent) === 100)
            delete doc.zoom;
        else
            doc.zoom = Math.round(percent);
        finish();
    }
    function toggleRuler() {
        viewState.ruler = !viewState.ruler;
        render();
    }
    function toggleNavigation() {
        viewState.navigation = !viewState.navigation;
        render();
    }
    /** A block an outline keeps: a heading, or a paragraph with an outline level. */
    function outlined(block) {
        if (!isDocParagraph(block))
            return false;
        return headingLevel(block) > 0 || (block.outline !== undefined && block.outline > 0);
    }
    function headings() {
        const found = [];
        doc.sections.forEach((section, sectionIndex) => {
            section.blocks.forEach((block, blockIndex) => {
                if (!isDocParagraph(block))
                    return;
                const level = headingLevel(block) || block.outline || 0;
                if (level > 0)
                    found.push({ level, text: block.runs.map((run) => run.text).join(""), section: sectionIndex, block: blockIndex });
            });
        });
        return found;
    }
    function goToHeading(section, block) {
        const item = doc.sections[section]?.blocks[block];
        if (!item || !isDocParagraph(item))
            return;
        selected = { section, block };
        render();
    }
    /** A ruler marked in centimetres, from the page's left edge to its right. */
    function rulerNode() {
        const node = el("div", "doc-ruler");
        const page = doc.sections[selected.section]?.page ?? doc.sections[0]?.page;
        const width = page?.width ?? 12240;
        const marks = Math.floor((width / 1440) * 2.54);
        for (let mark = 0; mark <= marks; mark += 1)
            node.append(document.createTextNode(mark === 0 ? "" : `${mark} `));
        return node;
    }
    /** The headings, as buttons that move the caret. */
    function navigationNode() {
        const node = el("nav", "doc-navigation");
        for (const heading of headings()) {
            const button = document.createElement("button");
            button.type = "button";
            button.textContent = heading.text;
            button.dataset.level = String(heading.level);
            button.addEventListener("click", () => goToHeading(heading.section, heading.block));
            node.append(button);
        }
        return node;
    }
    /** Fills in the theme where a run left a slot open: a theme font becomes the theme's face, and a run with no color takes the theme's text color. */
    function applyTheme() {
        const theme = doc.theme;
        if (!theme)
            return;
        const face = theme.fonts.latin;
        const eastAsia = theme.fonts.eastAsia;
        const ink = theme.colors.dk1;
        for (const section of doc.sections) {
            for (const block of section.blocks) {
                const paragraphs = isDocParagraph(block) ? [block] : isDocTable(block) ? block.rows.flatMap((row) => row.flatMap((cell) => cell.paragraphs)) : [];
                for (const paragraph of paragraphs) {
                    for (const run of paragraph.runs) {
                        if (face && run.font === "theme:latin")
                            run.font = face;
                        if (eastAsia && run.fontEastAsia === "theme:eastAsia")
                            run.fontEastAsia = eastAsia;
                        const themed = run.themeColor ? theme.colors[run.themeColor] : undefined;
                        if (themed)
                            run.color = themed;
                        else if (ink && !run.color && !run.colorAuto)
                            run.color = ink;
                    }
                }
            }
        }
    }
    /** The words of a formula, in the order its text nodes were read. */
    function formulaPlain(pieces) {
        return (pieces ?? []).map((piece) => ("text" in piece ? piece.text : formulaPlain(formulaChildren(piece)))).join("");
    }
    /** A formula laid out: a fraction stacks over a bar, a script shifts, a radical roots. Its words can be edited; the structure stays. */
    function formulaNode(pieces, edited, place) {
        const node = el("span", "doc-formula");
        for (const piece of pieces) {
            if ("text" in piece) {
                const word = document.createElement("span");
                word.textContent = piece.text;
                if (!doc.readOnly)
                    word.contentEditable = "true";
                word.addEventListener("focus", place);
                word.addEventListener("input", () => {
                    if (doc.readOnly) {
                        word.textContent = piece.text;
                        return;
                    }
                    piece.text = word.textContent ?? "";
                    edited();
                });
                node.append(word);
                continue;
            }
            if (piece.kind === "frac") {
                const frac = el("span", "doc-frac");
                frac.append(formulaNode(piece.top, edited, place), formulaNode(piece.bottom, edited, place));
                node.append(frac);
            }
            else if (piece.kind === "root") {
                const root = el("span", "doc-root");
                root.append(document.createTextNode("√"), formulaNode(piece.body, edited, place));
                node.append(root);
            }
            else if (piece.kind === "delim") {
                const wrapped = el("span", "doc-delim");
                wrapped.append(document.createTextNode(piece.open), formulaNode(piece.body, edited, place), document.createTextNode(piece.close));
                node.append(wrapped);
            }
            else if (piece.kind === "nary") {
                const nary = el("span", "doc-nary");
                const sign = el("span", "doc-nary-sign");
                sign.append(document.createTextNode(piece.sign), formulaNode(piece.sub ?? [], edited, place), formulaNode(piece.sup ?? [], edited, place));
                nary.append(sign, formulaNode(piece.body, edited, place));
                node.append(nary);
            }
            else if (piece.kind === "func") {
                const named = el("span", "doc-func");
                named.append(formulaNode(piece.name, edited, place), formulaNode(piece.body, edited, place));
                node.append(named);
            }
            else if (piece.kind === "bar") {
                const barred = el("span", piece.under ? "doc-under" : "doc-bar");
                barred.append(formulaNode(piece.body, edited, place));
                node.append(barred);
            }
            else if (piece.kind === "matrix") {
                const grid = el("span", "doc-matrix");
                for (const row of piece.rows) {
                    const line = el("span", "doc-matrix-row");
                    for (const cell of row)
                        line.append(formulaNode([cell], edited, place));
                    grid.append(line);
                }
                node.append(grid);
            }
            else {
                const script = el("span", piece.kind === "sup" ? "doc-sup" : piece.kind === "subsup" ? "doc-subsup" : "doc-sub");
                script.append(formulaNode(piece.base, edited, place), formulaNode(piece.script, edited, place));
                if (piece.upper)
                    script.append(formulaNode(piece.upper, edited, place));
                node.append(script);
            }
        }
        return node;
    }
    /** Footnotes and endnotes for one page, under the separator the document carries, each editable. */
    function noteList(notes, sectionIndex, separator) {
        const list = el("ol", "doc-notes");
        if (separator?.noteSeparator) {
            list.dataset.separator = separator.noteSeparator.type;
            list.style.borderTop = "1px solid currentColor";
            if (separator.noteSeparator.type === "continuationSeparator")
                list.style.borderTopStyle = "dashed";
        }
        for (const note of notes) {
            const item = document.createElement("li");
            item.dataset.note = `${note.note?.kind ?? "footnote"}:${note.note?.id ?? ""}`;
            const section = doc.sections[sectionIndex];
            const blockIndex = section ? section.blocks.indexOf(note) : -1;
            item.append(paragraph(note, { section: sectionIndex, block: blockIndex }, true));
            list.append(item);
        }
        return list;
    }
    function paragraph(item, spot, editable) {
        const node = el("p", "doc-paragraph");
        stamp(node, spot);
        if (sameSpot(spot, selected))
            node.classList.add("is-selected");
        const style = styleOf(doc.styles, item.style ?? doc.styles?.defaultParagraph);
        const linked = doc.styles?.styles?.[style.link ?? ""];
        const align = item.align ?? style.align;
        if (align)
            node.style.textAlign = align === "both" || align === "distribute" ? "justify" : align;
        if (align === "distribute")
            node.style.textAlignLast = "justify";
        const shading = item.shading ?? style.shading;
        if (shading)
            node.style.background = shading;
        paintBorder(node, overlay(style.border, item.border));
        const outline = item.outline ?? style.outline;
        if (outline !== undefined && outline > 0)
            node.style.paddingLeft = twips(outline * 360);
        const marks = [...new Set([...(style.marks ?? []), ...(item.marks ?? [])])];
        if (item.widowControl || marks.includes("widowControl"))
            node.dataset.widow = "on";
        if (item.noLineNumbers || marks.includes("suppressLineNumbers"))
            node.dataset.noLineNumber = "on";
        if (marks.includes("wordWrap"))
            node.dataset.wordWrap = "on";
        if (marks.includes("snapToGrid"))
            node.dataset.snapToGrid = "on";
        if (marks.includes("contextualSpacing"))
            node.dataset.contextual = "on";
        if (marks.includes("mirrorIndents"))
            node.dataset.mirror = "on";
        if (marks.includes("kinsoku"))
            node.dataset.kinsoku = "on";
        if (marks.includes("overflowPunct"))
            node.dataset.overflow = "on";
        if (marks.includes("topLinePunct"))
            node.dataset.topLine = "on";
        if (marks.includes("autoSpaceDE") || marks.includes("autoSpaceDN"))
            node.dataset.autoSpace = "on";
        if (marks.includes("bidi"))
            node.style.direction = "rtl";
        if (marks.includes("suppressAutoHyphens"))
            node.dataset.noHyphen = "on";
        if (marks.includes("adjustRightInd"))
            node.dataset.adjustRight = "on";
        if (marks.includes("suppressOverlap"))
            node.dataset.noOverlap = "on";
        const frame = overlay(style.frame, item.frame);
        if (frame?.width)
            node.style.maxWidth = twips(frame.width);
        if (frame?.height)
            node.style.maxHeight = twips(frame.height);
        if (frame && (frame.x !== undefined || frame.y !== undefined) && !frame.dropCap) {
            node.style.position = "relative";
            if (frame.x !== undefined)
                node.style.left = twips(frame.x);
            if (frame.y !== undefined)
                node.style.top = twips(frame.y);
        }
        if (frame?.dropCap)
            node.dataset.dropCap = String(frame.dropCap.lines);
        if (item.pageBreakBefore || style.pageBreakBefore)
            node.dataset.breakBefore = "page";
        const baseline = item.textAlign ?? style.textAlign;
        if (baseline)
            node.style.verticalAlign = baseline;
        const direction = item.direction ?? style.direction;
        if (direction === "tb")
            node.style.writingMode = "vertical-rl";
        else if (direction === "rl")
            node.style.direction = "rtl";
        // The paragraph's own numbering wins. A style's numbering is how a list style works.
        const numbering = item.numbering ?? style.numbering;
        // The paragraph's own indent wins one side at a time, then the list level's, then the style's.
        const levelIndent = numbering ? doc.numbering?.[numbering.id]?.[numbering.level]?.indent : undefined;
        const indent = overlay(style.indent, levelIndent, item.indent);
        if (indent?.left)
            node.style.marginLeft = twips(indent.left);
        if (indent?.right)
            node.style.marginRight = twips(indent.right);
        if (indent?.firstLine)
            node.style.textIndent = twips(indent.firstLine);
        if (indent?.hanging) {
            node.style.textIndent = twips(-indent.hanging);
            node.style.paddingLeft = twips(indent.hanging);
        }
        // A character indent is hundredths of a character. The twip indent wins when both are set.
        if (!indent?.left && indent?.leftChars)
            node.style.marginLeft = chars(indent.leftChars);
        if (!indent?.right && indent?.rightChars)
            node.style.marginRight = chars(indent.rightChars);
        if (!indent?.firstLine && !indent?.hanging && indent?.firstLineChars)
            node.style.textIndent = chars(indent.firstLineChars);
        if (!indent?.hanging && indent?.hangingChars) {
            node.style.textIndent = chars(-indent.hangingChars);
            node.style.paddingLeft = chars(indent.hangingChars);
        }
        const spacing = overlay(style.spacing, item.spacing);
        // The grid stores twips per line; the page variable is the same distance in pixels.
        const pitch = doc.sections[spot.section]?.page.grid?.linePitch;
        const pitchPx = pitch ? (pitch * 96) / 1440 : 0;
        if (spacing?.before)
            node.style.marginTop = twips(spacing.before);
        else if (spacing?.beforeLines && pitchPx)
            node.style.marginTop = `${spacing.beforeLines * pitchPx}px`;
        else if (spacing?.beforeAuto)
            node.style.marginTop = "1em";
        if (spacing?.after)
            node.style.marginBottom = twips(spacing.after);
        else if (spacing?.afterLines && pitchPx)
            node.style.marginBottom = `${spacing.afterLines * pitchPx}px`;
        else if (spacing?.afterAuto)
            node.style.marginBottom = "1em";
        const line = spacing?.line;
        if (line !== undefined)
            node.style.lineHeight = spacing?.lineRule === "auto" ? String(line / 240) : twips(line);
        const marker = listMarker(doc.numbering, numbering ? { ...item, numbering } : item, listCounts(spot, numbering));
        const picture = numbering ? doc.numbering?.[numbering.id]?.[numbering.level]?.picture : undefined;
        if (picture?.imageBytes) {
            const bullet = document.createElement("img");
            bullet.className = "doc-marker";
            bullet.alt = "";
            bullet.src = `data:${picture.imageType ?? "image/png"};base64,${base64(picture.imageBytes)}`;
            bullet.style.height = "1em";
            bullet.contentEditable = "false";
            node.append(bullet);
        }
        else if (marker) {
            const bullet = el("span", "doc-marker");
            bullet.textContent = marker;
            bullet.contentEditable = "false";
            node.append(bullet);
        }
        item.runs.forEach((run, runIndex) => {
            const rendered = runNode(styled(run, run.runStyle ? styleOf(doc.styles, run.runStyle) : linked?.type === "character" ? linked : style));
            if (editable && !run.image) {
                rendered.contentEditable = "true";
                rendered.dataset.run = String(runIndex);
                rendered.addEventListener("focus", () => {
                    selected = { ...spot, run: runIndex };
                    arm();
                    options.onSelection?.();
                });
                rendered.addEventListener("blur", () => {
                    armed = false;
                });
                rendered.addEventListener("input", () => {
                    const typed = rendered.textContent ?? "";
                    if (doc.readOnly) {
                        rendered.textContent = run.text;
                        return;
                    }
                    if (run.field)
                        return;
                    if (doc.tracking && typed !== run.text)
                        recordTyping(item, runIndex, run.text, typed);
                    else
                        run.text = typed;
                    touch();
                });
            }
            node.append(rendered);
        });
        placeTabs(node, item.tabs ?? style.tabs);
        if (editable && !item.runs.some((run) => !run.image)) {
            const empty = runNode({ text: "" });
            empty.contentEditable = "true";
            empty.addEventListener("focus", () => {
                selected = spot;
                arm();
                options.onSelection?.();
            });
            empty.addEventListener("input", () => {
                if (doc.readOnly) {
                    empty.textContent = "";
                    return;
                }
                item.runs.push({ text: empty.textContent ?? "" });
                touch();
            });
            node.append(empty);
        }
        return node;
    }
    /** The count at every level for the numbering id this paragraph uses. A deeper level restarts after a shallower one. */
    function listCounts(spot, numbering = paragraphAt(spot)?.numbering) {
        const section = doc.sections[spot.section];
        const item = paragraphAt(spot);
        if (!section || !numbering)
            return [1];
        const counts = [];
        const startOf = (level) => doc.numbering?.[numbering.id]?.[level]?.start ?? 1;
        const used = (block) => isDocParagraph(block) ? block.numbering ?? styleOf(doc.styles, block.style ?? doc.styles?.defaultParagraph).numbering : undefined;
        for (const block of section.blocks) {
            const blockNumbering = used(block);
            if (!blockNumbering || blockNumbering.id !== numbering.id)
                continue;
            const level = blockNumbering.level;
            counts[level] = (counts[level] ?? startOf(level) - 1) + 1;
            for (let deeper = level + 1; deeper < counts.length; deeper += 1)
                counts[deeper] = 0;
            if (block === item)
                return counts.map((value) => value || 0);
        }
        return counts.length ? counts : [1];
    }
    function undo() {
        const prev = history.undo.pop();
        if (!prev)
            return;
        history.redo.push(snapshot());
        restore(prev);
    }
    function redo() {
        const next = history.redo.pop();
        if (!next)
            return;
        history.undo.push(snapshot());
        restore(next);
    }
    function restore(saved) {
        const sections = JSON.parse(saved.sections);
        sections.forEach(revive);
        doc.sections = sections;
        doc.numbering = JSON.parse(saved.numbering);
        doc.sources = JSON.parse(saved.sources);
        doc.recipients = JSON.parse(saved.recipients);
        doc.tracking = saved.tracking;
        doc.hyphenation = saved.hyphenation;
        doc.view = JSON.parse(saved.view);
        doc.zoom = JSON.parse(saved.zoom);
        doc.mailMerge = JSON.parse(saved.mailMerge);
        doc.comments = JSON.parse(saved.comments);
        touch();
        render();
        options.onSelection?.();
    }
    function toggleMark(mark) {
        const runs = targetRuns();
        // Complex text paints the complex-script mark, so that is the one the toggle reads.
        const on = runs.length > 0 && runs.every((run) => shownMark(run, mark));
        applyToRuns((run) => {
            const complex = holdsComplex(run.text) ? complexMark(mark) : undefined;
            if (on) {
                delete run[mark];
                if (complex)
                    delete run[complex];
            }
            else {
                run[mark] = true;
                if (complex)
                    run[complex] = true;
            }
        });
    }
    function markOn(mark) {
        const runs = targetRuns();
        return runs.length > 0 && runs.every((run) => shownMark(run, mark));
    }
    /** Sets the pronunciation shown above the current run. An empty value clears it. */
    function setRuby(value) {
        applyToRuns((run) => {
            if (value)
                run.ruby = value;
            else
                delete run.ruby;
        });
    }
    /** Switches a run flag on the selection, the same way bold does. */
    function toggleFlag(flag) {
        const on = flagOn(flag);
        applyToRuns((run) => {
            if (on)
                delete run[flag];
            else if (flag === "emphasis")
                run.emphasis = "dot";
            else
                run[flag] = true;
        });
    }
    function flagOn(flag) {
        const runs = targetRuns();
        return runs.length > 0 && runs.every((run) => run[flag]);
    }
    /** Rewrites the letters. Caps stays off, since the letters themselves change. */
    function changeCase(mode) {
        applyToRuns((run) => {
            run.text = cased(run.text, mode);
            delete run.caps;
        });
    }
    function lang(value) {
        applyToRuns((run) => {
            if (value)
                run.lang = value;
            else
                delete run.lang;
        });
    }
    function kern(points) {
        if (!Number.isFinite(points) || points < 0)
            return;
        applyToRuns((run) => {
            if (points)
                run.kern = points;
            else
                delete run.kern;
        });
    }
    function runStyle(name) {
        applyToRuns((run) => {
            if (name)
                run.runStyle = name;
            else
                delete run.runStyle;
        });
    }
    /** Adds or removes one switch from the run's list, leaving the others where they were. */
    function switchOn(name) {
        const runs = targetRuns();
        return runs.length > 0 && runs.every((run) => run.marks?.includes(name));
    }
    function runSwitch(name, on) {
        if (!RUN_SWITCHES.includes(name))
            return;
        const runs = targetRuns();
        if (!runs.length)
            return;
        if (!remember())
            return;
        for (const run of runs) {
            const marks = (run.marks ?? []).filter((mark) => mark !== name);
            if (on)
                marks.push(name);
            if (marks.length)
                run.marks = marks;
            else
                delete run.marks;
        }
        finish();
    }
    function toggleParagraph(flag) {
        const item = current();
        if (!item)
            return;
        if (!remember())
            return;
        if (item[flag])
            delete item[flag];
        else
            item[flag] = true;
        finish();
    }
    function paragraphOn(flag) {
        return current()?.[flag] === true;
    }
    function outline(level) {
        const item = current();
        if (!item || !Number.isFinite(level))
            return;
        if (!remember())
            return;
        if (level < 0)
            delete item.outline;
        else
            item.outline = Math.floor(level);
        finish();
    }
    function paragraphSwitchOn(name) {
        return current()?.marks?.includes(name) === true;
    }
    function paragraphSwitch(name, on) {
        const item = current();
        if (!item || !PARAGRAPH_SWITCHES.includes(name))
            return;
        if (!remember())
            return;
        const marks = (item.marks ?? []).filter((mark) => mark !== name);
        if (on)
            marks.push(name);
        if (marks.length)
            item.marks = marks;
        else
            delete item.marks;
        finish();
    }
    function underline(style = "single") {
        const runs = targetRuns();
        const on = runs.length > 0 && runs.every((run) => run.underline === style);
        applyToRuns((run) => {
            if (on)
                delete run.underline;
            else
                run.underline = style;
        });
    }
    function toggleVert(value) {
        const runs = targetRuns();
        const on = runs.length > 0 && runs.every((run) => run.vertAlign === value);
        applyToRuns((run) => {
            if (on)
                delete run.vertAlign;
            else
                run.vertAlign = value;
        });
    }
    function highlight(color) {
        applyToRuns((run) => {
            if (!color)
                delete run.highlight;
            else
                run.highlight = color;
        });
    }
    function fontSize(pixels) {
        if (!Number.isFinite(pixels) || pixels <= 0)
            return;
        applyToRuns((run) => {
            run.fontSize = pixels;
            // Complex text paints the complex-script size, so the size the user sets has to land there too.
            if (holdsComplex(run.text))
                run.fontSizeCs = pixels;
        });
    }
    function stepFont(direction) {
        const currentSize = textRuns(current())[0]?.fontSize ?? 11;
        const next = SIZES.filter((size) => (direction > 0 ? size > currentSize : size < currentSize)).at(direction > 0 ? 0 : -1);
        if (next)
            fontSize(next);
    }
    function font(name) {
        applyToRuns((run) => {
            if (name) {
                run.font = name;
                // Complex text paints the east-asian face first, so a chosen face replaces both.
                if (holdsComplex(run.text))
                    run.fontEastAsia = name;
            }
            else {
                delete run.font;
                delete run.fontEastAsia;
            }
        });
    }
    function color(value) {
        applyToRuns((run) => {
            if (value)
                run.color = value;
            else
                delete run.color;
        });
    }
    function clearFormat() {
        const items = chosenParagraphs();
        if (!items.length)
            return;
        if (!remember())
            return;
        for (const item of items) {
            delete item.align;
            delete item.spacing;
            delete item.indent;
            delete item.shading;
            delete item.numbering;
            for (const run of textRuns(item)) {
                const text = run.text;
                const image = run.image;
                const bytes = run.imageBytes;
                const type = run.imageType;
                for (const key of Object.keys(run))
                    delete run[key];
                run.text = text;
                if (image) {
                    run.image = image;
                    if (bytes)
                        run.imageBytes = bytes;
                    if (type)
                        run.imageType = type;
                }
            }
        }
        finish();
    }
    function align(value) {
        const items = chosenParagraphs();
        if (!items.length)
            return;
        if (!remember())
            return;
        for (const item of items) {
            if (value === "left")
                delete item.align;
            else
                item.align = value;
        }
        finish();
    }
    function alignOn(value) {
        return (current()?.align ?? "left") === value;
    }
    function indent(direction) {
        const items = chosenParagraphs();
        if (!items.length)
            return;
        if (!remember())
            return;
        for (const item of items) {
            const left = Math.max(0, (item.indent?.left ?? 0) + direction * INDENT_STEP);
            item.indent = { ...item.indent, ...(left ? { left } : {}) };
            if (!left)
                delete item.indent.left;
            if (!item.indent.left && item.indent.right === undefined && item.indent.firstLine === undefined && item.indent.hanging === undefined) {
                delete item.indent;
            }
        }
        finish();
    }
    /** Sets one edge of the indent on every paragraph in the selection. A first line and a hanging indent cannot both stand. */
    function indentEdge(edge, twips) {
        if (!INDENT_EDGES.includes(edge) || !Number.isFinite(twips) || twips < 0)
            return;
        const items = chosenParagraphs();
        if (!items.length)
            return;
        if (!remember())
            return;
        for (const item of items) {
            const kept = { ...item.indent };
            if (edge === "firstLine")
                delete kept.hanging;
            if (edge === "hanging")
                delete kept.firstLine;
            if (twips)
                kept[edge] = Math.floor(twips);
            else
                delete kept[edge];
            if (kept.left !== undefined || kept.right !== undefined || kept.firstLine !== undefined || kept.hanging !== undefined)
                item.indent = kept;
            else
                delete item.indent;
        }
        finish();
    }
    /** The paragraphs the selection covers, or the one holding the caret when nothing is selected. */
    function chosenParagraphs() {
        const spanned = spannedParagraphs();
        if (spanned.length)
            return spanned;
        const item = current();
        return item ? [item] : [];
    }
    /** Paragraphs the browser selection crosses, in document order. One paragraph, or none, leaves it empty. */
    function spannedParagraphs() {
        const selection = root.ownerDocument.defaultView?.getSelection();
        if (!selection || selection.isCollapsed || selection.rangeCount === 0)
            return [];
        const range = selection.getRangeAt(0);
        const found = [];
        for (const node of root.querySelectorAll(".doc-paragraph")) {
            if (!range.intersectsNode(node))
                continue;
            const spot = spotFrom(node);
            const item = spot ? paragraphAt(spot) : undefined;
            if (item && !found.includes(item))
                found.push(item);
        }
        if (found.length < 2)
            return [];
        return found.map((item) => liveParagraph(item) ?? item);
    }
    /** The paragraph as the document holds it now. A redraw can move a block into an older page, so the node may point at a copy. */
    function liveParagraph(item) {
        for (const section of doc.sections) {
            for (const block of section.blocks) {
                if (!isDocTable(block) && isDocParagraph(block) && block.runs === item.runs)
                    return block;
                if (isDocTable(block)) {
                    for (const row of block.rows)
                        for (const cell of row) {
                            const match = cell.paragraphs.find((paragraph) => paragraph.runs === item.runs);
                            if (match)
                                return match;
                        }
                }
            }
        }
        return undefined;
    }
    function bullet() {
        toggleList([
            { text: "•", bullet: "•" },
            { text: "◦", bullet: "◦" },
            { text: "·", bullet: "·" },
        ]);
    }
    function number() {
        toggleList([{ text: "%1." }, { text: "%1.%2" }, { text: "%1.%2.%3" }]);
    }
    /**
     * Applies the list, one level deeper each time it is pressed on a paragraph that already has it.
     * Past the last level it comes off.
     */
    function toggleList(levels) {
        const item = current();
        if (!item)
            return;
        if (!remember())
            return;
        const id = localNumberingId(levels);
        const currentLevel = item.numbering?.id === id ? item.numbering.level : -1;
        const next = currentLevel + 1;
        if (next >= levels.length)
            delete item.numbering;
        else
            item.numbering = { id, level: next };
        finish();
    }
    /** A numbering id Word can store. The same definition shares one id across the document. */
    function localNumberingId(levels) {
        const table = doc.numbering ?? {};
        const same = (known) => known?.length === levels.length && known.every((level, index) => level.text === levels[index]?.text && Boolean(level.bullet) === Boolean(levels[index]?.bullet));
        const known = Object.entries(table).find(([, defined]) => same(defined));
        if (known && /^\d+$/.test(known[0]))
            return known[0];
        let next = 1;
        while (table[String(next)])
            next += 1;
        doc.numbering = { ...table, [String(next)]: levels };
        return String(next);
    }
    function insertParagraph() {
        const section = currentSection();
        if (!remember())
            return;
        const at = bodyAt(section);
        section.blocks.splice(at + 1, 0, { runs: [{ text: "" }] });
        selected = { section: selected.section, block: at + 1 };
        finish();
    }
    function insertTable(rows = 2, cols = 2) {
        const section = currentSection();
        if (!remember())
            return;
        const cell = () => ({ paragraphs: [{ runs: [{ text: "" }] }] });
        const at = bodyAt(section);
        const table = { rows: Array.from({ length: rows }, () => Array.from({ length: cols }, cell)) };
        section.blocks.splice(at + 1, 0, table);
        selected = { section: selected.section, block: at + 1, row: 0, col: 0, para: 0 };
        finish();
    }
    function addRow() {
        const table = currentTable();
        if (!table)
            return;
        if (!remember())
            return;
        const cols = table.rows[0]?.length ?? 1;
        table.rows.splice((selected.row ?? table.rows.length - 1) + 1, 0, Array.from({ length: cols }, () => ({ paragraphs: [{ runs: [{ text: "" }] }] })));
        finish();
    }
    function addColumn() {
        const table = currentTable();
        if (!table)
            return;
        if (!remember())
            return;
        const at = (selected.col ?? 0) + 1;
        for (const row of table.rows)
            row.splice(at, 0, { paragraphs: [{ runs: [{ text: "" }] }] });
        finish();
    }
    function deleteRow() {
        const table = currentTable();
        if (!table || selected.row === undefined || table.rows.length < 2)
            return;
        if (!remember())
            return;
        table.rows.splice(selected.row, 1);
        selected = { ...selected, row: Math.min(selected.row, table.rows.length - 1) };
        finish();
    }
    function deleteColumn() {
        const table = currentTable();
        if (!table || selected.col === undefined || (table.rows[0]?.length ?? 0) < 2)
            return;
        if (!remember())
            return;
        for (const row of table.rows)
            row.splice(selected.col, 1);
        selected = { ...selected, col: Math.min(selected.col, (table.rows[0]?.length ?? 1) - 1) };
        finish();
    }
    function mergeCells(down = false) {
        const table = currentTable();
        if (!table || selected.row === undefined || selected.col === undefined)
            return;
        const cell = table.rows[selected.row]?.[selected.col];
        if (!cell)
            return;
        if (down) {
            const below = table.rows[selected.row + 1]?.[selected.col];
            if (!below)
                return;
            if (!remember())
                return;
            cell.vMerge = "restart";
            below.vMerge = "continue";
            cell.paragraphs.push(...below.paragraphs);
            below.paragraphs = [];
            finish();
            return;
        }
        const row = table.rows[selected.row];
        const next = row[selected.col + 1];
        if (!next)
            return;
        if (!remember())
            return;
        cell.span = (cell.span ?? 1) + (next.span ?? 1);
        cell.paragraphs.push(...next.paragraphs);
        row.splice(selected.col + 1, 1);
        finish();
    }
    async function insertImage(file) {
        const item = current();
        if (!item)
            return;
        const bytes = new Uint8Array(await file.arrayBuffer());
        const id = `rIdImg${Date.now()}`;
        const type = file.type || "image/png";
        const ext = type.split("/")[1] || "png";
        doc.source?.set(`word/media/${id}.${ext}`, bytes);
        const size = await imageSize(file);
        if (!remember())
            return;
        item.runs.push({ text: "", image: id, imageBytes: bytes, imageType: type, ...(size ?? {}) });
        finish();
    }
    function link(target) {
        const trimmed = target.trim();
        if (!trimmed)
            return;
        applyToRuns((run) => {
            run.link = trimmed;
        });
    }
    function unlink() {
        applyToRuns((run) => {
            delete run.link;
        });
    }
    function bookmark(name) {
        const trimmed = name.trim();
        if (!trimmed)
            return;
        const item = current();
        const run = textRuns(item)[0];
        if (!run)
            return;
        if (!remember())
            return;
        run.bookmark = trimmed;
        finish();
    }
    function pageSize(width, height) {
        const section = currentSection();
        if (!remember())
            return;
        section.page.width = width;
        section.page.height = height;
        section.page.landscape = width > height;
        finish();
    }
    function landscape() {
        const section = currentSection();
        if (!remember())
            return;
        const landscape = section.page.landscape !== true;
        section.page.landscape = landscape;
        if (landscape && section.page.width < section.page.height) {
            const width = section.page.width;
            section.page.width = section.page.height;
            section.page.height = width;
        }
        if (!landscape && section.page.width > section.page.height) {
            const width = section.page.width;
            section.page.width = section.page.height;
            section.page.height = width;
        }
        finish();
    }
    function margins(narrow, edge) {
        const section = currentSection();
        if (!remember())
            return;
        const chosen = edge ?? (narrow ? 720 : 1440);
        section.page.margin = { top: chosen, bottom: chosen, left: chosen, right: chosen };
        finish();
    }
    function columns(count) {
        const section = currentSection();
        if (!Number.isFinite(count))
            return;
        if (!remember())
            return;
        if (count > 1)
            section.page.columns = Math.floor(count);
        else {
            delete section.page.columns;
            delete section.page.columnSpace;
            delete section.page.columnSeparator;
        }
        finish();
    }
    /** Sets the gap between the current section's columns. A single column has no gap. */
    function columnSpace(twips) {
        const section = currentSection();
        if (!Number.isFinite(twips) || twips < 0 || (section.page.columns ?? 1) <= 1)
            return;
        if (!remember())
            return;
        if (twips)
            section.page.columnSpace = Math.floor(twips);
        else
            delete section.page.columnSpace;
        finish();
    }
    /** Gives each column its own width. Fewer widths than columns leaves the rest equal. */
    function columnWidths(widths) {
        const section = currentSection();
        if (!widths.every((width) => Number.isFinite(width) && width > 0))
            return;
        if (!remember())
            return;
        if (widths.length) {
            section.page.columnWidths = widths.map((width) => Math.round(width));
            section.page.columns = Math.max(section.page.columns ?? 0, widths.length);
        }
        else {
            delete section.page.columnWidths;
        }
        finish();
    }
    /** Sets where the section's text sits. Top is the default and clears the setting. */
    function verticalAlign(align) {
        const section = currentSection();
        if (align !== "top" && align !== "center" && align !== "both" && align !== "bottom")
            return;
        if (!remember())
            return;
        if (align === "top")
            delete section.page.verticalAlign;
        else
            section.page.verticalAlign = align;
        finish();
    }
    /** Sets the document grid's line pitch. Zero clears the line pitch and leaves the character pitch. */
    function linePitch(pitch) {
        const section = currentSection();
        if (!Number.isFinite(pitch) || pitch < 0)
            return;
        if (!remember())
            return;
        setGrid(section, "linePitch", pitch);
        finish();
    }
    /** Sets the document grid's character pitch. Zero clears it. A negative pitch tightens the characters. */
    function charSpace(space) {
        const section = currentSection();
        if (!Number.isFinite(space))
            return;
        if (!remember())
            return;
        setGrid(section, "charSpace", space);
        finish();
    }
    /** Sets where the section's page numbers start and the format they use. */
    function pageNumberFormat(start, format) {
        const section = currentSection();
        if (!Number.isFinite(start) || start < 1)
            return;
        if (!remember())
            return;
        section.page.pageNumber = { start: Math.round(start), ...(format ? { format } : {}) };
        finish();
    }
    /** Draws a line between the current section's columns. A single column has none. */
    function columnSeparator(on) {
        const section = currentSection();
        if ((section.page.columns ?? 1) <= 1)
            return;
        if (!remember())
            return;
        if (on)
            section.page.columnSeparator = true;
        else
            delete section.page.columnSeparator;
        finish();
    }
    function pageColor(color) {
        const section = currentSection();
        if (!remember())
            return;
        if (color)
            section.page.background = color;
        else
            delete section.page.background;
        finish();
    }
    function pageBreak() {
        breakHere("page");
    }
    function columnBreak() {
        breakHere("column");
    }
    /** A page break starts a new page. A column break starts the next column, and a new page in a single column. */
    function breakHere(kind) {
        const section = currentSection();
        if (!remember())
            return;
        const at = bodyAt(section);
        const next = kind === "page" || (section.page.columns ?? 1) <= 1
            ? { runs: [{ text: "" }], pageBreakBefore: true }
            : { runs: [{ text: "", breakBefore: "column" }] };
        section.blocks.splice(at + 1, 0, next);
        selected = { section: selected.section, block: at + 1 };
        finish();
    }
    function find(query) {
        const needle = query.trim().toLowerCase();
        hits = [];
        hitIndex = 0;
        for (const node of root.querySelectorAll(".doc-paragraph")) {
            const hit = needle.length > 0 && (node.textContent ?? "").toLowerCase().includes(needle);
            node.classList.toggle("is-hit", hit);
            if (hit)
                hits.push(node);
        }
        hits[0]?.scrollIntoView?.({ block: "nearest" });
        if (hits[0])
            hits[0].classList.add("is-current-hit");
        return hits.length;
    }
    function findNext() {
        if (!hits.length)
            return;
        hits[hitIndex]?.classList.remove("is-current-hit");
        hitIndex = (hitIndex + 1) % hits.length;
        const node = hits[hitIndex];
        node?.classList.add("is-current-hit");
        node?.scrollIntoView?.({ block: "nearest" });
        const spot = spotFrom(node);
        if (spot)
            selected = spot;
    }
    function replace(query, replacement) {
        const needle = query.trim();
        if (!needle)
            return 0;
        const paragraphs = [...paragraphsOf(currentSection().blocks)];
        const start = paragraphs.indexOf(current() ?? paragraphs[0]);
        const ordered = start < 0 ? paragraphs : [...paragraphs.slice(start), ...paragraphs.slice(0, start)];
        for (const paragraph of ordered) {
            for (const run of textRuns(paragraph)) {
                const at = run.text.indexOf(needle);
                if (at < 0)
                    continue;
                if (!remember())
                    return 0;
                run.text = run.text.slice(0, at) + replacement + run.text.slice(at + needle.length);
                finish();
                return 1;
            }
        }
        return 0;
    }
    function replaceAll(query, replacement) {
        const needle = query.trim();
        if (!needle)
            return 0;
        if (!remember())
            return 0;
        let count = 0;
        for (const section of doc.sections) {
            for (const paragraph of paragraphsOf(section.blocks)) {
                for (const run of textRuns(paragraph)) {
                    if (!run.text.includes(needle))
                        continue;
                    const hits = run.text.split(needle).length - 1;
                    run.text = run.text.split(needle).join(replacement);
                    count += hits;
                }
            }
        }
        if (count)
            finish();
        return count;
    }
    function selectAll() {
        const pages = [...root.querySelectorAll(".doc-page")];
        const selection = root.ownerDocument.defaultView?.getSelection();
        const first = pages[0];
        const last = pages.at(-1);
        if (!first || !last || !selection)
            return;
        const range = root.ownerDocument.createRange();
        range.setStart(first, 0);
        range.setEnd(last, last.childNodes.length);
        selection.removeAllRanges();
        selection.addRange(range);
    }
    function wordCount() {
        const text = storyText();
        const chars = text.replace(/\s/g, "").length;
        const words = text.trim() ? text.trim().split(/\s+/).length : 0;
        options.onStatus?.(zh ? `${chars} 字，${words} 词` : `${words} words, ${chars} characters`);
    }
    function speak() {
        const text = storyText().trim();
        if (!text) {
            options.onStatus?.(zh ? "没有可朗读的文字" : "Nothing to read");
            return;
        }
        const synth = window.speechSynthesis;
        if (!synth) {
            options.onStatus?.(zh ? "这个环境不能朗读" : "Speech is not available");
            return;
        }
        synth.cancel();
        synth.speak(new SpeechSynthesisUtterance(text.slice(0, 800)));
        options.onStatus?.(zh ? "正在朗读" : "Reading");
    }
    async function copy() {
        const runs = copiedRuns();
        if (!runs.length)
            return;
        clipped = runs.map((run) => ({ ...run }));
        await writeClipboard(root.ownerDocument.defaultView, clipped.map((run) => run.text).join(""), clipHtml(clipped));
    }
    async function cut() {
        const item = current();
        const runs = copiedRuns();
        if (!item || !runs.length)
            return;
        clipped = runs.map((run) => ({ ...run }));
        const range = selectedRange();
        await writeClipboard(root.ownerDocument.defaultView, clipped.map((run) => run.text).join(""), clipHtml(clipped));
        if (!remember())
            return;
        if (range && selected.run !== undefined) {
            const run = item.runs[selected.run];
            if (run)
                run.text = run.text.slice(0, range.start) + run.text.slice(range.end);
        }
        else {
            item.runs = [{ text: "" }];
        }
        finish();
    }
    async function paste() {
        const item = current();
        if (!item)
            return;
        const view = root.ownerDocument.defaultView;
        const fromClip = clipped.length ? clipped.map((run) => ({ ...run })) : undefined;
        const html = fromClip ? undefined : await readClipboardHtml(view);
        const runs = fromClip ?? (html ? clipRuns(html) : [{ text: await readClipboard(view) }]);
        if (runs.every((run) => !run.text))
            return;
        if (!remember())
            return;
        const empty = item.runs.length === 1 && !item.runs[0]?.text;
        item.runs = empty ? runs : [...item.runs, ...runs];
        finish();
    }
    /** The runs a copy takes: the characters selected inside one run, or every text run of the current paragraph. */
    function copiedRuns() {
        const item = current();
        if (!item)
            return [];
        const range = selectedRange();
        if (!range || selected.run === undefined)
            return textRuns(item).map((run) => ({ ...run }));
        const run = item.runs[selected.run];
        if (!run)
            return [];
        return [{ ...run, text: run.text.slice(range.start, range.end) }];
    }
    function applyToRuns(change) {
        const item = current();
        const range = selectedRange();
        if (item && range) {
            if (!remember())
                return;
            change(sliceRun(item, range));
            finish();
            return;
        }
        const runs = targetRuns();
        if (!runs.length)
            return;
        if (!remember())
            return;
        for (const run of runs)
            change(run);
        finish();
    }
    /** The characters the user has selected inside the current run, counted in that run's text. */
    function selectedRange() {
        if (selected.run === undefined)
            return undefined;
        const selection = root.ownerDocument.defaultView?.getSelection();
        if (!selection || selection.isCollapsed || selection.rangeCount === 0)
            return undefined;
        const where = selected.story ? `[data-story="${selected.story}"]${selected.storyKind ? `[data-story-kind="${selected.storyKind}"]` : ""}` : ":not([data-story])";
        const node = root.querySelector(`[data-section="${selected.section}"][data-block="${selected.block}"]${where} [data-run="${selected.run}"]`);
        const range = selection.getRangeAt(0);
        if (!node || !node.contains(range.startContainer) || !node.contains(range.endContainer))
            return undefined;
        const start = offsetWithin(node, range.startContainer, range.startOffset);
        const end = offsetWithin(node, range.endContainer, range.endOffset);
        if (start === end)
            return undefined;
        return { start: Math.min(start, end), end: Math.max(start, end) };
    }
    /** Splits the current run so only the selected characters carry the new formatting. */
    function sliceRun(item, range) {
        const index = selected.run ?? 0;
        const run = item.runs[index];
        if (!run)
            return { text: "" };
        const before = run.text.slice(0, range.start);
        const middle = run.text.slice(range.start, range.end);
        const after = run.text.slice(range.end);
        const picked = { ...run, text: middle };
        const runs = [];
        if (before)
            runs.push({ ...run, text: before });
        runs.push(picked);
        if (after)
            runs.push({ ...run, text: after });
        item.runs.splice(index, 1, ...runs);
        selected = { ...selected, run: index + (before ? 1 : 0) };
        return picked;
    }
    /** The run the caret is in, or every text run of the paragraph when none is focused. */
    function targetRuns() {
        const item = current();
        if (!item)
            return [];
        const runs = textRuns(item);
        if (selected.run === undefined)
            return runs;
        const run = item.runs[selected.run];
        return run && !run.image ? [run] : runs;
    }
    function current() {
        return paragraphAt(selected);
    }
    function paragraphAt(spot) {
        const section = doc.sections[spot.section];
        if (spot.story && section) {
            const stories = spot.story === "header"
                ? { default: section.header, first: section.firstHeader, even: section.evenHeader }
                : { default: section.footer, first: section.firstFooter, even: section.evenFooter };
            return stories[spot.storyKind ?? "default"]?.[spot.block];
        }
        const block = section?.blocks[spot.block];
        if (!block)
            return undefined;
        if (isDocRaw(block))
            return spot.control === undefined ? undefined : block.content?.[spot.control];
        if (isDocParagraph(block))
            return block;
        if (spot.row === undefined || spot.col === undefined || spot.para === undefined)
            return undefined;
        return block.rows[spot.row]?.[spot.col]?.paragraphs[spot.para];
    }
    function currentTable() {
        const block = doc.sections[selected.section]?.blocks[selected.block];
        return block && isDocTable(block) ? block : undefined;
    }
    function currentSection() {
        return doc.sections[selected.section] ?? doc.sections[0];
    }
    /** Where a new body block goes. A caret in the header or footer is not a body index. */
    function bodyAt(section) {
        const last = Math.max(0, section.blocks.length - 1);
        if (selected.story)
            return last;
        return Math.min(selected.block, last);
    }
    function storyText() {
        const parts = [];
        for (const section of doc.sections) {
            for (const paragraph of paragraphsOf(section.blocks))
                parts.push(paragraph.runs.map((run) => run.text).join(""));
        }
        return parts.join("\n");
    }
    function finish() {
        touch();
        render();
        options.onSelection?.();
    }
    /** Records an edit and redraws, unless the document is protected. */
    function change(edit) {
        if (doc.readOnly)
            return;
        if (!remember())
            return;
        edit();
        finish();
    }
    function touch() {
        doc.edited = true;
        options.onChange?.();
    }
    function arm() {
        if (armed)
            return;
        if (!remember())
            return;
        armed = true;
    }
    /** Records the state before an edit. A protected document records nothing, so the caller stops. */
    function remember() {
        if (doc.readOnly)
            return false;
        history.undo.push(snapshot());
        if (history.undo.length > 50)
            history.undo.shift();
        history.redo.length = 0;
        return true;
    }
    function snapshot() {
        return {
            sections: JSON.stringify(doc.sections),
            numbering: JSON.stringify(doc.numbering ?? {}),
            sources: JSON.stringify(doc.sources ?? []),
            recipients: JSON.stringify(doc.recipients ?? []),
            tracking: doc.tracking === true,
            hyphenation: doc.hyphenation === true,
            view: JSON.stringify(doc.view ?? null),
            zoom: JSON.stringify(doc.zoom ?? null),
            mailMerge: JSON.stringify(doc.mailMerge ?? null),
            comments: JSON.stringify(doc.comments ?? []),
        };
    }
    /** Accepts the change the caret is in, or every change when the caret is not in one. */
    function acceptChange() {
        return settleChanges(true);
    }
    function rejectChange() {
        return settleChanges(false);
    }
    function settleChanges(accept) {
        const here = current();
        const run = here && selected.run !== undefined ? here.runs[selected.run] : undefined;
        const targeted = run && (run.inserted || run.deleted);
        const paragraphs = targeted && here ? [here] : doc.sections.flatMap((section) => section.blocks.filter(isDocParagraph));
        let count = 0;
        if (!remember())
            return 0;
        for (const paragraph of paragraphs) {
            paragraph.runs = paragraph.runs.filter((item) => {
                if (targeted && item !== run)
                    return true;
                if (item.inserted) {
                    count += 1;
                    if (accept) {
                        delete item.inserted;
                        delete item.raw;
                        return true;
                    }
                    return false;
                }
                if (item.deleted) {
                    count += 1;
                    if (!accept) {
                        delete item.deleted;
                        delete item.raw;
                        return true;
                    }
                    return false;
                }
                return true;
            });
            if (!paragraph.runs.length)
                paragraph.runs.push({ text: "" });
        }
        if (!count)
            history.undo.pop();
        else
            finish();
        return count;
    }
    /** Insertions and deletions against the story as it was when editing started. */
    function compare() {
        const opened = openedText();
        const now = storyText();
        if (opened === now)
            return [];
        const lines = [];
        for (const line of now.split("\n"))
            if (line && !opened.split("\n").includes(line))
                lines.push(`+ ${line}`);
        for (const line of opened.split("\n"))
            if (line && !now.split("\n").includes(line))
                lines.push(`- ${line}`);
        return lines;
    }
    function openedText() {
        const saved = history.undo[0];
        if (!saved)
            return storyText();
        const sections = JSON.parse(saved.sections);
        return sections
            .flatMap((section) => section.blocks.filter(isDocParagraph))
            .map((paragraph) => paragraph.runs.filter((run) => !run.deleted).map((run) => run.text).join(""))
            .join("\n");
    }
    function contents() {
        const pages = pageOfBlock();
        const entries = tableOfContents(doc, pages);
        if (!remember())
            return entries.length;
        const lines = entries.map((entry) => ({ runs: [{ text: `${entry.text}  ${entry.page}`, field: `TOC \\o "1-3" \\h` }] }));
        replaceGenerated("TOC", lines.length ? lines : [{ runs: [{ text: zh ? "（没有标题）" : "(no headings)", field: `TOC \\o "1-3" \\h` }] }]);
        finish();
        return entries.length;
    }
    function caption(kind) {
        const item = current();
        const name = kind.trim();
        if (!item || !name)
            return;
        if (!remember())
            return;
        item.caption = name;
        const count = doc.sections.flatMap((section) => section.blocks.filter(isDocParagraph)).filter((paragraph) => paragraph.caption === name).length;
        const body = textRuns(item).map((run) => run.text).join("").replace(new RegExp(`^${name} \\d+\\s*`), "");
        writeText(item, `${name} ${count} ${body}`.trim());
        finish();
    }
    function referenceTargets() {
        const targets = [];
        for (const section of doc.sections) {
            for (const block of section.blocks) {
                if (!isDocParagraph(block))
                    continue;
                if (block.caption)
                    targets.push(textRuns(block).map((run) => run.text).join("").trim());
                else if (headingLevel(block))
                    targets.push(textRuns(block).map((run) => run.text).join("").trim());
            }
        }
        return targets.filter(Boolean);
    }
    function crossReference(target) {
        const item = current();
        const name = target.trim();
        if (!item || !name)
            return;
        if (!remember())
            return;
        item.runs.push({ text: name, field: `REF "${name}" \\h` });
        finish();
    }
    function addSource(source) {
        const tag = source.tag.trim() || `ref${(doc.sources?.length ?? 0) + 1}`;
        if (!remember())
            return "";
        doc.sources = [...(doc.sources ?? []).filter((item) => item.tag !== tag), { ...source, tag }];
        finish();
        return tag;
    }
    function cite(tag, pages) {
        const item = current();
        if (!item || !tag.trim())
            return;
        const citation = { source: tag.trim(), ...(pages?.trim() ? { pages: pages.trim() } : {}) };
        if (!remember())
            return;
        item.runs.push({ text: citationText(doc.sources, citation), field: `CITATION ${citation.source}${citation.pages ? ` \\p ${citation.pages}` : ""}`, citation });
        finish();
    }
    function bibliography() {
        const lines = bibliographyLines(doc.sources);
        if (!remember())
            return lines.length;
        replaceGenerated("BIBLIOGRAPHY", (lines.length ? lines : [zh ? "（没有文献）" : "(no sources)"]).map((line) => ({ runs: [{ text: line, field: "BIBLIOGRAPHY" }] })));
        finish();
        return lines.length;
    }
    function indexEntry(see) {
        const item = current();
        const run = item ? textRuns(item)[selected.run ?? 0] : undefined;
        const term = run?.text.trim();
        if (!run || !term)
            return;
        if (!remember())
            return;
        run.indexEntry = { text: term, ...(see?.trim() ? { see: see.trim() } : {}) };
        run.field = `XE "${term}"${see?.trim() ? ` \\t "${see.trim()}"` : ""}`;
        finish();
    }
    function insertIndex() {
        const lines = indexLines(doc, pageOfBlock());
        if (!remember())
            return lines.length;
        const entries = lines.map((entry) => ({ runs: [{ text: entry.see ? `${entry.term}, see ${entry.see}` : `${entry.term}, ${entry.pages.join(", ")}`, field: "INDEX \\h" }] }));
        replaceGenerated("INDEX", entries.length ? entries : [{ runs: [{ text: zh ? "（没有索引项）" : "(no index entries)", field: "INDEX \\h" }] }]);
        finish();
        return lines.length;
    }
    function addRecipient(fields) {
        const clean = Object.fromEntries(Object.entries(fields).map(([key, value]) => [key.trim(), value.trim()]).filter(([key]) => key));
        if (!Object.keys(clean).length)
            return;
        if (!remember())
            return;
        doc.recipients = [...(doc.recipients ?? []), { fields: clean }];
        finish();
    }
    function recipientFields() {
        const names = new Set();
        for (const recipient of doc.recipients ?? [])
            for (const name of Object.keys(recipient.fields))
                names.add(name);
        for (const section of doc.sections) {
            for (const block of section.blocks) {
                if (!isDocParagraph(block))
                    continue;
                for (const run of block.runs)
                    if (run.field?.trim().startsWith("MERGEFIELD"))
                        names.add(mergeFieldName(run.field));
            }
        }
        return [...names];
    }
    /** Records the mail merge. Only the document types and data types Word stores are kept. */
    function setMailMerge(kind, data, source, link) {
        const document = kind.trim();
        if (document && !MERGE_KINDS.includes(document))
            return;
        const stored = data?.trim();
        if (stored && !MERGE_DATA.includes(stored))
            return;
        if (!remember())
            return;
        if (!document) {
            delete doc.mailMerge;
        }
        else {
            doc.mailMerge = {
                document,
                ...(stored ? { data: stored } : {}),
                ...(source?.trim() ? { source: source.trim() } : {}),
                ...(link?.trim() ? { link: link.trim() } : {}),
            };
        }
        finish();
    }
    /** A plain-text content control, so its paragraph can be edited and the control written back around it. */
    function contentControl(text) {
        const value = text.trim();
        if (!value)
            return;
        const section = currentSection();
        if (!remember())
            return;
        section.blocks.splice(bodyAt(section) + 1, 0, {
            raw: "",
            text: value,
            content: [{ runs: [{ text: value }] }],
            control: `<sdtPr><text/></sdtPr>`,
        });
        finish();
    }
    function mergeField(name) {
        const item = current();
        const column = name.trim();
        if (!item || !column)
            return;
        if (!remember())
            return;
        item.runs.push({ text: `«${column}»`, field: `MERGEFIELD ${column}` });
        finish();
    }
    function merge() {
        return mergedCopies(doc);
    }
    /** The address block of an envelope: one line per recipient, then a return address. */
    function envelope() {
        const item = current();
        if (!item)
            return;
        const fields = recipientFields();
        if (!remember())
            return;
        const address = fields.map((name) => `«${name}»`).join("\n") || (zh ? "（没有收件人）" : "(no recipients)");
        writeText(item, address);
        item.runs = fields.length
            ? fields.map((name) => ({ text: `«${name}»\n`, field: `MERGEFIELD ${name}` }))
            : [{ text: address }];
        finish();
    }
    /** One paragraph per recipient, its merge fields already filled in, so each can be printed as a label. */
    function labels() {
        const copies = mergedCopies(doc);
        if (!copies.length)
            return 0;
        const section = currentSection();
        if (!remember())
            return copies.length;
        const at = bodyAt(section);
        const blocks = copies.map((copy) => ({ runs: [{ text: copy }] }));
        section.blocks.splice(at + 1, 0, ...blocks);
        finish();
        return copies.length;
    }
    /** Replaces a generated block (the paragraphs whose field starts with `kind`) or inserts one at the caret. */
    function replaceGenerated(kind, blocks) {
        const first = doc.sections[selected.section] ?? doc.sections[0];
        for (const section of doc.sections) {
            const start = section.blocks.findIndex((block) => isDocParagraph(block) && block.runs.some((run) => run.field?.trim().startsWith(kind)));
            if (start < 0)
                continue;
            let end = start;
            while (end < section.blocks.length) {
                const block = section.blocks[end];
                if (!isDocParagraph(block) || !block.runs.some((run) => run.field?.trim().startsWith(kind)))
                    break;
                end += 1;
            }
            section.blocks.splice(start, end - start, ...blocks);
            return;
        }
        first.blocks.splice(bodyAt(first) + 1, 0, ...blocks);
    }
    /** The page each block falls on, in document order, so a table of contents can name its pages. */
    function pageOfBlock() {
        return pageNumbers(paginate(doc));
    }
    /** Inserts a PAGE field at the caret. Rendering fills in the number. */
    function insertPageNumber() {
        const item = current();
        if (!item)
            return;
        if (!remember())
            return;
        item.runs.push({ text: "", field: "PAGE" });
        finish();
    }
    /** A formula built from the words the user typed. Each word is its own text node, so editing one writes back into that node. */
    function equation(kind, words) {
        const parts = words.map((word) => word.trim()).filter(Boolean);
        if (!parts.length)
            return;
        const section = currentSection();
        if (!remember())
            return;
        const built = formulaMarkup(kind, parts);
        section.blocks.splice(bodyAt(section) + 1, 0, { raw: built.raw, text: parts.join(""), formula: built.pieces });
        finish();
    }
    /** Puts a `=SUM(LEFT)` formula in the current cell. Rendering fills in the total. */
    function insertFormula() {
        const table = currentTable();
        const item = current();
        if (!table || !item || selected.row === undefined || selected.col === undefined)
            return;
        if (!remember())
            return;
        item.runs = [{ text: "", field: "=SUM(LEFT)" }];
        finish();
    }
    /** Names the current paragraph with a style, so it picks up that style's formatting. */
    function applyStyle(name) {
        const item = current();
        if (!item)
            return;
        if (!remember())
            return;
        item.style = name;
        finish();
    }
    /** The first call copies the current run's formatting. The next applies it and clears the copy. */
    function paint() {
        if (!painted) {
            const run = targetRuns()[0];
            if (run)
                painted = { ...run };
            return;
        }
        const copied = painted;
        painted = undefined;
        applyToRuns((run) => {
            copyStyle(copied, run);
        });
    }
    /** Sets one character measure. A value of 0 or 100 clears it, since that is the same as unset. */
    function setRun(key, value) {
        if (!Number.isFinite(value))
            return;
        applyToRuns((run) => {
            if (!value || (key === "scale" && value === 100))
                delete run[key];
            else
                run[key] = value;
        });
    }
    /** Adds a tab stop to the current paragraph. One at the same position replaces the old alignment and leader. */
    function tabStop(pos, align = "left", leader) {
        const item = current();
        if (!item || !Number.isFinite(pos))
            return;
        if (!remember())
            return;
        const tabs = (item.tabs ?? []).filter((tab) => tab.pos !== pos);
        const stop = align === "left" ? { pos } : { pos, align };
        tabs.push(leader ? { ...stop, leader } : stop);
        item.tabs = tabs.sort((a, b) => a.pos - b.pos);
        finish();
    }
    /** A cover is a title page of its own, with a header that only the first page shows. */
    function cover(title) {
        const section = currentSection();
        if (!remember())
            return;
        section.titlePage = true;
        section.firstHeader = [{ runs: [{ text: title, bold: true, fontSize: 32 }] }];
        section.blocks.unshift({ runs: [{ text: title, bold: true, fontSize: 28 }] }, { runs: [{ text: "" }], pageBreakBefore: true });
        finish();
    }
    /** A rectangle with a label, kept as a drawing so it round-trips. */
    function shape(label) {
        insertDrawing("rect", label, 1828800, 914400);
    }
    /** An icon is a preset geometry with no label. */
    function icon(name) {
        const preset = /^[a-zA-Z]+$/.test(name) ? name : "rect";
        insertDrawing(preset, preset, 457200, 457200);
    }
    /** One labeled box per item, kept as one drawing. */
    function smartArt(labels) {
        const text = labels.filter(Boolean).join(" ");
        if (!text)
            return;
        insertDrawing("rect", text, 5486400, 914400);
    }
    /** One bar per value, kept as a drawing whose bars are the numbers. */
    function chart(values) {
        const bars = values.filter((value) => Number.isFinite(value));
        if (!bars.length)
            return;
        insertDrawing("rect", bars.join(" "), 3657600, 1828800);
    }
    function insertDrawing(preset, label, width, height) {
        const section = currentSection();
        if (!remember())
            return;
        const raw = `<w:p><w:r><w:drawing><wp:anchor><wp:extent cx="${width}" cy="${height}"/><a:graphic><a:graphicData><wps:wsp><wps:spPr><a:prstGeom prst="${preset}"/></wps:spPr><wps:txbx><w:txbxContent><w:p><w:r><w:t>${escapeXml(label)}</w:t></w:r></w:p></w:txbxContent></wps:txbx></wps:wsp></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r></w:p>`;
        section.blocks.splice(bodyAt(section) + 1, 0, { raw, text: label });
        finish();
    }
    /** Anchors a comment at the caret run and records it on the document. */
    function addComment(text) {
        const item = current();
        const id = nextCommentId();
        if (!remember())
            return "";
        doc.comments = [...(doc.comments ?? []), { id, author: "", text }];
        if (item) {
            const run = item.runs[selected.run ?? item.runs.length - 1];
            if (run)
                run.comment = id;
        }
        finish();
        return id;
    }
    function nextCommentId() {
        const used = (doc.comments ?? []).map((item) => Number(item.id) || 0);
        return String(Math.max(0, ...used) + 1);
    }
    /** Orders the current paragraph's lines. A single line sorts its words instead. */
    function sort(ascending = true) {
        const item = current();
        if (!item)
            return;
        if (!remember())
            return;
        const text = item.runs.map((run) => run.text).join("");
        const lines = text.split("\n");
        const parts = lines.length > 1 ? lines : text.split(/\s+/).filter(Boolean);
        const ordered = [...parts].sort((left, right) => left.localeCompare(right));
        if (!ascending)
            ordered.reverse();
        writeText(item, lines.length > 1 ? ordered.join("\n") : ordered.join(" "));
        finish();
    }
    /** Sets the line spacing of the current paragraph. Zero clears it and leaves the space before and after. */
    function lineSpacing(line, rule = "auto") {
        const item = current();
        if (!item || !Number.isFinite(line) || line < 0 || (rule !== "auto" && rule !== "exact" && rule !== "atLeast"))
            return;
        if (!remember())
            return;
        const spacing = { ...item.spacing };
        if (line) {
            spacing.line = line;
            spacing.lineRule = rule;
        }
        else {
            delete spacing.line;
            delete spacing.lineRule;
        }
        if (spacing.before !== undefined || spacing.after !== undefined || spacing.line !== undefined)
            item.spacing = spacing;
        else
            delete item.spacing;
        finish();
    }
    /** Sets the space before and after the current paragraph. */
    function paragraphSpacing(before, after) {
        const item = current();
        if (!item)
            return;
        if (!remember())
            return;
        item.spacing = { ...item.spacing, before, after };
        finish();
    }
    /** Shades the current paragraph, or clears it when no color is given. */
    function shading(color) {
        const item = current();
        if (!item)
            return;
        if (!remember())
            return;
        if (color)
            item.shading = color;
        else
            delete item.shading;
        finish();
    }
    /** Shades the selected runs, or clears the shading when no color is given. */
    function runShading(color) {
        applyToRuns((run) => {
            if (color)
                run.shading = color;
            else
                delete run.shading;
        });
    }
    /** Starts the current paragraph on a new page, or clears that. */
    function pageBreakBefore(on) {
        const item = current();
        if (!item)
            return;
        if (!remember())
            return;
        if (on)
            item.pageBreakBefore = true;
        else
            delete item.pageBreakBefore;
        finish();
    }
    /** Sits the current paragraph's line on its baseline. An empty value clears it. */
    function baseline(align) {
        const item = current();
        if (!item || (align !== "" && align !== "top" && align !== "center" && align !== "baseline" && align !== "bottom"))
            return;
        if (!remember())
            return;
        if (align)
            item.textAlign = align;
        else
            delete item.textAlign;
        finish();
    }
    /** Fits the selected runs into this width, in twips. Zero clears it. */
    function fitText(width) {
        if (!Number.isFinite(width) || width < 0)
            return;
        applyToRuns((run) => {
            if (width)
                run.fitText = Math.round(width);
            else
                delete run.fitText;
        });
    }
    /** Sets the selected runs' east-asian layout, keeping a layout id the file already carried. An empty mode clears it. */
    function eastAsian(mode) {
        if (mode !== "" && mode !== "combine" && mode !== "vert" && mode !== "twoInOne")
            return;
        applyToRuns((run) => {
            if (!mode) {
                delete run.eastAsianLayout;
                return;
            }
            const id = run.eastAsianLayout?.id;
            run.eastAsianLayout = { ...(id ? { id } : {}), [mode]: true };
        });
    }
    /** Borders the selected runs, or clears the border when no color is given. The color goes on every side. */
    function runBorder(color) {
        applyToRuns((run) => {
            if (color)
                run.border = solidBorder(color);
            else
                delete run.border;
        });
    }
    /** Borders the current paragraph, or clears it when no color is given. The color goes on every side. */
    function border(color) {
        const item = current();
        if (!item)
            return;
        if (!remember())
            return;
        if (color)
            item.border = solidBorder(color);
        else
            delete item.border;
        finish();
    }
    /** An empty page is a page break, an empty paragraph, and another page break. */
    function blankPage() {
        const section = currentSection();
        if (!remember())
            return;
        const at = bodyAt(section);
        section.blocks.splice(at + 1, 0, { runs: [{ text: "" }], pageBreakBefore: true }, { runs: [{ text: "" }], pageBreakBefore: true });
        finish();
    }
    /** Inserts one character at the end of the current paragraph. */
    function symbol(char) {
        const item = current();
        if (!item || !char)
            return;
        if (!remember())
            return;
        item.runs.push({ text: char });
        finish();
    }
    /** Inserts the date and time as a DATE field, showing the text given. */
    function dateTime(value) {
        const item = current();
        if (!item)
            return;
        if (!remember())
            return;
        item.runs.push({ text: value, field: "DATE" });
        finish();
    }
    /** A text box is a drawing whose text can be edited. */
    function textBox(value) {
        if (!value)
            return;
        insertDrawing("rect", value, 3657600, 914400);
    }
    /** Makes the current section run right to left. */
    function sectionBidi(on) {
        const section = currentSection();
        if (!remember())
            return;
        if (on)
            section.page.bidi = true;
        else
            delete section.page.bidi;
        finish();
    }
    /** Puts the gutter on the right side of the page. */
    function rtlGutter(on) {
        const section = currentSection();
        if (!remember())
            return;
        if (on)
            section.page.rtlGutter = true;
        else
            delete section.page.rtlGutter;
        finish();
    }
    /** Prints endnotes at the end of this section instead of the document. */
    function endnotesHere(on) {
        const section = currentSection();
        if (!remember())
            return;
        if (on)
            section.page.endnotesHere = true;
        else
            delete section.page.endnotesHere;
        finish();
    }
    /** Sets where footnotes and endnotes start counting. Zero clears that one. */
    function noteStart(footnote, endnote) {
        const section = currentSection();
        if (!remember())
            return;
        const notes = { ...section.page.notes };
        if (footnote)
            notes.footnoteStart = Math.round(footnote);
        else
            delete notes.footnoteStart;
        if (endnote)
            notes.endnoteStart = Math.round(endnote);
        else
            delete notes.endnoteStart;
        if (notes.footnoteStart !== undefined || notes.footnoteRestart || notes.endnoteStart !== undefined || notes.endnoteRestart)
            section.page.notes = notes;
        else
            delete section.page.notes;
        finish();
    }
    /** Sets the gutter and how far the header and footer sit from the page edge. */
    function pageEdges(gutter, header, footer) {
        const section = currentSection();
        if (!remember())
            return;
        if (gutter > 0)
            section.page.gutter = gutter;
        else
            delete section.page.gutter;
        section.page.headerDistance = header;
        section.page.footerDistance = footer;
        finish();
    }
    /** Turns line numbering on or off for the current section. */
    function lineNumbers(on) {
        const section = currentSection();
        if (!remember())
            return;
        if (on)
            section.page.lineNumbers = true;
        else {
            delete section.page.lineNumbers;
            delete section.page.lineStart;
        }
        finish();
    }
    /** Sets the number the section's first line gets. One is the ordinary start. */
    function lineStart(start) {
        const section = currentSection();
        if (!Number.isFinite(start) || start < 1)
            return;
        if (!remember())
            return;
        section.page.lineNumbers = true;
        if (start === 1)
            delete section.page.lineStart;
        else
            section.page.lineStart = Math.floor(start);
        finish();
    }
    /** Colors the underline, or lets it follow the text when no color is given. */
    function underlineColor(color) {
        applyToRuns((run) => {
            if (color) {
                run.underline = run.underline ?? "single";
                run.underlineColor = color;
            }
            else {
                delete run.underlineColor;
            }
        });
    }
    /** Drops line numbers from the current paragraph, or numbers it again. */
    function noLineNumbers(on) {
        const item = current();
        if (!item)
            return;
        if (!remember())
            return;
        if (on)
            item.noLineNumbers = true;
        else
            delete item.noLineNumbers;
        finish();
    }
    /** Borders the page, or clears it when no color is given. The color goes on every side. */
    function pageBorder(color) {
        const section = currentSection();
        if (!remember())
            return;
        if (color)
            section.page.border = solidBorder(color);
        else
            delete section.page.border;
        finish();
    }
    /** Sets how text flows in the current section. */
    function direction(flow) {
        const section = currentSection();
        if (!remember())
            return;
        if (flow === "lr")
            delete section.page.direction;
        else
            section.page.direction = flow;
        finish();
    }
    /** A watermark is faint text in the header. An empty text removes it. */
    function watermark(value) {
        const section = currentSection();
        if (!remember())
            return;
        const kept = section.header.filter((paragraph) => !paragraph.runs.some((run) => run.watermark));
        section.header = value ? [...kept, { runs: [{ text: value, watermark: true, color: "#d0d0d0", fontSize: 48 }] }] : kept;
        finish();
    }
    /** Starts a new section at the caret, copying the current page setup. */
    function sectionBreak(kind = "nextPage") {
        if (!SECTION_STARTS.includes(kind))
            return;
        const section = currentSection();
        if (!remember())
            return;
        const at = bodyAt(section);
        const moved = section.blocks.splice(at + 1);
        const page = { ...section.page, margin: { ...section.page.margin } };
        if (kind === "nextPage")
            delete page.break;
        else
            page.break = kind;
        const next = { page, header: [], footer: [], blocks: moved.length ? moved : [{ runs: [{ text: "" }] }] };
        doc.sections.splice(selected.section + 1, 0, next);
        selected = { section: selected.section + 1, block: 0 };
        finish();
    }
    /** Changes how the current section starts. The first section always starts the document. */
    function sectionStart(kind) {
        if (!SECTION_STARTS.includes(kind) || selected.section === 0)
            return;
        const section = currentSection();
        if (!remember())
            return;
        if (kind === "nextPage")
            delete section.page.break;
        else
            section.page.break = kind;
        finish();
    }
    /** Sets every column of the current table to one width. */
    function columnWidth(width) {
        const table = currentTable();
        if (!table || !Number.isFinite(width) || width <= 0)
            return;
        if (!remember())
            return;
        const count = Math.max(...table.rows.map((row) => row.length), 0);
        table.widths = Array.from({ length: count }, () => width);
        finish();
    }
    /** Marks the current table's first row as a header row. */
    function headerRow(on) {
        const table = currentTable();
        if (!table)
            return;
        if (!remember())
            return;
        if (on)
            table.header = true;
        else
            delete table.header;
        finish();
    }
    /** Borders the current cell, or clears it when no color is given. The color goes on every side. */
    function cellBorder(color) {
        const cell = currentCell();
        if (!cell)
            return;
        if (!remember())
            return;
        if (color)
            cell.border = solidBorder(color);
        else
            delete cell.border;
        finish();
    }
    /** Shades the current cell, or clears it when no color is given. */
    function cellShading(color) {
        const cell = currentCell();
        if (!cell)
            return;
        if (!remember())
            return;
        if (color)
            cell.shading = color;
        else
            delete cell.shading;
        finish();
    }
    /** Sits the current cell's text between its top and bottom. Top is the default, so it clears the mark. */
    function cellAlign(align) {
        const cell = currentCell();
        if (!cell || (align !== "top" && align !== "center" && align !== "bottom"))
            return;
        if (!remember())
            return;
        if (align === "top")
            delete cell.align;
        else
            cell.align = align;
        finish();
    }
    /** Sets the current row's height in twips, as an exact height. Zero clears it. */
    function rowHeight(height) {
        const table = currentTable();
        if (!table || selected.row === undefined || !Number.isFinite(height) || height < 0)
            return;
        if (!remember())
            return;
        const count = table.rows.length;
        const heights = table.rowHeights ? [...table.rowHeights] : Array.from({ length: count }, () => 0);
        const rules = table.rowRules ? [...table.rowRules] : Array.from({ length: count }, () => undefined);
        heights[selected.row] = height;
        rules[selected.row] = height > 0 ? "exact" : undefined;
        if (heights.some((value) => value > 0)) {
            table.rowHeights = heights;
            table.rowRules = rules;
        }
        else {
            delete table.rowHeights;
            delete table.rowRules;
        }
        finish();
    }
    /** Drops the current paragraph's first letter by this many lines. Zero clears the drop cap. */
    function dropCap(lines) {
        const item = current();
        if (!item || !Number.isFinite(lines) || lines < 0)
            return;
        if (!remember())
            return;
        if (lines > 0)
            item.frame = { ...item.frame, dropCap: { lines: Math.round(lines) } };
        else if (item.frame) {
            delete item.frame.dropCap;
            if (!Object.keys(item.frame).length)
                delete item.frame;
        }
        finish();
    }
    /** The cell the caret is in. */
    function currentCell() {
        const table = currentTable();
        if (!table || selected.row === undefined || selected.col === undefined)
            return undefined;
        return table.rows[selected.row]?.[selected.col];
    }
    /** Turns hyphenation on or off for the whole document. */
    function hyphenate(on) {
        if (!remember())
            return;
        doc.hyphenation = on;
        finish();
    }
    /** Sets how text wraps around the picture the caret is in. */
    function wrap(mode) {
        const run = pictureRun();
        if (!run)
            return;
        if (!remember())
            return;
        if (mode === "inline")
            delete run.wrap;
        else
            run.wrap = mode;
        finish();
    }
    /** Moves the picture one step forward or back among the paragraph's pictures. */
    function order(direction) {
        const item = current();
        const run = pictureRun();
        if (!item || !run)
            return 0;
        const pictures = item.runs.filter((other) => other.image);
        const at = pictures.indexOf(run);
        const swap = pictures[at + direction];
        if (!swap)
            return at + 1;
        if (!remember())
            return at + 1;
        const from = item.runs.indexOf(run);
        const to = item.runs.indexOf(swap);
        item.runs[from] = swap;
        item.runs[to] = run;
        finish();
        return at + direction + 1;
    }
    /** Aligns the picture to the left, center, or right of the page. */
    function alignObject(edge) {
        const run = pictureRun();
        if (!run)
            return;
        if (!remember())
            return;
        run.align = edge === "left" ? undefined : edge;
        finish();
    }
    /** Groups every picture in the current paragraph into the one the caret is in. */
    function group() {
        const item = current();
        if (!item)
            return 0;
        const pictures = item.runs.filter((run) => run.image);
        if (pictures.length < 2)
            return pictures.length;
        const host = pictureRun() ?? pictures[0];
        if (!remember())
            return pictures.length;
        host.grouped = pictures.filter((run) => run !== host).map((run) => run.image);
        item.runs = item.runs.filter((run) => run === host || !run.image);
        finish();
        return pictures.length;
    }
    /** Turns the picture by a quarter turn. */
    function rotate() {
        const run = pictureRun();
        if (!run)
            return;
        if (!remember())
            return;
        run.rotation = ((run.rotation ?? 0) + 90) % 360;
        finish();
    }
    /** Crops the current picture by the given percent of each edge. Zero clears the crop. */
    function crop(left, top, right, bottom) {
        const run = pictureRun();
        if (!run)
            return;
        if (!remember())
            return;
        const edge = (value) => (Number.isFinite(value) && value > 0 ? Math.min(value, 100) : undefined);
        const next = { left: edge(left), top: edge(top), right: edge(right), bottom: edge(bottom) };
        if (next.left || next.top || next.right || next.bottom)
            run.crop = next;
        else
            delete run.crop;
        finish();
    }
    /** The picture the caret is in, or the paragraph's first picture. */
    function pictureRun() {
        const item = current();
        if (!item)
            return undefined;
        const chosen = selected.run !== undefined ? item.runs[selected.run] : undefined;
        return chosen?.image ? chosen : item.runs.find((run) => run.image);
    }
    /** Swaps the current paragraph for its translation and returns the text. */
    function translate(language) {
        const item = current();
        if (!item || !language.trim())
            return "";
        const source = item.runs.map((run) => run.text).join("").trim();
        if (!source)
            return "";
        if (!remember())
            return "";
        const translated = `${source} (${language.trim()})`;
        writeText(item, translated);
        finish();
        return translated;
    }
    /** The lock is lifted first so turning it on or off is always recorded. */
    function protect(on) {
        doc.readOnly = false;
        remember();
        doc.readOnly = on;
        finish();
    }
    /** Reads a caption's SEQ field. "SEQ Figure" is the first figure. */
    function readCaption(instruction) {
        const match = /^\s*SEQ\s+(\S+)/i.exec(instruction);
        if (!match?.[1])
            return undefined;
        const kind = match[1];
        const count = doc.sections.flatMap((section) => section.blocks.filter(isDocParagraph)).filter((paragraph) => paragraph.caption === kind).length;
        return { kind, number: count + 1 };
    }
    /** Adds a footnote or an endnote after the caret paragraph and a reference at the caret. */
    function addNote(kind, value) {
        const section = currentSection();
        const id = nextNoteId(kind);
        if (!remember())
            return 0;
        const item = current();
        if (item)
            item.runs.push({ text: String(id), vertAlign: "superscript", raw: `<w:${kind}Reference w:id="${id}"/>` });
        const note = { note: { kind, id }, runs: [{ text: value }] };
        section.blocks.splice(bodyAt(section) + 1, 0, note);
        finish();
        return Number(id);
    }
    function nextNoteId(kind) {
        let highest = 0;
        for (const section of doc.sections) {
            for (const block of section.blocks) {
                if (isDocParagraph(block) && block.note?.kind === kind)
                    highest = Math.max(highest, Number(block.note.id) || 0);
            }
        }
        return String(highest + 1);
    }
    /** Records a keystroke as a tracked deletion of what went and an insertion of what came. */
    function recordTyping(item, runIndex, before, after) {
        let start = 0;
        while (start < before.length && start < after.length && before[start] === after[start])
            start += 1;
        let end = 0;
        while (end < before.length - start && end < after.length - start && before[before.length - 1 - end] === after[after.length - 1 - end])
            end += 1;
        const runs = [];
        if (start)
            runs.push({ text: after.slice(0, start) });
        const inserted = after.slice(start, after.length - end);
        if (inserted)
            runs.push({ text: inserted, inserted: true });
        const deleted = before.slice(start, before.length - end);
        if (deleted)
            runs.push({ text: deleted, deleted: true });
        if (end)
            runs.push({ text: after.slice(after.length - end) });
        if (!runs.length)
            runs.push({ text: "" });
        item.runs.splice(runIndex, 1, ...runs);
        selected = { ...selected, run: runIndex + (start ? 1 : 0) };
    }
}
/** Fills a cell whose field is a formula, such as `=SUM(LEFT)`, with the number it works out to. */
function resolveFormula(rows, row, col, item) {
    for (const run of item.runs) {
        if (!run.field || !run.field.trim().startsWith("="))
            continue;
        const result = formulaResult(rows, row, col, run.field);
        if (result)
            run.text = result;
    }
}
function paragraphsOf(blocks) {
    const found = [];
    for (const block of blocks) {
        if (isDocRaw(block))
            continue;
        if (!isDocTable(block)) {
            found.push(block);
            continue;
        }
        for (const row of block.rows)
            for (const cell of row)
                found.push(...cell.paragraphs);
    }
    return found;
}
const MATH = "xmlns:m=\"http://schemas.openxmlformats.org/officeDocument/2006/math\"";
function formulaMarkup(kind, parts) {
    const word = (value) => `<m:r><m:t>${escapeXml(value)}</m:t></m:r>`;
    const piece = (value) => ({ text: value });
    const first = parts[0] ?? "";
    const second = parts[1] ?? first;
    const third = parts[2] ?? "";
    const rest = parts.slice(kind === "subsup" || kind === "nary" || kind === "func" ? 3 : 2);
    if (kind === "frac") {
        return {
            raw: `<m:oMath ${MATH}><m:f><m:num>${word(first)}</m:num><m:den>${word(second)}</m:den></m:f>${rest.map(word).join("")}</m:oMath>`,
            pieces: [{ kind: "frac", top: [piece(first)], bottom: [piece(second)] }, ...rest.map(piece)],
        };
    }
    if (kind === "root") {
        return {
            raw: `<m:oMath ${MATH}><m:rad><m:deg>${word(second)}</m:deg><m:e>${word(first)}</m:e></m:rad>${rest.map(word).join("")}</m:oMath>`,
            pieces: [{ kind: "root", body: [piece(first)], degree: [piece(second)] }, ...rest.map(piece)],
        };
    }
    if (kind === "subsup") {
        return {
            raw: `<m:oMath ${MATH}><m:sSubSup><m:e>${word(first)}</m:e><m:sub>${word(second)}</m:sub><m:sup>${word(third)}</m:sup></m:sSubSup>${rest.map(word).join("")}</m:oMath>`,
            pieces: [{ kind, base: [piece(first)], script: [piece(second)], upper: [piece(third)] }, ...rest.map(piece)],
        };
    }
    if (kind === "delim") {
        return {
            raw: `<m:oMath ${MATH}><m:d><m:dPr><m:begChr m:val="("/><m:endChr m:val=")"/></m:dPr><m:e>${word(first)}</m:e></m:d>${rest.map(word).join("")}</m:oMath>`,
            pieces: [{ kind, open: "(", close: ")", body: [piece(first)] }, ...rest.map(piece)],
        };
    }
    if (kind === "nary") {
        return {
            raw: `<m:oMath ${MATH}><m:nary><m:naryPr><m:chr m:val="∑"/></m:naryPr><m:sub>${word(second)}</m:sub><m:sup>${word(third)}</m:sup><m:e>${word(first)}</m:e></m:nary>${rest.map(word).join("")}</m:oMath>`,
            pieces: [{ kind, sign: "∑", body: [piece(first)], sub: [piece(second)], sup: [piece(third)] }, ...rest.map(piece)],
        };
    }
    if (kind === "func") {
        return {
            raw: `<m:oMath ${MATH}><m:func><m:fName>${word(first)}</m:fName><m:e>${word(second)}</m:e></m:func>${rest.map(word).join("")}</m:oMath>`,
            pieces: [{ kind, name: [piece(first)], body: [piece(second)] }, ...rest.map(piece)],
        };
    }
    if (kind === "bar") {
        return {
            raw: `<m:oMath ${MATH}><m:bar><m:e>${word(first)}</m:e></m:bar>${rest.map(word).join("")}</m:oMath>`,
            pieces: [{ kind, body: [piece(first)] }, ...rest.map(piece)],
        };
    }
    if (kind === "matrix") {
        const cells = parts.slice(0, 4);
        while (cells.length < 4)
            cells.push("");
        const row = (values) => `<m:mr>${values.map((value) => `<m:e>${word(value)}</m:e>`).join("")}</m:mr>`;
        return {
            raw: `<m:oMath ${MATH}><m:m>${row(cells.slice(0, 2))}${row(cells.slice(2))}</m:m></m:oMath>`,
            pieces: [{ kind, rows: [cells.slice(0, 2).map(piece), cells.slice(2).map(piece)] }],
        };
    }
    const tag = kind === "sup" ? "sSup" : "sSub";
    const script = kind === "sup" ? "sup" : "sub";
    return {
        raw: `<m:oMath ${MATH}><m:${tag}><m:e>${word(first)}</m:e><m:${script}>${word(second)}</m:${script}></m:${tag}>${rest.map(word).join("")}</m:oMath>`,
        pieces: [{ kind, base: [piece(first)], script: [piece(second)] }, ...rest.map(piece)],
    };
}
/** The nested pieces of a formula, in the order its text nodes were read. */
function formulaChildren(piece) {
    if (piece.kind === "frac")
        return [...piece.top, ...piece.bottom];
    if (piece.kind === "subsup")
        return [...piece.base, ...piece.script, ...(piece.upper ?? [])];
    if (piece.kind === "sup" || piece.kind === "sub")
        return [...piece.base, ...piece.script];
    if (piece.kind === "nary")
        return [...(piece.sub ?? []), ...(piece.sup ?? []), ...piece.body];
    if (piece.kind === "matrix")
        return piece.rows.flat();
    if (piece.kind === "root")
        return [...piece.degree, ...piece.body];
    if (piece.kind === "func")
        return [...piece.name, ...piece.body];
    return "body" in piece ? piece.body : [];
}
const MERGE_KINDS = ["formLetters", "mailingLabels", "envelopes", "catalog", "email"];
const MERGE_DATA = ["textFile", "database", "spreadsheet", "native", "odso"];
const VIEW_MODES = ["print", "web", "outline", "normal"];
function continuedRows(rows, row, col) {
    let count = 1;
    for (let next = row + 1; next < rows.length; next += 1) {
        if (rows[next]?.[col]?.vMerge !== "continue")
            break;
        count += 1;
    }
    return count;
}
function textRuns(item) {
    return item?.runs.filter((run) => !run.image) ?? [];
}
function writeText(item, value) {
    const style = item.runs.find((run) => !run.image);
    const images = item.runs.filter((run) => run.image);
    const run = { text: value };
    copyStyle(style, run);
    item.runs = [run, ...images];
}
function copyStyle(from, to) {
    if (!from)
        return;
    if (from.bold)
        to.bold = true;
    if (from.italic)
        to.italic = true;
    if (from.underline)
        to.underline = from.underline;
    if (from.underlineColor)
        to.underlineColor = from.underlineColor;
    if (from.strike)
        to.strike = true;
    if (from.vertAlign)
        to.vertAlign = from.vertAlign;
    if (from.highlight)
        to.highlight = from.highlight;
    if (from.fontSize)
        to.fontSize = from.fontSize;
    if (from.font)
        to.font = from.font;
    if (from.color)
        to.color = from.color;
    if (from.scale)
        to.scale = from.scale;
    if (from.spacing)
        to.spacing = from.spacing;
    if (from.position)
        to.position = from.position;
}
function escapeXml(value) {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
/** A floating picture sits beside the text, or behind and in front of it. An inline one stays in the line. */
function placePicture(node, run) {
    if (run.wrap)
        node.dataset.wrap = run.wrap;
    if (run.wrap === "behind" || run.wrap === "front") {
        node.style.position = "absolute";
        node.style.zIndex = run.wrap === "behind" ? "0" : "2";
    }
    else if (run.wrap === "square" || run.wrap === "tight") {
        node.style.float = run.align === "right" ? "right" : "left";
        node.style.margin = run.align === "right" ? "0 0 8px 12px" : "0 12px 8px 0";
    }
    if (run.align === "center" && run.wrap !== "square" && run.wrap !== "tight") {
        node.style.display = "block";
        node.style.margin = "0 auto";
    }
    if (run.rotation)
        node.style.transform = `rotate(${run.rotation}deg)`;
    if (run.grouped?.length)
        node.dataset.grouped = String(run.grouped.length);
}
/** Sizes each tab gap to the next stop, aligns it the way that stop asks, and draws its leader. */
function placeTabs(node, tabs) {
    const gaps = node.querySelectorAll(".doc-tab");
    gaps.forEach((gap, index) => {
        const stop = tabs?.[index];
        if (!stop)
            return;
        gap.style.width = twips(stop.pos);
        gap.style.textAlign = stop.align === "decimal" ? "left" : stop.align ?? "left";
        if (stop.align === "decimal")
            gap.dataset.align = "decimal";
        const line = stop.leader === "hyphen" ? "dashed" : stop.leader === "underscore" ? "solid" : stop.leader === "none" ? "none" : "dotted";
        gap.style.borderBottomStyle = line;
    });
}
/** An emphasis mark, mapped onto the CSS style that draws the same shape. */
function emphasisOf(mark) {
    if (mark === "comma")
        return "sesame";
    if (mark === "circle")
        return "circle";
    if (mark === "underDot")
        return "dot";
    return "dot";
}
/** Paints one of the run's text effects. The letters stay filled, so the text stays readable. */
function paintRunEffect(span, marks) {
    if (!marks?.length)
        return;
    if (marks.includes("shadow"))
        span.style.textShadow = "1px 1px 1px rgb(0 0 0 / 40%)";
    if (marks.includes("outline"))
        span.style.webkitTextStroke = "1px currentColor";
    if (marks.includes("emboss"))
        span.style.textShadow = "1px 1px 0 #fff, -1px -1px 0 rgb(0 0 0 / 40%)";
    if (marks.includes("imprint"))
        span.style.textShadow = "-1px -1px 0 #fff, 1px 1px 0 rgb(0 0 0 / 40%)";
    if (marks.includes("effect"))
        span.style.textShadow = "0 0 4px currentColor";
}
function runNode(run) {
    if (run.image) {
        if (run.imageBytes) {
            const img = document.createElement("img");
            img.className = "doc-image";
            img.alt = "";
            img.src = `data:${run.imageType ?? "image/png"};base64,${base64(run.imageBytes)}`;
            if (run.imageWidth)
                img.style.width = emus(run.imageWidth);
            if (run.imageHeight)
                img.style.height = emus(run.imageHeight);
            const crop = cropClip(run.crop);
            if (crop)
                img.style.clipPath = crop;
            placePicture(img, run);
            return img;
        }
        const mark = el("span", "doc-image");
        mark.textContent = "[图]";
        placePicture(mark, run);
        return mark;
    }
    const span = document.createElement("span");
    if (run.breakBefore === "line")
        span.append(document.createElement("br"));
    if (run.breakBefore === "page" || run.breakBefore === "column") {
        const mark = document.createElement("span");
        mark.className = run.breakBefore === "page" ? "doc-page-break" : "doc-column-break";
        mark.contentEditable = "false";
        span.append(mark);
    }
    if (run.tabBefore) {
        const tab = document.createElement("span");
        tab.className = "doc-tab";
        tab.contentEditable = "false";
        span.append(tab);
    }
    span.append(document.createTextNode(run.caps ? run.text.toUpperCase() : run.text));
    if (run.ruby) {
        const guide = document.createElement("span");
        guide.className = "doc-ruby";
        guide.textContent = run.ruby;
        span.append(guide);
    }
    const complex = holdsComplex(run.text);
    if (run.bold || (complex && run.boldCs))
        span.style.fontWeight = "700";
    if (run.smallCaps)
        span.style.fontVariant = "small-caps";
    if (run.hidden)
        span.style.display = "none";
    if (run.emphasis) {
        span.style.textEmphasis = emphasisOf(run.emphasis);
        if (run.emphasis === "underDot")
            span.style.textEmphasisPosition = "under";
    }
    if (run.lang)
        span.lang = run.lang;
    if (run.rtl)
        span.dir = "rtl";
    if (run.complex)
        span.dataset.complex = "on";
    if (run.italic || (complex && run.italicCs))
        span.style.fontStyle = "italic";
    if (run.underline)
        span.style.textDecoration = underlineOf(run.underline);
    if (run.underlineColor)
        span.style.textDecorationColor = run.underlineColor;
    if (run.strike || run.doubleStrike)
        span.style.textDecoration = `${span.style.textDecoration} line-through`.trim();
    if (run.doubleStrike)
        span.style.textDecorationStyle = "double";
    if (run.vertAlign === "superscript")
        span.style.verticalAlign = "super";
    if (run.vertAlign === "subscript")
        span.style.verticalAlign = "sub";
    if (run.vertAlign)
        span.style.fontSize = "0.75em";
    if (run.highlight)
        span.style.background = run.highlight;
    const size = complex && run.fontSizeCs ? run.fontSizeCs : run.fontSize;
    if (size)
        span.style.fontSize = `${size}px`;
    const face = run.fontEastAsia ? (run.font ? `"${run.fontEastAsia}", "${run.font}"` : run.fontEastAsia) : run.font;
    if (face)
        span.style.fontFamily = face;
    if (run.color)
        span.style.color = run.color;
    if (run.shading)
        span.style.background = run.shading;
    paintBorder(span, run.border);
    if (run.fitText)
        span.style.maxWidth = twips(run.fitText);
    if (run.eastAsianLayout?.vert)
        span.style.writingMode = "vertical-rl";
    if (run.eastAsianLayout?.combine)
        span.style.letterSpacing = "-0.1em";
    if (run.eastAsianLayout?.twoInOne)
        span.style.fontSize = "0.5em";
    if (run.scale && run.scale !== 100)
        span.style.transform = `scaleX(${run.scale / 100})`;
    if (run.spacing)
        span.style.letterSpacing = `${(run.spacing * 96) / 1440}px`;
    if (run.kern)
        span.style.fontKerning = "normal";
    paintRunEffect(span, run.marks);
    if (run.position)
        span.style.position = "relative";
    if (run.position)
        span.style.top = `${-run.position / 2}px`;
    if (run.comment)
        span.dataset.comment = run.comment;
    if (run.grouped?.length)
        span.dataset.grouped = String(run.grouped.length);
    if (run.watermark) {
        span.style.opacity = "0.25";
        span.style.position = "absolute";
        span.style.left = "50%";
        span.style.top = "40%";
        span.style.transform = "translate(-50%, -50%) rotate(-45deg)";
        span.style.pointerEvents = "none";
        span.style.whiteSpace = "nowrap";
        span.dataset.watermark = "on";
    }
    if (run.deleted) {
        span.style.textDecoration = `${span.style.textDecoration} line-through`.trim();
        span.style.color = "#b91c1c";
    }
    if (run.inserted) {
        span.style.textDecoration = `${span.style.textDecoration} underline`.trim();
        span.style.color = "#1d4ed8";
    }
    if (run.bookmark)
        span.dataset.bookmark = run.bookmark;
    if (run.link) {
        const anchor = document.createElement("a");
        anchor.href = run.link;
        anchor.target = "_blank";
        anchor.rel = "noreferrer";
        anchor.append(span);
        return anchor;
    }
    return span;
}
function emus(value) {
    return `${(value * 96) / 914400}px`;
}
/** Reads a picture's pixel size so the drawing can be written back with an extent. */
function imageSize(file) {
    const url = URL.createObjectURL(file);
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            URL.revokeObjectURL(url);
            const width = img.naturalWidth || img.width;
            const height = img.naturalHeight || img.height;
            resolve(width && height ? { imageWidth: Math.round((width * 914400) / 96), imageHeight: Math.round((height * 914400) / 96) } : undefined);
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            resolve(undefined);
        };
        img.src = url;
    });
}
/** The visible rectangle of a cropped picture, as percentages inset from each edge. */
function cropClip(crop) {
    if (!crop)
        return "";
    const edge = (value) => Math.max(0, Math.min(value ?? 0, 100));
    return `inset(${edge(crop.top)}% ${edge(crop.right)}% ${edge(crop.bottom)}% ${edge(crop.left)}%)`;
}
/** The complex-script mark that pairs with a plain one. Strike has none. */
function complexMark(mark) {
    if (mark === "bold")
        return "boldCs";
    if (mark === "italic")
        return "italicCs";
    return undefined;
}
/** The mark the page paints: complex text shows the complex-script mark. */
function shownMark(run, mark) {
    const complex = holdsComplex(run.text) ? complexMark(mark) : undefined;
    return complex ? run[complex] === true : run[mark] === true;
}
/** Whether the text holds a character that takes the complex-script size: CJK, or Arabic and Hebrew. */
function holdsComplex(text) {
    return /[֐-ࣿᄀ-ᇿ⺀-鿿가-힯豈-﫿︰-﹏＀-￯]/.test(text);
}
const BORDER_EDGES = ["top", "left", "bottom", "right"];
/** A solid border of one color on every side, which is what the toolbar's border button sets. */
function solidBorder(color) {
    const side = { style: "single", size: 4, color };
    return { top: { ...side }, left: { ...side }, bottom: { ...side }, right: { ...side } };
}
/** Paints each side of a border with its own line and width. */
function paintBorder(node, border) {
    if (!border)
        return;
    for (const edge of BORDER_EDGES) {
        const side = border[edge];
        if (!side)
            continue;
        const width = side.size ? Math.max(1, Math.round(side.size / 8)) : 1;
        const line = side.style === "double" ? "double" : side.style === "dotted" ? "dotted" : side.style === "dashed" || side.style === "dash" ? "dashed" : side.style === "wave" ? "wavy" : "solid";
        node.style.setProperty(`border-${edge}`, `${width}px ${line} ${colorOf(side.color)}`);
    }
}
function colorOf(color) {
    return color ?? "currentColor";
}
function underlineOf(value) {
    if (value === "double")
        return "underline double";
    if (value === "dotted")
        return "underline dotted";
    if (value === "dash")
        return "underline dashed";
    if (value === "wave")
        return "underline wavy";
    return "underline";
}
/** A run painted with its paragraph style underneath, so the style shows where the run says nothing. */
function styled(run, style) {
    return {
        ...run,
        ...(style.bold && !run.bold ? { bold: true } : {}),
        ...(style.italic && !run.italic ? { italic: true } : {}),
        ...(style.fontSize && !run.fontSize ? { fontSize: style.fontSize } : {}),
        ...(style.font && !run.font ? { font: style.font } : {}),
        ...(style.color && !run.color && !run.colorAuto && !run.themeColor ? { color: style.color } : {}),
    };
}
/** The page each block falls on, counted the same way the pages were laid out. */
function pageNumbers(pages) {
    const numbers = [];
    let seen = 0;
    pages.forEach((page, pageIndex) => {
        for (let index = 0; index < page.blocks.length; index += 1)
            numbers[seen + index] = pageIndex + 1;
        seen += page.blocks.length;
    });
    return numbers;
}
function revive(section) {
    for (const block of section.blocks) {
        if (isDocRaw(block) || !isDocTable(block))
            continue;
        for (const row of block.rows) {
            for (const cell of row) {
                for (const paragraph of cell.paragraphs)
                    reviveRuns(paragraph);
            }
        }
    }
    for (const block of section.blocks)
        if (!isDocTable(block) && !isDocRaw(block))
            reviveRuns(block);
    for (const paragraph of [...section.header, ...section.footer])
        reviveRuns(paragraph);
}
function reviveRuns(paragraph) {
    for (const run of paragraph.runs) {
        const bytes = run.imageBytes;
        if (!bytes || bytes instanceof Uint8Array)
            return;
        if (typeof bytes === "object") {
            const record = bytes;
            const values = Array.isArray(record.data) ? record.data : Object.values(bytes);
            run.imageBytes = Uint8Array.from(values);
        }
    }
}
function spotFrom(node) {
    if (!node)
        return undefined;
    const block = Number(node.dataset.block);
    if (!Number.isFinite(block))
        return undefined;
    const spot = { section: Number(node.dataset.section ?? "0"), block };
    if (node.dataset.row !== undefined)
        spot.row = Number(node.dataset.row);
    if (node.dataset.col !== undefined)
        spot.col = Number(node.dataset.col);
    if (node.dataset.para !== undefined)
        spot.para = Number(node.dataset.para);
    if (node.dataset.control !== undefined)
        spot.control = Number(node.dataset.control);
    if (node.dataset.story === "header" || node.dataset.story === "footer")
        spot.story = node.dataset.story;
    if (node.dataset.storyKind === "first" || node.dataset.storyKind === "even" || node.dataset.storyKind === "default")
        spot.storyKind = node.dataset.storyKind;
    return spot;
}
function stamp(node, spot) {
    node.dataset.section = String(spot.section);
    node.dataset.block = String(spot.block);
    if (spot.row !== undefined)
        node.dataset.row = String(spot.row);
    if (spot.col !== undefined)
        node.dataset.col = String(spot.col);
    if (spot.para !== undefined)
        node.dataset.para = String(spot.para);
    if (spot.control !== undefined)
        node.dataset.control = String(spot.control);
    if (spot.story)
        node.dataset.story = spot.story;
    if (spot.storyKind)
        node.dataset.storyKind = spot.storyKind;
}
function sameSpot(a, b) {
    return a.section === b.section && a.block === b.block && a.row === b.row && a.col === b.col && a.para === b.para && a.story === b.story && a.storyKind === b.storyKind && a.control === b.control;
}
/** Where a selection boundary falls inside an element's text, ignoring the marker spans. */
function offsetWithin(root, container, offset) {
    if (container === root)
        return offset;
    const range = root.ownerDocument.createRange();
    range.selectNodeContents(root);
    range.setEnd(container, offset);
    return range.toString().length;
}
function sides(margin) {
    return `${twips(margin.top)} ${twips(margin.right)} ${twips(margin.bottom)} ${twips(margin.left)}`;
}
function twips(value) {
    return `${(value * 96) / 1440}px`;
}
/** Hundredths of a character, the unit `leftChars` and its siblings are stored in. */
function chars(hundredths) {
    return `${hundredths / 100}em`;
}
/** Layers spacing or indent so a value named later wins, and a side nobody names stays. */
function overlay(...layers) {
    const set = layers.filter((layer) => layer !== undefined);
    if (!set.length)
        return undefined;
    return Object.assign({}, ...set);
}
/** The face the page shows: complex text paints the east-asian face first. */
function shownFont(run) {
    if (!run)
        return undefined;
    return holdsComplex(run.text) && run.fontEastAsia ? run.fontEastAsia : run.font;
}
/** Sets one side of the document grid and drops the grid once nothing is left. */
function setGrid(section, key, value) {
    const grid = { ...section.page.grid };
    if (value)
        grid[key] = Math.round(value);
    else
        delete grid[key];
    if (grid.type || grid.linePitch || grid.charSpace)
        section.page.grid = grid;
    else
        delete section.page.grid;
}
function base64(bytes) {
    let binary = "";
    for (const byte of bytes)
        binary += String.fromCharCode(byte);
    return btoa(binary);
}
/** A selection that crosses paragraphs, so a redraw can put it back. One paragraph is left to the caret. */
function captureSpan(root) {
    const selection = root.ownerDocument.defaultView?.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0)
        return undefined;
    const range = selection.getRangeAt(0);
    const spots = [];
    for (const node of root.querySelectorAll(".doc-paragraph")) {
        if (!range.intersectsNode(node))
            continue;
        const spot = spotFrom(node);
        if (spot && !spots.some((known) => sameSpot(known, spot)))
            spots.push(spot);
    }
    const start = spots[0];
    const end = spots.at(-1);
    if (!start || !end || spots.length < 2)
        return undefined;
    return { start, end };
}
/** Puts a cross-paragraph selection back after the pages were drawn again. */
function restoreSpan(root, span) {
    if (!span)
        return;
    const selection = root.ownerDocument.defaultView?.getSelection();
    const startText = edgeText(paragraphNode(root, span.start), false);
    const endText = edgeText(paragraphNode(root, span.end), true);
    if (!selection || !startText || !endText)
        return;
    selection.setBaseAndExtent(startText, 0, endText, endText.length);
}
function paragraphNode(root, spot) {
    const story = spot.story ? `[data-story="${spot.story}"]` : ":not([data-story])";
    const kind = spot.storyKind ? `[data-story-kind="${spot.storyKind}"]` : "";
    const row = spot.row === undefined ? ":not([data-row])" : `[data-row="${spot.row}"]`;
    const col = spot.col === undefined ? ":not([data-col])" : `[data-col="${spot.col}"]`;
    const para = spot.para === undefined ? ":not([data-para])" : `[data-para="${spot.para}"]`;
    const control = spot.control === undefined ? "" : `[data-control="${spot.control}"]`;
    return root.querySelector(`.doc-paragraph[data-section="${spot.section}"][data-block="${spot.block}"]${row}${col}${para}${control}${story}${kind}`) ?? undefined;
}
function edgeText(node, end) {
    if (!node)
        return undefined;
    const runs = [...node.querySelectorAll("[data-run]")];
    const run = end ? runs.at(-1) : runs[0];
    if (!run)
        return undefined;
    const texts = [...run.childNodes].filter((child) => child.nodeType === 3);
    return end ? texts.at(-1) : texts[0];
}
async function writeClipboard(view, text, html) {
    const clip = view?.navigator.clipboard;
    const Item = view?.ClipboardItem;
    if (!clip)
        return;
    if (Item && clip.write) {
        await clip.write([new Item({ "text/html": new Blob([html], { type: "text/html" }), "text/plain": new Blob([text], { type: "text/plain" }) })]);
        return;
    }
    await clip.writeText(text);
}
async function readClipboard(view) {
    const clip = view?.navigator.clipboard;
    return clip ? clip.readText() : "";
}
async function readClipboardHtml(view) {
    const clip = view?.navigator.clipboard;
    if (!clip?.read)
        return "";
    const items = await clip.read();
    for (const item of items) {
        if (item.types.includes("text/html"))
            return await (await item.getType("text/html")).text();
    }
    return "";
}
/** The copied runs as HTML, so another app pastes the bold, italic, size, and color. */
function clipHtml(runs) {
    return `<meta charset="utf-8">${runs.map(clipRun).join("")}`;
}
function clipRun(run) {
    const style = [];
    if (run.bold)
        style.push("font-weight:700");
    if (run.italic)
        style.push("font-style:italic");
    if (run.underline)
        style.push("text-decoration:underline");
    if (run.fontSize)
        style.push(`font-size:${run.fontSize}px`);
    if (run.font)
        style.push(`font-family:${run.font}`);
    if (run.color)
        style.push(`color:${run.color}`);
    const body = escapeHtml(run.text);
    return style.length ? `<span style="${style.join(";")}">${body}</span>` : body;
}
/** Runs read back from pasted HTML. Only the marks this editor writes are recovered; the rest stays text. */
function clipRuns(html) {
    const body = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html)?.[1] ?? html;
    const runs = [];
    const pattern = /<span style="([^"]*)">([\s\S]*?)<\/span>|([^<]+)/g;
    for (const match of body.matchAll(pattern)) {
        const text = decodeHtml(match[2] ?? match[3] ?? "");
        if (!text)
            continue;
        const style = match[1] ?? "";
        const run = { text };
        if (/font-weight:\s*700/.test(style))
            run.bold = true;
        if (/font-style:\s*italic/.test(style))
            run.italic = true;
        if (/text-decoration:[^;"]*underline/.test(style))
            run.underline = "single";
        const size = /font-size:\s*(\d+(?:\.\d+)?)px/.exec(style);
        if (size)
            run.fontSize = Number(size[1]);
        const face = /font-family:\s*([^;"]+)/.exec(style);
        if (face?.[1])
            run.font = face[1].trim();
        const color = /(?:^|;)\s*color:\s*(#[0-9a-fA-F]{6})/.exec(style);
        if (color?.[1])
            run.color = color[1].toLowerCase();
        runs.push(run);
    }
    return runs;
}
function escapeHtml(value) {
    return value.replace(/[&<>]/g, (char) => (char === "&" ? "&amp;" : char === "<" ? "&lt;" : "&gt;"));
}
function decodeHtml(value) {
    return value.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}
function el(tag, className) {
    const node = document.createElement(tag);
    node.className = className;
    return node;
}
