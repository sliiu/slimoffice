import { makeMorphPathTween, ellipsePathFromSize, linePathFromPoints, polygonPointsToPath, rectPathFromSize } from "./morph-path.js";
import { matchMorphShapePairs, morphGeometryHash, } from "./morph-match.js";
import { ms, runAll, STD_EASE } from "./util.js";
const PATH_RE = /^path|polygon|polyline$/;
function readShapeId(el) {
    const id = el.getAttribute("data-shape-id") ?? el.getAttribute("data-id");
    if (!id || id.startsWith("__"))
        return null;
    return id;
}
function readShapeName(el, id) {
    return el.getAttribute("data-shape-name") ?? el.getAttribute("data-name") ?? id;
}
// Nested shapes (grpSp children, the parser's `_base`/`_text` halves) ride on their outer shape's
// FLIP transform; matching them too would stack a second transform on top.
function hasShapeAncestor(el, root) {
    for (let p = el.parentElement; p && p !== root; p = p.parentElement) {
        if (readShapeId(p))
            return true;
    }
    return false;
}
function collectMatchable(root) {
    const out = [];
    root.querySelectorAll("[data-shape-id], [data-id]").forEach((el) => {
        const id = readShapeId(el);
        if (!id || hasShapeAncestor(el, root))
            return;
        const name = readShapeName(el, id);
        const rect = el.getBoundingClientRect();
        if (rect.width < 1 && rect.height < 1)
            return;
        let pathD;
        const tag = el.tagName.toLowerCase();
        const pathEl = tag === "path"
            ? el
            : el.querySelector("path");
        if (pathEl) {
            pathD = pathEl.getAttribute("d") ?? undefined;
        }
        else if (PATH_RE.test(tag)) {
            pathD = polygonPointsToPath(el.getAttribute("points") ?? "", tag === "polygon");
        }
        else if (tag === "ellipse" || tag === "circle") {
            pathD = ellipsePathFromSize(rect.width, rect.height);
        }
        else if (tag === "rect") {
            pathD = rectPathFromSize(rect.width, rect.height);
        }
        else if (tag === "line") {
            const lineEl = el;
            const x1 = Number(lineEl.getAttribute("x1") ?? 0);
            const y1 = Number(lineEl.getAttribute("y1") ?? 0);
            const x2 = Number(lineEl.getAttribute("x2") ?? rect.width);
            const y2 = Number(lineEl.getAttribute("y2") ?? rect.height);
            pathD = linePathFromPoints(x1, y1, x2, y2);
        }
        const candidate = {
            id,
            name,
            tag,
            rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
            pathD,
            placeholderType: el.getAttribute("data-placeholder-type") ?? undefined,
        };
        const geomHash = morphGeometryHash(candidate);
        out.push({ id, name, geomHash, rect, pathD, el: el });
    });
    return out;
}
function toCandidate(m) {
    return {
        id: m.id,
        name: m.name,
        tag: m.geomHash.split("|")[0] ?? "g",
        rect: {
            left: m.rect.left,
            top: m.rect.top,
            width: m.rect.width,
            height: m.rect.height,
        },
        pathD: m.pathD,
        placeholderType: m.el.getAttribute("data-placeholder-type") ?? undefined,
    };
}
function pairMatchable(ghost, stage) {
    const ghostCands = ghost.map(toCandidate);
    const stageCands = stage.map(toCandidate);
    const out = new Map();
    for (const { ghost: g, stage: s } of matchMorphShapePairs(ghostCands, stageCands)) {
        out.set(stage[stageCands.indexOf(s)], ghost[ghostCands.indexOf(g)]);
    }
    return out;
}
function hasOwnTransform(el) {
    if (!(el instanceof SVGGraphicsElement))
        return false;
    const m = el.transform.baseVal.consolidate()?.matrix;
    return !!m && !(m.a === 1 && m.b === 0 && m.c === 0 && m.d === 1 && m.e === 0 && m.f === 0);
}
// Path tweening replaces FLIP only when the path is the whole shape and draws in slide space;
// otherwise text or siblings in the group would be left behind.
function soleUntransformedPath(el) {
    const path = el.tagName.toLowerCase() === "path"
        ? el
        : el.children.length === 1 && el.children[0].tagName.toLowerCase() === "path"
            ? el.children[0]
            : null;
    if (!path || hasOwnTransform(el) || (path !== el && hasOwnTransform(path)))
        return null;
    return path;
}
export const morph = async (ctx) => {
    const ghostMatched = collectMatchable(ctx.ghost);
    const stageMatched = collectMatchable(ctx.stage);
    if (ghostMatched.length === 0 || stageMatched.length === 0) {
        const dur = ms(ctx);
        const anims = [
            ctx.ghost.animate([{ opacity: 1 }, { opacity: 0 }], {
                duration: dur,
                easing: STD_EASE,
                fill: "forwards",
            }),
        ];
        if (stageMatched.length === 0 && ghostMatched.length > 0) {
            anims.push(ctx.stage.animate([{ opacity: 0.92 }, { opacity: 1 }], {
                duration: dur,
                easing: STD_EASE,
                fill: "forwards",
            }));
        }
        await runAll(anims);
        return;
    }
    const usedGhostIds = new Set();
    const anims = [];
    const pathTweens = [];
    const dur = ms(ctx);
    const pairs = pairMatchable(ghostMatched, stageMatched);
    for (const s of stageMatched) {
        const match = pairs.get(s);
        if (!match) {
            s.el.style.opacity = "0";
            const a = s.el.animate([{ opacity: 0 }, { opacity: 1 }], {
                duration: dur,
                easing: STD_EASE,
                fill: "forwards",
            });
            anims.push(a);
            continue;
        }
        usedGhostIds.add(match.id);
        // The stage shape starts on the ghost's geometry and carries the pair from here on.
        match.el.style.visibility = "hidden";
        const pathEl = soleUntransformedPath(s.el);
        const tween = pathEl && soleUntransformedPath(match.el) && s.pathD && match.pathD
            ? makeMorphPathTween(match.pathD, s.pathD)
            : null;
        if (pathEl && tween) {
            // The ghost's d is already in slide coordinates, so the tween carries position and size.
            pathTweens.push({ el: pathEl, tween });
            pathEl.setAttribute("d", match.pathD);
            continue;
        }
        // SVG CSS transforms are in user units and default to transform-box: view-box.
        const svgScale = s.el instanceof SVGGraphicsElement ? (s.el.ownerSVGElement?.getScreenCTM()?.a ?? 1) : 1;
        const dx = (match.rect.left - s.rect.left) / (svgScale || 1);
        const dy = (match.rect.top - s.rect.top) / (svgScale || 1);
        const sx = match.rect.width / Math.max(1, s.rect.width);
        const sy = match.rect.height / Math.max(1, s.rect.height);
        const el = s.el;
        el.style.transformBox = "fill-box";
        el.style.transformOrigin = "top left";
        const a = el.animate([
            { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, opacity: 1 },
            { transform: "translate(0,0) scale(1,1)", opacity: 1 },
        ], { duration: dur, easing: STD_EASE, fill: "forwards" });
        anims.push(a);
    }
    for (const leftover of ghostMatched) {
        if (usedGhostIds.has(leftover.id))
            continue;
        const a = leftover.el.animate([{ opacity: 1 }, { opacity: 0 }], {
            duration: dur,
            easing: STD_EASE,
            fill: "forwards",
        });
        anims.push(a);
    }
    const fadeGhost = ctx.ghost.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: dur * 0.7,
        delay: dur * 0.3,
        easing: STD_EASE,
        fill: "forwards",
    });
    anims.push(fadeGhost);
    if (pathTweens.length > 0) {
        const start = performance.now();
        await new Promise((resolve) => {
            const step = () => {
                const t = Math.min(1, (performance.now() - start) / Math.max(1, dur));
                for (const pt of pathTweens)
                    pt.el.setAttribute("d", pt.tween(t));
                if (t < 1)
                    requestAnimationFrame(step);
                else
                    resolve();
            };
            requestAnimationFrame(step);
        });
    }
    await runAll(anims);
    for (const s of stageMatched) {
        s.el.style.transform = "";
        s.el.style.opacity = "";
        s.el.style.transformOrigin = "";
        s.el.style.transformBox = "";
    }
};
