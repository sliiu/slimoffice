"use strict";
// 把单个行为/媒体叶子节点编译为 Atom（包含 tracks + 时长 + 迭代/保持元信息）。
Object.defineProperty(exports, "__esModule", { value: true });
exports.compileLeaf = compileLeaf;
const easing_1 = require("../easing");
const types_1 = require("../types");
const behaviors_1 = require("../behaviors");
const presets_1 = require("../presets");
const builds_1 = require("./builds");
const helpers_1 = require("./helpers");
const timing_prop_1 = require("./timing-prop");
function compileLeaf(node, target, ctx, iterate, ancestorEntrExitPreset, ancestorFill, ancestorSpdRatio = 1, ancestorReverse = false, ancestorEasing) {
    if (!(0, types_1.isBehavior)(node) && !(0, types_1.isMedia)(node))
        return null;
    const cTn = (0, types_1.isMedia)(node) ? node.cMediaNode.ctn : node.cBhvr.ctn;
    const autoReverse = !!cTn.autoRev;
    const reverse = ancestorReverse !== (0, timing_prop_1.spdReverses)(cTn.spd);
    const hold = (0, timing_prop_1.resolveHold)(cTn, ancestorFill);
    const decodeCtx = {
        slideWidth: ctx.slideWidth,
        slideHeight: ctx.slideHeight,
        bbox: target.bbox,
        // §20.1.2 scheme color 解析（set.to.clrVal / animClr.from/to）依赖 theme.clrScheme，
        // 透传 colorCtx 让 schemeClr val="folHlink" 等正确还原到主题色。
        colorCtx: ctx.colorCtx,
    };
    let tracks = [];
    let duration = 0;
    let presetClassOut = cTn.presetClass;
    let presetIdOut = cTn.presetID;
    let presetSubtypeOut = cTn.presetSubtype;
    const delegateOpacityAnimToPreset = ancestorEntrExitPreset &&
        node.kind === "anim" &&
        (0, helpers_1.shouldDelegateAnimToParPreset)(ancestorEntrExitPreset, node);
    if (delegateOpacityAnimToPreset) {
        const leafMs = (0, helpers_1.msOf)(cTn.dur);
        const ancMs = ancestorEntrExitPreset.durMs;
        const durMs = leafMs > 0 ? leafMs : ancMs > 0 ? ancMs : (0, helpers_1.leafDefaultDuration)(node);
        duration = durMs / 1000;
        tracks = (0, presets_1.compilePresetTracks)(ancestorEntrExitPreset.presetClass, ancestorEntrExitPreset.presetID, ancestorEntrExitPreset.presetSubtype, {
            slideWidth: ctx.slideWidth,
            slideHeight: ctx.slideHeight,
            duration,
            bbox: target.bbox,
        });
        if (tracks.length > 0) {
            presetClassOut = ancestorEntrExitPreset.presetClass;
            presetIdOut = ancestorEntrExitPreset.presetID;
            presetSubtypeOut = ancestorEntrExitPreset.presetSubtype;
        }
    }
    if (!delegateOpacityAnimToPreset || tracks.length === 0) {
        // §19.5.18 cTn@accel/@decel + @tmFilter 共同决定 dur 内 progress 推进。
        // PowerPoint 实际行为：tmFilter 优先；accel/decel 在没有 tmFilter 时生效。
        // 二者同时存在时，tmFilter 的曲线就是最终曲线（实测与规范默认行为一致）。
        const accelDecel = (0, easing_1.accelDecelEasing)(cTn.accel, cTn.decel);
        const tmEase = (0, timing_prop_1.parseTmFilter)(cTn.tmFilter);
        // 叶子上的 tmFilter / accel / decel 优先；没有时用 effect 容器上的 Smooth Start/End。
        const easing = tmEase ?? accelDecel ?? ancestorEasing;
        // §19.5.18 cTn@spd: 时长缩放（"slow"=0.5×, "fast"=2× …），<1 拉长，>1 加速。
        // leaf 自身 spd × 祖先链累积 spd 得到最终倍率；应用方式：
        //   atom.duration = baseDur / effectiveSpd（spd=2 → 一半时长）。
        const ownSpd = (0, timing_prop_1.resolveSpdRatio)(cTn.spd);
        const effectiveSpd = (ancestorSpdRatio > 0 ? ancestorSpdRatio : 1) * (ownSpd > 0 ? ownSpd : 1);
        const baseDur = (0, helpers_1.msOf)(cTn.dur);
        const rawDurMs = baseDur > 0 ? baseDur : (0, helpers_1.leafDefaultDuration)(node);
        duration = rawDurMs / 1000 / (effectiveSpd > 0 ? effectiveSpd : 1);
        presetClassOut = cTn.presetClass;
        presetIdOut = cTn.presetID;
        presetSubtypeOut = cTn.presetSubtype;
        tracks = [];
        switch (node.kind) {
            case "set":
                tracks = (0, behaviors_1.compileSet)(node, decodeCtx, duration);
                break;
            case "anim":
                tracks = (0, behaviors_1.compileAnim)(node, decodeCtx, duration, easing);
                break;
            case "animClr":
                tracks = (0, behaviors_1.compileAnimClr)(node, ctx, duration, easing);
                break;
            case "animEffect":
                tracks = (0, behaviors_1.compileAnimEffect)(node, duration, easing);
                break;
            case "animMotion":
                tracks = (0, behaviors_1.compileAnimMotion)(node, ctx, easing);
                break;
            case "animRot":
                tracks = (0, behaviors_1.compileAnimRot)(node, duration, easing);
                break;
            case "animScale":
                tracks = (0, behaviors_1.compileAnimScale)(node, duration, easing);
                break;
            case "cmd":
                tracks = (0, behaviors_1.compileCmd)(node);
                break;
            case "audio":
            case "video":
                tracks = (0, behaviors_1.compileMedia)(node);
                break;
        }
        // §19.5: 行为叶子若没有子通道（attrNameLst 缺失或表达式失败），且本节点仅靠 cTn.presetID
        // 描述——这是占位 preset。expandPresetPlaceholders 会把能对上模板的容器和这种叶子
        // 换成真实子树；走到这里说明没有模板（或模板展开后仍编不出通道）。
        // compilePresetTracks 只留作没有模板时的安全网。
        if (tracks.length === 0 && cTn.presetClass && cTn.presetID !== undefined) {
            tracks = (0, presets_1.compilePresetTracks)(cTn.presetClass, cTn.presetID, cTn.presetSubtype, {
                slideWidth: ctx.slideWidth,
                slideHeight: ctx.slideHeight,
                duration,
                bbox: target.bbox,
            });
            presetClassOut = cTn.presetClass;
            presetIdOut = cTn.presetID;
            presetSubtypeOut = cTn.presetSubtype;
        }
    }
    if (tracks.length === 0)
        return null;
    void iterate;
    // iterations 必须在 duration 确定后计算（repeatDur 依赖 duration）。
    const iterations = (0, timing_prop_1.resolveIterations)(cTn, duration);
    // §19.5.3 bldLst 关联：根据 tgtEl.spTgt.spid + cTn.grpId 找到对应的 BuildSpec，
    // 把 build/animBg/bldLvl 元数据附加到 Atom，供 renderer 决定背景动画策略。
    const tgtEl = (0, types_1.isMedia)(node) ? node.cMediaNode.tgtEl : node.cBhvr.tgtEl;
    const spid = tgtEl.spTgt?.spid;
    let buildInfo;
    if (spid && ctx.builds && ctx.builds.length > 0) {
        const buildIdx = ctx.buildIndex ?? (0, builds_1.buildBuildIndex)(ctx.builds);
        ctx.buildIndex = buildIdx;
        const spec = (0, builds_1.findBuild)(buildIdx, `sp_${spid}`, cTn.grpId);
        if (spec) {
            buildInfo = {
                kind: spec.kind,
                build: spec.build,
                animBg: spec.animBg,
                bldLvl: spec.bldLvl,
            };
        }
    }
    // §19.5.14 cBhvr.additive / accumulate 透传到 PropTrack 与 MotionTrack。
    // PropTrack 控制 prop（fillColor / ppt_x / ...）合成；MotionTrack 控制 tx/ty/rotation
    // 走 PropertyAccumulator 时的合成模式。filter / cmd / media 不参与。
    if ((0, types_1.isBehavior)(node)) {
        const additive = node.cBhvr.additive;
        const accumulate = node.cBhvr.accumulate;
        if (additive !== undefined || accumulate !== undefined) {
            for (const t of tracks) {
                if (t.kind === "prop" || t.kind === "motion") {
                    if (additive !== undefined && additive !== "base") {
                        t.additive = additive;
                    }
                    if (accumulate !== undefined) {
                        t.accumulate = accumulate;
                    }
                }
            }
        }
    }
    // §19.5.6 a:anim/@by（无 from/to）语义是"相对增量"，必须叠加到 base 值上而不是覆盖。
    // OOXML cBhvr.additive 默认 "base"（覆盖），PowerPoint 实际行为是把 by 当 sum。
    // 这里把 relative=true 的 prop track 在没显式 additive 时强制设 "sum"，避免：
    //   1) by anim 把 scaleX 由 1 覆盖成 -2 → 形状翻倒
    //   2) 多个 by anim 同 prop 串行（如 emph Teeter 的 6 个 animRot 来回摆），base 覆盖
    //      只保留最后一个 atom 的末态（-25°），sum 累加才能回到 0°
    for (const t of tracks) {
        if (t.kind === "prop" && t.relative && t.additive === undefined) {
            t.additive = "sum";
        }
    }
    // §19.5.18 透传 evtFilter / display / nodePh 元数据：当前 runtime 不消费，
    // 编辑器 / serializer round-trip 时不丢字段。
    const meta = cTn.evtFilter !== undefined || cTn.display !== undefined || cTn.nodePh !== undefined
        ? {
            evtFilter: cTn.evtFilter,
            display: cTn.display,
            nodePh: cTn.nodePh,
        }
        : undefined;
    return {
        id: (0, helpers_1.genId)("atom"),
        source: node,
        targetId: target.id,
        duration,
        iterations,
        autoReverse,
        reverse,
        hold,
        tracks,
        presetClass: presetClassOut,
        presetId: presetIdOut,
        presetSubtype: presetSubtypeOut,
        buildInfo,
        meta,
    };
}
