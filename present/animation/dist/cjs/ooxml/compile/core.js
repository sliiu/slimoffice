"use strict";
// compileTiming 主入口：把 OoxmlTiming 树编译为 CompiledTiming。
Object.defineProperty(exports, "__esModule", { value: true });
exports.compileTiming = compileTiming;
const builds_1 = require("./builds");
const emit_1 = require("./emit");
const preset_expand_1 = require("./preset-expand");
const random_effects_1 = require("./random-effects");
const tn_index_1 = require("./tn-index");
function compileTiming(timing, ctx) {
    // Random Effects (presetID=24) 占位容器内不含 animEffect，OOXML 全部是 1ms 占位；
    // 这里替换为基础效果池中的一个具体 preset（按 spid+entr/exit 哈希挑选，结果稳定）。
    // 必须先于 expandPresetPlaceholders 跑：替换后 cTn.presetID 已是具体效果 ID，
    // 后续如果还经历占位展开也会走对应模板而不是回到 Random Effects。
    for (const root of timing.tnLst)
        (0, random_effects_1.substituteRandomEffects)(root);
    // 阶段 A3 预处理：把仅有 presetID 的占位 preset 容器用 PresetTemplate 子树展开。
    // 对完整 PowerPoint 出品 PPT 无副作用；对编辑器生成的简化 timing 有效。
    for (const root of timing.tnLst)
        (0, preset_expand_1.expandPresetPlaceholders)(root);
    const tnIndex = ctx.tnIndex ?? (0, tn_index_1.buildTnIndex)(timing);
    // §19.5.3 bldLst：构建一次索引供整次编译复用。
    const buildIndex = ctx.buildIndex ?? (0, builds_1.buildBuildIndex)(ctx.builds);
    const innerCtx = { ...ctx, tnIndex, buildIndex };
    const mainSteps = [];
    const shapeSteps = [];
    for (const root of timing.tnLst) {
        (0, emit_1.emit)(root, innerCtx, mainSteps, shapeSteps, 0);
    }
    return { mainSteps, shapeSteps };
}
