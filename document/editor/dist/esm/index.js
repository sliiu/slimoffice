import { isDocTable } from "@sliiu/document-core";
import { paginate } from "@sliiu/document-renderer";
/** Read-only pages. Editing comes later, so this view never changes the document. */
export function mountDocument(host, document) {
    host.replaceChildren();
    const root = el("div", "doc-view");
    for (const page of paginate(document)) {
        const paper = el("section", "doc-page");
        paper.style.width = `${page.width}px`;
        paper.style.minHeight = `${page.height}px`;
        paper.style.padding = sides(page.margin);
        if (page.header.length)
            paper.append(story("header", page.header));
        for (const block of page.blocks)
            paper.append(renderBlock(block));
        if (page.footer.length)
            paper.append(story("footer", page.footer));
        root.append(paper);
    }
    host.append(root);
    return { destroy: () => host.replaceChildren() };
}
function renderBlock(block) {
    if (!isDocTable(block))
        return paragraph(block);
    const table = el("table", "doc-table");
    for (const row of block.rows) {
        const tr = document.createElement("tr");
        for (const cell of row) {
            const td = document.createElement("td");
            for (const item of cell)
                td.append(paragraph(item));
            tr.append(td);
        }
        table.append(tr);
    }
    return table;
}
function paragraph(item) {
    const node = el("p", "doc-paragraph");
    if (item.align)
        node.style.textAlign = item.align === "both" ? "justify" : item.align;
    for (const run of item.runs) {
        if (run.image) {
            const mark = el("span", "doc-image");
            mark.textContent = "[图]";
            node.append(mark);
            continue;
        }
        const span = document.createElement("span");
        span.textContent = run.text;
        if (run.bold)
            span.style.fontWeight = "700";
        if (run.italic)
            span.style.fontStyle = "italic";
        if (run.fontSize)
            span.style.fontSize = `${run.fontSize}px`;
        if (run.color)
            span.style.color = run.color;
        node.append(span);
    }
    return node;
}
function story(kind, items) {
    const node = el("div", `doc-${kind}`);
    for (const item of items)
        node.append(paragraph(item));
    return node;
}
function sides(margin) {
    const px = (twips) => `${twips * 96 / 1440}px`;
    return `${px(margin.top)} ${px(margin.right)} ${px(margin.bottom)} ${px(margin.left)}`;
}
function el(tag, className) {
    const node = document.createElement(tag);
    node.className = className;
    return node;
}
