"use strict";
// 预设选择器 - 按入场/强调/退出/路径分类
// 数据来自 @sliiu/present-animation 中的 PRESET_TABLE。
Object.defineProperty(exports, "__esModule", { value: true });
exports.listPresetsByClass = listPresetsByClass;
exports.mountPresetPicker = mountPresetPicker;
const animation_1 = require("@sliiu/present-animation");
const i18n_1 = require("../i18n");
const preset_labels_1 = require("./preset-labels");
function listPresetsByClass(classKey) {
    const items = animation_1.ooxml.listPresets(classKey);
    return items.map((p) => ({
        classKey: classKey,
        presetId: p.id,
        presetIds: p.ids,
        name: p.name,
        supportsSubtype: !!p.supportsSubtype,
    }));
}
const ALL_CLASSES = ["entr", "emph", "exit", "path"];
function mountPresetPicker(doc, onPick) {
    const el = doc.createElement("div");
    el.className = "ppt-preset-picker ppt-scroll";
    el.style.cssText =
        "display:flex;flex-direction:column;gap:6px;padding:8px;background:var(--popover);color:var(--foreground);border-radius:6px;max-height:60vh;overflow:auto;font:12px ui-sans-serif,system-ui,sans-serif;";
    const searchRow = doc.createElement("div");
    searchRow.style.cssText = "display:flex;gap:6px;align-items:center;padding-bottom:4px;border-bottom:1px solid var(--border)";
    const searchInput = doc.createElement("input");
    searchInput.type = "search";
    searchInput.placeholder = (0, i18n_1.t)("anim.picker.search");
    searchInput.style.cssText =
        "flex:1;background:var(--secondary);color:var(--foreground);border:1px solid var(--border);border-radius:3px;padding:4px 8px;font:inherit;min-width:0";
    searchRow.appendChild(searchInput);
    el.appendChild(searchRow);
    const tabs = doc.createElement("div");
    tabs.style.cssText = "display:flex;gap:4px;border-bottom:1px solid var(--border);padding-bottom:4px;";
    const list = doc.createElement("div");
    list.style.cssText = "display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:4px;padding-top:4px;";
    el.appendChild(tabs);
    el.appendChild(list);
    let current = "entr";
    // 用函数动态读 t()，保证后续 setLocale 切换后下次 mount picker 立即生效。
    const labelOf = (cls) => {
        switch (cls) {
            case "entr": return (0, i18n_1.t)("anim.class.entr.full");
            case "emph": return (0, i18n_1.t)("anim.class.emph.full");
            case "exit": return (0, i18n_1.t)("anim.class.exit.full");
            case "path": return (0, i18n_1.t)("anim.class.path.full");
        }
    };
    const refresh = () => {
        while (list.firstChild)
            list.removeChild(list.firstChild);
        const q = searchInput.value.trim().toLowerCase();
        for (const p of listPresetsByClass(current)) {
            const label = (0, preset_labels_1.presetDisplayName)(current, p.presetId, p.name);
            if (q &&
                !label.toLowerCase().includes(q) &&
                !p.name.toLowerCase().includes(q) &&
                !String(p.presetId).includes(q))
                continue;
            const btn = doc.createElement("button");
            btn.textContent = label;
            btn.title = `${labelOf(current)}/${label} (id=${p.presetId})`;
            btn.style.cssText =
                "background:var(--secondary);color:var(--foreground);border:1px solid var(--border);padding:6px 8px;border-radius:4px;text-align:left;cursor:pointer;font-size:11px;line-height:1.3;";
            btn.addEventListener("mouseenter", () => (btn.style.background = "var(--accent)"));
            btn.addEventListener("mouseleave", () => (btn.style.background = "var(--secondary)"));
            btn.addEventListener("click", () => onPick(p));
            list.appendChild(btn);
        }
    };
    searchInput.addEventListener("input", () => refresh());
    for (const cls of ALL_CLASSES) {
        const tabBtn = doc.createElement("button");
        tabBtn.textContent = labelOf(cls);
        tabBtn.style.cssText =
            "background:transparent;color:var(--muted-foreground);border:none;padding:4px 10px;border-radius:3px;cursor:pointer;font-size:12px;";
        tabBtn.addEventListener("click", () => {
            current = cls;
            for (const c of tabs.children) {
                c.style.background = "transparent";
                c.style.color = "var(--muted-foreground)";
            }
            tabBtn.style.background = "var(--border)";
            tabBtn.style.color = "var(--foreground)";
            refresh();
        });
        tabs.appendChild(tabBtn);
    }
    tabs.firstChild.style.background = "var(--border)";
    tabs.firstChild.style.color = "var(--foreground)";
    refresh();
    return {
        el,
        destroy: () => {
            el.remove();
        },
    };
}
