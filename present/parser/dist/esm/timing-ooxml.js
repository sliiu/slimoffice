// XML → OOXML §19.5 模型映射
// 保留所有原始字段，不做任何语义合并。下游 compile 阶段再做 1:1 还原。
import { boolish } from "./units.js";
import { attr, findAllByLocalName, findByLocalName, orderedChildren, stripNs, } from "./xml.js";
export function parseTimingOoxml(timingEl) {
    if (!timingEl)
        return undefined;
    const tnLst = findByLocalName(timingEl, "tnLst");
    const bldLst = findByLocalName(timingEl, "bldLst");
    const tns = [];
    if (tnLst) {
        for (const ref of orderedChildren(tnLst)) {
            const n = parseTimeNode(ref.tag, ref.node);
            if (n)
                tns.push(n);
        }
    }
    if (tns.length === 0)
        return undefined;
    return { tnLst: tns, bldLst: parseBldLst(bldLst) };
}
function parseTimeNode(tag, node) {
    const local = stripNs(tag);
    switch (local) {
        case "par":
            return { kind: "par", ctn: parseCTn(findByLocalName(node, "cTn")) };
        case "seq": {
            return {
                kind: "seq",
                ctn: parseCTn(findByLocalName(node, "cTn")),
                concurrent: boolish(attr(node, "concurrent")),
                // §19.5.32 ST_TLPreviousActionType = "none" | "skipTimed"。
                prevAc: attr(node, "prevAc"),
                nextAc: attr(node, "nextAc"),
                prevCondLst: parseCondList(findByLocalName(node, "prevCondLst")),
                nextCondLst: parseCondList(findByLocalName(node, "nextCondLst")),
            };
        }
        case "excl":
            return { kind: "excl", ctn: parseCTn(findByLocalName(node, "cTn")) };
        case "set":
            return parseSet(node);
        case "anim":
            return parseAnim(node);
        case "animClr":
            return parseAnimClr(node);
        case "animEffect":
            return parseAnimEffect(node);
        case "animMotion":
            return parseAnimMotion(node);
        case "animRot":
            return parseAnimRot(node);
        case "animScale":
            return parseAnimScale(node);
        case "cmd":
            return parseCmd(node);
        case "audio":
            return parseAudio(node);
        case "video":
            return parseVideo(node);
        default:
            return null;
    }
}
function parseCTn(cTn) {
    if (!cTn)
        return {};
    const out = {};
    const num = (name) => {
        const v = attr(cTn, name);
        if (v === undefined)
            return undefined;
        const n = Number(v);
        return Number.isFinite(n) ? n : undefined;
    };
    const dur = parseDuration(attr(cTn, "dur"));
    const delay = parseDuration(attr(cTn, "delay"));
    const id = attr(cTn, "id");
    const presetID = num("presetID");
    const presetClass = attr(cTn, "presetClass");
    const presetSubtype = num("presetSubtype");
    const presetVersion = num("presetVersion");
    const nodeType = attr(cTn, "nodeType");
    const restart = attr(cTn, "restart");
    const fill = attr(cTn, "fill");
    const syncBehavior = attr(cTn, "syncBehavior");
    const accel = num("accel");
    const decel = num("decel");
    const autoRev = boolish(attr(cTn, "autoRev"));
    // §19.5.18 cTn.repeatCount = ST_TLIterateVal = unsignedInt | "indefinite"
    const repeatCountRaw = attr(cTn, "repeatCount");
    let repeatCount;
    if (repeatCountRaw === "indefinite") {
        repeatCount = "indefinite";
    }
    else if (repeatCountRaw !== undefined) {
        const n = Number(repeatCountRaw);
        if (Number.isFinite(n))
            repeatCount = n;
    }
    const repeatDur = parseDuration(attr(cTn, "repeatDur"));
    // §19.5.18 cTn@spd: ST_Percentage（"100%"/"50000"/数字百分比），PowerPoint 还会写
    // 非规范的字符串 "slow" / "med" / "fast"；这里保留原始字符串，编译期解析为倍率。
    const spd = attr(cTn, "spd");
    // §19.5.18 cTn@tmFilter: SMIL 2.1 时间过滤器曲线 "t1,v1; t2,v2; ..."
    const tmFilter = attr(cTn, "tmFilter");
    const display = boolish(attr(cTn, "display"));
    const masterRel = attr(cTn, "masterRel");
    const bldLvl = num("bldLvl");
    const grpId = num("grpId");
    const afterEffect = boolish(attr(cTn, "afterEffect"));
    const nodePh = boolish(attr(cTn, "nodePh"));
    const evtFilter = attr(cTn, "evtFilter");
    if (id !== undefined)
        out.id = id;
    if (presetID !== undefined)
        out.presetID = presetID;
    if (presetClass !== undefined)
        out.presetClass = presetClass;
    if (presetSubtype !== undefined)
        out.presetSubtype = presetSubtype;
    if (presetVersion !== undefined)
        out.presetVersion = presetVersion;
    if (nodeType !== undefined)
        out.nodeType = nodeType;
    if (dur !== undefined)
        out.dur = dur;
    if (delay !== undefined)
        out.delay = delay;
    if (restart !== undefined)
        out.restart = restart;
    if (fill !== undefined)
        out.fill = fill;
    if (syncBehavior !== undefined)
        out.syncBehavior = syncBehavior;
    if (accel !== undefined)
        out.accel = accel;
    if (decel !== undefined)
        out.decel = decel;
    if (autoRev !== undefined)
        out.autoRev = autoRev;
    if (repeatCount !== undefined)
        out.repeatCount = repeatCount;
    if (repeatDur !== undefined)
        out.repeatDur = repeatDur;
    if (spd !== undefined)
        out.spd = spd;
    if (tmFilter !== undefined)
        out.tmFilter = tmFilter;
    if (display !== undefined)
        out.display = display;
    if (masterRel !== undefined)
        out.masterRel = masterRel;
    if (bldLvl !== undefined)
        out.bldLvl = bldLvl;
    if (grpId !== undefined)
        out.grpId = grpId;
    if (afterEffect !== undefined)
        out.afterEffect = afterEffect;
    if (nodePh !== undefined)
        out.nodePh = nodePh;
    if (evtFilter !== undefined)
        out.evtFilter = evtFilter;
    out.iterate = parseIterate(findByLocalName(cTn, "iterate"));
    const stCondLst = parseCondList(findByLocalName(cTn, "stCondLst"));
    const endCondLst = parseCondList(findByLocalName(cTn, "endCondLst"));
    const endSync = parseCond(findByLocalName(cTn, "endSync"));
    if (stCondLst)
        out.stCondLst = stCondLst;
    if (endCondLst)
        out.endCondLst = endCondLst;
    if (endSync)
        out.endSync = endSync;
    const childTnLst = findByLocalName(cTn, "childTnLst");
    if (childTnLst) {
        const ch = [];
        for (const ref of orderedChildren(childTnLst)) {
            const n = parseTimeNode(ref.tag, ref.node);
            if (n)
                ch.push(n);
        }
        if (ch.length > 0)
            out.childTnLst = ch;
    }
    const subTnLst = findByLocalName(cTn, "subTnLst");
    if (subTnLst) {
        const ch = [];
        for (const ref of orderedChildren(subTnLst)) {
            const n = parseTimeNode(ref.tag, ref.node);
            if (n)
                ch.push(n);
        }
        if (ch.length > 0)
            out.subTnLst = ch;
    }
    return out;
}
function parseDuration(v) {
    if (v === undefined)
        return undefined;
    if (v === "indefinite")
        return "indefinite";
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
}
function parseIterate(it) {
    if (!it)
        return undefined;
    const type = (attr(it, "type") ?? "lt");
    const backwards = boolish(attr(it, "backwards"));
    const tmAbs = findByLocalName(it, "tmAbs");
    const tmPct = findByLocalName(it, "tmPct");
    const out = { type };
    if (backwards !== undefined)
        out.backwards = backwards;
    if (tmAbs)
        out.tmAbs = Number(attr(tmAbs, "val") ?? "0");
    if (tmPct)
        out.tmPct = Number(attr(tmPct, "val") ?? "0");
    return out;
}
function parseCondList(node) {
    if (!node)
        return undefined;
    const list = findAllByLocalName(node, "cond");
    if (list.length === 0)
        return undefined;
    return list.map(parseCond).filter((c) => c !== undefined);
}
function parseCond(node) {
    if (!node)
        return undefined;
    const out = {};
    const evt = attr(node, "evt");
    const delay = parseDuration(attr(node, "delay"));
    if (evt !== undefined)
        out.evt = evt;
    if (delay !== undefined)
        out.delay = delay;
    const tn = findByLocalName(node, "tn");
    if (tn) {
        const v = attr(tn, "val");
        if (v)
            out.tn = v;
    }
    const rtn = findByLocalName(node, "rtn");
    if (rtn) {
        const v = attr(rtn, "val");
        if (v === "first" || v === "last" || v === "all")
            out.rtn = v;
    }
    const tgt = parseTgtEl(findByLocalName(node, "tgtEl"));
    if (tgt)
        out.tgtEl = tgt;
    return out;
}
function parseTgtEl(node) {
    if (!node)
        return undefined;
    const out = {};
    const ink = findByLocalName(node, "inkTgt");
    if (ink) {
        const spid = attr(ink, "spid");
        if (spid)
            out.inkTgt = spid;
    }
    if (findByLocalName(node, "sldTgt"))
        out.sldTgt = true;
    const snd = findByLocalName(node, "sndTgt");
    if (snd) {
        out.sndTgt = {
            embed: attr(snd, "r:embed") ?? attr(snd, "embed"),
            link: attr(snd, "r:link") ?? attr(snd, "link"),
            builtIn: boolish(attr(snd, "builtIn")),
            rId: attr(snd, "r:embed") ?? attr(snd, "embed") ?? attr(snd, "r:link") ?? attr(snd, "link"),
            name: attr(snd, "name") ?? undefined,
        };
    }
    const sp = findByLocalName(node, "spTgt");
    if (sp) {
        const spid = attr(sp, "spid");
        if (spid) {
            const txEl = parseTxEl(findByLocalName(sp, "txEl"));
            const spTgt = { spid };
            // §19.5.66 CT_TLShapeTargetElement: <bg/> 是 CT_Empty 子元素而非属性，
            // 表示动画作用于 shape 的背景层（与 txEl 互斥）。
            if (findByLocalName(sp, "bg"))
                spTgt.bg = true;
            const subSp = findByLocalName(sp, "subSp");
            if (subSp) {
                const ssid = attr(subSp, "spid");
                if (ssid)
                    spTgt.subSpId = ssid;
            }
            const oleChart = findByLocalName(sp, "oleChartEl");
            if (oleChart) {
                const t = attr(oleChart, "type");
                const lvl = attr(oleChart, "lvl");
                const c = {};
                if (t)
                    c.type = t;
                if (lvl !== undefined)
                    c.lvl = Number(lvl);
                spTgt.oleChartEl = c;
            }
            if (txEl)
                spTgt.txEl = txEl;
            const gel = findByLocalName(sp, "graphicEl");
            if (gel) {
                spTgt.graphicEl = parseGraphicEl(gel);
            }
            out.spTgt = spTgt;
        }
    }
    return Object.keys(out).length > 0 ? out : undefined;
}
function parseGraphicEl(node) {
    const out = {};
    const chart = findByLocalName(node, "chart") ?? findByLocalName(node, "chartEl");
    if (chart) {
        const series = findByLocalName(chart, "series");
        const category = findByLocalName(chart, "category");
        const ce = {};
        if (series) {
            const idx = attr(series, "idx");
            if (idx !== undefined)
                ce.seriesIdx = Number(idx);
        }
        if (category) {
            const idx = attr(category, "idx");
            if (idx !== undefined)
                ce.categoryIdx = Number(idx);
        }
        const bldStep = attr(chart, "bldStep");
        if (bldStep)
            ce.bldStep = bldStep;
        out.chartEl = ce;
    }
    const dgm = findByLocalName(node, "dgm");
    if (dgm) {
        const d = {};
        const id = attr(dgm, "id");
        if (id)
            d.id = id;
        const bldStep = attr(dgm, "bldStep");
        if (bldStep)
            d.bldStep = bldStep;
        out.dgmEl = d;
    }
    return out;
}
function parseTxEl(node) {
    if (!node)
        return undefined;
    const out = {};
    const charRg = findByLocalName(node, "charRg");
    if (charRg) {
        const st = Number(attr(charRg, "st") ?? "0");
        const end = Number(attr(charRg, "end") ?? String(st));
        out.charRg = { st, end };
    }
    const pRg = findByLocalName(node, "pRg");
    if (pRg) {
        const st = Number(attr(pRg, "st") ?? "0");
        const end = Number(attr(pRg, "end") ?? String(st));
        out.pRg = { st, end };
    }
    return Object.keys(out).length > 0 ? out : undefined;
}
function parseCBhvr(node) {
    const cTn = findByLocalName(node, "cTn");
    const tgt = parseTgtEl(findByLocalName(node, "tgtEl"));
    const attrNameLst = findByLocalName(node, "attrNameLst");
    const names = [];
    if (attrNameLst) {
        for (const a of findAllByLocalName(attrNameLst, "attrName")) {
            const t = a["#text"];
            if (t !== undefined && t !== null)
                names.push(String(t));
        }
    }
    const additive = attr(node, "additive");
    const accumulate = attr(node, "accumulate");
    const xfrmType = attr(node, "xfrmType");
    const override = attr(node, "override");
    const out = {
        ctn: parseCTn(cTn),
        tgtEl: tgt ?? {},
    };
    if (names.length > 0)
        out.attrNameLst = names;
    if (additive !== undefined)
        out.additive = additive;
    if (accumulate !== undefined)
        out.accumulate = accumulate;
    if (xfrmType !== undefined)
        out.xfrmType = xfrmType;
    if (override !== undefined)
        out.override = override;
    const from = attr(node, "from");
    if (from !== undefined)
        out.from = from;
    const to = attr(node, "to");
    if (to !== undefined)
        out.to = to;
    const by = attr(node, "by");
    if (by !== undefined)
        out.by = by;
    const rctx = attr(node, "rctx");
    if (rctx !== undefined)
        out.rctx = rctx;
    return out;
}
function parseCMediaNode(node) {
    const cTn = findByLocalName(node, "cTn");
    const tgt = parseTgtEl(findByLocalName(node, "tgtEl"));
    const out = {
        ctn: parseCTn(cTn),
        tgtEl: tgt ?? {},
    };
    const mute = boolish(attr(node, "mute"));
    const showWhenStopped = boolish(attr(node, "showWhenStopped"));
    const numSld = attr(node, "numSld");
    const vol = attr(node, "vol");
    if (mute !== undefined)
        out.mute = mute;
    if (showWhenStopped !== undefined)
        out.showWhenStopped = showWhenStopped;
    if (numSld !== undefined)
        out.numSld = Number(numSld);
    if (vol !== undefined)
        out.vol = Number(vol);
    return out;
}
function parseAnimVal(valNode) {
    if (!valNode)
        return undefined;
    const str = findByLocalName(valNode, "strVal");
    if (str) {
        const v = attr(str, "val") ?? "";
        return { kind: "str", val: v };
    }
    const it = findByLocalName(valNode, "intVal");
    if (it) {
        const v = Number(attr(it, "val") ?? "0");
        return { kind: "int", val: Number.isFinite(v) ? v : 0 };
    }
    const flt = findByLocalName(valNode, "fltVal");
    if (flt) {
        const v = Number(attr(flt, "val") ?? "0");
        return { kind: "flt", val: Number.isFinite(v) ? v : 0 };
    }
    const bv = findByLocalName(valNode, "boolVal");
    if (bv) {
        const v = boolish(attr(bv, "val")) ?? false;
        return { kind: "bool", val: v };
    }
    const cv = findByLocalName(valNode, "clrVal");
    if (cv) {
        const c = parseAnimColor(cv);
        if (c)
            return { kind: "clr", val: c };
    }
    return undefined;
}
function parseAnimColor(node) {
    const out = {};
    const srgb = findByLocalName(node, "srgbClr");
    const scheme = findByLocalName(node, "schemeClr");
    const prst = findByLocalName(node, "prstClr");
    const hsl = findByLocalName(node, "hslClr");
    const scrgb = findByLocalName(node, "scrgbClr");
    const sys = findByLocalName(node, "sysClr");
    let mods;
    if (srgb) {
        const v = attr(srgb, "val");
        if (v)
            out.hex = "#" + v;
        mods = srgb;
    }
    else if (scheme) {
        const v = attr(scheme, "val");
        if (v)
            out.scheme = v;
        mods = scheme;
    }
    else if (prst) {
        const v = attr(prst, "val");
        if (v)
            out.prst = v;
        mods = prst;
    }
    else if (hsl) {
        const h = Number(attr(hsl, "hue") ?? "0");
        const s = Number(attr(hsl, "sat") ?? "0");
        const l = Number(attr(hsl, "lum") ?? "0");
        out.hsl = { h, s, l };
        mods = hsl;
    }
    else if (scrgb) {
        const r = Number(attr(scrgb, "r") ?? "0");
        const g = Number(attr(scrgb, "g") ?? "0");
        const b = Number(attr(scrgb, "b") ?? "0");
        out.scrgb = { r, g, b };
        mods = scrgb;
    }
    else if (sys) {
        out.sys = {
            val: attr(sys, "val"),
            lastClr: attr(sys, "lastClr") ? "#" + attr(sys, "lastClr") : undefined,
        };
        mods = sys;
    }
    else {
        return undefined;
    }
    if (mods) {
        const list = parseColorModifiers(mods);
        if (list.length > 0)
            out.modifiers = list;
    }
    return out;
}
function parseColorModifiers(node) {
    const out = [];
    for (const ref of orderedChildren(node)) {
        const local = stripNs(ref.tag);
        const v = Number(attr(ref.node, "val") ?? "0");
        if (!Number.isFinite(v))
            continue;
        switch (local) {
            case "lumMod":
            case "lumOff":
            case "shade":
            case "tint":
            case "satMod":
            case "satOff":
            case "hueMod":
            case "hueOff":
            case "alpha":
            case "alphaMod":
            case "alphaOff":
                out.push({ kind: local, val: v });
                break;
            default:
                break;
        }
    }
    return out;
}
function parseColorBy(byEl) {
    if (!byEl)
        return undefined;
    const rgb = findByLocalName(byEl, "rgb");
    const hsl = findByLocalName(byEl, "hsl");
    const out = {};
    if (rgb) {
        const r = Number(attr(rgb, "r") ?? "0");
        const g = Number(attr(rgb, "g") ?? "0");
        const b = Number(attr(rgb, "b") ?? "0");
        out.rgb = { r, g, b };
    }
    if (hsl) {
        const h = Number(attr(hsl, "h") ?? "0");
        const s = Number(attr(hsl, "s") ?? "0");
        const l = Number(attr(hsl, "l") ?? "0");
        out.hsl = { h, s, l };
    }
    return Object.keys(out).length > 0 ? out : undefined;
}
function parsePoint(node) {
    if (!node)
        return undefined;
    const x = Number(attr(node, "x") ?? "0");
    const y = Number(attr(node, "y") ?? "0");
    if (!Number.isFinite(x) || !Number.isFinite(y))
        return undefined;
    return { x, y };
}
// 行为节点解析 ---
function parseSet(node) {
    const cBhvr = parseCBhvr(findByLocalName(node, "cBhvr") ?? node);
    const to = parseAnimVal(findByLocalName(node, "to"));
    const out = { kind: "set", cBhvr };
    if (to)
        out.to = to;
    return out;
}
function parseAnim(node) {
    const cBhvr = parseCBhvr(findByLocalName(node, "cBhvr") ?? node);
    const tavLst = findByLocalName(node, "tavLst");
    const tavs = tavLst ? findAllByLocalName(tavLst, "tav") : [];
    const out = { kind: "anim", cBhvr };
    if (tavs.length > 0) {
        out.tavLst = tavs.map(parseTav);
    }
    const by = attr(node, "by");
    const from = attr(node, "from");
    const to = attr(node, "to");
    const calcMode = attr(node, "calcmode");
    const valueType = attr(node, "valueType");
    if (by !== undefined)
        out.by = by;
    if (from !== undefined)
        out.from = from;
    if (to !== undefined)
        out.to = to;
    if (calcMode !== undefined)
        out.calcMode = calcMode;
    if (valueType !== undefined)
        out.valueType = valueType;
    return out;
}
function parseTav(node) {
    const out = {};
    const tm = attr(node, "tm");
    if (tm !== undefined) {
        const n = Number(tm);
        if (Number.isFinite(n))
            out.tm = n;
    }
    const fmla = attr(node, "fmla");
    if (fmla !== undefined)
        out.fmla = fmla;
    const val = parseAnimVal(findByLocalName(node, "val"));
    if (val)
        out.val = val;
    const by = findByLocalName(node, "by");
    if (by) {
        const spline = findByLocalName(by, "spline");
        const ctrlPts = attr(spline, "pts") ?? attr(by, "pts");
        if (ctrlPts)
            out.bySpline = ctrlPts;
    }
    return out;
}
function parseAnimClr(node) {
    const cBhvr = parseCBhvr(findByLocalName(node, "cBhvr") ?? node);
    const out = { kind: "animClr", cBhvr };
    const clrSpc = attr(node, "clrSpc");
    const dir = attr(node, "dir");
    if (clrSpc)
        out.clrSpc = clrSpc;
    if (dir)
        out.dir = dir;
    const by = parseColorBy(findByLocalName(node, "by"));
    if (by)
        out.by = by;
    const fromEl = findByLocalName(node, "from");
    const toEl = findByLocalName(node, "to");
    if (fromEl) {
        const c = parseAnimColor(fromEl);
        if (c)
            out.from = c;
    }
    if (toEl) {
        const c = parseAnimColor(toEl);
        if (c)
            out.to = c;
    }
    return out;
}
function parseAnimEffect(node) {
    const cBhvr = parseCBhvr(findByLocalName(node, "cBhvr") ?? node);
    const out = { kind: "animEffect", cBhvr };
    const transition = attr(node, "transition");
    const filter = attr(node, "filter");
    const prLst = attr(node, "prLst");
    if (transition)
        out.transition = transition;
    if (filter !== undefined)
        out.filter = filter;
    if (prLst !== undefined)
        out.prLst = prLst;
    // §19.5.8 progress: CT_TLAnimVariant，按 intVal/fltVal 取数值。
    const progress = parseAnimVal(findByLocalName(node, "progress"));
    if (progress) {
        let v;
        if (progress.kind === "int" || progress.kind === "flt")
            v = progress.val;
        else if (progress.kind === "str") {
            const n = Number(progress.val);
            if (Number.isFinite(n))
                v = n;
        }
        if (v !== undefined)
            out.progress = v;
    }
    return out;
}
function parseAnimMotion(node) {
    const cBhvr = parseCBhvr(findByLocalName(node, "cBhvr") ?? node);
    const out = { kind: "animMotion", cBhvr };
    const origin = attr(node, "origin");
    const path = attr(node, "path");
    const pathEditMode = attr(node, "pathEditMode");
    const rAng = attr(node, "rAng");
    const ptsTypes = attr(node, "ptsTypes");
    if (origin)
        out.origin = origin;
    if (path !== undefined)
        out.path = path;
    if (pathEditMode)
        out.pathEditMode = pathEditMode;
    if (rAng !== undefined)
        out.rAng = Number(rAng);
    if (ptsTypes !== undefined)
        out.ptsTypes = ptsTypes;
    const from = parsePoint(findByLocalName(node, "from"));
    const to = parsePoint(findByLocalName(node, "to"));
    const by = parsePoint(findByLocalName(node, "by"));
    const rCtr = parsePoint(findByLocalName(node, "rCtr"));
    if (from)
        out.from = from;
    if (to)
        out.to = to;
    if (by)
        out.by = by;
    if (rCtr)
        out.rCtr = rCtr;
    return out;
}
function parseAnimRot(node) {
    const cBhvr = parseCBhvr(findByLocalName(node, "cBhvr") ?? node);
    const out = { kind: "animRot", cBhvr };
    const numAttr = (name) => {
        const v = attr(node, name);
        if (v === undefined)
            return undefined;
        const n = Number(v);
        return Number.isFinite(n) ? n : undefined;
    };
    const by = numAttr("by");
    const from = numAttr("from");
    const to = numAttr("to");
    if (by !== undefined)
        out.by = by;
    if (from !== undefined)
        out.from = from;
    if (to !== undefined)
        out.to = to;
    return out;
}
function parseAnimScale(node) {
    const cBhvr = parseCBhvr(findByLocalName(node, "cBhvr") ?? node);
    const out = { kind: "animScale", cBhvr };
    const zoomContents = boolish(attr(node, "zoomContents"));
    if (zoomContents !== undefined)
        out.zoomContents = zoomContents;
    const from = parsePoint(findByLocalName(node, "from"));
    const to = parsePoint(findByLocalName(node, "to"));
    const by = parsePoint(findByLocalName(node, "by"));
    if (from)
        out.from = from;
    if (to)
        out.to = to;
    if (by)
        out.by = by;
    return out;
}
function parseCmd(node) {
    const cBhvr = parseCBhvr(findByLocalName(node, "cBhvr") ?? node);
    const out = { kind: "cmd", cBhvr };
    const type = attr(node, "type");
    const cmd = attr(node, "cmd");
    if (type)
        out.type = type;
    if (cmd !== undefined)
        out.cmd = cmd;
    return out;
}
function parseAudio(node) {
    const media = findByLocalName(node, "cMediaNode") ?? node;
    const out = { kind: "audio", cMediaNode: parseCMediaNode(media) };
    const isNarration = boolish(attr(node, "isNarration"));
    if (isNarration !== undefined)
        out.isNarration = isNarration;
    return out;
}
function parseVideo(node) {
    const media = findByLocalName(node, "cMediaNode") ?? node;
    const out = { kind: "video", cMediaNode: parseCMediaNode(media) };
    const fullScrn = boolish(attr(node, "fullScrn"));
    if (fullScrn !== undefined)
        out.fullScrn = fullScrn;
    return out;
}
// bldLst ---
function parseBldLst(bldLst) {
    if (!bldLst)
        return [];
    const out = [];
    for (const ref of orderedChildren(bldLst)) {
        const local = stripNs(ref.tag);
        const n = ref.node;
        const spid = attr(n, "spid");
        if (!spid)
            continue;
        const grpIdRaw = attr(n, "grpId");
        const grpId = grpIdRaw ? Number(grpIdRaw) : 0;
        if (local === "bldP") {
            const bldLvlRaw = attr(n, "bldLvl");
            const bldLvl = bldLvlRaw !== undefined ? Number(bldLvlRaw) : undefined;
            const e = {
                kind: "bldP",
                spid,
                grpId,
                uiExpand: boolish(attr(n, "uiExpand")),
                build: attr(n, "build"),
                // §19.5.3 bldP@bldLvl: 段落层级，默认 1。
                bldLvl: Number.isFinite(bldLvl) ? bldLvl : undefined,
                // §19.5.3 bldP@animBg: 整 shape 背景是否随段落一起动画，默认 false。
                animBg: boolish(attr(n, "animBg")),
                rev: boolish(attr(n, "rev")),
                autoUpdateAnimBg: boolish(attr(n, "autoUpdateAnimBg")),
            };
            // §19.5.3 advAuto: ST_TLTime = unsignedInt | "indefinite"。
            const adv = parseDuration(attr(n, "advAuto"));
            if (adv !== undefined)
                e.advAuto = adv;
            out.push(e);
        }
        else if (local === "bldGraphic") {
            out.push({
                kind: "bldGraphic",
                spid,
                grpId,
                bldAsOne: boolish(attr(n, "bldAsOne")),
                bldChart: attr(n, "bldChart"),
                bldDgm: attr(n, "bldDgm"),
            });
        }
        else if (local === "bldDgm") {
            out.push({
                kind: "bldDgm",
                spid,
                grpId,
                bld: attr(n, "bld"),
            });
        }
        else if (local === "bldOleChart") {
            out.push({
                kind: "bldOleChart",
                spid,
                grpId,
                animBg: boolish(attr(n, "animBg")),
                bld: attr(n, "bld"),
            });
        }
    }
    return out;
}
/** 把 `<p:sndTgt r:embed>` 解成可重登记的媒体 src，供 from-scratch / 放映使用。 */
export function resolveTimingSoundTargets(timing, ctx) {
    for (const n of timing.tnLst)
        walkTimeNode(n, ctx);
}
function walkTimeNode(n, ctx) {
    switch (n.kind) {
        case "par":
        case "excl":
            walkCTn(n.ctn, ctx);
            break;
        case "seq":
            walkCTn(n.ctn, ctx);
            for (const c of n.prevCondLst ?? [])
                walkCond(c, ctx);
            for (const c of n.nextCondLst ?? [])
                walkCond(c, ctx);
            break;
        case "audio":
        case "video":
            walkCTn(n.cMediaNode.ctn, ctx);
            resolveSndTgt(n.cMediaNode.tgtEl, ctx);
            break;
        default:
            if ("cBhvr" in n) {
                walkCTn(n.cBhvr.ctn, ctx);
                resolveSndTgt(n.cBhvr.tgtEl, ctx);
            }
            break;
    }
}
function walkCTn(c, ctx) {
    if (!c)
        return;
    for (const x of c.stCondLst ?? [])
        walkCond(x, ctx);
    for (const x of c.endCondLst ?? [])
        walkCond(x, ctx);
    if (c.endSync)
        walkCond(c.endSync, ctx);
    for (const n of c.childTnLst ?? [])
        walkTimeNode(n, ctx);
    for (const n of c.subTnLst ?? [])
        walkTimeNode(n, ctx);
}
function walkCond(c, ctx) {
    if (c.tgtEl)
        resolveSndTgt(c.tgtEl, ctx);
}
function resolveSndTgt(t, ctx) {
    const st = t?.sndTgt;
    if (!st || st.src)
        return;
    const rid = st.embed ?? st.link ?? st.rId;
    if (!rid || !ctx.rels)
        return;
    const path = ctx.rels.resolve(rid);
    if (!path)
        return;
    st.src = /^https?:\/\//i.test(path) || /^file:/i.test(path) ? path : ctx.resolveMedia?.(path);
}
