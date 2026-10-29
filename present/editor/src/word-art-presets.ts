// WordArt 预设数据（与 dialog.ts 的 WordArt 编辑器共用）。
//
// 单独成文件的原因：@ppt/ai 的 WordArt 工具（浏览器对话 + Node MCP server）
// 需要这份纯数据，而 dialog.ts 是重 UI 模块（i18n / icons / DOM），Node 下
// 无法加载。本文件必须保持 DOM-free。

// 阴影/装饰效果类型 —— 与 OOXML §20.1.8.x 对齐：
//   - "soft" : <a:outerShdw blurRad=有>，柔和投影
//   - "hard" : <a:outerShdw blurRad=0>，硬阴影（PPT WordArt gallery row 1 后两个）
//   - "glow" : <a:glow rad=有>，光晕
//   - "inner" : <a:innerShdw>
//   - "reflection" : <a:reflection>
export type WordArtShadowKind = "soft" | "hard" | "glow" | "inner" | "reflection";

/** Two-stop linear gradient written as TextRun.fill. */
export interface WordArtGradient {
  from: string;
  to: string;
  /** Degrees, same convention as Paint linear angle (0 = left → right). */
  angle: number;
}

// 完整的 WordArt 编辑状态。null 字段表示「关闭该效果」。
//   - fillColor === "transparent" 表示无填充（与 PPT WordArt outline-only 等价）
//   - fillGradient 非空时字形走渐变，fillColor 仍作纯色回退
//   - outlineColor === null 表示无描边
//   - shadowKind === null 表示无阴影
export interface WordArtState {
  text: string;
  fontFamily: string;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  fillColor: string;
  fillGradient: WordArtGradient | null;
  outlineColor: string | null;
  outlineWidth: number;
  shadowKind: WordArtShadowKind | null;
  shadowColor: string;
}

// PowerPoint 风格的 WordArt 预设。每个预设对应 i18n key dialog.wordart.preset.<id>。
export interface WordArtPreset {
  id: string;
  state: Omit<WordArtState, "text">;
}

// 默认字体：Office 在 WordArt gallery 中使用主题字体 +Mn-lt（基于安装的语言不同
// 而异）。这里用 "Calibri" 作为合理近似；中文字符回落到系统字体栈。
export const PRESET_FONT_DEFAULT = "Calibri, 'PingFang SC', 'Microsoft YaHei', sans-serif";

// Office 2013+ 默认主题颜色（ECMA-376 §20.1.6.x dk1/lt1/accent1-6）
const CLR_TX1 = "#000000"; // text 1（深）
const CLR_BG1 = "#FFFFFF"; // background 1（浅）
const CLR_BG2 = "#E7E6E6"; // background 2（极浅灰）
const CLR_ACCENT_1 = "#4472C4"; // 蓝
const CLR_ACCENT_2 = "#ED7D31"; // 橙
const CLR_ACCENT_3 = "#A5A5A5"; // 灰
const CLR_ACCENT_4 = "#FFC000"; // 金
const CLR_ACCENT_5 = "#5B9BD5"; // 浅蓝
const CLR_ACCENT_6 = "#70AD47"; // 绿
const CLR_TAN = "#C0A074"; // background 2 lumMod 90 lumOff 0（PPT 暖棕色调）
const CLR_DARK_RED = "#C00000";
const CLR_PURPLE = "#7030A0";
const CLR_OLIVE = "#475F2A";

const baseFont = (over: Partial<Omit<WordArtState, "text">> = {}): Omit<WordArtState, "text"> => ({
  fontFamily: PRESET_FONT_DEFAULT,
  fontSize: 54,
  bold: true,
  italic: false,
  fillColor: CLR_TX1,
  fillGradient: null,
  outlineColor: null,
  outlineWidth: 1,
  shadowKind: null,
  shadowColor: "#000000",
  ...over,
});

// PowerPoint 风格预设。命名遵循 "Fill - X, Y"，i18n key 见 dialog.wordart.preset.<id>。
// 渐变写入 TextRun.fill，内阴影 / 映像写入 run.effects（innerShdw / reflection）。
export const WORDART_PRESETS: WordArtPreset[] = [
  // Row 1 — Plain solid + soft shadow
  { id: "fillTextSoft", state: baseFont({ fillColor: CLR_TX1, shadowKind: "soft", shadowColor: "#000000" }) },
  { id: "fillAccent1Soft", state: baseFont({ fillColor: CLR_ACCENT_1, shadowKind: "soft", shadowColor: "#000000" }) },
  { id: "fillWhiteOutlineAccent1Soft", state: baseFont({ fillColor: CLR_BG1, outlineColor: CLR_ACCENT_1, outlineWidth: 1, shadowKind: "soft", shadowColor: "#000000" }) },
  { id: "fillTextOutlineWhiteHardAccent1", state: baseFont({ fillColor: CLR_TX1, outlineColor: CLR_BG1, outlineWidth: 1.5, shadowKind: "hard", shadowColor: CLR_ACCENT_1 }) },
  { id: "fillAccent1OutlineWhiteHardAccent1", state: baseFont({ fillColor: CLR_ACCENT_1, outlineColor: CLR_BG1, outlineWidth: 1.5, shadowKind: "hard", shadowColor: CLR_ACCENT_1 }) },
  // Row 2 — Mid-tone fills with various effects
  { id: "fillGray50Soft", state: baseFont({ fillColor: CLR_ACCENT_3, shadowKind: "soft", shadowColor: "#000000" }) },
  { id: "fillAccent1GlowAccent2", state: baseFont({ fillColor: CLR_ACCENT_1, shadowKind: "glow", shadowColor: CLR_ACCENT_2 }) },
  { id: "fillTan", state: baseFont({ fillColor: CLR_TAN, shadowKind: "inner", shadowColor: "#5c4033" }) },
  { id: "fillOliveOutline", state: baseFont({ fillColor: CLR_ACCENT_6, outlineColor: CLR_OLIVE, outlineWidth: 1 }) },
  { id: "fillTextOutlineWhiteHardBlack", state: baseFont({ fillColor: CLR_TX1, outlineColor: CLR_BG1, outlineWidth: 1.5, shadowKind: "hard", shadowColor: "#000000" }) },
  // Row 3 — Bold accent variations
  { id: "fillDarkRedSoft", state: baseFont({ fillColor: CLR_DARK_RED, shadowKind: "soft", shadowColor: "#000000" }) },
  { id: "fillPurpleHardWhite", state: baseFont({ fillColor: CLR_PURPLE, outlineColor: CLR_BG1, outlineWidth: 1.5, shadowKind: "hard", shadowColor: "#000000" }) },
  { id: "fillGoldGlow", state: baseFont({ fillColor: CLR_ACCENT_4, shadowKind: "glow", shadowColor: CLR_ACCENT_4 }) },
  { id: "fillOrangeSoft", state: baseFont({ fillColor: CLR_ACCENT_2, shadowKind: "soft", shadowColor: "#000000" }) },
  { id: "outlineAccent1", state: baseFont({ fillColor: "transparent", outlineColor: CLR_ACCENT_1, outlineWidth: 2 }) },
  {
    id: "gradientAccent1",
    state: baseFont({
      fillColor: CLR_ACCENT_1,
      fillGradient: { from: CLR_ACCENT_5, to: CLR_ACCENT_1, angle: 90 },
    }),
  },
  {
    id: "fillAccent1Reflection",
    state: baseFont({ fillColor: CLR_ACCENT_1, shadowKind: "reflection", shadowColor: CLR_ACCENT_1 }),
  },
];

// dialog.openWordArtDialog 的 default。调用方传 existing 时这些会被覆盖。
export function defaultWordArtState(text: string): WordArtState {
  return { text, ...WORDART_PRESETS[0]!.state };
}

