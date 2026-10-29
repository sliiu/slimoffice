"use strict";
// XML → OOXML §19.5 模型映射
// 保留所有原始字段，不做任何语义合并。下游 compile 阶段再做 1:1 还原。
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseTimingOoxml = parseTimingOoxml;
exports.resolveTimingSoundTargets = resolveTimingSoundTargets;
const units_1 = require("./units");
const xml_1 = require("./xml");
function parseTimingOoxml(timingEl) {
    if (!timingEl)
        return undefined;
    const tnLst = (0, xml_1.findByLocalName)(timingEl, "tnLst");
    const bldLst = (0, xml_1.findByLocalName)(timingEl, "bldLst");
    const tns = [];
    if (tnLst) {
        for (const ref of (0, xml_1.orderedChildren)(tnLst)) {
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
    const local = (0, xml_1.stripNs)(tag);
    switch (local) {
        case "par":
            return { kind: "par", ctn: parseCTn((0, xml_1.findByLocalName)(node, "cTn")) };
        case "seq": {
            return {
                kind: "seq",
                ctn: parseCTn((0, xml_1.findByLocalName)(node, "cTn")),
                concurrent: (0, units_1.boolish)((0, xml_1.attr)(node, "concurrent")),
                // §19.5.32 ST_TLPreviousActionType = "none" | "skipTimed"。
                prevAc: (0, xml_1.attr)(node, "prevAc"),
                nextAc: (0, xml_1.attr)(node, "nextAc"),
                prevCondLst: parseCondList((0, xml_1.findByLocalName)(node, "prevCondLst")),
                nextCondLst: parseCondList((0, xml_1.findByLocalName)(node, "nextCondLst")),
            };
        }
        case "excl":
            return { kind: "excl", ctn: parseCTn((0, xml_1.findByLocalName)(node, "cTn")) };
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
        const v = (0, xml_1.attr)(cTn, name);
        if (v === undefined)
            return undefined;
        const n = Number(v);
        return Number.isFinite(n) ? n : undefined;
    };
    const dur = parseDuration((0, xml_1.attr)(cTn, "dur"));
    const delay = parseDuration((0, xml_1.attr)(cTn, "delay"));
    const id = (0, xml_1.attr)(cTn, "id");
    const presetID = num("presetID");
    const presetClass = (0, xml_1.attr)(cTn, "presetClass");
    const presetSubtype = num("presetSubtype");
    const presetVersion = num("presetVersion");
    const nodeType = (0, xml_1.attr)(cTn, "nodeType");
    const restart = (0, xml_1.attr)(cTn, "restart");
    const fill = (0, xml_1.attr)(cTn, "fill");
    const syncBehavior = (0, xml_1.attr)(cTn, "syncBehavior");
    const accel = num("accel");
    const decel = num("decel");
    const autoRev = (0, units_1.boolish)((0, xml_1.attr)(cTn, "autoRev"));
    // §19.5.18 cTn.repeatCount = ST_TLIterateVal = unsignedInt | "indefinite"
    const repeatCountRaw = (0, xml_1.attr)(cTn, "repeatCount");
    let repeatCount;
    if (repeatCountRaw === "indefinite") {
        repeatCount = "indefinite";
    }
    else if (repeatCountRaw !== undefined) {
        const n = Number(repeatCountRaw);
        if (Number.isFinite(n))
            repeatCount = n;
    }
    const repeatDur = parseDuration((0, xml_1.attr)(cTn, "repeatDur"));
    // §19.5.18 cTn@spd: ST_Percentage（"100%"/"50000"/数字百分比），PowerPoint 还会写
    // 非规范的字符串 "slow" / "med" / "fast"；这里保留原始字符串，编译期解析为倍率。
    const spd = (0, xml_1.attr)(cTn, "spd");
    // §19.5.18 cTn@tmFilter: SMIL 2.1 时间过滤器曲线 "t1,v1; t2,v2; ..."
    const tmFilter = (0, xml_1.attr)(cTn, "tmFilter");
    const display = (0, units_1.boolish)((0, xml_1.attr)(cTn, "display"));
    const masterRel = (0, xml_1.attr)(cTn, "masterRel");
    const bldLvl = num("bldLvl");
    const grpId = num("grpId");
    const afterEffect = (0, units_1.boolish)((0, xml_1.attr)(cTn, "afterEffect"));
    const nodePh = (0, units_1.boolish)((0, xml_1.attr)(cTn, "nodePh"));
    const evtFilter = (0, xml_1.attr)(cTn, "evtFilter");
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
    out.iterate = parseIterate((0, xml_1.findByLocalName)(cTn, "iterate"));
    const stCondLst = parseCondList((0, xml_1.findByLocalName)(cTn, "stCondLst"));
    const endCondLst = parseCondList((0, xml_1.findByLocalName)(cTn, "endCondLst"));
    const endSync = parseCond((0, xml_1.findByLocalName)(cTn, "endSync"));
    if (stCondLst)
        out.stCondLst = stCondLst;
    if (endCondLst)
        out.endCondLst = endCondLst;
    if (endSync)
        out.endSync = endSync;
    const childTnLst = (0, xml_1.findByLocalName)(cTn, "childTnLst");
    if (childTnLst) {
        const ch = [];
        for (const ref of (0, xml_1.orderedChildren)(childTnLst)) {
            const n = parseTimeNode(ref.tag, ref.node);
            if (n)
                ch.push(n);
        }
        if (ch.length > 0)
            out.childTnLst = ch;
    }
    const subTnLst = (0, xml_1.findByLocalName)(cTn, "subTnLst");
    if (subTnLst) {
        const ch = [];
        for (const ref of (0, xml_1.orderedChildren)(subTnLst)) {
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
    const type = ((0, xml_1.attr)(it, "type") ?? "lt");
    const backwards = (0, units_1.boolish)((0, xml_1.attr)(it, "backwards"));
    const tmAbs = (0, xml_1.findByLocalName)(it, "tmAbs");
    const tmPct = (0, xml_1.findByLocalName)(it, "tmPct");
    const out = { type };
    if (backwards !== undefined)
        out.backwards = backwards;
    if (tmAbs)
        out.tmAbs = Number((0, xml_1.attr)(tmAbs, "val") ?? "0");
    if (tmPct)
        out.tmPct = Number((0, xml_1.attr)(tmPct, "val") ?? "0");
    return out;
}
function parseCondList(node) {
    if (!node)
        return undefined;
    const list = (0, xml_1.findAllByLocalName)(node, "cond");
    if (list.length === 0)
        return undefined;
    return list.map(parseCond).filter((c) => c !== undefined);
}
function parseCond(node) {
    if (!node)
        return undefined;
    const out = {};
    const evt = (0, xml_1.attr)(node, "evt");
    const delay = parseDuration((0, xml_1.attr)(node, "delay"));
    if (evt !== undefined)
        out.evt = evt;
    if (delay !== undefined)
        out.delay = delay;
    const tn = (0, xml_1.findByLocalName)(node, "tn");
    if (tn) {
        const v = (0, xml_1.attr)(tn, "val");
        if (v)
            out.tn = v;
    }
    const rtn = (0, xml_1.findByLocalName)(node, "rtn");
    if (rtn) {
        const v = (0, xml_1.attr)(rtn, "val");
        if (v === "first" || v === "last" || v === "all")
            out.rtn = v;
    }
    const tgt = parseTgtEl((0, xml_1.findByLocalName)(node, "tgtEl"));
    if (tgt)
        out.tgtEl = tgt;
    return out;
}
function parseTgtEl(node) {
    if (!node)
        return undefined;
    const out = {};
    const ink = (0, xml_1.findByLocalName)(node, "inkTgt");
    if (ink) {
        const spid = (0, xml_1.attr)(ink, "spid");
        if (spid)
            out.inkTgt = spid;
    }
    if ((0, xml_1.findByLocalName)(node, "sldTgt"))
        out.sldTgt = true;
    const snd = (0, xml_1.findByLocalName)(node, "sndTgt");
    if (snd) {
        out.sndTgt = {
            embed: (0, xml_1.attr)(snd, "r:embed") ?? (0, xml_1.attr)(snd, "embed"),
            link: (0, xml_1.attr)(snd, "r:link") ?? (0, xml_1.attr)(snd, "link"),
            builtIn: (0, units_1.boolish)((0, xml_1.attr)(snd, "builtIn")),
            rId: (0, xml_1.attr)(snd, "r:embed") ?? (0, xml_1.attr)(snd, "embed") ?? (0, xml_1.attr)(snd, "r:link") ?? (0, xml_1.attr)(snd, "link"),
            name: (0, xml_1.attr)(snd, "name") ?? undefined,
        };
    }
    const sp = (0, xml_1.findByLocalName)(node, "spTgt");
    if (sp) {
        const spid = (0, xml_1.attr)(sp, "spid");
        if (spid) {
            const txEl = parseTxEl((0, xml_1.findByLocalName)(sp, "txEl"));
            const spTgt = { spid };
            // §19.5.66 CT_TLShapeTargetElement: <bg/> 是 CT_Empty 子元素而非属性，
            // 表示动画作用于 shape 的背景层（与 txEl 互斥）。
            if ((0, xml_1.findByLocalName)(sp, "bg"))
                spTgt.bg = true;
            const subSp = (0, xml_1.findByLocalName)(sp, "subSp");
            if (subSp) {
                const ssid = (0, xml_1.attr)(subSp, "spid");
                if (ssid)
                    spTgt.subSpId = ssid;
            }
            const oleChart = (0, xml_1.findByLocalName)(sp, "oleChartEl");
            if (oleChart) {
                const t = (0, xml_1.attr)(oleChart, "type");
                const lvl = (0, xml_1.attr)(oleChart, "lvl");
                const c = {};
                if (t)
                    c.type = t;
                if (lvl !== undefined)
                    c.lvl = Number(lvl);
                spTgt.oleChartEl = c;
            }
            if (txEl)
                spTgt.txEl = txEl;
            const gel = (0, xml_1.findByLocalName)(sp, "graphicEl");
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
    const chart = (0, xml_1.findByLocalName)(node, "chart") ?? (0, xml_1.findByLocalName)(node, "chartEl");
    if (chart) {
        const series = (0, xml_1.findByLocalName)(chart, "series");
        const category = (0, xml_1.findByLocalName)(chart, "category");
        const ce = {};
        if (series) {
            const idx = (0, xml_1.attr)(series, "idx");
            if (idx !== undefined)
                ce.seriesIdx = Number(idx);
        }
        if (category) {
            const idx = (0, xml_1.attr)(category, "idx");
            if (idx !== undefined)
                ce.categoryIdx = Number(idx);
        }
        const bldStep = (0, xml_1.attr)(chart, "bldStep");
        if (bldStep)
            ce.bldStep = bldStep;
        out.chartEl = ce;
    }
    const dgm = (0, xml_1.findByLocalName)(node, "dgm");
    if (dgm) {
        const d = {};
        const id = (0, xml_1.attr)(dgm, "id");
        if (id)
            d.id = id;
        const bldStep = (0, xml_1.attr)(dgm, "bldStep");
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
    const charRg = (0, xml_1.findByLocalName)(node, "charRg");
    if (charRg) {
        const st = Number((0, xml_1.attr)(charRg, "st") ?? "0");
        const end = Number((0, xml_1.attr)(charRg, "end") ?? String(st));
        out.charRg = { st, end };
    }
    const pRg = (0, xml_1.findByLocalName)(node, "pRg");
    if (pRg) {
        const st = Number((0, xml_1.attr)(pRg, "st") ?? "0");
        const end = Number((0, xml_1.attr)(pRg, "end") ?? String(st));
        out.pRg = { st, end };
    }
    return Object.keys(out).length > 0 ? out : undefined;
}
function parseCBhvr(node) {
    const cTn = (0, xml_1.findByLocalName)(node, "cTn");
    const tgt = parseTgtEl((0, xml_1.findByLocalName)(node, "tgtEl"));
    const attrNameLst = (0, xml_1.findByLocalName)(node, "attrNameLst");
    const names = [];
    if (attrNameLst) {
        for (const a of (0, xml_1.findAllByLocalName)(attrNameLst, "attrName")) {
            const t = a["#text"];
            if (t !== undefined && t !== null)
                names.push(String(t));
        }
    }
    const additive = (0, xml_1.attr)(node, "additive");
    const accumulate = (0, xml_1.attr)(node, "accumulate");
    const xfrmType = (0, xml_1.attr)(node, "xfrmType");
    const override = (0, xml_1.attr)(node, "override");
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
    const from = (0, xml_1.attr)(node, "from");
    if (from !== undefined)
        out.from = from;
    const to = (0, xml_1.attr)(node, "to");
    if (to !== undefined)
        out.to = to;
    const by = (0, xml_1.attr)(node, "by");
    if (by !== undefined)
        out.by = by;
    const rctx = (0, xml_1.attr)(node, "rctx");
    if (rctx !== undefined)
        out.rctx = rctx;
    return out;
}
function parseCMediaNode(node) {
    const cTn = (0, xml_1.findByLocalName)(node, "cTn");
    const tgt = parseTgtEl((0, xml_1.findByLocalName)(node, "tgtEl"));
    const out = {
        ctn: parseCTn(cTn),
        tgtEl: tgt ?? {},
    };
    const mute = (0, units_1.boolish)((0, xml_1.attr)(node, "mute"));
    const showWhenStopped = (0, units_1.boolish)((0, xml_1.attr)(node, "showWhenStopped"));
    const numSld = (0, xml_1.attr)(node, "numSld");
    const vol = (0, xml_1.attr)(node, "vol");
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
    const str = (0, xml_1.findByLocalName)(valNode, "strVal");
    if (str) {
        const v = (0, xml_1.attr)(str, "val") ?? "";
        return { kind: "str", val: v };
    }
    const it = (0, xml_1.findByLocalName)(valNode, "intVal");
    if (it) {
        const v = Number((0, xml_1.attr)(it, "val") ?? "0");
        return { kind: "int", val: Number.isFinite(v) ? v : 0 };
    }
    const flt = (0, xml_1.findByLocalName)(valNode, "fltVal");
    if (flt) {
        const v = Number((0, xml_1.attr)(flt, "val") ?? "0");
        return { kind: "flt", val: Number.isFinite(v) ? v : 0 };
    }
    const bv = (0, xml_1.findByLocalName)(valNode, "boolVal");
    if (bv) {
        const v = (0, units_1.boolish)((0, xml_1.attr)(bv, "val")) ?? false;
        return { kind: "bool", val: v };
    }
    const cv = (0, xml_1.findByLocalName)(valNode, "clrVal");
    if (cv) {
        const c = parseAnimColor(cv);
        if (c)
            return { kind: "clr", val: c };
    }
    return undefined;
}
function parseAnimColor(node) {
    const out = {};
    const srgb = (0, xml_1.findByLocalName)(node, "srgbClr");
    const scheme = (0, xml_1.findByLocalName)(node, "schemeClr");
    const prst = (0, xml_1.findByLocalName)(node, "prstClr");
    const hsl = (0, xml_1.findByLocalName)(node, "hslClr");
    const scrgb = (0, xml_1.findByLocalName)(node, "scrgbClr");
    const sys = (0, xml_1.findByLocalName)(node, "sysClr");
    let mods;
    if (srgb) {
        const v = (0, xml_1.attr)(srgb, "val");
        if (v)
            out.hex = "#" + v;
        mods = srgb;
    }
    else if (scheme) {
        const v = (0, xml_1.attr)(scheme, "val");
        if (v)
            out.scheme = v;
        mods = scheme;
    }
    else if (prst) {
        const v = (0, xml_1.attr)(prst, "val");
        if (v)
            out.prst = v;
        mods = prst;
    }
    else if (hsl) {
        const h = Number((0, xml_1.attr)(hsl, "hue") ?? "0");
        const s = Number((0, xml_1.attr)(hsl, "sat") ?? "0");
        const l = Number((0, xml_1.attr)(hsl, "lum") ?? "0");
        out.hsl = { h, s, l };
        mods = hsl;
    }
    else if (scrgb) {
        const r = Number((0, xml_1.attr)(scrgb, "r") ?? "0");
        const g = Number((0, xml_1.attr)(scrgb, "g") ?? "0");
        const b = Number((0, xml_1.attr)(scrgb, "b") ?? "0");
        out.scrgb = { r, g, b };
        mods = scrgb;
    }
    else if (sys) {
        out.sys = {
            val: (0, xml_1.attr)(sys, "val"),
            lastClr: (0, xml_1.attr)(sys, "lastClr") ? "#" + (0, xml_1.attr)(sys, "lastClr") : undefined,
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
    for (const ref of (0, xml_1.orderedChildren)(node)) {
        const local = (0, xml_1.stripNs)(ref.tag);
        const v = Number((0, xml_1.attr)(ref.node, "val") ?? "0");
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
    const rgb = (0, xml_1.findByLocalName)(byEl, "rgb");
    const hsl = (0, xml_1.findByLocalName)(byEl, "hsl");
    const out = {};
    if (rgb) {
        const r = Number((0, xml_1.attr)(rgb, "r") ?? "0");
        const g = Number((0, xml_1.attr)(rgb, "g") ?? "0");
        const b = Number((0, xml_1.attr)(rgb, "b") ?? "0");
        out.rgb = { r, g, b };
    }
    if (hsl) {
        const h = Number((0, xml_1.attr)(hsl, "h") ?? "0");
        const s = Number((0, xml_1.attr)(hsl, "s") ?? "0");
        const l = Number((0, xml_1.attr)(hsl, "l") ?? "0");
        out.hsl = { h, s, l };
    }
    return Object.keys(out).length > 0 ? out : undefined;
}
function parsePoint(node) {
    if (!node)
        return undefined;
    const x = Number((0, xml_1.attr)(node, "x") ?? "0");
    const y = Number((0, xml_1.attr)(node, "y") ?? "0");
    if (!Number.isFinite(x) || !Number.isFinite(y))
        return undefined;
    return { x, y };
}
// 行为节点解析 ---
function parseSet(node) {
    const cBhvr = parseCBhvr((0, xml_1.findByLocalName)(node, "cBhvr") ?? node);
    const to = parseAnimVal((0, xml_1.findByLocalName)(node, "to"));
    const out = { kind: "set", cBhvr };
    if (to)
        out.to = to;
    return out;
}
function parseAnim(node) {
    const cBhvr = parseCBhvr((0, xml_1.findByLocalName)(node, "cBhvr") ?? node);
    const tavLst = (0, xml_1.findByLocalName)(node, "tavLst");
    const tavs = tavLst ? (0, xml_1.findAllByLocalName)(tavLst, "tav") : [];
    const out = { kind: "anim", cBhvr };
    if (tavs.length > 0) {
        out.tavLst = tavs.map(parseTav);
    }
    const by = (0, xml_1.attr)(node, "by");
    const from = (0, xml_1.attr)(node, "from");
    const to = (0, xml_1.attr)(node, "to");
    const calcMode = (0, xml_1.attr)(node, "calcmode");
    const valueType = (0, xml_1.attr)(node, "valueType");
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
    const tm = (0, xml_1.attr)(node, "tm");
    if (tm !== undefined) {
        const n = Number(tm);
        if (Number.isFinite(n))
            out.tm = n;
    }
    const fmla = (0, xml_1.attr)(node, "fmla");
    if (fmla !== undefined)
        out.fmla = fmla;
    const val = parseAnimVal((0, xml_1.findByLocalName)(node, "val"));
    if (val)
        out.val = val;
    const by = (0, xml_1.findByLocalName)(node, "by");
    if (by) {
        const spline = (0, xml_1.findByLocalName)(by, "spline");
        const ctrlPts = (0, xml_1.attr)(spline, "pts") ?? (0, xml_1.attr)(by, "pts");
        if (ctrlPts)
            out.bySpline = ctrlPts;
    }
    return out;
}
function parseAnimClr(node) {
    const cBhvr = parseCBhvr((0, xml_1.findByLocalName)(node, "cBhvr") ?? node);
    const out = { kind: "animClr", cBhvr };
    const clrSpc = (0, xml_1.attr)(node, "clrSpc");
    const dir = (0, xml_1.attr)(node, "dir");
    if (clrSpc)
        out.clrSpc = clrSpc;
    if (dir)
        out.dir = dir;
    const by = parseColorBy((0, xml_1.findByLocalName)(node, "by"));
    if (by)
        out.by = by;
    const fromEl = (0, xml_1.findByLocalName)(node, "from");
    const toEl = (0, xml_1.findByLocalName)(node, "to");
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
    const cBhvr = parseCBhvr((0, xml_1.findByLocalName)(node, "cBhvr") ?? node);
    const out = { kind: "animEffect", cBhvr };
    const transition = (0, xml_1.attr)(node, "transition");
    const filter = (0, xml_1.attr)(node, "filter");
    const prLst = (0, xml_1.attr)(node, "prLst");
    if (transition)
        out.transition = transition;
    if (filter !== undefined)
        out.filter = filter;
    if (prLst !== undefined)
        out.prLst = prLst;
    // §19.5.8 progress: CT_TLAnimVariant，按 intVal/fltVal 取数值。
    const progress = parseAnimVal((0, xml_1.findByLocalName)(node, "progress"));
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
    const cBhvr = parseCBhvr((0, xml_1.findByLocalName)(node, "cBhvr") ?? node);
    const out = { kind: "animMotion", cBhvr };
    const origin = (0, xml_1.attr)(node, "origin");
    const path = (0, xml_1.attr)(node, "path");
    const pathEditMode = (0, xml_1.attr)(node, "pathEditMode");
    const rAng = (0, xml_1.attr)(node, "rAng");
    const ptsTypes = (0, xml_1.attr)(node, "ptsTypes");
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
    const from = parsePoint((0, xml_1.findByLocalName)(node, "from"));
    const to = parsePoint((0, xml_1.findByLocalName)(node, "to"));
    const by = parsePoint((0, xml_1.findByLocalName)(node, "by"));
    const rCtr = parsePoint((0, xml_1.findByLocalName)(node, "rCtr"));
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
    const cBhvr = parseCBhvr((0, xml_1.findByLocalName)(node, "cBhvr") ?? node);
    const out = { kind: "animRot", cBhvr };
    const numAttr = (name) => {
        const v = (0, xml_1.attr)(node, name);
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
    const cBhvr = parseCBhvr((0, xml_1.findByLocalName)(node, "cBhvr") ?? node);
    const out = { kind: "animScale", cBhvr };
    const zoomContents = (0, units_1.boolish)((0, xml_1.attr)(node, "zoomContents"));
    if (zoomContents !== undefined)
        out.zoomContents = zoomContents;
    const from = parsePoint((0, xml_1.findByLocalName)(node, "from"));
    const to = parsePoint((0, xml_1.findByLocalName)(node, "to"));
    const by = parsePoint((0, xml_1.findByLocalName)(node, "by"));
    if (from)
        out.from = from;
    if (to)
        out.to = to;
    if (by)
        out.by = by;
    return out;
}
function parseCmd(node) {
    const cBhvr = parseCBhvr((0, xml_1.findByLocalName)(node, "cBhvr") ?? node);
    const out = { kind: "cmd", cBhvr };
    const type = (0, xml_1.attr)(node, "type");
    const cmd = (0, xml_1.attr)(node, "cmd");
    if (type)
        out.type = type;
    if (cmd !== undefined)
        out.cmd = cmd;
    return out;
}
function parseAudio(node) {
    const media = (0, xml_1.findByLocalName)(node, "cMediaNode") ?? node;
    const out = { kind: "audio", cMediaNode: parseCMediaNode(media) };
    const isNarration = (0, units_1.boolish)((0, xml_1.attr)(node, "isNarration"));
    if (isNarration !== undefined)
        out.isNarration = isNarration;
    return out;
}
function parseVideo(node) {
    const media = (0, xml_1.findByLocalName)(node, "cMediaNode") ?? node;
    const out = { kind: "video", cMediaNode: parseCMediaNode(media) };
    const fullScrn = (0, units_1.boolish)((0, xml_1.attr)(node, "fullScrn"));
    if (fullScrn !== undefined)
        out.fullScrn = fullScrn;
    return out;
}
// bldLst ---
function parseBldLst(bldLst) {
    if (!bldLst)
        return [];
    const out = [];
    for (const ref of (0, xml_1.orderedChildren)(bldLst)) {
        const local = (0, xml_1.stripNs)(ref.tag);
        const n = ref.node;
        const spid = (0, xml_1.attr)(n, "spid");
        if (!spid)
            continue;
        const grpIdRaw = (0, xml_1.attr)(n, "grpId");
        const grpId = grpIdRaw ? Number(grpIdRaw) : 0;
        if (local === "bldP") {
            const bldLvlRaw = (0, xml_1.attr)(n, "bldLvl");
            const bldLvl = bldLvlRaw !== undefined ? Number(bldLvlRaw) : undefined;
            const e = {
                kind: "bldP",
                spid,
                grpId,
                uiExpand: (0, units_1.boolish)((0, xml_1.attr)(n, "uiExpand")),
                build: (0, xml_1.attr)(n, "build"),
                // §19.5.3 bldP@bldLvl: 段落层级，默认 1。
                bldLvl: Number.isFinite(bldLvl) ? bldLvl : undefined,
                // §19.5.3 bldP@animBg: 整 shape 背景是否随段落一起动画，默认 false。
                animBg: (0, units_1.boolish)((0, xml_1.attr)(n, "animBg")),
                rev: (0, units_1.boolish)((0, xml_1.attr)(n, "rev")),
                autoUpdateAnimBg: (0, units_1.boolish)((0, xml_1.attr)(n, "autoUpdateAnimBg")),
            };
            // §19.5.3 advAuto: ST_TLTime = unsignedInt | "indefinite"。
            const adv = parseDuration((0, xml_1.attr)(n, "advAuto"));
            if (adv !== undefined)
                e.advAuto = adv;
            out.push(e);
        }
        else if (local === "bldGraphic") {
            out.push({
                kind: "bldGraphic",
                spid,
                grpId,
                bldAsOne: (0, units_1.boolish)((0, xml_1.attr)(n, "bldAsOne")),
                bldChart: (0, xml_1.attr)(n, "bldChart"),
                bldDgm: (0, xml_1.attr)(n, "bldDgm"),
            });
        }
        else if (local === "bldDgm") {
            out.push({
                kind: "bldDgm",
                spid,
                grpId,
                bld: (0, xml_1.attr)(n, "bld"),
            });
        }
        else if (local === "bldOleChart") {
            out.push({
                kind: "bldOleChart",
                spid,
                grpId,
                animBg: (0, units_1.boolish)((0, xml_1.attr)(n, "animBg")),
                bld: (0, xml_1.attr)(n, "bld"),
            });
        }
    }
    return out;
}
/** 把 `<p:sndTgt r:embed>` 解成可重登记的媒体 src，供 from-scratch / 放映使用。 */
function resolveTimingSoundTargets(timing, ctx) {
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
