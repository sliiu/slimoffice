"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.paragraphText = paragraphText;
exports.itemsFromTextShape = itemsFromTextShape;
exports.inferSmartArtLayout = inferSmartArtLayout;
exports.convertTextShapeToSmartArt = convertTextShapeToSmartArt;
exports.defaultSmartArtItems = defaultSmartArtItems;
exports.createSmartArtGroup = createSmartArtGroup;
const core_1 = require("@sliiu/present-core");
const core_2 = require("@sliiu/present-core");
const shape_factory_1 = require("./shape-factory");
function paragraphText(p) {
    return p.runs.map((r) => r.text).join("").trim();
}
/** 从文本框段落提取 SmartArt 条目（保留 level → lvl）。 */
function itemsFromTextShape(text) {
    const items = [];
    text.paragraphs.forEach((p, i) => {
        const t = paragraphText(p);
        if (!t)
            return;
        items.push({
            id: `item_${i}`,
            text: t,
            lvl: p.level ?? 0,
        });
    });
    if (items.length === 0) {
        items.push({ id: "item_0", text: "Item 1", lvl: 0 });
    }
    return items;
}
/** 根据段落层级 / 数量推断默认 SmartArt 版式。 */
function inferSmartArtLayout(text) {
    const items = itemsFromTextShape(text);
    const levels = new Set(items.map((it) => it.lvl ?? 0));
    if (levels.size > 1 || (levels.has(1) && items.length >= 2))
        return "orgChart";
    if (items.length >= 4)
        return "process";
    if (items.length === 3)
        return "list";
    return "list";
}
function convertTextShapeToSmartArt(text, layout) {
    const lay = layout ?? inferSmartArtLayout(text);
    const items = itemsFromTextShape(text);
    return createSmartArtGroup({
        id: (0, shape_factory_1.genShapeId)("sa"),
        layout: lay,
        items,
        bbox: { ...text.bbox },
    });
}
function defaultSmartArtItems(layout) {
    if (layout === "hierarchy" || layout === "orgChart" || layout === "horizontalHierarchy") {
        return [
            { id: "item_0", text: "Main idea", lvl: 0 },
            { id: "item_1", text: "Detail A", lvl: 1 },
            { id: "item_2", text: "Detail B", lvl: 1 },
        ];
    }
    if (layout === "venn") {
        return [
            { id: "item_0", text: "Set A" },
            { id: "item_1", text: "Set B" },
            { id: "item_2", text: "Set C" },
        ];
    }
    if (layout === "target") {
        return [
            { id: "item_0", text: "Goal", lvl: 0 },
            { id: "item_1", text: "Metric 1", lvl: 1 },
            { id: "item_2", text: "Metric 2", lvl: 1 },
            { id: "item_3", text: "Metric 3", lvl: 1 },
        ];
    }
    if (layout === "radial" || layout === "gear") {
        return [
            { id: "item_0", text: "Core idea", lvl: 0 },
            { id: "item_1", text: "Branch A", lvl: 1 },
            { id: "item_2", text: "Branch B", lvl: 1 },
            { id: "item_3", text: "Branch C", lvl: 1 },
        ];
    }
    if (layout === "equation") {
        return [
            { id: "item_0", text: "Input" },
            { id: "item_1", text: "Process" },
            { id: "item_2", text: "Result" },
        ];
    }
    return [
        { id: "item_0", text: "Step 1" },
        { id: "item_1", text: "Step 2" },
        { id: "item_2", text: "Step 3" },
    ];
}
function createSmartArtGroup(opts) {
    const children = (0, core_1.buildSmartArtShapes)(opts.layout, opts.items, opts.bbox);
    return {
        id: opts.id,
        name: "SmartArt",
        zIndex: 0,
        visible: true,
        locked: false,
        opacity: 1,
        bbox: opts.bbox,
        transform: (0, core_2.identityTransform)(),
        kind: "group",
        children,
        smartArtMeta: { layout: opts.layout },
    };
}
