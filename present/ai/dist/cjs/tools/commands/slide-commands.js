"use strict";
// AI 修改对话用的额外 EditCommand：覆盖现有 editor commands 没有的"幻灯片级"操作。
//
// 幻灯片列表增删改重排已统一到 @sliiu/present-editor slide-commands（与 playground 共用 undo 栈）。
// 本文件保留 AI 专属：主题应用、从 spec 建页、重命名、ReplaceText 等。
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReplaceTextCmd = exports.SetSlideNotesCmd = exports.SetSlideNameCmd = exports.CreateSlideFromSpecCmd = exports.MoveSlideCmd = exports.InsertSlideCmd = exports.DuplicateSlideCmd = exports.DeleteSlidesCmd = exports.DeleteSlideCmd = exports.ApplyThemeCmd = exports.ApplyCustomThemeCmd = void 0;
const commands_1 = require("@sliiu/present-editor/commands");
const layouts_1 = require("../../generate/compile/layouts");
const themes_1 = require("../../themes");
var themes_2 = require("@sliiu/present-themes");
Object.defineProperty(exports, "ApplyCustomThemeCmd", { enumerable: true, get: function () { return themes_2.ApplyCustomThemeCmd; } });
Object.defineProperty(exports, "ApplyThemeCmd", { enumerable: true, get: function () { return themes_2.ApplyThemeCmd; } });
var commands_2 = require("@sliiu/present-editor/commands");
Object.defineProperty(exports, "DeleteSlideCmd", { enumerable: true, get: function () { return commands_2.DeleteSlideCmd; } });
Object.defineProperty(exports, "DeleteSlidesCmd", { enumerable: true, get: function () { return commands_2.DeleteSlidesCmd; } });
Object.defineProperty(exports, "DuplicateSlideCmd", { enumerable: true, get: function () { return commands_2.DuplicateSlideCmd; } });
Object.defineProperty(exports, "InsertSlideCmd", { enumerable: true, get: function () { return commands_2.InsertSlideCmd; } });
Object.defineProperty(exports, "MoveSlideCmd", { enumerable: true, get: function () { return commands_2.MoveSlideCmd; } });
function blankLayer() {
    return { id: `layer_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`, name: "Main", visible: true, locked: false, shapes: [] };
}
// 通过 layout + theme 生成一张新 slide。AI tool "createSlide" 落到此命令。
class CreateSlideFromSpecCmd {
    idx;
    spec;
    themeId;
    label = "AI: Create slide";
    inserted;
    constructor(idx, spec, themeId) {
        this.idx = idx;
        this.spec = spec;
        this.themeId = themeId;
    }
    apply(pres) {
        const theme = (0, themes_1.getTheme)(this.themeId ?? pres.theme?.id);
        const layout = (0, layouts_1.renderLayout)(this.spec, pres.size, theme);
        // 背景优先级同 compile.ts：layout 显式 > theme.backgroundPaint > solid(theme.palette.bg)。
        const background = layout.background ?? theme.backgroundPaint ?? { kind: "solid", color: theme.palette.bg };
        const slide = {
            id: (0, commands_1.newSlideId)(),
            name: titleOfSpec(this.spec),
            index: 0,
            background,
            layers: [{ ...blankLayer(), shapes: layout.shapes }],
        };
        const at = Math.max(0, Math.min(this.idx, pres.slides.length));
        pres.slides.splice(at, 0, slide);
        this.inserted = { idx: at, slide };
        (0, commands_1.reindexPresentationSlides)(pres);
    }
    revert(pres) {
        if (!this.inserted)
            return;
        const cur = pres.slides.indexOf(this.inserted.slide);
        if (cur >= 0)
            pres.slides.splice(cur, 1);
        (0, commands_1.reindexPresentationSlides)(pres);
    }
}
exports.CreateSlideFromSpecCmd = CreateSlideFromSpecCmd;
function titleOfSpec(spec) {
    if ("title" in spec && spec.title)
        return spec.title;
    if (spec.kind === "quote")
        return spec.quote.slice(0, 24);
    return spec.kind;
}
// 设置幻灯片名称（用于左侧缩略图列表显示和大纲）。
class SetSlideNameCmd {
    idx;
    next;
    label = "AI: Rename slide";
    prev;
    constructor(idx, next) {
        this.idx = idx;
        this.next = next;
    }
    apply(pres) {
        const s = pres.slides[this.idx];
        if (!s)
            return;
        this.prev = s.name;
        s.name = this.next;
    }
    revert(pres) {
        const s = pres.slides[this.idx];
        if (!s || this.prev === undefined)
            return;
        s.name = this.prev;
    }
}
exports.SetSlideNameCmd = SetSlideNameCmd;
// 设置 slide.notes（讲稿）。
class SetSlideNotesCmd {
    idx;
    next;
    label = "AI: Set notes";
    prev;
    constructor(idx, next) {
        this.idx = idx;
        this.next = next;
    }
    apply(pres) {
        const s = pres.slides[this.idx];
        if (!s)
            return;
        this.prev = s.notes;
        s.notes = this.next;
    }
    revert(pres) {
        const s = pres.slides[this.idx];
        if (!s)
            return;
        s.notes = this.prev;
    }
}
exports.SetSlideNotesCmd = SetSlideNotesCmd;
// 替换某 text shape 的全部段落（用 plain text，每行一段，沿用旧的第一个 run 样式）。
// 类似 EditTextCmd，但接受多段输入；本身和 EditTextCmd 是兼容的（EditTextCmd 也接受 string[]）。
// 这里独立一个轻量版本，仅在 AI tools 内部使用，避免循环依赖 editor。
class ReplaceTextCmd {
    slideIdx;
    shapeId;
    next;
    label = "AI: Replace text";
    prev;
    constructor(slideIdx, shapeId, next) {
        this.slideIdx = slideIdx;
        this.shapeId = shapeId;
        this.next = next;
    }
    apply(pres) {
        const text = findTextShape(pres, this.slideIdx, this.shapeId);
        if (!text)
            return;
        this.prev = text.paragraphs.map((p) => clone(p));
        const baseRun = text.paragraphs[0]?.runs[0] ?? { text: "" };
        const baseParaShape = (() => {
            if (!text.paragraphs[0])
                return {};
            const { runs: _drop, ...rest } = clone(text.paragraphs[0]);
            return rest;
        })();
        text.paragraphs = this.next.map((line) => ({
            ...clone(baseParaShape),
            runs: [{ ...clone(baseRun), text: line }],
        }));
    }
    revert(pres) {
        const text = findTextShape(pres, this.slideIdx, this.shapeId);
        if (!text || !this.prev)
            return;
        text.paragraphs = this.prev.map((p) => clone(p));
    }
}
exports.ReplaceTextCmd = ReplaceTextCmd;
function clone(v) {
    return JSON.parse(JSON.stringify(v));
}
function findTextShape(pres, slideIdx, id) {
    const slide = pres.slides[slideIdx];
    if (!slide)
        return undefined;
    for (const layer of slide.layers) {
        for (const s of layer.shapes) {
            const found = walkText(s, id);
            if (found)
                return found;
        }
    }
    return undefined;
}
function walkText(s, id) {
    if (s.id === id && s.kind === "text")
        return s;
    if (s.kind === "group") {
        for (const c of s.children) {
            const f = walkText(c, id);
            if (f)
                return f;
        }
    }
    return undefined;
}
