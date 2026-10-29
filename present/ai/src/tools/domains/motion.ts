// AI motion scheme 生成 / 应用工具：
//   - generateAndApplyMotionScheme → 调 LLM 生成 MotionSchemeSpec，合成 MotionBundle，
//     通过 ApplyAutoAnimationsCmd 把整篇 deck 重新动起来。
//
// 与 generateAndApplyTheme 是平行关系：theme 决定静态视觉，motion 决定动态视觉。
// 用户同时想换主题 + 动画时应调 generateAndApplyTheme（withMotion 默认开）。

import { z } from "zod";
import { defineTool, err } from "../types";
import { isConfigUsable } from "../../config/presets";
import { generateMotionScheme } from "../../generate/stages/theme";
import { ApplyAutoAnimationsCmd } from "../commands/animation-commands";
import { MOTION_BUNDLE_IDS, type MotionBundleId } from "../../animations";
import type { ThemeContextForMotion } from "../../generate/prompts";

function inferMode(bg: string | undefined): "light" | "dark" | undefined {
  if (!bg) return undefined;
  const m = /^#?([0-9a-fA-F]{6})/.exec(bg);
  if (!m) return undefined;
  const h = m[1]!;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const y = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
  return y < 0.35 ? "dark" : "light";
}

// 把 pres.theme 浓缩成 motion prompt 需要的 ThemeContext。
function buildThemeContext(themeMeta: {
  name?: string;
  colors?: Record<string, string>;
}): ThemeContextForMotion {
  const out: ThemeContextForMotion = {};
  if (themeMeta.name) out.name = themeMeta.name;
  const accent1 = themeMeta.colors?.accent1;
  const accent2 = themeMeta.colors?.accent2;
  const bg1 = themeMeta.colors?.bg1;
  if (accent1) {
    const a2 = accent2 ? `, accent2=${accent2}` : "";
    out.accentVibe = `accent1=${accent1}${a2}, bg=${bg1 ?? "#ffffff"}`;
  }
  const mode = inferMode(bg1);
  if (mode) out.mode = mode;
  return out;
}

export const motionTools = [
  defineTool({
    name: "generateAndApplyMotionScheme",
    description: [
      "Design and apply a brand new motion scheme (per-role entrance animations + slide-to-slide transition + pacing) generated on-the-fly by the AI.",
      "Use this when the user asks to: 'make the animations more cinematic', 'change the motion language', 'design custom motion for <vibe>', '动画太单调了', '换一套动画感觉', etc.",
      "Replaces all existing animations + slide transitions across the deck. Reversible via undo.",
      "Prefer this over `applyMainstreamAnimations` (which only picks from 4 built-in bundles) whenever the user wants something not boilerplate.",
      "Optionally pass `basedOnHint` to constrain the base bundle the AI starts from (otherwise the model decides).",
    ].join(" "),
    inputSchema: z.object({
      topic: z.string().optional().describe("The presentation's subject."),
      audience: z.string().optional(),
      scenario: z.string().optional().describe("e.g. 'product launch', 'investor pitch', 'academic defense'."),
      styleHint: z
        .string()
        .optional()
        .describe(
          "Free-form motion direction: e.g. 'cinematic launch', 'snappy editorial', 'playful brand', 'subtle minimal', '安静一点'.",
        ),
      basedOnHint: z
        .enum(MOTION_BUNDLE_IDS as [MotionBundleId, ...MotionBundleId[]])
        .optional()
        .describe("Hint the AI to base the scheme on a specific built-in bundle. Omit to let the model decide."),
    }),
    tags: ["mutate", "motion", "animation", "llm"],
    execute: async (rt, args) => {
      const config = rt.getConfig();
      if (!isConfigUsable(config)) return err("AI not configured. Open AI panel → Settings.");
      try {
        // 把当前 deck 的 theme 摘要透传给 motion prompt —— 让 motion 风格能跟现有 theme 联动。
        const pres = rt.getPres();
        const themeMeta = pres.theme;
        const themeContext = themeMeta ? buildThemeContext(themeMeta) : undefined;
        const styleHint =
          args.styleHint ??
          (args.basedOnHint ? `base on the "${args.basedOnHint}" bundle and refine from there.` : undefined);
        const { bundle, spec } = await generateMotionScheme(
          {
            ...(args.topic ? { topic: args.topic } : {}),
            ...(args.audience ? { audience: args.audience } : {}),
            ...(args.scenario ? { scenario: args.scenario } : {}),
            ...(styleHint ? { styleHint } : {}),
            ...(themeContext ? { themeContext } : {}),
          },
          { config },
        );
        // 全 deck 应用（slideIdx undefined）；先清既有动画 + 过渡。
        rt.port.execute(new ApplyAutoAnimationsCmd(undefined, { bundle }));
        return {
          ok: true,
          motion: {
            id: bundle.id,
            name: spec.name,
            description: spec.description,
            basedOn: spec.basedOn,
            paceMultiplier: spec.paceMultiplier,
            slideTransition: spec.slideTransition,
            roleOverrideKeys: Object.keys(spec.rolesOverride),
          },
        };
      } catch (e) {
        return err((e as Error).message);
      }
    },
  }),
];
