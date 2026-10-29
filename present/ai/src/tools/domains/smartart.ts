// SmartArt：把文本框转成图示，并编辑条目 / 层级 / 版式。
//
// 组 id 来自 listShapesOnSlide（kind=group 且带 smartArt 摘要）。
// 条目级命令需要当前 items 快照 —— 工具内部先 extract 再 apply。

import { z } from "zod";
import { SMARTART_LAYOUT_KINDS, extractSmartArtItems, type SmartArtLayoutKind } from "@ppt/core";
import {
  AddSmartArtItemCmd,
  ClearSmartArtPicturesCmd,
  ConvertToSmartArtCmd,
  DuplicateSmartArtItemCmd,
  MoveSmartArtItemCmd,
  RemoveSmartArtItemCmd,
  SetSmartArtItemLevelCmd,
  SetSmartArtLayoutCmd,
  UpdateSmartArtItemsCmd,
} from "@ppt/editor/commands";
import { defineTool, ok, err } from "../types";
import { findShapeDeep } from "../summaries";

const layoutEnum = z.enum(SMARTART_LAYOUT_KINDS as unknown as [SmartArtLayoutKind, ...SmartArtLayoutKind[]]);

function smartArtState(rt: { getPres: () => import("@ppt/core").Presentation }, slideIdx: number, groupId: string) {
  const slide = rt.getPres().slides[slideIdx];
  if (!slide) return { ok: false as const, error: `slideIdx ${slideIdx} out of range` };
  const g = findShapeDeep(slide, groupId);
  if (!g || g.kind !== "group" || !g.smartArtMeta) {
    return {
      ok: false as const,
      error: `shape ${groupId} is not a SmartArt group — convertToSmartArt first or pick a group with smartArt in listShapesOnSlide`,
    };
  }
  return { ok: true as const, group: g, items: extractSmartArtItems(g), layout: g.smartArtMeta.layout };
}

export const smartArtTools = [
  defineTool({
    name: "convertToSmartArt",
    description:
      "Convert a text box (including bullets / levels) into a SmartArt group. The original text shape is replaced. Layouts: list / horizontalList / process / processVertical / chevron / cycle / hierarchy / orgChart / matrix / timeline. Returns the new groupId — do not list shapes afterwards.",
    inputSchema: z.object({
      slideIdx: z.number().int().min(0),
      shapeId: z.string(),
      layout: layoutEnum.optional(),
    }),
    tags: ["mutate", "shape"],
    shapeScoped: true,
    execute: (rt, { slideIdx, shapeId, layout }) => {
      const slide = rt.getPres().slides[slideIdx];
      if (!slide) return err(`slideIdx ${slideIdx} out of range`);
      const before = new Set(
        slide.layers.flatMap((l) => l.shapes).filter((s) => s.kind === "group" && s.smartArtMeta).map((s) => s.id),
      );
      const res = rt.apply(new ConvertToSmartArtCmd(slideIdx, shapeId, layout));
      if (!res.ok) return res;
      const added = rt
        .getPres()
        .slides[slideIdx]?.layers.flatMap((l) => l.shapes)
        .find((s) => s.kind === "group" && s.smartArtMeta && !before.has(s.id));
      return ok({ slideIdx, groupId: added?.id, replacedShapeId: shapeId });
    },
  }),

  defineTool({
    name: "listSmartArtItems",
    description: "Read the current SmartArt items (id / text / lvl / imageSrc) and layout for a SmartArt group.",
    inputSchema: z.object({
      slideIdx: z.number().int().min(0),
      groupId: z.string(),
    }),
    tags: ["read", "shape"],
    shapeScoped: true,
    execute: (rt, { slideIdx, groupId }) => {
      const state = smartArtState(rt, slideIdx, groupId);
      if (!state.ok) return err(state.error);
      return ok({ groupId, layout: state.layout, items: state.items });
    },
  }),

  defineTool({
    name: "setSmartArtItems",
    description:
      "Replace ALL SmartArt items. Each item: { id, text, lvl?, imageSrc? }. lvl 0 = top level; 1+ = nested (hierarchy / orgChart). Keep existing ids when editing text so sibling commands stay stable.",
    inputSchema: z.object({
      slideIdx: z.number().int().min(0),
      groupId: z.string(),
      items: z.array(
        z.object({
          id: z.string(),
          text: z.string(),
          lvl: z.number().int().min(0).max(8).optional(),
          imageSrc: z.string().optional(),
        }),
      ).min(1),
    }),
    tags: ["mutate", "shape"],
    shapeScoped: true,
    execute: (rt, { slideIdx, groupId, items }) => {
      const state = smartArtState(rt, slideIdx, groupId);
      if (!state.ok) return err(state.error);
      return rt.apply(new UpdateSmartArtItemsCmd(slideIdx, groupId, items, state.items));
    },
  }),

  defineTool({
    name: "addSmartArtItem",
    description: "Append a new item to a SmartArt group (default label 'Item N').",
    inputSchema: z.object({
      slideIdx: z.number().int().min(0),
      groupId: z.string(),
    }),
    tags: ["mutate", "shape"],
    shapeScoped: true,
    execute: (rt, { slideIdx, groupId }) => {
      const state = smartArtState(rt, slideIdx, groupId);
      if (!state.ok) return err(state.error);
      return rt.apply(new AddSmartArtItemCmd(slideIdx, groupId, state.items));
    },
  }),

  defineTool({
    name: "duplicateSmartArtItem",
    description: "Duplicate a SmartArt item by 0-based index; the copy is inserted immediately after.",
    inputSchema: z.object({
      slideIdx: z.number().int().min(0),
      groupId: z.string(),
      itemIndex: z.number().int().min(0),
    }),
    tags: ["mutate", "shape"],
    shapeScoped: true,
    execute: (rt, { slideIdx, groupId, itemIndex }) => {
      const state = smartArtState(rt, slideIdx, groupId);
      if (!state.ok) return err(state.error);
      return rt.apply(new DuplicateSmartArtItemCmd(slideIdx, groupId, itemIndex, state.items));
    },
  }),

  defineTool({
    name: "removeSmartArtItem",
    description: "Remove a SmartArt item by 0-based index (defaults to the last item). The group must keep at least one item.",
    inputSchema: z.object({
      slideIdx: z.number().int().min(0),
      groupId: z.string(),
      itemIndex: z.number().int().min(0).optional(),
    }),
    tags: ["mutate", "shape"],
    shapeScoped: true,
    execute: (rt, { slideIdx, groupId, itemIndex }) => {
      const state = smartArtState(rt, slideIdx, groupId);
      if (!state.ok) return err(state.error);
      return rt.apply(new RemoveSmartArtItemCmd(slideIdx, groupId, state.items, itemIndex));
    },
  }),

  defineTool({
    name: "moveSmartArtItem",
    description: "Swap a SmartArt item with its neighbor. direction -1 = earlier, 1 = later.",
    inputSchema: z.object({
      slideIdx: z.number().int().min(0),
      groupId: z.string(),
      itemIndex: z.number().int().min(0),
      direction: z.union([z.literal(-1), z.literal(1)]),
    }),
    tags: ["mutate", "shape"],
    shapeScoped: true,
    execute: (rt, { slideIdx, groupId, itemIndex, direction }) => {
      const state = smartArtState(rt, slideIdx, groupId);
      if (!state.ok) return err(state.error);
      return rt.apply(new MoveSmartArtItemCmd(slideIdx, groupId, itemIndex, direction, state.items));
    },
  }),

  defineTool({
    name: "setSmartArtItemLevel",
    description: "Promote / demote a SmartArt item (hierarchy / orgChart). delta -1 = promote (shallower), 1 = demote (deeper). Floor is lvl 0.",
    inputSchema: z.object({
      slideIdx: z.number().int().min(0),
      groupId: z.string(),
      itemIndex: z.number().int().min(0),
      delta: z.union([z.literal(-1), z.literal(1)]),
    }),
    tags: ["mutate", "shape"],
    shapeScoped: true,
    execute: (rt, { slideIdx, groupId, itemIndex, delta }) => {
      const state = smartArtState(rt, slideIdx, groupId);
      if (!state.ok) return err(state.error);
      return rt.apply(new SetSmartArtItemLevelCmd(slideIdx, groupId, itemIndex, delta, state.items));
    },
  }),

  defineTool({
    name: "setSmartArtLayout",
    description: "Switch the SmartArt diagram layout (list / process / cycle / hierarchy / orgChart / matrix / timeline / …). Items are preserved.",
    inputSchema: z.object({
      slideIdx: z.number().int().min(0),
      groupId: z.string(),
      layout: layoutEnum,
    }),
    tags: ["mutate", "shape"],
    shapeScoped: true,
    execute: (rt, { slideIdx, groupId, layout }) => {
      const state = smartArtState(rt, slideIdx, groupId);
      if (!state.ok) return err(state.error);
      return rt.apply(new SetSmartArtLayoutCmd(slideIdx, groupId, layout, state.layout, state.items));
    },
  }),

  defineTool({
    name: "clearSmartArtPictures",
    description: "Remove picture accents (imageSrc) from every SmartArt item. Use on pictureAccent layouts after a style reset.",
    inputSchema: z.object({
      slideIdx: z.number().int().min(0),
      groupId: z.string(),
    }),
    tags: ["mutate", "shape"],
    shapeScoped: true,
    execute: (rt, { slideIdx, groupId }) => {
      const state = smartArtState(rt, slideIdx, groupId);
      if (!state.ok) return err(state.error);
      return rt.apply(new ClearSmartArtPicturesCmd(slideIdx, groupId, state.items));
    },
  }),
];
