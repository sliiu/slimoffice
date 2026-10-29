import { assignSlideBackground, markDirty, translatePathD, extractSmartArtItems, rebuildSmartArtChildren, sanitizeHyperlinkRef, sanitizeExternalUrl } from "@sliiu/present-core";
import { assignCrop, cropHost, readCrop } from "./crop-frame.js";
import { findShape, findShapeWithLayer, isMasterCopyLayer, syntheticTextBoxGroupId } from "./selection.js";
import { followGlueToSites, reattachConnectorGlue } from "./connector-glue.js";
import { applyStyleToCharRanges, patchTextRun } from "./text-char-style.js";
export function slideTarget(slideIdx) {
    return { kind: "slide", slideIdx };
}
export function masterTarget(masterId) {
    return { kind: "master", masterId };
}
export function layoutTarget(masterId, layoutId) {
    return { kind: "layout", masterId, layoutId };
}
export function notesMasterTarget(masterId) {
    return { kind: "notesMaster", masterId };
}
export function handoutMasterTarget(masterId) {
    return { kind: "handoutMaster", masterId };
}
export function resolveTarget(pres, target) {
    if (target.kind === "slide") {
        const slide = pres.slides[target.slideIdx];
        if (!slide)
            return null;
        const main = slide.layers.find((l) => l.id === "main") ?? slide.layers[slide.layers.length - 1];
        if (!main)
            return null;
        return {
            shapes: main.shapes,
            setShapes: (next) => { main.shapes = next; },
            get background() { return slide.background; },
            setBackground: (next) => { assignSlideBackground(slide, next); },
        };
    }
    if (target.kind === "notesMaster") {
        return resolveAuxMaster(pres.notesMasters, target.masterId);
    }
    if (target.kind === "handoutMaster") {
        return resolveAuxMaster(pres.handoutMasters, target.masterId);
    }
    if (target.kind === "master") {
        const master = pres.masters?.find((m) => m.id === target.masterId);
        if (!master)
            return null;
        return {
            shapes: master.shapes,
            setShapes: (next) => { master.shapes = next; },
            get background() { return master.background; },
            setBackground: (next) => { assignSlideBackground(master, next); },
        };
    }
    const master = pres.masters?.find((m) => m.id === target.masterId);
    const layout = master?.layouts?.find((l) => l.id === target.layoutId);
    if (!layout)
        return null;
    return {
        shapes: layout.shapes,
        setShapes: (next) => { layout.shapes = next; },
        get background() { return layout.background; },
        setBackground: (next) => { assignSlideBackground(layout, next); },
    };
}
function resolveAuxMaster(masters, masterId) {
    const master = masters?.find((m) => m.id === masterId);
    if (!master)
        return null;
    return {
        shapes: master.shapes,
        setShapes: (next) => { master.shapes = next; },
        get background() { return master.background; },
        setBackground: (next) => { assignSlideBackground(master, next); },
    };
}
function backgroundHost(pres, target) {
    if (target.kind === "slide")
        return pres.slides[target.slideIdx];
    if (target.kind === "notesMaster")
        return pres.notesMasters?.find((m) => m.id === target.masterId);
    if (target.kind === "handoutMaster")
        return pres.handoutMasters?.find((m) => m.id === target.masterId);
    if (target.kind === "master")
        return pres.masters?.find((m) => m.id === target.masterId);
    const master = pres.masters?.find((m) => m.id === target.masterId);
    return master?.layouts?.find((l) => l.id === target.layoutId);
}
// editable shape locator —— commands.ts 内所有 Cmd 的统一入口。
// 拒绝 master/layout 副本层的 shape：那是 parser 注入的只读副本（layer.id === "master"|"layout"），
// 改它们只会污染内存模型；导出 .pptx 时 serializer 会按 mainLayer 过滤掉，造成数据丢失。
// 真正改母版要走「母版视图」（EditorContext=master，命令经 master / layout EditTarget 直接改 pres.masters）。
//
// 对每个 (slideIdx, id) 第一次拒绝时 console.warn，后续静默 no-op，避免日志爆炸。
const _readonlyWarnedKeys = new Set();
function warnReadonlyHit(slideIdx, id, layerId) {
    const key = `${slideIdx}/${id}/${layerId}`;
    if (_readonlyWarnedKeys.has(key))
        return;
    _readonlyWarnedKeys.add(key);
    console.warn(`[editor] cmd ignored: shape "${id}" lives in read-only ${layerId} layer of slide ${slideIdx}. ` +
        `To edit master/layout decoration, switch to master view.`);
}
function shapeAt(pres, slideIdx, id) {
    const slide = pres.slides[slideIdx];
    if (slide) {
        const found = findShapeWithLayer(slide, id);
        if (found) {
            if (isMasterCopyLayer(found.layer)) {
                // 阶段 2.1 起 parser 不再注入 master/layout 副本到 slide.layers；如果还命中，
                // 一定是异常状态（旧 parser 或测试 fixture）。仍按只读处理避免污染。
                warnReadonlyHit(slideIdx, id, found.layer.id);
                return undefined;
            }
            return found.shape;
        }
    }
    // 阶段 2.2：editor 母版视图下，shape 实际位于 pres.masters[].shapes 或 [].layouts[].shapes，
    // 不在 pres.slides[slideIdx] 内。这里兜底搜一遍 deck masters，让通用 cmd 在母版视图下也能工作。
    return findInMasters(pres, id);
}
function findInMasters(pres, id) {
    if (!pres.masters)
        return undefined;
    for (const m of pres.masters) {
        const f = findInList(m.shapes, id);
        if (f)
            return f;
        for (const l of m.layouts ?? []) {
            const ff = findInList(l.shapes, id);
            if (ff)
                return ff;
        }
    }
    return undefined;
}
function findInList(shapes, id) {
    for (const s of shapes) {
        if (s.id === id)
            return s;
        if (s.kind === "group") {
            const f = findInList(s.children, id);
            if (f)
                return f;
        }
    }
    return undefined;
}
// 兼容入口：少数读侧调用方（renderer / inspector 查询）仍想访问 master 副本的 shape
// 字段（例如读 bbox 显示选区轮廓），不应被 editable guard 拦截。本文件内未使用，
// 导出以便上层（ribbon.ts / inspector.ts）选区联动时使用。
export function shapeAtAnyLayer(pres, slideIdx, id) {
    const slide = pres.slides[slideIdx];
    if (!slide)
        return undefined;
    return findShape(slide, id);
}
function resolveSyntheticTextBox(pres, slideIdx, s) {
    const slide = pres.slides[slideIdx];
    if (!slide)
        return s;
    const id = syntheticTextBoxGroupId(slide, s.id);
    if (id === s.id)
        return s;
    return shapeAt(pres, slideIdx, id) ?? s;
}
export class MoveShapeCmd {
    slideIdx;
    id;
    dx;
    dy;
    label = "Move";
    constructor(slideIdx, id, dx, dy) {
        this.slideIdx = slideIdx;
        this.id = id;
        this.dx = dx;
        this.dy = dy;
    }
    apply(pres) {
        const root = shapeAt(pres, this.slideIdx, this.id);
        if (!root)
            return;
        const s = resolveSyntheticTextBox(pres, this.slideIdx, root);
        translateShape(s, this.dx, this.dy);
        markDirty(s, "bbox");
        followGluedConnectors(pres, this.slideIdx, s);
    }
    revert(pres) {
        const root = shapeAt(pres, this.slideIdx, this.id);
        if (!root)
            return;
        const s = resolveSyntheticTextBox(pres, this.slideIdx, root);
        translateShape(s, -this.dx, -this.dy);
        followGluedConnectors(pres, this.slideIdx, s);
    }
}
function translateShape(s, dx, dy) {
    s.bbox = { ...s.bbox, x: s.bbox.x + dx, y: s.bbox.y + dy };
    if (s.kind === "line") {
        s.x1 += dx;
        s.y1 += dy;
        s.x2 += dx;
        s.y2 += dy;
    }
    // polygon points 是绝对坐标（见 makeShape: triangle / star），平移必须同步走。
    if (s.kind === "polygon") {
        s.points = s.points.map((p) => [p[0] + dx, p[1] + dy]);
    }
    // path 形状若是编辑器添加的 preset（带 presetType），按新 bbox 重新生成 d；
    // 解析自 PPTX 的自定义几何 path（无 presetType）则平移 d 串本身 —— 渲染层用绝对
    // 坐标的 d 直接画（svg/canvas 都不按 bbox 偏移 path），只动 bbox 会让选框移动而
    // 图形原地不动，表现为"拖不动"。
    if (s.kind === "path") {
        if (s.presetType)
            regeneratePathFromPreset(s);
        else
            s.d = translatePathD(s.d, dx, dy);
    }
    if (s.kind === "group")
        for (const c of s.children)
            translateShape(c, dx, dy);
}
let _presetRegen = null;
export function registerPathPresetRegenerator(fn) {
    _presetRegen = fn;
}
function regeneratePathFromPreset(s) {
    if (!_presetRegen || !s.presetType)
        return;
    _presetRegen(s);
}
function followGluedConnectors(pres, slideIdx, target) {
    const slide = pres.slides[slideIdx];
    if (!slide)
        return;
    for (const p of followGlueToSites(slide, target))
        regeneratePathFromPreset(p);
}
function reattachAndFollowGlue(pres, slideIdx, target) {
    const slide = pres.slides[slideIdx];
    if (!slide)
        return;
    const self = reattachConnectorGlue(slide, target);
    if (self)
        regeneratePathFromPreset(self);
    followGluedConnectors(pres, slideIdx, target);
}
/** 拖动线条端点手柄后写回 (x1,y1,x2,y2) + 派生 bbox。 */
export class SetLineEndpointsCmd {
    slideIdx;
    id;
    endpoints;
    bbox;
    glue;
    label = "Adjust line";
    prev;
    constructor(slideIdx, id, endpoints, bbox, glue) {
        this.slideIdx = slideIdx;
        this.id = id;
        this.endpoints = endpoints;
        this.bbox = bbox;
        this.glue = glue;
    }
    apply(pres) {
        const s = shapeAt(pres, this.slideIdx, this.id);
        if (!s || s.kind !== "line")
            return;
        if (!this.prev) {
            this.prev = {
                bbox: { ...s.bbox },
                line: { x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2 },
                startCxn: s.startCxn ? { ...s.startCxn } : undefined,
                endCxn: s.endCxn ? { ...s.endCxn } : undefined,
            };
        }
        s.x1 = this.endpoints.x1;
        s.y1 = this.endpoints.y1;
        s.x2 = this.endpoints.x2;
        s.y2 = this.endpoints.y2;
        s.bbox = { ...this.bbox };
        if (this.glue) {
            if (this.glue.startCxn === null)
                delete s.startCxn;
            else if (this.glue.startCxn)
                s.startCxn = this.glue.startCxn;
            if (this.glue.endCxn === null)
                delete s.endCxn;
            else if (this.glue.endCxn)
                s.endCxn = this.glue.endCxn;
        }
        markDirty(s, "bbox");
    }
    revert(pres) {
        const s = shapeAt(pres, this.slideIdx, this.id);
        if (!s || !this.prev)
            return;
        restorePositions(s, new Map([[this.id, this.prev]]));
        if (s.kind === "line") {
            if (this.prev.startCxn)
                s.startCxn = this.prev.startCxn;
            else
                delete s.startCxn;
            if (this.prev.endCxn)
                s.endCxn = this.prev.endCxn;
            else
                delete s.endCxn;
        }
    }
}
/** 拖动肘形 / 曲线连接符端点后写回 bbox + flip + 粘附。 */
export class SetPathConnectorEndsCmd {
    slideIdx;
    id;
    bbox;
    scaleX;
    scaleY;
    glue;
    label = "Adjust connector";
    prev;
    constructor(slideIdx, id, bbox, scaleX, scaleY, glue) {
        this.slideIdx = slideIdx;
        this.id = id;
        this.bbox = bbox;
        this.scaleX = scaleX;
        this.scaleY = scaleY;
        this.glue = glue;
    }
    apply(pres) {
        const s = shapeAt(pres, this.slideIdx, this.id);
        if (!s || s.kind !== "path")
            return;
        if (!this.prev) {
            this.prev = {
                bbox: { ...s.bbox },
                pathD: s.d,
                scaleX: s.transform?.scaleX ?? 1,
                scaleY: s.transform?.scaleY ?? 1,
                rotation: s.transform?.rotation ?? 0,
                startCxn: s.startCxn ? { ...s.startCxn } : undefined,
                endCxn: s.endCxn ? { ...s.endCxn } : undefined,
            };
        }
        s.bbox = { ...this.bbox };
        s.transform = {
            ...s.transform,
            rotation: 0,
            tx: 0,
            ty: 0,
            scaleX: this.scaleX,
            scaleY: this.scaleY,
        };
        if (this.glue) {
            if (this.glue.startCxn === null)
                delete s.startCxn;
            else if (this.glue.startCxn)
                s.startCxn = this.glue.startCxn;
            if (this.glue.endCxn === null)
                delete s.endCxn;
            else if (this.glue.endCxn)
                s.endCxn = this.glue.endCxn;
        }
        regeneratePathFromPreset(s);
        markDirty(s, "bbox");
    }
    revert(pres) {
        const s = shapeAt(pres, this.slideIdx, this.id);
        if (!s || s.kind !== "path" || !this.prev)
            return;
        s.bbox = { ...this.prev.bbox };
        s.transform = {
            ...s.transform,
            rotation: this.prev.rotation,
            tx: 0,
            ty: 0,
            scaleX: this.prev.scaleX,
            scaleY: this.prev.scaleY,
        };
        if (this.prev.pathD !== undefined)
            s.d = this.prev.pathD;
        if (this.prev.startCxn)
            s.startCxn = this.prev.startCxn;
        else
            delete s.startCxn;
        if (this.prev.endCxn)
            s.endCxn = this.prev.endCxn;
        else
            delete s.endCxn;
        markDirty(s, "bbox");
    }
}
/** 拖动多边形顶点手柄后写回 points + 派生 bbox。 */
export class SetPolygonPointsCmd {
    slideIdx;
    id;
    points;
    bbox;
    label = "Edit points";
    prev;
    constructor(slideIdx, id, points, bbox) {
        this.slideIdx = slideIdx;
        this.id = id;
        this.points = points;
        this.bbox = bbox;
    }
    apply(pres) {
        const s = shapeAt(pres, this.slideIdx, this.id);
        if (!s || s.kind !== "polygon")
            return;
        if (!this.prev) {
            this.prev = {
                bbox: { ...s.bbox },
                points: s.points.map((p) => [p[0], p[1]]),
            };
        }
        s.points = this.points.map((p) => [p[0], p[1]]);
        s.bbox = { ...this.bbox };
        markDirty(s, "bbox");
    }
    revert(pres) {
        const s = shapeAt(pres, this.slideIdx, this.id);
        if (!s || !this.prev)
            return;
        restorePositions(s, new Map([[this.id, this.prev]]));
    }
}
/** 拖动预设几何黄色调整锚点后写回 avLst（presetAdj）并重算 path。 */
export class SetPresetAdjCmd {
    slideIdx;
    id;
    nextAdj;
    label = "Adjust shape";
    prevAdj;
    prevD;
    prevFillRule;
    constructor(slideIdx, id, nextAdj) {
        this.slideIdx = slideIdx;
        this.id = id;
        this.nextAdj = nextAdj;
    }
    apply(pres) {
        const s = shapeAt(pres, this.slideIdx, this.id);
        if (!s || s.kind !== "path" || !s.presetType)
            return;
        if (this.prevAdj === undefined) {
            this.prevAdj = s.presetAdj ? { ...s.presetAdj } : {};
            this.prevD = s.d;
            this.prevFillRule = s.fillRule;
        }
        s.presetAdj = { ...this.nextAdj };
        regeneratePathFromPreset(s);
        markDirty(s, "bbox");
    }
    revert(pres) {
        const s = shapeAt(pres, this.slideIdx, this.id);
        if (!s || s.kind !== "path" || this.prevAdj === undefined)
            return;
        if (Object.keys(this.prevAdj).length)
            s.presetAdj = { ...this.prevAdj };
        else
            delete s.presetAdj;
        if (this.prevD !== undefined)
            s.d = this.prevD;
        if (this.prevFillRule)
            s.fillRule = this.prevFillRule;
        else
            delete s.fillRule;
    }
}
export class ResizeShapeCmd {
    slideIdx;
    id;
    next;
    label = "Resize";
    snapshot;
    smartArtRevert;
    constructor(slideIdx, id, next) {
        this.slideIdx = slideIdx;
        this.id = id;
        this.next = next;
    }
    apply(pres) {
        const root = shapeAt(pres, this.slideIdx, this.id);
        if (!root)
            return;
        const s = resolveSyntheticTextBox(pres, this.slideIdx, root);
        if (s.kind === "group" && s.smartArtMeta) {
            const items = extractSmartArtItems(s);
            this.smartArtRevert = { bbox: { ...s.bbox }, items: items.map((it) => ({ ...it })) };
            s.bbox = { ...this.next };
            rebuildSmartArtChildren(s, items);
            markDirty(s, "bbox");
            followGluedConnectors(pres, this.slideIdx, s);
            return;
        }
        this.snapshot = new Map();
        collectPositions(s, this.snapshot);
        const prev = { ...s.bbox };
        rescale(s, prev, this.next);
        s.bbox = { ...this.next };
        markDirty(s, "bbox");
        reattachAndFollowGlue(pres, this.slideIdx, s);
    }
    revert(pres) {
        const root = shapeAt(pres, this.slideIdx, this.id);
        if (!root)
            return;
        const s = resolveSyntheticTextBox(pres, this.slideIdx, root);
        if (!s)
            return;
        if (s.kind === "group" && s.smartArtMeta && this.smartArtRevert) {
            s.bbox = { ...this.smartArtRevert.bbox };
            rebuildSmartArtChildren(s, this.smartArtRevert.items);
            followGluedConnectors(pres, this.slideIdx, s);
            return;
        }
        if (!this.snapshot)
            return;
        restorePositions(s, this.snapshot);
        followGluedConnectors(pres, this.slideIdx, s);
    }
}
function collectPositions(s, out) {
    const entry = { bbox: { ...s.bbox } };
    if (s.kind === "line")
        entry.line = { x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2 };
    if (s.kind === "polygon")
        entry.points = s.points.map((p) => [p[0], p[1]]);
    if (s.kind === "path")
        entry.pathD = s.d;
    if (s.kind === "text")
        entry.textWrap = s.wrap ?? null;
    out.set(s.id, entry);
    if (s.kind === "group")
        for (const c of s.children)
            collectPositions(c, out);
}
function restorePositions(s, src) {
    const r = src.get(s.id);
    if (r) {
        s.bbox = { ...r.bbox };
        if (s.kind === "line" && r.line) {
            s.x1 = r.line.x1;
            s.y1 = r.line.y1;
            s.x2 = r.line.x2;
            s.y2 = r.line.y2;
        }
        if (s.kind === "polygon" && r.points) {
            s.points = r.points.map((p) => [p[0], p[1]]);
        }
        if (s.kind === "path" && r.pathD !== undefined) {
            s.d = r.pathD;
        }
        if (s.kind === "text" && "textWrap" in r) {
            if (r.textWrap == null)
                delete s.wrap;
            else
                s.wrap = r.textWrap;
        }
    }
    if (s.kind === "group")
        for (const c of s.children)
            restorePositions(c, src);
}
function isStackedVert(s) {
    const v = s.vert;
    return v === "wordArtVert" || v === "wordArtVertRtl" || v === "eaVert" || v === "mongolianVert";
}
/**
 * 横排文字框被改宽后按框折行。
 *
 * OOXML wrap="none" 的标题 / WordArt / 数字标签在导入后会单行溢出；用户拖窄
 * 宽度是明确的「改排版」操作，应打开 wrap（竖排堆叠仍按列高折列，不改 wrap）。
 */
export function enableTextWrapOnWidthChange(s, prevW, nextW) {
    if (Math.abs(nextW - prevW) < 0.5)
        return;
    const walk = (sh) => {
        if (sh.kind === "text" && !isStackedVert(sh) && sh.wrap === false)
            sh.wrap = true;
        if (sh.kind === "group")
            for (const c of sh.children)
                walk(c);
    };
    walk(s);
}
function rescale(s, prev, next) {
    enableTextWrapOnWidthChange(s, prev.w, next.w);
    const sx = prev.w === 0 ? 1 : next.w / prev.w;
    const sy = prev.h === 0 ? 1 : next.h / prev.h;
    if (s.kind === "line") {
        s.x1 = next.x + (s.x1 - prev.x) * sx;
        s.y1 = next.y + (s.y1 - prev.y) * sy;
        s.x2 = next.x + (s.x2 - prev.x) * sx;
        s.y2 = next.y + (s.y2 - prev.y) * sy;
        return;
    }
    if (s.kind === "polygon") {
        s.points = s.points.map((p) => [next.x + (p[0] - prev.x) * sx, next.y + (p[1] - prev.y) * sy]);
        return;
    }
    if (s.kind === "path" && s.presetType) {
        s.bbox = { ...next };
        regeneratePathFromPreset(s);
        return;
    }
    if (s.kind !== "group")
        return;
    const walk = (c) => {
        const rx = c.bbox.x - prev.x;
        const ry = c.bbox.y - prev.y;
        c.bbox = {
            x: next.x + rx * sx,
            y: next.y + ry * sy,
            w: c.bbox.w * sx,
            h: c.bbox.h * sy,
        };
        if (c.kind === "line") {
            c.x1 = next.x + (c.x1 - prev.x) * sx;
            c.y1 = next.y + (c.y1 - prev.y) * sy;
            c.x2 = next.x + (c.x2 - prev.x) * sx;
            c.y2 = next.y + (c.y2 - prev.y) * sy;
        }
        if (c.kind === "polygon") {
            c.points = c.points.map((p) => [next.x + (p[0] - prev.x) * sx, next.y + (p[1] - prev.y) * sy]);
        }
        if (c.kind === "path" && c.presetType) {
            regeneratePathFromPreset(c);
        }
        if (c.kind === "group")
            for (const cc of c.children)
                walk(cc);
    };
    for (const c of s.children)
        walk(c);
}
export class DeleteShapeCmd {
    slideIdx;
    id;
    target;
    label = "Delete";
    // layerIdx = -1 表示删自 master/layout 的扁平 shapes 数组（无 layer 概念）。
    removed;
    // 阶段 2.2：target 缺省走 slide.layers；母版视图下传 master/layout target，
    // 直接操作 pres.masters[].shapes / [].layouts[].shapes。
    constructor(slideIdx, id, target) {
        this.slideIdx = slideIdx;
        this.id = id;
        this.target = target;
    }
    apply(pres) {
        if (this.target && this.target.kind !== "slide") {
            const container = resolveTarget(pres, this.target);
            if (!container)
                return;
            const arr = container.shapes;
            const pos = arr.findIndex((s) => s.id === this.id);
            if (pos < 0)
                return;
            this.removed = { shape: arr[pos], layerIdx: -1, pos };
            arr.splice(pos, 1);
            container.setShapes(arr);
            return;
        }
        const slide = pres.slides[this.slideIdx];
        if (!slide)
            return;
        for (let li = 0; li < slide.layers.length; li++) {
            const layer = slide.layers[li];
            const pos = layer.shapes.findIndex((s) => s.id === this.id);
            if (pos < 0)
                continue;
            if (isMasterCopyLayer(layer)) {
                // 拒绝删除 master/layout 副本：会污染内存模型但导出时不写回原 master.xml，
                // 用户视角"删了但又出现"。真正改母版要走母版视图（阶段 2）。
                warnReadonlyHit(this.slideIdx, this.id, layer.id);
                return;
            }
            this.removed = { shape: layer.shapes[pos], layerIdx: li, pos };
            layer.shapes.splice(pos, 1);
            return;
        }
    }
    revert(pres) {
        if (!this.removed)
            return;
        if (this.removed.layerIdx === -1) {
            if (!this.target)
                return;
            const container = resolveTarget(pres, this.target);
            if (!container)
                return;
            const arr = container.shapes;
            arr.splice(this.removed.pos, 0, this.removed.shape);
            container.setShapes(arr);
            return;
        }
        const slide = pres.slides[this.slideIdx];
        if (!slide)
            return;
        const layer = slide.layers[this.removed.layerIdx];
        if (!layer)
            return;
        layer.shapes.splice(this.removed.pos, 0, this.removed.shape);
    }
}
export class EditTextCmd {
    slideIdx;
    id;
    nextParagraphs;
    label = "Edit text";
    // §对齐 OOXML 段落与 run 的完整结构：commit 时保存 paragraphs 全量深拷贝，
    // 仅当段文本变化时才重建该段；段级属性（align / bullet / indent / lineHeight /
    // defRunStyle 等）始终从 prev 继承，确保 revert 能 1:1 恢复，避免反复双击进入
    // 编辑后即丢失多 run 样式。参考 ECMA-376 §21.1.2 ‹txBody›。
    prevParagraphs;
    constructor(slideIdx, id, nextParagraphs) {
        this.slideIdx = slideIdx;
        this.id = id;
        this.nextParagraphs = nextParagraphs;
    }
    apply(pres) {
        const s = shapeAt(pres, this.slideIdx, this.id);
        if (!s)
            return;
        const text = pickTextShape(s);
        if (!text || text.kind !== "text")
            return;
        this.prevParagraphs = text.paragraphs.map(deepClone);
        const prev = this.prevParagraphs;
        const fallbackRun = prev[0]?.runs[0] ?? { text: "" };
        const fallbackParaShape = (() => {
            if (!prev[0])
                return {};
            const cloned = deepClone(prev[0]);
            // 丢弃 runs，只保留段级属性模板。
            const { runs: _drop, ...rest } = cloned;
            return rest;
        })();
        text.paragraphs = this.nextParagraphs.map((line, i) => {
            const p = prev[i];
            if (p) {
                if (paragraphText(p) === line) {
                    // 段文本未变：原样克隆（包括所有 paragraph-level 与 run-level 样式）。
                    return deepClone(p);
                }
                // 段文本变化：保留段级属性，按原 runs 长度比例把新文本分布回去，
                // 这样多 run 段（如「Texts of multiple styles」混合粗体/斜体/上标/阴影）
                // 在用户局部修改后仍尽量保留每个 run 的样式分布。
                const cloned = deepClone(p);
                cloned.runs = redistributeText(p.runs, line);
                return cloned;
            }
            // 新增段：沿用第一段的段级属性模板 + 第一段第一个 run 的样式。
            return {
                ...deepClone(fallbackParaShape),
                runs: [{ ...deepClone(fallbackRun), text: line }],
            };
        });
        markDirty(text, "text");
    }
    revert(pres) {
        const s = shapeAt(pres, this.slideIdx, this.id);
        if (!s || !this.prevParagraphs)
            return;
        const text = pickTextShape(s);
        if (!text || text.kind !== "text")
            return;
        text.paragraphs = this.prevParagraphs.map(deepClone);
    }
}
function deepClone(v) {
    return JSON.parse(JSON.stringify(v));
}
function paragraphText(p) {
    return p.runs.map((r) => r.text).join("");
}
// 把新文本按原 runs 的长度比例分布回 runs：保留每个 run 的样式，仅替换 text 字段。
// baseRuns 长度为 1 时直接套样式；为 0 时退化为单空 run（实际不会进入此分支，
// 因为段必然有至少 1 个 run）。当原 runs 总长度为 0 时，把全部新文本给第一个 run、
// 其它 run 文本置空（保留它们的样式占位，便于后续重新输入恢复）。
function redistributeText(baseRuns, next) {
    if (baseRuns.length === 0)
        return [{ text: next }];
    if (baseRuns.length === 1)
        return [{ ...deepClone(baseRuns[0]), text: next }];
    const lens = baseRuns.map((r) => r.text.length);
    const total = lens.reduce((a, b) => a + b, 0);
    if (total === 0) {
        return baseRuns.map((r, i) => ({ ...deepClone(r), text: i === 0 ? next : "" }));
    }
    let consumed = 0;
    const out = [];
    for (let i = 0; i < baseRuns.length; i++) {
        const isLast = i === baseRuns.length - 1;
        const portion = isLast ? next.length - consumed : Math.round((lens[i] / total) * next.length);
        const slice = next.slice(consumed, consumed + Math.max(0, portion));
        out.push({ ...deepClone(baseRuns[i]), text: slice });
        consumed += slice.length;
    }
    return out;
}
function pickTextShape(s) {
    if (s.kind === "text")
        return s;
    if (s.kind === "group") {
        for (const c of s.children)
            if (c.kind === "text")
                return c;
    }
    return undefined;
}
/** 与 {@link SetFillCmd} 相同的填充落点：整表单元格、multiPath 的 fill 拆分，否则样式基底。 */
export function fillTargetsFor(pres, slideIdx, id) {
    const root = shapeAt(pres, slideIdx, id);
    return root ? fillPaintTargets(root) : [];
}
function fillPaintTargets(root) {
    const cells = tableCellsOf(root);
    if (cells)
        return cells;
    const splits = multiPathSplitChildren(root, "fill");
    if (splits)
        return splits;
    const one = pickStyleTarget(root);
    return one ? [one] : [];
}
export class SetFillCmd {
    slideIdx;
    id;
    next;
    label = "Set fill";
    prev;
    // 表格 group / multiPath autoshape 走批量路径时，逐 child 记录原值，revert
    // 时按 id 精确还原；这种情况下 prev 字段不使用。两类批量场景都用同一字段：
    //  - tableCellsOf：children 是表格 cells（直挂在 root.children 上）
    //  - multiPathSplitChildren：children 是 _pNf split paths（嵌在 root._base.children 上）
    batchPrev;
    constructor(slideIdx, id, next) {
        this.slideIdx = slideIdx;
        this.id = id;
        this.next = next;
    }
    apply(pres) {
        const root = shapeAt(pres, this.slideIdx, this.id);
        if (!root)
            return;
        const targets = fillPaintTargets(root);
        if (targets.length === 0)
            return;
        const batched = !!tableCellsOf(root) || !!multiPathSplitChildren(root, "fill");
        if (batched) {
            this.batchPrev = targets.map((c) => ({ id: c.id, prev: c.fill }));
            for (const c of targets) {
                c.fill = this.next;
                markDirty(c, "fill");
            }
            markDirty(root, "fill");
            return;
        }
        const s = targets[0];
        this.prev = s.fill;
        s.fill = this.next;
        markDirty(s, "fill");
    }
    revert(pres) {
        const root = shapeAt(pres, this.slideIdx, this.id);
        if (!root)
            return;
        if (this.batchPrev) {
            if (root.kind !== "group")
                return;
            const byId = collectIndexedChildren(root);
            for (const e of this.batchPrev) {
                const c = byId.get(e.id);
                if (c)
                    c.fill = e.prev;
            }
            return;
        }
        const s = pickStyleTarget(root);
        if (!s)
            return;
        s.fill = this.prev;
    }
}
export class SetStrokeCmd {
    slideIdx;
    id;
    next;
    label = "Set stroke";
    prev;
    // 同 SetFillCmd：表格 cells 与 multiPath split paths 都走 batchPrev。
    batchPrev;
    constructor(slideIdx, id, next) {
        this.slideIdx = slideIdx;
        this.id = id;
        this.next = next;
    }
    apply(pres) {
        const root = shapeAt(pres, this.slideIdx, this.id);
        if (!root)
            return;
        const cells = tableCellsOf(root);
        if (cells) {
            this.batchPrev = cells.map((c) => ({ id: c.id, prev: c.stroke }));
            for (const c of cells) {
                c.stroke = this.next;
                markDirty(c, "stroke");
            }
            markDirty(root, "stroke");
            return;
        }
        const splits = multiPathSplitChildren(root, "stroke");
        if (splits) {
            this.batchPrev = splits.map((c) => ({ id: c.id, prev: c.stroke }));
            for (const c of splits) {
                c.stroke = this.next;
                markDirty(c, "stroke");
            }
            markDirty(root, "stroke");
            return;
        }
        const s = pickStyleTarget(root);
        if (!s)
            return;
        this.prev = s.stroke;
        s.stroke = this.next;
        markDirty(s, "stroke");
    }
    revert(pres) {
        const root = shapeAt(pres, this.slideIdx, this.id);
        if (!root)
            return;
        if (this.batchPrev) {
            if (root.kind !== "group")
                return;
            const byId = collectIndexedChildren(root);
            for (const e of this.batchPrev) {
                const c = byId.get(e.id);
                if (c)
                    c.stroke = e.prev;
            }
            return;
        }
        const s = pickStyleTarget(root);
        if (!s)
            return;
        s.stroke = this.prev;
    }
}
// 收集 group 下「直接 children + multiPath base group 的 children」两层索引。
// 表格 cells 命中第一层，multiPath _pNf / _pNs split paths 命中第二层；
// 这样 SetFill/SetStrokeCmd 的 revert 路径可以统一走 batchPrev → byId 的还原。
function collectIndexedChildren(root) {
    const byId = new Map();
    for (const c of root.children) {
        byId.set(c.id, c);
        if (c.kind === "group" && c.id.endsWith("_base")) {
            for (const inner of c.children)
                byId.set(inner.id, inner);
        }
    }
    return byId;
}
function pickStyleTarget(s) {
    if (!s)
        return undefined;
    if (s.kind === "group") {
        for (const c of s.children) {
            if (c.id.endsWith("_base"))
                return c;
        }
        return s.children[0];
    }
    return s;
}
// 当 root 是 multiPath autoshape（顶层 group → `<id>_base` group → 拆出 `_pNf`
// / `_pNs` 的 split paths）时，返回需要批量改 fill / stroke 的目标 children；
// 其它情况返回 null，由调用方走 pickStyleTarget 的单点路径。
//
// shapes.ts §multiPath 拆分：fillChildren id="<id>_p{i}f"（仅挂 fill）、
// strokeChildren id="<id>_p{i}s"（仅挂 stroke）。所以"读 fill / 读 stroke /
// 改 fill / 改 stroke"必须分别落到对应一组 split path 上，否则 inspector 显
// 示和 SetFill/SetStrokeCmd 都会"作用在 _base group 自身"——而 _base group
// 不参与渲染，结果就是 quicktour slide9 Down Ribbon / Vertical Scroll 这种
// 「属性面板看不到 stroke、改了也无效」的现象。
const FILL_SPLIT_RE = /_p\d+f$/;
const STROKE_SPLIT_RE = /_p\d+s$/;
function multiPathSplitChildren(root, kind) {
    if (!root || root.kind !== "group")
        return null;
    const base = root.children.find((c) => c.id.endsWith("_base"));
    if (!base || base.kind !== "group")
        return null;
    const re = kind === "fill" ? FILL_SPLIT_RE : STROKE_SPLIT_RE;
    const split = base.children.filter((c) => re.test(c.id));
    return split.length > 0 ? split : null;
}
// 当 shape 是带 tableMeta 的 group，返回该表格下的所有非 hidden cell（每个 cell 为
// 独立 TextShape）。其它情况返回 null —— 调用方应继续走"单 shape / pickStyleTarget"
// 的原有路径。这里集中表达"把属性应用到整张表格的所有单元格"的语义，避免
// pickStyleTarget 退化成 children[0]（只改了第一个 cell）带来的 footgun。
function tableCellsOf(s) {
    if (!s)
        return null;
    if (s.kind !== "group")
        return null;
    if (!s.tableMeta)
        return null;
    return s.children.filter((c) => !c.cellMeta?.hidden);
}
export class SetTextStyleCmd {
    slideIdx;
    id;
    patch;
    ranges;
    label = "Text style";
    // by-reference Map：key 是 TextRun 对象，apply 时直接用 rAny[k] = … 改属性，
    // 不会替换对象引用，所以 revert 可以遍历 Map 直接还原，不必再次走 shape 树。
    // 字符选区会拆 run，引用对不上，改走整段快照。
    prev;
    prevParagraphs;
    constructor(slideIdx, id, patch, ranges) {
        this.slideIdx = slideIdx;
        this.id = id;
        this.patch = patch;
        this.ranges = ranges;
    }
    apply(pres) {
        const root = shapeAt(pres, this.slideIdx, this.id);
        if (!root)
            return;
        const texts = collectTextShapes(root);
        if (texts.length === 0)
            return;
        if (this.ranges && this.ranges.length > 0 && texts.length === 1) {
            const text = texts[0];
            this.prevParagraphs = text.paragraphs.map(deepClone);
            text.paragraphs = applyStyleToCharRanges(this.prevParagraphs, this.ranges, this.patch);
            markDirty(text, "textStyle");
            return;
        }
        this.prev = new Map();
        for (const text of texts) {
            for (const p of text.paragraphs) {
                for (const r of p.runs) {
                    const before = {};
                    const rAny = r;
                    for (const k of Object.keys(this.patch)) {
                        before[k] = rAny[k];
                    }
                    if (this.patch.color !== undefined &&
                        !Object.prototype.hasOwnProperty.call(this.patch, "fill") &&
                        r.fill?.kind === "solid" &&
                        r.fill.color !== this.patch.color) {
                        before.fill = r.fill;
                    }
                    patchTextRun(r, this.patch);
                    this.prev.set(r, before);
                }
            }
            markDirty(text, "textStyle");
        }
    }
    revert(pres) {
        if (this.prevParagraphs) {
            const root = shapeAt(pres, this.slideIdx, this.id);
            const text = root ? pickTextShape(root) : undefined;
            if (text && text.kind === "text")
                text.paragraphs = this.prevParagraphs.map(deepClone);
            return;
        }
        if (!this.prev)
            return;
        for (const [r, before] of this.prev) {
            const rAny = r;
            const beforeAny = before;
            for (const k of Object.keys(before)) {
                rAny[k] = beforeAny[k];
            }
        }
    }
}
const RUN_FORMAT_KEYS = [
    "fontFamily",
    "fontSize",
    "fontWeight",
    "italic",
    "underline",
    "strikethrough",
    "color",
    "textOutline",
    "effects",
    "baseline",
    "letterSpacing",
    "highlight",
    "caps",
    "hyperlink",
];
/** 清除选中文本框内所有 run 的字符格式（保留文字与段落级属性）。 */
export class ClearTextFormattingCmd {
    slideIdx;
    id;
    label = "Clear formatting";
    prev;
    constructor(slideIdx, id) {
        this.slideIdx = slideIdx;
        this.id = id;
    }
    apply(pres) {
        const root = shapeAt(pres, this.slideIdx, this.id);
        if (!root)
            return;
        const texts = collectTextShapes(root);
        if (texts.length === 0)
            return;
        this.prev = new Map();
        for (const text of texts) {
            for (const p of text.paragraphs) {
                for (const r of p.runs) {
                    this.prev.set(r, deepClone(r));
                    const rAny = r;
                    for (const k of RUN_FORMAT_KEYS)
                        delete rAny[k];
                }
            }
            markDirty(text, "textStyle");
        }
    }
    revert(_pres) {
        if (!this.prev)
            return;
        for (const [r, before] of this.prev) {
            const rAny = r;
            const bAny = before;
            for (const k of RUN_FORMAT_KEYS) {
                if (k in bAny)
                    rAny[k] = bAny[k];
                else
                    delete rAny[k];
            }
            rAny.text = before.text;
        }
    }
}
// 收集"样式命令"应该作用到的 TextShape 集合：
// - 普通 shape：pickTextShape 行为（text shape 或 group 里第一个 text）。
// - 带 tableMeta 的 group：所有非 hidden cell（cell 全是 TextShape）。
// 这样 table 选中后改文本样式 = 全表 cell 一并改，与单 cell 选中只改一个 cell 协同。
function collectTextShapes(root) {
    const out = [];
    const cells = tableCellsOf(root);
    if (cells) {
        for (const c of cells)
            if (c.kind === "text")
                out.push(c);
        return out;
    }
    const t = pickTextShape(root);
    if (t && t.kind === "text")
        out.push(t);
    return out;
}
/** 与 {@link SetTextStyleCmd} 相同的文本框：整表单元格，或形状上的文本。 */
export function textShapesForColor(pres, slideIdx, id) {
    const root = shapeAt(pres, slideIdx, id);
    return root ? collectTextShapes(root) : [];
}
export class AddShapeCmd {
    slideIdx;
    layerIdx;
    shape;
    target;
    label = "Add shape";
    constructor(slideIdx, layerIdx, shape, 
    /** 母版视图下插入 master / layout 装饰时传入；缺省走 slide main layer。 */
    target) {
        this.slideIdx = slideIdx;
        this.layerIdx = layerIdx;
        this.shape = shape;
        this.target = target;
    }
    container(pres) {
        if (this.target)
            return resolveTarget(pres, this.target);
        const slide = pres.slides[this.slideIdx];
        const layer = slide?.layers[this.layerIdx];
        if (!layer)
            return null;
        if (isMasterCopyLayer(layer)) {
            warnReadonlyHit(this.slideIdx, this.shape.id, layer.id);
            return null;
        }
        return {
            shapes: layer.shapes,
            setShapes: (next) => { layer.shapes = next; },
            get background() { return slide.background; },
            setBackground: (next) => { assignSlideBackground(slide, next); },
        };
    }
    apply(pres) {
        const c = this.container(pres);
        if (!c)
            return;
        c.shapes.push(this.shape);
    }
    revert(pres) {
        const c = this.container(pres);
        if (!c)
            return;
        const pos = c.shapes.findIndex((s) => s.id === this.shape.id);
        if (pos >= 0)
            c.shapes.splice(pos, 1);
    }
}
function nextDupId(prefix) {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}
function cloneShapeTree(s, rootId) {
    const copy = JSON.parse(JSON.stringify(s));
    let n = 0;
    const walk = (sh, isRoot) => {
        sh.id = isRoot ? rootId : `${rootId}_${(n++).toString(36)}`;
        if (sh.kind === "group")
            for (const c of sh.children)
                walk(c, false);
    };
    walk(copy, true);
    return copy;
}
function offsetShapeTree(s, dx, dy) {
    s.bbox = { ...s.bbox, x: s.bbox.x + dx, y: s.bbox.y + dy };
    if (s.kind === "line") {
        s.x1 += dx;
        s.y1 += dy;
        s.x2 += dx;
        s.y2 += dy;
    }
    if (s.kind === "polygon") {
        s.points = s.points.map((p) => [p[0] + dx, p[1] + dy]);
    }
    if (s.kind === "group")
        for (const c of s.children)
            offsetShapeTree(c, dx, dy);
}
/** Clone a shape (new ids) and insert it on the same layer, offset by dx/dy. */
export class DuplicateShapeCmd {
    slideIdx;
    id;
    dx;
    dy;
    newId;
    label = "Duplicate";
    copy;
    layerIdx = 0;
    insertAt = 0;
    constructor(slideIdx, id, dx = 16, dy = 16, newId = nextDupId("sp_dup")) {
        this.slideIdx = slideIdx;
        this.id = id;
        this.dx = dx;
        this.dy = dy;
        this.newId = newId;
    }
    apply(pres) {
        const slide = pres.slides[this.slideIdx];
        if (!slide)
            return;
        const found = findShapeWithLayer(slide, this.id);
        if (!found)
            return;
        if (isMasterCopyLayer(found.layer)) {
            warnReadonlyHit(this.slideIdx, this.id, found.layer.id);
            return;
        }
        this.layerIdx = slide.layers.indexOf(found.layer);
        if (this.layerIdx < 0)
            return;
        const layer = found.layer;
        const srcIdx = layer.shapes.findIndex((s) => s.id === this.id);
        this.copy = cloneShapeTree(found.shape, this.newId);
        offsetShapeTree(this.copy, this.dx, this.dy);
        this.insertAt = srcIdx >= 0 ? srcIdx + 1 : layer.shapes.length;
        layer.shapes.splice(this.insertAt, 0, this.copy);
        markDirty(this.copy, "bbox");
    }
    revert(pres) {
        if (!this.copy)
            return;
        const layer = pres.slides[this.slideIdx]?.layers[this.layerIdx];
        if (!layer)
            return;
        const pos = layer.shapes.findIndex((s) => s.id === this.copy.id);
        if (pos >= 0)
            layer.shapes.splice(pos, 1);
    }
}
export class SetTextAlignCmd {
    slideIdx;
    id;
    align;
    label = "Align";
    // 用 Map<TextParagraph, prevAlign> 表达"逐段还原"，跨 cell 时仍然安全。
    prev;
    constructor(slideIdx, id, align) {
        this.slideIdx = slideIdx;
        this.id = id;
        this.align = align;
    }
    apply(pres) {
        const root = shapeAt(pres, this.slideIdx, this.id);
        if (!root)
            return;
        const texts = collectTextShapes(root);
        if (texts.length === 0)
            return;
        this.prev = new Map();
        for (const text of texts) {
            for (const p of text.paragraphs) {
                this.prev.set(p, p.align);
                p.align = this.align;
            }
            markDirty(text, "paragraph");
        }
    }
    revert(pres) {
        void pres;
        if (!this.prev)
            return;
        for (const [p, prev] of this.prev) {
            p.align = prev;
        }
    }
}
// 段落级 bullet/numbering 写入。next=undefined 等价于显式清除（ECMA-376 §21.1.2.4.1 buNone）。
// 应用范围：对所选 textShape 内**所有段落**统一设置；这与 PowerPoint 段落游标在
// 单段时设置当前段、多选时设置范围段一致 —— 编辑器目前没有"段落级游标"概念，
// 统一作用于 shape 内所有段落，对单段 placeholder/单段文本框 100% 等价。
//
// PowerPoint 默认 list level 0 的 marL/indent 是 marL=342900 EMU=27pt，
// indent=-342900 EMU=-27pt（hanging indent —— bullet 在 marL+indent=0 处，
// text 从 marL 起）。如果用户在一个 marL=0 indent=0 的段落上加 bullet，bullet
// 与文字会在同一 x 坐标重叠；新加 bullet 时必须把这两个段属性也补上，等价于
// PowerPoint 在 buChar/buAutoNum 同时隐式应用了一组 marL+indent。
//
// 移除 bullet 时（next === undefined）：如果发现段落 marL/indent 与默认 hanging
// 模板一致，可以把这两个字段一并清掉，让段落回到无 list 的"齐左"显示，避免文本
// 留下一个莫名 27pt 缩进。
const DEFAULT_BULLET_MARGIN = 27 * (96 / 72);
const DEFAULT_BULLET_INDENT = -DEFAULT_BULLET_MARGIN;
export class SetParagraphBulletCmd {
    slideIdx;
    id;
    next;
    label = "Bullet";
    // by-reference：Map<TextParagraph, snapshot>，跨 table cell 时段落 reference 唯一，
    // revert 不需要再走一次 shape 树定位。
    prev;
    constructor(slideIdx, id, next) {
        this.slideIdx = slideIdx;
        this.id = id;
        this.next = next;
    }
    apply(pres) {
        const root = shapeAt(pres, this.slideIdx, this.id);
        if (!root)
            return;
        const texts = collectTextShapes(root);
        if (texts.length === 0)
            return;
        this.prev = new Map();
        for (const text of texts) {
            for (const p of text.paragraphs) {
                this.prev.set(p, {
                    bullet: p.bullet,
                    marginLeft: p.marginLeft,
                    indent: p.indent,
                });
                if (this.next === undefined) {
                    delete p.bullet;
                    // 仅清除"明显由 bullet 引入的" hanging indent 模板；如果用户事先手动设过
                    // 其它 marginLeft/indent，保留不动。
                    if (Math.abs((p.marginLeft ?? 0) - DEFAULT_BULLET_MARGIN) < 1e-3)
                        delete p.marginLeft;
                    if (Math.abs((p.indent ?? 0) - DEFAULT_BULLET_INDENT) < 1e-3)
                        delete p.indent;
                }
                else {
                    p.bullet = JSON.parse(JSON.stringify(this.next));
                    // 仅当段落没有"用户级" marL/indent 时补默认 hanging indent，避免覆盖用户
                    // 已经精调过的列表布局。
                    if (p.marginLeft === undefined || p.marginLeft === 0)
                        p.marginLeft = DEFAULT_BULLET_MARGIN;
                    if (p.indent === undefined || p.indent === 0)
                        p.indent = DEFAULT_BULLET_INDENT;
                }
            }
            markDirty(text, "paragraph");
        }
    }
    revert(pres) {
        void pres;
        if (!this.prev)
            return;
        for (const [p, prev] of this.prev) {
            if (prev.bullet === undefined)
                delete p.bullet;
            else
                p.bullet = prev.bullet;
            if (prev.marginLeft === undefined)
                delete p.marginLeft;
            else
                p.marginLeft = prev.marginLeft;
            if (prev.indent === undefined)
                delete p.indent;
            else
                p.indent = prev.indent;
        }
    }
}
/** 段落 RTL（右到左）方向。作用于选中文本框内所有段落。 */
export class SetParagraphRtlCmd {
    slideIdx;
    id;
    rtl;
    label = "Text direction";
    prev;
    constructor(slideIdx, id, rtl) {
        this.slideIdx = slideIdx;
        this.id = id;
        this.rtl = rtl;
    }
    apply(pres) {
        const root = shapeAt(pres, this.slideIdx, this.id);
        if (!root)
            return;
        const texts = collectTextShapes(root);
        if (texts.length === 0)
            return;
        this.prev = new Map();
        for (const text of texts) {
            for (const p of text.paragraphs) {
                this.prev.set(p, p.rtl);
                if (this.rtl)
                    p.rtl = true;
                else
                    delete p.rtl;
            }
            markDirty(text, "paragraph");
        }
    }
    revert(pres) {
        void pres;
        if (!this.prev)
            return;
        for (const [p, prev] of this.prev) {
            if (prev === undefined)
                delete p.rtl;
            else
                p.rtl = prev;
        }
    }
}
/** 东亚排版开关：eaLnBrk + hangingPunct（CJK 换行 / 标点悬挂）。 */
export class SetParagraphCjkCmd {
    slideIdx;
    id;
    enabled;
    label = "East Asian typography";
    prev;
    constructor(slideIdx, id, enabled) {
        this.slideIdx = slideIdx;
        this.id = id;
        this.enabled = enabled;
    }
    apply(pres) {
        const root = shapeAt(pres, this.slideIdx, this.id);
        if (!root)
            return;
        const texts = collectTextShapes(root);
        if (texts.length === 0)
            return;
        this.prev = new Map();
        for (const text of texts) {
            for (const p of text.paragraphs) {
                this.prev.set(p, {
                    eaLnBrk: p.eaLnBrk,
                    latinLnBrk: p.latinLnBrk,
                    hangingPunct: p.hangingPunct,
                });
                if (this.enabled) {
                    p.eaLnBrk = true;
                    p.hangingPunct = true;
                    p.latinLnBrk = false;
                }
                else {
                    delete p.eaLnBrk;
                    delete p.hangingPunct;
                    delete p.latinLnBrk;
                }
            }
            markDirty(text, "paragraph");
        }
    }
    revert(pres) {
        void pres;
        if (!this.prev)
            return;
        for (const [p, prev] of this.prev) {
            if (prev.eaLnBrk === undefined)
                delete p.eaLnBrk;
            else
                p.eaLnBrk = prev.eaLnBrk;
            if (prev.latinLnBrk === undefined)
                delete p.latinLnBrk;
            else
                p.latinLnBrk = prev.latinLnBrk;
            if (prev.hangingPunct === undefined)
                delete p.hangingPunct;
            else
                p.hangingPunct = prev.hangingPunct;
        }
    }
}
const LINE_HEIGHT_PROPS = [
    "lineHeight",
    "lineHeightPx",
    "spaceBeforePx",
    "spaceAfterPx",
    "indent",
    "marginLeft",
    "marginRight",
];
export class SetParagraphSpacingCmd {
    slideIdx;
    id;
    patch;
    label = "Paragraph spacing";
    prev;
    constructor(slideIdx, id, patch) {
        this.slideIdx = slideIdx;
        this.id = id;
        this.patch = patch;
    }
    apply(pres) {
        const root = shapeAt(pres, this.slideIdx, this.id);
        if (!root)
            return;
        const texts = collectTextShapes(root);
        if (texts.length === 0)
            return;
        this.prev = new Map();
        for (const text of texts) {
            for (const p of text.paragraphs) {
                const snap = {};
                const pAny = p;
                for (const k of LINE_HEIGHT_PROPS) {
                    snap[k] = pAny[k];
                }
                this.prev.set(p, snap);
                applySpacingToParagraph(p, this.patch);
            }
            markDirty(text, "paragraph");
        }
    }
    revert(_pres) {
        if (!this.prev)
            return;
        for (const [p, snap] of this.prev) {
            for (const k of LINE_HEIGHT_PROPS) {
                const v = snap[k];
                const pAny = p;
                if (v === undefined)
                    delete pAny[k];
                else
                    pAny[k] = v;
            }
        }
    }
}
function applySpacingToParagraph(p, patch) {
    const pAny = p;
    // lineHeight 与 lineHeightPx 互斥：写入其一时清另一个，避免 OOXML 双轨歧义。
    if ("lineHeight" in patch) {
        if (patch.lineHeight === null || patch.lineHeight === undefined)
            delete pAny.lineHeight;
        else {
            pAny.lineHeight = patch.lineHeight;
            delete pAny.lineHeightPx;
        }
    }
    if ("lineHeightPx" in patch) {
        if (patch.lineHeightPx === null || patch.lineHeightPx === undefined)
            delete pAny.lineHeightPx;
        else {
            pAny.lineHeightPx = patch.lineHeightPx;
            delete pAny.lineHeight;
        }
    }
    for (const k of ["spaceBeforePx", "spaceAfterPx", "indent", "marginLeft", "marginRight"]) {
        if (!(k in patch))
            continue;
        const v = patch[k];
        if (v === null || v === undefined)
            delete pAny[k];
        else
            pAny[k] = v;
    }
}
export class SetRichTextCmd {
    slideIdx;
    id;
    nextParagraphs;
    label = "Rich text";
    prev;
    constructor(slideIdx, id, nextParagraphs) {
        this.slideIdx = slideIdx;
        this.id = id;
        this.nextParagraphs = nextParagraphs;
    }
    apply(pres) {
        const root = shapeAt(pres, this.slideIdx, this.id);
        if (!root)
            return;
        const text = pickTextShape(root);
        if (!text || text.kind !== "text")
            return;
        this.prev = text.paragraphs.map(deepClone);
        text.paragraphs = this.nextParagraphs.map(richParagraphToCore);
        markDirty(text, "text");
    }
    revert(pres) {
        const root = shapeAt(pres, this.slideIdx, this.id);
        if (!root || !this.prev)
            return;
        const text = pickTextShape(root);
        if (!text || text.kind !== "text")
            return;
        text.paragraphs = this.prev.map(deepClone);
    }
}
/** 用完整 paragraphs 替换 text shape 内容（保留 run/段级样式结构）。 */
export class SetParagraphsCmd {
    slideIdx;
    id;
    nextParagraphs;
    label = "Set text";
    prev;
    constructor(slideIdx, id, nextParagraphs) {
        this.slideIdx = slideIdx;
        this.id = id;
        this.nextParagraphs = nextParagraphs;
    }
    apply(pres) {
        const s = shapeAt(pres, this.slideIdx, this.id);
        if (!s)
            return;
        const text = pickTextShape(s);
        if (!text || text.kind !== "text")
            return;
        this.prev = text.paragraphs.map(deepClone);
        text.paragraphs = this.nextParagraphs.map(deepClone);
        markDirty(text, "text");
    }
    revert(pres) {
        const s = shapeAt(pres, this.slideIdx, this.id);
        if (!s || !this.prev)
            return;
        const text = pickTextShape(s);
        if (!text || text.kind !== "text")
            return;
        text.paragraphs = this.prev.map(deepClone);
        markDirty(text, "text");
    }
}
function applyCaseToText(text, mode) {
    if (!text)
        return text;
    switch (mode) {
        case "upper":
            return text.toUpperCase();
        case "lower":
            return text.toLowerCase();
        case "title":
            return text.replace(/\S+/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
        case "sentence": {
            const lower = text.toLowerCase();
            return lower.replace(/(^\s*|[.!?]\s+)([a-z\u00e0-\u024f])/g, (_, sep, ch) => sep + ch.toUpperCase());
        }
    }
}
export class ChangeTextCaseCmd {
    slideIdx;
    id;
    mode;
    label = "Change case";
    prev;
    constructor(slideIdx, id, mode) {
        this.slideIdx = slideIdx;
        this.id = id;
        this.mode = mode;
    }
    apply(pres) {
        const s = shapeAt(pres, this.slideIdx, this.id);
        if (!s)
            return;
        const text = pickTextShape(s);
        if (!text || text.kind !== "text")
            return;
        this.prev = text.paragraphs.map(deepClone);
        for (const p of text.paragraphs) {
            for (const r of p.runs) {
                if (r.text)
                    r.text = applyCaseToText(r.text, this.mode);
            }
        }
        markDirty(text, "text");
    }
    revert(pres) {
        const s = shapeAt(pres, this.slideIdx, this.id);
        if (!s || !this.prev)
            return;
        const text = pickTextShape(s);
        if (!text || text.kind !== "text")
            return;
        text.paragraphs = this.prev.map(deepClone);
        markDirty(text, "text");
    }
}
// ============================================================================
// Format Painter —— 从源 shape 捕获 fill/stroke/opacity/effects/文本样式，
// 应用到目标 shape（复用既有 Set*Cmd，effects 直写 shape 字段）。
// ============================================================================
const TEXT_STYLE_KEYS = [
    "fontFamily",
    "fontSize",
    "fontWeight",
    "italic",
    "underline",
    "strikethrough",
    "color",
    "textOutline",
    "effects",
];
function runToTextStylePatch(run) {
    const patch = {};
    const rAny = run;
    for (const k of TEXT_STYLE_KEYS) {
        if (rAny[k] !== undefined) {
            patch[k] = deepClone(rAny[k]);
        }
    }
    return patch;
}
/** 从当前选中的 shape 捕获可刷格式（首段首 run 的字符样式 + 形状视觉属性）。 */
export function captureFormatSnapshot(shape) {
    const snap = {};
    const visual = pickStyleTarget(shape) ?? shape;
    if (visual.fill !== undefined)
        snap.fill = deepClone(visual.fill);
    if (visual.stroke !== undefined)
        snap.stroke = deepClone(visual.stroke);
    snap.opacity = visual.opacity ?? shape.opacity ?? 1;
    const effectHost = visual.shadow || visual.effects?.length ? visual : shape;
    if (effectHost.shadow || effectHost.effects?.length) {
        snap.copyEffects = true;
        snap.shadow = effectHost.shadow ? deepClone(effectHost.shadow) : undefined;
        snap.effects = effectHost.effects ? effectHost.effects.map(deepClone) : undefined;
    }
    const text = pickTextShape(shape);
    if (text && text.kind === "text") {
        const run = text.paragraphs[0]?.runs[0];
        if (run) {
            const patch = runToTextStylePatch(run);
            if (Object.keys(patch).length > 0)
                snap.textStyle = patch;
        }
        const para = text.paragraphs[0];
        if (para) {
            if (para.align !== undefined)
                snap.textAlign = para.align;
            snap.copyBullet = true;
            snap.bullet = para.bullet ? deepClone(para.bullet) : undefined;
        }
    }
    return snap;
}
export class ApplyFormatCmd {
    slideIdx;
    id;
    snapshot;
    label = "Format painter";
    subCmds = [];
    effectsPrev;
    constructor(slideIdx, id, snapshot) {
        this.slideIdx = slideIdx;
        this.id = id;
        this.snapshot = snapshot;
    }
    apply(pres) {
        const snap = this.snapshot;
        this.subCmds = [];
        this.effectsPrev = undefined;
        if (snap.fill !== undefined) {
            this.subCmds.push(new SetFillCmd(this.slideIdx, this.id, deepClone(snap.fill)));
        }
        if (snap.stroke !== undefined) {
            this.subCmds.push(new SetStrokeCmd(this.slideIdx, this.id, deepClone(snap.stroke)));
        }
        if (snap.opacity !== undefined) {
            this.subCmds.push(new SetShapeOpacityCmd(this.slideIdx, this.id, snap.opacity));
        }
        if (snap.textStyle && Object.keys(snap.textStyle).length > 0) {
            this.subCmds.push(new SetTextStyleCmd(this.slideIdx, this.id, snap.textStyle));
        }
        if (snap.textAlign !== undefined) {
            this.subCmds.push(new SetTextAlignCmd(this.slideIdx, this.id, snap.textAlign));
        }
        if (snap.copyBullet) {
            this.subCmds.push(new SetParagraphBulletCmd(this.slideIdx, this.id, snap.bullet));
        }
        if (snap.copyEffects) {
            const s = shapeAt(pres, this.slideIdx, this.id);
            if (s) {
                this.effectsPrev = {
                    shape: s,
                    shadow: s.shadow ? deepClone(s.shadow) : undefined,
                    effects: s.effects ? s.effects.map(deepClone) : undefined,
                };
                if (snap.shadow !== undefined)
                    s.shadow = deepClone(snap.shadow);
                else
                    delete s.shadow;
                if (snap.effects !== undefined)
                    s.effects = snap.effects.map(deepClone);
                else
                    delete s.effects;
            }
        }
        for (const c of this.subCmds)
            c.apply(pres);
    }
    revert(pres) {
        for (let i = this.subCmds.length - 1; i >= 0; i--)
            this.subCmds[i].revert(pres);
        if (this.effectsPrev) {
            const s = shapeAt(pres, this.slideIdx, this.id);
            if (s) {
                if (this.effectsPrev.shadow !== undefined)
                    s.shadow = deepClone(this.effectsPrev.shadow);
                else
                    delete s.shadow;
                if (this.effectsPrev.effects !== undefined)
                    s.effects = this.effectsPrev.effects.map(deepClone);
                else
                    delete s.effects;
            }
        }
    }
}
function richParagraphToCore(rp) {
    const out = {
        runs: rp.runs.map(richRunToCore),
    };
    if (rp.align !== undefined)
        out.align = rp.align;
    if (rp.lineHeight !== undefined)
        out.lineHeight = rp.lineHeight;
    if (rp.lineHeightPx !== undefined)
        out.lineHeightPx = rp.lineHeightPx;
    if (rp.spaceBeforePx !== undefined)
        out.spaceBeforePx = rp.spaceBeforePx;
    if (rp.spaceAfterPx !== undefined)
        out.spaceAfterPx = rp.spaceAfterPx;
    if (rp.indent !== undefined)
        out.indent = rp.indent;
    if (rp.marginLeft !== undefined)
        out.marginLeft = rp.marginLeft;
    if (rp.marginRight !== undefined)
        out.marginRight = rp.marginRight;
    if (rp.level !== undefined)
        out.level = rp.level;
    if (rp.bullet !== undefined)
        out.bullet = rp.bullet;
    return out;
}
function richRunToCore(r) {
    const run = { text: r.text };
    if (r.fontFamily !== undefined)
        run.fontFamily = r.fontFamily;
    if (r.fontSize !== undefined)
        run.fontSize = r.fontSize;
    if (r.fontWeight !== undefined)
        run.fontWeight = r.fontWeight;
    if (r.italic !== undefined)
        run.italic = r.italic;
    if (r.underline !== undefined)
        run.underline = r.underline;
    if (r.strikethrough !== undefined)
        run.strikethrough = r.strikethrough;
    if (r.color !== undefined)
        run.color = r.color;
    if (r.letterSpacing !== undefined)
        run.letterSpacing = r.letterSpacing;
    if (r.baseline !== undefined)
        run.baseline = r.baseline;
    if (r.caps !== undefined)
        run.caps = r.caps;
    if (r.highlight !== undefined)
        run.highlight = r.highlight;
    if (r.hyperlinkUrl !== undefined) {
        const url = sanitizeExternalUrl(r.hyperlinkUrl);
        if (url)
            run.hyperlink = { kind: "url", target: url };
    }
    return run;
}
/** WPS「竖排（堆叠）」：wordArtVert = 行顺序从左到右，wordArtVertRtl = 从右到左。 */
export function isWordArtStackedVert(vert) {
    return vert === "wordArtVert" || vert === "wordArtVertRtl";
}
/** 当前文本框的行顺序是否从右到左（堆叠看 vert，其它模式看 rtlCol）。 */
export function textRowOrderRtl(text) {
    if (text.vert === "wordArtVertRtl")
        return true;
    if (text.vert === "wordArtVert")
        return false;
    return !!text.rtlCol;
}
export function textRowOrderPatch(text, rtl) {
    if (isWordArtStackedVert(text.vert)) {
        return { vert: rtl ? "wordArtVertRtl" : "wordArtVert", rtlCol: rtl ? true : null };
    }
    return { rtlCol: rtl ? true : null };
}
export class SetTextBodyCmd {
    slideIdx;
    id;
    patch;
    label = "Text body";
    prev;
    constructor(slideIdx, id, patch) {
        this.slideIdx = slideIdx;
        this.id = id;
        this.patch = patch;
    }
    apply(pres) {
        const root = shapeAt(pres, this.slideIdx, this.id);
        if (!root)
            return;
        const texts = collectTextShapes(root);
        if (texts.length === 0)
            return;
        this.prev = new Map();
        for (const text of texts) {
            const snap = {};
            const tAny = text;
            const fields = [
                "vAlign",
                "wrap",
                "insets",
                "autoFit",
                "vert",
                "numCol",
                "spcCol",
                "rtlCol",
                "upright",
                "vertOverflow",
                "horzOverflow",
                "anchorCtr",
                "bodyRot",
            ];
            for (const k of fields) {
                if (!(k in this.patch))
                    continue;
                snap[k] = tAny[k];
                const v = this.patch[k];
                if (v === null || v === undefined) {
                    delete tAny[k];
                    continue;
                }
                if (k === "autoFit") {
                    tAny.autoFit = { kind: v };
                }
                else if (k === "insets") {
                    const cur = tAny.insets ?? { l: 0, t: 0, r: 0, b: 0 };
                    const next = { ...cur, ...v };
                    tAny.insets = next;
                }
                else {
                    tAny[k] = v;
                }
            }
            this.prev.set(text, snap);
            markDirty(text, "text");
        }
    }
    revert(_pres) {
        if (!this.prev)
            return;
        for (const [text, snap] of this.prev) {
            const tAny = text;
            for (const [k, v] of Object.entries(snap)) {
                if (v === undefined)
                    delete tAny[k];
                else
                    tAny[k] = v;
            }
        }
    }
}
export class SetShapeEffectsCmd {
    slideIdx;
    id;
    patch;
    label = "Shape effects";
    snap;
    constructor(slideIdx, id, patch) {
        this.slideIdx = slideIdx;
        this.id = id;
        this.patch = patch;
    }
    apply(pres) {
        const s = shapeAt(pres, this.slideIdx, this.id);
        if (!s)
            return;
        this.snap = {
            shape: s,
            shadow: s.shadow ? deepClone(s.shadow) : undefined,
            effects: s.effects ? s.effects.map(deepClone) : undefined,
        };
        const effects = s.effects ? [...s.effects] : [];
        if ("shadow" in this.patch) {
            // 清掉已有 shadow（兼容字段 + effects 中同类条目）。
            delete s.shadow;
            const filtered = effects.filter((e) => e.kind !== "outer" && e.kind !== "inner");
            effects.length = 0;
            effects.push(...filtered);
            if (this.patch.shadow !== null && this.patch.shadow !== undefined) {
                const sh = this.patch.shadow;
                const kind = sh.kind ?? "outer";
                const dir = sh.dir ?? 90;
                const dist = sh.dist ?? 4;
                const rad = (dir * Math.PI) / 180;
                const dx = sh.dx ?? Math.round(Math.cos(rad) * dist);
                const dy = sh.dy ?? Math.round(Math.sin(rad) * dist);
                const shadow = {
                    kind,
                    blur: sh.blur ?? 4,
                    dx,
                    dy,
                    color: sh.color ?? "#000000",
                    alpha: sh.alpha ?? 0.4,
                    ...(sh.dir !== undefined ? { dir: sh.dir } : {}),
                    ...(sh.dist !== undefined ? { dist: sh.dist } : {}),
                    ...(sh.prst !== undefined ? { prst: sh.prst } : {}),
                };
                s.shadow = shadow;
                effects.push(shadow);
            }
        }
        if ("glow" in this.patch) {
            const filtered = effects.filter((e) => e.kind !== "glow");
            effects.length = 0;
            effects.push(...filtered);
            if (this.patch.glow !== null && this.patch.glow !== undefined) {
                effects.push({
                    kind: "glow",
                    radius: this.patch.glow.radius,
                    color: this.patch.glow.color,
                    alpha: this.patch.glow.alpha ?? 0.6,
                });
            }
        }
        if ("softEdge" in this.patch) {
            const filtered = effects.filter((e) => e.kind !== "softEdge");
            effects.length = 0;
            effects.push(...filtered);
            if (this.patch.softEdge !== null && this.patch.softEdge !== undefined) {
                effects.push({ kind: "softEdge", radius: this.patch.softEdge.radius });
            }
        }
        if ("reflection" in this.patch) {
            const filtered = effects.filter((e) => e.kind !== "reflection");
            effects.length = 0;
            effects.push(...filtered);
            if (this.patch.reflection !== null && this.patch.reflection !== undefined) {
                const r = this.patch.reflection;
                effects.push({
                    kind: "reflection",
                    blur: r.blur ?? 4,
                    startAlpha: r.startAlpha ?? 0.5,
                    endAlpha: r.endAlpha ?? 0,
                    startPos: 0,
                    endPos: 1,
                    dir: r.dir ?? 90,
                    dist: r.dist ?? 4,
                });
            }
        }
        if ("blur" in this.patch) {
            const filtered = effects.filter((e) => e.kind !== "blur");
            effects.length = 0;
            effects.push(...filtered);
            if (this.patch.blur !== null && this.patch.blur !== undefined) {
                effects.push({
                    kind: "blur",
                    radius: this.patch.blur.radius,
                    ...(this.patch.blur.grow !== undefined ? { grow: this.patch.blur.grow } : {}),
                });
            }
        }
        if (effects.length === 0)
            delete s.effects;
        else
            s.effects = effects;
        markDirty(s, "effects");
    }
    revert(_pres) {
        if (!this.snap)
            return;
        const s = this.snap.shape;
        if (this.snap.shadow)
            s.shadow = deepClone(this.snap.shadow);
        else
            delete s.shadow;
        if (this.snap.effects)
            s.effects = this.snap.effects.map(deepClone);
        else
            delete s.effects;
        markDirty(s, "effects");
    }
}
export class SetShape3DCmd {
    slideIdx;
    id;
    patch;
    label = "Shape 3D";
    prev;
    constructor(slideIdx, id, patch) {
        this.slideIdx = slideIdx;
        this.id = id;
        this.patch = patch;
    }
    apply(pres) {
        const s = shapeAt(pres, this.slideIdx, this.id);
        if (!s)
            return;
        if (this.prev === undefined)
            this.prev = s.meta3D ? deepClone(s.meta3D) : undefined;
        if (this.patch.clear) {
            delete s.meta3D;
            markDirty(s, "meta3D");
            return;
        }
        const base = s.meta3D
            ? deepClone(s.meta3D)
            : {
                sp3d: { prstMaterial: "warmMatte" },
                scene3d: {
                    camera: { prst: "orthographicFront" },
                    lightRig: { rig: "threePt", dir: "t" },
                },
            };
        if (this.patch.extrusionH !== undefined) {
            base.sp3d = { ...base.sp3d, extrusionH: this.patch.extrusionH };
        }
        if (this.patch.prstMaterial !== undefined) {
            base.sp3d = { ...base.sp3d, prstMaterial: this.patch.prstMaterial };
        }
        if (this.patch.cameraPrst !== undefined) {
            base.scene3d = {
                ...(base.scene3d ?? {}),
                camera: { ...(base.scene3d?.camera ?? {}), prst: this.patch.cameraPrst },
            };
        }
        delete base.baked;
        delete base.bakedKey;
        delete base.bakedSrc;
        delete base.bakedBBox;
        delete base.bakedNatural;
        s.meta3D = base;
        markDirty(s, "meta3D");
    }
    revert(_pres) {
        const s = shapeAt(_pres, this.slideIdx, this.id);
        if (!s)
            return;
        if (this.prev)
            s.meta3D = deepClone(this.prev);
        else
            delete s.meta3D;
    }
}
// ============================================================================
// 图片裁剪 patch（ECMA-376 §20.1.8.55 srcRect / picPr.crop）：
// cropRect 用 0..1 比例表达"距各边的裁掉比例"。
//   - { l: 0.1, t: 0, r: 0.1, b: 0 } 表示左右各裁 10%。
//   - null 表示清除裁剪。
// ============================================================================
export class SetImageCropCmd {
    slideIdx;
    id;
    crop;
    label = "Crop image";
    prev;
    shapeRef;
    constructor(slideIdx, id, crop) {
        this.slideIdx = slideIdx;
        this.id = id;
        this.crop = crop;
    }
    apply(pres) {
        const s = shapeAt(pres, this.slideIdx, this.id);
        if (!s || s.kind !== "image")
            return;
        this.shapeRef = s;
        this.prev = this.shapeRef.cropRect ? { ...this.shapeRef.cropRect } : undefined;
        if (this.crop === null)
            delete this.shapeRef.cropRect;
        else
            this.shapeRef.cropRect = { ...this.crop };
    }
    revert(_pres) {
        if (!this.shapeRef)
            return;
        if (this.prev)
            this.shapeRef.cropRect = { ...this.prev };
        else
            delete this.shapeRef.cropRect;
    }
}
/**
 * 裁剪窗口：外框和 srcRect 一起变，画面在幻灯片上的像素大小保持不动。
 * 图片和视频写 `cropRect`；图片填充写 `fill.srcRect`，并改成拉伸铺进窗口。
 */
export class SetCropFrameCmd {
    slideIdx;
    id;
    nextBbox;
    nextCrop;
    label = "Crop";
    prevPos;
    prevCrop;
    prevFit;
    constructor(slideIdx, id, nextBbox, nextCrop) {
        this.slideIdx = slideIdx;
        this.id = id;
        this.nextBbox = nextBbox;
        this.nextCrop = nextCrop;
    }
    apply(pres) {
        const s = shapeAt(pres, this.slideIdx, this.id);
        if (!s || !cropHost(s))
            return;
        if (!this.prevPos) {
            this.prevPos = new Map();
            collectPositions(s, this.prevPos);
            this.prevCrop = readCrop(s);
            this.prevFit = s.fill?.kind === "image" ? s.fill.fit : undefined;
        }
        const prevBox = { ...s.bbox };
        rescale(s, prevBox, this.nextBbox);
        s.bbox = { ...this.nextBbox };
        assignCrop(s, this.nextCrop, cropHost(s) === "fill" ? "fill" : undefined);
        markDirty(s, "bbox");
        reattachAndFollowGlue(pres, this.slideIdx, s);
    }
    revert(pres) {
        const s = shapeAt(pres, this.slideIdx, this.id);
        if (!s || !this.prevPos || !this.prevCrop)
            return;
        restorePositions(s, this.prevPos);
        assignCrop(s, this.prevCrop, this.prevFit);
        followGluedConnectors(pres, this.slideIdx, s);
    }
}
/** 换掉图片字节，框不变。清掉旧裁剪和 SVG 回退，避免新图还套着上一张的切口。传入 icon 时改的是 Lucide 图标，保留矢量源和 descr。 */
export class ReplaceImageSrcCmd {
    slideIdx;
    id;
    src;
    natural;
    icon;
    label;
    prev;
    constructor(slideIdx, id, src, natural, icon) {
        this.slideIdx = slideIdx;
        this.id = id;
        this.src = src;
        this.natural = natural;
        this.icon = icon;
        this.label = icon ? "Change icon" : "Replace picture";
    }
    apply(pres) {
        const s = shapeAt(pres, this.slideIdx, this.id);
        if (!s || s.kind !== "image")
            return;
        const img = s;
        this.prev = {
            src: img.src,
            natural: img.natural ? { ...img.natural } : undefined,
            svgSrc: img.svgSrc,
            cropRect: img.cropRect ? { ...img.cropRect } : undefined,
            descr: img.descr ?? null,
        };
        img.src = this.src;
        if (this.natural)
            img.natural = { ...this.natural };
        else
            delete img.natural;
        if (this.icon) {
            img.svgSrc = this.icon.svgSrc;
            img.descr = this.icon.descr;
        }
        else {
            delete img.svgSrc;
        }
        delete img.cropRect;
    }
    revert(pres) {
        const s = shapeAt(pres, this.slideIdx, this.id);
        if (!s || s.kind !== "image" || !this.prev)
            return;
        const img = s;
        img.src = this.prev.src;
        if (this.prev.natural)
            img.natural = { ...this.prev.natural };
        else
            delete img.natural;
        if (this.prev.svgSrc)
            img.svgSrc = this.prev.svgSrc;
        else
            delete img.svgSrc;
        if (this.prev.cropRect)
            img.cropRect = { ...this.prev.cropRect };
        else
            delete img.cropRect;
        if (this.prev.descr != null)
            img.descr = this.prev.descr;
        else
            delete img.descr;
    }
}
export class SetImageDescrCmd {
    slideIdx;
    id;
    descr;
    label = "Image alt text";
    prev;
    shapeRef;
    constructor(slideIdx, id, descr) {
        this.slideIdx = slideIdx;
        this.id = id;
        this.descr = descr;
    }
    apply(pres) {
        const s = shapeAt(pres, this.slideIdx, this.id);
        if (!s || s.kind !== "image")
            return;
        this.shapeRef = s;
        this.prev = this.shapeRef.descr;
        const trimmed = this.descr.trim();
        if (trimmed)
            this.shapeRef.descr = trimmed;
        else
            delete this.shapeRef.descr;
    }
    revert(_pres) {
        if (!this.shapeRef)
            return;
        if (this.prev)
            this.shapeRef.descr = this.prev;
        else
            delete this.shapeRef.descr;
    }
}
function cloneHyperlink(h) {
    return sanitizeHyperlinkRef(h ? { ...h, ...(h.sound ? { sound: { ...h.sound } } : {}) } : undefined);
}
/** Shape-level OOXML `a:hlinkClick` / `a:hlinkHover` (not run-level hyperlink). */
export class SetShapeHyperlinkCmd {
    slideIdx;
    id;
    next;
    slot;
    label;
    prev;
    hadPrev = false;
    shapeRef;
    constructor(slideIdx, id, next, slot = "click") {
        this.slideIdx = slideIdx;
        this.id = id;
        this.next = next;
        this.slot = slot;
        const hover = slot === "hover";
        this.label = next
            ? hover
                ? "Set hover hyperlink"
                : "Set hyperlink"
            : hover
                ? "Remove hover hyperlink"
                : "Remove hyperlink";
    }
    apply(pres) {
        const s = shapeAt(pres, this.slideIdx, this.id);
        if (!s)
            return;
        this.shapeRef = s;
        const key = this.slot === "hover" ? "hoverLink" : "hyperlink";
        const cur = s[key];
        this.hadPrev = cur !== undefined;
        this.prev = cloneHyperlink(cur);
        if (this.next)
            s[key] = cloneHyperlink(this.next);
        else
            delete s[key];
    }
    revert(_pres) {
        if (!this.shapeRef)
            return;
        const key = this.slot === "hover" ? "hoverLink" : "hyperlink";
        if (this.hadPrev && this.prev)
            this.shapeRef[key] = cloneHyperlink(this.prev);
        else
            delete this.shapeRef[key];
    }
}
// ============================================================================
// Chart 数据 / 样式 patch：ECMA-376 §21.2 c:chart / cx:chart 的"内存表达"。
//
// 当前 serializer 仍以 rect 占位写出 chart（即编辑器内 / 渲染层完整支持 chart，
// 但 .pptx 导出落到 rect），本命令负责让 chart 在编辑器与播放器侧成为"一等公民"。
// 全量替换 chart.def，revert 用深克隆兜底。
// ============================================================================
export class SetChartDefCmd {
    slideIdx;
    id;
    next;
    label = "Chart data";
    prev;
    shapeRef;
    constructor(slideIdx, id, next) {
        this.slideIdx = slideIdx;
        this.id = id;
        this.next = next;
    }
    apply(pres) {
        const s = shapeAt(pres, this.slideIdx, this.id);
        if (!s || s.kind !== "chart")
            return;
        this.shapeRef = s;
        this.prev = deepClone(this.shapeRef.chart);
        this.shapeRef.chart = deepClone(this.next);
        markDirty(this.shapeRef, "chart");
    }
    revert(_pres) {
        if (!this.shapeRef || !this.prev)
            return;
        this.shapeRef.chart = deepClone(this.prev);
    }
}
export class SetSlideSizeCmd {
    next;
    label = "Slide size";
    prev;
    constructor(next) {
        this.next = next;
    }
    apply(pres) {
        this.prev = { ...pres.size };
        pres.size = { ...this.next };
    }
    revert(pres) {
        if (this.prev)
            pres.size = { ...this.prev };
    }
}
export class SetSlideBackgroundCmd {
    slideIdx;
    next;
    label = "Background";
    prev;
    prevBgRef;
    constructor(slideIdx, next) {
        this.slideIdx = slideIdx;
        this.next = next;
    }
    apply(pres) {
        const slide = pres.slides[this.slideIdx];
        if (!slide)
            return;
        this.prev = slide.background;
        this.prevBgRef = slide.bgRef;
        assignSlideBackground(slide, this.next);
        markDirty(slide, "background");
    }
    revert(pres) {
        const slide = pres.slides[this.slideIdx];
        if (!slide)
            return;
        slide.background = this.prev;
        if (this.prevBgRef)
            slide.bgRef = this.prevBgRef;
        else
            delete slide.bgRef;
    }
}
// 通用背景命令：通过 EditTarget 落到 slide / master / layout 的 background。
// resolveTarget 已经为三类 target 暴露 background getter + setBackground，
// 母版视图下编辑背景必须走这里（slide 视图也可用，等价 SetSlideBackgroundCmd）。
export class SetBackgroundTargetCmd {
    target;
    next;
    label = "Background";
    prev;
    prevBgRef;
    had = false;
    constructor(target, next) {
        this.target = target;
        this.next = next;
    }
    apply(pres) {
        const container = resolveTarget(pres, this.target);
        const host = backgroundHost(pres, this.target);
        if (!container || !container.setBackground || !host)
            return;
        this.prev = host.background;
        this.prevBgRef = host.bgRef;
        this.had = true;
        container.setBackground(this.next);
        // slide 背景走 isDirty(slide,"background") 强制写出；master/layout 由 patchBackgroundIn
        // 的 paintEqual(current, snapshot) 比较兜底，无需脏标记。
        if (this.target.kind === "slide") {
            const slide = pres.slides[this.target.slideIdx];
            if (slide)
                markDirty(slide, "background");
        }
    }
    revert(pres) {
        if (!this.had)
            return;
        const container = resolveTarget(pres, this.target);
        const host = backgroundHost(pres, this.target);
        if (!container || !container.setBackground || !host)
            return;
        container.setBackground(this.prev);
        if (this.prevBgRef)
            host.bgRef = this.prevBgRef;
    }
}
// ECMA-376 §19.3.1.37 sld@show — 控制该 slide 是否在放映中显示。false 表示
// 「在放映中隐藏」（编辑器仍可见，仅放映时跳过）；undefined 等价于 true。
// player 在 player.ts / plugins.ts / plugin-thumbnail.ts 中按 `slide.show !== false`
// 过滤可见序列，因此这里只需翻转 show 字段即可生效。
export class SetSlideShowCmd {
    slideIdx;
    next;
    label = "Hide slide";
    prev;
    constructor(slideIdx, next) {
        this.slideIdx = slideIdx;
        this.next = next;
    }
    apply(pres) {
        const slide = pres.slides[this.slideIdx];
        if (!slide)
            return;
        this.prev = slide.show;
        // undefined → true 语义保持（避免在导出 OOXML 时显式写出多余的 show="1"）。
        if (this.next)
            slide.show = undefined;
        else
            slide.show = false;
    }
    revert(pres) {
        const slide = pres.slides[this.slideIdx];
        if (!slide)
            return;
        slide.show = this.prev;
    }
}
// 设置 slide.notes（演讲者备注）。next 为空串时归一化成 undefined，避免导出多余 notesSlide。
export class SetSlideNotesCmd {
    slideIdx;
    next;
    label = "Edit notes";
    prev;
    constructor(slideIdx, next) {
        this.slideIdx = slideIdx;
        this.next = next;
    }
    apply(pres) {
        const slide = pres.slides[this.slideIdx];
        if (!slide)
            return;
        this.prev = slide.notes;
        slide.notes = this.next;
    }
    revert(pres) {
        const slide = pres.slides[this.slideIdx];
        if (!slide)
            return;
        slide.notes = this.prev;
    }
}
export class SetSlideHfCmd {
    slideIdx;
    next;
    label = "Header / Footer";
    prev;
    constructor(slideIdx, next) {
        this.slideIdx = slideIdx;
        this.next = next;
    }
    apply(pres) {
        const slide = pres.slides[this.slideIdx];
        if (!slide)
            return;
        this.prev = slide.hf ? { ...slide.hf } : undefined;
        slide.hf = this.next ? { ...this.next } : undefined;
    }
    revert(pres) {
        const slide = pres.slides[this.slideIdx];
        if (!slide)
            return;
        slide.hf = this.prev;
    }
}
// ---- 变换 / 元数据 ----
// 直接覆写 transform.rotation；按 ECMA-376 角度单位（度）。
export class SetShapeRotationCmd {
    slideIdx;
    id;
    next;
    label = "Rotate";
    prev;
    constructor(slideIdx, id, next) {
        this.slideIdx = slideIdx;
        this.id = id;
        this.next = next;
    }
    apply(pres) {
        const s = shapeAt(pres, this.slideIdx, this.id);
        if (!s)
            return;
        this.prev = s.transform.rotation;
        s.transform = { ...s.transform, rotation: this.next };
        markDirty(s, "transform");
        reattachAndFollowGlue(pres, this.slideIdx, s);
    }
    revert(pres) {
        const s = shapeAt(pres, this.slideIdx, this.id);
        if (!s || this.prev === undefined)
            return;
        s.transform = { ...s.transform, rotation: this.prev };
        followGluedConnectors(pres, this.slideIdx, s);
    }
}
// 透明度：0=完全透明，1=完全不透明。ECMA-376 §20.1.7.5 nvSpPr 的 a:alpha 等价。
export class SetShapeOpacityCmd {
    slideIdx;
    id;
    next;
    label = "Opacity";
    prev;
    constructor(slideIdx, id, next) {
        this.slideIdx = slideIdx;
        this.id = id;
        this.next = next;
    }
    apply(pres) {
        const s = shapeAt(pres, this.slideIdx, this.id);
        if (!s)
            return;
        this.prev = s.opacity;
        s.opacity = Math.max(0, Math.min(1, this.next));
        markDirty(s, "opacity");
    }
    revert(pres) {
        const s = shapeAt(pres, this.slideIdx, this.id);
        if (!s || this.prev === undefined)
            return;
        s.opacity = this.prev;
    }
}
// 翻转：把 transform.scaleX 或 scaleY 取反。ECMA-376 §20.1.7.6 xfrm@flipH / @flipV 等价。
export class FlipShapeCmd {
    slideIdx;
    id;
    axis;
    label = "Flip";
    flipped = false;
    constructor(slideIdx, id, axis) {
        this.slideIdx = slideIdx;
        this.id = id;
        this.axis = axis;
    }
    apply(pres) {
        const s = shapeAt(pres, this.slideIdx, this.id);
        if (!s)
            return;
        if (this.axis === "h")
            s.transform = { ...s.transform, scaleX: -s.transform.scaleX };
        else
            s.transform = { ...s.transform, scaleY: -s.transform.scaleY };
        this.flipped = true;
        markDirty(s, "transform");
        followGluedConnectors(pres, this.slideIdx, s);
    }
    revert(pres) {
        if (!this.flipped)
            return;
        const s = shapeAt(pres, this.slideIdx, this.id);
        if (!s)
            return;
        if (this.axis === "h")
            s.transform = { ...s.transform, scaleX: -s.transform.scaleX };
        else
            s.transform = { ...s.transform, scaleY: -s.transform.scaleY };
        followGluedConnectors(pres, this.slideIdx, s);
    }
}
// 锁定 / 显示开关（ECMA-376 spPr / nvSpPr：cNvSpPr/spLocks + hidden）。
export class SetShapeLockedCmd {
    slideIdx;
    id;
    locked;
    label = "Lock";
    prev;
    constructor(slideIdx, id, locked) {
        this.slideIdx = slideIdx;
        this.id = id;
        this.locked = locked;
    }
    apply(pres) {
        const s = shapeAt(pres, this.slideIdx, this.id);
        if (!s)
            return;
        this.prev = s.locked;
        s.locked = this.locked;
    }
    revert(pres) {
        const s = shapeAt(pres, this.slideIdx, this.id);
        if (!s || this.prev === undefined)
            return;
        s.locked = this.prev;
    }
}
export class SetShapeVisibleCmd {
    slideIdx;
    id;
    visible;
    label = "Visibility";
    prev;
    constructor(slideIdx, id, visible) {
        this.slideIdx = slideIdx;
        this.id = id;
        this.visible = visible;
    }
    apply(pres) {
        const s = shapeAt(pres, this.slideIdx, this.id);
        if (!s)
            return;
        this.prev = s.visible;
        s.visible = this.visible;
        markDirty(s, "visible");
    }
    revert(pres) {
        const s = shapeAt(pres, this.slideIdx, this.id);
        if (!s || this.prev === undefined)
            return;
        s.visible = this.prev;
    }
}
function cloneMediaPatchValue(v) {
    if (v && typeof v === "object" && !Array.isArray(v))
        return { ...v };
    return v;
}
export class SetMediaPropsCmd {
    slideIdx;
    id;
    patch;
    label = "Media properties";
    prev = {};
    constructor(slideIdx, id, patch) {
        this.slideIdx = slideIdx;
        this.id = id;
        this.patch = patch;
    }
    apply(pres) {
        const s = shapeAt(pres, this.slideIdx, this.id);
        if (!s || (s.kind !== "video" && s.kind !== "audio"))
            return;
        const sAny = s;
        this.prev = {};
        for (const k of Object.keys(this.patch)) {
            this.prev[k] = cloneMediaPatchValue(sAny[k]);
            const v = this.patch[k];
            if (k === "trim") {
                if (v === undefined)
                    delete sAny.trim;
                else {
                    const prevTrim = sAny.trim ?? {};
                    const patch = v;
                    const next = { ...prevTrim, ...patch };
                    const empty = (next.start === undefined || next.start <= 0) &&
                        (next.end === undefined || !Number.isFinite(next.end));
                    if (empty)
                        delete sAny.trim;
                    else
                        sAny.trim = next;
                }
            }
            else if (v === undefined) {
                delete sAny[k];
            }
            else {
                sAny[k] = v;
            }
        }
    }
    revert(pres) {
        const s = shapeAt(pres, this.slideIdx, this.id);
        if (!s)
            return;
        const sAny = s;
        for (const k of Object.keys(this.prev)) {
            const v = this.prev[k];
            if (v === undefined)
                delete sAny[k];
            else
                sAny[k] = v;
        }
    }
}
/** Replace video/audio source bytes (clears trim/poster on replace). */
export class UpdateMediaSrcCmd {
    slideIdx;
    id;
    nextSrc;
    nextDuration;
    label = "Replace media";
    prev = { src: "" };
    constructor(slideIdx, id, nextSrc, nextDuration) {
        this.slideIdx = slideIdx;
        this.id = id;
        this.nextSrc = nextSrc;
        this.nextDuration = nextDuration;
    }
    apply(pres) {
        const s = shapeAt(pres, this.slideIdx, this.id);
        if (!s || (s.kind !== "video" && s.kind !== "audio"))
            return;
        this.prev = {
            src: s.src,
            duration: s.duration,
            trim: s.trim ? { ...s.trim } : undefined,
        };
        if (s.kind === "video" && s.poster)
            this.prev.poster = s.poster;
        s.src = this.nextSrc;
        if (this.nextDuration != null && Number.isFinite(this.nextDuration) && this.nextDuration > 0) {
            s.duration = this.nextDuration;
        }
        else {
            delete s.duration;
        }
        delete s.trim;
        if (s.kind === "video")
            delete s.poster;
    }
    revert(pres) {
        const s = shapeAt(pres, this.slideIdx, this.id);
        if (!s || (s.kind !== "video" && s.kind !== "audio"))
            return;
        s.src = this.prev.src;
        if (this.prev.duration != null)
            s.duration = this.prev.duration;
        else
            delete s.duration;
        if (this.prev.trim)
            s.trim = { ...this.prev.trim };
        else
            delete s.trim;
        if (s.kind === "video") {
            if (this.prev.poster)
                s.poster = this.prev.poster;
            else
                delete s.poster;
        }
    }
}
// 直接设置整体 bbox（位置 + 尺寸），用于 Inspector 中的数值输入。
// 复用 rescale 把内部 children 按比例缩放，等价于 ResizeShapeCmd。
export class SetShapeBboxCmd {
    slideIdx;
    id;
    next;
    label = "Position / Size";
    snapshot;
    constructor(slideIdx, id, next) {
        this.slideIdx = slideIdx;
        this.id = id;
        this.next = next;
    }
    apply(pres) {
        const root = shapeAt(pres, this.slideIdx, this.id);
        if (!root)
            return;
        const s = resolveSyntheticTextBox(pres, this.slideIdx, root);
        this.snapshot = new Map();
        collectPositions(s, this.snapshot);
        const prev = { ...s.bbox };
        rescale(s, prev, this.next);
        s.bbox = { ...this.next };
        markDirty(s, "bbox");
        reattachAndFollowGlue(pres, this.slideIdx, s);
    }
    revert(pres) {
        const root = shapeAt(pres, this.slideIdx, this.id);
        if (!root)
            return;
        const s = resolveSyntheticTextBox(pres, this.slideIdx, root);
        if (!this.snapshot)
            return;
        restorePositions(s, this.snapshot);
    }
}
// ---- 编排：组合 / 解散 / 对齐 / 分布 ----
// 组合多个 shapes 为一个 group，新 group 放在原第一个 shape 的位置。
export class GroupShapesCmd {
    slideIdx;
    ids;
    label = "Group";
    snapshot;
    constructor(slideIdx, ids) {
        this.slideIdx = slideIdx;
        this.ids = ids;
    }
    /** Id of the group created by the last successful apply. */
    get createdGroupId() {
        return this.snapshot?.groupId;
    }
    apply(pres) {
        const slide = pres.slides[this.slideIdx];
        if (!slide || this.ids.length < 2)
            return;
        // 找出第一个匹配的 layer 与位置。要求所有 shapes 在同一 layer（PowerPoint 的限制）。
        for (let li = 0; li < slide.layers.length; li++) {
            const layer = slide.layers[li];
            const arr = layer.shapes;
            const idxs = this.ids.map((id) => arr.findIndex((s) => s.id === id));
            if (idxs.some((i) => i < 0))
                continue;
            if (isMasterCopyLayer(layer)) {
                warnReadonlyHit(this.slideIdx, this.ids[0], layer.id);
                return;
            }
            // 计算组合 bbox。
            const picked = idxs.map((i) => arr[i]);
            const bbox = unionBbox(picked.map((s) => s.bbox));
            // 按原 zIndex 排序保证组合内部 z 顺序。
            const order = idxs.map((_, k) => k).sort((a, b) => idxs[a] - idxs[b]);
            const sortedShapes = order.map((k) => picked[k]);
            const sortedPositions = order.map((k) => idxs[k]);
            // 从尾部开始删除，避免 splice 索引位移。
            const removeIdxs = [...sortedPositions].sort((a, b) => b - a);
            for (const i of removeIdxs)
                arr.splice(i, 1);
            const groupId = `sp_grp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
            const group = {
                id: groupId,
                name: "Group",
                zIndex: 0,
                visible: true,
                locked: false,
                opacity: 1,
                bbox,
                transform: { tx: 0, ty: 0, rotation: 0, scaleX: 1, scaleY: 1, skewX: 0, skewY: 0 },
                kind: "group",
                children: sortedShapes,
            };
            // 插入到首个 shape 原位置。
            const insertAt = Math.min(...sortedPositions);
            arr.splice(insertAt, 0, group);
            this.snapshot = { layerIdx: li, positions: sortedPositions, shapes: sortedShapes, groupId };
            return;
        }
    }
    revert(pres) {
        if (!this.snapshot)
            return;
        const slide = pres.slides[this.slideIdx];
        const arr = slide?.layers[this.snapshot.layerIdx]?.shapes;
        if (!arr)
            return;
        const gi = arr.findIndex((s) => s.id === this.snapshot.groupId);
        if (gi >= 0)
            arr.splice(gi, 1);
        // 按原位置插回（升序）。
        const items = this.snapshot.shapes.map((sh, k) => ({ sh, pos: this.snapshot.positions[k] }));
        items.sort((a, b) => a.pos - b.pos);
        for (const { sh, pos } of items)
            arr.splice(pos, 0, sh);
    }
}
function unionBbox(boxes) {
    if (boxes.length === 0)
        return { x: 0, y: 0, w: 0, h: 0 };
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const b of boxes) {
        x0 = Math.min(x0, b.x);
        y0 = Math.min(y0, b.y);
        x1 = Math.max(x1, b.x + b.w);
        y1 = Math.max(y1, b.y + b.h);
    }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
// 解散 group：把 children 提到外层 layer，保持相对位置。
export class UngroupShapesCmd {
    slideIdx;
    id;
    label = "Ungroup";
    snapshot;
    constructor(slideIdx, id) {
        this.slideIdx = slideIdx;
        this.id = id;
    }
    apply(pres) {
        const slide = pres.slides[this.slideIdx];
        if (!slide)
            return;
        for (let li = 0; li < slide.layers.length; li++) {
            const layer = slide.layers[li];
            const arr = layer.shapes;
            const pos = arr.findIndex((s) => s.id === this.id);
            if (pos < 0)
                continue;
            if (isMasterCopyLayer(layer)) {
                warnReadonlyHit(this.slideIdx, this.id, layer.id);
                return;
            }
            const g = arr[pos];
            if (g.kind !== "group")
                return;
            this.snapshot = { layerIdx: li, pos, group: g, childIds: g.children.map((c) => c.id) };
            arr.splice(pos, 1, ...g.children);
            return;
        }
    }
    revert(pres) {
        if (!this.snapshot)
            return;
        const slide = pres.slides[this.slideIdx];
        const arr = slide?.layers[this.snapshot.layerIdx]?.shapes;
        if (!arr)
            return;
        // 把 children 移除，把 group 放回原位。
        for (const cid of this.snapshot.childIds) {
            const idx = arr.findIndex((s) => s.id === cid);
            if (idx >= 0)
                arr.splice(idx, 1);
        }
        arr.splice(this.snapshot.pos, 0, this.snapshot.group);
    }
}
// 对齐多个 shapes：取所有 shapes 的合并 bbox 作为参照；只有一个时对齐到幻灯片（同 PowerPoint）。
export class AlignShapesCmd {
    slideIdx;
    ids;
    mode;
    label = "Align";
    deltas = [];
    constructor(slideIdx, ids, mode) {
        this.slideIdx = slideIdx;
        this.ids = ids;
        this.mode = mode;
    }
    apply(pres) {
        const slide = pres.slides[this.slideIdx];
        if (!slide || this.ids.length < 1)
            return;
        const shapes = this.ids
            .map((id) => findShape(slide, id))
            .filter((s) => !!s);
        if (shapes.length === 0)
            return;
        const ub = shapes.length === 1
            ? { x: 0, y: 0, w: pres.size.width, h: pres.size.height }
            : unionBbox(shapes.map((s) => s.bbox));
        this.deltas = shapes.map((s) => {
            let dx = 0;
            let dy = 0;
            switch (this.mode) {
                case "left":
                    dx = ub.x - s.bbox.x;
                    break;
                case "centerH":
                    dx = ub.x + ub.w / 2 - (s.bbox.x + s.bbox.w / 2);
                    break;
                case "right":
                    dx = ub.x + ub.w - (s.bbox.x + s.bbox.w);
                    break;
                case "top":
                    dy = ub.y - s.bbox.y;
                    break;
                case "centerV":
                    dy = ub.y + ub.h / 2 - (s.bbox.y + s.bbox.h / 2);
                    break;
                case "bottom":
                    dy = ub.y + ub.h - (s.bbox.y + s.bbox.h);
                    break;
            }
            translateShape(s, dx, dy);
            markDirty(s, "bbox");
            return { id: s.id, dx, dy };
        });
    }
    revert(pres) {
        const slide = pres.slides[this.slideIdx];
        if (!slide)
            return;
        for (const d of this.deltas) {
            const s = findShape(slide, d.id);
            if (s)
                translateShape(s, -d.dx, -d.dy);
        }
    }
}
// 在水平/垂直方向上等距分布 shapes（要求至少 3 个）。算法：保留首尾位置，把中间项按等距排开。
export class DistributeShapesCmd {
    slideIdx;
    ids;
    axis;
    label = "Distribute";
    deltas = [];
    constructor(slideIdx, ids, axis) {
        this.slideIdx = slideIdx;
        this.ids = ids;
        this.axis = axis;
    }
    apply(pres) {
        const slide = pres.slides[this.slideIdx];
        if (!slide || this.ids.length < 3)
            return;
        const shapes = this.ids
            .map((id) => findShape(slide, id))
            .filter((s) => !!s);
        if (shapes.length < 3)
            return;
        const axis = this.axis;
        const proj = (s) => (axis === "h" ? s.bbox.x + s.bbox.w / 2 : s.bbox.y + s.bbox.h / 2);
        const sorted = [...shapes].sort((a, b) => proj(a) - proj(b));
        const first = proj(sorted[0]);
        const last = proj(sorted[sorted.length - 1]);
        const step = (last - first) / (sorted.length - 1);
        this.deltas = [];
        for (let k = 1; k < sorted.length - 1; k++) {
            const s = sorted[k];
            const targetCenter = first + step * k;
            const dx = axis === "h" ? targetCenter - proj(s) : 0;
            const dy = axis === "v" ? targetCenter - proj(s) : 0;
            if (dx !== 0 || dy !== 0) {
                translateShape(s, dx, dy);
                markDirty(s, "bbox");
                this.deltas.push({ id: s.id, dx, dy });
            }
        }
    }
    revert(pres) {
        const slide = pres.slides[this.slideIdx];
        if (!slide)
            return;
        for (const d of this.deltas) {
            const s = findShape(slide, d.id);
            if (s)
                translateShape(s, -d.dx, -d.dy);
        }
    }
}
export class ReorderShapeCmd {
    slideIdx;
    id;
    direction;
    target;
    label = "Reorder";
    // layerIdx = -1 表示作用在 master/layout 扁平 shapes 数组上。
    from;
    constructor(slideIdx, id, direction, target) {
        this.slideIdx = slideIdx;
        this.id = id;
        this.direction = direction;
        this.target = target;
    }
    reorderArr(arr, pos) {
        const [shape] = arr.splice(pos, 1);
        if (!shape)
            return;
        if (this.direction === "front")
            arr.push(shape);
        else if (this.direction === "back")
            arr.unshift(shape);
        else if (this.direction === "forward")
            arr.splice(Math.min(arr.length, pos + 1), 0, shape);
        else
            arr.splice(Math.max(0, pos - 1), 0, shape);
    }
    apply(pres) {
        if (this.target && this.target.kind !== "slide") {
            const container = resolveTarget(pres, this.target);
            if (!container)
                return;
            const arr = container.shapes;
            const pos = arr.findIndex((s) => s.id === this.id);
            if (pos < 0)
                return;
            this.from = { layerIdx: -1, pos };
            this.reorderArr(arr, pos);
            container.setShapes(arr);
            return;
        }
        const slide = pres.slides[this.slideIdx];
        if (!slide)
            return;
        for (let li = 0; li < slide.layers.length; li++) {
            const layer = slide.layers[li];
            const arr = layer.shapes;
            const pos = arr.findIndex((s) => s.id === this.id);
            if (pos < 0)
                continue;
            if (isMasterCopyLayer(layer)) {
                warnReadonlyHit(this.slideIdx, this.id, layer.id);
                return;
            }
            this.from = { layerIdx: li, pos };
            this.reorderArr(arr, pos);
            return;
        }
    }
    revert(pres) {
        if (!this.from)
            return;
        let arr;
        if (this.from.layerIdx === -1) {
            if (!this.target)
                return;
            arr = resolveTarget(pres, this.target)?.shapes;
        }
        else {
            const slide = pres.slides[this.slideIdx];
            arr = slide?.layers[this.from.layerIdx]?.shapes;
        }
        if (!arr)
            return;
        const cur = arr.findIndex((s) => s.id === this.id);
        if (cur < 0)
            return;
        const [shape] = arr.splice(cur, 1);
        if (shape)
            arr.splice(this.from.pos, 0, shape);
    }
}
// ---- 表格命令（基于 group + tableMeta 的最小行/列编辑）----
//
// 表格在编辑器里是「带 tableMeta 的 group」，children 按 r*cols + c 排列，每个
// cell 是一个 TextShape。下列命令负责行/列增删，全部按 group.bbox 重新等分 cell
// 大小 —— 这与 PowerPoint 在"插入行/列"时的"等分"语义一致。
//
// 注意：为保持 undo 完整性，每个命令都先快照 group 当前状态（children + bbox），
// revert 时整体还原。这比"反算 children"更稳健，也避免合并状态下的细节问题。
function findTableGroup(pres, slideIdx, groupId) {
    const s = shapeAt(pres, slideIdx, groupId);
    if (!s || s.kind !== "group")
        return null;
    if (!s.tableMeta)
        return null;
    return s;
}
function makeTextCell(bbox, name, fill, stroke, fontColor, fontWeight) {
    return {
        id: `sp_cell_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        name,
        zIndex: 0,
        visible: true,
        locked: false,
        opacity: 1,
        bbox: { ...bbox },
        transform: { tx: 0, ty: 0, rotation: 0, scaleX: 1, scaleY: 1, skewX: 0, skewY: 0 },
        kind: "text",
        fill,
        // 浅拷贝 stroke 即可：dashPreset / cap / join 等枚举字段都是 primitives。
        stroke: { ...stroke, paint: { ...stroke.paint } },
        paragraphs: [
            {
                align: "middle",
                runs: [
                    {
                        text: "",
                        fontFamily: "sans-serif",
                        fontSize: 14,
                        color: fontColor,
                        fontWeight,
                    },
                ],
            },
        ],
        vAlign: "middle",
        wrap: true,
        cellMeta: { gridSpan: 1, rowSpan: 1 },
    };
}
function tableCellAt(group, row, col) {
    const cols = group.tableMeta?.cols ?? 0;
    if (cols <= 0)
        return undefined;
    return group.children[row * cols + col];
}
function cellGridSpan(cell) {
    if (!cell || cell.cellMeta?.hidden)
        return 1;
    return Math.max(1, cell.cellMeta?.gridSpan ?? 1);
}
function cellRowSpan(cell) {
    if (!cell || cell.cellMeta?.hidden)
        return 1;
    return Math.max(1, cell.cellMeta?.rowSpan ?? 1);
}
/** Owner covering (row, col), or the cell itself if unmerged. */
function tableCellOwner(group, row, col) {
    const meta = group.tableMeta;
    if (!meta)
        return undefined;
    const { rows, cols } = meta;
    if (row < 0 || col < 0 || row >= rows || col >= cols)
        return undefined;
    for (let r = 0; r <= row; r++) {
        for (let c = 0; c <= col; c++) {
            const s = tableCellAt(group, r, c);
            if (!s || s.cellMeta?.hidden)
                continue;
            if (r + cellRowSpan(s) > row && c + cellGridSpan(s) > col) {
                return { row: r, col: c, shape: s };
            }
        }
    }
    const fallback = tableCellAt(group, row, col);
    return fallback ? { row, col, shape: fallback } : undefined;
}
function markTableCellsDirty(group, cells) {
    markDirty(group, "bbox");
    for (const c of cells) {
        markDirty(c, "bbox");
        markDirty(c, "fill");
        markDirty(c, "text");
    }
}
function cellPlainText(s) {
    if (s.kind !== "text")
        return "";
    return s.paragraphs.map((p) => p.runs.map((r) => r.text).join("")).join("\n").trim();
}
function setCellPlainText(s, text) {
    if (s.kind !== "text")
        return;
    const para = s.paragraphs[0];
    const run = para?.runs[0];
    if (para && run) {
        run.text = text;
        para.runs = [run];
        s.paragraphs = [para];
    }
    else {
        s.paragraphs = [{ align: "middle", runs: [{ text, fontFamily: "sans-serif", fontSize: 14, color: "#111827" }] }];
    }
}
function writeCellMeta(cell, patch) {
    const next = { ...(cell.cellMeta ?? {}), ...patch };
    if (!next.hidden)
        delete next.hidden;
    if ((next.gridSpan ?? 1) <= 1)
        delete next.gridSpan;
    if ((next.rowSpan ?? 1) <= 1)
        delete next.rowSpan;
    cell.cellMeta = next;
}
/** Infer column widths / row heights from current 1×1 (or hidden) slots, then apply merge spans. */
function relayoutTableCells(group) {
    const meta = group.tableMeta;
    if (!meta)
        return;
    const { rows, cols } = meta;
    if (rows < 1 || cols < 1)
        return;
    const colW = Array(cols).fill(0);
    const rowH = Array(rows).fill(0);
    const colFound = Array(cols).fill(false);
    const rowFound = Array(rows).fill(false);
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const cell = tableCellAt(group, r, c);
            if (!cell)
                continue;
            if (cellGridSpan(cell) === 1 && cell.bbox.w > 0) {
                colW[c] = cell.bbox.w;
                colFound[c] = true;
            }
            if (cellRowSpan(cell) === 1 && cell.bbox.h > 0) {
                rowH[r] = cell.bbox.h;
                rowFound[r] = true;
            }
        }
    }
    const fallbackW = group.bbox.w / cols;
    const fallbackH = group.bbox.h / rows;
    for (let c = 0; c < cols; c++)
        if (!colFound[c])
            colW[c] = fallbackW;
    for (let r = 0; r < rows; r++)
        if (!rowFound[r])
            rowH[r] = fallbackH;
    const sumW = colW.reduce((a, b) => a + b, 0) || 1;
    const sumH = rowH.reduce((a, b) => a + b, 0) || 1;
    const sx = group.bbox.w / sumW;
    const sy = group.bbox.h / sumH;
    for (let c = 0; c < cols; c++)
        colW[c] *= sx;
    for (let r = 0; r < rows; r++)
        rowH[r] *= sy;
    const xs = [group.bbox.x];
    const ys = [group.bbox.y];
    for (let c = 0; c < cols; c++)
        xs.push(xs[c] + colW[c]);
    for (let r = 0; r < rows; r++)
        ys.push(ys[r] + rowH[r]);
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const cell = tableCellAt(group, r, c);
            if (!cell)
                continue;
            const gs = cellGridSpan(cell);
            const rs = cellRowSpan(cell);
            cell.bbox = {
                x: xs[c],
                y: ys[r],
                w: Math.max(0, xs[c + gs] - xs[c]),
                h: Math.max(0, ys[r + rs] - ys[r]),
            };
            if (cell.name && /^R\d+C\d+$/.test(cell.name)) {
                cell.name = `R${r + 1}C${c + 1}`;
            }
        }
    }
}
function expandMergeRange(group, r0, c0, r1, c1) {
    const meta = group.tableMeta;
    let top = Math.max(0, Math.min(r0, r1));
    let left = Math.max(0, Math.min(c0, c1));
    let bottom = Math.min(meta.rows - 1, Math.max(r0, r1));
    let right = Math.min(meta.cols - 1, Math.max(c0, c1));
    let changed = true;
    while (changed) {
        changed = false;
        for (let r = top; r <= bottom; r++) {
            for (let c = left; c <= right; c++) {
                const owner = tableCellOwner(group, r, c);
                if (!owner)
                    continue;
                const gs = cellGridSpan(owner.shape);
                const rs = cellRowSpan(owner.shape);
                const nr0 = Math.min(top, owner.row);
                const nc0 = Math.min(left, owner.col);
                const nr1 = Math.max(bottom, owner.row + rs - 1);
                const nc1 = Math.max(right, owner.col + gs - 1);
                if (nr0 !== top || nc0 !== left || nr1 !== bottom || nc1 !== right) {
                    top = nr0;
                    left = nc0;
                    bottom = nr1;
                    right = nc1;
                    changed = true;
                }
            }
        }
    }
    return { r0: top, c0: left, r1: bottom, c1: right };
}
function applyMergeRange(group, r0, c0, r1, c1) {
    const touched = [];
    const gridSpan = c1 - c0 + 1;
    const rowSpan = r1 - r0 + 1;
    const texts = [];
    for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
            const cell = tableCellAt(group, r, c);
            if (!cell)
                continue;
            touched.push(cell);
            if (!cell.cellMeta?.hidden) {
                const t = cellPlainText(cell);
                if (t)
                    texts.push(t);
            }
        }
    }
    const origin = tableCellAt(group, r0, c0);
    if (!origin)
        return touched;
    setCellPlainText(origin, texts.join("\n"));
    writeCellMeta(origin, { gridSpan, rowSpan, hidden: false });
    for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
            if (r === r0 && c === c0)
                continue;
            const cell = tableCellAt(group, r, c);
            if (!cell)
                continue;
            setCellPlainText(cell, "");
            writeCellMeta(cell, { gridSpan: 1, rowSpan: 1, hidden: true });
        }
    }
    return touched;
}
function applyUnmergeAt(group, row, col) {
    const owner = tableCellOwner(group, row, col);
    if (!owner)
        return [];
    const gs = cellGridSpan(owner.shape);
    const rs = cellRowSpan(owner.shape);
    if (gs <= 1 && rs <= 1)
        return [];
    const touched = [];
    for (let r = owner.row; r < owner.row + rs; r++) {
        for (let c = owner.col; c < owner.col + gs; c++) {
            const cell = tableCellAt(group, r, c);
            if (!cell)
                continue;
            touched.push(cell);
            writeCellMeta(cell, { gridSpan: 1, rowSpan: 1, hidden: false });
        }
    }
    return touched;
}
function fixMergesAfterInsertRow(group, insertRow) {
    const meta = group.tableMeta;
    if (!meta)
        return;
    const { rows, cols } = meta;
    for (let r = 0; r < rows; r++) {
        if (r === insertRow)
            continue;
        for (let c = 0; c < cols; c++) {
            const cell = tableCellAt(group, r, c);
            if (!cell || cell.cellMeta?.hidden)
                continue;
            const rs = cellRowSpan(cell);
            const gs = cellGridSpan(cell);
            if (r < insertRow && insertRow < r + rs) {
                writeCellMeta(cell, { ...(cell.cellMeta ?? {}), rowSpan: rs + 1, hidden: false });
                for (let cc = c; cc < c + gs && cc < cols; cc++) {
                    const neu = tableCellAt(group, insertRow, cc);
                    if (neu)
                        writeCellMeta(neu, { gridSpan: 1, rowSpan: 1, hidden: true });
                }
            }
        }
    }
}
function fixMergesAfterInsertCol(group, insertCol) {
    const meta = group.tableMeta;
    if (!meta)
        return;
    const { rows, cols } = meta;
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (c === insertCol)
                continue;
            const cell = tableCellAt(group, r, c);
            if (!cell || cell.cellMeta?.hidden)
                continue;
            const rs = cellRowSpan(cell);
            const gs = cellGridSpan(cell);
            if (c < insertCol && insertCol < c + gs) {
                writeCellMeta(cell, { ...(cell.cellMeta ?? {}), gridSpan: gs + 1, hidden: false });
                for (let rr = r; rr < r + rs && rr < rows; rr++) {
                    const neu = tableCellAt(group, rr, insertCol);
                    if (neu)
                        writeCellMeta(neu, { gridSpan: 1, rowSpan: 1, hidden: true });
                }
            }
        }
    }
}
function fixMergesBeforeRemoveRow(group, removedRow) {
    const meta = group.tableMeta;
    if (!meta)
        return;
    const { rows, cols } = meta;
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const cell = tableCellAt(group, r, c);
            if (!cell || cell.cellMeta?.hidden)
                continue;
            const rs = cellRowSpan(cell);
            const gs = cellGridSpan(cell);
            if (r === removedRow && (rs > 1 || gs > 1)) {
                for (let rr = r; rr < r + rs; rr++) {
                    if (rr === removedRow)
                        continue;
                    for (let cc = c; cc < c + gs; cc++) {
                        const other = tableCellAt(group, rr, cc);
                        if (other)
                            writeCellMeta(other, { gridSpan: 1, rowSpan: 1, hidden: false });
                    }
                }
            }
            else if (r < removedRow && removedRow < r + rs) {
                writeCellMeta(cell, { ...(cell.cellMeta ?? {}), rowSpan: Math.max(1, rs - 1), hidden: false });
            }
        }
    }
}
function fixMergesBeforeRemoveCol(group, removedCol) {
    const meta = group.tableMeta;
    if (!meta)
        return;
    const { rows, cols } = meta;
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const cell = tableCellAt(group, r, c);
            if (!cell || cell.cellMeta?.hidden)
                continue;
            const rs = cellRowSpan(cell);
            const gs = cellGridSpan(cell);
            if (c === removedCol && (rs > 1 || gs > 1)) {
                for (let rr = r; rr < r + rs; rr++) {
                    for (let cc = c; cc < c + gs; cc++) {
                        if (cc === removedCol)
                            continue;
                        const other = tableCellAt(group, rr, cc);
                        if (other)
                            writeCellMeta(other, { gridSpan: 1, rowSpan: 1, hidden: false });
                    }
                }
            }
            else if (c < removedCol && removedCol < c + gs) {
                writeCellMeta(cell, { ...(cell.cellMeta ?? {}), gridSpan: Math.max(1, gs - 1), hidden: false });
            }
        }
    }
}
function cloneTableMeta(meta) {
    return JSON.parse(JSON.stringify(meta ?? { rows: 0, cols: 0 }));
}
function snapshotTable(group) {
    return {
        children: group.children.map((c) => JSON.parse(JSON.stringify(c))),
        bbox: { ...group.bbox },
        meta: cloneTableMeta(group.tableMeta),
    };
}
function restoreTable(group, snap) {
    group.children = snap.children.map((c) => JSON.parse(JSON.stringify(c)));
    group.bbox = { ...snap.bbox };
    group.tableMeta = cloneTableMeta(snap.meta);
}
export class InsertTableRowCmd {
    slideIdx;
    groupId;
    afterRow;
    label = "Insert Row";
    snap;
    constructor(slideIdx, groupId, 
    // 在哪一行**之后**插入。-1 表示插入到首行之前；rows-1 表示在最末行之后追加。
    afterRow) {
        this.slideIdx = slideIdx;
        this.groupId = groupId;
        this.afterRow = afterRow;
    }
    apply(pres) {
        const g = findTableGroup(pres, this.slideIdx, this.groupId);
        if (!g || !g.tableMeta)
            return;
        this.snap = snapshotTable(g);
        const { rows, cols } = g.tableMeta;
        // 取参考样式：从同列的第一行 / 末行 cell 推断 fill / stroke / font。
        const refRow = Math.max(0, Math.min(rows - 1, this.afterRow >= 0 ? this.afterRow : 0));
        const newRow = [];
        for (let c = 0; c < cols; c++) {
            const ref = g.children[refRow * cols + c];
            const fill = ref && ref.fill && ref.fill.kind === "solid"
                ? { kind: "solid", color: ref.fill.color }
                : { kind: "solid", color: "#ffffff" };
            const stroke = ref?.stroke
                ? { ...ref.stroke, paint: { ...ref.stroke.paint } }
                : { paint: { kind: "solid", color: "#1e3a8a" }, width: 1 };
            const fontColor = ref && ref.kind === "text" ? (ref.paragraphs[0]?.runs[0]?.color ?? "#111827") : "#111827";
            const fontWeight = ref && ref.kind === "text"
                ? Number(ref.paragraphs[0]?.runs[0]?.fontWeight ?? 400)
                : 400;
            newRow.push(makeTextCell({ x: 0, y: 0, w: 0, h: 0 }, "", fill, stroke, fontColor, fontWeight));
        }
        // 插入位置 = (afterRow + 1) * cols。
        const insertAt = Math.max(0, Math.min(g.children.length, (this.afterRow + 1) * cols));
        g.children.splice(insertAt, 0, ...newRow);
        g.tableMeta = { ...g.tableMeta, rows: rows + 1, cols };
        const insertRow = Math.max(0, Math.min(rows, this.afterRow + 1));
        fixMergesAfterInsertRow(g, insertRow);
        relayoutTableCells(g);
    }
    revert(pres) {
        const g = findTableGroup(pres, this.slideIdx, this.groupId);
        if (!g || !this.snap)
            return;
        restoreTable(g, this.snap);
    }
}
export class InsertTableColumnCmd {
    slideIdx;
    groupId;
    afterCol;
    label = "Insert Column";
    snap;
    constructor(slideIdx, groupId, afterCol) {
        this.slideIdx = slideIdx;
        this.groupId = groupId;
        this.afterCol = afterCol;
    }
    apply(pres) {
        const g = findTableGroup(pres, this.slideIdx, this.groupId);
        if (!g || !g.tableMeta)
            return;
        this.snap = snapshotTable(g);
        const { rows, cols } = g.tableMeta;
        const newCols = cols + 1;
        const insertColIdx = Math.max(0, Math.min(cols, this.afterCol + 1));
        const refCol = Math.max(0, Math.min(cols - 1, this.afterCol >= 0 ? this.afterCol : 0));
        const next = [];
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < newCols; c++) {
                if (c === insertColIdx) {
                    const ref = g.children[r * cols + refCol];
                    const fill = ref && ref.fill && ref.fill.kind === "solid"
                        ? { kind: "solid", color: ref.fill.color }
                        : { kind: "solid", color: "#ffffff" };
                    const stroke = ref?.stroke
                        ? { ...ref.stroke, paint: { ...ref.stroke.paint } }
                        : { paint: { kind: "solid", color: "#1e3a8a" }, width: 1 };
                    const fontColor = ref && ref.kind === "text" ? (ref.paragraphs[0]?.runs[0]?.color ?? "#111827") : "#111827";
                    const fontWeight = ref && ref.kind === "text" ? Number(ref.paragraphs[0]?.runs[0]?.fontWeight ?? 400) : 400;
                    next.push(makeTextCell({ x: 0, y: 0, w: 0, h: 0 }, "", fill, stroke, fontColor, fontWeight));
                }
                else {
                    const origC = c > insertColIdx ? c - 1 : c;
                    const existing = g.children[r * cols + origC];
                    if (existing)
                        next.push(existing);
                }
            }
        }
        g.children = next;
        g.tableMeta = { ...g.tableMeta, rows, cols: newCols };
        fixMergesAfterInsertCol(g, insertColIdx);
        relayoutTableCells(g);
    }
    revert(pres) {
        const g = findTableGroup(pres, this.slideIdx, this.groupId);
        if (!g || !this.snap)
            return;
        restoreTable(g, this.snap);
    }
}
export class RemoveTableRowCmd {
    slideIdx;
    groupId;
    rowIdx;
    label = "Remove Row";
    snap;
    constructor(slideIdx, groupId, rowIdx) {
        this.slideIdx = slideIdx;
        this.groupId = groupId;
        this.rowIdx = rowIdx;
    }
    apply(pres) {
        const g = findTableGroup(pres, this.slideIdx, this.groupId);
        if (!g || !g.tableMeta)
            return;
        if (g.tableMeta.rows <= 1)
            return;
        this.snap = snapshotTable(g);
        const { rows, cols } = g.tableMeta;
        const r = Math.max(0, Math.min(rows - 1, this.rowIdx));
        fixMergesBeforeRemoveRow(g, r);
        g.children.splice(r * cols, cols);
        g.tableMeta = { ...g.tableMeta, rows: rows - 1, cols };
        relayoutTableCells(g);
    }
    revert(pres) {
        const g = findTableGroup(pres, this.slideIdx, this.groupId);
        if (!g || !this.snap)
            return;
        restoreTable(g, this.snap);
    }
}
export class RemoveTableColumnCmd {
    slideIdx;
    groupId;
    colIdx;
    label = "Remove Column";
    snap;
    constructor(slideIdx, groupId, colIdx) {
        this.slideIdx = slideIdx;
        this.groupId = groupId;
        this.colIdx = colIdx;
    }
    apply(pres) {
        const g = findTableGroup(pres, this.slideIdx, this.groupId);
        if (!g || !g.tableMeta)
            return;
        if (g.tableMeta.cols <= 1)
            return;
        this.snap = snapshotTable(g);
        const { rows, cols } = g.tableMeta;
        const c = Math.max(0, Math.min(cols - 1, this.colIdx));
        fixMergesBeforeRemoveCol(g, c);
        const next = [];
        for (let r = 0; r < rows; r++) {
            for (let cc = 0; cc < cols; cc++) {
                if (cc === c)
                    continue;
                const existing = g.children[r * cols + cc];
                if (existing)
                    next.push(existing);
            }
        }
        g.children = next;
        g.tableMeta = { ...g.tableMeta, rows, cols: cols - 1 };
        relayoutTableCells(g);
    }
    revert(pres) {
        const g = findTableGroup(pres, this.slideIdx, this.groupId);
        if (!g || !this.snap)
            return;
        restoreTable(g, this.snap);
    }
}
/** Merge a rectangular cell range (inclusive, 0-based). Intersecting merges expand the range. */
export class MergeTableCellsCmd {
    slideIdx;
    groupId;
    startRow;
    startCol;
    endRow;
    endCol;
    label = "Merge Cells";
    snap;
    constructor(slideIdx, groupId, startRow, startCol, endRow, endCol) {
        this.slideIdx = slideIdx;
        this.groupId = groupId;
        this.startRow = startRow;
        this.startCol = startCol;
        this.endRow = endRow;
        this.endCol = endCol;
    }
    apply(pres) {
        const g = findTableGroup(pres, this.slideIdx, this.groupId);
        if (!g || !g.tableMeta)
            return;
        const range = expandMergeRange(g, this.startRow, this.startCol, this.endRow, this.endCol);
        if (range.r1 === range.r0 && range.c1 === range.c0)
            return;
        this.snap = snapshotTable(g);
        const touched = applyMergeRange(g, range.r0, range.c0, range.r1, range.c1);
        relayoutTableCells(g);
        markTableCellsDirty(g, touched);
    }
    revert(pres) {
        const g = findTableGroup(pres, this.slideIdx, this.groupId);
        if (!g || !this.snap)
            return;
        restoreTable(g, this.snap);
    }
}
/** Split the merged region that contains (row, col). */
export class UnmergeTableCellsCmd {
    slideIdx;
    groupId;
    row;
    col;
    label = "Unmerge Cells";
    snap;
    constructor(slideIdx, groupId, row, col) {
        this.slideIdx = slideIdx;
        this.groupId = groupId;
        this.row = row;
        this.col = col;
    }
    apply(pres) {
        const g = findTableGroup(pres, this.slideIdx, this.groupId);
        if (!g || !g.tableMeta)
            return;
        const owner = tableCellOwner(g, this.row, this.col);
        if (!owner)
            return;
        if (cellGridSpan(owner.shape) <= 1 && cellRowSpan(owner.shape) <= 1)
            return;
        this.snap = snapshotTable(g);
        const touched = applyUnmergeAt(g, this.row, this.col);
        relayoutTableCells(g);
        markTableCellsDirty(g, touched);
    }
    revert(pres) {
        const g = findTableGroup(pres, this.slideIdx, this.groupId);
        if (!g || !this.snap)
            return;
        restoreTable(g, this.snap);
    }
}
/** Fill / vAlign / borders on one cell (hidden cells redirect to the merge owner). */
export class SetTableCellStyleCmd {
    slideIdx;
    groupId;
    row;
    col;
    patch;
    label = "Cell style";
    snap;
    constructor(slideIdx, groupId, row, col, patch) {
        this.slideIdx = slideIdx;
        this.groupId = groupId;
        this.row = row;
        this.col = col;
        this.patch = patch;
    }
    apply(pres) {
        const g = findTableGroup(pres, this.slideIdx, this.groupId);
        if (!g || !g.tableMeta)
            return;
        const owner = tableCellOwner(g, this.row, this.col);
        if (!owner)
            return;
        this.snap = snapshotTable(g);
        const s = owner.shape;
        if (this.patch.fill !== undefined) {
            if (this.patch.fill === null)
                delete s.fill;
            else
                s.fill = JSON.parse(JSON.stringify(this.patch.fill));
        }
        if (this.patch.stroke !== undefined) {
            if (this.patch.stroke === null)
                delete s.stroke;
            else
                s.stroke = JSON.parse(JSON.stringify(this.patch.stroke));
        }
        if (this.patch.borders !== undefined) {
            const meta = { ...(s.cellMeta ?? {}) };
            if (this.patch.borders === null)
                delete meta.borders;
            else
                meta.borders = JSON.parse(JSON.stringify(this.patch.borders));
            s.cellMeta = meta;
        }
        if (this.patch.vAlign !== undefined && s.kind === "text") {
            s.vAlign = this.patch.vAlign;
        }
        relayoutTableCells(g);
        markTableCellsDirty(g, [s]);
        markDirty(s, "fill");
        markDirty(s, "stroke");
    }
    revert(pres) {
        const g = findTableGroup(pres, this.slideIdx, this.groupId);
        if (!g || !this.snap)
            return;
        restoreTable(g, this.snap);
    }
}
// ECMA-376 §19.5.50 p:transition — slide 级过渡（含 dur/spd、advClick/advTm、sndAc）。
// 编辑器中作为一条原子命令：patch undefined ⇒ 删除；applyAll=true ⇒ 写入所有 slide。
export class SetSlideTransitionCmd {
    slideIdx;
    next;
    applyAll;
    label = "Transition";
    snapshot = [];
    appliedTo = [];
    constructor(slideIdx, next, applyAll = false) {
        this.slideIdx = slideIdx;
        this.next = next;
        this.applyAll = applyAll;
    }
    apply(pres) {
        this.appliedTo = this.applyAll
            ? pres.slides.map((_, i) => i)
            : [this.slideIdx];
        this.snapshot = this.appliedTo.map((i) => {
            const t = pres.slides[i]?.transition;
            return t ? { ...t, params: t.params ? { ...t.params } : undefined } : undefined;
        });
        for (const i of this.appliedTo) {
            const slide = pres.slides[i];
            if (!slide)
                continue;
            if (this.next === undefined)
                slide.transition = undefined;
            else
                slide.transition = { ...this.next, params: this.next.params ? { ...this.next.params } : undefined };
        }
    }
    revert(pres) {
        for (let k = 0; k < this.appliedTo.length; k++) {
            const idx = this.appliedTo[k];
            const slide = pres.slides[idx];
            if (!slide)
                continue;
            slide.transition = this.snapshot[k];
        }
    }
}
