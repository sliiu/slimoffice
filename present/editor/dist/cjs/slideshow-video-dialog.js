"use strict";
// 另存为视频的参数对话框：帧率 / 分辨率 / 每页停留 / 是否用排练计时 / 点击间隔 / 速度。
// 对齐 PowerPoint「导出 → 创建视频」的两组选项（质量、是否使用录制的计时），
// 再补上导出视频特有的点击间隔与速度。
Object.defineProperty(exports, "__esModule", { value: true });
exports.sanitizeVideoSettings = sanitizeVideoSettings;
exports.openSlideshowVideoDialog = openSlideshowVideoDialog;
const dialog_1 = require("./dialog");
const i18n_1 = require("./i18n");
const ui_style_1 = require("./ui-style");
const slideshow_video_1 = require("./slideshow-video");
/** Clamp free-form numeric fields into ranges the exporter handles well. */
function sanitizeVideoSettings(raw) {
    const num = (v, fallback, min, max) => {
        const n = typeof v === "number" ? v : Number(v);
        if (!Number.isFinite(n))
            return fallback;
        return Math.min(max, Math.max(min, n));
    };
    const pick = (v, choices, fallback) => {
        const n = typeof v === "number" ? v : Number(v);
        return choices.includes(n) ? n : fallback;
    };
    return {
        fps: pick(raw.fps, slideshow_video_1.VIDEO_FPS_CHOICES, slideshow_video_1.DEFAULT_VIDEO_OPTIONS.fps),
        height: pick(raw.height, slideshow_video_1.VIDEO_HEIGHT_CHOICES, slideshow_video_1.DEFAULT_VIDEO_OPTIONS.height),
        slideHold: num(raw.slideHold, slideshow_video_1.DEFAULT_VIDEO_OPTIONS.slideHold, 0.4, 600),
        useTimings: raw.useTimings ?? slideshow_video_1.DEFAULT_VIDEO_OPTIONS.useTimings,
        clickGap: num(raw.clickGap, slideshow_video_1.DEFAULT_VIDEO_OPTIONS.clickGap, 0, 60),
        speed: pick(raw.speed, slideshow_video_1.VIDEO_SPEED_CHOICES, slideshow_video_1.DEFAULT_VIDEO_OPTIONS.speed),
        format: raw.format === "webm" ? "webm" : "mp4",
    };
}
function inputStyle() {
    return "width:100%;box-sizing:border-box;" + ui_style_1.DIALOG_INPUT_CSS;
}
function field(doc, label, control) {
    const wrap = doc.createElement("div");
    wrap.style.cssText = "margin-bottom:10px";
    const lbl = doc.createElement("label");
    lbl.textContent = label;
    lbl.style.cssText = "display:block;color:var(--muted-foreground);margin-bottom:4px";
    wrap.append(lbl, control);
    return wrap;
}
function select(doc, options, value) {
    const sel = doc.createElement("select");
    sel.style.cssText = inputStyle();
    for (const o of options) {
        const opt = doc.createElement("option");
        opt.value = String(o.value);
        opt.textContent = o.label;
        if (o.value === value)
            opt.selected = true;
        sel.appendChild(opt);
    }
    return sel;
}
function number(doc, value, min, max, stepSize) {
    const i = doc.createElement("input");
    i.type = "number";
    i.min = String(min);
    i.max = String(max);
    i.step = String(stepSize);
    i.value = String(value);
    i.style.cssText = inputStyle();
    return i;
}
function openSlideshowVideoDialog(doc, initial) {
    const init = sanitizeVideoSettings(initial);
    return (0, dialog_1.showDialog)(doc, {
        title: (0, i18n_1.t)("videoExport.title"),
        okLabel: (0, i18n_1.t)("videoExport.ok"),
        width: 400,
        buildBody: (body) => {
            const heightLabel = (h) => {
                if (h === 0) {
                    const ds = initial.deckSize;
                    return ds ? (0, i18n_1.t)("videoExport.heightNative", { w: Math.round(ds.width), h: Math.round(ds.height) }) : (0, i18n_1.t)("videoExport.heightNativePlain");
                }
                return `${h}p`;
            };
            const heightSel = select(doc, slideshow_video_1.VIDEO_HEIGHT_CHOICES.map((h) => ({ value: h, label: heightLabel(h) })), init.height);
            const fpsSel = select(doc, slideshow_video_1.VIDEO_FPS_CHOICES.map((f) => ({ value: f, label: `${f} fps` })), init.fps);
            const speedSel = select(doc, slideshow_video_1.VIDEO_SPEED_CHOICES.map((s) => ({ value: s, label: `${s}×` })), init.speed);
            const formatSel = select(doc, [
                { value: "mp4", label: (0, i18n_1.t)("videoExport.formatMp4") },
                { value: "webm", label: (0, i18n_1.t)("videoExport.formatWebm") },
            ], init.format);
            const holdInput = number(doc, init.slideHold, 0.4, 600, 0.5);
            const gapInput = number(doc, init.clickGap, 0, 60, 0.1);
            const timingWrap = doc.createElement("label");
            timingWrap.style.cssText = "display:inline-flex;align-items:center;gap:6px;color:var(--foreground);cursor:pointer;margin-bottom:10px";
            const timingCb = doc.createElement("input");
            timingCb.type = "checkbox";
            timingCb.className = ui_style_1.CHECK_CLASS;
            timingCb.checked = init.useTimings;
            timingCb.disabled = initial.hasTimings === false;
            const timingText = doc.createElement("span");
            timingText.textContent = initial.hasTimings === false ? (0, i18n_1.t)("videoExport.useTimingsNone") : (0, i18n_1.t)("videoExport.useTimings");
            timingWrap.append(timingCb, timingText);
            const hint = doc.createElement("div");
            hint.textContent = (0, i18n_1.t)("videoExport.hint");
            hint.style.cssText = "color:var(--muted-foreground);font-size:11px;line-height:1.5;margin-top:4px";
            body.append(field(doc, (0, i18n_1.t)("videoExport.height"), heightSel), field(doc, (0, i18n_1.t)("videoExport.fps"), fpsSel), field(doc, (0, i18n_1.t)("videoExport.slideHold"), holdInput), timingWrap, field(doc, (0, i18n_1.t)("videoExport.clickGap"), gapInput), field(doc, (0, i18n_1.t)("videoExport.speed"), speedSel), field(doc, (0, i18n_1.t)("videoExport.format"), formatSel), hint);
            return () => sanitizeVideoSettings({
                fps: Number(fpsSel.value),
                height: Number(heightSel.value),
                slideHold: Number(holdInput.value),
                useTimings: timingCb.checked && initial.hasTimings !== false,
                clickGap: Number(gapInput.value),
                speed: Number(speedSel.value),
                format: formatSel.value === "webm" ? "webm" : "mp4",
            });
        },
    });
}
