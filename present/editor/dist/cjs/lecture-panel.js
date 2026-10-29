"use strict";
// 底部面板里的出镜：哪些页有画面、静音预览、拖已有的讲解点击、改整场角落和大小。
Object.defineProperty(exports, "__esModule", { value: true });
exports.mountLecturePanel = mountLecturePanel;
const core_1 = require("@sliiu/present-core");
const commands_1 = require("./commands");
const lecture_cmd_1 = require("./lecture-cmd");
const i18n_1 = require("./i18n");
const CORNERS = ["br", "bl", "tr", "tl"];
const SIZES = ["s", "m", "l"];
const CORNER_GLYPH = { br: "↘", bl: "↙", tr: "↗", tl: "↖" };
function narrationOn(slide) {
    if (!slide)
        return undefined;
    for (const layer of slide.layers) {
        for (const shape of layer.shapes) {
            if (shape.kind === "audio" && shape.isNarration)
                return shape;
        }
    }
    return undefined;
}
function mountLecturePanel(host, deps) {
    const doc = host.ownerDocument;
    host.replaceChildren();
    host.style.flexDirection = "row";
    host.style.minHeight = "0";
    const list = doc.createElement("div");
    list.style.cssText = "flex:0 0 168px;overflow:auto;border-right:1px solid var(--border,#3a3a3a);padding:6px";
    const main = doc.createElement("div");
    main.style.cssText = "flex:1 1 0;min-width:0;display:flex;flex-direction:column;gap:6px;padding:8px;overflow:auto";
    host.append(list, main);
    const previewRow = doc.createElement("div");
    previewRow.style.cssText = "display:flex;gap:8px;min-height:0;flex:1 1 0";
    const video = doc.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.style.cssText = "width:160px;aspect-ratio:4/3;object-fit:cover;background:#111;border-radius:8px;display:none";
    const placeholder = doc.createElement("div");
    placeholder.style.cssText =
        "width:160px;aspect-ratio:4/3;display:flex;align-items:center;justify-content:center;color:var(--muted-foreground);font:11px system-ui,sans-serif;text-align:center;padding:8px";
    const side = doc.createElement("div");
    side.style.cssText = "flex:1 1 0;min-width:0;display:flex;flex-direction:column;gap:6px;justify-content:center";
    const audio = doc.createElement("audio");
    audio.preload = "auto";
    audio.style.display = "none";
    previewRow.append(video, placeholder, side, audio);
    const transport = doc.createElement("div");
    transport.style.cssText = "display:flex;align-items:center;gap:8px;flex:0 0 auto";
    const play = doc.createElement("button");
    play.type = "button";
    play.style.cssText = [
        "border:1px solid var(--border,#3a3a3a)",
        "background:transparent",
        "color:var(--foreground)",
        "border-radius:6px",
        "padding:2px 8px",
        "cursor:pointer",
        "font:11px system-ui,sans-serif",
    ].join(";");
    const timeLabel = doc.createElement("span");
    timeLabel.style.cssText = "font:12px ui-monospace,monospace;color:var(--foreground)";
    transport.append(play, timeLabel);
    const barWrap = doc.createElement("div");
    barWrap.style.cssText = "position:relative;height:28px;flex:0 0 auto;cursor:ew-resize;touch-action:none";
    const bar = doc.createElement("div");
    bar.style.cssText = "position:absolute;left:0;right:0;top:12px;height:4px;border-radius:999px;background:var(--border,#3a3a3a);pointer-events:none";
    const playhead = doc.createElement("div");
    playhead.style.cssText = "position:absolute;top:4px;width:2px;height:20px;background:var(--foreground);pointer-events:none";
    barWrap.append(bar, playhead);
    const edits = doc.createElement("div");
    edits.style.cssText = "display:flex;flex-wrap:wrap;gap:8px;align-items:center;flex:0 0 auto";
    const actions = doc.createElement("div");
    actions.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;align-items:center";
    main.append(previewRow, transport, barWrap, edits, actions);
    let blobUrl = null;
    let shownRef = null;
    let shownNarration = "";
    let loadGen = 0;
    let dragging = false;
    let scrubbing = false;
    let playing = false;
    let playAnchor = 0;
    let raf = 0;
    let positionMs = 0;
    let clockSlideId = "";
    const revoke = () => {
        if (blobUrl)
            URL.revokeObjectURL(blobUrl);
        blobUrl = null;
    };
    const btnStyle = (on) => [
        "border:1px solid var(--border,#3a3a3a)",
        "background:" + (on ? "var(--accent)" : "transparent"),
        "color:var(--foreground)",
        "border-radius:6px",
        "padding:2px 8px",
        "cursor:pointer",
        "font:11px system-ui,sans-serif",
    ].join(";");
    const formatMs = (ms) => {
        const sec = Math.max(0, ms) / 1000;
        const m = Math.floor(sec / 60);
        const rest = (sec - m * 60).toFixed(1).padStart(4, "0");
        return `${m}:${rest}`;
    };
    const setPlayhead = (ms, duration) => {
        const ratio = duration > 0 ? Math.min(1, Math.max(0, ms / duration)) : 0;
        playhead.style.left = `${ratio * 100}%`;
    };
    const pageDurationMs = () => {
        const pres = deps.getPres();
        const slide = pres.slides[deps.getSlideIndex()];
        return slide ? ((0, core_1.lectureTakeFor)(pres.lecture, slide.id)?.durationMs ?? 0) : 0;
    };
    const paintClock = () => {
        const duration = pageDurationMs();
        const current = Math.min(Math.max(0, positionMs), duration > 0 ? duration : positionMs);
        timeLabel.textContent = (0, i18n_1.t)("lecture.panel.progress", {
            current: formatMs(current),
            total: formatMs(duration),
        });
        play.textContent = playing ? (0, i18n_1.t)("lecture.panel.pause") : (0, i18n_1.t)("lecture.panel.play");
        play.disabled = duration <= 0;
    };
    const stopClock = () => {
        playing = false;
        if (raf)
            cancelAnimationFrame(raf);
        raf = 0;
        video.pause();
        audio.pause();
        paintClock();
    };
    const kick = (el) => {
        const syncTime = () => {
            if (!playing)
                return;
            try {
                el.currentTime = positionMs / 1000;
            }
            catch {
                /* ignore */
            }
        };
        void el.play().catch(() => undefined);
        if (el.readyState >= 1)
            syncTime();
        else
            el.addEventListener("loadedmetadata", syncTime, { once: true });
    };
    const tick = () => {
        if (!playing)
            return;
        if (scrubbing) {
            raf = requestAnimationFrame(tick);
            return;
        }
        const duration = pageDurationMs();
        const media = video.src && !video.paused ? video : audio.src && !audio.paused ? audio : null;
        const mediaMs = media && Number.isFinite(media.currentTime) ? media.currentTime * 1000 : null;
        positionMs = mediaMs != null && mediaMs > 0 ? mediaMs : performance.now() - playAnchor;
        if (duration > 0 && positionMs >= duration) {
            positionMs = duration;
            setPlayhead(positionMs, duration);
            stopClock();
            return;
        }
        setPlayhead(positionMs, duration);
        paintClock();
        raf = requestAnimationFrame(tick);
    };
    const startClock = () => {
        const duration = pageDurationMs();
        if (duration <= 0)
            return;
        if (positionMs >= duration - 1)
            positionMs = 0;
        playing = true;
        playAnchor = performance.now() - positionMs;
        if (video.src)
            kick(video);
        if (audio.src)
            kick(audio);
        if (raf)
            cancelAnimationFrame(raf);
        raf = requestAnimationFrame(tick);
        paintClock();
    };
    const seek = (ms) => {
        const duration = pageDurationMs();
        positionMs = duration > 0 ? Math.min(Math.max(0, ms), Math.max(0, duration - 1)) : 0;
        if (playing)
            playAnchor = performance.now() - positionMs;
        const sec = positionMs / 1000;
        if (video.src) {
            try {
                video.currentTime = sec;
            }
            catch {
                /* ignore */
            }
        }
        if (audio.src) {
            try {
                audio.currentTime = sec;
            }
            catch {
                /* ignore */
            }
        }
        setPlayhead(positionMs, duration);
        paintClock();
    };
    const field = (label, value, max, onCommit) => {
        const wrap = doc.createElement("label");
        wrap.style.cssText = "display:inline-flex;align-items:center;gap:4px;font:11px system-ui,sans-serif;color:var(--muted-foreground)";
        wrap.append(doc.createTextNode(label));
        const input = doc.createElement("input");
        input.type = "number";
        input.step = "0.1";
        input.min = "0";
        input.max = String(Math.max(0, max));
        input.value = (Math.round(value * 10) / 10).toFixed(1);
        input.style.cssText = "width:64px;font:11px ui-monospace,monospace;background:transparent;color:var(--foreground);border:1px solid var(--border);border-radius:4px;padding:2px 4px";
        const commit = () => {
            const next = Number(input.value);
            if (!Number.isFinite(next))
                return;
            onCommit(Math.min(Math.max(0, next), Math.max(0, max)));
        };
        input.addEventListener("change", commit);
        wrap.append(input);
        return wrap;
    };
    const refresh = () => {
        if (dragging)
            return;
        const pres = deps.getPres();
        const index = deps.getSlideIndex();
        const slide = pres.slides[index];
        const lecture = pres.lecture;
        const take = slide ? (0, core_1.lectureTakeFor)(lecture, slide.id) : undefined;
        if ((slide?.id ?? "") !== clockSlideId) {
            clockSlideId = slide?.id ?? "";
            positionMs = 0;
            stopClock();
        }
        list.replaceChildren();
        const recorded = pres.slides.flatMap((s, i) => ((0, core_1.lectureTakeFor)(lecture, s.id) ? [{ slide: s, i }] : []));
        if (recorded.length === 0) {
            const empty = doc.createElement("p");
            empty.style.cssText = "margin:0;color:var(--muted-foreground);font:11px system-ui,sans-serif;line-height:1.4";
            empty.textContent = (0, i18n_1.t)("lecture.panel.empty");
            list.append(empty);
        }
        for (const row of recorded) {
            const b = doc.createElement("button");
            b.type = "button";
            const current = row.i === index;
            b.style.cssText = [
                "display:block",
                "width:100%",
                "text-align:left",
                "margin:0 0 4px",
                "padding:4px 6px",
                "border-radius:6px",
                "cursor:pointer",
                "font:11px system-ui,sans-serif",
                "color:var(--foreground)",
                current ? "background:var(--accent)" : "background:transparent",
                "border:none",
            ].join(";");
            const name = row.slide.name ? ` · ${row.slide.name}` : "";
            const cam = (0, core_1.lectureTakeFor)(lecture, row.slide.id)?.cameraRef
                ? (0, i18n_1.t)("lecture.panel.camera")
                : (0, i18n_1.t)("lecture.panel.narrationOnly");
            b.textContent = `${(0, i18n_1.t)("lecture.panel.slide", { n: row.i + 1 })}${name}\n${cam}`;
            b.style.whiteSpace = "pre-line";
            b.addEventListener("click", () => {
                if (row.i !== deps.getSlideIndex())
                    deps.goto(row.i);
            });
            list.append(b);
        }
        const ref = take?.cameraRef ?? null;
        if (ref !== shownRef) {
            shownRef = ref;
            loadGen += 1;
            const gen = loadGen;
            revoke();
            video.removeAttribute("src");
            video.style.display = "none";
            if (ref && deps.cameraSrc) {
                void deps.cameraSrc(ref).then((src) => {
                    if (gen !== loadGen || shownRef !== ref) {
                        if (src?.startsWith("blob:"))
                            URL.revokeObjectURL(src);
                        return;
                    }
                    if (!src)
                        return;
                    if (src.startsWith("blob:"))
                        blobUrl = src;
                    video.src = src;
                    video.style.display = "";
                    paintClock();
                    if (playing)
                        kick(video);
                });
            }
        }
        placeholder.textContent = take?.cameraRef ? "" : (0, i18n_1.t)("lecture.panel.noCamera");
        placeholder.style.display = take?.cameraRef ? "none" : "flex";
        const narration = narrationOn(slide);
        const narrationSrc = narration?.src ?? "";
        if (narrationSrc !== shownNarration) {
            shownNarration = narrationSrc;
            if (!narrationSrc)
                audio.removeAttribute("src");
            else
                audio.src = narrationSrc;
            audio.volume = narration?.volume ?? 1;
            if (playing && audio.src)
                kick(audio);
        }
        barWrap.replaceChildren(bar, playhead);
        const duration = take?.durationMs ?? 0;
        setPlayhead(positionMs, duration);
        take?.clicksMs.forEach((ms, clickIndex) => {
            const mark = doc.createElement("button");
            mark.type = "button";
            mark.title = formatMs(ms);
            mark.textContent = String(clickIndex + 1);
            mark.style.cssText = [
                "position:absolute",
                "top:4px",
                "width:18px",
                "height:18px",
                "margin-left:-9px",
                "border-radius:999px",
                "border:1px solid var(--border)",
                "background:var(--card,#1c1c1c)",
                "color:var(--foreground)",
                "font:10px system-ui,sans-serif",
                "cursor:ew-resize",
                "padding:0",
                `left:${duration > 0 ? (ms / duration) * 100 : 0}%`,
            ].join(";");
            mark.addEventListener("pointerdown", (e) => {
                if (e.button !== 0 || !take)
                    return;
                dragging = true;
                mark.setPointerCapture(e.pointerId);
                e.preventDefault();
                e.stopPropagation();
                const move = (ev) => {
                    const rect = bar.getBoundingClientRect();
                    const ratio = rect.width > 0 ? (ev.clientX - rect.left) / rect.width : 0;
                    const next = Math.min(Math.max(0, duration - 1), Math.max(0, ratio * duration));
                    mark.style.left = `${duration > 0 ? (next / duration) * 100 : 0}%`;
                    mark.title = formatMs(next);
                    positionMs = next;
                    if (video.src) {
                        try {
                            video.currentTime = next / 1000;
                        }
                        catch {
                            /* ignore */
                        }
                    }
                    if (audio.src) {
                        try {
                            audio.currentTime = next / 1000;
                        }
                        catch {
                            /* ignore */
                        }
                    }
                    setPlayhead(next, duration);
                    paintClock();
                };
                const up = (ev) => {
                    mark.removeEventListener("pointermove", move);
                    mark.removeEventListener("pointerup", up);
                    mark.removeEventListener("pointercancel", up);
                    dragging = false;
                    const rect = bar.getBoundingClientRect();
                    const ratio = rect.width > 0 ? (ev.clientX - rect.left) / rect.width : 0;
                    const next = Math.min(Math.max(0, duration - 1), Math.max(0, ratio * duration));
                    if (Math.round(next) !== Math.round(ms)) {
                        deps.execute(new lecture_cmd_1.SetLectureClicksCmd(take.slideId, clickIndex, next));
                    }
                    else
                        refresh();
                };
                mark.addEventListener("pointermove", move);
                mark.addEventListener("pointerup", up);
                mark.addEventListener("pointercancel", up);
            });
            barWrap.append(mark);
        });
        side.replaceChildren();
        const clickLabel = doc.createElement("div");
        clickLabel.style.cssText = "font:11px system-ui,sans-serif;color:var(--muted-foreground)";
        clickLabel.textContent = (0, i18n_1.t)("lecture.panel.clicks");
        side.append(clickLabel);
        edits.replaceChildren();
        const durSec = duration / 1000;
        take?.clicksMs.forEach((ms, clickIndex) => {
            edits.append(field((0, i18n_1.t)("lecture.panel.clickAt", { n: clickIndex + 1 }), ms / 1000, Math.max(0, durSec - 0.001), (sec) => {
                deps.execute(new lecture_cmd_1.SetLectureClicksCmd(take.slideId, clickIndex, sec * 1000));
            }));
        });
        if (narration && slide) {
            const span = Math.max(durSec, narration.duration ?? 0);
            const start = narration.trim?.start ?? 0;
            const end = narration.trim?.end ?? span;
            const writeTrim = (nextStart, nextEnd) => {
                const lo = Math.min(nextStart, nextEnd);
                const hi = Math.max(nextStart, nextEnd);
                deps.execute(new commands_1.SetMediaPropsCmd(deps.getSlideIndex(), narration.id, {
                    trim: { start: lo, end: Math.min(span, hi) },
                }));
            };
            edits.append(field((0, i18n_1.t)("lecture.panel.narration") + " " + (0, i18n_1.t)("lecture.panel.inPoint"), start, span, (sec) => {
                writeTrim(sec, end);
            }), field((0, i18n_1.t)("lecture.panel.outPoint"), end, span, (sec) => {
                writeTrim(start, sec);
            }));
        }
        paintClock();
        setPlayhead(positionMs, duration);
        actions.replaceChildren();
        if (deps.recordSlide && slide) {
            const rec = doc.createElement("button");
            rec.type = "button";
            rec.textContent = take ? (0, i18n_1.t)("lecture.panel.rerecord") : (0, i18n_1.t)("lecture.panel.record");
            rec.style.cssText = btnStyle(false);
            rec.addEventListener("click", () => deps.recordSlide?.(deps.getSlideIndex()));
            actions.append(rec);
        }
        if (take?.cameraRef && slide) {
            const clear = doc.createElement("button");
            clear.type = "button";
            clear.textContent = (0, i18n_1.t)("lecture.panel.clearCamera");
            clear.style.cssText = btnStyle(false);
            clear.addEventListener("click", () => deps.execute(new lecture_cmd_1.ClearLectureCameraCmd(slide.id)));
            actions.append(clear);
        }
        const cornerLabel = doc.createElement("span");
        cornerLabel.style.cssText = "font:11px system-ui,sans-serif;color:var(--muted-foreground)";
        cornerLabel.textContent = (0, i18n_1.t)("lecture.panel.corner");
        actions.append(cornerLabel);
        for (const corner of CORNERS) {
            const b = doc.createElement("button");
            b.type = "button";
            b.textContent = CORNER_GLYPH[corner];
            b.title = (0, i18n_1.t)(`recordOverlay.corner.${corner}`);
            b.disabled = !lecture;
            b.style.cssText = btnStyle(lecture?.frame?.corner === corner || (!lecture?.frame && corner === "br"));
            b.addEventListener("click", () => {
                if (!lecture)
                    return;
                const size = lecture.frame?.size ?? "m";
                deps.execute(new lecture_cmd_1.SetLectureFrameCmd({ corner, size }));
            });
            actions.append(b);
        }
        const sizeLabel = doc.createElement("span");
        sizeLabel.style.cssText = "font:11px system-ui,sans-serif;color:var(--muted-foreground)";
        sizeLabel.textContent = (0, i18n_1.t)("lecture.panel.size");
        actions.append(sizeLabel);
        for (const size of SIZES) {
            const b = doc.createElement("button");
            b.type = "button";
            b.textContent = size.toUpperCase();
            b.title = (0, i18n_1.t)(size === "s" ? "recordOverlay.sizeSmall" : size === "l" ? "recordOverlay.sizeLarge" : "recordOverlay.sizeMedium");
            b.disabled = !lecture;
            b.style.cssText = btnStyle(lecture?.frame?.size === size || (!lecture?.frame && size === "m"));
            b.addEventListener("click", () => {
                if (!lecture)
                    return;
                const corner = lecture.frame?.corner ?? "br";
                deps.execute(new lecture_cmd_1.SetLectureFrameCmd({ corner, size }));
            });
            actions.append(b);
        }
    };
    const onMediaTime = (from) => {
        if (dragging)
            return;
        const leader = video.src && !video.paused ? video : audio.src ? audio : video.src ? video : null;
        if (!leader || from !== leader)
            return;
        positionMs = from.currentTime * 1000;
        setPlayhead(positionMs, pageDurationMs());
        paintClock();
    };
    video.addEventListener("timeupdate", () => onMediaTime(video));
    audio.addEventListener("timeupdate", () => onMediaTime(audio));
    video.addEventListener("play", paintClock);
    video.addEventListener("pause", paintClock);
    audio.addEventListener("play", paintClock);
    audio.addEventListener("pause", paintClock);
    play.addEventListener("click", () => {
        if (pageDurationMs() <= 0)
            return;
        if (playing)
            stopClock();
        else
            startClock();
    });
    const seekFromPointer = (e) => {
        const duration = pageDurationMs();
        if (duration <= 0)
            return;
        const rect = barWrap.getBoundingClientRect();
        const ratio = rect.width > 0 ? (e.clientX - rect.left) / rect.width : 0;
        seek(Math.min(1, Math.max(0, ratio)) * duration);
    };
    barWrap.addEventListener("pointerdown", (e) => {
        if (e.button !== 0)
            return;
        const target = e.target;
        if (target instanceof HTMLElement && target !== barWrap && target !== bar && target !== playhead)
            return;
        if (pageDurationMs() <= 0)
            return;
        scrubbing = true;
        dragging = true;
        barWrap.setPointerCapture(e.pointerId);
        seekFromPointer(e);
    });
    barWrap.addEventListener("pointermove", (e) => {
        if (!scrubbing)
            return;
        seekFromPointer(e);
    });
    const endScrub = (e) => {
        if (!scrubbing)
            return;
        seekFromPointer(e);
        scrubbing = false;
        dragging = false;
        if (barWrap.hasPointerCapture(e.pointerId))
            barWrap.releasePointerCapture(e.pointerId);
    };
    barWrap.addEventListener("pointerup", endScrub);
    barWrap.addEventListener("pointercancel", endScrub);
    refresh();
    return {
        refresh,
        setActive(on) {
            if (!on)
                stopClock();
        },
        destroy() {
            stopClock();
            revoke();
            host.replaceChildren();
        },
    };
}
