// 内置主题：色板 + 字体 + 装饰 + 默认背景。
//
// 设计要点：
//   1. 主题是 compile 阶段使用的"上下文"，layout 内部通过 ThemeContext 取色和字号。
//   2. 目前 13 套，覆盖主流场景（商务/学术/创意/极简/暗黑/科技/自然/暖色/杂志/终端/
//      粉彩/高奢/国风）；扩展只需新增条目，并同步 schema 的 BUILTIN_THEME_IDS +
//      本文件的 THEME_OUTLINE_HINTS（有编译/运行期断言守护）。
//   3. 色板字段名直接复用 OOXML 主题色语义（accent1/accent2/.../bg/text），
//      未来如果接入 master theme 序列化可以零成本对接。
//   4. fontFamily 使用 web-safe + CJK 兼容栈，避免 PPT 渲染缺字。

import { BUILTIN_THEME_IDS, type BuiltinThemeId } from "./builtin-ids";

export interface ThemePalette {
  bg: string;
  bgAlt: string;
  text: string;
  textMuted: string;
  accent1: string;
  accent2: string;
  accent3: string;
  accent4: string;
  divider: string;
}

export interface ThemeFonts {
  title: string;
  body: string;
  // 等宽字体（代码/编号）。
  mono: string;
}

export interface ThemeFontSizes {
  // 单位：px（与 slide 内部坐标系一致）。
  coverTitle: number;
  coverSubtitle: number;
  sectionTitle: number;
  pageTitle: number;
  body: number;
  small: number;
  quote: number;
}

export interface ThemeMetrics {
  // 安全边距（相对 slide 宽高的比例）。
  marginX: number;
  marginY: number;
  // 标题与正文之间的间距（px）。
  titleBodyGap: number;
  // 项目符号行高倍数。
  bulletLineHeight: number;
}

/**
 * 装饰层定义（AI 生成主题 / 自定义主题用）：在 slide 背景上方、内容下方插入的
 * 装饰图形。renderLayout 在 compile 时把它们追加成 shape，置于普通内容之前。
 *
 * 内置 8 套具体风格（每套产出多个 shape，形成独立视觉语言）：
 * - `aurora`：极光光幕（深色系 / 发布会）—— 两道左右出血的横向光幕 + 底部细线
 * - `tech-bracket`：科技L形 bracket（科技 / 工程）—— 左侧竖条 + 右下 L 角标
 * - `neon-burst`：霓虹灯管（创意 / 夜场）—— 顶栏 + 贴边亮管柔光 + 散点
 * - `authority`：权威双条（商务 / 严肃）—— 左侧纵条 + 底栏双色段
 * - `manuscript`：手稿双线（学术 / 出版）—— 顶底横线 + 居中装饰点
 * - `ink-thread`：墨线单划（极简 / 日式）—— 单条精准横线
 * - `organic-blobs`：层叠远山（自然 / 生态）—— 两道出血扁平山脊 + 地平线
 * - `sunrise-arc`：朝阳弧（暖色 / 活力）—— 底部半圆弧光 + 底栏
 * - `masthead`：杂志报头（编辑 / 出版）—— 顶部粗实色报头条 + 细分隔线 + 左侧页边线 + 底部页码块
 * - `terminal`：终端扫描线（极客 / 开发）—— 角落 L 形括号 + 左上光标块 + 横向扫描线 + 命令提示符
 * - `confetti`：彩纸礼花（活泼 / 教育）—— 多彩散点圆 + 底部柔和色带
 * - `gilded`：鎏金细框（高奢 / 品牌）—— 四边内嵌金色细线框 + 四角节点
 * - `ink-wash`：水墨留白（国风 / 文艺）—— 下半部远山淡墨 + 朱红印章方块 + 竖向墨线
 * - `corner-gradient-shape`：legacy 别名，渲染等同 `aurora`（AI 生成主题兼容）
 * - `geometric-lines`：通用几何线（AI 生成主题兼容）
 * - `bottom-accent-bar`：通用底栏（AI 生成主题兼容）
 * - `dotted-grid`：通用点阵（AI 生成主题兼容）
 * - `none`：无装饰
 */
export type ThemeDecoration =
  | "none"
  | "aurora"
  | "tech-bracket"
  | "neon-burst"
  | "authority"
  | "manuscript"
  | "ink-thread"
  | "organic-blobs"
  | "sunrise-arc"
  | "masthead"
  | "terminal"
  | "confetti"
  | "gilded"
  | "ink-wash"
  | "corner-gradient-shape"
  | "geometric-lines"
  | "bottom-accent-bar"
  | "dotted-grid";

/**
 * 标题"艺术字"处理（WordArt）。
 *
 * ⚠ 渲染能力边界（见 packages/renderer/src/svg-backend.ts / canvas-backend.ts）：
 *   - 已支持：纯色填充（run.color）、文字描边（run.textOutline）、字距（letterSpacing）、
 *     字重/大小、全大写（caps）、形状级阴影（shape.shadow）、形状 transform 旋转/斜切。
 *   - **不支持**：渐变文字填充（run.fill gradient 未被任何 backend 消费）、prstTxWarp 路径排字。
 * 因此这里的"艺术字"是用 **色彩 + 描边 + 字距 + 阴影 + 轻微变形（旋转）** 组合出的标题
 * 视觉强化，而不是真正的渐变 / 弯曲文字。模板层 (template.ts) 把这些字段烘焙进
 * 标题占位符的 run / shape，用户输入标题即继承该风格。
 */
export interface ThemeWordArt {
  /** 标题色（默认 palette.text）。 */
  color?: string;
  /** 文字描边色。 */
  outlineColor?: string;
  /** 描边宽度（px）。 */
  outlineWidth?: number;
  /** 字距（px，正=展开）。 */
  letterSpacing?: number;
  /** 字重（默认 800）。 */
  weight?: number;
  /** 是否全大写（仅影响拉丁字母；CJK 无视）。一般只用于 eyebrow/kicker。 */
  caps?: boolean;
  /** 标题阴影（形状级 drop shadow）。 */
  shadow?: { color: string; alpha: number; blur: number; dx: number; dy: number };
  /** 封面标题/点缀的轻微变形角度（度，正=顺时针）。 */
  rotation?: number;
}

/**
 * 模板版式家族：决定 template.ts 生成 layout 时的几何骨架（标题对齐 / 封面锚点 /
 * 分隔线 / 双栏比例 / 内容缩进 / 终端提示符等），让不同模板**结构**也不同，
 * 而不只是换色换字。缺省 `classic` = 历史的左对齐版式。
 *
 * - `classic`：左对齐 kicker + 左标题 + 细分隔线（商务/学术/极简/科技…）
 * - `centered`：居中 kicker + 居中标题，对称留白（创意/粉彩）
 * - `editorial`：封面标题下沉 + 粗顶线 + 不对称宽左栏（杂志/高奢/国风）
 * - `terminal`：标题前缀命令提示符 + 左侧 gutter，等宽气质（终端）
 */
export type TemplateLayoutId = "classic" | "centered" | "editorial" | "terminal";

/**
 * 封面主视觉母题：决定 title 版式上"标题周围那组装饰"的形状语言，以及标题块的
 * 纵向偏移 / 左缩进 / 页脚处理。
 *
 * 为什么要和 TemplateLayoutId 分开：版式家族只有 4 个，13 套内置主题里 7 套都落在
 * `classic`，封面因此长得一模一样（同一条斜杠 + 同一根短条 + 同样的标题位置），
 * 只有配色不同。母题是**正交**维度，缺省从 `decoration` 推导 —— 主题的装饰语言本来
 * 就各不相同，让封面呼应它，新主题（含 AI 生成）不用额外配置就自带差异。
 * 见 template-masters.ts 的 `coverMotifFor` / `coverMotifShapes`。
 */
export type CoverMotifId =
  | "slash" // 斜向 ribbon + 短粗条（历史默认，现仅作兜底）
  | "stack" // 三条递减横线：秩序 / 权威
  | "rule-box" // 通栏细线上下夹住标题：学术版心
  | "spine" // 左侧贯穿竖线：画廊 / 极简
  | "bracket" // 左上 L 形角标：技术 / 终端
  | "halo" // 大圆环 + 实心点：极光 / 深色
  | "blob" // 错落柔性圆：自然
  | "arc" // 地平线大弧：日出 / 暖色
  | "frame" // 四角线框：高奢
  | "burst" // 放射短斜条：创意
  | "dots" // 点阵：粉彩
  | "wash" // 侧边大色块：水墨 / 国风
  | "masthead" // 通栏粗顶线 + 次色短段：杂志报头
  | "terminal-bar"; // 状态条 + 短竖标：CRT 终端（Phosphor 封面，无 ~ $）

export interface ThemeDef {
  id: string;
  name: string;
  description: string;
  palette: ThemePalette;
  fonts: ThemeFonts;
  fontSizes: ThemeFontSizes;
  metrics: ThemeMetrics;
  /** 版式骨架家族；缺省 classic（见 TemplateLayoutId）。 */
  layout?: TemplateLayoutId;
  /**
   * 封面主视觉母题；缺省由 `decoration` 推导（见 CoverMotifId）。
   * 只在"想让封面刻意偏离装饰语言"时才显式写，否则留空即可。
   */
  coverMotif?: CoverMotifId;
  /**
   * 封面是否显示 terminal 版式的命令提示符（默认 `~ $`）。
   * 仅影响 title 版式；内容页仍走 layout 的 `prompt` 前缀。设为 `false` 可关掉。
   */
  coverPrompt?: boolean;
  /**
   * 可选：内容页正文区铺一层"内容卡片"底板（不依赖 terminal 版式）。
   * 深色主题（tech/dark）开启后正文区多一层 bgAlt 卡片 → 在深底上更有层次/聚焦。
   * 与 terminal 版式的代码块底板共用渲染，但只有 terminal 才画"红黄绿"窗口圆点。
   */
  contentPanel?: boolean;
  /** 标题艺术字处理（可选）。 */
  titleWordArt?: ThemeWordArt;
  /**
   * 可选：覆盖 slide.background。内置 5 套主题不设此字段，走 solid bg；
   * AI 生成主题（generateTheme）通常会写 linear/radial gradient，让发布会风
   * / 暗色主题立刻有"层次感"。
   */
  backgroundPaint?: import("@ppt/core").Paint;
  /** 装饰层：compile.ts 在 render 后追加到 layer.shapes 顶部（z 最低）。 */
  decoration?: ThemeDecoration;
  /**
   * 字体 Google Fonts CSS link（注入 <head>，让 SVG 渲染时能解析到真正的字形）。
   * 内置主题用系统 fallback 栈，无需 link。AI 生成主题会指定 1-3 条 link。
   */
  fontCssLinks?: Array<{ family: string; cssUrl: string }>;
}

import { THEME_FONT_POOL } from "./fonts/inject";

// 字体 fallback 链统一原则：拉丁字 → 简体中文 → 系统兜底。
const FONT_MONO = '"JetBrains Mono", "Menlo", "Consolas", "Noto Sans Mono CJK SC", monospace';

// CJK 兜底链：所有内置主题的拉丁字体都补一段中文回退，避免缺字。
const CJK_TAIL = '"PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC"';

// AI 生成主题在字体 preset 缺失时的中性兜底栈。
const FONT_SANS = `"Inter", -apple-system, BlinkMacSystemFont, ${CJK_TAIL}, sans-serif`;
const FONT_DISPLAY = `"Space Grotesk", "Inter", ${CJK_TAIL}, sans-serif`;

/**
 * 从 THEME_FONT_POOL 取某字体的 CSS stack（含 CJK 兜底）。找不到回退到中性 sans。
 * 内置主题改用 pool 字体（每条都带 Google Fonts cssUrl），保证"字体真的随主题加载"，
 * 而不是落到系统默认字形 → 这是之前"字体不随主题"的根因之一。
 */
function poolStack(family: string): string {
  const p = THEME_FONT_POOL.find((x) => x.family === family);
  if (!p) return `-apple-system, BlinkMacSystemFont, ${CJK_TAIL}, sans-serif`;
  // pool.stack 已含 fallback；display/serif 仍补 CJK 兜底（pool 的 latin 字体未必含中文回退）。
  return p.language === "cjk" ? p.stack : `${p.stack.replace(/, (sans-serif|serif|monospace)$/, "")}, ${CJK_TAIL}, ${p.category === "serif" ? "serif" : "sans-serif"}`;
}

/** 组装某组字体 family 的 Google Fonts cssLinks（去重、跳过 pool 里没有的）。 */
function poolLinks(...families: string[]): Array<{ family: string; cssUrl: string }> {
  const seen = new Set<string>();
  const out: Array<{ family: string; cssUrl: string }> = [];
  for (const f of families) {
    if (seen.has(f)) continue;
    seen.add(f);
    const p = THEME_FONT_POOL.find((x) => x.family === f);
    if (p) out.push({ family: p.family, cssUrl: p.cssUrl });
  }
  return out;
}

const DEFAULT_METRICS: ThemeMetrics = {
  marginX: 0.06,
  marginY: 0.08,
  titleBodyGap: 24,
  bulletLineHeight: 1.5,
};

const DEFAULT_FONT_SIZES: ThemeFontSizes = {
  // 与 AI compile 封面路径的 coverTitle×1.25 对齐；旧默认 56/24 在 1280×720 上偏小。
  coverTitle: 72,
  coverSubtitle: 30,
  sectionTitle: 44,
  pageTitle: 32,
  body: 18,
  small: 14,
  quote: 26,
};

export const THEMES: Record<string, ThemeDef> = {
  // ═══════════════════════════════════════════════════════════════════════════
  // Atelier 系列（v2 全量换血）：13 套内置主题按新艺术方向重新设计。
  // 定位：**手动指定 / 主题画廊 / AI 生成失败的兜底** —— 默认生成路径交给
  // LLM 现场设计（generateTheme / generateLayoutStyle），不参考这些 preset。
  // id 保持不变（i18n / 动画 bundle 推断 / 模板接线依赖 id 语义分类）。
  // ═══════════════════════════════════════════════════════════════════════════

  // ── business · Arctic Signal ── 冰白精密 + 信号红，工程报告的克制权威
  business: {
    id: "business",
    name: "Arctic Signal",
    description: "冰白精密 · 信号红锚点 · Manrope 冷静排印",
    palette: {
      bg: "#f2f5f8",
      bgAlt: "#e4eaf1",
      text: "#0c1420",
      textMuted: "#4d5f74",
      accent1: "#d91f30",
      accent2: "#33506d",
      accent3: "#7e93a9",
      accent4: "#0e7490",
      divider: "#d3dce6",
    },
    fonts: { title: poolStack("Manrope"), body: poolStack("Inter"), mono: FONT_MONO },
    fontSizes: DEFAULT_FONT_SIZES,
    metrics: DEFAULT_METRICS,
    decoration: "authority",
    titleWordArt: { color: "#0c1420", weight: 800, letterSpacing: -0.5 },
    fontCssLinks: poolLinks("Manrope", "Inter"),
  },
  // ── academic · Sandstone ── 暖砂岩纸面 + 焦赭/深青，出版级书卷气
  academic: {
    id: "academic",
    name: "Sandstone",
    description: "暖砂岩 · 焦赭深青 · Fraunces 光学衬线",
    palette: {
      bg: "#f6efe4",
      bgAlt: "#ecdfc9",
      text: "#241a10",
      textMuted: "#6f5b41",
      accent1: "#a2451c",
      accent2: "#155e63",
      accent3: "#8c6d1f",
      accent4: "#1e3a8a",
      divider: "#dccdb4",
    },
    fonts: { title: poolStack("Fraunces"), body: poolStack("Newsreader"), mono: FONT_MONO },
    fontSizes: { ...DEFAULT_FONT_SIZES, coverTitle: 77, body: 19 },
    metrics: DEFAULT_METRICS,
    decoration: "manuscript",
    titleWordArt: { color: "#241a10", weight: 900, letterSpacing: -0.5 },
    fontCssLinks: poolLinks("Fraunces", "Newsreader"),
  },
  // ── creative · Violet Hour ── 暮色靛底，热粉→紫的电影感消费品牌
  creative: {
    id: "creative",
    name: "Violet Hour",
    description: "暮色靛紫 · 热粉电光 · Bricolage 圆润 display",
    palette: {
      bg: "#100829",
      bgAlt: "#1e1145",
      text: "#f6f2ff",
      textMuted: "#c4b1f0",
      accent1: "#ff2e92",
      accent2: "#8b5cf6",
      accent3: "#22d3ee",
      accent4: "#fbbf24",
      divider: "#3b2a6b",
    },
    fonts: { title: poolStack("Bricolage Grotesque"), body: poolStack("Plus Jakarta Sans"), mono: FONT_MONO },
    fontSizes: { ...DEFAULT_FONT_SIZES, coverTitle: 77 },
    metrics: DEFAULT_METRICS,
    layout: "centered",
    decoration: "neon-burst",
    titleWordArt: {
      color: "#f6f2ff",
      weight: 800,
      letterSpacing: -0.5,
      shadow: { color: "#ff2e92", alpha: 0.5, blur: 24, dx: 0, dy: 0 },
    },
    backgroundPaint: {
      kind: "linear",
      angle: 145,
      stops: [
        { offset: 0, color: "#241055" },
        { offset: 0.55, color: "#100829" },
        { offset: 1, color: "#0a0620" },
      ],
    },
    fontCssLinks: poolLinks("Bricolage Grotesque", "Plus Jakarta Sans"),
  },
  // ── minimal · Gallery ── 画廊暖白 + 单一克莱因蓝锚点，美术馆式留白
  minimal: {
    id: "minimal",
    name: "Gallery",
    description: "画廊暖白 · 克莱因蓝单锚 · Inter 极简排印",
    palette: {
      bg: "#fcfcfb",
      bgAlt: "#f2f1ee",
      text: "#111110",
      textMuted: "#6e6c66",
      accent1: "#002fa7",
      accent2: "#111110",
      accent3: "#a6a49c",
      accent4: "#e0301e",
      divider: "#e7e5e0",
    },
    fonts: { title: poolStack("Inter"), body: poolStack("Inter"), mono: FONT_MONO },
    fontSizes: DEFAULT_FONT_SIZES,
    metrics: { ...DEFAULT_METRICS, marginX: 0.1, marginY: 0.12 },
    decoration: "ink-thread",
    titleWordArt: { color: "#111110", weight: 600, letterSpacing: -0.5 },
    fontCssLinks: poolLinks("Inter"),
  },
  // ── dark · Midnight Gold ── 真午夜蓝黑 + 香槟金，颁奖礼级发布会
  dark: {
    id: "dark",
    name: "Midnight Gold",
    description: "午夜深蓝 · 香槟金辉 · Sora 发光标题",
    palette: {
      bg: "#0a0c14",
      bgAlt: "#141827",
      text: "#f5f1e8",
      textMuted: "#9aa0b5",
      accent1: "#e0b458",
      accent2: "#8fae8b",
      accent3: "#6b7280",
      accent4: "#38bdf8",
      divider: "#242a3c",
    },
    fonts: { title: poolStack("Sora"), body: poolStack("Inter"), mono: FONT_MONO },
    fontSizes: { ...DEFAULT_FONT_SIZES, coverTitle: 77 },
    metrics: DEFAULT_METRICS,
    contentPanel: true,
    decoration: "aurora",
    titleWordArt: {
      color: "#f5f1e8",
      weight: 800,
      letterSpacing: -0.5,
      shadow: { color: "#e0b458", alpha: 0.45, blur: 26, dx: 0, dy: 0 },
    },
    backgroundPaint: {
      kind: "radial",
      path: "circle",
      fillToRect: { l: 0, t: 0, r: 1, b: 1 },
      stops: [
        { offset: 0, color: "#161c33" },
        { offset: 0.55, color: "#0a0c14" },
        { offset: 1, color: "#05060b" },
      ],
    },
    fontCssLinks: poolLinks("Sora", "Inter"),
  },
  // ── tech · Graphite Acid ── 石墨炭 + 酸性青柠，开发者/数据的高压感
  tech: {
    id: "tech",
    name: "Graphite Acid",
    description: "石墨炭底 · 酸性青柠 · Space Grotesk 工程排印",
    palette: {
      bg: "#141518",
      bgAlt: "#1e2024",
      text: "#eef1ec",
      textMuted: "#a2aca0",
      accent1: "#c3f53c",
      accent2: "#22d3ee",
      accent3: "#8b8f96",
      accent4: "#f472b6",
      divider: "#2a2d33",
    },
    fonts: { title: poolStack("Space Grotesk"), body: poolStack("Inter"), mono: poolStack("Space Mono") },
    fontSizes: DEFAULT_FONT_SIZES,
    metrics: DEFAULT_METRICS,
    contentPanel: true,
    decoration: "tech-bracket",
    titleWordArt: {
      color: "#eef1ec",
      weight: 700,
      letterSpacing: 0,
      shadow: { color: "#c3f53c", alpha: 0.4, blur: 18, dx: 0, dy: 0 },
    },
    backgroundPaint: {
      kind: "linear",
      angle: 150,
      stops: [
        { offset: 0, color: "#1b1d21" },
        { offset: 0.5, color: "#141518" },
        { offset: 1, color: "#0d0e10" },
      ],
    },
    fontCssLinks: poolLinks("Space Grotesk", "Inter", "Space Mono"),
  },
  // ── nature · Moss & Clay ── 奶油纸 + 苔藓深绿/陶土，有机高级感
  nature: {
    id: "nature",
    name: "Moss & Clay",
    description: "奶油纸面 · 苔藓陶土 · Fraunces 有机衬线",
    palette: {
      bg: "#f7f5ec",
      bgAlt: "#ebe8d8",
      text: "#1c2317",
      textMuted: "#5c6a52",
      accent1: "#2f5d33",
      accent2: "#c05f33",
      accent3: "#7ba05b",
      accent4: "#a08118",
      divider: "#dcd9c4",
    },
    fonts: { title: poolStack("Fraunces"), body: poolStack("DM Sans"), mono: FONT_MONO },
    fontSizes: DEFAULT_FONT_SIZES,
    metrics: DEFAULT_METRICS,
    decoration: "organic-blobs",
    titleWordArt: { color: "#1c2317", weight: 800, letterSpacing: -0.5 },
    fontCssLinks: poolLinks("Fraunces", "DM Sans"),
  },
  // ── warm · Ember ── 陶烧暖调，余烬橙 + 酒红，人味与能量
  warm: {
    id: "warm",
    name: "Ember",
    description: "陶烧暖调 · 余烬橙酒红 · Bricolage 有力标题",
    palette: {
      bg: "#faf3ec",
      bgAlt: "#f3e4d5",
      text: "#2a1810",
      textMuted: "#8a6650",
      accent1: "#c93c10",
      accent2: "#9c2b3b",
      accent3: "#e9a13b",
      accent4: "#4f6d7a",
      divider: "#e6d5c3",
    },
    fonts: { title: poolStack("Bricolage Grotesque"), body: poolStack("DM Sans"), mono: FONT_MONO },
    fontSizes: { ...DEFAULT_FONT_SIZES, coverTitle: 77 },
    metrics: DEFAULT_METRICS,
    decoration: "sunrise-arc",
    titleWordArt: {
      color: "#2a1810",
      weight: 800,
      letterSpacing: -0.5,
      shadow: { color: "#c93c10", alpha: 0.25, blur: 0, dx: 3, dy: 3 },
    },
    fontCssLinks: poolLinks("Bricolage Grotesque", "DM Sans"),
  },
  // ── editorial · Ink & Ember ── 近黑墨底暗编辑部 + 余烬橙，野兽派杂志
  editorial: {
    id: "editorial",
    name: "Ink & Ember",
    description: "近黑墨底 · 余烬橙骨白 · Playfair 暗报头",
    palette: {
      bg: "#111013",
      bgAlt: "#1c1a1e",
      text: "#f4efe9",
      textMuted: "#a39a8e",
      accent1: "#ff5a1f",
      accent2: "#d9c8b4",
      accent3: "#6e675e",
      accent4: "#3d8b8b",
      divider: "#2b2830",
    },
    fonts: { title: poolStack("Playfair Display"), body: poolStack("Inter"), mono: FONT_MONO },
    fontSizes: { ...DEFAULT_FONT_SIZES, coverTitle: 82, body: 19 },
    metrics: DEFAULT_METRICS,
    layout: "editorial",
    decoration: "masthead",
    titleWordArt: { color: "#f4efe9", weight: 900, letterSpacing: -1 },
    fontCssLinks: poolLinks("Playfair Display", "Inter"),
  },
  // ── terminal · Phosphor ── 深 CRT 绿黑 + 磷光绿/琥珀，复古终端
  terminal: {
    id: "terminal",
    name: "Phosphor",
    description: "CRT 深绿 · 磷光琥珀 · 等宽扫描线",
    palette: {
      bg: "#0c1210",
      bgAlt: "#14201b",
      text: "#dcf5e4",
      textMuted: "#7fa88d",
      accent1: "#2ee88a",
      accent2: "#ffb454",
      accent3: "#5eead4",
      accent4: "#f471b5",
      divider: "#1f3329",
    },
    fonts: { title: poolStack("Space Mono"), body: poolStack("JetBrains Mono"), mono: poolStack("JetBrains Mono") },
    fontSizes: { ...DEFAULT_FONT_SIZES, coverTitle: 67 },
    metrics: DEFAULT_METRICS,
    layout: "terminal",
    coverPrompt: false,
    coverMotif: "terminal-bar",
    decoration: "terminal",
    contentPanel: true,
    titleWordArt: {
      color: "#dcf5e4",
      weight: 700,
      letterSpacing: 0,
      shadow: { color: "#2ee88a", alpha: 0.45, blur: 18, dx: 0, dy: 0 },
    },
    backgroundPaint: {
      kind: "linear",
      angle: 160,
      stops: [
        { offset: 0, color: "#101a15" },
        { offset: 0.6, color: "#0c1210" },
        { offset: 1, color: "#070b08" },
      ],
    },
    fontCssLinks: poolLinks("Space Mono", "JetBrains Mono"),
  },
  // ── pastel · Porcelain ── 冷瓷雾彩：长春花蓝 + 瓷粉/薄荷，脱离马卡龙腻感
  pastel: {
    id: "pastel",
    name: "Porcelain",
    description: "冷瓷雾彩 · 长春花蓝 · DM Sans 轻盈亲和",
    palette: {
      bg: "#f6f6f9",
      bgAlt: "#eceef4",
      text: "#20242e",
      textMuted: "#69707f",
      accent1: "#4a58bd",
      accent2: "#e8879c",
      accent3: "#79c3b7",
      accent4: "#e0b56a",
      divider: "#dee1ea",
    },
    fonts: { title: poolStack("DM Sans"), body: poolStack("DM Sans"), mono: FONT_MONO },
    fontSizes: DEFAULT_FONT_SIZES,
    metrics: DEFAULT_METRICS,
    layout: "centered",
    decoration: "confetti",
    titleWordArt: { color: "#20242e", weight: 800, letterSpacing: -0.5 },
    fontCssLinks: poolLinks("DM Sans"),
  },
  // ── luxe · Bordeaux ── 酒红丝绒 + 香槟金，高奢品牌的温度版黑金
  luxe: {
    id: "luxe",
    name: "Bordeaux",
    description: "酒红丝绒 · 香槟金饰 · Playfair 高奢衬线",
    palette: {
      bg: "#1c0d12",
      bgAlt: "#2a151c",
      text: "#f4e9df",
      textMuted: "#b39a8c",
      accent1: "#d9b47f",
      accent2: "#8c2f39",
      accent3: "#5d6e64",
      accent4: "#c98a4b",
      divider: "#3c2229",
    },
    fonts: { title: poolStack("Playfair Display"), body: poolStack("Manrope"), mono: FONT_MONO },
    fontSizes: { ...DEFAULT_FONT_SIZES, coverTitle: 77 },
    metrics: DEFAULT_METRICS,
    layout: "editorial",
    decoration: "gilded",
    titleWordArt: {
      color: "#f4e9df",
      weight: 700,
      letterSpacing: 1,
      shadow: { color: "#d9b47f", alpha: 0.35, blur: 16, dx: 0, dy: 0 },
    },
    backgroundPaint: {
      kind: "radial",
      path: "circle",
      fillToRect: { l: 0, t: 0, r: 1, b: 1 },
      stops: [
        { offset: 0, color: "#2c1219" },
        { offset: 0.6, color: "#1c0d12" },
        { offset: 1, color: "#0f0609" },
      ],
    },
    fontCssLinks: poolLinks("Playfair Display", "Manrope"),
  },
  // ── ink · Porcelain Indigo ── 瓷白 + 帝国靛/鎏金/朱砂，青花文气
  ink: {
    id: "ink",
    name: "Porcelain Indigo",
    description: "瓷白青花 · 帝国靛朱砂 · 宋体雅正",
    palette: {
      bg: "#f7f6f2",
      bgAlt: "#eceae2",
      text: "#1a2233",
      textMuted: "#5c6678",
      accent1: "#26357c",
      accent2: "#b8892d",
      accent3: "#7c8aa8",
      accent4: "#9f3a38",
      divider: "#dfdcd2",
    },
    fonts: { title: poolStack("Noto Serif SC"), body: poolStack("Noto Sans SC"), mono: FONT_MONO },
    fontSizes: { ...DEFAULT_FONT_SIZES, coverTitle: 77 },
    metrics: { ...DEFAULT_METRICS, marginX: 0.08 },
    layout: "editorial",
    decoration: "ink-wash",
    titleWordArt: { color: "#1a2233", weight: 700, letterSpacing: 2 },
    fontCssLinks: poolLinks("Noto Serif SC", "Noto Sans SC"),
  },
};

/**
 * 把一份主题用到的 Google Fonts 注入当前 document（idempotent）。
 * 内置模板在 playground 启动时调用，保证"用内置模板新建"时标题/正文字体真的加载，
 * 而不是落到系统默认字形（这是之前"字体不随主题"的根因之一）。
 * 非浏览器环境（SSR / 子进程）自动跳过。
 */
export function injectThemeFonts(theme: ThemeDef): void {
  for (const link of theme.fontCssLinks ?? []) injectFontCss(link.cssUrl, link.family);
}

export const THEME_IDS = Object.keys(THEMES);

/**
 * 每套主题的「适用场景」一句话（英文，喂给 outline 的 themeId 选择器）。
 * 这是 outline prompt 里主题映射的**单一事实源** —— 新增主题时在这里补一行即可，
 * prompt 会自动带上。
 *
 * 类型 `Record<BuiltinThemeId, string>` 强制覆盖 schema 里全部 builtin id：漏一个就编译报错。
 * 加新主题的完整流程：THEMES 加条目 → BUILTIN_THEME_IDS 加 id → 这里加一行 hint。
 */
export const THEME_OUTLINE_HINTS: Record<BuiltinThemeId, string> = {
  business: "corporate, finance, consulting, engineering reports (arctic ice + signal red, precise)",
  academic: "research, education, whitepapers, lectures (warm sandstone paper, optical serif)",
  creative: "marketing, brand launch, consumer, nightlife (violet-hour dusk, hot pink electric)",
  minimal: "design-forward product, portfolio, studio (gallery white, single Klein-blue anchor)",
  dark: "keynote, product launch, awards, cinematic reveal (true midnight + champagne gold)",
  tech: "engineering, SaaS, developer tools, data/AI (graphite charcoal + acid lime)",
  nature: "sustainability, health, wellness, organic premium (cream + moss green + clay)",
  warm: "energetic talks, lifestyle, community, culture (kiln-fired ember orange + wine)",
  editorial: "magazine feature, storytelling, brand editorial (near-black ink + ember orange, brutalist serif)",
  terminal: "developer, hacker, cybersecurity, retro-tech (CRT phosphor green + amber, monospace)",
  pastel: "education, friendly consumer product, community (cool porcelain mist, periwinkle)",
  luxe: "luxury, fashion, premium brand, hospitality (bordeaux velvet + champagne gold)",
  ink: "Chinese cultural, heritage, literary, art (porcelain white + imperial indigo, qinghua)",
};

/**
 * 每套内置主题的「AI 生成种子」—— 一句 **英文 styleHint**，喂给 `generateTheme` 让 AI 现场设计
 * 一套贴合该风格系统、比静态 preset 更精致的主题。
 *
 * 设计要点（对应 `.cursor/skills/ppt-style-systems/SKILL.md` +
 * `packages/ai/src/skills/builtin/ppt-style-systems.md`）：
 *   - 每条种子把该风格系统的 **精确色锚 + 字体配对 + 版式纪律 + 装饰气质** 写死，
 *     防止模型「自由发挥」乱配色（skill 明确要求 "pick one family, do not invent random hex"）。
 *   - 色锚 / 字体沿用对应 preset 的 palette / fonts，让 AI 主题落在**用户认得出的 vibe** 附近，
 *     但由模型重新做渐变 / 层次 / 对比，产出更耐看的成品。
 *   - 这是外观步骤「按风格系统 AI 生成」的**单一事实源**：改风格语言只改这里。
 *
 * 类型 `Record<BuiltinThemeId, string>` 强制覆盖全部 builtin id（漏一个编译报错），与
 * `THEME_OUTLINE_HINTS` 同源守护。
 */
export const THEME_STYLE_SEEDS: Record<BuiltinThemeId, string> = {
  business:
    "precision-engineering corporate deck, arctic discipline; ice-white ground #f2f5f8 with steel ink #0c1420, ONE signal-red anchor #d91f30 used sparingly, Manrope tight geometric titles + Inter body, hairline rules, zero gradients, drafting-table calm",
  academic:
    "scholarly publishing warmth; sandstone paper #f6efe4 with espresso ink #241a10, burnt-sienna #a2451c + deep-teal #155e63 accents, Fraunces optical serif titles + Newsreader body, manuscript top/bottom rules, generous bookish leading",
  creative:
    "violet-hour consumer brand energy; dusk indigo #100829 deepening to black, hot-pink #ff2e92 hero with violet #8b5cf6 support, Bricolage Grotesque display titles with a pink rim glow, cinematic gradient, confident night-launch mood",
  minimal:
    "gallery-white studio minimalism; warm near-white #fcfcfb with pure ink #111110, a SINGLE Klein blue #002fa7 anchor, Inter at extreme scale contrast, one hairline, museum-mat whitespace, no decoration beyond a thread line",
  dark:
    "midnight awards keynote; true midnight #0a0c14 with a soft radial lift, champagne-gold hero #e0b458 and muted sage #8fae8b support, Sora display titles with a warm gold glow, luxurious cinematic restraint",
  tech:
    "graphite terminal-grade engineering; charcoal #141518 ground, acid-lime hero #c3f53c with electric cyan #22d3ee support, Space Grotesk titles + Space Mono details, L-bracket framing, flat panels, zero decorative photography",
  nature:
    "organic premium botanical; cream paper #f7f5ec with deep moss hero #2f5d33 and clay #c05f33 counterpoint, Fraunces humanist serif titles + DM Sans body, soft organic blob accents, natural and unhurried",
  warm:
    "kiln-fired community warmth; clay-cream #faf3ec ground, ember hero #c93c10 with wine #9c2b3b depth and ochre #e9a13b light, Bricolage Grotesque bold titles + DM Sans, sunrise-arc glow, human and generous",
  editorial:
    "brutalist dark editorial masthead; near-black ink #111013 with warm bone text #f4efe9, ember-orange hero #ff5a1f, Playfair Display 900 mastheads + Inter body, thick overline rules, asymmetric wide-left columns, print-noir confidence",
  terminal:
    "phosphor CRT hacker sheet; deep green-black #0c1210, phosphor hero #2ee88a with amber #ffb454 warnings, Space Mono command-prompt titles + JetBrains Mono body, scanlines and corner brackets, disciplined two-color glow",
  pastel:
    "cool porcelain mist friendliness; pale blue-grey #f6f6f9 ground, periwinkle hero #4a58bd with porcelain-pink #e8879c and mint #79c3b7 support, rounded DM Sans everywhere, confetti restraint, soft but never saccharine",
  luxe:
    "bordeaux velvet luxury; deep wine-black #1c0d12 with a candlelit radial core, champagne hero #d9b47f and burgundy #8c2f39 depth, Playfair Display serif titles + Manrope body, thin gilded frame, hushed five-star elegance",
  ink:
    "qinghua porcelain literati; porcelain white #f7f6f2 with indigo ink #1a2233, imperial-indigo hero #26357c, gilt #b8892d and cinnabar #9f3a38 seals, Noto Serif SC upright titles + Noto Sans SC body, eastern negative space and vertical rhythm",
};

// 运行期守护：每个 builtin id 必须在 THEMES 里真的存在（getTheme 才不会静默回退到 business）。
for (const id of BUILTIN_THEME_IDS) {
  if (!THEMES[id]) throw new Error(`[themes] BUILTIN_THEME_IDS lists "${id}" but THEMES has no such theme`);
}

export function getTheme(id: string | undefined): ThemeDef {
  // outline / spec 里的 "ai" 不是内置 preset，compile 应走 themeOverride。
  if (id && id !== "ai" && THEMES[id]) return THEMES[id]!;
  return THEMES.business!;
}

// ============================================================================
// AI 生成主题：GeneratedThemeSpec schema + spec → ThemeDef 转换
//
// "美观"导向：让 AI 输出一份完整设计参数，而不是从 5 套固定主题里挑。
// 用户输入主题 / 受众 / 场景 + 可选风格描述 → AI 产出一份调色板 + 字体组合 +
// 背景渐变 + 装饰风格的 spec → 即时编译为 ThemeDef 用于 compile。
//
// 设计要点：
//   - 颜色必须严格 #rrggbb（zod 校验）；模型偶尔输出 rgb()/hsl() / 缩写会被拒。
//   - 字体只能从 THEME_FONT_POOL 里挑（保证浏览器可加载 + 商用授权）；
//     模型若给出未知 family，回退到默认栈。
//   - palette 中 bg 与 text 必须有足够对比度（这层放在 prompt 引导，不在 schema
//     强校验，避免模型一次没达标就整个失败）。
// ============================================================================

import { z } from "zod";
import { findFontPreset, injectFontCss } from "./fonts/inject";
import { contrastRatio, ensureContrast, parseHex, readableTextColor, toHex, type Rgb } from "./qa/color";

/** AI 输出的"主题 spec"。compile 之前用 `realizeGeneratedTheme` 把它具象化为 ThemeDef。 */
export const GeneratedThemeSpecSchema = z.object({
  name: z.string().min(1).describe("Theme name (creative, descriptive; e.g. 'Aurora Bloom', '墨韵 Mist')."),
  description: z.string().describe("One-sentence vibe summary, language follows user."),
  mode: z.enum(["light", "dark"]).describe("Overall lightness; affects text contrast strategy."),
  palette: z.object({
    bg: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    bgAlt: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    text: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    textMuted: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    accent1: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    accent2: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    accent3: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    accent4: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    divider: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  }),
  background: z
    .union([
      z.object({ kind: z.literal("solid") }),
      z.object({
        kind: z.literal("linear"),
        angle: z.number().min(0).max(360).describe("Degrees, 0=left→right, 90=top→bottom."),
        stops: z
          .array(
            z.object({
              offset: z.number().min(0).max(1),
              color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
              alpha: z.number().min(0).max(1).optional(),
            }),
          )
          .min(2)
          .max(5),
      }),
      z.object({
        kind: z.literal("radial"),
        stops: z
          .array(
            z.object({
              offset: z.number().min(0).max(1),
              color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
              alpha: z.number().min(0).max(1).optional(),
            }),
          )
          .min(2)
          .max(5),
      }),
    ])
    .describe("Slide background: solid uses palette.bg; linear/radial define your own."),
  fonts: z.object({
    title: z.string().describe("Must be one of the family names from FONT_POOL."),
    body: z.string().describe("Must be one of the family names from FONT_POOL."),
    mono: z.string().optional().describe("Optional; falls back to JetBrains Mono."),
  }),
  // legacy 装饰（corner-gradient-shape / geometric-lines / bottom-accent-bar / dotted-grid）
  // 已从 LLM 可选枚举移除：渲染层（decorations.ts）保留兼容，但新生成的主题只能用命名装饰。
  decoration: z
    .enum(["none", "aurora", "tech-bracket", "neon-burst", "authority", "manuscript", "ink-thread", "organic-blobs", "sunrise-arc", "masthead", "terminal", "confetti", "gilded", "ink-wash"])
    .describe("Decorative layer drawn beneath content: aurora (dark horizontal light veils), tech-bracket (engineering), neon-burst (creative night, edge neon tubes), authority (corporate), manuscript (academic), ink-thread (minimal), organic-blobs (nature, layered ridges), sunrise-arc (warm energy), masthead (magazine/editorial), terminal (geeky/dev), confetti (playful/education), gilded (luxury/brand), ink-wash (Chinese ink/literary), none (pure minimal)."),
  layout: z
    .enum(["classic", "centered", "editorial", "terminal"])
    .optional()
    .describe("Layout skeleton family — decides the GEOMETRY of generated slides, not just colors. classic (left-aligned kicker + left title + divider, the safe default), centered (centered cover & titles, symmetric whitespace — good for creative/playful), editorial (cover title sinks low with a thick overline rule + asymmetric wide-left two-column with a right media frame — good for magazine/editorial/luxury/literary), terminal (command-prompt prefix on titles + code-block backdrop — good for geeky/dev). Pick the family that matches the vibe; omit for classic."),
});

export type GeneratedThemeSpec = z.infer<typeof GeneratedThemeSpecSchema>;

// AA 阈值：正文 4.5，次要文字（muted）3.0（≈ WCAG AA large / graphical）。
const MIN_TEXT_CONTRAST = 4.5;
const MIN_MUTED_CONTRAST = 3.0;

/** 文字铺在整页上的"有效底色"：solid → palette.bg；gradient → 各 stop 的平均色。 */
function effectiveBgRgb(palette: ThemePalette, background: GeneratedThemeSpec["background"]): Rgb | null {
  if (background.kind === "solid") return parseHex(palette.bg);
  const stops = background.stops.map((s) => parseHex(s.color)).filter((c): c is Rgb => !!c);
  if (stops.length === 0) return parseHex(palette.bg);
  const sum = stops.reduce((a, c) => ({ r: a.r + c.r, g: a.g + c.g, b: a.b + c.b }), { r: 0, g: 0, b: 0 });
  return { r: sum.r / stops.length, g: sum.g / stops.length, b: sum.b / stops.length };
}

/**
 * AI palette 源头对比度兜底（roadmap #5）：模型偶尔给「暗底 + 偏暗文字」或「浅底 + 太浅的 muted」，
 * 会让整篇 deck 从一开始就不可读。per-slide QA（qa/validate.ts）只能救 slide 上硬编码的文字色，
 * 救不了主题 palette 本身 —— 所以在 realize 这一步就做**保守**修正：
 *   - text vs 有效底色 < 4.5 → 翻到规范兜底文字色（亮底 #0f172a / 暗底 #f8fafc）
 *   - textMuted vs 有效底色 < 3.0 → 朝 text 方向小步靠拢到 3.0（保留色调，只补对比）
 * 只在"明显不达标"时动手，不主动美化达标的 palette。
 */
function sanitizePaletteContrast(
  palette: ThemePalette,
  background: GeneratedThemeSpec["background"],
): { palette: ThemePalette; changed: string[] } {
  const bgRgb = effectiveBgRgb(palette, background);
  if (!bgRgb) return { palette, changed: [] };

  const changed: string[] = [];
  const next: ThemePalette = { ...palette };

  const textRgb = parseHex(palette.text);
  if (textRgb && contrastRatio(textRgb, bgRgb) < MIN_TEXT_CONTRAST) {
    next.text = readableTextColor(bgRgb);
    changed.push("text");
  }

  const mutedRgb = parseHex(palette.textMuted);
  const targetRgb = parseHex(next.text) ?? bgRgb;
  if (mutedRgb && contrastRatio(mutedRgb, bgRgb) < MIN_MUTED_CONTRAST) {
    next.textMuted = toHex(ensureContrast(mutedRgb, bgRgb, targetRgb, MIN_MUTED_CONTRAST));
    changed.push("textMuted");
  }

  return { palette: next, changed };
}

/**
 * 把 AI 输出的 spec 具象化为 ThemeDef：
 *   - 字体：family → 查 THEME_FONT_POOL 拿 stack & cssUrl；找不到回退到默认栈。
 *   - 背景：solid 时 backgroundPaint 留 undefined（compile 走 palette.bg）；
 *           gradient 时构造 LinearGradientPaint / RadialGradientPaint。
 *   - palette：源头对比度兜底（sanitizePaletteContrast），保证 text/textMuted 相对底色达 WCAG。
 *   - 装饰：原样保留，compile 时翻译为 Shape。
 *   - 浏览器内自动注入 Google Fonts CSS（subprocess / server-side 无 document 时跳过）。
 */
export function realizeGeneratedTheme(
  spec: GeneratedThemeSpec,
  opts: { autoInject?: boolean; debug?: boolean } = {},
): ThemeDef {
  const titlePreset = findFontPreset(spec.fonts.title);
  const bodyPreset = findFontPreset(spec.fonts.body);
  const monoPreset = spec.fonts.mono ? findFontPreset(spec.fonts.mono) : null;

  // 按需注入 google fonts link：让 SVG 文字渲染时能拿到真正字形。
  if (opts.autoInject !== false) {
    if (titlePreset) injectFontCss(titlePreset.cssUrl, titlePreset.family);
    if (bodyPreset) injectFontCss(bodyPreset.cssUrl, bodyPreset.family);
    if (monoPreset) injectFontCss(monoPreset.cssUrl, monoPreset.family);
  }

  let backgroundPaint: import("@ppt/core").Paint | undefined;
  if (spec.background.kind === "linear") {
    backgroundPaint = {
      kind: "linear",
      angle: spec.background.angle,
      stops: spec.background.stops.map((s) => ({
        offset: s.offset,
        color: s.color,
        ...(s.alpha !== undefined ? { alpha: s.alpha } : {}),
      })),
    };
  } else if (spec.background.kind === "radial") {
    backgroundPaint = {
      kind: "radial",
      path: "circle",
      fillToRect: { l: 0, t: 0, r: 1, b: 1 },
      stops: spec.background.stops.map((s) => ({
        offset: s.offset,
        color: s.color,
        ...(s.alpha !== undefined ? { alpha: s.alpha } : {}),
      })),
    };
  }

  const links: Array<{ family: string; cssUrl: string }> = [];
  if (titlePreset) links.push({ family: titlePreset.family, cssUrl: titlePreset.cssUrl });
  if (bodyPreset && bodyPreset.family !== titlePreset?.family)
    links.push({ family: bodyPreset.family, cssUrl: bodyPreset.cssUrl });
  if (monoPreset && monoPreset.family !== titlePreset?.family && monoPreset.family !== bodyPreset?.family)
    links.push({ family: monoPreset.family, cssUrl: monoPreset.cssUrl });

  // palette 源头对比度兜底：修正后再用于 titleWordArt / theme.palette，保证标题与正文都读得清。
  const { palette: safePalette, changed } = sanitizePaletteContrast(spec.palette, spec.background);
  if (changed.length && opts.debug) {
    console.warn(`[theme] "${spec.name}" palette contrast auto-fixed: ${changed.join(", ")}`);
  }

  // AI 主题默认艺术字：粗体 + 微字距；暗色模式叠一层 accent1 发光阴影，使标题在深底上更跳。
  const titleWordArt: ThemeWordArt =
    spec.mode === "dark"
      ? {
          color: safePalette.text,
          weight: 800,
          letterSpacing: -0.5,
          shadow: { color: safePalette.accent1, alpha: 0.45, blur: 24, dx: 0, dy: 0 },
        }
      : { color: safePalette.text, weight: 800, letterSpacing: -0.5 };

  const theme: ThemeDef = {
    id: `ai_${Date.now().toString(36)}`,
    name: spec.name,
    description: spec.description,
    palette: { ...safePalette },
    fonts: {
      title: titlePreset?.stack ?? FONT_DISPLAY,
      body: bodyPreset?.stack ?? FONT_SANS,
      mono: monoPreset?.stack ?? FONT_MONO,
    },
    fontSizes: DEFAULT_FONT_SIZES,
    metrics: DEFAULT_METRICS,
    ...(spec.layout ? { layout: spec.layout } : {}),
    titleWordArt,
    ...(backgroundPaint ? { backgroundPaint } : {}),
    decoration: spec.decoration,
    fontCssLinks: links,
  };
  return theme;
}

/** 给 prompt / UI 用的字体 family 白名单（与 THEME_FONT_POOL 同步）。 */
export const THEME_FONT_FAMILIES = THEME_FONT_POOL.map((p) => p.family);
