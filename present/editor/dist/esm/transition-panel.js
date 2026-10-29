// 幻灯片切换（slide transition）编辑面板。
//
// 设计要点：
//   1. 把原本散在 ribbon Transitions tab 的"切换效果选择 / 方向 / 时长 / 推进方式 /
//      声音 / 应用到全部"等控件，统一收拢到右侧面板，与 PowerPoint 的"切换"侧栏一致；
//   2. 数据接口直接对接 SetSlideTransitionCmd（命令栈 undo/redo），通过 stack.subscribe
//      自动刷新 UI；
//   3. previewTransition 是可选的——预览需要拿到 stage / stageWrap DOM 引用，
//      由 editor.ts 提供闭包；本面板不直接耦合舞台 DOM；
//   4. 与原 ribbon 实现 100% 行为兼容：collectPatch / params 字段一一对齐，
//      OOXML §19.5.50 p:transition 子参数（dir / pattern / advClick / advAfter / sound）
//      字段名保持不变，保证 round-trip 序列化不变。
import { auditMorphSlides, formatMorphMatchReasonBreakdown, formatMorphReadinessLine, } from "@sliiu/present-transition-fx";
import { glitterParamsFromToken, glitterToken, splitParamsFromToken, splitToken } from "@sliiu/present-transition-fx";
import { SetSlideTransitionCmd } from "./commands.js";
import { appendLabelWithIcon } from "./icons.js";
import { t } from "./i18n/index.js";
export const TRANSITION_OPTIONS = [
    { kind: "cut", labelKey: "ribbon.transition.effect.cut", category: "subtle", pickThruBlk: true },
    { kind: "fade", labelKey: "ribbon.transition.effect.fade", category: "subtle", pickThruBlk: true },
    { kind: "push", labelKey: "ribbon.transition.effect.push", category: "subtle", dirs: ["left", "right", "up", "down"] },
    { kind: "wipe", labelKey: "ribbon.transition.effect.wipe", category: "subtle", dirs: ["left", "right", "up", "down"] },
    { kind: "split", labelKey: "ribbon.transition.effect.split", category: "subtle", dirs: ["vertOut", "vertIn", "horzOut", "horzIn"] },
    { kind: "reveal", labelKey: "ribbon.transition.effect.reveal", category: "subtle", dirs: ["left", "right"], pickThruBlk: true },
    { kind: "cover", labelKey: "ribbon.transition.effect.cover", category: "subtle", dirs: ["left", "right", "up", "down", "topLeft", "topRight", "bottomLeft", "bottomRight"] },
    { kind: "uncover", labelKey: "ribbon.transition.effect.uncover", category: "subtle", dirs: ["left", "right", "up", "down", "topLeft", "topRight", "bottomLeft", "bottomRight"] },
    { kind: "randomBar", labelKey: "ribbon.transition.effect.randomBar", category: "subtle", dirs: ["horz", "vert"], dirParam: "orient" },
    { kind: "circle", labelKey: "ribbon.transition.effect.circle", category: "subtle" },
    { kind: "diamond", labelKey: "ribbon.transition.effect.diamond", category: "subtle" },
    { kind: "plus", labelKey: "ribbon.transition.effect.plus", category: "subtle" },
    { kind: "wedge", labelKey: "ribbon.transition.effect.wedge", category: "subtle" },
    { kind: "zoom", labelKey: "ribbon.transition.effect.zoom", category: "exciting", dirs: ["in", "out"] },
    { kind: "blinds", labelKey: "ribbon.transition.effect.blinds", category: "exciting", dirs: ["horz", "vert"], dirParam: "orient" },
    { kind: "checker", labelKey: "ribbon.transition.effect.checker", category: "exciting", dirs: ["horz", "vert"], dirParam: "orient" },
    { kind: "comb", labelKey: "ribbon.transition.effect.comb", category: "exciting", dirs: ["horz", "vert"], dirParam: "orient" },
    { kind: "strips", labelKey: "ribbon.transition.effect.strips", category: "exciting", dirs: ["topLeft", "topRight", "bottomLeft", "bottomRight"] },
    { kind: "dissolve", labelKey: "ribbon.transition.effect.dissolve", category: "exciting" },
    { kind: "newsflash", labelKey: "ribbon.transition.effect.newsflash", category: "exciting" },
    { kind: "wheel", labelKey: "ribbon.transition.effect.wheel", category: "exciting", patterns: ["1", "2", "3", "4", "8"] },
    { kind: "wheelReverse", labelKey: "ribbon.transition.effect.wheelReverse", category: "exciting", patterns: ["1", "2", "3", "4", "8"] },
    { kind: "fall", labelKey: "ribbon.transition.effect.fall", category: "exciting" },
    { kind: "flash", labelKey: "ribbon.transition.effect.flash", category: "exciting" },
    { kind: "random", labelKey: "ribbon.transition.effect.random", category: "exciting" },
    {
        kind: "glitter",
        labelKey: "ribbon.transition.effect.glitter",
        category: "exciting",
        patterns: [
            "left:diamond", "right:diamond", "up:diamond", "down:diamond",
            "left:hexagon", "right:hexagon", "up:hexagon", "down:hexagon",
        ],
    },
    { kind: "honeycomb", labelKey: "ribbon.transition.effect.honeycomb", category: "exciting" },
    { kind: "fracture", labelKey: "ribbon.transition.effect.fracture", category: "exciting" },
    { kind: "shred", labelKey: "ribbon.transition.effect.shred", category: "exciting", dirs: ["in", "out"] },
    { kind: "prestige", labelKey: "ribbon.transition.effect.prestige", category: "exciting" },
    { kind: "prism", labelKey: "ribbon.transition.effect.prism", category: "exciting" },
    { kind: "cube", labelKey: "ribbon.transition.effect.cube", category: "dynamic", dirs: ["left", "right", "up", "down"] },
    { kind: "box", labelKey: "ribbon.transition.effect.box", category: "dynamic", dirs: ["left", "right", "up", "down"] },
    { kind: "gallery", labelKey: "ribbon.transition.effect.gallery", category: "dynamic", dirs: ["left", "right"] },
    { kind: "orbit", labelKey: "ribbon.transition.effect.orbit", category: "dynamic", dirs: ["left", "right"] },
    { kind: "conveyor", labelKey: "ribbon.transition.effect.conveyor", category: "dynamic", dirs: ["left", "right"] },
    { kind: "doors", labelKey: "ribbon.transition.effect.doors", category: "dynamic", dirs: ["horz", "vert"], dirParam: "orient" },
    { kind: "window", labelKey: "ribbon.transition.effect.window", category: "dynamic", dirs: ["horz", "vert"], dirParam: "orient" },
    { kind: "pageCurl", labelKey: "ribbon.transition.effect.pageCurl", category: "dynamic", dirs: ["left", "right"] },
    { kind: "pageCurlSingle", labelKey: "ribbon.transition.effect.pageCurlSingle", category: "dynamic", dirs: ["left", "right"], dirToward: true },
    { kind: "wind", labelKey: "ribbon.transition.effect.wind", category: "dynamic", dirs: ["left", "right", "up", "down"], dirToward: true },
    { kind: "crush", labelKey: "ribbon.transition.effect.crush", category: "dynamic", dirs: ["left", "right", "up", "down"], dirToward: true },
    { kind: "airplane", labelKey: "ribbon.transition.effect.airplane", category: "dynamic", dirs: ["left", "right"], dirToward: true },
    { kind: "origami", labelKey: "ribbon.transition.effect.origami", category: "dynamic", dirs: ["left", "right"] },
    { kind: "flythrough", labelKey: "ribbon.transition.effect.flythrough", category: "dynamic", dirs: ["in", "out"] },
    { kind: "rotate", labelKey: "ribbon.transition.effect.rotate", category: "dynamic", dirs: ["left", "right", "up", "down"] },
    { kind: "ferris", labelKey: "ribbon.transition.effect.ferris", category: "dynamic", dirs: ["left", "right"] },
    { kind: "peelOff", labelKey: "ribbon.transition.effect.peelOff", category: "dynamic", dirs: ["left", "right"], dirToward: true },
    { kind: "curtains", labelKey: "ribbon.transition.effect.curtains", category: "dynamic" },
    { kind: "drape", labelKey: "ribbon.transition.effect.drape", category: "dynamic", dirs: ["left", "right"] },
    { kind: "ripple", labelKey: "ribbon.transition.effect.ripple", category: "dynamic", dirs: ["topLeft", "topRight", "bottomLeft", "bottomRight"] },
    { kind: "warp", labelKey: "ribbon.transition.effect.warp", category: "dynamic", dirs: ["in", "out"] },
    { kind: "vortex", labelKey: "ribbon.transition.effect.vortex", category: "dynamic", dirs: ["left", "right", "up", "down"] },
    { kind: "flip", labelKey: "ribbon.transition.effect.flip", category: "dynamic", dirs: ["left", "right"] },
    { kind: "switch", labelKey: "ribbon.transition.effect.switch", category: "dynamic", dirs: ["left", "right"] },
    { kind: "morph", labelKey: "ribbon.transition.effect.morph", category: "dynamic" },
];
export function transitionKindLabel(o) {
    return t(o.labelKey);
}
// 方向 label：用函数动态读 t() 而不是常量表，方便切换 locale。
export function dirLabel(d, toward = false) {
    if (toward && d === "left")
        return t("anim.dir.toLeft");
    if (toward && d === "right")
        return t("anim.dir.toRight");
    if (toward && d === "up")
        return t("anim.dir.toUp");
    if (toward && d === "down")
        return t("anim.dir.toDown");
    switch (d) {
        case "left": return t("anim.dir.fromRight");
        case "right": return t("anim.dir.fromLeft");
        case "up": return t("anim.dir.fromBottom");
        case "down": return t("anim.dir.fromTop");
        case "topLeft": return t("anim.dir.fromBottomRight");
        case "topRight": return t("anim.dir.fromBottomLeft");
        case "bottomLeft": return t("anim.dir.fromTopRight");
        case "bottomRight": return t("anim.dir.fromTopLeft");
        case "horz": return t("anim.dir.horizontal");
        case "vert": return t("anim.dir.vertical");
        case "in": return t("anim.dir.in");
        case "out": return t("anim.dir.out");
        case "vertOut": return t("anim.subtype.verticalOut");
        case "vertIn": return t("anim.subtype.verticalIn");
        case "horzOut": return t("anim.subtype.horizontalOut");
        case "horzIn": return t("anim.subtype.horizontalIn");
        default: return d;
    }
}
function glitterChoiceLabel(def, value) {
    if (def?.kind === "glitter") {
        const { dir, pattern } = glitterParamsFromToken(value);
        const shape = t(pattern === "hexagon" ? "ribbon.transition.pattern.hexagon" : "ribbon.transition.pattern.diamond");
        return `${dirLabel(dir, true)} · ${shape}`;
    }
    if (def?.patterns)
        return t("anim.subtype.spokes", { n: value });
    return dirLabel(value, def?.dirToward);
}
function categoryLabel(c) {
    switch (c) {
        case "subtle": return t("ribbon.transition.subtle");
        case "exciting": return t("ribbon.transition.exciting");
        case "dynamic": return t("ribbon.transition.dynamic");
    }
}
export function mountTransitionPanel(parent, opts) {
    const doc = parent.ownerDocument;
    const el = doc.createElement("div");
    el.className = "ppt-trans-panel ppt-scroll";
    el.style.cssText = [
        "flex:1 1 auto",
        "min-height:0",
        "overflow:auto",
        "background:var(--editor-panel)",
        "color:var(--foreground)",
        "padding:10px 12px",
        "font:12px/1.4 ui-sans-serif,system-ui,sans-serif",
    ].join(";");
    parent.appendChild(el);
    const sectionWrap = (title) => {
        const wrap = doc.createElement("div");
        wrap.style.cssText = "margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid var(--border)";
        const h = doc.createElement("div");
        h.textContent = title;
        h.style.cssText = "color:var(--muted-foreground);font-size:11px;text-transform:uppercase;margin-bottom:6px;letter-spacing:.4px";
        wrap.appendChild(h);
        return wrap;
    };
    const row = (label, control) => {
        const r = doc.createElement("div");
        r.style.cssText = "display:flex;align-items:center;gap:8px;margin:4px 0";
        const lab = doc.createElement("span");
        lab.textContent = label;
        lab.style.cssText = "width:72px;flex:0 0 auto;color:var(--muted-foreground);font-size:11px";
        r.appendChild(lab);
        if (Array.isArray(control))
            for (const c of control)
                r.appendChild(c);
        else
            r.appendChild(control);
        return r;
    };
    const mkInputBase = () => "flex:1;background:var(--secondary);color:var(--foreground);border:1px solid var(--border);border-radius:var(--radius-sm,6px);padding:3px 6px;font:inherit;min-width:0";
    const mkSelect = (options, value, title, onChange) => {
        const s = doc.createElement("select");
        s.title = title;
        s.style.cssText = mkInputBase();
        for (const [v, lbl] of options) {
            const o = doc.createElement("option");
            o.value = v;
            o.textContent = lbl;
            s.appendChild(o);
        }
        s.value = value;
        s.addEventListener("change", () => onChange(s.value));
        return s;
    };
    const mkNumber = (value, title, step, onChange) => {
        const i = doc.createElement("input");
        i.type = "number";
        i.title = title;
        i.step = String(step);
        i.value = String(value);
        i.style.cssText = mkInputBase() + ";max-width:70px";
        i.addEventListener("change", () => {
            const n = Number(i.value);
            if (Number.isFinite(n) && n >= 0)
                onChange(n);
            else
                i.value = String(value);
        });
        return i;
    };
    const mkBtn = (label, title, onClick, primary = false, iconName) => {
        const b = doc.createElement("button");
        b.title = title;
        b.style.cssText = [
            primary ? "background:var(--primary)" : "background:var(--secondary)",
            primary ? "color:var(--primary-foreground)" : "color:var(--foreground)",
            "border:1px solid " + (primary ? "var(--primary)" : "var(--border)"),
            "border-radius:var(--radius-sm,6px)",
            "padding:4px 10px",
            "cursor:pointer",
            "font:inherit",
            "line-height:1",
            iconName ? "display:inline-flex;align-items:center;gap:6px" : "",
        ].filter(Boolean).join(";");
        if (iconName)
            appendLabelWithIcon(doc, b, iconName, label, 14);
        else
            b.textContent = label;
        b.addEventListener("mouseenter", () => {
            b.style.background = primary ? "var(--primary)" : "var(--accent)";
        });
        b.addEventListener("mouseleave", () => {
            b.style.background = primary ? "var(--primary)" : "var(--secondary)";
        });
        b.addEventListener("click", onClick);
        return b;
    };
    // 按分组（subtle / exciting / dynamic）渲染下拉。
    const buildKindOptions = () => {
        const out = [];
        for (const key of ["subtle", "exciting", "dynamic"]) {
            const head = `── ${categoryLabel(key)} ──`;
            // 用一个 disabled 占位作"分组分隔"，让用户清楚分组边界（HTMLSelect 没有 optgroup-i18n 的便捷方式时，
            // disabled option 是最低侵入的折中）。
            out.push([`__sep_${key}`, head]);
            for (const o of TRANSITION_OPTIONS)
                if (o.category === key)
                    out.push([o.kind, transitionKindLabel(o)]);
        }
        return out;
    };
    // ── 主选择
    const kindSect = sectionWrap(t("ribbon.group.transition"));
    const kindSel = mkSelect(buildKindOptions(), "fade", t("ribbon.transition.kind"), () => {
        // 选到分组分隔行时回退到 fade，不触发命令。
        if (kindSel.value.startsWith("__sep_")) {
            kindSel.value = "fade";
            return;
        }
        syncDirSel();
        syncMorphHint();
        reapply();
    });
    // disabled 分组分隔行（保持视觉）
    for (const opt of Array.from(kindSel.options)) {
        if (opt.value.startsWith("__sep_")) {
            opt.disabled = true;
            opt.style.color = "var(--muted-foreground)";
            opt.style.background = "var(--muted)";
        }
    }
    kindSel.style.maxWidth = "";
    kindSect.appendChild(row(t("ribbon.transition.kind"), kindSel));
    const noneBtn = mkBtn(t("ribbon.transition.noneLabel"), t("ribbon.transition.none"), () => {
        opts.stack.execute(new SetSlideTransitionCmd(opts.currentSlide(), undefined, false));
    });
    const btnRow = doc.createElement("div");
    btnRow.style.cssText = "display:flex;gap:6px;margin-top:4px";
    if (opts.preview) {
        btnRow.appendChild(mkBtn(t("ribbon.transition.previewLabel"), t("ribbon.transition.preview"), () => opts.preview?.(), true, "play"));
    }
    btnRow.appendChild(noneBtn);
    kindSect.appendChild(btnRow);
    const morphHint = doc.createElement("p");
    morphHint.style.cssText =
        "margin:6px 0 0;font-size:11px;line-height:1.4;color:var(--muted-foreground)";
    morphHint.textContent = t("ribbon.transition.morphHint");
    morphHint.hidden = true;
    kindSect.appendChild(morphHint);
    const morphStats = doc.createElement("div");
    morphStats.style.cssText =
        "margin:4px 0 0;font-size:11px;line-height:1.45;color:#a3e635;display:flex;flex-wrap:wrap;align-items:center;gap:6px";
    morphStats.hidden = true;
    const morphStatsText = doc.createElement("span");
    morphStatsText.style.flex = "1";
    morphStats.appendChild(morphStatsText);
    kindSect.appendChild(morphStats);
    el.appendChild(kindSect);
    // ── 效果选项（方向 / 图案 ——与 prst 强相关）
    const fxSect = sectionWrap(t("ribbon.group.effectOptions"));
    const dirSel = mkSelect([["", "—"]], "", t("ribbon.transition.direction"), () => reapply());
    fxSect.appendChild(row(t("ribbon.transition.direction"), dirSel));
    el.appendChild(fxSect);
    // ── 时序：持续时间 + 推进方式
    const timeSect = sectionWrap(t("ribbon.group.timing"));
    const durInput = mkNumber(0.6, t("ribbon.transition.duration"), 0.1, () => reapply());
    timeSect.appendChild(row(t("ribbon.transition.duration"), durInput));
    const advanceSel = mkSelect([
        ["click", t("ribbon.transition.advanceClick")],
        ["auto", t("ribbon.transition.advanceAfter")],
        ["both", t("ribbon.transition.advanceBoth")],
    ], "click", t("ribbon.transition.advance"), () => reapply());
    timeSect.appendChild(row(t("ribbon.transition.advance"), advanceSel));
    const advAfter = mkNumber(0, t("ribbon.transition.advAfter"), 0.5, () => reapply());
    timeSect.appendChild(row(t("ribbon.transition.advAfter"), advAfter));
    el.appendChild(timeSect);
    // ── 声音
    const soundSect = sectionWrap(t("ribbon.group.sound"));
    const soundInput = doc.createElement("input");
    soundInput.type = "text";
    soundInput.placeholder = t("ribbon.transition.soundPlaceholder");
    soundInput.title = t("ribbon.transition.soundTitle");
    soundInput.style.cssText = mkInputBase();
    soundInput.addEventListener("change", () => reapply());
    const soundFileInput = doc.createElement("input");
    soundFileInput.type = "file";
    soundFileInput.accept = "audio/*";
    soundFileInput.style.display = "none";
    const soundBrowse = mkBtn(t("ribbon.transition.browseSound"), t("ribbon.transition.browseSoundHint"), () => {
        soundFileInput.click();
    });
    const soundPreview = mkBtn(t("ribbon.transition.previewSound"), t("ribbon.transition.previewSoundHint"), () => {
        const src = soundInput.value.trim();
        if (!src || /^rId\d+/i.test(src))
            return;
        const a = doc.createElement("audio");
        a.src = src;
        a.loop = soundLoop.checked;
        void a.play().catch(() => undefined);
    });
    const soundClear = mkBtn(t("ribbon.transition.clearSound"), t("ribbon.transition.clearSoundHint"), () => {
        soundInput.value = "";
        soundFileInput.value = "";
        reapply();
    });
    soundFileInput.addEventListener("change", () => {
        const f = soundFileInput.files?.[0];
        if (!f)
            return;
        const reader = new FileReader();
        reader.onload = () => {
            soundInput.value = String(reader.result ?? "");
            reapply();
        };
        reader.readAsDataURL(f);
    });
    soundSect.appendChild(row(t("ribbon.transition.soundTitle"), [soundInput, soundBrowse, soundPreview, soundClear]));
    soundSect.appendChild(soundFileInput);
    const soundLoop = doc.createElement("input");
    soundLoop.type = "checkbox";
    soundLoop.title = t("ribbon.transition.loop");
    soundLoop.addEventListener("change", () => reapply());
    const loopLbl = doc.createElement("label");
    loopLbl.style.cssText = "display:flex;align-items:center;gap:6px;color:var(--foreground);font-size:11px;cursor:pointer";
    loopLbl.append(soundLoop, doc.createTextNode(t("ribbon.transition.loopLabel")));
    soundSect.appendChild(row(t("ribbon.transition.loop"), loopLbl));
    el.appendChild(soundSect);
    // ── 应用范围（应用到所有幻灯片）
    const applySect = sectionWrap(t("ribbon.group.apply"));
    applySect.appendChild(mkBtn(t("ribbon.transition.applyAll"), t("ribbon.transition.applyAllTitle"), () => {
        const patch = collectFromUI();
        opts.stack.execute(new SetSlideTransitionCmd(opts.currentSlide(), { kind: patch.kind, duration: patch.duration ?? 0.6, params: patch.params }, true));
    }, true));
    el.appendChild(applySect);
    // ── 当前 UI 状态 → patch
    const currentDef = () => TRANSITION_OPTIONS.find((o) => o.kind === kindSel.value);
    const collectFromUI = () => {
        const def = currentDef();
        const params = {};
        if (def?.kind === "split" && dirSel.value)
            Object.assign(params, splitParamsFromToken(dirSel.value));
        else if (def?.kind === "glitter" && dirSel.value)
            Object.assign(params, glitterParamsFromToken(dirSel.value));
        else if (def?.patterns && dirSel.value)
            params.pattern = dirSel.value;
        else if (def?.dirs && def.dirs.length && dirSel.value)
            params[def.dirParam ?? "dir"] = dirSel.value;
        const advMode = advanceSel.value;
        if (advMode === "click")
            params.advClick = true;
        else if (advMode === "auto") {
            params.advClick = false;
            const n = Number(advAfter.value);
            if (Number.isFinite(n) && n >= 0)
                params.advAfter = n;
        }
        else if (advMode === "both") {
            params.advClick = true;
            const n = Number(advAfter.value);
            if (Number.isFinite(n) && n >= 0)
                params.advAfter = n;
        }
        if (soundInput.value.trim()) {
            params.sound = { src: soundInput.value.trim(), loop: soundLoop.checked };
        }
        return {
            kind: kindSel.value,
            duration: Number(durInput.value) || 0.6,
            params: Object.keys(params).length ? params : undefined,
        };
    };
    const reapply = () => {
        const patch = collectFromUI();
        opts.stack.execute(new SetSlideTransitionCmd(opts.currentSlide(), { kind: patch.kind, duration: patch.duration ?? 0.6, params: patch.params }, false));
    };
    function syncDirSel() {
        const def = currentDef();
        while (dirSel.firstChild)
            dirSel.removeChild(dirSel.firstChild);
        const choices = def?.patterns ?? def?.dirs;
        if (!choices || choices.length === 0) {
            const o = doc.createElement("option");
            o.value = "";
            o.textContent = "—";
            dirSel.appendChild(o);
            dirSel.disabled = true;
            return;
        }
        dirSel.disabled = false;
        for (const d of choices) {
            const o = doc.createElement("option");
            o.value = d;
            o.textContent = glitterChoiceLabel(def, d);
            dirSel.appendChild(o);
        }
    }
    function syncMorphHint() {
        const isMorph = kindSel.value === "morph";
        morphHint.hidden = !isMorph;
        if (!isMorph) {
            morphStats.hidden = true;
            return;
        }
        const idx = opts.currentSlide();
        const from = opts.pres.slides[idx];
        const to = opts.pres.slides[idx + 1];
        if (!from || !to) {
            morphStats.hidden = false;
            morphStatsText.textContent = t("ribbon.transition.morphStatsNoNext");
            return;
        }
        const report = auditMorphSlides(from, to);
        morphStats.hidden = false;
        const breakdown = report.pairs.length ? ` · ${formatMorphMatchReasonBreakdown(report)}` : "";
        morphStatsText.textContent = formatMorphReadinessLine(report) + breakdown;
    }
    const refresh = () => {
        const cur = opts.pres.slides[opts.currentSlide()]?.transition;
        if (!cur) {
            kindSel.value = "fade";
            durInput.value = "0.6";
            advanceSel.value = "click";
            advAfter.value = "0";
            soundInput.value = "";
            soundLoop.checked = false;
            syncDirSel();
            syncMorphHint();
            return;
        }
        kindSel.value = cur.kind;
        durInput.value = String(cur.duration);
        syncDirSel();
        syncMorphHint();
        const p = cur.params ?? {};
        const defNow = currentDef();
        if (defNow?.kind === "split")
            dirSel.value = splitToken(p.orient, p.dir);
        else if (defNow?.kind === "glitter")
            dirSel.value = glitterToken(p.dir, p.pattern);
        else if (defNow?.patterns && p.pattern)
            dirSel.value = String(p.pattern);
        else {
            const dirVal = p[defNow?.dirParam ?? "dir"];
            if (dirVal)
                dirSel.value = String(dirVal);
        }
        const advClick = p.advClick !== false;
        const advAfter2 = typeof p.advAfter === "number" ? p.advAfter : undefined;
        advanceSel.value = advClick && advAfter2 !== undefined ? "both" : advClick ? "click" : "auto";
        advAfter.value = advAfter2 !== undefined ? String(advAfter2) : "0";
        const snd = p.sound;
        soundInput.value = snd?.src ?? "";
        soundLoop.checked = !!snd?.loop;
    };
    refresh();
    // stack 变化（命令 apply / undo / redo）后 transition 字段可能被改，自动 refresh。
    const unsub = opts.stack.subscribe(() => refresh());
    return {
        el,
        refresh,
        destroy() {
            unsub();
            el.remove();
        },
    };
}
