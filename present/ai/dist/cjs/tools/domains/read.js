"use strict";
// 只读工具：让 LLM "看清当前状态" —— tool-calling 成功的关键。
// 不进命令栈，直接读 pres。
Object.defineProperty(exports, "__esModule", { value: true });
exports.readTools = void 0;
const zod_1 = require("zod");
const core_1 = require("@sliiu/present-core");
const types_1 = require("../types");
const types_2 = require("../types");
const summaries_1 = require("../summaries");
exports.readTools = [
    (0, types_1.defineTool)({
        name: "getPresentationSummary",
        description: "Inspect the current presentation: returns slide count, size, theme, font embed status (`fonts.used` / `fonts.missing` / `fonts.embeddedFamilies`), protection (`protection.kind` / `protection.passwordRequired` / `protection.editingBlocked`), and per-slide overview. Each slide has `background` (kind only — default/solid/linear/radial/image/none) and `backgroundDetail` (kind + dominant color / image src / alpha) so you can evaluate text-vs-bg contrast for ripple-effect checks. Call this before any non-trivial change. If `fonts.missing` is non-empty and the user cares about portable export, follow up with embedFonts. If `protection.editingBlocked` is true, call unprotectPresentation before other mutations.",
        inputSchema: zod_1.z.object({}),
        tags: ["read"],
        execute: (rt) => {
            const pres = rt.getPres();
            return (0, types_2.ok)({
                slideCount: pres.slides.length,
                size: pres.size,
                themeId: pres.theme?.id,
                sections: pres.sections ?? [],
                comments: (pres.comments ?? []).map((c) => ({
                    id: c.id,
                    slideIndex: c.slideIndex,
                    author: c.author,
                    text: c.text,
                    resolved: c.resolved,
                    parentId: c.parentId,
                    x: c.x,
                    y: c.y,
                })),
                fonts: {
                    embedTrueTypeFonts: !!pres.options?.embedTrueTypeFonts,
                    used: (0, core_1.collectUsedTypefaces)(pres),
                    embeddedFamilies: [...new Set((pres.fonts ?? []).map((f) => f.family))],
                    missing: (0, core_1.collectUsedTypefaces)(pres).filter((f) => !(0, core_1.isTypefaceEmbedded)(pres, f)),
                },
                protection: (() => {
                    const current = (0, core_1.getPresentationProtection)(pres);
                    const office = (0, core_1.summarizeOfficeModifyVerifier)(pres.modifyVerifier);
                    return {
                        protected: current !== undefined,
                        kind: current?.kind ?? null,
                        setAt: current?.setAt ?? null,
                        passwordRequired: current ? (0, core_1.protectionRequiresPassword)(current, pres.modifyVerifier) : false,
                        editingBlocked: (0, core_1.isPresentationEditingBlocked)(pres),
                        officeNative: office ? { algorithm: office.algorithm, spinCount: office.spinCount } : null,
                    };
                })(),
                viewGuides: pres.viewGuides
                    ? {
                        showGuides: !!pres.viewGuides.showGuides,
                        snapToGrid: !!pres.viewGuides.snapToGrid,
                        snapToObjects: !!pres.viewGuides.snapToObjects,
                        slideGuideCount: pres.viewGuides.slide.length,
                    }
                    : null,
                showPr: pres.showPr ?? null,
                notesMasters: (pres.notesMasters ?? []).map((m) => ({ id: m.id, name: m.name, shapeCount: m.shapes.length })),
                handoutMasters: (pres.handoutMasters ?? []).map((m) => ({ id: m.id, name: m.name, shapeCount: m.shapes.length })),
                slides: pres.slides.map((s, i) => (0, summaries_1.slideSummary)(s, i)),
            });
        },
    }),
    (0, types_1.defineTool)({
        name: "listShapesOnSlide",
        description: "List all top-level shapes on a slide. Each shape includes id / kind / bbox / fill summary; text shapes additionally include the flattened text and a `style` object (representative color / fontSize / fontWeight / italic from the first non-empty run). Use this to evaluate ripple effects (e.g. whether existing text colors still meet contrast against a newly changed background).",
        inputSchema: zod_1.z.object({ slideIdx: zod_1.z.number().int().min(0) }),
        tags: ["read"],
        execute: (rt, { slideIdx }) => {
            const pres = rt.getPres();
            const slide = pres.slides[slideIdx];
            if (!slide)
                return (0, types_2.err)(`slideIdx ${slideIdx} out of range (have ${pres.slides.length})`);
            const shapes = slide.layers.flatMap((l) => l.shapes).map((s) => (0, summaries_1.shapeSummary)(s));
            return (0, types_2.ok)({ slideIdx, shapes });
        },
    }),
];
