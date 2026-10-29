import { t } from "./i18n/index.js";
import { CHECK_CLASS, COLOR_SWATCH_CLASS, CONTROL_INPUT_CLASS, RANGE_INPUT_CLASS } from "./ui-style.js";
const PATTERN_PRESETS = [
    ["pct5", "5%"],
    ["pct10", "10%"],
    ["pct20", "20%"],
    ["pct25", "25%"],
    ["pct50", "50%"],
    ["horz", "Horizontal"],
    ["vert", "Vertical"],
    ["cross", "Cross"],
    ["dnDiag", "Diagonal ↘"],
    ["upDiag", "Diagonal ↗"],
    ["smCheck", "Small check"],
    ["lgCheck", "Large check"],
];
function formatNum(n) {
    if (Number.isInteger(n))
        return String(n);
    return n.toFixed(2).replace(/\.?0+$/, "");
}
function normalizeColor(c) {
    if (/^#[0-9a-f]{6}$/i.test(c))
        return c;
    if (/^#[0-9a-f]{3}$/i.test(c))
        return "#" + c[1] + c[1] + c[2] + c[2] + c[3] + c[3];
    return "#000000";
}
function row(doc, label, ...controls) {
    const r = doc.createElement("div");
    r.style.cssText = "display:flex;align-items:center;gap:6px;margin:4px 0;flex-wrap:wrap";
    const l = doc.createElement("label");
    l.textContent = label;
    l.style.cssText = "width:72px;color:var(--muted-foreground);flex-shrink:0";
    r.appendChild(l);
    for (const c of controls)
        r.appendChild(c);
    return r;
}
function colorInput(doc, value, onChange, gesture, slot) {
    const i = doc.createElement("input");
    i.type = "color";
    i.value = normalizeColor(value);
    i.className = COLOR_SWATCH_CLASS;
    i.style.cssText = "width:36px";
    if (slot)
        i.dataset.liveColor = slot;
    i.addEventListener("pointerdown", () => gesture?.start());
    i.addEventListener("input", () => onChange(i.value));
    i.addEventListener("change", () => gesture?.end());
    i.addEventListener("blur", () => gesture?.end());
    return i;
}
function checkbox(doc, label, checked, onChange) {
    const l = doc.createElement("label");
    l.style.cssText = "display:inline-flex;align-items:center;gap:4px;cursor:pointer";
    const i = doc.createElement("input");
    i.type = "checkbox";
    i.className = CHECK_CLASS;
    i.checked = checked;
    i.addEventListener("change", () => onChange(i.checked));
    l.appendChild(i);
    l.appendChild(doc.createTextNode(label));
    return l;
}
function selectInput(doc, items, value, onChange) {
    const s = doc.createElement("select");
    s.className = CONTROL_INPUT_CLASS;
    for (const [v, lbl] of items) {
        const o = doc.createElement("option");
        o.value = v;
        o.textContent = lbl;
        s.appendChild(o);
    }
    s.value = value;
    s.addEventListener("change", () => onChange(s.value));
    return s;
}
function rangeInput(doc, value, onChange, min = 0, max = 1, step = 0.01, extra) {
    const i = doc.createElement("input");
    i.type = "range";
    i.min = String(min);
    i.max = String(max);
    i.step = String(step);
    i.value = String(value);
    i.className = RANGE_INPUT_CLASS;
    i.style.cssText = "flex:1;min-width:80px";
    const showValue = extra?.showValue ?? true;
    const fmt = extra?.format ?? ((v) => (min === 0 && max === 1 ? `${Math.round(v * 100)}%` : formatNum(v)));
    if (!showValue) {
        i.addEventListener("input", () => onChange(Number(i.value)));
        return i;
    }
    const wrap = doc.createElement("div");
    wrap.style.cssText = "display:flex;align-items:center;gap:6px;flex:1;min-width:120px";
    const badge = doc.createElement("span");
    badge.textContent = fmt(value);
    badge.style.cssText =
        "min-width:36px;text-align:right;color:var(--muted-foreground);font:11px/1 ui-monospace,monospace;font-variant-numeric:tabular-nums";
    i.addEventListener("input", () => {
        const v = Number(i.value);
        badge.textContent = fmt(v);
        onChange(v);
    });
    wrap.append(i, badge);
    return wrap;
}
function angleField(doc, value, onChange, gesture) {
    const wrap = doc.createElement("div");
    wrap.style.cssText = "display:flex;flex-direction:column;gap:5px;flex:1;min-width:150px";
    const dirs = [
        [0, "\u2192"], [45, "\u2198"], [90, "\u2193"], [135, "\u2199"],
        [180, "\u2190"], [225, "\u2196"], [270, "\u2191"], [315, "\u2197"],
    ];
    let cur = ((value % 360) + 360) % 360;
    const presetRow = doc.createElement("div");
    presetRow.style.cssText = "display:flex;gap:2px;flex-wrap:wrap";
    const btns = [];
    const slider = doc.createElement("input");
    slider.type = "range";
    slider.min = "0";
    slider.max = "360";
    slider.step = "5";
    slider.className = RANGE_INPUT_CLASS;
    slider.style.cssText = "flex:1;min-width:90px";
    const num = doc.createElement("input");
    num.type = "number";
    num.min = "0";
    num.max = "360";
    num.step = "5";
    num.className = CONTROL_INPUT_CLASS;
    num.style.cssText = "width:54px";
    const paint = () => {
        slider.value = String(cur);
        num.value = String(Math.round(cur));
        for (const { deg, el } of btns) {
            const on = deg === Math.round(cur) % 360;
            el.style.background = on ? "var(--border)" : "var(--card)";
            el.style.borderColor = on ? "var(--primary)" : "var(--border)";
        }
    };
    const setVal = (deg, fire) => {
        cur = ((Math.round(deg) % 360) + 360) % 360;
        paint();
        if (fire)
            onChange(cur);
    };
    for (const [deg, arrow] of dirs) {
        const b = doc.createElement("button");
        b.textContent = arrow;
        b.title = `${deg}\u00b0`;
        b.style.cssText =
            "width:24px;height:22px;background:var(--card);color:var(--foreground);border:1px solid var(--border);border-radius:3px;cursor:pointer;font:14px/1 system-ui,sans-serif;display:inline-flex;align-items:center;justify-content:center";
        b.addEventListener("click", () => setVal(deg, true));
        btns.push({ deg, el: b });
        presetRow.appendChild(b);
    }
    slider.addEventListener("input", () => setVal(Number(slider.value), true));
    num.addEventListener("focus", () => gesture?.start());
    num.addEventListener("input", () => {
        const raw = num.value.trim();
        if (raw === "" || raw === "-" || raw === ".")
            return;
        const n = Number(raw);
        if (Number.isFinite(n))
            setVal(n, true);
        else
            paint();
    });
    num.addEventListener("blur", () => gesture?.end());
    const sliderRow = doc.createElement("div");
    sliderRow.style.cssText = "display:flex;align-items:center;gap:6px";
    sliderRow.append(slider, num);
    wrap.append(presetRow, sliderRow);
    paint();
    return wrap;
}
function mkActionBtn(doc, label, onClick) {
    const b = doc.createElement("button");
    b.textContent = label;
    b.style.cssText =
        "background:var(--card);color:var(--foreground);border:1px solid var(--border);border-radius:3px;padding:4px 8px;cursor:pointer;font:inherit";
    b.addEventListener("click", onClick);
    return b;
}
function paintKindUi(p, modes) {
    if (!p || p.kind === "none")
        return "none";
    if (modes.includes(p.kind))
        return p.kind;
    return "solid";
}
function stopsOfPaint(p, fallback) {
    if (p && (p.kind === "linear" || p.kind === "radial") && p.stops.length >= 2) {
        return p.stops.map((s) => ({ ...s }));
    }
    return [
        { offset: 0, color: fallback[0] },
        { offset: 1, color: fallback[1] },
    ];
}
function pickImageFile(doc, onPicked) {
    const inp = doc.createElement("input");
    inp.type = "file";
    inp.accept = "image/*";
    inp.addEventListener("change", () => {
        const f = inp.files?.[0];
        if (!f)
            return;
        const reader = new FileReader();
        reader.onload = () => onPicked(String(reader.result));
        reader.readAsDataURL(f);
    });
    inp.click();
}
/** 共享填充/背景 paint 编辑器 UI（inspector + Format Background 对话框复用）。 */
export function appendPaintEditor(doc, wrap, cfg) {
    const gesture = { start: () => cfg.onGestureStart?.(), end: () => cfg.onGestureEnd?.() };
    const snapshot = cfg.getPaint();
    const kind = paintKindUi(snapshot, cfg.modes);
    const defaultForKind = (k) => {
        const cur = cfg.getPaint();
        switch (k) {
            case "none":
                return undefined;
            case "solid":
                return { kind: "solid", color: cur?.kind === "solid" ? cur.color : cfg.fallbackSolid };
            case "linear":
                return {
                    kind: "linear",
                    angle: cur?.kind === "linear" ? cur.angle : 90,
                    stops: stopsOfPaint(cur, [cfg.fallbackSolid, "#3b82f6"]),
                };
            case "radial":
                return {
                    kind: "radial",
                    path: cur?.kind === "radial" && cur.path === "rect" ? "rect" : "circle",
                    fillToRect: cur?.kind === "radial" ? cur.fillToRect : { l: 0, t: 0, r: 0, b: 0 },
                    stops: stopsOfPaint(cur, [cfg.fallbackSolid, "#3b82f6"]),
                };
            case "pattern": {
                const prst = cur?.kind === "pattern" ? cur.prst : "pct25";
                const fg = cur?.kind === "pattern" ? cur.fg : "#1e3a8a";
                const bg = cur?.kind === "pattern" ? cur.bg : cfg.fallbackSolid;
                return { kind: "pattern", prst, fg, bg };
            }
            case "image":
                return undefined;
        }
    };
    const typeItems = [];
    for (const m of cfg.modes) {
        if (m === "none")
            typeItems.push(["none", t("inspector.background.none")]);
        else if (m === "solid")
            typeItems.push(["solid", t("inspector.background.solid")]);
        else if (m === "linear")
            typeItems.push(["linear", t("inspector.background.linear")]);
        else if (m === "radial")
            typeItems.push(["radial", t("inspector.background.radial")]);
        else if (m === "image")
            typeItems.push(["image", t("inspector.background.image")]);
        else if (m === "pattern")
            typeItems.push(["pattern", t("inspector.paint.pattern")]);
    }
    const typeSel = selectInput(doc, typeItems, kind, (v) => {
        if (v === "image" && !(cfg.getPaint()?.kind === "image")) {
            pickImageFile(doc, (src) => {
                const alpha = cfg.newImageAlpha;
                applyPaint({
                    kind: "image",
                    src,
                    fit: "cover",
                    ...(alpha !== undefined && alpha < 1 ? { alpha } : {}),
                });
                cfg.onTypeChange?.();
            });
            return;
        }
        applyPaint(defaultForKind(v));
        cfg.onTypeChange?.();
    });
    wrap.appendChild(row(doc, t("inspector.field.type"), typeSel));
    function applyPaint(next) {
        cfg.apply(next);
    }
    const live = cfg.getPaint;
    const cur = snapshot;
    if (kind === "solid" && cur?.kind === "solid") {
        const liveSolid = () => {
            const p = live();
            return p && p.kind === "solid" ? p : cur;
        };
        wrap.appendChild(row(doc, t("inspector.field.color"), colorInput(doc, cur.color, (v) => {
            const s = liveSolid();
            applyPaint({ kind: "solid", color: v, ...(s.alpha !== undefined && s.alpha < 1 ? { alpha: s.alpha } : {}) });
        }, gesture, cfg.liveSlot)));
        wrap.appendChild(row(doc, t("inspector.field.opacity"), rangeInput(doc, cur.alpha ?? 1, (a) => {
            applyPaint({ kind: "solid", color: liveSolid().color, ...(a < 1 ? { alpha: a } : {}) });
        })));
    }
    else if ((kind === "linear" || kind === "radial") && cur && (cur.kind === "linear" || cur.kind === "radial")) {
        const grad = cur;
        const stops = grad.stops.map((s) => ({ ...s }));
        const start = stops[0];
        const end = stops[stops.length - 1];
        let angle = grad.kind === "linear" ? grad.angle : 90;
        let path = grad.kind === "radial" && grad.path === "rect" ? "rect" : "circle";
        const writeStops = () => {
            stops[0] = start;
            stops[stops.length - 1] = end;
            const base = live();
            const src = base && (base.kind === "linear" || base.kind === "radial") ? base : grad;
            if (src.kind === "linear")
                applyPaint({ ...src, angle, stops });
            else
                applyPaint({ ...src, path, stops });
        };
        wrap.appendChild(row(doc, t("inspector.background.startColor"), colorInput(doc, start.color, (v) => { start.color = v; writeStops(); }, gesture)));
        wrap.appendChild(row(doc, t("inspector.background.startOpacity"), rangeInput(doc, start.alpha ?? 1, (a) => { start.alpha = a < 1 ? a : undefined; writeStops(); })));
        wrap.appendChild(row(doc, t("inspector.background.endColor"), colorInput(doc, end.color, (v) => { end.color = v; writeStops(); }, gesture)));
        wrap.appendChild(row(doc, t("inspector.background.endOpacity"), rangeInput(doc, end.alpha ?? 1, (a) => { end.alpha = a < 1 ? a : undefined; writeStops(); })));
        if (grad.kind === "linear") {
            wrap.appendChild(row(doc, t("inspector.background.angle"), angleField(doc, angle, (deg) => { angle = deg; writeStops(); }, gesture)));
        }
        else {
            wrap.appendChild(row(doc, t("inspector.background.radialShape"), selectInput(doc, [
                ["circle", t("inspector.background.radialCircle")],
                ["rect", t("inspector.background.radialRect")],
            ], path, (v) => { path = v; writeStops(); })));
        }
    }
    else if (kind === "pattern" && cur?.kind === "pattern") {
        const pat = cur;
        const livePat = () => {
            const p = live();
            return p && p.kind === "pattern" ? p : pat;
        };
        wrap.appendChild(row(doc, t("inspector.paint.patternPreset"), selectInput(doc, PATTERN_PRESETS, pat.prst, (v) => applyPaint({ ...livePat(), prst: v }))));
        wrap.appendChild(row(doc, t("inspector.paint.fgColor"), colorInput(doc, pat.fg, (v) => applyPaint({ ...livePat(), fg: v }), gesture)));
        wrap.appendChild(row(doc, t("inspector.paint.bgColor"), colorInput(doc, pat.bg, (v) => applyPaint({ ...livePat(), bg: v }), gesture)));
    }
    else if (kind === "image" && cur?.kind === "image") {
        const im = cur;
        const liveImage = () => {
            const p = live();
            return p && p.kind === "image" ? p : im;
        };
        const withAdjust = (patch) => {
            const curIm = liveImage();
            const next = { ...(curIm.adjust ?? {}), ...patch };
            const hasAny = next.grayscale ||
                (next.lum && (next.lum.bright || next.lum.contrast)) ||
                next.hsl ||
                next.duotone ||
                next.alphaMod !== undefined;
            return { ...curIm, adjust: hasAny ? next : undefined };
        };
        wrap.appendChild(row(doc, t("inspector.background.image"), mkActionBtn(doc, t("inspector.background.chooseImage"), () => {
            pickImageFile(doc, (src) => applyPaint({ ...liveImage(), src }));
        })));
        wrap.appendChild(row(doc, t("inspector.background.fit"), selectInput(doc, [
            ["cover", t("inspector.background.fitCover")],
            ["contain", t("inspector.background.fitContain")],
            ["fill", t("inspector.background.fitFill")],
            ["tile", t("inspector.background.fitTile")],
        ], im.fit, (v) => applyPaint({ ...liveImage(), fit: v }))));
        wrap.appendChild(row(doc, t("inspector.field.opacity"), rangeInput(doc, im.alpha ?? 1, (a) => applyPaint({ ...liveImage(), alpha: a < 1 ? a : undefined }))));
        const adj = im.adjust ?? {};
        wrap.appendChild(row(doc, t("inspector.background.grayscale"), checkbox(doc, "", !!adj.grayscale, (on) => applyPaint(withAdjust({ grayscale: on || undefined })))));
        wrap.appendChild(row(doc, t("inspector.background.brightness"), rangeInput(doc, adj.lum?.bright ?? 0, (b) => applyPaint(withAdjust({ lum: { ...liveImage().adjust?.lum, bright: b || undefined } })), -0.5, 0.5, 0.02)));
        wrap.appendChild(row(doc, t("inspector.background.contrast"), rangeInput(doc, adj.lum?.contrast ?? 0, (c) => applyPaint(withAdjust({ lum: { ...liveImage().adjust?.lum, contrast: c || undefined } })), -0.5, 0.5, 0.02)));
    }
}
