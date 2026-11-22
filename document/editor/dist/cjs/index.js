"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mountDocument = mountDocument;
const document_core_1 = require("@sliiu/document-core");
const document_renderer_1 = require("@sliiu/document-renderer");
const SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 72];
const INDENT_STEP = 720;
const RUN_SWITCHES = ["bCs", "iCs", "outline", "shadow", "emboss", "imprint", "effect"];
const PARAGRAPH_SWITCHES = ["suppressLineNumbers", "suppressAutoHyphens", "kinsoku", "wordWrap", "overflowPunct", "topLinePunct", "autoSpaceDE", "autoSpaceDN", "bidi", "adjustRightInd", "snapToGrid", "contextualSpacing", "mirrorIndents", "suppressOverlap"];
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
function mountDocument(host, doc, options = {}) {
    const locale = options.locale ?? "en";
    const zh = locale === "zh-CN";
    if (!doc.sections[0])
        doc.sections.push({ page: { ...document_core_1.DEFAULT_PAGE }, header: [], footer: [], blocks: [] });
    const undoStack = [];
    const redoStack = [];
    let selected = { section: 0, block: 0 };
    let armed = false;
    let root = el("div", "doc-view");
    let hits = [];
    let hitIndex = 0;
    /** Formatting the painter copied, waiting for the next call to apply it. */
    let painted;
    /** The current paragraph's runs, kept so a cut and paste carries the formatting with the text. */
    let clipped = [];
    const view = {
        destroy: () => root.remove(),
        undo,
        redo,
        canUndo: () => undoStack.length > 0,
        canRedo: () => redoStack.length > 0,
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
        fontOn: () => textRuns(current())[0]?.font,
        color,
        colorOn: () => textRuns(current())[0]?.color,
        clearFormat,
        align,
        alignOn,
        indent,
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
        pageSize,
        landscape,
        landscapeOn: () => currentSection().page.landscape === true,
        margins,
        columns,
        columnsOn: () => currentSection().page.columns ?? 1,
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
        merge,
        envelope,
        labels,
        footnote: (value) => addNote("footnote", value),
        endnote: (value) => addNote("endnote", value),
        pageNumber: insertPageNumber,
        formula: insertFormula,
        style: applyStyle,
        styles: () => Object.keys(doc.styles ?? {}),
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
        changeCase,
        lang,
        kern,
        runStyle,
        runSwitch,
        shadowOn: () => switchOn("shadow"),
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
        bidiOn: () => paragraphSwitchOn("bidi"),
        tabStop,
        cover,
        shape,
        icon,
        smartArt,
        chart,
        comment: addComment,
        comments: () => (doc.comments ?? []).map((item) => ({ ...item })),
        spelling: (dictionary) => (0, document_core_1.misspellings)(storyText(), dictionary),
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
        lineNumbers,
        pageBorder,
        direction,
        watermark,
        sectionBreak,
        columnWidth,
        headerRow,
        cellBorder,
        cellShading,
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
        const laid = (0, document_renderer_1.paginate)(doc);
        const numbers = pageNumbers(laid);
        (0, document_core_1.resolvePageFields)(doc, numbers);
        root = el("div", "doc-view");
        laid.forEach((page, pageIndex) => {
            const paper = el("section", "doc-page");
            paper.style.width = `${page.width}px`;
            paper.style.minHeight = `${page.height}px`;
            paper.style.padding = sides(page.margin);
            if (page.background)
                paper.style.background = page.background;
            if (page.border)
                paper.style.outline = `1px solid ${page.border}`;
            if (page.direction === "tb")
                paper.style.writingMode = "vertical-rl";
            if (page.lineNumbers)
                paper.dataset.lineNumbers = "on";
            if (page.header.length)
                paper.append(story("header", page.header, page.headerKind, sectionIndexFor(page.blocks), pageIndex + 1, laid.length));
            const body = el("div", "doc-body");
            if (page.columns > 1) {
                body.style.columnCount = String(page.columns);
                body.style.columnGap = "24px";
            }
            const sectionIndex = sectionIndexFor(page.blocks);
            const notes = [];
            for (const block of page.blocks) {
                if ((0, document_core_1.isDocParagraph)(block) && block.note)
                    notes.push(block);
                else
                    body.append(renderBlock(block, sectionIndex));
            }
            paper.append(body);
            if (notes.length)
                paper.append(noteList(notes, sectionIndex));
            if (page.footer.length)
                paper.append(story("footer", page.footer, page.footerKind, sectionIndexFor(page.blocks), pageIndex + 1, laid.length));
            paper.dataset.page = String(pageIndex);
            root.append(paper);
        });
        const bar = host.querySelector(":scope > .office-toolbar");
        host.replaceChildren(...(bar ? [bar, root] : [root]));
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
        const origin = (0, document_core_1.isDocTable)(block) ? block.source : undefined;
        const blockIndex = section ? section.blocks.indexOf(origin?.table ?? block) : -1;
        if ((0, document_core_1.isDocRaw)(block))
            return rawBlock(block, { section: sectionIndex, block: blockIndex });
        if ((0, document_core_1.isDocParagraph)(block))
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
                if (cell.border)
                    td.style.border = `1px solid ${cell.border}`;
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
    function story(kind, items, storyKind, sectionIndex, page, total) {
        const node = el("div", `doc-${kind}`);
        items.forEach((item, index) => {
            const spot = { section: sectionIndex, block: index, story: kind, storyKind };
            const para = paragraph(item, spot, true);
            for (const run of item.runs) {
                const field = run.field?.trim().toUpperCase();
                if (field !== "PAGE" && field !== "NUMPAGES")
                    continue;
                const rendered = para.querySelector(`[data-run="${item.runs.indexOf(run)}"]`);
                if (rendered)
                    rendered.textContent = field === "PAGE" ? String(page) : String(total);
            }
            node.append(para);
        });
        return node;
    }
    /** A block kept as markup. Its text can be edited; the markup around it stays. */
    function rawBlock(block, spot) {
        const node = el("div", "doc-raw");
        stamp(node, spot);
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
    /** The words of a formula, in the order its text nodes were read. */
    function formulaPlain(pieces) {
        return (pieces ?? []).map((piece) => ("text" in piece ? piece.text : formulaPlain("top" in piece ? [...piece.top, ...piece.bottom] : "degree" in piece ? [...piece.body, ...piece.degree] : [...piece.base, ...piece.script]))).join("");
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
            else {
                const script = el("span", piece.kind === "sup" ? "doc-sup" : "doc-sub");
                script.append(formulaNode(piece.base, edited, place), formulaNode(piece.script, edited, place));
                node.append(script);
            }
        }
        return node;
    }
    /** Footnotes and endnotes for one page, under a rule, each editable. */
    function noteList(notes, sectionIndex) {
        const list = el("ol", "doc-notes");
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
        const style = (0, document_core_1.styleOf)(doc.styles, item.style);
        const align = item.align ?? style.align;
        if (align)
            node.style.textAlign = align === "both" ? "justify" : align;
        if (item.shading)
            node.style.background = item.shading;
        if (item.border)
            node.style.borderTop = `1px solid ${item.border}`;
        const indent = item.indent;
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
        if (item.spacing?.before)
            node.style.marginTop = twips(item.spacing.before);
        if (item.spacing?.after)
            node.style.marginBottom = twips(item.spacing.after);
        const line = item.spacing?.line;
        if (line !== undefined)
            node.style.lineHeight = item.spacing?.lineRule === "auto" ? String(line / 240) : twips(line);
        const marker = (0, document_core_1.listMarker)(doc.numbering, item, listCounts(spot));
        if (marker) {
            const bullet = el("span", "doc-marker");
            bullet.textContent = marker;
            bullet.contentEditable = "false";
            node.append(bullet);
        }
        item.runs.forEach((run, runIndex) => {
            const rendered = runNode(styled(run, style));
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
    function listCounts(spot) {
        const section = doc.sections[spot.section];
        const item = paragraphAt(spot);
        if (!section || !item?.numbering)
            return [1];
        const counts = [];
        const startOf = (level) => doc.numbering?.[item.numbering.id]?.[level]?.start ?? 1;
        for (const block of section.blocks) {
            if ((0, document_core_1.isDocTable)(block) || (0, document_core_1.isDocRaw)(block) || block.numbering?.id !== item.numbering.id)
                continue;
            const level = block.numbering.level;
            counts[level] = (counts[level] ?? startOf(level) - 1) + 1;
            for (let deeper = level + 1; deeper < counts.length; deeper += 1)
                counts[deeper] = 0;
            if (block === item)
                return counts.map((value) => value || 0);
        }
        return counts.length ? counts : [1];
    }
    function undo() {
        const prev = undoStack.pop();
        if (!prev)
            return;
        redoStack.push(snapshot());
        restore(prev);
    }
    function redo() {
        const next = redoStack.pop();
        if (!next)
            return;
        undoStack.push(snapshot());
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
        doc.comments = JSON.parse(saved.comments);
        touch();
        render();
        options.onSelection?.();
    }
    function toggleMark(mark) {
        const runs = targetRuns();
        const on = runs.length > 0 && runs.every((run) => run[mark]);
        applyToRuns((run) => {
            if (on)
                delete run[mark];
            else
                run[mark] = true;
        });
    }
    function markOn(mark) {
        const runs = targetRuns();
        return runs.length > 0 && runs.every((run) => run[mark]);
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
            if (name)
                run.font = name;
            else
                delete run.font;
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
        const item = current();
        if (!item)
            return;
        if (!remember())
            return;
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
        finish();
    }
    function align(value) {
        const item = current();
        if (!item)
            return;
        if (!remember())
            return;
        if (value === "left")
            delete item.align;
        else
            item.align = value;
        finish();
    }
    function alignOn(value) {
        return (current()?.align ?? "left") === value;
    }
    function indent(direction) {
        const item = current();
        if (!item)
            return;
        if (!remember())
            return;
        const left = Math.max(0, (item.indent?.left ?? 0) + direction * INDENT_STEP);
        item.indent = { ...item.indent, ...(left ? { left } : {}) };
        if (!left)
            delete item.indent.left;
        if (!item.indent.left && item.indent.right === undefined && item.indent.firstLine === undefined && item.indent.hanging === undefined) {
            delete item.indent;
        }
        finish();
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
        if (!remember())
            return;
        if (count > 1)
            section.page.columns = count;
        else
            delete section.page.columns;
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
        const section = currentSection();
        if (!remember())
            return;
        const at = bodyAt(section);
        section.blocks.splice(at + 1, 0, { runs: [{ text: "" }], pageBreakBefore: true });
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
        const item = current();
        if (!item)
            return;
        clipped = textRuns(item).map((run) => ({ ...run }));
        await writeClipboard(clipped.map((run) => run.text).join(""));
    }
    async function cut() {
        const item = current();
        if (!item)
            return;
        await copy();
        if (!remember())
            return;
        item.runs = [{ text: "" }];
        finish();
    }
    async function paste() {
        const item = current();
        if (!item)
            return;
        const runs = clipped.length ? clipped.map((run) => ({ ...run })) : [{ text: await readClipboard() }];
        if (runs.every((run) => !run.text))
            return;
        if (!remember())
            return;
        const empty = item.runs.length === 1 && !item.runs[0]?.text;
        item.runs = empty ? runs : [...item.runs, ...runs];
        finish();
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
        if (!block || (0, document_core_1.isDocRaw)(block))
            return undefined;
        if ((0, document_core_1.isDocParagraph)(block))
            return block;
        if (spot.row === undefined || spot.col === undefined || spot.para === undefined)
            return undefined;
        return block.rows[spot.row]?.[spot.col]?.paragraphs[spot.para];
    }
    function currentTable() {
        const block = doc.sections[selected.section]?.blocks[selected.block];
        return block && (0, document_core_1.isDocTable)(block) ? block : undefined;
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
        undoStack.push(snapshot());
        if (undoStack.length > 50)
            undoStack.shift();
        redoStack.length = 0;
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
        const paragraphs = targeted && here ? [here] : doc.sections.flatMap((section) => section.blocks.filter(document_core_1.isDocParagraph));
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
            undoStack.pop();
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
        const saved = undoStack[0];
        if (!saved)
            return storyText();
        const sections = JSON.parse(saved.sections);
        return sections
            .flatMap((section) => section.blocks.filter(document_core_1.isDocParagraph))
            .map((paragraph) => paragraph.runs.filter((run) => !run.deleted).map((run) => run.text).join(""))
            .join("\n");
    }
    function contents() {
        const pages = pageOfBlock();
        const entries = (0, document_core_1.tableOfContents)(doc, pages);
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
        const count = doc.sections.flatMap((section) => section.blocks.filter(document_core_1.isDocParagraph)).filter((paragraph) => paragraph.caption === name).length;
        const body = textRuns(item).map((run) => run.text).join("").replace(new RegExp(`^${name} \\d+\\s*`), "");
        writeText(item, `${name} ${count} ${body}`.trim());
        finish();
    }
    function referenceTargets() {
        const targets = [];
        for (const section of doc.sections) {
            for (const block of section.blocks) {
                if (!(0, document_core_1.isDocParagraph)(block))
                    continue;
                if (block.caption)
                    targets.push(textRuns(block).map((run) => run.text).join("").trim());
                else if ((0, document_core_1.headingLevel)(block))
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
        item.runs.push({ text: (0, document_core_1.citationText)(doc.sources, citation), field: `CITATION ${citation.source}${citation.pages ? ` \\p ${citation.pages}` : ""}`, citation });
        finish();
    }
    function bibliography() {
        const lines = (0, document_core_1.bibliographyLines)(doc.sources);
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
        const lines = (0, document_core_1.indexLines)(doc, pageOfBlock());
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
                if (!(0, document_core_1.isDocParagraph)(block))
                    continue;
                for (const run of block.runs)
                    if (run.field?.trim().startsWith("MERGEFIELD"))
                        names.add((0, document_core_1.mergeFieldName)(run.field));
            }
        }
        return [...names];
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
        return (0, document_core_1.mergedCopies)(doc);
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
        const copies = (0, document_core_1.mergedCopies)(doc);
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
            const start = section.blocks.findIndex((block) => (0, document_core_1.isDocParagraph)(block) && block.runs.some((run) => run.field?.trim().startsWith(kind)));
            if (start < 0)
                continue;
            let end = start;
            while (end < section.blocks.length) {
                const block = section.blocks[end];
                if (!(0, document_core_1.isDocParagraph)(block) || !block.runs.some((run) => run.field?.trim().startsWith(kind)))
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
        return pageNumbers((0, document_renderer_1.paginate)(doc));
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
    /** Adds a tab stop to the current paragraph. One at the same position replaces the old alignment. */
    function tabStop(pos, align = "left") {
        const item = current();
        if (!item || !Number.isFinite(pos))
            return;
        if (!remember())
            return;
        const tabs = (item.tabs ?? []).filter((tab) => tab.pos !== pos);
        tabs.push(align === "left" ? { pos } : { pos, align });
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
    /** Sets the line spacing of the current paragraph. */
    function lineSpacing(line, rule = "auto") {
        const item = current();
        if (!item || !Number.isFinite(line) || line <= 0)
            return;
        if (!remember())
            return;
        item.spacing = { ...item.spacing, line, lineRule: rule };
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
    /** Borders the current paragraph, or clears it when no color is given. */
    function border(color) {
        const item = current();
        if (!item)
            return;
        if (!remember())
            return;
        if (color)
            item.border = color;
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
        else
            delete section.page.lineNumbers;
        finish();
    }
    /** Borders the page, or clears it when no color is given. */
    function pageBorder(color) {
        const section = currentSection();
        if (!remember())
            return;
        if (color)
            section.page.border = color;
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
    function sectionBreak() {
        const section = currentSection();
        if (!remember())
            return;
        const at = bodyAt(section);
        const moved = section.blocks.splice(at + 1);
        const next = { page: { ...section.page, margin: { ...section.page.margin } }, header: [], footer: [], blocks: moved.length ? moved : [{ runs: [{ text: "" }] }] };
        doc.sections.splice(selected.section + 1, 0, next);
        selected = { section: selected.section + 1, block: 0 };
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
    /** Borders the current cell, or clears it when no color is given. */
    function cellBorder(color) {
        const cell = currentCell();
        if (!cell)
            return;
        if (!remember())
            return;
        if (color)
            cell.border = color;
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
        const count = doc.sections.flatMap((section) => section.blocks.filter(document_core_1.isDocParagraph)).filter((paragraph) => paragraph.caption === kind).length;
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
                if ((0, document_core_1.isDocParagraph)(block) && block.note?.kind === kind)
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
        const result = (0, document_core_1.formulaResult)(rows, row, col, run.field);
        if (result)
            run.text = result;
    }
}
function paragraphsOf(blocks) {
    const found = [];
    for (const block of blocks) {
        if ((0, document_core_1.isDocRaw)(block))
            continue;
        if (!(0, document_core_1.isDocTable)(block)) {
            found.push(block);
            continue;
        }
        for (const row of block.rows)
            for (const cell of row)
                found.push(...cell.paragraphs);
    }
    return found;
}
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
            return img;
        }
        const mark = el("span", "doc-image");
        mark.textContent = "[图]";
        return mark;
    }
    const span = document.createElement("span");
    if (run.breakBefore === "line")
        span.append(document.createElement("br"));
    if (run.tabBefore)
        span.append(document.createTextNode(" "));
    span.append(document.createTextNode(run.caps ? run.text.toUpperCase() : run.text));
    if (run.bold)
        span.style.fontWeight = "700";
    if (run.smallCaps)
        span.style.fontVariant = "small-caps";
    if (run.hidden)
        span.style.display = "none";
    if (run.emphasis)
        span.style.textEmphasis = "dot";
    if (run.italic)
        span.style.fontStyle = "italic";
    if (run.underline)
        span.style.textDecoration = underlineOf(run.underline);
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
    if (run.fontSize)
        span.style.fontSize = `${run.fontSize}px`;
    const face = run.fontEastAsia ? (run.font ? `"${run.fontEastAsia}", "${run.font}"` : run.fontEastAsia) : run.font;
    if (face)
        span.style.fontFamily = face;
    if (run.color)
        span.style.color = run.color;
    if (run.scale && run.scale !== 100)
        span.style.transform = `scaleX(${run.scale / 100})`;
    if (run.spacing)
        span.style.letterSpacing = `${(run.spacing * 96) / 1440}px`;
    if (run.position)
        span.style.position = "relative";
    if (run.position)
        span.style.top = `${-run.position / 2}px`;
    if (run.comment)
        span.dataset.comment = run.comment;
    if (run.wrap)
        span.dataset.wrap = run.wrap;
    if (run.align)
        span.style.float = run.align === "center" ? "none" : run.align;
    if (run.align === "center")
        span.style.display = "block";
    if (run.align === "center")
        span.style.margin = "0 auto";
    if (run.rotation)
        span.style.transform = `rotate(${run.rotation}deg)`;
    if (run.grouped?.length)
        span.dataset.grouped = String(run.grouped.length);
    if (run.watermark) {
        span.style.opacity = "0.25";
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
        ...(style.color && !run.color ? { color: style.color } : {}),
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
        if ((0, document_core_1.isDocRaw)(block) || !(0, document_core_1.isDocTable)(block))
            continue;
        for (const row of block.rows) {
            for (const cell of row) {
                for (const paragraph of cell.paragraphs)
                    reviveRuns(paragraph);
            }
        }
    }
    for (const block of section.blocks)
        if (!(0, document_core_1.isDocTable)(block) && !(0, document_core_1.isDocRaw)(block))
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
    if (spot.story)
        node.dataset.story = spot.story;
    if (spot.storyKind)
        node.dataset.storyKind = spot.storyKind;
}
function sameSpot(a, b) {
    return a.section === b.section && a.block === b.block && a.row === b.row && a.col === b.col && a.para === b.para && a.story === b.story && a.storyKind === b.storyKind;
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
function base64(bytes) {
    let binary = "";
    for (const byte of bytes)
        binary += String.fromCharCode(byte);
    return btoa(binary);
}
async function writeClipboard(text) {
    const clip = navigator.clipboard;
    if (clip)
        await clip.writeText(text);
}
async function readClipboard() {
    const clip = navigator.clipboard;
    return clip ? clip.readText() : "";
}
function el(tag, className) {
    const node = document.createElement(tag);
    node.className = className;
    return node;
}
