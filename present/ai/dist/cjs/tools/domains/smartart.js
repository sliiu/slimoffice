"use strict";
// SmartArt：把文本框转成图示，并编辑条目 / 层级 / 版式。
//
// 组 id 来自 listShapesOnSlide（kind=group 且带 smartArt 摘要）。
// 条目级命令需要当前 items 快照 —— 工具内部先 extract 再 apply。
Object.defineProperty(exports, "__esModule", { value: true });
exports.smartArtTools = void 0;
const zod_1 = require("zod");
const core_1 = require("@sliiu/present-core");
const commands_1 = require("@sliiu/present-editor/commands");
const types_1 = require("../types");
const summaries_1 = require("../summaries");
const layoutEnum = zod_1.z.enum(core_1.SMARTART_LAYOUT_KINDS);
function smartArtState(rt, slideIdx, groupId) {
    const slide = rt.getPres().slides[slideIdx];
    if (!slide)
        return { ok: false, error: `slideIdx ${slideIdx} out of range` };
    const g = (0, summaries_1.findShapeDeep)(slide, groupId);
    if (!g || g.kind !== "group" || !g.smartArtMeta) {
        return {
            ok: false,
            error: `shape ${groupId} is not a SmartArt group — convertToSmartArt first or pick a group with smartArt in listShapesOnSlide`,
        };
    }
    return { ok: true, group: g, items: (0, core_1.extractSmartArtItems)(g), layout: g.smartArtMeta.layout };
}
exports.smartArtTools = [
    (0, types_1.defineTool)({
        name: "convertToSmartArt",
        description: "Convert a text box (including bullets / levels) into a SmartArt group. The original text shape is replaced. Layouts: list / horizontalList / process / processVertical / chevron / cycle / hierarchy / orgChart / matrix / timeline. Returns the new groupId — do not list shapes afterwards.",
        inputSchema: zod_1.z.object({
            slideIdx: zod_1.z.number().int().min(0),
            shapeId: zod_1.z.string(),
            layout: layoutEnum.optional(),
        }),
        tags: ["mutate", "shape"],
        shapeScoped: true,
        execute: (rt, { slideIdx, shapeId, layout }) => {
            const slide = rt.getPres().slides[slideIdx];
            if (!slide)
                return (0, types_1.err)(`slideIdx ${slideIdx} out of range`);
            const before = new Set(slide.layers.flatMap((l) => l.shapes).filter((s) => s.kind === "group" && s.smartArtMeta).map((s) => s.id));
            const res = rt.apply(new commands_1.ConvertToSmartArtCmd(slideIdx, shapeId, layout));
            if (!res.ok)
                return res;
            const added = rt
                .getPres()
                .slides[slideIdx]?.layers.flatMap((l) => l.shapes)
                .find((s) => s.kind === "group" && s.smartArtMeta && !before.has(s.id));
            return (0, types_1.ok)({ slideIdx, groupId: added?.id, replacedShapeId: shapeId });
        },
    }),
    (0, types_1.defineTool)({
        name: "listSmartArtItems",
        description: "Read the current SmartArt items (id / text / lvl / imageSrc) and layout for a SmartArt group.",
        inputSchema: zod_1.z.object({
            slideIdx: zod_1.z.number().int().min(0),
            groupId: zod_1.z.string(),
        }),
        tags: ["read", "shape"],
        shapeScoped: true,
        execute: (rt, { slideIdx, groupId }) => {
            const state = smartArtState(rt, slideIdx, groupId);
            if (!state.ok)
                return (0, types_1.err)(state.error);
            return (0, types_1.ok)({ groupId, layout: state.layout, items: state.items });
        },
    }),
    (0, types_1.defineTool)({
        name: "setSmartArtItems",
        description: "Replace ALL SmartArt items. Each item: { id, text, lvl?, imageSrc? }. lvl 0 = top level; 1+ = nested (hierarchy / orgChart). Keep existing ids when editing text so sibling commands stay stable.",
        inputSchema: zod_1.z.object({
            slideIdx: zod_1.z.number().int().min(0),
            groupId: zod_1.z.string(),
            items: zod_1.z.array(zod_1.z.object({
                id: zod_1.z.string(),
                text: zod_1.z.string(),
                lvl: zod_1.z.number().int().min(0).max(8).optional(),
                imageSrc: zod_1.z.string().optional(),
            })).min(1),
        }),
        tags: ["mutate", "shape"],
        shapeScoped: true,
        execute: (rt, { slideIdx, groupId, items }) => {
            const state = smartArtState(rt, slideIdx, groupId);
            if (!state.ok)
                return (0, types_1.err)(state.error);
            return rt.apply(new commands_1.UpdateSmartArtItemsCmd(slideIdx, groupId, items, state.items));
        },
    }),
    (0, types_1.defineTool)({
        name: "addSmartArtItem",
        description: "Append a new item to a SmartArt group (default label 'Item N').",
        inputSchema: zod_1.z.object({
            slideIdx: zod_1.z.number().int().min(0),
            groupId: zod_1.z.string(),
        }),
        tags: ["mutate", "shape"],
        shapeScoped: true,
        execute: (rt, { slideIdx, groupId }) => {
            const state = smartArtState(rt, slideIdx, groupId);
            if (!state.ok)
                return (0, types_1.err)(state.error);
            return rt.apply(new commands_1.AddSmartArtItemCmd(slideIdx, groupId, state.items));
        },
    }),
    (0, types_1.defineTool)({
        name: "duplicateSmartArtItem",
        description: "Duplicate a SmartArt item by 0-based index; the copy is inserted immediately after.",
        inputSchema: zod_1.z.object({
            slideIdx: zod_1.z.number().int().min(0),
            groupId: zod_1.z.string(),
            itemIndex: zod_1.z.number().int().min(0),
        }),
        tags: ["mutate", "shape"],
        shapeScoped: true,
        execute: (rt, { slideIdx, groupId, itemIndex }) => {
            const state = smartArtState(rt, slideIdx, groupId);
            if (!state.ok)
                return (0, types_1.err)(state.error);
            return rt.apply(new commands_1.DuplicateSmartArtItemCmd(slideIdx, groupId, itemIndex, state.items));
        },
    }),
    (0, types_1.defineTool)({
        name: "removeSmartArtItem",
        description: "Remove a SmartArt item by 0-based index (defaults to the last item). The group must keep at least one item.",
        inputSchema: zod_1.z.object({
            slideIdx: zod_1.z.number().int().min(0),
            groupId: zod_1.z.string(),
            itemIndex: zod_1.z.number().int().min(0).optional(),
        }),
        tags: ["mutate", "shape"],
        shapeScoped: true,
        execute: (rt, { slideIdx, groupId, itemIndex }) => {
            const state = smartArtState(rt, slideIdx, groupId);
            if (!state.ok)
                return (0, types_1.err)(state.error);
            return rt.apply(new commands_1.RemoveSmartArtItemCmd(slideIdx, groupId, state.items, itemIndex));
        },
    }),
    (0, types_1.defineTool)({
        name: "moveSmartArtItem",
        description: "Swap a SmartArt item with its neighbor. direction -1 = earlier, 1 = later.",
        inputSchema: zod_1.z.object({
            slideIdx: zod_1.z.number().int().min(0),
            groupId: zod_1.z.string(),
            itemIndex: zod_1.z.number().int().min(0),
            direction: zod_1.z.union([zod_1.z.literal(-1), zod_1.z.literal(1)]),
        }),
        tags: ["mutate", "shape"],
        shapeScoped: true,
        execute: (rt, { slideIdx, groupId, itemIndex, direction }) => {
            const state = smartArtState(rt, slideIdx, groupId);
            if (!state.ok)
                return (0, types_1.err)(state.error);
            return rt.apply(new commands_1.MoveSmartArtItemCmd(slideIdx, groupId, itemIndex, direction, state.items));
        },
    }),
    (0, types_1.defineTool)({
        name: "setSmartArtItemLevel",
        description: "Promote / demote a SmartArt item (hierarchy / orgChart). delta -1 = promote (shallower), 1 = demote (deeper). Floor is lvl 0.",
        inputSchema: zod_1.z.object({
            slideIdx: zod_1.z.number().int().min(0),
            groupId: zod_1.z.string(),
            itemIndex: zod_1.z.number().int().min(0),
            delta: zod_1.z.union([zod_1.z.literal(-1), zod_1.z.literal(1)]),
        }),
        tags: ["mutate", "shape"],
        shapeScoped: true,
        execute: (rt, { slideIdx, groupId, itemIndex, delta }) => {
            const state = smartArtState(rt, slideIdx, groupId);
            if (!state.ok)
                return (0, types_1.err)(state.error);
            return rt.apply(new commands_1.SetSmartArtItemLevelCmd(slideIdx, groupId, itemIndex, delta, state.items));
        },
    }),
    (0, types_1.defineTool)({
        name: "setSmartArtLayout",
        description: "Switch the SmartArt diagram layout (list / process / cycle / hierarchy / orgChart / matrix / timeline / …). Items are preserved.",
        inputSchema: zod_1.z.object({
            slideIdx: zod_1.z.number().int().min(0),
            groupId: zod_1.z.string(),
            layout: layoutEnum,
        }),
        tags: ["mutate", "shape"],
        shapeScoped: true,
        execute: (rt, { slideIdx, groupId, layout }) => {
            const state = smartArtState(rt, slideIdx, groupId);
            if (!state.ok)
                return (0, types_1.err)(state.error);
            return rt.apply(new commands_1.SetSmartArtLayoutCmd(slideIdx, groupId, layout, state.layout, state.items));
        },
    }),
    (0, types_1.defineTool)({
        name: "clearSmartArtPictures",
        description: "Remove picture accents (imageSrc) from every SmartArt item. Use on pictureAccent layouts after a style reset.",
        inputSchema: zod_1.z.object({
            slideIdx: zod_1.z.number().int().min(0),
            groupId: zod_1.z.string(),
        }),
        tags: ["mutate", "shape"],
        shapeScoped: true,
        execute: (rt, { slideIdx, groupId }) => {
            const state = smartArtState(rt, slideIdx, groupId);
            if (!state.ok)
                return (0, types_1.err)(state.error);
            return rt.apply(new commands_1.ClearSmartArtPicturesCmd(slideIdx, groupId, state.items));
        },
    }),
];
