"use strict";
// OOXML 动画运行时
// 负责按 CompiledTiming 调度执行；每帧 sample 并 apply 到 Animatable target。
Object.defineProperty(exports, "__esModule", { value: true });
exports.TimingRuntime = void 0;
const interp_1 = require("./interp");
const ticker_1 = require("./ticker");
const color_1 = require("./color");
const timing_prop_1 = require("./compile/timing-prop");
const prop_accumulator_1 = require("./prop-accumulator");
// §19.5.18 step 级 autoRev：单次循环 = dur × 2（前向 + 反向），调度与冻结都必须按它算。
function stepCycleSec(step) {
    return step.duration * (step.autoReverse ? 2 : 1);
}
function stepSpanSec(step) {
    return stepCycleSec(step) * step.iterations;
}
class TimingRuntime {
    steps;
    shapeSteps;
    resolve;
    onMediaCmd;
    onCmd;
    onChange;
    onComplete;
    ticker;
    cursor = 0;
    shapeCursors = new Map();
    active = [];
    elapsed = 0;
    unsub;
    playing = false;
    // §19.5.14 additive 合成器（PropTrack 专用；motion/filter/cmd/media 直接 apply）。
    propAcc = new prop_accumulator_1.PropertyAccumulator();
    // §19.5.7 by-only animClr 的 base 颜色快照，按 (atomId, property) 持久化：
    // atom 首帧抓 target 当前颜色，整个 atom 生命周期内复用，避免每帧基于上一帧已计算
    // 出的中间色二次累加导致颜色失控。atom 退出时由 endFrame 清理。
    colorBase = new Map();
    colorBaseSeen = new Set();
    constructor(opts) {
        this.steps = opts.timing.mainSteps;
        this.shapeSteps = opts.timing.shapeSteps;
        this.resolve = opts.resolve;
        this.onMediaCmd = opts.onMediaCmd;
        this.onCmd = opts.onCmd;
        this.onChange = opts.onChange;
        this.onComplete = opts.onComplete;
        this.ticker = opts.ticker ?? ticker_1.globalTicker;
    }
    // 自动启动 onLoad 步骤
    startAutoSteps() {
        while (this.cursor < this.steps.length) {
            const step = this.steps[this.cursor];
            if (step.trigger !== "onLoad")
                break;
            this.beginStep(step, "main");
            this.cursor++;
        }
        this.start();
    }
    /**
     * 把主序列 cursor 推到 `want`。迟到快进时 freeze 已过的 step；
     * `playLast` 时最后开始的那一步正常播放（直播跟随时不要跳到末态）。
     */
    seekMainCursor(want, playLast) {
        const cap = this.steps.length;
        const target = Math.max(0, Math.min(Math.floor(want) || 0, cap));
        if (this.cursor > target) {
            this.reset();
        }
        if (this.cursor === target) {
            // 直播：主持人点击跳过当前动画时 step 不变，观众必须 freeze 到末态。
            if (!playLast)
                this.freezeActiveToEnd();
            return;
        }
        this.completePendingClickStep();
        this.freezeActiveToEnd();
        while (this.cursor < target) {
            const step = this.steps[this.cursor];
            if (!step)
                break;
            this.beginStep(step, "main");
            this.cursor++;
            const atWant = this.cursor >= target;
            if (!atWant || !playLast)
                this.freezeActiveToEnd();
        }
        if (playLast)
            this.start();
        this.onChange?.();
    }
    click() {
        // PowerPoint 行为：若当前 step（含其 with/after/onLoad 联动子动画）尚未播完，
        // 第一次 click 只把当前动画快进到末态，"吃掉"这次点击；不直接开始下一个 onClick
        // step。要再点一次才推进到下一个"单击时"动画。
        if (this.hasRunningActive()) {
            this.completePendingClickStep();
            this.onChange?.();
            return true;
        }
        this.completePendingClickStep();
        if (this.cursor >= this.steps.length) {
            this.onComplete?.();
            return false;
        }
        const step = this.steps[this.cursor];
        if (step.trigger !== "onClick" && step.trigger !== "onLoad")
            return false;
        this.beginStep(step, "main");
        this.cursor++;
        while (this.cursor < this.steps.length) {
            const next = this.steps[this.cursor];
            if (next.trigger !== "onLoad")
                break;
            this.beginStep(next, "main");
            this.cursor++;
        }
        this.start();
        this.onChange?.();
        return true;
    }
    shapeClick(targetId) {
        return this.playQueuedShape(targetId, "onShapeClick");
    }
    shapeDblClick(targetId) {
        return this.playQueuedShape(targetId, "onShapeDblClick");
    }
    /** 该形状上这一类序列是否还有没播过的步。 */
    hasQueuedShape(targetId, trigger) {
        const { queue, cur } = this.shapeQueue(targetId, trigger);
        return cur < queue.length;
    }
    /** 进入形状时重播该形状上的悬停序列，不占用单击游标。 */
    shapeHover(targetId) {
        return this.replayShape(targetId, "onShapeHover");
    }
    /** 指针离开形状时重播移出序列。 */
    shapeMouseOut(targetId) {
        return this.replayShape(targetId, "onShapeMouseOut");
    }
    /**
     * interactiveSeq 的 onPrev / onNext。不推进主序列游标。
     * 有步骤就从头再播一遍。
     */
    playNav(which) {
        const queue = this.shapeSteps.filter((s) => s.trigger === which);
        if (queue.length === 0)
            return false;
        this.interruptShapeSteps();
        for (const step of queue)
            this.beginStep(step, "shape");
        this.start();
        this.onChange?.();
        return true;
    }
    listShapeSteps() {
        return this.shapeSteps.map((s) => ({
            trigger: s.trigger,
            triggerTargetId: s.triggerTargetId,
        }));
    }
    hasNext() {
        return this.cursor < this.steps.length;
    }
    totalSteps() {
        return this.steps.length;
    }
    currentStep() {
        return this.cursor;
    }
    /** 主序列或形状序列是否仍有未播完的 active step（含 indefinite）。 */
    isPlaying() {
        return this.hasRunningActive();
    }
    destroy() {
        this.stop();
    }
    reset() {
        this.stop();
        this.cursor = 0;
        this.shapeCursors.clear();
        this.active = [];
        this.elapsed = 0;
    }
    // 用于编辑器的时间预览：seek 到全局绝对 ms。
    // 这里只处理一个"被预览的 step"，外部传入。
    seekStep(step, ms) {
        // seek 路径也要走 accumulator，保证 additive 语义一致。
        this.propAcc.beginFrame();
        this.applyStepAt(step, ms);
        this.propAcc.flush(this.resolve);
    }
    /**
     * 调试/视觉对比专用：把所有当前 active step 强制冻结到"该 step 一次完整 iteration 的末态"。
     * 对 indefinite/loop 动画选择 step.duration（首次循环末尾）作为确定性截图位点；
     * 对有限步选择实际总时长。结束后停止 ticker，让后续截图捕捉到稳定帧。
     *
     * NOTE: 不修改 elapsed / active 列表（保留 indefinite，移除 finite），保证后续
     * click/tickActive 的时序语义不变。target 上的 hold 末态由 propAcc.flush() 写入，
     * 因 setProperty 是持久写入，下一帧 propAcc.beginFrame() 不会冲掉它。
     */
    freezeActiveToEnd() {
        if (this.active.length === 0) {
            this.stop();
            return;
        }
        this.propAcc.beginFrame();
        this.colorBaseSeen.clear();
        for (const a of this.active) {
            const totalMs = stepSpanSec(a.step) * 1000;
            const freezeMs = Number.isFinite(totalMs) ? totalMs : stepCycleSec(a.step) * 1000;
            this.applyStepAt(a.step, (a.step.delay * 1000 + freezeMs) / 1000);
        }
        this.propAcc.flush(this.resolve);
        for (const k of [...this.colorBase.keys()]) {
            if (!this.colorBaseSeen.has(k))
                this.colorBase.delete(k);
        }
        this.active = this.active.filter((a) => !Number.isFinite(stepSpanSec(a.step)));
        if (this.active.length === 0)
            this.stop();
    }
    // ---- 内部 ----
    replayShape(targetId, trigger) {
        const queue = this.shapeSteps.filter((s) => s.trigger === trigger && s.triggerTargetId === targetId);
        if (queue.length === 0)
            return false;
        this.interruptShapeSteps();
        for (const step of queue)
            this.beginStep(step, "shape");
        this.start();
        this.onChange?.();
        return true;
    }
    shapeQueue(targetId, trigger) {
        const queue = this.shapeSteps.filter((s) => s.trigger === trigger && s.triggerTargetId === targetId);
        const key = `${trigger}:${targetId}`;
        const cur = this.shapeCursors.get(key) ?? 0;
        return { queue, key, cur };
    }
    playQueuedShape(targetId, trigger) {
        const { queue, key, cur } = this.shapeQueue(targetId, trigger);
        if (cur >= queue.length)
            return false;
        const step = queue[cur];
        this.interruptShapeSteps();
        this.beginStep(step, "shape");
        this.shapeCursors.set(key, cur + 1);
        this.start();
        this.onChange?.();
        return true;
    }
    beginStep(step, source = "main") {
        const span = stepSpanSec(step);
        // 子容器 repeatCount="indefinite" 不把整个 step 取模重播，只让 step 保持采样，
        // 由 atom.repeatPeriod 在自己的窗口里循环。click 仍按 onNext 截断。
        const childLoops = step.atoms.some((a) => !Number.isFinite(a.atom.iterations));
        const dur = childLoops || !Number.isFinite(span) ? Infinity : (step.delay + span) * 1000;
        this.active.push({ step, startMs: this.elapsed, durationMs: dur, source });
        this.emitDiscreteFor(step, this.elapsed);
    }
    /** 点击另一形状时结束其它形状动画（excl 互斥）。主序列 onClick 不受影响。 */
    interruptShapeSteps() {
        const victims = this.active.filter((a) => a.source === "shape");
        if (victims.length === 0)
            return;
        this.propAcc.beginFrame();
        this.colorBaseSeen.clear();
        for (const a of victims) {
            const totalMs = stepSpanSec(a.step) * 1000;
            const freezeMs = Number.isFinite(totalMs) ? totalMs : stepCycleSec(a.step) * 1000;
            this.applyStepAt(a.step, (a.step.delay * 1000 + freezeMs) / 1000);
        }
        this.propAcc.flush(this.resolve);
        this.active = this.active.filter((a) => a.source !== "shape");
    }
    // 是否仍有正在播放、尚未到末态的 active step（finite 未结束 或 indefinite/loop）。
    // 用于判断 click 应"快进结束当前动画"还是"推进到下一个 onClick step"。
    hasRunningActive() {
        for (const a of this.active) {
            if (!Number.isFinite(a.durationMs))
                return true;
            if (a.startMs + a.durationMs > this.elapsed)
                return true;
        }
        return false;
    }
    completePendingClickStep() {
        // §19.5.20 endCondLst evt="onNext"：indefinite 动画在下一次 click 时结束。
        // 这里把 indefinite step 视为"被 onNext 截断"——保留它最近播放的视觉末态，
        // 然后从 active 中移除，避免 elapsed 飙到 Infinity 破坏后续 step 的时间计算。
        let maxFiniteEnd = this.elapsed;
        let hasIndefinite = false;
        for (const a of this.active) {
            if (!Number.isFinite(a.durationMs)) {
                hasIndefinite = true;
                continue;
            }
            const end = a.startMs + a.durationMs;
            if (end > maxFiniteEnd)
                maxFiniteEnd = end;
        }
        if (maxFiniteEnd > this.elapsed) {
            this.elapsed = maxFiniteEnd;
            this.tickActive(0);
        }
        else if (hasIndefinite) {
            // 没有 finite step 推进但有 indefinite step：把它推进当前周期末态以稳定视觉。
            this.tickActive(0);
        }
        // 过滤掉所有已结束的 finite step；indefinite step 也清除（被 onNext 截断）。
        this.active = this.active.filter((a) => Number.isFinite(a.durationMs) && a.startMs + a.durationMs > this.elapsed);
    }
    start() {
        if (this.playing)
            return;
        this.playing = true;
        this.unsub = this.ticker.add((dtMs) => this.tickActive(dtMs));
    }
    stop() {
        this.playing = false;
        if (this.unsub) {
            this.unsub();
            this.unsub = undefined;
        }
    }
    tickActive(dtMs) {
        if (this.active.length === 0 && !this.playing)
            return;
        this.elapsed += dtMs;
        // 每帧重置合成器；PropTrack 通过 propAcc.contribute() 注入，最后统一 flush。
        this.propAcc.beginFrame();
        this.colorBaseSeen.clear();
        const stillActive = [];
        for (const a of this.active) {
            const local = (this.elapsed - a.startMs) / 1000;
            this.applyStepAt(a.step, local);
            if (this.elapsed - a.startMs < a.durationMs)
                stillActive.push(a);
            else
                this.applyStepAt(a.step, (a.durationMs / 1000));
        }
        this.propAcc.flush(this.resolve);
        // 清理本帧未触达的 colorBase 快照（atom 已结束），下次重启再抓 base。
        for (const k of [...this.colorBase.keys()]) {
            if (!this.colorBaseSeen.has(k))
                this.colorBase.delete(k);
        }
        this.active = stillActive;
        if (this.active.length === 0) {
            this.stop();
            if (this.cursor >= this.steps.length)
                this.onComplete?.();
        }
    }
    applyStepAt(step, localSec) {
        const baseT = localSec - step.delay;
        if (baseT < 0)
            return;
        const single = stepCycleSec(step);
        let t = baseT;
        if ((step.iterations > 1 || step.autoReverse) && single > 0) {
            const total = single * step.iterations;
            if (Number.isFinite(total) && t >= total) {
                if (!step.hold)
                    return;
                t = single;
            }
            else {
                t = t % single;
            }
        }
        if (step.autoReverse && t > step.duration) {
            t = single - t;
        }
        for (const inst of step.atoms) {
            const at = t - inst.offset;
            this.applyAtomAt(inst.atom, at);
        }
    }
    applyAtomAt(atom, localSec) {
        if (localSec < 0)
            return;
        const target = this.resolve(atom.targetId);
        const iter = atom.iterations;
        const single = atom.duration * (atom.autoReverse ? 2 : 1);
        const total = single * iter;
        let t = localSec;
        let unwound = false;
        const period = atom.repeatPeriod;
        if (atom.iterations === Infinity && period && period > 0) {
            const local = ((t % period) + period) % period;
            if (local > single)
                return;
            t = local;
        }
        else if (atom.iterations !== Infinity && total > 0 && t >= total) {
            if (atom.hold) {
                t = total;
            }
            else {
                unwound = true;
                t = 0;
            }
        }
        else if (atom.iterations === Infinity && single > 0) {
            t = ((t % single) + single) % single;
        }
        else if (atom.iterations !== 1 && single > 0) {
            // 多次有限循环：把 t 映射到 [0, single)，最后一次完成后由上面 hold 分支处理。
            t = t % single;
        }
        if (atom.autoReverse && t > atom.duration)
            t = single - t;
        if (t < 0)
            return;
        t = (0, timing_prop_1.reversedLocalTime)(t, atom.duration, atom.reverse);
        if (unwound) {
            // 撤销态：prop track 贡献首帧（≈ base value），motion 通过 propAcc 写回 (0,0)
            // 以与同帧其他 prop 走相同合成管线；filter 直接清空。
            for (const track of atom.tracks) {
                if (track.kind === "prop") {
                    this.applyTrack(track, target, 0, atom);
                }
                else if (track.kind === "filter" && target) {
                    target.setProperty(`effect:${track.filter}`, "");
                }
                else if (track.kind === "motion") {
                    const additive = track.additive ?? "base";
                    this.propAcc.contribute(target, atom.targetId, "tx", 0, additive, atom.id);
                    this.propAcc.contribute(target, atom.targetId, "ty", 0, additive, atom.id);
                }
            }
            return;
        }
        for (const track of atom.tracks)
            this.applyTrack(track, target, t, atom);
    }
    applyTrack(track, target, t, atom) {
        if (track.kind === "prop") {
            // §19.5.7 by-only animClr：base 是 runtime 当前色（首次 apply 时抓快照保持），
            // 每帧按 progress 缩放 by 并 applyColorBy 求得目标颜色，绕过 keyframes 插值。
            if (track.colorBy) {
                if (!target)
                    return;
                const u = atom.duration > 0 ? Math.min(1, Math.max(0, t / atom.duration)) : 0;
                const baseHex = this.colorBaseFor(target, atom.id, track.property);
                const scaled = scaleColorBy(track.colorBy.by, u);
                const computed = (0, color_1.applyColorBy)(baseHex, scaled, track.colorBy.clrSpc, track.colorBy.dir) ?? baseHex;
                const additive = track.additive ?? "base";
                this.propAcc.contribute(target, atom.targetId, track.property, computed, additive, atom.id);
                return;
            }
            const v = (0, interp_1.sampleKeyframes)(track.keys, t, track.valueKind, track.calcMode === "discrete" ? "discrete" : "lin");
            if (v === undefined)
                return;
            // §19.5.14 additive 合成：写入 PropertyAccumulator，帧末统一 flush 到 target。
            // additive 缺省视为 "base"。atom.id 维度让 sum/mult 的 baseSnapshot 跨帧保持。
            const additive = track.additive ?? "base";
            this.propAcc.contribute(target, atom.targetId, track.property, v, additive, atom.id);
            return;
        }
        if (track.kind === "motion") {
            if (!target)
                return;
            this.applyMotion(track, target, t, atom);
            return;
        }
        if (track.kind === "filter") {
            if (!target)
                return;
            const linear = atom.duration > 0 ? Math.min(1, Math.max(0, t / atom.duration)) : 1;
            const u = track.easing ? track.easing(linear) : linear;
            const val = track.transition === "out" ? 1 - u : u;
            const enc = `${track.prLst ?? ""}|${val}|${track.transition}`;
            target.setProperty(`effect:${track.filter}`, enc);
            return;
        }
        if (track.kind === "cmd") {
            if (t > 0)
                return;
            this.onCmd?.({
                targetId: atom.targetId,
                type: track.cmdType,
                cmd: track.cmd,
                soundSrc: track.soundSrc,
            });
            return;
        }
        if (track.kind === "media") {
            if (t > 0)
                return;
            this.onMediaCmd?.({
                targetId: atom.targetId,
                mediaKind: track.mediaKind,
                action: track.action,
                vol: track.vol,
                mute: track.mute,
                fullScreen: track.fullScreen,
                soundSrc: track.soundSrc,
            });
        }
    }
    colorBaseFor(target, atomId, property) {
        const k = `${atomId}::${property}`;
        this.colorBaseSeen.add(k);
        const cached = this.colorBase.get(k);
        if (cached)
            return cached;
        const cur = target.getProperty(property);
        const hex = typeof cur === "string" && cur ? cur : "#000000";
        this.colorBase.set(k, hex);
        return hex;
    }
    applyMotion(track, target, t, atom) {
        if (track.points.length < 2)
            return;
        const dur = atom.duration;
        const raw = dur > 0 ? Math.min(1, Math.max(0, t / dur)) : 0;
        // §19.5.9 + §19.5.18: 把 leaf 的 accel/decel/tmFilter（在 compile 时合到 easing）
        // 应用到 motion 进度推进，让"路径上的位置"与其他 prop track 共用同一时间曲线。
        const u = track.easing ? Math.min(1, Math.max(0, track.easing(raw))) : raw;
        const idx = u * (track.points.length - 1);
        const i0 = Math.floor(idx);
        const i1 = Math.min(track.points.length - 1, i0 + 1);
        const f = idx - i0;
        const p0 = track.points[i0];
        const p1 = track.points[i1];
        // §19.5.9 animMotion@path：path 坐标是 parent/layout 坐标系下相对原始位置的 offset，
        // 直接作为 tx/ty 写入；不减去首点（首点本身就是 t=0 时的 offset 值）。
        const x = p0.x + (p1.x - p0.x) * f;
        const y = p0.y + (p1.y - p0.y) * f;
        // §19.5.14 motion 也走 PropertyAccumulator，让 motion 自身或与 ppt_x/ppt_y prop
        // 的 sum 合成在帧末 flush 时生效；default "base" 保持历史覆盖语义。
        const additive = track.additive ?? "base";
        this.propAcc.contribute(target, atom.targetId, "tx", x, additive, atom.id);
        this.propAcc.contribute(target, atom.targetId, "ty", y, additive, atom.id);
        if (track.rotateToPath) {
            // §19.5.9 ptsTypes: corner 点切换段时切线不平均，保持段尾方向避免角点旋转跳变。
            const ang = p0.cornerAhead ? p0.angle : p0.angle + (p1.angle - p0.angle) * f;
            this.propAcc.contribute(target, atom.targetId, "rotation", (ang * 180) / Math.PI, additive, atom.id);
        }
    }
    // 进入 step 立即触发离散 cmd / set 等。
    emitDiscreteFor(step, _now) {
        void _now;
        for (const inst of step.atoms) {
            for (const t of inst.atom.tracks) {
                if (t.kind === "cmd") {
                    this.onCmd?.({
                        targetId: inst.atom.targetId,
                        type: t.cmdType,
                        cmd: t.cmd,
                        soundSrc: t.soundSrc,
                    });
                }
                else if (t.kind === "media") {
                    this.onMediaCmd?.({
                        targetId: inst.atom.targetId,
                        mediaKind: t.mediaKind,
                        action: t.action,
                        vol: t.vol,
                        mute: t.mute,
                        fullScreen: t.fullScreen,
                        soundSrc: t.soundSrc,
                    });
                }
            }
        }
    }
}
exports.TimingRuntime = TimingRuntime;
// 把 ColorBy 增量按 fraction 缩放，复用 applyColorBy 实现"渐进式"颜色 by 动画。
function scaleColorBy(by, fraction) {
    const out = {};
    if (by.rgb) {
        out.rgb = {
            r: by.rgb.r * fraction,
            g: by.rgb.g * fraction,
            b: by.rgb.b * fraction,
        };
    }
    if (by.hsl) {
        out.hsl = {
            h: by.hsl.h * fraction,
            s: by.hsl.s * fraction,
            l: by.hsl.l * fraction,
        };
    }
    return out;
}
