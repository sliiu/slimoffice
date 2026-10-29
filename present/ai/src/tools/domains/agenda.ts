// AI 目录 / 导航工具 —— 插入带「点击跳转」的目录页。
//
// 目录页由 deckgen 的 agendaList device 编译（同一套 VisualSystem / ColorTheme），每一行
// 都是 shape-level `hyperlink { kind: "slide" }`（OOXML ppaction://hlinksldjump），播放器、
// 导出、编辑器超链接对话框都认。非 deckgen 生成的 deck 也能用：视觉系统退回 editorial，
// 配色从 pres.theme.colors 取 bg / ink / accent。

import { z } from "zod";
import type { Presentation, Shape, Slide, TextShape } from "@ppt/core";
import { InsertSlideCmd } from "../commands/slide-commands";
import { defineTool, ok, err } from "../types";
import { compileCanvasDeck } from "../../deckgen/pipeline";
import { resolveVisualSystem, CANVAS } from "../../deckgen/visual-system";
import { isVisualSystemId, type CanvasSystemId, type VisualSystemId } from "../../deckgen/ids";
import { paletteOf, themeFromAuthoredLook } from "../../deckgen/color-theme";
import type { FilledSlide } from "../../deckgen/ir";

const HEX = /^#([0-9a-fA-F]{6})$/;

/** Visible title of a slide: title placeholder first, else the largest text. */
export function slideTitleText(slide: Slide): string | undefined {
  const texts = slide.layers.flatMap((l) => l.shapes).filter((s): s is TextShape => s.kind === "text");
  const read = (t: TextShape): string =>
    t.paragraphs
      .map((p) => p.runs.map((r) => r.text ?? "").join(""))
      .join(" ")
      .trim();
  const ph = texts.find((t) => /title/i.test(t.placeholder?.type ?? "") || /^slot:title/.test(t.name ?? ""));
  if (ph && read(ph)) return read(ph);
  const sized = texts
    .map((t) => ({ t, size: Math.max(0, ...t.paragraphs.flatMap((p) => p.runs.map((r) => r.fontSize ?? 0))) }))
    .filter((x) => read(x.t) && !/^\d{1,2}$/.test(read(x.t)))
    .sort((a, b) => b.size - a.size);
  return sized[0] ? read(sized[0].t) : undefined;
}

function isSectionSlide(slide: Slide): boolean {
  const tag = (slide.customData?.tags as Record<string, string> | undefined)?.layout;
  if (tag) return tag === "section";
  const layoutId = slide.layoutRef?.layoutId ?? "";
  return /section/i.test(layoutId) || /^section/i.test(slide.name ?? "");
}

function isAgendaSlide(slide: Slide): boolean {
  const tag = (slide.customData?.tags as Record<string, string> | undefined)?.layout;
  return tag === "agenda" || /agenda|contents|目录/i.test(slide.name ?? "");
}

/**
 * Default rows: section pages when the deck has ≥ 2, else every content page (not cover, not the
 * close, not an existing agenda). `indexOffset` shifts targets for the slide about to be inserted.
 */
export function agendaRowsFromDeck(pres: Presentation, insertAt: number): Array<{ title: string; target: number }> {
  const slides = pres.slides;
  const candidates = slides
    .map((s, i) => ({ s, i }))
    .filter(({ i }) => i > 0 && i < slides.length - 1)
    .filter(({ s }) => !isAgendaSlide(s));
  const sections = candidates.filter(({ s }) => isSectionSlide(s));
  const pick = sections.length >= 2 ? sections : candidates;
  return pick
    .map(({ s, i }) => ({ title: slideTitleText(s) ?? `Page ${i + 1}`, target: i + (i >= insertAt ? 2 : 1) }))
    .slice(0, 8);
}

/** VisualSystem + ColorTheme for a new deckgen page inside this deck (deckgen decks keep theirs). */
export function lookForDeck(pres: Presentation): { systemId: VisualSystemId; theme: ReturnType<typeof themeFromAuthoredLook> } {
  const meta = (pres.meta as { deckgen?: { system?: string; theme?: string } } | undefined)?.deckgen;
  const systemId: VisualSystemId = meta?.system && isVisualSystemId(meta.system) ? meta.system : "editorial";
  const colors = (pres.theme?.colors ?? {}) as Record<string, string | undefined>;
  const hex = (...keys: string[]): string | undefined => keys.map((k) => colors[k]).find((v) => v && HEX.test(v));
  const bg = hex("bg", "bg1", "lt1");
  const ink = hex("ink", "tx1", "dk1");
  const accent = hex("accent", "accent1");
  const palette = bg && ink && accent ? { bg, ink, accent, ...(colors.surface && HEX.test(colors.surface) ? { surface: colors.surface } : {}), ...(colors.muted && HEX.test(colors.muted) ? { muted: colors.muted } : {}) } : undefined;
  const theme = themeFromAuthoredLook({
    systemId: systemId as CanvasSystemId,
    ...(meta?.theme && meta.theme !== "custom" ? { themeId: meta.theme } : {}),
    ...(palette ? { palette } : {}),
  });
  return { systemId, theme };
}

/** Compile one agenda canvas into an editor Slide that fits this deck (size, master, background). */
export function buildAgendaSlide(pres: Presentation, opts: { title: string; rows: Array<{ title: string; body?: string; target: number }>; cjk?: boolean }): Slide {
  const { systemId, theme } = lookForDeck(pres);
  const system = resolveVisualSystem(systemId);
  const ts = system.typeScale;
  const mx = CANVAS.width * system.grid.margin;
  const my = CANVAS.height * system.grid.margin;
  const eyebrow = opts.cjk ? `共 ${opts.rows.length} 部分` : `${opts.rows.length} SECTIONS`;
  const filled: FilledSlide = {
    layout: "agenda",
    variant: "canvas",
    elements: [
      { slot: "eyebrow", kind: "text", name: "slot:eyebrow", bbox: { x: mx, y: my + 16, w: 400, h: ts.caption * 1.6 }, paintRole: "accent", text: eyebrow, fontSize: ts.caption, caps: "all" },
      { slot: "title", kind: "text", name: "slot:title", bbox: { x: mx, y: my + 52, w: CANVAS.width - 2 * mx, h: ts.h1 * 1.3 }, paintRole: "ink", text: opts.title, fontSize: ts.h1 },
      {
        slot: "agenda",
        kind: "device",
        name: "device:agenda",
        bbox: { x: mx, y: my + 52 + ts.h1 * 1.3 + 32, w: CANVAS.width - 2 * mx, h: CANVAS.height - (my + 52 + ts.h1 * 1.3 + 32) - my - 8 },
        paintRole: "surface",
        device: { type: "agendaList", items: opts.rows.map((r) => ({ title: r.title, ...(r.body ? { body: r.body } : {}), target: r.target })) },
      },
    ],
  };
  const compiled = compileCanvasDeck({ system, theme, slides: [filled], title: opts.title });
  const slide = compiled.presentation.slides[0]!;
  const pal = paletteOf(theme);
  const out: Slide = { ...slide, id: `slide_agenda_${Date.now().toString(36)}`, name: "Agenda" };
  // Keep a master reference only when this deck owns that deckgen master (same system / theme id);
  // its layout set may lack "agenda", so fall back to any layout of that master. Otherwise paint the paper.
  const master = pres.masters?.find((m) => m.id === slide.layoutRef?.masterId);
  const layout = master?.layouts?.find((l) => l.id === slide.layoutRef?.layoutId) ?? master?.layouts?.[0];
  if (master && layout) {
    out.layoutRef = { masterId: master.id, layoutId: layout.id };
  } else {
    delete out.layoutRef;
    out.background = { kind: "solid", color: pal.bg };
  }
  // Fit a non-1280×720 deck by uniform scale of every bbox.
  const sx = (pres.size?.width ?? CANVAS.width) / CANVAS.width;
  const sy = (pres.size?.height ?? CANVAS.height) / CANVAS.height;
  if (sx !== 1 || sy !== 1) {
    const scale = (sh: Shape): void => {
      sh.bbox = { x: sh.bbox.x * sx, y: sh.bbox.y * sy, w: sh.bbox.w * sx, h: sh.bbox.h * sy };
    };
    out.layers = out.layers.map((l) => ({ ...l, shapes: l.shapes.map((s) => ({ ...s })) }));
    for (const l of out.layers) l.shapes.forEach(scale);
  }
  return out;
}

export const agendaTools = [
  defineTool({
    name: "insertAgendaSlide",
    description: [
      "Insert a contents / agenda (目录) slide whose rows are click-to-jump links to their pages (OOXML slide hyperlinks; work in the player and in PowerPoint).",
      "Rows default to the deck's section slides (or every content slide when there are fewer than two sections); pass `items` to control titles and 1-based `target` pages yourself — targets refer to page numbers AFTER insertion.",
      "The page is compiled in the deck's own visual system and palette (deckgen decks keep their look; others get an editorial page on the theme paper).",
      "Use when the user asks for 目录 / agenda / table of contents / navigation page. One agenda per deck; call again to rebuild after reordering slides (delete the old one first).",
    ].join(" "),
    inputSchema: z.object({
      insertAt: z.number().int().min(0).optional().describe("0-based position; default 1 (right after the cover)."),
      title: z.string().min(1).max(40).optional().describe('Page title; default "Contents" / "目录" following the deck language.'),
      items: z
        .array(
          z.object({
            title: z.string().min(1).max(48),
            body: z.string().max(120).optional(),
            target: z.number().int().min(1).describe("1-based page this row opens (after insertion)."),
          }),
        )
        .min(2)
        .max(8)
        .optional(),
    }),
    tags: ["mutate", "slide"],
    execute: (rt, input) => {
      const pres = rt.getPres();
      if (pres.slides.length < 2) return err("Need at least 2 slides to build an agenda.");
      const insertAt = Math.min(input.insertAt ?? 1, pres.slides.length);
      const rows = input.items ?? agendaRowsFromDeck(pres, insertAt);
      if (rows.length < 2) return err("Could not derive ≥ 2 agenda rows from this deck; pass `items` explicitly.");
      const total = pres.slides.length + 1;
      const bad = rows.filter((r) => r.target < 1 || r.target > total || r.target === insertAt + 1);
      if (bad.length) return err(`Agenda targets out of range (1..${total}, not the agenda page itself): ${bad.map((b) => b.target).join(", ")}`);
      const cjk = rows.some((r) => /[\u3400-\u9fff]/.test(r.title)) || /[\u3400-\u9fff]/.test(slideTitleText(pres.slides[0]!) ?? "");
      const title = input.title ?? (cjk ? "目录" : "Contents");
      const slide = buildAgendaSlide(pres, { title, rows, cjk });
      const res = rt.apply(new InsertSlideCmd(insertAt, slide));
      if (!res.ok) return res;
      const linked = slide.layers.flatMap((l) => l.shapes).filter((s) => s.hyperlink?.kind === "slide").length;
      return ok({ slideIdx: insertAt, rows: rows.map((r) => ({ title: r.title, target: r.target })), linkedShapes: linked });
    },
  }),
];
