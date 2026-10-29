"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CONNECTOR_PRESETS = exports.CXN_SNAP_PX = void 0;
exports.numericShapeId = numericShapeId;
exports.cxnEndFor = cxnEndFor;
exports.isPathConnector = isPathConnector;
exports.pathConnectorGeomEnds = pathConnectorGeomEnds;
exports.pathConnectorWorldEnds = pathConnectorWorldEnds;
exports.applyPathConnectorEnds = applyPathConnectorEnds;
exports.cxnSitesOf = cxnSitesOf;
exports.allCxnSites = allCxnSites;
exports.snapCxnSite = snapCxnSite;
exports.followGlueToSites = followGlueToSites;
exports.reattachConnectorGlue = reattachConnectorGlue;
exports.followGlueOnTranslate = followGlueOnTranslate;
const core_1 = require("@sliiu/present-core");
const shape_transform_1 = require("./shape-transform");
exports.CXN_SNAP_PX = 14;
/** OOXML ST_ShapeType 连接符。与 serializer `CONNECTOR_PRESETS` 对齐。 */
exports.CONNECTOR_PRESETS = new Set([
    "line",
    "straightConnector1",
    "bentConnector2",
    "bentConnector3",
    "bentConnector4",
    "bentConnector5",
    "curvedConnector2",
    "curvedConnector3",
    "curvedConnector4",
    "curvedConnector5",
]);
function numericShapeId(shape) {
    const m = /^sp_(\d+)$/.exec(shape.id);
    if (!m)
        return undefined;
    const n = Number(m[1]);
    return Number.isFinite(n) && n > 0 ? n : undefined;
}
function cxnEndFor(shape, idx) {
    const id = numericShapeId(shape) ?? 0;
    return { id, idx, shapeId: shape.id };
}
function isPathConnector(s) {
    return s.kind === "path" && !!s.presetType && exports.CONNECTOR_PRESETS.has(s.presetType);
}
/** 几何起点 (l,t) / 终点 (r,b)，不含 flip/rotate（选中框 group 已带 transform）。 */
function pathConnectorGeomEnds(s) {
    const b = s.bbox;
    return {
        start: { x: b.x, y: b.y },
        end: { x: b.x + b.w, y: b.y + b.h },
    };
}
/** 世界坐标下的连接符两端（flip → rotate → tx/ty）。 */
function pathConnectorWorldEnds(s) {
    const g = pathConnectorGeomEnds(s);
    return {
        start: (0, shape_transform_1.applyNodeTransform)(s, g.start.x, g.start.y),
        end: (0, shape_transform_1.applyNodeTransform)(s, g.end.x, g.end.y),
    };
}
/**
 * 用世界坐标两端重写 path 连接符的 bbox + flip。方向走 xfrm flipH/flipV，
 * 不再保留独立 rotation（与 Office 肘形连接符一致）。
 */
function applyPathConnectorEnds(s, start, end) {
    const x = Math.min(start.x, end.x);
    const y = Math.min(start.y, end.y);
    const w = Math.abs(end.x - start.x);
    const h = Math.abs(end.y - start.y);
    s.bbox = { x, y, w, h };
    const flipH = start.x > end.x;
    const flipV = start.y > end.y;
    const ax = Math.abs(s.transform?.scaleX || 1) || 1;
    const ay = Math.abs(s.transform?.scaleY || 1) || 1;
    s.transform = {
        ...s.transform,
        rotation: 0,
        tx: 0,
        ty: 0,
        scaleX: flipH ? -ax : ax,
        scaleY: flipV ? -ay : ay,
    };
    (0, core_1.markDirty)(s, "bbox");
}
/** 形状对外连接点：自定义几何用 cxnPoints，否则 bbox 四边中点（Office 矩形默认）。 */
function cxnSitesOf(shape) {
    if (shape.kind === "line")
        return [];
    const pts = shape.cxnPoints;
    const local = pts?.length
        ? pts.map((p, i) => ({ idx: i, x: p.x, y: p.y }))
        : (() => {
            const b = shape.bbox;
            return [
                { idx: 0, x: b.x + b.w / 2, y: b.y },
                { idx: 1, x: b.x + b.w, y: b.y + b.h / 2 },
                { idx: 2, x: b.x + b.w / 2, y: b.y + b.h },
                { idx: 3, x: b.x, y: b.y + b.h / 2 },
            ];
        })();
    return local.map((p) => {
        const w = (0, shape_transform_1.applyNodeTransform)(shape, p.x, p.y);
        return { idx: p.idx, x: w.x, y: w.y };
    });
}
function allCxnSites(slide, excludeId) {
    const out = [];
    const walk = (s) => {
        if (s.id !== excludeId) {
            for (const p of cxnSitesOf(s))
                out.push({ shape: s, ...p });
        }
        if (s.kind === "group")
            for (const c of s.children)
                walk(c);
    };
    for (const layer of slide.layers)
        for (const s of layer.shapes)
            walk(s);
    return out;
}
function snapCxnSite(slide, x, y, excludeId, threshold = exports.CXN_SNAP_PX) {
    let best = null;
    let bestD = threshold;
    for (const site of allCxnSites(slide, excludeId)) {
        const d = Math.hypot(site.x - x, site.y - y);
        if (d <= bestD) {
            bestD = d;
            best = site;
        }
    }
    return best;
}
function endMatches(end, target) {
    if (!end)
        return false;
    if (end.shapeId && end.shapeId === target.id)
        return true;
    const n = numericShapeId(target);
    return n !== undefined && end.id === n;
}
function siteForEnd(end, sites) {
    return sites.find((p) => p.idx === end.idx) ?? sites[end.idx] ?? null;
}
function syncLineBbox(s) {
    const minX = Math.min(s.x1, s.x2);
    const minY = Math.min(s.y1, s.y2);
    s.bbox = {
        x: minX,
        y: minY,
        w: Math.max(1, Math.abs(s.x2 - s.x1)),
        h: Math.max(1, Math.abs(s.y2 - s.y1)),
    };
    (0, core_1.markDirty)(s, "bbox");
}
/**
 * 按目标当前连接点位置，把粘在它上面的直线 / 肘形 / 曲线连接符端点吸回去。
 * 平移、缩放、旋转、翻转后都走这一条（比单纯 dx/dy 更能跟上非均匀变形）。
 * 返回被改过的 path 连接符，调用方按 preset 重新生成 `d`。
 */
function followGlueToSites(slide, target) {
    const sites = cxnSitesOf(target);
    const dirtyPaths = [];
    const walk = (s) => {
        if (s.id === target.id) {
            if (s.kind === "group")
                for (const c of s.children)
                    walk(c);
            return;
        }
        if (s.kind === "line") {
            let dirty = false;
            if (endMatches(s.startCxn, target)) {
                const p = siteForEnd(s.startCxn, sites);
                if (p) {
                    s.x1 = p.x;
                    s.y1 = p.y;
                    dirty = true;
                }
            }
            if (endMatches(s.endCxn, target)) {
                const p = siteForEnd(s.endCxn, sites);
                if (p) {
                    s.x2 = p.x;
                    s.y2 = p.y;
                    dirty = true;
                }
            }
            if (dirty)
                syncLineBbox(s);
        }
        else if (isPathConnector(s)) {
            const ends = pathConnectorWorldEnds(s);
            let changed = false;
            if (endMatches(s.startCxn, target)) {
                const p = siteForEnd(s.startCxn, sites);
                if (p) {
                    ends.start = { x: p.x, y: p.y };
                    changed = true;
                }
            }
            if (endMatches(s.endCxn, target)) {
                const p = siteForEnd(s.endCxn, sites);
                if (p) {
                    ends.end = { x: p.x, y: p.y };
                    changed = true;
                }
            }
            if (changed) {
                applyPathConnectorEnds(s, ends.start, ends.end);
                dirtyPaths.push(s);
            }
        }
        if (s.kind === "group")
            for (const c of s.children)
                walk(c);
    };
    for (const layer of slide.layers)
        for (const s of layer.shapes)
            walk(s);
    return dirtyPaths;
}
function shapeForEnd(slide, end) {
    let hit;
    const walk = (s) => {
        if (endMatches(end, s))
            hit = s;
        if (s.kind === "group")
            for (const c of s.children)
                walk(c);
    };
    for (const layer of slide.layers)
        for (const s of layer.shapes)
            walk(s);
    return hit;
}
/**
 * 连接符自身被 bbox 缩放 / 旋转后，把仍粘着的端点吸回目标连接点。
 * 平移连接符本体时不要调用（会把用户拖动弹回去）。
 */
function reattachConnectorGlue(slide, s) {
    if (s.kind === "line") {
        let dirty = false;
        if (s.startCxn) {
            const target = shapeForEnd(slide, s.startCxn);
            const p = target ? siteForEnd(s.startCxn, cxnSitesOf(target)) : null;
            if (p) {
                s.x1 = p.x;
                s.y1 = p.y;
                dirty = true;
            }
        }
        if (s.endCxn) {
            const target = shapeForEnd(slide, s.endCxn);
            const p = target ? siteForEnd(s.endCxn, cxnSitesOf(target)) : null;
            if (p) {
                s.x2 = p.x;
                s.y2 = p.y;
                dirty = true;
            }
        }
        if (dirty)
            syncLineBbox(s);
        return null;
    }
    if (!isPathConnector(s) || (!s.startCxn && !s.endCxn))
        return null;
    const ends = pathConnectorWorldEnds(s);
    let changed = false;
    if (s.startCxn) {
        const target = shapeForEnd(slide, s.startCxn);
        const p = target ? siteForEnd(s.startCxn, cxnSitesOf(target)) : null;
        if (p) {
            ends.start = { x: p.x, y: p.y };
            changed = true;
        }
    }
    if (s.endCxn) {
        const target = shapeForEnd(slide, s.endCxn);
        const p = target ? siteForEnd(s.endCxn, cxnSitesOf(target)) : null;
        if (p) {
            ends.end = { x: p.x, y: p.y };
            changed = true;
        }
    }
    if (!changed)
        return null;
    applyPathConnectorEnds(s, ends.start, ends.end);
    return s;
}
/** @deprecated 用 followGlueToSites；保留给旧调用点。 */
function followGlueOnTranslate(slide, target, dx, dy) {
    if (!dx && !dy)
        return;
    followGlueToSites(slide, target);
}
