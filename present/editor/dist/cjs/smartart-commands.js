"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConvertToSmartArtCmd = exports.SetSmartArtLayoutCmd = exports.SetSmartArtItemLevelCmd = exports.MoveSmartArtItemCmd = exports.RemoveSmartArtItemCmd = exports.ClearSmartArtPicturesCmd = exports.DuplicateSmartArtItemCmd = exports.AddSmartArtItemCmd = exports.UpdateSmartArtItemsCmd = exports.RebuildSmartArtCmd = void 0;
const core_1 = require("@sliiu/present-core");
const selection_1 = require("./selection");
const smartart_factory_1 = require("./smartart-factory");
function getSmartArtGroup(pres, slideIdx, groupId) {
    const slide = pres.slides[slideIdx];
    if (!slide)
        return null;
    const sh = (0, selection_1.findShape)(slide, groupId);
    if (!sh || sh.kind !== "group" || !sh.smartArtMeta)
        return null;
    return sh;
}
class RebuildSmartArtCmd {
    slideIdx;
    groupId;
    nextItems;
    prevItems;
    nextLayout;
    prevLayout;
    label;
    constructor(slideIdx, groupId, nextItems, prevItems, nextLayout, prevLayout) {
        this.slideIdx = slideIdx;
        this.groupId = groupId;
        this.nextItems = nextItems;
        this.prevItems = prevItems;
        this.nextLayout = nextLayout;
        this.prevLayout = prevLayout;
        this.label = "Update diagram";
    }
    apply(pres) {
        const g = getSmartArtGroup(pres, this.slideIdx, this.groupId);
        if (!g)
            return;
        if (this.nextLayout)
            g.smartArtMeta = { layout: this.nextLayout };
        (0, core_1.rebuildSmartArtChildren)(g, this.nextItems, g.smartArtMeta?.layout);
    }
    revert(pres) {
        const g = getSmartArtGroup(pres, this.slideIdx, this.groupId);
        if (!g)
            return;
        if (this.prevLayout)
            g.smartArtMeta = { layout: this.prevLayout };
        (0, core_1.rebuildSmartArtChildren)(g, this.prevItems, g.smartArtMeta?.layout);
    }
}
exports.RebuildSmartArtCmd = RebuildSmartArtCmd;
class UpdateSmartArtItemsCmd {
    slideIdx;
    groupId;
    nextItems;
    prevItems;
    label = "Edit diagram items";
    constructor(slideIdx, groupId, nextItems, prevItems) {
        this.slideIdx = slideIdx;
        this.groupId = groupId;
        this.nextItems = nextItems;
        this.prevItems = prevItems;
    }
    apply(pres) {
        const g = getSmartArtGroup(pres, this.slideIdx, this.groupId);
        if (!g)
            return;
        (0, core_1.rebuildSmartArtChildren)(g, this.nextItems);
    }
    revert(pres) {
        const g = getSmartArtGroup(pres, this.slideIdx, this.groupId);
        if (!g)
            return;
        (0, core_1.rebuildSmartArtChildren)(g, this.prevItems);
    }
}
exports.UpdateSmartArtItemsCmd = UpdateSmartArtItemsCmd;
class AddSmartArtItemCmd {
    slideIdx;
    groupId;
    snapshot;
    label = "Add diagram item";
    constructor(slideIdx, groupId, snapshot) {
        this.slideIdx = slideIdx;
        this.groupId = groupId;
        this.snapshot = snapshot;
    }
    apply(pres) {
        const g = getSmartArtGroup(pres, this.slideIdx, this.groupId);
        if (!g)
            return;
        const items = (0, core_1.extractSmartArtItems)(g);
        const n = items.length + 1;
        const layout = g.smartArtMeta.layout;
        items.push({
            id: `item_${n}`,
            text: `Item ${n}`,
            lvl: layout === "hierarchy" && items.length > 0 ? 1 : 0,
        });
        (0, core_1.rebuildSmartArtChildren)(g, items);
    }
    revert(pres) {
        const g = getSmartArtGroup(pres, this.slideIdx, this.groupId);
        if (!g)
            return;
        (0, core_1.rebuildSmartArtChildren)(g, this.snapshot);
    }
}
exports.AddSmartArtItemCmd = AddSmartArtItemCmd;
class DuplicateSmartArtItemCmd {
    slideIdx;
    groupId;
    itemIndex;
    snapshot;
    label = "Duplicate diagram item";
    constructor(slideIdx, groupId, itemIndex, snapshot) {
        this.slideIdx = slideIdx;
        this.groupId = groupId;
        this.itemIndex = itemIndex;
        this.snapshot = snapshot;
    }
    apply(pres) {
        const g = getSmartArtGroup(pres, this.slideIdx, this.groupId);
        if (!g)
            return;
        const items = (0, core_1.extractSmartArtItems)(g);
        if (this.itemIndex < 0 || this.itemIndex >= items.length)
            return;
        const src = items[this.itemIndex];
        const copy = {
            id: `item_${items.length + 1}_${Date.now()}`,
            text: src.text ? `${src.text} (copy)` : "Copy",
            lvl: src.lvl,
            imageSrc: src.imageSrc,
        };
        const next = [...items];
        next.splice(this.itemIndex + 1, 0, copy);
        (0, core_1.rebuildSmartArtChildren)(g, next);
    }
    revert(pres) {
        const g = getSmartArtGroup(pres, this.slideIdx, this.groupId);
        if (!g)
            return;
        (0, core_1.rebuildSmartArtChildren)(g, this.snapshot);
    }
}
exports.DuplicateSmartArtItemCmd = DuplicateSmartArtItemCmd;
class ClearSmartArtPicturesCmd {
    slideIdx;
    groupId;
    snapshot;
    label = "Clear diagram pictures";
    constructor(slideIdx, groupId, snapshot) {
        this.slideIdx = slideIdx;
        this.groupId = groupId;
        this.snapshot = snapshot;
    }
    apply(pres) {
        const g = getSmartArtGroup(pres, this.slideIdx, this.groupId);
        if (!g)
            return;
        const items = (0, core_1.extractSmartArtItems)(g).map((item) => {
            if (!item.imageSrc)
                return item;
            const next = { ...item };
            delete next.imageSrc;
            return next;
        });
        (0, core_1.rebuildSmartArtChildren)(g, items);
    }
    revert(pres) {
        const g = getSmartArtGroup(pres, this.slideIdx, this.groupId);
        if (!g)
            return;
        (0, core_1.rebuildSmartArtChildren)(g, this.snapshot);
    }
}
exports.ClearSmartArtPicturesCmd = ClearSmartArtPicturesCmd;
class RemoveSmartArtItemCmd {
    slideIdx;
    groupId;
    snapshot;
    itemIndex;
    label = "Remove diagram item";
    constructor(slideIdx, groupId, snapshot, itemIndex) {
        this.slideIdx = slideIdx;
        this.groupId = groupId;
        this.snapshot = snapshot;
        this.itemIndex = itemIndex;
    }
    apply(pres) {
        const g = getSmartArtGroup(pres, this.slideIdx, this.groupId);
        if (!g)
            return;
        const items = (0, core_1.extractSmartArtItems)(g);
        if (items.length <= 1)
            return;
        const idx = this.itemIndex ?? items.length - 1;
        if (idx < 0 || idx >= items.length)
            return;
        items.splice(idx, 1);
        (0, core_1.rebuildSmartArtChildren)(g, items);
    }
    revert(pres) {
        const g = getSmartArtGroup(pres, this.slideIdx, this.groupId);
        if (!g)
            return;
        (0, core_1.rebuildSmartArtChildren)(g, this.snapshot);
    }
}
exports.RemoveSmartArtItemCmd = RemoveSmartArtItemCmd;
class MoveSmartArtItemCmd {
    slideIdx;
    groupId;
    itemIndex;
    direction;
    snapshot;
    label = "Reorder diagram item";
    constructor(slideIdx, groupId, itemIndex, direction, snapshot) {
        this.slideIdx = slideIdx;
        this.groupId = groupId;
        this.itemIndex = itemIndex;
        this.direction = direction;
        this.snapshot = snapshot;
    }
    apply(pres) {
        const g = getSmartArtGroup(pres, this.slideIdx, this.groupId);
        if (!g)
            return;
        const items = (0, core_1.extractSmartArtItems)(g);
        const j = this.itemIndex + this.direction;
        if (j < 0 || j >= items.length)
            return;
        const tmp = items[this.itemIndex];
        items[this.itemIndex] = items[j];
        items[j] = tmp;
        (0, core_1.rebuildSmartArtChildren)(g, items);
    }
    revert(pres) {
        const g = getSmartArtGroup(pres, this.slideIdx, this.groupId);
        if (!g)
            return;
        (0, core_1.rebuildSmartArtChildren)(g, this.snapshot);
    }
}
exports.MoveSmartArtItemCmd = MoveSmartArtItemCmd;
class SetSmartArtItemLevelCmd {
    slideIdx;
    groupId;
    itemIndex;
    delta;
    snapshot;
    label = "Change diagram level";
    constructor(slideIdx, groupId, itemIndex, delta, snapshot) {
        this.slideIdx = slideIdx;
        this.groupId = groupId;
        this.itemIndex = itemIndex;
        this.delta = delta;
        this.snapshot = snapshot;
    }
    apply(pres) {
        const g = getSmartArtGroup(pres, this.slideIdx, this.groupId);
        if (!g)
            return;
        const items = (0, core_1.extractSmartArtItems)(g);
        const it = items[this.itemIndex];
        if (!it)
            return;
        const next = Math.max(0, (it.lvl ?? 0) + this.delta);
        it.lvl = next;
        (0, core_1.rebuildSmartArtChildren)(g, items);
    }
    revert(pres) {
        const g = getSmartArtGroup(pres, this.slideIdx, this.groupId);
        if (!g)
            return;
        (0, core_1.rebuildSmartArtChildren)(g, this.snapshot);
    }
}
exports.SetSmartArtItemLevelCmd = SetSmartArtItemLevelCmd;
class SetSmartArtLayoutCmd {
    slideIdx;
    groupId;
    layout;
    prevLayout;
    itemsSnapshot;
    label = "Change diagram layout";
    constructor(slideIdx, groupId, layout, prevLayout, itemsSnapshot) {
        this.slideIdx = slideIdx;
        this.groupId = groupId;
        this.layout = layout;
        this.prevLayout = prevLayout;
        this.itemsSnapshot = itemsSnapshot;
    }
    apply(pres) {
        const g = getSmartArtGroup(pres, this.slideIdx, this.groupId);
        if (!g)
            return;
        g.smartArtMeta = { layout: this.layout };
        (0, core_1.rebuildSmartArtChildren)(g, this.itemsSnapshot, this.layout);
    }
    revert(pres) {
        const g = getSmartArtGroup(pres, this.slideIdx, this.groupId);
        if (!g)
            return;
        g.smartArtMeta = { layout: this.prevLayout };
        (0, core_1.rebuildSmartArtChildren)(g, this.itemsSnapshot, this.prevLayout);
    }
}
exports.SetSmartArtLayoutCmd = SetSmartArtLayoutCmd;
/** 将文本框（含 bullets 多段）替换为 SmartArt group。 */
class ConvertToSmartArtCmd {
    slideIdx;
    shapeId;
    layout;
    label = "Convert to diagram";
    removed;
    layerIdx;
    groupId;
    /** Populated on apply for collab wire (full group + placement). */
    inserted;
    constructor(slideIdx, shapeId, layout) {
        this.slideIdx = slideIdx;
        this.shapeId = shapeId;
        this.layout = layout;
    }
    apply(pres) {
        const slide = pres.slides[this.slideIdx];
        if (!slide)
            return;
        const sh = (0, selection_1.findShape)(slide, this.shapeId);
        if (!sh || sh.kind !== "text")
            return;
        const group = (0, smartart_factory_1.convertTextShapeToSmartArt)(sh, this.layout);
        this.groupId = group.id;
        for (let li = 0; li < slide.layers.length; li++) {
            const layer = slide.layers[li];
            const pos = layer.shapes.findIndex((s) => s.id === this.shapeId);
            if (pos < 0)
                continue;
            this.removed = layer.shapes[pos];
            this.layerIdx = li;
            layer.shapes.splice(pos, 1, group);
            this.inserted = { layerIdx: li, index: pos, group: structuredClone(group) };
            return;
        }
    }
    revert(pres) {
        if (!this.removed || this.layerIdx === undefined || !this.groupId)
            return;
        const slide = pres.slides[this.slideIdx];
        const layer = slide?.layers[this.layerIdx];
        if (!layer)
            return;
        const idx = layer.shapes.findIndex((s) => s.id === this.groupId);
        if (idx < 0)
            return;
        layer.shapes.splice(idx, 1, this.removed);
    }
}
exports.ConvertToSmartArtCmd = ConvertToSmartArtCmd;
