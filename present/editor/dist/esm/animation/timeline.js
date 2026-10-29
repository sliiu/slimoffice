// 底部动画时间轴：PowerPoint Animation Pane 风格。
// 功能：
//   - Play / Pause / Reset：通过 @sliiu/present-player buildOoxmlPlayback 在编辑器场景上跑真实运行时；
//   - 顶部 ruler：标尺 + 可拖拽 playhead；
//   - 左列 sequence 编号（PowerPoint 规则：onClick 进 +1，with/after 在同一编号下 a/b/c）；
//   - 每条 effect：颜色按 entr/emph/exit/path/media 区分；拖动条体 = delay，左/右边缘 = duration；
//   - 点击 bar → 选中对应 shape，同时高亮该 effect 行；
//   - 拖动时按 50ms 网格 snap，Shift 取消 snap；
//   - 键盘：Space=Play/Pause、Home=Reset、Delete=删除选中 effect。
import { ooxml } from "@sliiu/present-animation";
import { buildOoxmlPlayback } from "@sliiu/present-player";
import { RemoveAnimEffectCmd, SetAnimEffectPropCmd } from "./commands.js";
import { buildEffectList } from "./store.js";
import { appendLucideIcon, mkLucideIconButton, setButtonLucideIcon } from "../icons.js";
import { t } from "../i18n/index.js";
const ROW_H = 22;
const HEADER_H = 22;
const LABEL_W = 200;
const TIME_SCALE_DEFAULT = 0.08; // px/ms; 100ms = 8px
const SNAP_MS = 50;
const COLOR = {
    entr: "#10b981",
    emph: "#eab308",
    exit: "#ef4444",
    path: "var(--primary)",
    media: "#a855f7",
    custom: "var(--muted-foreground)",
};
// 把 effects 按 PowerPoint 时间轴语义展平成"绝对 start / end"（ms）。
//
// 单一事实源 = 动画编译器的 tnIndex（buildTnIndex）：它按 ECMA-376 §19.5.18 容器
// par/seq + withEffect/afterEffect 同步语义算出每个 cTn 的绝对 (start,end)，与
// runtime/player 实际播放完全一致。这样时间轴里看到的排布 == 真实播放节奏。
//
// 旧实现用 buildEffectList 上的 trigger/delayMs/durationMs 做"prevEnd + delay"
// 启发式，无法表达 PowerPoint 常见的"一个 par 容器里多个子动画各带绝对 delay"
// 结构（如 7.pptx slide2：mainSeq → par → [delay 0/500/1000…] 子动画）。
// 那种结构里每个 effect 的 delay 写在外层 wrapper 上、且 duration 取到的是
// 占位 set(1ms) → 启发式会把所有 bar 堆在 0 且只有 1px 宽，看起来"全部同时进行"。
//
// tnIndex 命中不了时（编辑器生成的简化 timing 可能缺 cTn id）回退到原启发式。
// afterPrevious 再按 UI 时长（max(tnEnd, durationMs)）串一次：preset 模板经常给
// inner par 写 500ms 而叶子是 2000ms，否则第二条会画在 0.5s。
export function computeEffectTimings(effs, slide) {
    const tnIndex = slide?.ooxmlTiming
        ? ooxml.buildTnIndex(slide.ooxmlTiming)
        : undefined;
    const out = [];
    let prevStart = 0;
    let prevEnd = 0;
    for (let i = 0; i < effs.length; i++) {
        const eff = effs[i];
        const entry = eff.path.cTnId ? tnIndex?.get(eff.path.cTnId) : undefined;
        let start;
        let end;
        if (entry) {
            start = entry.start;
            end = Math.max(entry.end, entry.start + Math.max(eff.durationMs, 1));
        }
        else if (i === 0) {
            // 第一个 effect 不论 trigger 都从 delayMs 开始 —— 没有"前一个"参照。
            start = eff.delayMs;
            end = start + eff.durationMs;
        }
        else if (eff.trigger === "withPrevious") {
            start = prevStart + eff.delayMs;
            end = start + eff.durationMs;
        }
        else if (eff.trigger === "afterPrevious") {
            start = prevEnd + eff.delayMs;
            end = start + eff.durationMs;
        }
        else {
            // onClick / onShapeClick / onLoad —— 时间轴上紧跟前序动画 end 之后排列。
            start = prevEnd + eff.delayMs;
            end = start + eff.durationMs;
        }
        if (i > 0 && eff.trigger === "afterPrevious") {
            const chained = prevEnd + eff.delayMs;
            if (start < chained) {
                const span = Math.max(end - start, eff.durationMs, 1);
                start = chained;
                end = start + span;
            }
        }
        out.push({ start, end });
        prevStart = start;
        prevEnd = end;
    }
    return out;
}
export function mountAnimTimeline(parent, opts) {
    const doc = parent.ownerDocument;
    let timeScale = TIME_SCALE_DEFAULT;
    let selectedEffectId = null;
    let playhead = null;
    let playheadGrip = null;
    let playheadMs = 0;
    let rafId = 0;
    let playStartWall = 0;
    let playStartMs = 0;
    let playback = null;
    // 记录 build playback 时所用的 scene 引用：editor.drawSlide 在 stack 变化后重建
    // scene，旧 SceneNode 实例与新 SceneNode 实例并存（但只有新实例挂载到 DOM）。
    // playback.runtime 内部 resolve 闭包缓存的是 build 当时的 scene —— 不重建会让
    // seekStep 写到悬空的旧 SceneNode 上，视觉上看似动画完全没生效（典型场景：
    // 新建 WordArt / 普通形状后给它加 entrance，applyEntranceHideToScene 把新 shape
    // hide 在 scene2 上，但 cached playback 仍跑 scene1 → 新 shape 永远不被 reveal）。
    let playbackScene = null;
    let isPlaying = false;
    // 预览态：入场目标已 hide，runtime 按时间轴绝对时间 seek。暂停应冻结画面，
    // 只有 Reset / 切页 / 改 timing 才退回"全部可见"的编辑态。
    let previewActive = false;
    const el = doc.createElement("div");
    // 由父容器（编辑器底部时间轴栏）控制大小；这里仅声明内部 flex 布局。
    el.style.cssText = [
        "position:absolute",
        "inset:0",
        "background:var(--editor-panel,#191919)",
        "color:var(--foreground)",
        "font:11px ui-sans-serif,system-ui,sans-serif",
        "display:flex",
        "flex-direction:column",
    ].join(";");
    // ── Header（标题 + 播放控件 + 时间显示 + 缩放）
    const head = doc.createElement("div");
    head.style.cssText = "display:flex;align-items:center;gap:8px;padding:4px 10px;border-bottom:1px solid var(--border,#3a3a3a);";
    const title = doc.createElement("span");
    title.textContent = t("anim.timeline.title");
    title.style.cssText = "font-weight:600;color:var(--foreground);";
    head.appendChild(title);
    const playBtn = mkLucideIconButton(doc, "play", "", t("anim.timeline.play"), 14);
    playBtn.style.cssText =
        "background:var(--editor-control,#262626);color:var(--foreground);border:1px solid var(--border);border-radius:6px;padding:4px 6px;cursor:pointer;font-size:11px;line-height:1;min-width:28px;display:inline-flex;align-items:center;justify-content:center";
    playBtn.addEventListener("mouseenter", () => (playBtn.style.background = "var(--border)"));
    playBtn.addEventListener("mouseleave", () => (playBtn.style.background = "var(--editor-control,#262626)"));
    const stopBtn = mkLucideIconButton(doc, "square", "", t("anim.timeline.reset"), 12);
    stopBtn.style.cssText = playBtn.style.cssText;
    stopBtn.addEventListener("mouseenter", () => (stopBtn.style.background = "var(--border)"));
    stopBtn.addEventListener("mouseleave", () => (stopBtn.style.background = "var(--editor-control,#262626)"));
    const timeLabel = doc.createElement("span");
    timeLabel.style.cssText = "color:var(--muted-foreground);font-variant-numeric:tabular-nums;min-width:64px;";
    timeLabel.textContent = "0.00 / 0.00 s";
    head.append(playBtn, stopBtn, timeLabel);
    const spacer = doc.createElement("div");
    spacer.style.cssText = "flex:1;";
    head.appendChild(spacer);
    const zoomGroup = doc.createElement("div");
    zoomGroup.style.cssText = "display:inline-flex;align-items:center;gap:2px;flex-shrink:0;";
    const zoomMinus = mkLucideIconButton(doc, "minus", "", t("anim.timeline.zoomOut"), 14);
    zoomMinus.style.cssText = playBtn.style.cssText;
    zoomMinus.addEventListener("mouseenter", () => (zoomMinus.style.background = "var(--border)"));
    zoomMinus.addEventListener("mouseleave", () => (zoomMinus.style.background = "var(--editor-control,#262626)"));
    const zoomPlus = mkLucideIconButton(doc, "plus", "", t("anim.timeline.zoomIn"), 14);
    zoomPlus.style.cssText = playBtn.style.cssText;
    zoomPlus.addEventListener("mouseenter", () => (zoomPlus.style.background = "var(--border)"));
    zoomPlus.addEventListener("mouseleave", () => (zoomPlus.style.background = "var(--editor-control,#262626)"));
    const zoomLabel = doc.createElement("span");
    zoomLabel.style.cssText =
        "color:var(--muted-foreground);font-variant-numeric:tabular-nums;min-width:36px;text-align:center;line-height:1;";
    zoomLabel.textContent = "1.0x";
    zoomGroup.append(zoomMinus, zoomLabel, zoomPlus);
    head.appendChild(zoomGroup);
    el.appendChild(head);
    // ── Body：外层一个滚动条；内部仍分左右两列，行高用同一套 border-box，避免错位。
    const scroller = doc.createElement("div");
    scroller.className = "ppt-scroll";
    scroller.style.cssText = "flex:1;min-height:0;min-width:0;overflow:auto;overscroll-behavior:contain;";
    el.appendChild(scroller);
    const inner = doc.createElement("div");
    inner.style.cssText = "display:flex;align-items:stretch;min-height:100%;";
    scroller.appendChild(inner);
    const labelCol = doc.createElement("div");
    labelCol.style.cssText = [
        `width:${LABEL_W}px`,
        "flex-shrink:0",
        "position:sticky",
        "left:0",
        "z-index:2",
        "background:var(--editor-header,#181818)",
        "border-right:1px solid var(--border,#3a3a3a)",
        "box-sizing:border-box",
    ].join(";");
    inner.appendChild(labelCol);
    const trackCol = doc.createElement("div");
    trackCol.style.cssText = [
        "flex:1",
        "position:relative",
        "min-width:0",
        "background:repeating-linear-gradient(to right,var(--background,#18181a) 0,var(--background,#18181a) 39px,var(--border,#3a3a3a) 39px,var(--border,#3a3a3a) 40px)",
    ].join(";");
    inner.appendChild(trackCol);
    parent.appendChild(el);
    let effects = [];
    let lastSlideIdx = -1;
    // ── Helpers
    function snap(ms, shift) {
        if (shift)
            return Math.max(0, Math.round(ms));
        return Math.max(0, Math.round(ms / SNAP_MS) * SNAP_MS);
    }
    // refresh() 算出的内容总时长（ms），供 play / seek / playhead 复用，避免每帧重建
    // tnIndex。timing 在播放期间不变，refresh 时更新即可。
    let lastTotalMs = 0;
    function totalDurationMs(_effs) {
        return lastTotalMs;
    }
    // ── 渲染主体
    const refresh = () => {
        exitPreview();
        const currentIdx = opts.currentSlide();
        const slideChanged = lastSlideIdx !== -1 && lastSlideIdx !== currentIdx;
        // 切换 slide 时：tearDown 旧的 playback（其引用的 scene/timing 已失效）、
        // 复位 playhead、清掉跨 slide 残留的选中态，避免 ensurePlayback() 命中旧缓存
        // 或 selectedEffectId 指向不存在的 effect。
        if (slideChanged) {
            tearDownPlayback();
            playheadMs = 0;
            if (selectedEffectId !== null) {
                selectedEffectId = null;
                opts.onSelectEffect?.(null);
            }
        }
        lastSlideIdx = currentIdx;
        const savedScrollTop = slideChanged ? 0 : scroller.scrollTop;
        const savedScrollLeft = slideChanged ? 0 : scroller.scrollLeft;
        while (labelCol.firstChild)
            labelCol.removeChild(labelCol.firstChild);
        while (trackCol.firstChild)
            trackCol.removeChild(trackCol.firstChild);
        playhead = null;
        playheadGrip = null;
        const slide = opts.pres.slides[currentIdx];
        effects = buildEffectList(slide?.ooxmlTiming);
        // 通过 computeEffectTimings 拿到所有 effect 的绝对 start / end（含 withPrevious /
        // afterPrevious / onClick 的差异处理），确保时间轴与播放器口径一致。
        const timings = computeEffectTimings(effects, slide);
        let maxEnd = 0;
        for (const t of timings)
            if (t.end > maxEnd)
                maxEnd = t.end;
        lastTotalMs = maxEnd;
        const rulerTotal = Math.max(maxEnd, 4000);
        const timelinePx = rulerTotal * timeScale + 80;
        const bodyH = HEADER_H + Math.max(effects.length, 1) * ROW_H + 24;
        inner.style.minWidth = `${LABEL_W + timelinePx}px`;
        inner.style.minHeight = `${bodyH}px`;
        trackCol.style.minWidth = `${timelinePx}px`;
        // 左右列同一套 border-box 行高，border 算在 ROW_H / HEADER_H 内，才不会逐行错位。
        const headCell = `box-sizing:border-box;height:${HEADER_H}px;border-bottom:1px solid var(--border,#3a3a3a)`;
        const rowCell = `box-sizing:border-box;height:${ROW_H}px;border-bottom:1px solid var(--border,#3a3a3a)`;
        const labelHead = doc.createElement("div");
        labelHead.style.cssText = `position:sticky;top:0;z-index:3;background:var(--card,#1c1c1c);${headCell}`;
        labelCol.appendChild(labelHead);
        const ruler = doc.createElement("div");
        ruler.style.cssText = `position:sticky;top:0;z-index:2;background:var(--card,#1c1c1c);color:var(--muted-foreground);font-size:10px;cursor:pointer;${headCell}`;
        trackCol.appendChild(ruler);
        ruler.addEventListener("click", (e) => {
            const rect = ruler.getBoundingClientRect();
            const x = e.clientX - rect.left;
            seekTo(Math.max(0, x / timeScale));
        });
        // sequence 编号 —— 与 PowerPoint Animation Pane 一致：
        //   - 顶级 onClick / onShapeClick → 占独立编号 (1, 2, 3, ...)；
        //   - withPrevious / afterPrevious → 紧随当前 click 编号下，复用同一编号（PowerPoint
        //     UI 上对它们不显示纯数字标签，只有同色块表示从属关系）。
        //   - 第一个 effect 即便 trigger 不是 onClick，也按惯例计为编号 1（PowerPoint 实测
        //     首条 withPrevious / afterPrevious 等价于 onLoad，仍占编号位）。
        let clickSeq = 0;
        effects.forEach((eff, idx) => {
            const start = timings[idx].start;
            const isClickLike = eff.trigger === "onClick" ||
                eff.trigger === "onShapeClick" ||
                eff.trigger === "onShapeDblClick" ||
                eff.trigger === "onShapeHover" ||
                eff.trigger === "onShapeMouseOut" ||
                eff.trigger === "onPrev" ||
                eff.trigger === "onNext";
            let seqLabel;
            if (idx === 0 || isClickLike) {
                clickSeq++;
                seqLabel = String(clickSeq);
            }
            else {
                // with / after：不显示独立编号，避免和 onClick 混淆；用空格符占位让列宽稳定。
                seqLabel = "";
            }
            const isSel = eff.id === selectedEffectId;
            const labelRow = doc.createElement("div");
            labelRow.style.cssText = [
                "display:flex",
                "align-items:center",
                "gap:6px",
                "padding:0 8px",
                "overflow:hidden",
                "white-space:nowrap",
                "cursor:pointer",
                rowCell,
                isSel ? "background:var(--accent,#333333)" : "",
            ].filter(Boolean).join(";");
            const seq = doc.createElement("span");
            seq.style.cssText = "color:var(--muted-foreground);width:24px;font-variant-numeric:tabular-nums;flex-shrink:0;";
            seq.textContent = seqLabel;
            const trigDot = doc.createElement("span");
            trigDot.style.cssText = `width:8px;height:8px;border-radius:50%;background:${COLOR[eff.presetClass] ?? "#555"};flex-shrink:0;`;
            trigDot.title = `${classFull(eff.presetClass)} · ${trigLabel(eff.trigger)}`;
            const name = doc.createElement("span");
            name.style.cssText = "overflow:hidden;text-overflow:ellipsis;flex:1;color:var(--foreground);";
            name.textContent = friendlyTargetName(eff, slide);
            const trig = doc.createElement("span");
            trig.style.cssText = "color:var(--muted-foreground);flex-shrink:0;display:inline-flex;align-items:center;";
            appendLucideIcon(doc, trig, trigLucideIcon(eff.trigger), 10);
            labelRow.append(seq, trigDot, name, trig);
            const selectThis = () => {
                if (selectedEffectId === eff.id) {
                    selectedEffectId = null;
                    opts.selectShape?.(undefined);
                    opts.onSelectEffect?.(null);
                }
                else {
                    selectedEffectId = eff.id;
                    opts.selectShape?.(eff.targetShapeId);
                    opts.onSelectEffect?.(eff.id);
                }
                refresh();
            };
            labelRow.addEventListener("click", selectThis);
            labelCol.appendChild(labelRow);
            const trackRow = doc.createElement("div");
            trackRow.style.cssText = [
                "position:relative",
                "cursor:pointer",
                rowCell,
                isSel ? "background:color-mix(in srgb, var(--primary) 8%, transparent)" : "",
            ].filter(Boolean).join(";");
            const bar = doc.createElement("div");
            const x = start * timeScale;
            // bar 宽度用编译器算出的真实时长（end - start），与 tnIndex / 播放一致；
            // 退化为 0 时回落到 effect 自身 durationMs，最少 4px 保证可点击。
            const spanMs = Math.max(timings[idx].end - start, eff.durationMs);
            const w = Math.max(4, spanMs * timeScale);
            bar.style.cssText = [
                "position:absolute",
                `left:${x}px`,
                `top:4px`,
                `height:${ROW_H - 8}px`,
                `width:${w}px`,
                `background:${COLOR[eff.presetClass] ?? "#555"}`,
                "border-radius:3px",
                "cursor:grab",
                "opacity:0.9",
                isSel ? "outline:2px solid var(--ring);outline-offset:1px;" : "",
            ].filter(Boolean).join(";");
            bar.title = `${seqLabel} · ${eff.targetShapeId} · delay ${eff.delayMs}ms · dur ${eff.durationMs}ms`;
            attachBarDrag(bar, eff, start, spanMs, opts, () => refresh());
            bar.addEventListener("click", (e) => {
                e.stopPropagation();
                selectThis();
            });
            trackRow.appendChild(bar);
            trackRow.addEventListener("click", selectThis);
            trackCol.appendChild(trackRow);
        });
        if (effects.length === 0) {
            const empty = doc.createElement("div");
            empty.textContent = t("anim.timeline.empty");
            empty.style.cssText = "padding:12px 16px;color:var(--muted-foreground);";
            trackCol.appendChild(empty);
        }
        // 标尺刻度
        for (let ms = 0; ms <= rulerTotal; ms += 500) {
            const t = doc.createElement("span");
            t.textContent = `${(ms / 1000).toFixed(1)}s`;
            t.style.cssText = `position:absolute;left:${ms * timeScale}px;top:5px;`;
            ruler.appendChild(t);
            const tick = doc.createElement("div");
            tick.style.cssText = `position:absolute;left:${ms * timeScale}px;top:0;width:1px;height:100%;background:${ms % 1000 === 0 ? "var(--border)" : "color-mix(in srgb, var(--border) 55%, transparent)"};`;
            ruler.appendChild(tick);
        }
        // Playhead 只画在右列，时间 0 = 轨道左缘。grip 挂在 sticky 标尺里。
        playhead = doc.createElement("div");
        playhead.style.cssText = `position:absolute;top:${HEADER_H}px;left:${playheadMs * timeScale}px;width:1px;height:calc(100% - ${HEADER_H}px);background:var(--primary);pointer-events:none;z-index:1;`;
        playheadGrip = doc.createElement("div");
        playheadGrip.style.cssText = `position:absolute;top:0;left:${playheadMs * timeScale - 5}px;width:10px;height:10px;background:var(--primary);clip-path:polygon(50% 100%,0 0,100% 0);pointer-events:auto;cursor:ew-resize;z-index:5;`;
        ruler.appendChild(playheadGrip);
        trackCol.appendChild(playhead);
        attachPlayheadDrag(playheadGrip);
        updateTimeLabel(maxEnd);
        // refresh 会重建 DOM，把纵向/横向滚动位置还原回去，避免点选一行就把列表弹回顶部。
        scroller.scrollLeft = savedScrollLeft;
        scroller.scrollTop = savedScrollTop;
    };
    function updatePlayheadPos() {
        if (!playhead)
            return;
        playhead.style.left = playheadMs * timeScale + "px";
        if (playheadGrip)
            playheadGrip.style.left = playheadMs * timeScale - 5 + "px";
    }
    function updateTimeLabel(total) {
        timeLabel.textContent = `${(playheadMs / 1000).toFixed(2)} / ${(total / 1000).toFixed(2)} s`;
    }
    function seekTo(ms) {
        pauseClock();
        previewSeek(ms);
    }
    // CompiledStep.delay 是节点自身的本地 delay（clickEffect 几乎总是 0）。
    // 时间轴 bar 用的是 tnIndex 绝对 start；seek 必须按同一套绝对时间，否则
    // 所有"单击时"动画会在 0s 一起播，playhead 往后走舞台却不再跟随时序。
    function stepAbsStartSec(step, tnIndex) {
        const id = ooxml.getCTn(step.source).id;
        const entry = id && tnIndex ? tnIndex.get(id) : undefined;
        if (entry)
            return entry.start / 1000;
        return step.delay;
    }
    function enterPreview() {
        if (previewActive)
            return;
        previewActive = true;
        opts.setPlaybackMode?.(true);
    }
    function previewSeek(ms) {
        playheadMs = Math.max(0, ms);
        updatePlayheadPos();
        updateTimeLabel(totalDurationMs(effects));
        enterPreview();
        const built = ensurePlayback();
        if (!built)
            return;
        const slide = opts.pres.slides[opts.currentSlide()];
        const tnIndex = slide?.ooxmlTiming ? ooxml.buildTnIndex(slide.ooxmlTiming) : undefined;
        const tSec = playheadMs / 1000;
        for (const step of built.mainSteps) {
            const abs = stepAbsStartSec(step, tnIndex);
            built.runtime.seekStep(step, tSec - abs + step.delay);
        }
    }
    function ensurePlayback() {
        const slide = opts.pres.slides[opts.currentSlide()];
        if (!slide?.ooxmlTiming)
            return null;
        const scene = opts.getScene?.() ?? null;
        if (!scene)
            return null;
        // 防御性 invalidation：drawSlide 重建 scene 后，旧 playback.runtime 的 resolver
        // 闭包还指向旧 scene 的 SceneNode；stack.subscribe 已主动 tearDownPlayback，
        // 这里再做一次"scene 引用比对"，防止其他未走 stack 的重建路径漏 invalidation。
        if (playback && playbackScene !== scene) {
            tearDownPlayback();
        }
        if (playback)
            return playback;
        const built = buildOoxmlPlayback(slide, scene, {
            slideWidth: opts.pres.size.width,
            slideHeight: opts.pres.size.height,
        });
        if (built) {
            playback = built;
            playbackScene = scene;
        }
        return playback;
    }
    function tearDownPlayback() {
        if (playback)
            playback.runtime.destroy();
        playback = null;
        playbackScene = null;
    }
    function play() {
        if (isPlaying)
            return;
        const total = totalDurationMs(effects);
        if (total <= 0)
            return;
        if (playheadMs >= total)
            playheadMs = 0;
        isPlaying = true;
        setButtonLucideIcon(doc, playBtn, "pause", 14);
        playStartWall = performance.now();
        playStartMs = playheadMs;
        previewSeek(playStartMs);
        const tick = () => {
            if (!isPlaying)
                return;
            const wall = performance.now();
            const ms = playStartMs + (wall - playStartWall);
            if (ms >= total) {
                previewSeek(total);
                pauseClock();
                return;
            }
            previewSeek(ms);
            rafId = requestAnimationFrame(tick);
        };
        rafId = requestAnimationFrame(tick);
    }
    function pauseClock() {
        if (!isPlaying)
            return;
        isPlaying = false;
        setButtonLucideIcon(doc, playBtn, "play", 14);
        if (rafId) {
            cancelAnimationFrame(rafId);
            rafId = 0;
        }
    }
    function exitPreview() {
        pauseClock();
        if (!previewActive && !playback)
            return;
        previewActive = false;
        if (playback)
            playback.runtime.reset();
        tearDownPlayback();
        opts.setPlaybackMode?.(false);
    }
    function reset() {
        playheadMs = 0;
        updatePlayheadPos();
        updateTimeLabel(totalDurationMs(effects));
        exitPreview();
    }
    playBtn.addEventListener("click", () => {
        if (isPlaying)
            pauseClock();
        else
            play();
    });
    stopBtn.addEventListener("click", reset);
    zoomPlus.addEventListener("click", () => {
        timeScale = Math.min(0.4, timeScale * 1.5);
        zoomLabel.textContent = (timeScale / TIME_SCALE_DEFAULT).toFixed(1) + "x";
        refresh();
    });
    zoomMinus.addEventListener("click", () => {
        timeScale = Math.max(0.02, timeScale / 1.5);
        zoomLabel.textContent = (timeScale / TIME_SCALE_DEFAULT).toFixed(1) + "x";
        refresh();
    });
    function attachPlayheadDrag(grip) {
        grip.addEventListener("mousedown", (e) => {
            e.preventDefault();
            pauseClock();
            const startX = e.clientX;
            const startMs = playheadMs;
            previewSeek(startMs);
            const onMove = (m) => {
                const dx = m.clientX - startX;
                previewSeek(Math.max(0, startMs + dx / timeScale));
            };
            const onUp = () => {
                document.removeEventListener("mousemove", onMove);
                document.removeEventListener("mouseup", onUp);
            };
            document.addEventListener("mousemove", onMove);
            document.addEventListener("mouseup", onUp);
        });
    }
    // 键盘
    const onKey = (e) => {
        if (!parent.contains(e.target))
            return;
        if (e.target?.tagName === "INPUT" || e.target?.tagName === "SELECT")
            return;
        if (e.key === " " || e.code === "Space") {
            e.preventDefault();
            if (isPlaying)
                pauseClock();
            else
                play();
        }
        else if (e.key === "Home") {
            e.preventDefault();
            reset();
        }
        else if ((e.key === "Delete" || e.key === "Backspace") && selectedEffectId) {
            const eff = effects.find((x) => x.id === selectedEffectId);
            if (!eff)
                return;
            e.preventDefault();
            opts.stack.execute(new RemoveAnimEffectCmd(opts.currentSlide(), eff.path));
            selectedEffectId = null;
            refresh();
        }
    };
    parent.addEventListener("keydown", onKey);
    // 拖拽：bar 整体 = delay；左/右边缘 = duration。Shift 取消 snap。
    //
    // 视觉基准用 bar 的"显示绝对起点 baseStartMs / 显示时长 baseSpanMs"（来自
    // computeEffectTimings → tnIndex），而不是 effect 自身的 delayMs/durationMs。因为绝对
    // 起点常常 = 祖先 wrapper delay + 本节点 delay，二者不相等；若用 delayMs 当视觉
    // 基准，鼠标一按 bar 就会跳到 delayMs 对应的位置。提交时把"显示位移量"换算成对
    // 本节点 delayMs / durationMs 的相对增量（displayedStart 随 cTn.delay 线性变化）。
    function attachBarDrag(bar, eff, baseStartMs, baseSpanMs, optsRef, onDone) {
        bar.addEventListener("mousemove", (e) => {
            const r = bar.getBoundingClientRect();
            if (e.clientX - r.left < 6)
                bar.style.cursor = "ew-resize";
            else if (r.right - e.clientX < 6)
                bar.style.cursor = "ew-resize";
            else
                bar.style.cursor = "grab";
        });
        bar.addEventListener("mousedown", (e) => {
            e.preventDefault();
            e.stopPropagation();
            const r = bar.getBoundingClientRect();
            let mode;
            if (e.clientX - r.left < 6)
                mode = "left";
            else if (r.right - e.clientX < 6)
                mode = "right";
            else
                mode = "move";
            const startX = e.clientX;
            const onMove = (m) => {
                const dx = m.clientX - startX;
                const dMs = dx / timeScale;
                if (mode === "move") {
                    bar.style.left = `${snap(baseStartMs + dMs, m.shiftKey) * timeScale}px`;
                }
                else if (mode === "left") {
                    const newStart = snap(baseStartMs + dMs, m.shiftKey);
                    const newSpan = Math.max(100, baseSpanMs - (newStart - baseStartMs));
                    bar.style.left = `${newStart * timeScale}px`;
                    bar.style.width = `${newSpan * timeScale}px`;
                }
                else {
                    const newSpan = Math.max(100, snap(baseSpanMs + dMs, m.shiftKey));
                    bar.style.width = `${newSpan * timeScale}px`;
                }
            };
            const onUp = (m) => {
                document.removeEventListener("mousemove", onMove);
                document.removeEventListener("mouseup", onUp);
                const dx = m.clientX - startX;
                const dMs = dx / timeScale;
                const slideIdx = optsRef.currentSlide();
                if (mode === "move") {
                    const newStart = snap(baseStartMs + dMs, m.shiftKey);
                    const deltaMs = newStart - baseStartMs;
                    if (deltaMs !== 0) {
                        const newDelay = Math.max(0, eff.delayMs + deltaMs);
                        optsRef.stack.execute(new SetAnimEffectPropCmd(slideIdx, eff.path, { delayMs: newDelay }));
                    }
                }
                else if (mode === "left") {
                    const newStart = snap(baseStartMs + dMs, m.shiftKey);
                    const deltaMs = newStart - baseStartMs;
                    if (deltaMs !== 0) {
                        const newDelay = Math.max(0, eff.delayMs + deltaMs);
                        optsRef.stack.execute(new SetAnimEffectPropCmd(slideIdx, eff.path, { delayMs: newDelay }));
                        const newDur = Math.max(100, eff.durationMs - deltaMs);
                        if (newDur !== eff.durationMs)
                            optsRef.stack.execute(new SetAnimEffectPropCmd(slideIdx, eff.path, { durationMs: newDur }));
                    }
                }
                else {
                    const newSpan = Math.max(100, snap(baseSpanMs + dMs, m.shiftKey));
                    const newDur = Math.max(100, eff.durationMs + (newSpan - baseSpanMs));
                    if (newDur !== eff.durationMs)
                        optsRef.stack.execute(new SetAnimEffectPropCmd(slideIdx, eff.path, { durationMs: newDur }));
                }
                onDone();
            };
            document.addEventListener("mousemove", onMove);
            document.addEventListener("mouseup", onUp);
        });
    }
    refresh();
    // stack 触发的命令几乎一定会让 timing 或 shape 树发生变化 ——
    //   - 修改 timing（add/remove/move/setProperty animation）→ 旧 compiled timing 不含新 effect；
    //   - 修改 shape（add/delete/edit）→ editor.drawSlide 重建 scene，旧 SceneNode 实例从 DOM 移除。
    // 任一情况下旧 playback 都会让 seekStep 跑在悬空对象上，下一次 play 看似动画失效。
    // 在这里 tearDown 让下一次 play 走 ensurePlayback 重新 build。
    const unsub = opts.stack.subscribe(() => {
        tearDownPlayback();
        refresh();
    });
    return {
        el,
        destroy() {
            exitPreview();
            parent.removeEventListener("keydown", onKey);
            unsub();
            el.remove();
        },
        refresh,
        selectEffect(id) {
            if (selectedEffectId === id)
                return;
            selectedEffectId = id;
            refresh();
        },
    };
}
function trigLucideIcon(t) {
    if (t === "onClick" || t === "onShapeClick" || t === "onShapeDblClick")
        return "mouse-pointer-click";
    if (t === "withPrevious")
        return "equal";
    if (t === "afterPrevious")
        return "corner-down-right";
    return "circle";
}
function trigLabel(tr) {
    switch (tr) {
        case "onClick": return t("anim.trigger.onClick");
        case "onShapeClick": return t("anim.trigger.onShapeClick");
        case "onShapeDblClick": return t("anim.trigger.onShapeDblClick");
        case "onShapeHover": return t("anim.trigger.onShapeHover");
        case "onShapeMouseOut": return t("anim.trigger.onShapeMouseOut");
        case "onPrev": return t("anim.trigger.onPrev");
        case "onNext": return t("anim.trigger.onNext");
        case "withPrevious": return t("anim.trigger.withPrevious");
        case "afterPrevious": return t("anim.trigger.afterPrevious");
        default: return t("anim.trigger.onLoad");
    }
}
function classFull(cls) {
    switch (cls) {
        case "entr": return t("anim.class.entr.full");
        case "emph": return t("anim.class.emph.full");
        case "exit": return t("anim.class.exit.full");
        case "path": return t("anim.class.path.full");
        case "media": return t("anim.class.media.full");
        default: return t("anim.class.custom.full");
    }
}
function friendlyTargetName(eff, slide) {
    if (!slide)
        return eff.targetShapeId;
    // 在 layers 中查找该 spid 的人类可读 name。
    for (const layer of slide.layers) {
        const found = findInShapes(layer.shapes, eff.targetShapeId);
        if (found)
            return found;
    }
    return eff.targetShapeId;
}
function findInShapes(shapes, id) {
    for (const s of shapes) {
        if (s.id === id)
            return s.name ?? id;
        const kids = s.children;
        if (kids) {
            const r = findInShapes(kids, id);
            if (r)
                return r;
        }
    }
    return undefined;
}
