// AI 主题生成 / 应用工具：
//   - generateAndApplyTheme → 调 LLM 生成 GeneratedThemeSpec，realize 为 ThemeDef，
//     通过 ApplyCustomThemeCmd 整体覆盖当前 presentation 的背景 + 装饰 + 字体元数据。
//
// 让 chat 里说"换一套更美观的主题 / 做一个发布会风格 / 暗色 + 紫色"等都能直接
// 落到 IR，无需用户离开 chat 去 settings tab 改 themeId。
import { z } from "zod";
import { ApplyThemeVariantCmd } from "@sliiu/present-editor/commands";
import { defineTool, err } from "../types.js";
import { isConfigUsable } from "../../config/presets.js";
import { generateTheme, generateThemeWithMotion } from "../../generate/stages/theme.js";
import { ApplyCustomThemeCmd } from "../commands/slide-commands.js";
import { ApplyAutoAnimationsCmd } from "../commands/animation-commands.js";
export const themeTools = [
    defineTool({
        name: "generateAndApplyTheme",
        description: [
            "Design and apply a brand new visual theme (color palette + background + fonts + decoration) generated on-the-fly by the AI.",
            "Use this when the user asks to: 'change the theme', 'make it more beautiful / modern / cinematic', 'apply a launch-keynote look', 'design a custom theme for <topic>', etc.",
            "Replaces all slide backgrounds (gradient supported), refreshes decorative shapes, and updates fonts. Reversible via undo.",
            'By default PRESERVES slides whose background is a user-placed image (kind="image") — they keep the photo and skip new decoration. Override with preserveImageBackgrounds=false ONLY when the user explicitly wants to wipe image-backed slides too.',
            "By default ALSO designs and applies a matching motion scheme (entrance animations + slide transitions) so the deck's static and dynamic visuals are coherent.",
            "Pass `withMotion: false` to skip motion generation (e.g. the user only wants to swap colors and keep existing animations).",
            "Prefer this over `applyTheme` (which only picks from built-ins) whenever the user wants something not boilerplate.",
            "NOT a substitute for per-slide work: if the user wants a NEW visual specifically on a subset of slides (e.g. 'spice up the slides without backgrounds'), use per-slide setSlideBackground + setShapeTextStyle instead — this tool always touches the whole deck's pres.theme metadata.",
            "Ripple effect: after applying, spot-check a few slides for leftover hard-coded shape colors from earlier edits that clash with the new palette.",
        ].join(" "),
        inputSchema: z.object({
            topic: z.string().optional().describe("The presentation's subject; used to inform the palette choice."),
            audience: z.string().optional(),
            scenario: z.string().optional().describe("e.g. 'product launch', 'academic defense', 'investor pitch'."),
            mode: z.enum(["light", "dark", "auto"]).optional().describe("Force light/dark; default auto."),
            styleHint: z
                .string()
                .optional()
                .describe("Free-form style direction: e.g. 'neon cyberpunk', '日式极简 米色', 'editorial magazine serif', 'apple keynote'."),
            withMotion: z
                .boolean()
                .optional()
                .describe("Whether to also generate + apply a matching motion scheme. Default true. Set false to keep existing animations untouched."),
            preserveImageBackgrounds: z
                .boolean()
                .optional()
                .describe("Default true: skip slides whose background.kind==='image' (keep photo + skip new decoration). Set false ONLY when the user explicitly wants to wipe and re-skin every slide including image-backed ones."),
        }),
        tags: ["mutate", "theme", "llm"],
        execute: async (rt, args) => {
            const config = rt.getConfig();
            if (!isConfigUsable(config))
                return err("AI not configured. Open AI panel → Settings.");
            try {
                const withMotion = args.withMotion !== false;
                const themeGuidance = {
                    ...(args.topic ? { topic: args.topic } : {}),
                    ...(args.audience ? { audience: args.audience } : {}),
                    ...(args.scenario ? { scenario: args.scenario } : {}),
                    ...(args.mode ? { mode: args.mode } : {}),
                    ...(args.styleHint ? { styleHint: args.styleHint } : {}),
                };
                const motionGuidance = {
                    ...(args.topic ? { topic: args.topic } : {}),
                    ...(args.audience ? { audience: args.audience } : {}),
                    ...(args.scenario ? { scenario: args.scenario } : {}),
                    ...(args.styleHint ? { styleHint: args.styleHint } : {}),
                };
                let themeResult;
                if (withMotion) {
                    themeResult = await generateThemeWithMotion(themeGuidance, motionGuidance, { config });
                }
                else {
                    // 退化路径：只生成 theme，不调 LLM 出 motion；motion 字段为 null。
                    const themeOnly = await generateTheme(themeGuidance, { config });
                    themeResult = { ...themeOnly, motion: null, layoutStyle: null };
                }
                const { theme, spec, motion } = themeResult;
                // 应用 theme：走命令栈保证可 undo。motion（如果生成成功）作为独立 cmd 入栈
                //（对话逐轮事务会把两者折叠成本轮的一个 undo 原子）。
                rt.port.execute(new ApplyCustomThemeCmd(theme, {
                    preserveImageBackgrounds: args.preserveImageBackgrounds ?? true,
                }));
                if (motion) {
                    rt.port.execute(new ApplyAutoAnimationsCmd(undefined, { bundle: motion.bundle }));
                }
                return {
                    ok: true,
                    theme: {
                        id: theme.id,
                        name: spec.name,
                        description: spec.description,
                        mode: spec.mode,
                        decoration: spec.decoration,
                        palette: spec.palette,
                        background: spec.background,
                        fonts: spec.fonts,
                    },
                    motion: motion
                        ? {
                            id: motion.bundle.id,
                            name: motion.spec.name,
                            description: motion.spec.description,
                            basedOn: motion.spec.basedOn,
                            slideTransition: motion.spec.slideTransition,
                        }
                        : null,
                };
            }
            catch (e) {
                return err(e.message);
            }
        },
    }),
    defineTool({
        name: "applyThemeVariant",
        description: "Shift the current theme's accents and theme canvas (master/layout background, dec_ decorations, and any color that still matches a theme slot): subtle (less saturation, lighter), bold (more saturation, clearer, not darker), warm, or cool. Text slots and colors that do not match the theme stay. After applying, re-check text contrast on a few slides.",
        inputSchema: z.object({
            variant: z.enum(["subtle", "bold", "warm", "cool"]),
        }),
        tags: ["mutate", "theme"],
        execute: (rt, { variant }) => rt.apply(new ApplyThemeVariantCmd(variant)),
    }),
];
