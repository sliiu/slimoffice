// 动画面板 - 列出当前 slide 的所有动画，支持选择/排序/删除/新增/属性编辑。
import { ooxml } from "@sliiu/present-animation";
import { AddAnimEffectCmd, MoveAnimEffectCmd, RemoveAnimEffectCmd, SetAnimEffectPropCmd, } from "./commands.js";
import { buildEffectList } from "./store.js";
import { mountPresetPicker } from "./preset-picker.js";
import { presetDisplayName } from "./preset-labels.js";
import { appendLucideIcon, mkLucideIconButton } from "../icons.js";
import { t } from "../i18n/index.js";
function presetNameFor(cls, presetId) {
    if (presetId === undefined || presetId === null)
        return "—";
    let id = presetId;
    let fallback;
    if (cls === "entr" || cls === "emph" || cls === "exit" || cls === "path") {
        try {
            const found = ooxml
                .listPresets(cls)
                .find((p) => p.id === presetId || p.ids.includes(presetId));
            if (found) {
                id = found.id;
                fallback = found.name;
            }
        }
        catch {
            // fall through
        }
    }
    return presetDisplayName(cls, id, fallback ?? `#${presetId}`);
}
// ECMA-376 §19.5.18 cTn.presetSubtype 位标志（与 DIRECTION_VECTORS 同步）：
// 1 上、2 右、4 下、8 左，角方向相加；5 / 10 轴向；16 / 32 内 / 外；劈裂 21 / 26 / 37 / 42；
// 轮子用辐条数。有子树模板的 preset 只列模板能展开出的值（已提取 + 可按方向改写），
// 否则写进去的 presetSubtype 与内层子树对不上；没有模板的 preset 仍给 8 个罗盘方向，
// 由 compilePresetTracks 按 DIRECTION_VECTORS 播放。
// 注：label 用函数动态读取 t()，保证切换 locale 后下次 mount 重新求值。
const COMPASS_ORDER = [4, 1, 8, 2, 12, 6, 9, 3];
function compassLabel(value, exit) {
    const keys = {
        4: ["anim.subtype.fromBottom", "anim.subtype.toBottom"],
        1: ["anim.subtype.fromTop", "anim.subtype.toTop"],
        8: ["anim.subtype.fromLeft", "anim.subtype.toLeft"],
        2: ["anim.subtype.fromRight", "anim.subtype.toRight"],
        12: ["anim.subtype.fromBottomLeft", "anim.subtype.toBottomLeft"],
        6: ["anim.subtype.fromBottomRight", "anim.subtype.toBottomRight"],
        9: ["anim.subtype.fromTopLeft", "anim.subtype.toTopLeft"],
        3: ["anim.subtype.fromTopRight", "anim.subtype.toTopRight"],
    };
    const k = keys[value];
    return k ? t(k[exit ? 1 : 0]) : undefined;
}
function subtypeLabel(value, kind, exit) {
    switch (kind) {
        case "axis":
            if (value === 10)
                return t("anim.subtype.horizontal");
            if (value === 5)
                return t("anim.subtype.vertical");
            break;
        case "inOut":
            if (value === 16)
                return t("anim.subtype.in");
            if (value === 32)
                return t("anim.subtype.out");
            break;
        case "barn": {
            const barn = {
                21: "anim.subtype.verticalIn",
                26: "anim.subtype.horizontalIn",
                37: "anim.subtype.verticalOut",
                42: "anim.subtype.horizontalOut",
            };
            if (barn[value])
                return t(barn[value]);
            break;
        }
        case "spokes":
            return t("anim.subtype.spokes", { n: value });
        case "stretch":
            if (value === 10)
                return t("anim.subtype.horizontal");
            if (value === 5)
                return t("anim.subtype.vertical");
            return compassLabel(value, exit) ?? `#${value}`;
        default:
            break;
    }
    return compassLabel(value, exit) ?? `#${value}`;
}
function subtypeOptions(cls, presetId, current) {
    if (presetId === undefined)
        return [];
    if (cls !== "entr" && cls !== "emph" && cls !== "exit")
        return [];
    const exit = cls === "exit";
    let values = [];
    let kind;
    const tpl = ooxml.findPresetTemplate(cls, presetId);
    if (tpl?._subtypes) {
        values = ooxml.presetTemplateSubtypes(tpl);
        kind = ooxml.presetTemplateSubtypeKind(tpl);
        if (kind === "compass") {
            values = COMPASS_ORDER.filter((v) => values.includes(v));
        }
        else if (kind === "stretch") {
            const order = [10, 5, 1, 2, 4, 8];
            const extra = values.filter((v) => !order.includes(v));
            values = [...order.filter((v) => values.includes(v)), ...extra];
        }
    }
    else if (!tpl &&
        ooxml.listPresets(cls).find((p) => p.id === presetId || p.ids.includes(presetId))?.supportsSubtype) {
        values = COMPASS_ORDER;
        kind = "compass";
    }
    if (current !== undefined && current !== 0 && !values.includes(current))
        values = [...values, current];
    if (values.length < 2)
        return [];
    return values.map((value) => ({ value, label: subtypeLabel(value, kind, exit) }));
}
// §19.5.18 cTn@spd 字符串枚举与对应倍率（resolveSpdRatio 接受的写法）。
// "med" 是默认（写出时会被 store 删除字段），其它写入原值用于 round-trip。
function speedOptions() {
    return [
        { value: "veryslow", label: t("anim.speed.veryslow") },
        { value: "slow", label: t("anim.speed.slow") },
        { value: "med", label: t("anim.speed.med") },
        { value: "fast", label: t("anim.speed.fast") },
        { value: "veryfast", label: t("anim.speed.veryfast") },
    ];
}
function speedValueFor(spd) {
    if (!spd)
        return "med";
    const s = spd.trim().toLowerCase();
    if (s === "" || s === "normal" || s === "medium")
        return "med";
    if (speedOptions().some((o) => o.value === s))
        return s;
    return "med";
}
function triggerLabel(tr) {
    switch (tr) {
        case "onClick": return t("anim.trigger.onClick");
        case "withPrevious": return t("anim.trigger.withPrevious");
        case "afterPrevious": return t("anim.trigger.afterPrevious");
        case "onShapeClick": return t("anim.trigger.onShapeClick");
        case "onShapeDblClick": return t("anim.trigger.onShapeDblClick");
        case "onShapeHover": return t("anim.trigger.onShapeHover");
        case "onShapeMouseOut": return t("anim.trigger.onShapeMouseOut");
        case "onPrev": return t("anim.trigger.onPrev");
        case "onNext": return t("anim.trigger.onNext");
        case "onLoad": return t("anim.trigger.onLoad");
    }
}
// "短" 形式：在 badge 中显示，单字符或两字符的紧凑标签。
function classBadge(cls) {
    switch (cls) {
        case "entr": return t("anim.class.entr.short");
        case "emph": return t("anim.class.emph.short");
        case "exit": return t("anim.class.exit.short");
        case "path": return t("anim.class.path.short");
        case "media": return t("anim.class.media.short");
        default: return t("anim.class.custom.short");
    }
}
const CLASS_COLOR = {
    entr: "#10b981",
    emph: "#eab308",
    exit: "#ef4444",
    path: "var(--primary)",
    media: "#a855f7",
    custom: "var(--muted-foreground)",
};
export function mountAnimationPanel(parent, opts) {
    const doc = parent.ownerDocument;
    const el = doc.createElement("div");
    el.className = "ppt-anim-panel";
    // 由父容器（编辑器右侧面板栏）控制位置；这里以 flex:1 占据剩余空间。
    el.style.cssText = [
        "flex:1 1 auto",
        "min-height:0",
        "background:var(--editor-panel,#191919)",
        "color:var(--foreground)",
        "display:flex",
        "flex-direction:column",
        "font:12px var(--font-sans, ui-sans-serif, system-ui, sans-serif)",
        "position:relative",
    ].join(";");
    const head = doc.createElement("div");
    head.style.cssText = "display:flex;align-items:center;gap:6px;padding:8px 10px;border-bottom:1px solid var(--border);font-weight:600;font-size:12px;";
    head.textContent = t("anim.panel.title");
    let paintBtn;
    if (opts.toggleAnimationPainter) {
        paintBtn = doc.createElement("button");
        paintBtn.type = "button";
        paintBtn.textContent = t("anim.panel.painter");
        paintBtn.title = t("ribbon.animationPainter.title");
        paintBtn.style.cssText = "margin-left:auto;background:var(--secondary);color:var(--foreground);border:1px solid var(--border);padding:4px 10px;border-radius:var(--radius-sm,6px);cursor:pointer;font-size:11px;font-weight:500;";
        let paintClickTimer;
        paintBtn.addEventListener("click", () => {
            if (paintClickTimer)
                return;
            paintClickTimer = setTimeout(() => {
                paintClickTimer = undefined;
                opts.toggleAnimationPainter?.(false);
                syncPaintBtn();
            }, 220);
        });
        paintBtn.addEventListener("dblclick", (ev) => {
            ev.preventDefault();
            if (paintClickTimer) {
                clearTimeout(paintClickTimer);
                paintClickTimer = undefined;
            }
            opts.toggleAnimationPainter?.(true);
            syncPaintBtn();
        });
        head.appendChild(paintBtn);
    }
    const addBtn = doc.createElement("button");
    addBtn.textContent = t("anim.panel.add");
    addBtn.style.cssText = `${paintBtn ? "" : "margin-left:auto;"}background:var(--primary);color:var(--primary-foreground);border:none;padding:4px 10px;border-radius:var(--radius-sm,6px);cursor:pointer;font-size:11px;font-weight:500;`;
    head.appendChild(addBtn);
    el.appendChild(head);
    const list = doc.createElement("div");
    list.className = "ppt-scroll";
    // list 与 inspector 都参与 flex 分配（min-height:0 让二者都能压缩到自身的滚动）。
    // list 给较小的 min-height（60px ≈ 1.5 行）以便选中后让位给属性区。
    list.style.cssText = "flex:1 1 0;overflow:auto;padding:6px;display:flex;flex-direction:column;gap:4px;min-height:60px;";
    // 点击空白处反选（用于「也没有反选元素」）。
    list.addEventListener("click", (ev) => {
        if (ev.target === list) {
            setSelectedEffectId(null);
            refresh();
        }
    });
    el.appendChild(list);
    const inspector = doc.createElement("div");
    inspector.className = "ppt-scroll";
    // 属性区现在装得下：摘要 + 效果选项 + 时序(3) + 平滑(2) + 重复(2) + 删除 ≈ 10+ 行。
    // 给一个 ~340px 的 flex-basis（覆盖默认展开高度），并允许 grow/shrink；
    // 自身仍保留 overflow:auto，最小 180px 保证 inspector 至少能看到几行核心控件，
    // 而不是被上面的 list 挤成只剩 50% 的窄条（之前是 max-height:50% 的硬上限）。
    inspector.style.cssText = "border-top:1px solid var(--border);padding:8px 10px;display:none;flex:1 1 340px;min-height:180px;overflow:auto;background:var(--card,#1c1c1c);";
    el.appendChild(inspector);
    // toast 浮层，给用户即时反馈（如「已在末尾」「已删除」）。
    const toast = doc.createElement("div");
    toast.style.cssText =
        "position:absolute;left:50%;bottom:8px;transform:translateX(-50%);background:var(--popover);color:var(--foreground);padding:4px 10px;border:1px solid var(--border);border-radius:var(--radius-sm,6px);font-size:11px;box-shadow:var(--shadow-md);opacity:0;transition:opacity .15s;pointer-events:none;z-index:5;";
    el.appendChild(toast);
    let toastTimer;
    const showToast = (msg) => {
        toast.textContent = msg;
        toast.style.opacity = "1";
        if (toastTimer)
            clearTimeout(toastTimer);
        toastTimer = window.setTimeout(() => {
            toast.style.opacity = "0";
        }, 1400);
    };
    parent.appendChild(el);
    let pickerHost = null;
    let selectedEffectId = null;
    let effects = [];
    let lastSlideIdx = -1;
    let onDocPointerDown;
    let onDocKeyDown;
    const setSelectedEffectId = (id) => {
        if (selectedEffectId === id)
            return;
        selectedEffectId = id;
        if (id) {
            const eff = effects.find((e) => e.id === id);
            if (eff)
                opts.selectShape?.(eff.targetShapeId);
        }
        else {
            opts.selectShape?.(undefined);
        }
        opts.onSelectEffect?.(id);
    };
    const closePicker = () => {
        if (!pickerHost)
            return;
        pickerHost.remove();
        pickerHost = null;
        if (onDocPointerDown) {
            doc.removeEventListener("pointerdown", onDocPointerDown, true);
            onDocPointerDown = undefined;
        }
        if (onDocKeyDown) {
            doc.removeEventListener("keydown", onDocKeyDown, true);
            onDocKeyDown = undefined;
        }
    };
    // 挂到 document + position:fixed，避免被右侧栏 overflow:hidden 裁掉。
    const openPicker = () => {
        if (pickerHost) {
            closePicker();
            return;
        }
        const targetId = opts.getSelection();
        if (!targetId) {
            showToast(t("anim.panel.pickShapeFirst"));
            return;
        }
        const view = doc.defaultView;
        const rect = addBtn.getBoundingClientRect();
        const gap = 6;
        const width = 360;
        const right = view ? Math.max(8, view.innerWidth - rect.right) : 8;
        const top = rect.bottom + gap;
        const maxH = view ? Math.max(220, view.innerHeight - top - 12) : 420;
        pickerHost = doc.createElement("div");
        pickerHost.style.cssText = [
            "position:fixed",
            `top:${top}px`,
            `right:${right}px`,
            `width:${width}px`,
            `max-height:${maxH}px`,
            "z-index:var(--z-overlay,1500)",
            "display:flex",
            "flex-direction:column",
            "min-height:0",
        ].join(";");
        const picker = mountPresetPicker(doc, (item) => {
            const slideIdx = opts.currentSlide();
            opts.stack.execute(new AddAnimEffectCmd(slideIdx, {
                targetShapeId: targetId,
                presetClass: item.classKey,
                presetId: item.presetId,
            }));
            closePicker();
            refresh();
        });
        picker.el.style.maxHeight = "100%";
        picker.el.style.boxShadow = "var(--shadow-lg, 0 12px 40px rgba(0,0,0,.35))";
        picker.el.style.border = "1px solid var(--border)";
        pickerHost.appendChild(picker.el);
        doc.body.appendChild(pickerHost);
        onDocPointerDown = (ev) => {
            const target = ev.target;
            if (!target || !pickerHost)
                return;
            if (pickerHost.contains(target) || addBtn.contains(target))
                return;
            closePicker();
        };
        onDocKeyDown = (ev) => {
            if (ev.key === "Escape")
                closePicker();
        };
        doc.addEventListener("pointerdown", onDocPointerDown, true);
        doc.addEventListener("keydown", onDocKeyDown, true);
    };
    addBtn.addEventListener("click", openPicker);
    const renderInspector = (eff) => {
        while (inspector.firstChild)
            inspector.removeChild(inspector.firstChild);
        if (!eff) {
            inspector.style.display = "none";
            return;
        }
        inspector.style.display = "block";
        const slideIdx = opts.currentSlide();
        const row = (label, control) => {
            const r = doc.createElement("div");
            r.style.cssText = "display:flex;align-items:center;gap:8px;margin-bottom:6px;";
            const lab = doc.createElement("span");
            lab.style.cssText = "width:72px;color:var(--muted-foreground);font-size:11px;flex:0 0 auto;";
            lab.textContent = label;
            r.appendChild(lab);
            r.appendChild(control);
            return r;
        };
        const section = (label) => {
            const h = doc.createElement("div");
            h.style.cssText =
                "margin:8px 0 4px;color:var(--muted-foreground);font-size:10px;letter-spacing:0.5px;text-transform:uppercase;font-weight:600;";
            h.textContent = label;
            return h;
        };
        const inputStyle = "flex:1;background:var(--secondary);color:var(--foreground);border:1px solid var(--border);border-radius:var(--radius-sm,6px);padding:2px 6px;font-size:11px;min-width:0;";
        // 顶部摘要：效果分类 + presetId + 目标 + 反选按钮。
        const summary = doc.createElement("div");
        summary.style.cssText =
            "display:flex;align-items:center;gap:6px;margin-bottom:8px;padding:4px 6px;background:var(--secondary);border:1px solid var(--border);border-radius:var(--radius-sm,6px);font-size:11px;";
        const badge2 = doc.createElement("span");
        badge2.textContent = classBadge(eff.presetClass);
        badge2.style.cssText = `display:inline-block;width:18px;height:18px;line-height:18px;text-align:center;background:${CLASS_COLOR[eff.presetClass] ?? "#555"};color:#fff;border-radius:3px;font-size:10px;flex:0 0 auto;`;
        const summaryText = doc.createElement("span");
        summaryText.style.cssText = "flex:1;color:var(--foreground);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
        summaryText.textContent = `${presetNameFor(eff.presetClass, eff.presetId)} → ${eff.targetShapeId}`;
        summary.append(badge2, summaryText);
        const deselectBtn = miniBtn(doc, "x", t("anim.panel.deselect"));
        deselectBtn.style.width = "18px";
        deselectBtn.style.height = "18px";
        deselectBtn.addEventListener("click", () => {
            setSelectedEffectId(null);
            refresh();
        });
        summary.appendChild(deselectBtn);
        inspector.appendChild(summary);
        // ── 效果选项（方向等与 preset 强相关的参数）
        const dirOptions = subtypeOptions(eff.presetClass, eff.presetId, eff.presetSubtype);
        if (dirOptions.length > 0) {
            inspector.appendChild(section(t("anim.panel.section.effectOptions")));
            const dirSel = doc.createElement("select");
            dirSel.style.cssText = inputStyle;
            // PowerPoint 行为：未显式设置时按模板默认方向走（DEFAULT_DIRECTION = 自底部，即 4）。
            // UI 也用 "默认" 选项让用户明确表达回退意图，避免 0 与 1 混淆。
            const defaultOpt = doc.createElement("option");
            defaultOpt.value = "";
            defaultOpt.textContent = t("anim.panel.directionDefault");
            if (eff.presetSubtype === undefined)
                defaultOpt.selected = true;
            dirSel.appendChild(defaultOpt);
            for (const d of dirOptions) {
                const o = doc.createElement("option");
                o.value = String(d.value);
                o.textContent = d.label;
                if (eff.presetSubtype === d.value)
                    o.selected = true;
                dirSel.appendChild(o);
            }
            dirSel.addEventListener("change", () => {
                const raw = dirSel.value;
                const v = raw === "" ? 0 : Number(raw);
                opts.stack.execute(new SetAnimEffectPropCmd(slideIdx, eff.path, { presetSubtype: v }));
                refresh();
            });
            inspector.appendChild(row(t("anim.panel.field.direction"), dirSel));
        }
        // ── 时序选项
        inspector.appendChild(section(t("anim.panel.section.timing")));
        const trigSel = doc.createElement("select");
        trigSel.style.cssText = inputStyle;
        const trigChoices = [
            "onClick",
            "withPrevious",
            "afterPrevious",
            "onShapeClick",
            "onShapeDblClick",
            "onShapeHover",
            "onShapeMouseOut",
            "onPrev",
            "onNext",
        ];
        if (!trigChoices.includes(eff.trigger))
            trigChoices.unshift(eff.trigger);
        for (const tr of trigChoices) {
            const o = doc.createElement("option");
            o.value = tr;
            o.textContent = triggerLabel(tr);
            if (eff.trigger === tr)
                o.selected = true;
            trigSel.appendChild(o);
        }
        trigSel.addEventListener("change", () => {
            opts.stack.execute(new SetAnimEffectPropCmd(slideIdx, eff.path, { trigger: trigSel.value }));
            refresh();
        });
        inspector.appendChild(row(t("anim.panel.field.trigger"), trigSel));
        const durInp = doc.createElement("input");
        durInp.type = "number";
        durInp.min = "0";
        durInp.step = "100";
        durInp.value = String(eff.durationMs);
        durInp.style.cssText = inputStyle;
        durInp.addEventListener("change", () => {
            const v = Number(durInp.value);
            if (Number.isFinite(v) && v >= 0)
                opts.stack.execute(new SetAnimEffectPropCmd(slideIdx, eff.path, { durationMs: v }));
            refresh();
        });
        inspector.appendChild(row(t("anim.panel.field.durationMs"), durInp));
        const delayInp = doc.createElement("input");
        delayInp.type = "number";
        delayInp.min = "0";
        delayInp.step = "100";
        delayInp.value = String(eff.delayMs);
        delayInp.style.cssText = inputStyle;
        delayInp.addEventListener("change", () => {
            const v = Number(delayInp.value);
            if (Number.isFinite(v) && v >= 0)
                opts.stack.execute(new SetAnimEffectPropCmd(slideIdx, eff.path, { delayMs: v }));
            refresh();
        });
        inspector.appendChild(row(t("anim.panel.field.delayMs"), delayInp));
        const spdSel = doc.createElement("select");
        spdSel.style.cssText = inputStyle;
        const currentSpd = speedValueFor(eff.spd);
        for (const s of speedOptions()) {
            const o = doc.createElement("option");
            o.value = s.value;
            o.textContent = s.label;
            if (currentSpd === s.value)
                o.selected = true;
            spdSel.appendChild(o);
        }
        spdSel.addEventListener("change", () => {
            opts.stack.execute(new SetAnimEffectPropCmd(slideIdx, eff.path, { spd: spdSel.value }));
            refresh();
        });
        inspector.appendChild(row(t("anim.panel.field.speed"), spdSel));
        // ── 平滑（accel/decel）
        inspector.appendChild(section(t("anim.panel.section.smoothing")));
        const mkPctInput = (initialPct, onCommit) => {
            const inp = doc.createElement("input");
            inp.type = "number";
            inp.min = "0";
            inp.max = "100";
            inp.step = "5";
            inp.value = String(initialPct);
            inp.style.cssText = inputStyle;
            inp.addEventListener("change", () => {
                const raw = Number(inp.value);
                if (!Number.isFinite(raw))
                    return;
                const clamped = Math.max(0, Math.min(100, raw));
                onCommit(clamped);
            });
            return inp;
        };
        // accel/decel 在 OOXML 中以 1000=1% 存储；UI 用 0..100 整数（PowerPoint UI 同款）。
        const accelPct = eff.accel !== undefined ? Math.round(eff.accel / 1000) : 0;
        const accelInp = mkPctInput(accelPct, (pct) => {
            opts.stack.execute(new SetAnimEffectPropCmd(slideIdx, eff.path, { accel: pct * 1000 }));
            refresh();
        });
        inspector.appendChild(row(t("anim.panel.field.smoothStart"), accelInp));
        const decelPct = eff.decel !== undefined ? Math.round(eff.decel / 1000) : 0;
        const decelInp = mkPctInput(decelPct, (pct) => {
            opts.stack.execute(new SetAnimEffectPropCmd(slideIdx, eff.path, { decel: pct * 1000 }));
            refresh();
        });
        inspector.appendChild(row(t("anim.panel.field.smoothEnd"), decelInp));
        // ── 重复
        inspector.appendChild(section(t("anim.panel.section.repeat")));
        const iterInp = doc.createElement("input");
        iterInp.type = "number";
        iterInp.min = "1";
        iterInp.step = "1";
        iterInp.value = String(eff.iterations);
        iterInp.style.cssText = inputStyle;
        iterInp.addEventListener("change", () => {
            const v = Number(iterInp.value);
            if (Number.isFinite(v) && v >= 1)
                opts.stack.execute(new SetAnimEffectPropCmd(slideIdx, eff.path, { iterations: v }));
            refresh();
        });
        inspector.appendChild(row(t("anim.panel.field.repeatCount"), iterInp));
        const revLab = doc.createElement("label");
        revLab.style.cssText = "display:flex;align-items:center;gap:6px;font-size:11px;cursor:pointer;";
        const revInp = doc.createElement("input");
        revInp.type = "checkbox";
        revInp.checked = eff.autoReverse;
        revInp.addEventListener("change", () => {
            opts.stack.execute(new SetAnimEffectPropCmd(slideIdx, eff.path, { autoReverse: revInp.checked }));
            refresh();
        });
        revLab.appendChild(revInp);
        revLab.append(t("anim.panel.autoReverse"));
        inspector.appendChild(row(t("anim.panel.field.reverse"), revLab));
        const delBtn = doc.createElement("button");
        delBtn.textContent = t("anim.panel.delete");
        delBtn.style.cssText = "width:100%;margin-top:8px;background:var(--destructive);color:var(--destructive-foreground);border:none;padding:4px 8px;border-radius:var(--radius-sm,6px);cursor:pointer;font-size:11px;";
        delBtn.addEventListener("click", () => {
            opts.stack.execute(new RemoveAnimEffectCmd(slideIdx, eff.path));
            setSelectedEffectId(null);
            showToast(t("anim.panel.toast.removed"));
            refresh();
        });
        inspector.appendChild(delBtn);
    };
    const syncPaintBtn = () => {
        if (!paintBtn)
            return;
        const on = opts.animationPainterOn?.() ?? false;
        paintBtn.setAttribute("aria-pressed", on ? "true" : "false");
        paintBtn.style.background = on ? "var(--accent)" : "var(--secondary)";
        paintBtn.style.color = "var(--foreground)";
    };
    const refresh = () => {
        syncPaintBtn();
        const currentIdx = opts.currentSlide();
        // 切换 slide 时清掉跨 slide 残留的选中 effect 与未关闭的 picker。
        if (lastSlideIdx !== -1 && lastSlideIdx !== currentIdx) {
            if (selectedEffectId !== null) {
                selectedEffectId = null;
                opts.onSelectEffect?.(null);
            }
            closePicker();
        }
        lastSlideIdx = currentIdx;
        const slide = opts.pres.slides[currentIdx];
        effects = buildEffectList(slide?.ooxmlTiming);
        while (list.firstChild)
            list.removeChild(list.firstChild);
        if (effects.length === 0) {
            const empty = doc.createElement("div");
            empty.style.cssText = "color:var(--muted-foreground);padding:12px;text-align:center;font-size:11px;";
            empty.textContent = t("anim.panel.empty");
            list.appendChild(empty);
            renderInspector(undefined);
            return;
        }
        let selectedFound;
        effects.forEach((eff, idx) => {
            const row = doc.createElement("div");
            const isSel = eff.id === selectedEffectId;
            row.style.cssText =
                "display:flex;align-items:center;gap:6px;padding:6px 8px;background:" +
                    (isSel ? "var(--accent)" : "var(--secondary)") +
                    ";border:1px solid " + (isSel ? "var(--ring)" : "var(--border)") + ";border-radius:var(--radius-sm,6px);cursor:pointer;";
            const seq = doc.createElement("span");
            seq.style.cssText = "color:var(--muted-foreground);font-size:10px;min-width:14px;";
            seq.textContent = String(idx + 1);
            const badge = doc.createElement("span");
            badge.textContent = classBadge(eff.presetClass);
            badge.style.cssText = `display:inline-block;width:18px;height:18px;line-height:18px;text-align:center;background:${CLASS_COLOR[eff.presetClass] ?? "#555"};color:#fff;border-radius:3px;font-size:10px;`;
            const trig = doc.createElement("span");
            trig.title = triggerLabel(eff.trigger);
            trig.style.cssText = "color:var(--muted-foreground);width:14px;display:inline-flex;align-items:center;justify-content:center;";
            appendLucideIcon(doc, trig, trigLucideIcon(eff.trigger), 10);
            const name = doc.createElement("span");
            name.style.cssText = "flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;";
            name.textContent = `${presetNameFor(eff.presetClass, eff.presetId)} · ${eff.targetShapeId}`;
            const upBtn = miniBtn(doc, "chevron-up", t("anim.panel.row.moveUp"));
            upBtn.addEventListener("click", (ev) => {
                ev.stopPropagation();
                if (idx === 0) {
                    showToast(t("anim.panel.toast.atTop"));
                    return;
                }
                opts.stack.execute(new MoveAnimEffectCmd(opts.currentSlide(), eff.path, idx - 1));
                showToast(t("anim.panel.toast.movedUp"));
                refresh();
            });
            const dnBtn = miniBtn(doc, "chevron-down", t("anim.panel.row.moveDown"));
            dnBtn.addEventListener("click", (ev) => {
                ev.stopPropagation();
                if (idx === effects.length - 1) {
                    showToast(t("anim.panel.toast.atBottom"));
                    return;
                }
                opts.stack.execute(new MoveAnimEffectCmd(opts.currentSlide(), eff.path, idx + 1));
                showToast(t("anim.panel.toast.movedDown"));
                refresh();
            });
            const xBtn = miniBtn(doc, "x", t("anim.panel.row.remove"));
            xBtn.addEventListener("click", (ev) => {
                ev.stopPropagation();
                opts.stack.execute(new RemoveAnimEffectCmd(opts.currentSlide(), eff.path));
                if (selectedEffectId === eff.id)
                    setSelectedEffectId(null);
                showToast(t("anim.panel.toast.removed"));
                refresh();
            });
            row.append(seq, badge, trig, name, upBtn, dnBtn, xBtn);
            row.addEventListener("click", () => {
                // 二次点击同一行 = 反选。
                if (selectedEffectId === eff.id) {
                    setSelectedEffectId(null);
                }
                else {
                    setSelectedEffectId(eff.id);
                }
                refresh();
            });
            list.appendChild(row);
            if (isSel)
                selectedFound = eff;
        });
        renderInspector(selectedFound);
    };
    // 外部（如 timeline）告知选择变化时调用；不再触发反向 selectShape，避免环。
    const selectEffectFromExternal = (id) => {
        if (selectedEffectId === id)
            return;
        selectedEffectId = id;
        refresh();
    };
    refresh();
    const unsub = opts.stack.subscribe(() => refresh());
    return {
        el,
        destroy() {
            unsub();
            closePicker();
            if (toastTimer)
                clearTimeout(toastTimer);
            el.remove();
        },
        refresh,
        openAddPicker: openPicker,
        selectEffect: selectEffectFromExternal,
        getSelectedId: () => selectedEffectId,
    };
}
function miniBtn(doc, iconName, title) {
    const b = mkLucideIconButton(doc, iconName, "", title, 12);
    b.style.cssText =
        "background:var(--secondary);color:var(--foreground);border:1px solid var(--border);border-radius:var(--radius-sm,6px);" +
            "padding:0;width:22px;height:22px;cursor:pointer;line-height:1;" +
            "display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto;";
    b.addEventListener("mouseenter", () => {
        b.style.background = "var(--accent)";
        b.style.color = "var(--foreground)";
    });
    b.addEventListener("mouseleave", () => {
        b.style.background = "var(--secondary)";
        b.style.color = "var(--foreground)";
    });
    return b;
}
function trigLucideIcon(t) {
    if (t === "onClick")
        return "mouse-pointer-click";
    if (t === "withPrevious")
        return "equal";
    if (t === "afterPrevious")
        return "corner-down-right";
    if (t === "onShapeClick" || t === "onShapeDblClick")
        return "circle-dot";
    if (t === "onShapeHover" || t === "onShapeMouseOut")
        return "mouse-pointer";
    if (t === "onPrev" || t === "onNext")
        return "corner-down-right";
    return "circle";
}
