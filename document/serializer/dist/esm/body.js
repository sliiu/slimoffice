import { isDocParagraph, isDocRaw, isDocTable, } from "@sliiu/document-core";
export function applyDocumentEdits(xml, document, relationships = []) {
    const body = bodyRange(xml);
    if (!body)
        return { xml, added: [], parts: [] };
    const sections = document.sections;
    if (!sections.length)
        return { xml, added: [], parts: [] };
    const originals = sectionProperties(xml.slice(body.start, body.end));
    const links = linkIds(relationships);
    const added = [];
    const parts = [];
    const next = xml.slice(0, body.start) + sectionsXml(sections, originals, links, added, parts) + xml.slice(body.end);
    return { xml: next, added, parts };
}
function bodyRange(xml) {
    const open = /<w:body\b[^>]*>/i.exec(xml);
    const close = open ? xml.indexOf("</w:body>", open.index) : -1;
    if (!open || close < 0)
        return undefined;
    return { start: open.index + open[0].length, end: close };
}
/** Every section's original properties, in document order. A sectPr inside a paragraph ends that section; the last one sits on the body. */
function sectionProperties(body) {
    const found = [];
    for (const match of body.matchAll(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/gi)) {
        if (match.index === undefined)
            continue;
        const before = body.slice(0, match.index);
        if (/<w:(?:p|tbl)\b[^>]*>\s*$/i.test(before))
            continue;
        found.push(match[0]);
    }
    return found;
}
function linkIds(relationships) {
    const byTarget = new Map();
    const used = new Set();
    for (const item of relationships) {
        used.add(item.id);
        if (item.external)
            byTarget.set(item.target, item.id);
    }
    return { byTarget, used };
}
/** A kept block with its text put back into the markup, so an edit to a content control or a formula is not lost. */
function rawXml(block) {
    if (block.text === undefined)
        return block.raw;
    const original = block.raw.replace(/<[^>]+>/g, "").trim();
    if (!original || original === block.text)
        return block.raw;
    return block.raw.replace(original, text(block.text));
}
function sectionsXml(sections, originals, links, added, parts) {
    return sections
        .map((section, index) => {
        const blocks = section.blocks
            .map((block) => (isDocRaw(block) ? rawXml(block) : isDocTable(block) ? tableXml(block, links, added) : isDocParagraph(block) && !block.note ? paragraphXml(block, undefined, links, added) : ""))
            .join("");
        const original = originals[index];
        const properties = storyReferences(original ? mergeSection(original, section.page) : sectionXml(section.page), section, added, parts);
        if (index === sections.length - 1)
            return blocks + properties;
        return blocks + paragraphXml({ runs: [] }, properties, links, added);
    })
        .join("");
}
const STORY_REL = {
    header: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/header",
    footer: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer",
};
/** Points the section at a header or footer that was added after the file was opened, and records the new part. */
function storyReferences(properties, section, added, parts) {
    const refs = [
        ["headerReference", section.header, section.headerPart, "header", "default"],
        ["headerReference", section.firstHeader, section.firstHeaderPart, "header", "first"],
        ["headerReference", section.evenHeader, section.evenHeaderPart, "header", "even"],
        ["footerReference", section.footer, section.footerPart, "footer", "default"],
        ["footerReference", section.firstFooter, section.firstFooterPart, "footer", "first"],
        ["footerReference", section.evenFooter, section.evenFooterPart, "footer", "even"],
    ];
    const extra = refs
        .filter(([, paragraphs, part]) => paragraphs?.length && !part)
        .map(([name, , , kind, type]) => {
        const path = freshStory(kind, added, parts);
        return `<w:${name} w:type="${type}" r:id="${path.id}"/>`;
    })
        .join("");
    if (!extra)
        return properties;
    return properties.replace(/<\/w:sectPr>/i, `${extra}</w:sectPr>`);
}
function freshStory(kind, added, parts) {
    const used = new Set(added.map((item) => item.id));
    let next = used.size + 1;
    while (used.has(`rId${next}`))
        next += 1;
    let taken = parts.filter((path) => path.startsWith(`word/${kind}`)).length + 1;
    while (parts.includes(`word/${kind}${taken}.xml`))
        taken += 1;
    const path = `word/${kind}${taken}.xml`;
    const id = `rId${next}`;
    added.push({ id, type: STORY_REL[kind], target: path.slice("word/".length), external: false });
    parts.push(path);
    return { id, path };
}
/** Keeps header and footer references from this section's original sectPr, and writes the page the model holds. */
function mergeSection(original, page) {
    const inner = original.replace(/^<w:sectPr\b[^>]*>/i, "").replace(/<\/w:sectPr>\s*$/i, "");
    const kept = inner
        .replace(/<w:pgSz\b[^/]*\/>/gi, "")
        .replace(/<w:pgMar\b[^/]*\/>/gi, "")
        .replace(/<w:cols\b[^/]*\/>/gi, "")
        .replace(/<w:lnNumType\b[^/]*\/>/gi, "")
        .replace(/<w:pgBorders\b[\s\S]*?<\/w:pgBorders>/gi, "")
        .replace(/<w:textDirection\b[^/]*\/>/gi, "")
        .replace(/<w:type\b[^/]*\/>/gi, "");
    return `<w:sectPr>${pageXml(page)}${kept}</w:sectPr>`;
}
function sectionXml(page) {
    return `<w:sectPr>${pageXml(page)}</w:sectPr>`;
}
function pageXml(page) {
    const orient = page.landscape ? ` w:orient="landscape"` : "";
    const columns = page.columns && page.columns > 1 ? `<w:cols w:num="${page.columns}"/>` : "";
    const gutter = page.gutter ? ` w:gutter="${Math.round(page.gutter)}"` : "";
    const header = page.headerDistance !== undefined ? ` w:header="${Math.round(page.headerDistance)}"` : "";
    const footer = page.footerDistance !== undefined ? ` w:footer="${Math.round(page.footerDistance)}"` : "";
    const lines = page.lineNumbers ? `<w:lnNumType w:countBy="1"/>` : "";
    const pageBorder = page.border ? `<w:pgBorders><w:top w:val="single" w:color="${attr(page.border.replace(/^#/, ""))}"/></w:pgBorders>` : "";
    const direction = page.direction === "tb" ? `<w:textDirection w:val="tbRl"/>` : page.direction === "rl" ? `<w:textDirection w:val="rlTb"/>` : "";
    const type = page.break && page.break !== "nextPage" ? `<w:type w:val="${page.break}"/>` : "";
    return `<w:pgSz w:w="${Math.round(page.width)}" w:h="${Math.round(page.height)}"${orient}/><w:pgMar w:top="${Math.round(page.margin.top)}" w:bottom="${Math.round(page.margin.bottom)}" w:left="${Math.round(page.margin.left)}" w:right="${Math.round(page.margin.right)}"${gutter}${header}${footer}/>${columns}${lines}${pageBorder}${direction}${type}`;
}
function tableXml(table, links, added) {
    const rows = table.rows;
    const body = rows
        .map((row) => {
        const cells = row
            .map((cell) => {
            const span = cell.span && cell.span > 1 ? `<w:gridSpan w:val="${cell.span}"/>` : "";
            const merge = cell.vMerge ? `<w:vMerge${cell.vMerge === "restart" ? ` w:val="restart"` : ""}/>` : "";
            const shading = cell.shading ? `<w:shd w:val="clear" w:fill="${attr(cell.shading.replace(/^#/, ""))}"/>` : "";
            const border = cell.border ? `<w:tcBorders><w:top w:val="single" w:sz="4" w:color="${attr(cell.border.replace(/^#/, ""))}"/></w:tcBorders>` : "";
            const props = span || merge || shading || border ? `<w:tcPr>${span}${merge}${shading}${border}</w:tcPr>` : "";
            const content = cell.paragraphs.map((paragraph) => paragraphXml(paragraph, undefined, links, added)).join("") || paragraphXml({ runs: [] }, undefined, links, added);
            return `<w:tc>${props}${content}</w:tc>`;
        })
            .join("");
        return `<w:tr>${cells}</w:tr>`;
    })
        .join("");
    const grid = table.widths?.length ? `<w:tblGrid>${table.widths.map((width) => `<w:gridCol w:w="${Math.round(width)}"/>`).join("")}</w:tblGrid>` : "";
    const header = table.header ? body.replace("<w:tr>", "<w:tr><w:trPr><w:tblHeader/></w:trPr>") : body;
    return `<w:tbl>${grid}${header}</w:tbl>`;
}
function paragraphXml(paragraph, section, links, added) {
    const props = [];
    if (paragraph.style)
        props.push(`<w:pStyle w:val="${attr(paragraph.style)}"/>`);
    if (paragraph.align && paragraph.align !== "left")
        props.push(`<w:jc w:val="${paragraph.align}"/>`);
    if (paragraph.numbering) {
        props.push(`<w:numPr><w:ilvl w:val="${paragraph.numbering.level}"/><w:numId w:val="${attr(paragraph.numbering.id)}"/></w:numPr>`);
    }
    if (paragraph.spacing)
        props.push(spacingXml(paragraph.spacing));
    if (paragraph.indent)
        props.push(indentXml(paragraph.indent));
    if (paragraph.shading)
        props.push(`<w:shd w:val="clear" w:fill="${attr(paragraph.shading.replace(/^#/, ""))}"/>`);
    if (paragraph.border)
        props.push(`<w:pBdr><w:top w:val="single" w:sz="4" w:color="${attr(paragraph.border.replace(/^#/, ""))}"/></w:pBdr>`);
    if (paragraph.pageBreakBefore)
        props.push("<w:pageBreakBefore/>");
    if (paragraph.keepNext)
        props.push("<w:keepNext/>");
    if (paragraph.keepLines)
        props.push("<w:keepLines/>");
    if (paragraph.widowControl)
        props.push("<w:widowControl/>");
    if (paragraph.outline !== undefined)
        props.push(`<w:outlineLvl w:val="${Math.round(paragraph.outline)}"/>`);
    for (const mark of paragraph.marks ?? [])
        if (/^[a-zA-Z]+$/.test(mark))
            props.push(`<w:${mark}/>`);
    for (const markup of paragraph.kept ?? [])
        props.push(withPrefix(markup));
    if (paragraph.tabs?.length)
        props.push(tabsXml(paragraph.tabs));
    if (paragraph.caption)
        props.push(`<w:pStyle w:val="${attr(`Caption${paragraph.caption}`)}"/>`);
    if (section)
        props.push(section);
    const head = props.length ? `<w:pPr>${props.join("")}</w:pPr>` : "";
    return `<w:p>${head}${runsXml(paragraph.runs, links, added)}</w:p>`;
}
function tabsXml(tabs) {
    const stops = tabs.map((tab) => `<w:tab w:val="${tab.align ?? "left"}" w:pos="${Math.round(tab.pos)}"/>`).join("");
    return `<w:tabs>${stops}</w:tabs>`;
}
function spacingXml(spacing) {
    const before = spacing.before !== undefined ? ` w:before="${Math.round(spacing.before)}"` : "";
    const after = spacing.after !== undefined ? ` w:after="${Math.round(spacing.after)}"` : "";
    const line = spacing.line !== undefined ? ` w:line="${Math.round(spacing.line)}"` : "";
    const rule = spacing.lineRule ? ` w:lineRule="${spacing.lineRule}"` : "";
    return `<w:spacing${before}${after}${line}${rule}/>`;
}
function indentXml(indent) {
    const left = indent.left !== undefined ? ` w:left="${Math.round(indent.left)}"` : "";
    const right = indent.right !== undefined ? ` w:right="${Math.round(indent.right)}"` : "";
    const first = indent.firstLine !== undefined ? ` w:firstLine="${Math.round(indent.firstLine)}"` : "";
    const hanging = indent.hanging !== undefined ? ` w:hanging="${Math.round(indent.hanging)}"` : "";
    return `<w:ind${left}${right}${first}${hanging}/>`;
}
function runsXml(runs, links, added) {
    let out = "";
    let openLink;
    for (const run of runs) {
        if (run.link !== openLink) {
            if (openLink)
                out += "</w:hyperlink>";
            openLink = run.link;
            if (openLink)
                out += linkXml(openLink, links, added);
        }
        if (run.bookmark)
            out += `<w:bookmarkStart w:id="0" w:name="${attr(run.bookmark)}"/>`;
        if (run.field)
            out += fieldXml(run);
        else if (run.raw)
            out += run.raw.startsWith("<w:r") || run.raw.startsWith("<r") || run.raw.startsWith("<w:ins") || run.raw.startsWith("<w:del") || run.raw.startsWith("<w:bookmarkEnd") || run.raw.startsWith("<w:commentRange") || run.raw.startsWith("<w:smartTag") || run.raw.startsWith("<w:fldSimple") || run.raw.startsWith("<w:pict") ? run.raw : `<w:r>${run.raw}</w:r>`;
        else
            out += runXml(run);
    }
    if (openLink)
        out += "</w:hyperlink>";
    return out;
}
const HYPERLINK = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink";
function linkXml(target, links, added) {
    if (target.startsWith("#"))
        return `<w:hyperlink w:anchor="${attr(target.slice(1))}">`;
    if (/^rId\d+$/.test(target))
        return `<w:hyperlink r:id="${attr(target)}">`;
    const known = links.byTarget.get(target);
    if (known)
        return `<w:hyperlink r:id="${attr(known)}">`;
    let next = added.length + links.used.size + 1;
    while (links.used.has(`rId${next}`))
        next += 1;
    const id = `rId${next}`;
    links.used.add(id);
    links.byTarget.set(target, id);
    added.push({ id, type: HYPERLINK, target, external: true });
    return `<w:hyperlink r:id="${id}">`;
}
/** A field written the way Word stores one: the instruction, then the result it shows. */
function fieldXml(run) {
    const instruction = run.field ?? "";
    return `<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve">${text(instruction)}</w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t xml:space="preserve">${text(run.text)}</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>`;
}
function runXml(run) {
    if (run.raw)
        return run.raw;
    const lead = `${run.breakBefore ? `<w:br${run.breakBefore === "line" ? "" : ` w:type="${run.breakBefore}"`}/>` : ""}${run.tabBefore ? "<w:tab/>" : ""}`;
    if (run.watermark)
        return watermarkXml(run.text);
    if (run.image)
        return `<w:r>${lead}${drawingXml(run)}</w:r>`;
    const props = runPropsXml(run);
    const comment = run.comment ? `<w:commentReference w:id="${attr(run.comment)}"/>` : "";
    return `<w:r>${props}${lead}<w:t xml:space="preserve">${text(run.text)}</w:t>${comment}</w:r>`;
}
/** The markup was read without its prefix, so writing it back puts the wordprocessing prefix on every element. */
function withPrefix(markup) {
    return markup.replace(/<(\/?)([A-Za-z][\w.]*)/g, "<$1w:$2");
}
function runPropsXml(run) {
    const parts = [];
    if (run.font || run.fontEastAsia) {
        const ascii = run.font ? ` w:ascii="${attr(run.font)}" w:hAnsi="${attr(run.font)}"` : "";
        const eastAsia = run.fontEastAsia ? ` w:eastAsia="${attr(run.fontEastAsia)}"` : "";
        parts.push(`<w:rFonts${ascii}${eastAsia}/>`);
    }
    if (run.runStyle)
        parts.push(`<w:rStyle w:val="${attr(run.runStyle)}"/>`);
    if (run.bold)
        parts.push("<w:b/>");
    if (run.italic)
        parts.push("<w:i/>");
    if (run.caps)
        parts.push("<w:caps/>");
    if (run.smallCaps)
        parts.push("<w:smallCaps/>");
    if (run.underline)
        parts.push(`<w:u w:val="${run.underline}"/>`);
    if (run.strike)
        parts.push("<w:strike/>");
    if (run.doubleStrike)
        parts.push("<w:dstrike/>");
    if (run.hidden)
        parts.push("<w:vanish/>");
    if (run.emphasis)
        parts.push(`<w:em w:val="${attr(run.emphasis)}"/>`);
    if (run.lang)
        parts.push(`<w:lang w:val="${attr(run.lang)}"/>`);
    if (run.kern)
        parts.push(`<w:kern w:val="${Math.round(run.kern)}"/>`);
    for (const mark of run.marks ?? [])
        if (/^[a-zA-Z]+$/.test(mark))
            parts.push(`<w:${mark}/>`);
    for (const markup of run.kept ?? [])
        parts.push(withPrefix(markup));
    if (run.vertAlign)
        parts.push(`<w:vertAlign w:val="${run.vertAlign}"/>`);
    if (run.fontSize)
        parts.push(`<w:sz w:val="${Math.round(run.fontSize * 2)}"/>`);
    if (run.color)
        parts.push(`<w:color w:val="${attr(run.color.replace(/^#/, ""))}"/>`);
    if (run.highlight)
        parts.push(`<w:highlight w:val="${highlightName(run.highlight)}"/>`);
    if (run.scale && run.scale !== 100)
        parts.push(`<w:w w:val="${Math.round(run.scale)}"/>`);
    if (run.spacing)
        parts.push(`<w:spacing w:val="${Math.round(run.spacing)}"/>`);
    if (run.position)
        parts.push(`<w:position w:val="${Math.round(run.position)}"/>`);
    return parts.length ? `<w:rPr>${parts.join("")}</w:rPr>` : "";
}
/** Word's watermark: a diagonal shape in the header, so Word shows it behind the page. */
function watermarkXml(label) {
    const shape = `<v:shape id="PowerPlusWaterMarkObject" style="rotation:315"><v:textpath string="${attr(label)}">${text(label)}</v:textpath></v:shape>`;
    return `<w:r><w:pict>${shape}</w:pict></w:r>`;
}
/** The wrap element a floating drawing carries. Inline drawings have none. */
function wrapXml(wrap) {
    if (wrap === "square")
        return "<wp:wrapSquare/>";
    if (wrap === "tight")
        return "<wp:wrapTight/>";
    if (wrap === "behind")
        return "<wp:wrapNone/>";
    if (wrap === "front")
        return "<wp:wrapNone/>";
    return "";
}
const HIGHLIGHT_NAMES = {
    "#ffff00": "yellow",
    "#00ff00": "green",
    "#00ffff": "cyan",
    "#ff00ff": "magenta",
    "#0000ff": "blue",
    "#ff0000": "red",
    "#d3d3d3": "lightGray",
    "#a9a9a9": "darkGray",
    "#000000": "black",
};
function highlightName(color) {
    return HIGHLIGHT_NAMES[color.toLowerCase()] ?? "yellow";
}
function drawingXml(run) {
    const width = run.imageWidth && run.imageWidth > 0 ? Math.round(run.imageWidth) : 1828800;
    const height = run.imageHeight && run.imageHeight > 0 ? Math.round(run.imageHeight) : 1828800;
    const behind = run.wrap === "behind" ? ` behindDoc="1"` : "";
    const placed = run.align === "right" ? ` relativeFrom="right"` : run.align === "center" ? ` relativeFrom="center"` : "";
    const turned = run.rotation ? `<a:xfrm rot="${Math.round(run.rotation * 60000)}"/>` : "";
    const grouped = run.grouped?.length ? `<a:grpSp>${run.grouped.map((id) => `<pic:pic><pic:blipFill><a:blip r:embed="${attr(id)}"/></pic:blipFill></pic:pic>`).join("")}</a:grpSp>` : "";
    const body = `<wp:extent cx="${width}" cy="${height}"/>${wrapXml(run.wrap)}<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">${turned}<pic:pic><pic:blipFill><a:blip r:embed="${attr(run.image ?? "")}"/>${srcRectXml(run.crop)}</pic:blipFill></pic:pic>${grouped}</a:graphicData></a:graphic>`;
    return run.wrap && run.wrap !== "inline" ? `<w:drawing><wp:anchor${behind}${placed}>${body}</wp:anchor></w:drawing>` : `<w:drawing><wp:inline${placed}>${body}</wp:inline></w:drawing>`;
}
/** Each edge is stored in thousandths of a percent, which is how Word records a crop. */
function srcRectXml(crop) {
    if (!crop)
        return "";
    const edge = (name, value) => (value && value > 0 ? ` ${name}="${Math.round(value * 1000)}"` : "");
    const attrs = `${edge("l", crop.left)}${edge("t", crop.top)}${edge("r", crop.right)}${edge("b", crop.bottom)}`;
    return attrs ? `<a:srcRect${attrs}/>` : "";
}
function text(value) {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function attr(value) {
    return text(value).replace(/"/g, "&quot;");
}
/** A header or footer part, rewritten from the paragraphs the model holds. */
export function storyPartXml(root, paragraphs) {
    const body = paragraphs.map((paragraph) => paragraphXml(paragraph, undefined, linkIds([]), [])).join("");
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:${root} xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${body}</w:${root}>`;
}
