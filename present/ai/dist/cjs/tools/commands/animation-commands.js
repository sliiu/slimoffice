"use strict";
// AI 动画相关 EditCommand。
//
// 目的：把"自动应用主流动画 / 清空一页动画 / 加单个动画 / 给全部页应用动画"
// 等高层操作封装成走 CommandStack 的命令，使 AI 改动可整体 undo。
//
// 复用策略：所有命令都通过 deepClone slide.ooxmlTiming 实现 revert（与
// @sliiu/present-editor/animation/commands.ts 同样思路；那里只覆盖单 effect 增删，
// 这里覆盖更高层操作）。
//
// Phase A 升级：ApplyAutoAnimationsCmd 接收 bundleId（minimal/cinematic/
// editorial/playful），同时写入 slide.transition（页间过渡）；revert 时一并复位。
// 没传 bundleId 时由 animations.resolveBundleForPresentation 推断。
Object.defineProperty(exports, "__esModule", { value: true });
exports.AddAnimationCmd = exports.ClearSlideAnimationsCmd = exports.ApplyAutoAnimationsCmd = void 0;
const animations_1 = require("../../animations");
function cloneTiming(timing) {
    if (!timing)
        return undefined;
    return JSON.parse(JSON.stringify(timing));
}
function cloneTransition(t) {
    if (!t)
        return undefined;
    return { ...t, ...(t.params ? { params: { ...t.params } } : {}) };
}
function snapshot(slides) {
    return slides.map((slide) => ({
        slide,
        timing: cloneTiming(slide.ooxmlTiming),
        transition: cloneTransition(slide.transition),
    }));
}
function restore(snaps) {
    for (const snap of snaps) {
        if (snap.timing)
            snap.slide.ooxmlTiming = cloneTiming(snap.timing);
        else
            delete snap.slide.ooxmlTiming;
        if (snap.transition)
            snap.slide.transition = cloneTransition(snap.transition);
        else
            delete snap.slide.transition;
    }
}
/**
 * 给单页（或省略 slideIdx 时全部页）应用主流 auto-animate。
 *
 * 行为：
 *   - 解析 bundleId（显式 > 推断），所有目标 slide 都用同一个 bundle，确保 deck 整体感一致。
 *   - 已有 ooxmlTiming / transition 会被覆盖（先清空再重建），多次执行不叠加。
 *   - revert 时连 timing + transition 一起复位。
 */
class ApplyAutoAnimationsCmd {
    slideIdx;
    opts;
    label = "AI: Apply mainstream animations";
    snapshots;
    constructor(slideIdx, opts = {}) {
        this.slideIdx = slideIdx;
        this.opts = opts;
    }
    apply(pres) {
        const targets = this.collectTargets(pres);
        if (targets.length === 0)
            return;
        this.snapshots = snapshot(targets);
        // bundle 解析放在 cmd 内：单页操作也按整篇主题推断（避免单页特立独行）。
        // 优先级：opts.bundle（AI 合成） > opts.bundleId（内置） > 主题推断。
        let bundle;
        if (this.opts.bundle) {
            bundle = this.opts.bundle;
        }
        else {
            const bundleId = this.opts.bundleId ?? (0, animations_1.resolveBundleForPresentation)(pres);
            bundle = (0, animations_1.getMotionBundle)(bundleId);
        }
        const applyTransitions = this.opts.applySlideTransition !== false;
        // 真实 slide 尺寸参与"这个填充形状是单元底板还是页面级底纹"的判定。
        const slideSize = this.opts.slideSize ?? pres.size;
        const opts = {
            ...this.opts,
            bundle,
            ...(slideSize ? { slideSize } : {}),
        };
        for (const slide of targets) {
            (0, animations_1.clearSlideAnimations)(slide);
            const effects = (0, animations_1.autoAnimateSlide)(slide, opts);
            (0, animations_1.applyAnimationsToSlide)(slide, effects);
            if (applyTransitions)
                (0, animations_1.applyBundleTransitionToSlide)(slide, bundle);
        }
    }
    revert(_pres) {
        if (this.snapshots)
            restore(this.snapshots);
    }
    collectTargets(pres) {
        if (this.slideIdx === undefined)
            return pres.slides.slice();
        const slide = pres.slides[this.slideIdx];
        return slide ? [slide] : [];
    }
}
exports.ApplyAutoAnimationsCmd = ApplyAutoAnimationsCmd;
/**
 * 清空 ooxmlTiming —— 让 player 当作"无动画"播放。同时清掉 slide.transition
 * （否则用户"想要彻底安静"还能看到页间过渡）。
 */
class ClearSlideAnimationsCmd {
    slideIdx;
    label = "AI: Clear slide animations";
    snapshots;
    constructor(slideIdx) {
        this.slideIdx = slideIdx;
    }
    apply(pres) {
        const targets = this.slideIdx === undefined
            ? pres.slides.slice()
            : pres.slides[this.slideIdx]
                ? [pres.slides[this.slideIdx]]
                : [];
        if (targets.length === 0)
            return;
        this.snapshots = snapshot(targets);
        for (const slide of targets) {
            (0, animations_1.clearSlideAnimations)(slide);
            delete slide.transition;
        }
    }
    revert(_pres) {
        if (this.snapshots)
            restore(this.snapshots);
    }
}
exports.ClearSlideAnimationsCmd = ClearSlideAnimationsCmd;
/**
 * 给某 shape 追加一个动画 effect（保留已有 effect）。
 */
class AddAnimationCmd {
    slideIdx;
    shapeId;
    args;
    label = "AI: Add animation";
    snapshot;
    constructor(slideIdx, shapeId, args) {
        this.slideIdx = slideIdx;
        this.shapeId = shapeId;
        this.args = args;
    }
    apply(pres) {
        const slide = pres.slides[this.slideIdx];
        if (!slide)
            return;
        this.snapshot = {
            slide,
            timing: cloneTiming(slide.ooxmlTiming),
            transition: cloneTransition(slide.transition),
        };
        const spec = {
            shapeId: this.shapeId,
            effect: this.args.effect,
        };
        if (this.args.trigger !== undefined)
            spec.trigger = this.args.trigger;
        if (this.args.durationMs !== undefined)
            spec.durationMs = this.args.durationMs;
        if (this.args.delayMs !== undefined)
            spec.delayMs = this.args.delayMs;
        if (this.args.paraRange !== undefined)
            spec.paraRange = this.args.paraRange;
        (0, animations_1.applyAnimationsToSlide)(slide, [spec]);
    }
    revert(_pres) {
        if (this.snapshot)
            restore([this.snapshot]);
    }
}
exports.AddAnimationCmd = AddAnimationCmd;
