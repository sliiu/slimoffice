// 只读工具：让 LLM "看清当前状态" —— tool-calling 成功的关键。
// 不进命令栈，直接读 pres。

import { z } from "zod";
import {
  collectUsedTypefaces,
  isTypefaceEmbedded,
  getPresentationProtection,
  isPresentationEditingBlocked,
  protectionRequiresPassword,
  summarizeOfficeModifyVerifier,
} from "@ppt/core";
import { defineTool } from "../types";
import { ok, err } from "../types";
import { shapeSummary, slideSummary } from "../summaries";

export const readTools = [
  defineTool({
    name: "getPresentationSummary",
    description:
      "Inspect the current presentation: returns slide count, size, theme, font embed status (`fonts.used` / `fonts.missing` / `fonts.embeddedFamilies`), protection (`protection.kind` / `protection.passwordRequired` / `protection.editingBlocked`), and per-slide overview. Each slide has `background` (kind only — default/solid/linear/radial/image/none) and `backgroundDetail` (kind + dominant color / image src / alpha) so you can evaluate text-vs-bg contrast for ripple-effect checks. Call this before any non-trivial change. If `fonts.missing` is non-empty and the user cares about portable export, follow up with embedFonts. If `protection.editingBlocked` is true, call unprotectPresentation before other mutations.",
    inputSchema: z.object({}),
    tags: ["read"],
    execute: (rt) => {
      const pres = rt.getPres();
      return ok({
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
          used: collectUsedTypefaces(pres),
          embeddedFamilies: [...new Set((pres.fonts ?? []).map((f) => f.family))],
          missing: collectUsedTypefaces(pres).filter((f) => !isTypefaceEmbedded(pres, f)),
        },
        protection: (() => {
          const current = getPresentationProtection(pres);
          const office = summarizeOfficeModifyVerifier(pres.modifyVerifier);
          return {
            protected: current !== undefined,
            kind: current?.kind ?? null,
            setAt: current?.setAt ?? null,
            passwordRequired: current ? protectionRequiresPassword(current, pres.modifyVerifier) : false,
            editingBlocked: isPresentationEditingBlocked(pres),
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
        slides: pres.slides.map((s, i) => slideSummary(s, i)),
      });
    },
  }),

  defineTool({
    name: "listShapesOnSlide",
    description:
      "List all top-level shapes on a slide. Each shape includes id / kind / bbox / fill summary; text shapes additionally include the flattened text and a `style` object (representative color / fontSize / fontWeight / italic from the first non-empty run). Use this to evaluate ripple effects (e.g. whether existing text colors still meet contrast against a newly changed background).",
    inputSchema: z.object({ slideIdx: z.number().int().min(0) }),
    tags: ["read"],
    execute: (rt, { slideIdx }) => {
      const pres = rt.getPres();
      const slide = pres.slides[slideIdx];
      if (!slide) return err(`slideIdx ${slideIdx} out of range (have ${pres.slides.length})`);
      const shapes = slide.layers.flatMap((l) => l.shapes).map((s) => shapeSummary(s));
      return ok({ slideIdx, shapes });
    },
  }),
];
