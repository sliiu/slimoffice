// builtin 工具组: stock-fonts
//
// 提供"可商用字体"搜索与应用：
//   - fonts_search → 精挑细选的免费可商用 Google Fonts 清单（含中文；无需 API key）。
//   - fonts_apply  → 注入 Google Fonts <link>（@font-face），并把指定 shape 的
//                    fontFamily 改成该字体；不指定 shape 时改焦点 slide 上的
//                    所有 text shape。
//
// 设计要点：
//   1. 浏览器内"应用字体"的本质 = 让 CSS / SVG 能找到该 font-family。
//      最稳的方式是注入 <link rel="stylesheet" href="https://fonts.googleapis.com/...">
//      让 Google CDN 帮我们配 @font-face。
//   2. 当前不嵌入字体进 .pptx —— 后续可独立做（下载 woff2 → 转 ttf →
//      塞进 ppt/fonts）。PPTX 内嵌走独立工具 `embedFonts` / `listFontEmbedStatus`。
//   3. 中文字体走 noto-sans-sc / noto-serif-sc / ma-shan-zheng / zcool-* 等，
//      都是 SIL OFL 协议商用 OK。

import { z } from "zod";
import { SetTextStyleCmd } from "@ppt/editor/commands";
import type { Shape } from "@ppt/core";
import { injectFontCss } from "../../../fonts/inject";
import { defineTool } from "../../../tools/types";
import type { BuiltinToolGroup } from "../types";

// ---------------------------------------------------------------------------
// 字体清单（精挑细选的免费可商用 Google Fonts；不依赖 API key）。
// ---------------------------------------------------------------------------

interface FontPreset {
  family: string;
  category: "sans-serif" | "serif" | "display" | "handwriting" | "monospace";
  language: "latin" | "cjk" | "both";
  /** Google Fonts CSS v2 url（指向具体 weights）。 */
  cssUrl: string;
  /** 给 AI 的语义提示（搜索匹配 + 风格描述）。 */
  tags: string[];
  license: "OFL" | "Apache-2.0";
  vendor: "Google Fonts";
}

const FONT_PRESETS: FontPreset[] = [
  // 英文 sans
  { family: "Inter", category: "sans-serif", language: "latin",
    cssUrl: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap",
    tags: ["modern", "ui", "neutral", "tech"], license: "OFL", vendor: "Google Fonts" },
  { family: "Roboto", category: "sans-serif", language: "latin",
    cssUrl: "https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap",
    tags: ["clean", "google", "android", "default"], license: "Apache-2.0", vendor: "Google Fonts" },
  { family: "Montserrat", category: "sans-serif", language: "latin",
    cssUrl: "https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;800&display=swap",
    tags: ["geometric", "headline", "bold"], license: "OFL", vendor: "Google Fonts" },
  // 英文 serif
  { family: "Playfair Display", category: "serif", language: "latin",
    cssUrl: "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&display=swap",
    tags: ["elegant", "editorial", "luxury", "headline"], license: "OFL", vendor: "Google Fonts" },
  { family: "Lora", category: "serif", language: "latin",
    cssUrl: "https://fonts.googleapis.com/css2?family=Lora:wght@400;600&display=swap",
    tags: ["readable", "warm", "body"], license: "OFL", vendor: "Google Fonts" },
  // 显示字体
  { family: "Bebas Neue", category: "display", language: "latin",
    cssUrl: "https://fonts.googleapis.com/css2?family=Bebas+Neue&display=swap",
    tags: ["condensed", "headline", "poster", "bold"], license: "OFL", vendor: "Google Fonts" },
  // 等宽
  { family: "JetBrains Mono", category: "monospace", language: "latin",
    cssUrl: "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&display=swap",
    tags: ["code", "monospace", "developer"], license: "OFL", vendor: "Google Fonts" },
  // 中文 sans
  { family: "Noto Sans SC", category: "sans-serif", language: "cjk",
    cssUrl: "https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;700&display=swap",
    tags: ["中文", "黑体", "简体", "正式", "现代"], license: "OFL", vendor: "Google Fonts" },
  // 中文 serif
  { family: "Noto Serif SC", category: "serif", language: "cjk",
    cssUrl: "https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;700&display=swap",
    tags: ["中文", "宋体", "简体", "正式", "经典"], license: "OFL", vendor: "Google Fonts" },
  // 中文显示 / 书法
  { family: "Ma Shan Zheng", category: "handwriting", language: "cjk",
    cssUrl: "https://fonts.googleapis.com/css2?family=Ma+Shan+Zheng&display=swap",
    tags: ["中文", "书法", "毛笔", "手写", "传统"], license: "OFL", vendor: "Google Fonts" },
  { family: "ZCOOL XiaoWei", category: "display", language: "cjk",
    cssUrl: "https://fonts.googleapis.com/css2?family=ZCOOL+XiaoWei&display=swap",
    tags: ["中文", "宋体", "手写", "标题"], license: "OFL", vendor: "Google Fonts" },
  { family: "ZCOOL KuaiLe", category: "display", language: "cjk",
    cssUrl: "https://fonts.googleapis.com/css2?family=ZCOOL+KuaiLe&display=swap",
    tags: ["中文", "可爱", "标题", "活泼"], license: "OFL", vendor: "Google Fonts" },
  { family: "Long Cang", category: "handwriting", language: "cjk",
    cssUrl: "https://fonts.googleapis.com/css2?family=Long+Cang&display=swap",
    tags: ["中文", "手写", "草书"], license: "OFL", vendor: "Google Fonts" },
];

function matchScore(p: FontPreset, query: string): number {
  const q = query.toLowerCase().trim();
  if (!q) return 0;
  let score = 0;
  if (p.family.toLowerCase().includes(q)) score += 10;
  if (p.category === q) score += 4;
  for (const tag of p.tags) {
    if (tag.toLowerCase().includes(q) || q.includes(tag.toLowerCase())) score += 3;
  }
  // language hint
  if (/(中文|chinese|cjk|汉)/i.test(q) && p.language === "cjk") score += 5;
  if (/(english|latin|英文)/i.test(q) && p.language === "latin") score += 3;
  return score;
}

// ---------------------------------------------------------------------------
// shape 遍历：拿到 slide 上所有可改文本的 shape id（用于"应用到整页"）。
// ---------------------------------------------------------------------------

function collectTextShapeIds(shape: Shape, out: string[]): void {
  if (shape.kind === "text") out.push(shape.id);
  if (shape.kind === "group") {
    for (const c of shape.children) collectTextShapeIds(c, out);
  }
}

const searchTool = defineTool({
  name: "fonts_search",
  description: [
    "Search commercially-usable fonts (SIL OFL / Apache-2.0) from a curated Google Fonts list.",
    "Use this BEFORE `fonts_apply`. Supports CJK keywords like '中文', '书法'.",
    "Returns family name, css url, category, language, license, vendor.",
  ].join(" "),
  inputSchema: z.object({
    query: z
      .string()
      .min(1)
      .describe("Style keyword(s): 'modern sans', 'editorial serif', '中文 标题', 'monospace', 'handwriting'."),
    language: z.enum(["latin", "cjk", "both"]).optional().describe("Filter by language coverage."),
    limit: z.number().int().min(1).max(10).optional(),
  }),
  tags: ["read", "text"],
  execute: async (_rt, { query, language, limit }) => {
    const scored = FONT_PRESETS.filter(
      (p) => !language || language === "both" || p.language === language || p.language === "both",
    )
      .map((p) => ({ p, s: matchScore(p, query) }))
      .sort((a, b) => b.s - a.s);
    const top = scored.slice(0, limit ?? 5).map((x) => x.p);
    return {
      ok: true as const,
      query,
      count: top.length,
      results: top.map((p) => ({
        family: p.family,
        category: p.category,
        language: p.language,
        cssUrl: p.cssUrl,
        license: p.license,
        vendor: p.vendor,
        tags: p.tags,
      })),
    };
  },
});

const applyTool = defineTool({
  name: "fonts_apply",
  description: [
    "Apply a font family to slide text. Injects the Google Fonts <link> once, then patches `fontFamily` on the target shapes via undoable edit commands.",
    "Pass `cssUrl` from `fonts_search` to ensure the font is actually loaded; if omitted, the family will still be set but may fall back to a system font.",
    "If `shapeIds` is empty, applies to ALL text shapes on `slideIdx` (or the focused slide). If `slideIdx` is also empty, applies to ALL text shapes on EVERY focused slide.",
    "Never invent font family names; only use ones returned by `fonts_search`. This does NOT pack the font into the PPTX — call embedFonts afterwards if the user needs portable export.",
  ].join(" "),
  inputSchema: z.object({
    family: z.string().min(1).describe("CSS font-family name returned by fonts_search (e.g. 'Inter', 'Noto Sans SC')."),
    cssUrl: z.string().url().optional().describe("Google Fonts CSS url from fonts_search (recommended)."),
    slideIdx: z.number().int().min(0).optional(),
    shapeIds: z.array(z.string()).optional().describe("Specific text shape ids; if empty, defaults to whole slide(s) per focus."),
  }),
  tags: ["mutate", "text"],
  shapeScoped: true,
  execute: async (rt, { family, cssUrl, slideIdx, shapeIds }) => {
    if (cssUrl) injectFontCss(cssUrl, family);
    try {
      const pres = rt.getPres();
      // 决定作用范围。
      const focused = rt.port.getFocusedSlideIndices();
      const slideIndices: number[] = slideIdx !== undefined ? [slideIdx] : focused.length > 0 ? focused : [0];

      const patches: Array<{ slideIdx: number; shapeId: string }> = [];
      if (shapeIds && shapeIds.length > 0) {
        const idSet = new Set(shapeIds);
        for (const si of slideIndices) {
          const slide = pres.slides[si];
          if (!slide) continue;
          for (const layer of slide.layers) {
            for (const sh of layer.shapes) {
              const ids: string[] = [];
              collectTextShapeIds(sh, ids);
              for (const id of ids) {
                if (idSet.has(id) || idSet.has(sh.id)) {
                  patches.push({ slideIdx: si, shapeId: sh.id });
                  break;
                }
              }
            }
          }
        }
      } else {
        for (const si of slideIndices) {
          const slide = pres.slides[si];
          if (!slide) continue;
          for (const layer of slide.layers) {
            for (const sh of layer.shapes) {
              const ids: string[] = [];
              collectTextShapeIds(sh, ids);
              if (ids.length > 0) patches.push({ slideIdx: si, shapeId: sh.id });
            }
          }
        }
      }
      if (patches.length === 0) {
        return { ok: false as const, error: "No text shapes found in the target scope." };
      }
      // 走命令栈：一条 patch 一条 EditCommand（逐轮事务会把它们折叠成一个 undo 原子）。
      for (const p of patches) {
        rt.port.execute(new SetTextStyleCmd(p.slideIdx, p.shapeId, { fontFamily: family }));
      }
      return {
        ok: true as const,
        family,
        cssInjected: !!cssUrl,
        affectedShapes: patches.length,
        slides: [...new Set(patches.map((p) => p.slideIdx))],
      };
    } catch (e) {
      return { ok: false as const, error: `Apply failed: ${(e as Error).message}` };
    }
  },
});

export const stockFontsGroup: BuiltinToolGroup = {
  id: "stock_fonts",
  name: "Commercial Fonts",
  description: "Google Fonts 上免费可商用字体（含中文）；搜索 + 应用到 shape / slide。",
  detail:
    "提供 `fonts_search`（按风格 / 语言 / 类别搜索）与 `fonts_apply`（注入 @font-face + 改 TextRun.fontFamily）两个工具。\n" +
    "无需 API key；所有候选字体均为 SIL OFL / Apache-2.0 协议，商用免费。",
  icon: "a-large-small",
  defaultEnabled: true,
  tools: [searchTool, applyTool],
};
