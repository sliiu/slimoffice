// compileTiming 主入口：把 OoxmlTiming 树编译为 CompiledTiming。
import { buildBuildIndex } from "./builds.js";
import { emit } from "./emit.js";
import { expandPresetPlaceholders } from "./preset-expand.js";
import { substituteRandomEffects } from "./random-effects.js";
import { buildTnIndex } from "./tn-index.js";
export function compileTiming(timing, ctx) {
    // Random Effects (presetID=24) 占位容器内不含 animEffect，OOXML 全部是 1ms 占位；
    // 这里替换为基础效果池中的一个具体 preset（按 spid+entr/exit 哈希挑选，结果稳定）。
    // 必须先于 expandPresetPlaceholders 跑：替换后 cTn.presetID 已是具体效果 ID，
    // 后续如果还经历占位展开也会走对应模板而不是回到 Random Effects。
    for (const root of timing.tnLst)
        substituteRandomEffects(root);
    // 阶段 A3 预处理：把仅有 presetID 的占位 preset 容器用 PresetTemplate 子树展开。
    // 对完整 PowerPoint 出品 PPT 无副作用；对编辑器生成的简化 timing 有效。
    for (const root of timing.tnLst)
        expandPresetPlaceholders(root);
    const tnIndex = ctx.tnIndex ?? buildTnIndex(timing);
    // §19.5.3 bldLst：构建一次索引供整次编译复用。
    const buildIndex = ctx.buildIndex ?? buildBuildIndex(ctx.builds);
    const innerCtx = { ...ctx, tnIndex, buildIndex };
    const mainSteps = [];
    const shapeSteps = [];
    for (const root of timing.tnLst) {
        emit(root, innerCtx, mainSteps, shapeSteps, 0);
    }
    return { mainSteps, shapeSteps };
}
