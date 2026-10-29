// 另存为视频的参数对话框：帧率 / 分辨率 / 每页停留 / 是否用排练计时 / 点击间隔 / 速度。
// 对齐 PowerPoint「导出 → 创建视频」的两组选项（质量、是否使用录制的计时），
// 再补上导出视频特有的点击间隔与速度。
import { showDialog } from "./dialog.js";
import { t } from "./i18n/index.js";
import { CHECK_CLASS, DIALOG_INPUT_CSS } from "./ui-style.js";
import { DEFAULT_VIDEO_OPTIONS, VIDEO_FPS_CHOICES, VIDEO_HEIGHT_CHOICES, VIDEO_SPEED_CHOICES, } from "./slideshow-video.js";
/** Clamp free-form numeric fields into ranges the exporter handles well. */
export function sanitizeVideoSettings(raw) {
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
        fps: pick(raw.fps, VIDEO_FPS_CHOICES, DEFAULT_VIDEO_OPTIONS.fps),
        height: pick(raw.height, VIDEO_HEIGHT_CHOICES, DEFAULT_VIDEO_OPTIONS.height),
        slideHold: num(raw.slideHold, DEFAULT_VIDEO_OPTIONS.slideHold, 0.4, 600),
        useTimings: raw.useTimings ?? DEFAULT_VIDEO_OPTIONS.useTimings,
        clickGap: num(raw.clickGap, DEFAULT_VIDEO_OPTIONS.clickGap, 0, 60),
        speed: pick(raw.speed, VIDEO_SPEED_CHOICES, DEFAULT_VIDEO_OPTIONS.speed),
        format: raw.format === "webm" ? "webm" : "mp4",
    };
}
function inputStyle() {
    return "width:100%;box-sizing:border-box;" + DIALOG_INPUT_CSS;
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
export function openSlideshowVideoDialog(doc, initial) {
    const init = sanitizeVideoSettings(initial);
    return showDialog(doc, {
        title: t("videoExport.title"),
        okLabel: t("videoExport.ok"),
        width: 400,
        buildBody: (body) => {
            const heightLabel = (h) => {
                if (h === 0) {
                    const ds = initial.deckSize;
                    return ds ? t("videoExport.heightNative", { w: Math.round(ds.width), h: Math.round(ds.height) }) : t("videoExport.heightNativePlain");
                }
                return `${h}p`;
            };
            const heightSel = select(doc, VIDEO_HEIGHT_CHOICES.map((h) => ({ value: h, label: heightLabel(h) })), init.height);
            const fpsSel = select(doc, VIDEO_FPS_CHOICES.map((f) => ({ value: f, label: `${f} fps` })), init.fps);
            const speedSel = select(doc, VIDEO_SPEED_CHOICES.map((s) => ({ value: s, label: `${s}×` })), init.speed);
            const formatSel = select(doc, [
                { value: "mp4", label: t("videoExport.formatMp4") },
                { value: "webm", label: t("videoExport.formatWebm") },
            ], init.format);
            const holdInput = number(doc, init.slideHold, 0.4, 600, 0.5);
            const gapInput = number(doc, init.clickGap, 0, 60, 0.1);
            const timingWrap = doc.createElement("label");
            timingWrap.style.cssText = "display:inline-flex;align-items:center;gap:6px;color:var(--foreground);cursor:pointer;margin-bottom:10px";
            const timingCb = doc.createElement("input");
            timingCb.type = "checkbox";
            timingCb.className = CHECK_CLASS;
            timingCb.checked = init.useTimings;
            timingCb.disabled = initial.hasTimings === false;
            const timingText = doc.createElement("span");
            timingText.textContent = initial.hasTimings === false ? t("videoExport.useTimingsNone") : t("videoExport.useTimings");
            timingWrap.append(timingCb, timingText);
            const hint = doc.createElement("div");
            hint.textContent = t("videoExport.hint");
            hint.style.cssText = "color:var(--muted-foreground);font-size:11px;line-height:1.5;margin-top:4px";
            body.append(field(doc, t("videoExport.height"), heightSel), field(doc, t("videoExport.fps"), fpsSel), field(doc, t("videoExport.slideHold"), holdInput), timingWrap, field(doc, t("videoExport.clickGap"), gapInput), field(doc, t("videoExport.speed"), speedSel), field(doc, t("videoExport.format"), formatSel), hint);
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
