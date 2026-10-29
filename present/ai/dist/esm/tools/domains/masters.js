// 阶段 2.4：母版 / 版式 AI 工具集。
//
// 给模型四类能力：
//   - 只读：list_masters_and_layouts —— 让模型在决策"改哪里"前看清结构
//   - 切版式：set_slide_layout —— 把某 slide 改用另一 layout（最高频的"换模板"需求）
//   - 改样式：edit_master_text_style —— 改某 master 的 title/body/other 默认文字样式
//   - 改母版形状：edit_master_shape —— 母版/版式上某个具体 shape 的 bbox/fill/text 调整
//
// 设计约束：所有 mutate 都走 EditCommand，保证可 undo。LLM 不允许直接构造 Shape 对象。
// 增删 layout / 复制 master / 改 placeholder 类型已暴露；不要凭空造一整棵 master 树。
import { z } from "zod";
import { AddLayoutCmd, DeleteLayoutCmd, DuplicateMasterCmd, RenameLayoutCmd, SetBackgroundTargetCmd, SetFillCmd, SetMasterTxStylesCmd, SetPlaceholderTypeCmd, SetShapeBboxCmd, SetSlideLayoutRefCmd, SetTextStyleCmd, genShapeId, layoutTarget, masterTarget, notesMasterTarget, handoutMasterTarget, } from "@sliiu/present-editor/commands";
import { defineTool, ok, err } from "../types.js";
const masterPaintSchema = z.discriminatedUnion("kind", [
    z.object({
        kind: z.literal("solid"),
        color: z.string().regex(/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/),
        alpha: z.number().min(0).max(1).optional(),
    }),
    z.object({
        kind: z.literal("linear"),
        angle: z.number().min(0).max(360),
        stops: z
            .array(z.object({
            offset: z.number().min(0).max(1),
            color: z.string().regex(/^#[0-9a-fA-F]{6,8}$/),
            alpha: z.number().min(0).max(1).optional(),
        }))
            .min(2)
            .max(6),
    }),
    z.object({
        kind: z.literal("radial"),
        stops: z
            .array(z.object({
            offset: z.number().min(0).max(1),
            color: z.string().regex(/^#[0-9a-fA-F]{6,8}$/),
            alpha: z.number().min(0).max(1).optional(),
        }))
            .min(2)
            .max(6),
    }),
    z.object({
        kind: z.literal("image"),
        src: z.string(),
        fit: z.enum(["fill", "contain", "cover", "tile"]).optional(),
        alpha: z.number().min(0).max(1).optional(),
    }),
    z.object({ kind: z.literal("none") }),
]);
function toPaint(p) {
    if (p.kind === "none")
        return undefined;
    return p;
}
function remintShapeIds(shape) {
    const next = { ...shape, id: genShapeId("layout") };
    if (next.kind === "group") {
        next.children = next.children.map(remintShapeIds);
    }
    return next;
}
export const masterTools = [
    defineTool({
        name: "list_masters_and_layouts",
        description: "List every slide master and its layouts in the deck (id, name, type, placeholders summary). Call BEFORE changing master-level theming or switching a slide's layout.",
        inputSchema: z.object({}),
        tags: ["read", "master"],
        execute: async (rt) => {
            const pres = rt.getPres();
            const masters = (pres.masters ?? []).map((m) => ({
                id: m.id,
                name: m.name,
                layoutCount: m.layouts?.length ?? 0,
                // 标记 master 上有哪些 placeholder type，让 LLM 决定"我想改的标题/正文样式"放在哪个 master。
                placeholderTypes: dedupe(m.shapes.map((s) => s.placeholder?.type).filter((x) => !!x)),
                layouts: (m.layouts ?? []).map((l) => ({
                    id: l.id,
                    name: l.name,
                    type: l.type,
                    placeholderTypes: dedupe(l.shapes.map((s) => s.placeholder?.type).filter((x) => !!x)),
                })),
            }));
            return ok({
                masters,
                notesMasters: (pres.notesMasters ?? []).map((m) => ({
                    id: m.id,
                    name: m.name,
                    shapeCount: m.shapes.length,
                    placeholderTypes: dedupe(m.shapes.map((s) => s.placeholder?.type).filter((x) => !!x)),
                })),
                handoutMasters: (pres.handoutMasters ?? []).map((m) => ({
                    id: m.id,
                    name: m.name,
                    shapeCount: m.shapes.length,
                    placeholderTypes: dedupe(m.shapes.map((s) => s.placeholder?.type).filter((x) => !!x)),
                })),
                slidesUsingLayouts: pres.slides.map((s, i) => ({
                    slideIdx: i,
                    layoutRef: s.layoutRef ?? null,
                })),
            });
        },
    }),
    defineTool({
        name: "set_slide_layout",
        description: [
            "Switch the layout used by a slide (changes only the master/layout reference — does not touch the slide's own shapes).",
            "Use list_masters_and_layouts first to discover available masterId / layoutId values.",
            "The slide's placeholders inherit fresh master defaults after the switch; non-placeholder shapes on the slide stay untouched.",
        ].join(" "),
        inputSchema: z.object({
            slideIdx: z.number().int().min(0),
            masterId: z.string(),
            layoutId: z.string(),
        }),
        tags: ["mutate", "master"],
        execute: async (rt, { slideIdx, masterId, layoutId }) => {
            const pres = rt.getPres();
            const master = pres.masters?.find((m) => m.id === masterId);
            if (!master)
                return err(`master "${masterId}" not found`);
            const layout = master.layouts?.find((l) => l.id === layoutId);
            if (!layout)
                return err(`layout "${layoutId}" not found under master "${masterId}"`);
            if (slideIdx >= pres.slides.length)
                return err(`slideIdx ${slideIdx} out of range`);
            return rt.apply(new SetSlideLayoutRefCmd(slideIdx, { masterId, layoutId }));
        },
    }),
    defineTool({
        name: "rename_layout",
        description: "Rename a slide layout under a given master.",
        inputSchema: z.object({
            masterId: z.string(),
            layoutId: z.string(),
            name: z.string().min(1).max(80),
        }),
        tags: ["mutate", "master"],
        execute: async (rt, { masterId, layoutId, name }) => rt.apply(new RenameLayoutCmd(masterId, layoutId, name)),
    }),
    defineTool({
        name: "edit_master_text_style",
        description: [
            "Patch a slide master's default text style for title / body / other at a given level (0=lvl1, 1=lvl2, ...).",
            "Affects every slide that inherits from this master — use for global typography (font family, size, color, bullet) instead of per-shape tweaks.",
            "Provide only the fields you want to change; existing levels are preserved.",
        ].join(" "),
        inputSchema: z.object({
            masterId: z.string(),
            scope: z.enum(["title", "body", "other"]),
            level: z.number().int().min(0).max(8).default(0),
            fontFamily: z.string().optional(),
            // 字号单位：屏幕 px（与编辑器内一致；与 OOXML 内 sz=pt*100 由 serializer 内部换算）。
            fontSize: z.number().min(6).max(200).optional(),
            fontWeight: z.number().int().min(100).max(900).optional(),
            italic: z.boolean().optional(),
            underline: z.boolean().optional(),
            color: z.string().regex(/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/).optional(),
            bullet: z
                .union([
                z.object({ kind: z.literal("none") }),
                z.object({ kind: z.literal("char"), char: z.string().min(1).max(4), fontFamily: z.string().optional() }),
                z.object({ kind: z.literal("auto"), scheme: z.string().min(1) }),
            ])
                .optional()
                .describe("Set/clear list bullet. Omit to leave unchanged."),
        }),
        tags: ["mutate", "master"],
        execute: async (rt, { masterId, scope, level, fontFamily, fontSize, fontWeight, italic, underline, color, bullet }) => {
            const pres = rt.getPres();
            if (!pres.masters?.find((m) => m.id === masterId))
                return err(`master "${masterId}" not found`);
            const rPr = {};
            if (fontFamily !== undefined)
                rPr.fontFamily = fontFamily;
            if (fontSize !== undefined)
                rPr.fontSize = fontSize;
            if (fontWeight !== undefined)
                rPr.fontWeight = fontWeight;
            if (italic !== undefined)
                rPr.italic = italic;
            if (underline !== undefined)
                rPr.underline = underline;
            if (color !== undefined)
                rPr.color = color;
            const patch = {};
            if (Object.keys(rPr).length > 0)
                patch.rPr = rPr;
            if (bullet !== undefined)
                patch.bullet = bullet;
            if (Object.keys(patch).length === 0)
                return err("No style fields provided.");
            return rt.apply(new SetMasterTxStylesCmd(masterId, scope, level, patch));
        },
    }),
    // editMasterShape：直接改 master/layout 上某个具体 shape 的 bbox/fill/text style。
    // 复用已有 Cmd —— commands.ts 的 shapeAt 会在 slide.layers 找不到时自动 fallback 到 pres.masters。
    // slideIdx 仅作为 commands.ts 的兼容签名占位（值随便给一个有效 index 即可）。
    defineTool({
        name: "edit_master_shape",
        description: [
            "Modify a single shape that lives on a master or layout (not on a slide). Discover shape ids via list_masters_and_layouts (placeholderTypes show what's available).",
            "Use this to nudge decoration position/fill, rebrand the master's title color, etc. Changes apply to EVERY slide using that master/layout.",
        ].join(" "),
        inputSchema: z.object({
            shapeId: z.string(),
            patch: z.object({
                bbox: z
                    .object({
                    x: z.number(),
                    y: z.number(),
                    w: z.number().min(1),
                    h: z.number().min(1),
                })
                    .optional(),
                fillColor: z.string().regex(/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/).optional(),
                textStyle: z
                    .object({
                    fontFamily: z.string().optional(),
                    fontSize: z.number().min(6).max(200).optional(),
                    fontWeight: z.number().int().min(100).max(900).optional(),
                    italic: z.boolean().optional(),
                    underline: z.boolean().optional(),
                    color: z.string().regex(/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/).optional(),
                })
                    .optional(),
            }),
        }),
        tags: ["mutate", "master"],
        execute: async (rt, { shapeId, patch }) => {
            const pres = rt.getPres();
            // 先校验 shape 真的存在于 masters / layouts，否则给个明确错误。
            const found = findInMasters(pres, shapeId);
            if (!found)
                return err(`shape "${shapeId}" not found on any master or layout. Use list_masters_and_layouts first.`);
            // commands.ts 的 shapeAt 内部会 fallback 到 masters；slideIdx 给一个有效值即可（0）。
            const ops = [];
            if (patch.bbox)
                ops.push(rt.apply(new SetShapeBboxCmd(0, shapeId, patch.bbox)));
            if (patch.fillColor) {
                const paint = { kind: "solid", color: patch.fillColor };
                ops.push(rt.apply(new SetFillCmd(0, shapeId, paint)));
            }
            if (patch.textStyle) {
                const clean = {};
                for (const [k, v] of Object.entries(patch.textStyle))
                    if (v !== undefined)
                        clean[k] = v;
                if (Object.keys(clean).length > 0)
                    ops.push(rt.apply(new SetTextStyleCmd(0, shapeId, clean)));
            }
            const errs = ops.filter((o) => !o.ok);
            if (errs.length)
                return err(errs[0].error);
            return ok({ touched: ops.length });
        },
    }),
    defineTool({
        name: "add_layout",
        description: "Add a new slide layout under a master. Prefer cloneFromLayoutId so placeholders are copied (ids are reminted). Empty layouts have no placeholders — slides using them look blank. Call list_masters_and_layouts first. After adding, use set_slide_layout / applySlideLayout to put slides on it.",
        inputSchema: z.object({
            masterId: z.string(),
            name: z.string().min(1).max(80),
            type: z
                .string()
                .optional()
                .describe("OOXML ST_SlideLayoutType, e.g. title / obj / twoObj / blank / pic / titleOnly."),
            cloneFromLayoutId: z.string().optional().describe("Copy shapes/background/hf from this layout (ids reminted)."),
        }),
        tags: ["mutate", "master"],
        execute: (rt, { masterId, name, type, cloneFromLayoutId }) => {
            const pres = rt.getPres();
            const master = pres.masters?.find((m) => m.id === masterId);
            if (!master)
                return err(`master "${masterId}" not found`);
            let shapes;
            let background;
            let hf;
            let layoutType = type;
            if (cloneFromLayoutId) {
                const src = master.layouts?.find((l) => l.id === cloneFromLayoutId);
                if (!src)
                    return err(`cloneFromLayoutId "${cloneFromLayoutId}" not found under master "${masterId}"`);
                shapes = src.shapes.map(remintShapeIds);
                background = src.background;
                hf = src.hf;
                layoutType = type ?? src.type;
            }
            const id = `layout_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
            const res = rt.apply(new AddLayoutCmd(masterId, {
                id,
                name,
                type: layoutType,
                shapes,
                background,
                hf,
            }));
            if (!res.ok)
                return res;
            return ok({ masterId, layoutId: id, clonedFrom: cloneFromLayoutId ?? null });
        },
    }),
    defineTool({
        name: "delete_layout",
        description: "Delete a layout that NO slide currently uses. If any slide still references it, switch those slides first (set_slide_layout / applySlideLayout). Cannot delete the last layout on a master.",
        inputSchema: z.object({
            masterId: z.string(),
            layoutId: z.string(),
        }),
        tags: ["mutate", "master"],
        execute: (rt, { masterId, layoutId }) => {
            const pres = rt.getPres();
            const master = pres.masters?.find((m) => m.id === masterId);
            if (!master)
                return err(`master "${masterId}" not found`);
            if (!master.layouts?.some((l) => l.id === layoutId)) {
                return err(`layout "${layoutId}" not found under master "${masterId}"`);
            }
            if ((master.layouts?.length ?? 0) <= 1) {
                return err("Cannot delete the last layout on a master.");
            }
            const inUse = pres.slides.filter((s) => s.layoutRef?.masterId === masterId && s.layoutRef.layoutId === layoutId);
            if (inUse.length) {
                return err(`layout "${layoutId}" is used by ${inUse.length} slide(s). Switch them with set_slide_layout first.`);
            }
            return rt.apply(new DeleteLayoutCmd(masterId, layoutId));
        },
    }),
    defineTool({
        name: "duplicate_master",
        description: "Clone an entire slide master and all of its layouts (new ids). Does not change which master existing slides use — call set_slide_layout afterwards if you want slides on the copy.",
        inputSchema: z.object({
            masterId: z.string(),
        }),
        tags: ["mutate", "master"],
        execute: (rt, { masterId }) => {
            const pres = rt.getPres();
            if (!pres.masters?.some((m) => m.id === masterId))
                return err(`master "${masterId}" not found`);
            const newId = `master_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
            const res = rt.apply(new DuplicateMasterCmd(masterId, newId));
            if (!res.ok)
                return res;
            return ok({ sourceMasterId: masterId, newMasterId: newId });
        },
    }),
    defineTool({
        name: "set_placeholder_type",
        description: "Change a placeholder's OOXML type on a master or layout (title / body / ctrTitle / subTitle / dt / ftr / sldNum / pic / chart / tbl / obj / …). Affects inheritance for every slide using that layout. Discover shapeId via list_masters_and_layouts. Omit layoutId to patch a master-level placeholder.",
        inputSchema: z.object({
            masterId: z.string(),
            layoutId: z.string().optional(),
            shapeId: z.string(),
            type: z.enum([
                "title",
                "body",
                "ctrTitle",
                "subTitle",
                "dt",
                "ftr",
                "sldNum",
                "hdr",
                "obj",
                "chart",
                "tbl",
                "clipArt",
                "dgm",
                "media",
                "sldImg",
                "pic",
            ]),
            idx: z.union([z.string(), z.number()]).optional().describe("Optional placeholder idx (OOXML idx attribute)."),
        }),
        tags: ["mutate", "master"],
        execute: (rt, { masterId, layoutId, shapeId, type, idx }) => {
            const pres = rt.getPres();
            const master = pres.masters?.find((m) => m.id === masterId);
            if (!master)
                return err(`master "${masterId}" not found`);
            if (layoutId && !master.layouts?.some((l) => l.id === layoutId)) {
                return err(`layout "${layoutId}" not found under master "${masterId}"`);
            }
            return rt.apply(new SetPlaceholderTypeCmd(masterId, layoutId, shapeId, type, idx));
        },
    }),
    defineTool({
        name: "set_master_background",
        description: "Set a slide master's background (solid / linear / radial / image / none). Inherited by layouts and slides that do not override their own background. Ripple: re-check text contrast on slides that inherit this master.",
        inputSchema: z.object({
            masterId: z.string(),
            paint: masterPaintSchema,
        }),
        tags: ["mutate", "master"],
        execute: (rt, { masterId, paint }) => {
            const pres = rt.getPres();
            if (!pres.masters?.some((m) => m.id === masterId))
                return err(`master "${masterId}" not found`);
            return rt.apply(new SetBackgroundTargetCmd(masterTarget(masterId), toPaint(paint)));
        },
    }),
    defineTool({
        name: "set_layout_background",
        description: "Set a layout's background override. Slides using this layout inherit it unless they set their own background. Pass kind=none to clear the layout override (fall back to the master).",
        inputSchema: z.object({
            masterId: z.string(),
            layoutId: z.string(),
            paint: masterPaintSchema,
        }),
        tags: ["mutate", "master"],
        execute: (rt, { masterId, layoutId, paint }) => {
            const pres = rt.getPres();
            const master = pres.masters?.find((m) => m.id === masterId);
            if (!master)
                return err(`master "${masterId}" not found`);
            if (!master.layouts?.some((l) => l.id === layoutId)) {
                return err(`layout "${layoutId}" not found under master "${masterId}"`);
            }
            return rt.apply(new SetBackgroundTargetCmd(layoutTarget(masterId, layoutId), toPaint(paint)));
        },
    }),
    defineTool({
        name: "set_notes_master_background",
        description: "Set a notes master's background (speaker-notes page chrome). Discover ids via list_masters_and_layouts.notesMasters. Ripple: restyle of the notes page, not the slide itself.",
        inputSchema: z.object({
            masterId: z.string(),
            paint: masterPaintSchema,
        }),
        tags: ["mutate", "master"],
        execute: (rt, { masterId, paint }) => {
            const pres = rt.getPres();
            if (!(pres.notesMasters ?? []).some((m) => m.id === masterId)) {
                return err(`notesMaster "${masterId}" not found`);
            }
            return rt.apply(new SetBackgroundTargetCmd(notesMasterTarget(masterId), toPaint(paint)));
        },
    }),
    defineTool({
        name: "set_handout_master_background",
        description: "Set a handout master's background (printed-handout chrome). Discover ids via list_masters_and_layouts.handoutMasters.",
        inputSchema: z.object({
            masterId: z.string(),
            paint: masterPaintSchema,
        }),
        tags: ["mutate", "master"],
        execute: (rt, { masterId, paint }) => {
            const pres = rt.getPres();
            if (!(pres.handoutMasters ?? []).some((m) => m.id === masterId)) {
                return err(`handoutMaster "${masterId}" not found`);
            }
            return rt.apply(new SetBackgroundTargetCmd(handoutMasterTarget(masterId), toPaint(paint)));
        },
    }),
];
function dedupe(arr) {
    return [...new Set(arr)];
}
function findInMasters(pres, id) {
    if (!pres.masters)
        return undefined;
    const walk = (shapes) => {
        for (const s of shapes) {
            if (s.id === id)
                return s;
            if (s.kind === "group") {
                const f = walk(s.children);
                if (f)
                    return f;
            }
        }
        return undefined;
    };
    const searchMasters = (list) => {
        for (const m of list ?? []) {
            const f = walk(m.shapes);
            if (f)
                return f;
            for (const l of m.layouts ?? []) {
                const ff = walk(l.shapes);
                if (ff)
                    return ff;
            }
        }
        return undefined;
    };
    return (searchMasters(pres.masters) ||
        searchMasters(pres.notesMasters) ||
        searchMasters(pres.handoutMasters));
}
