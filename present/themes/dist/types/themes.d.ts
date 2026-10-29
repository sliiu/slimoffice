import { type BuiltinThemeId } from "./builtin-ids.js";
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
    mono: string;
}
export interface ThemeFontSizes {
    coverTitle: number;
    coverSubtitle: number;
    sectionTitle: number;
    pageTitle: number;
    body: number;
    small: number;
    quote: number;
}
export interface ThemeMetrics {
    marginX: number;
    marginY: number;
    titleBodyGap: number;
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
export type ThemeDecoration = "none" | "aurora" | "tech-bracket" | "neon-burst" | "authority" | "manuscript" | "ink-thread" | "organic-blobs" | "sunrise-arc" | "masthead" | "terminal" | "confetti" | "gilded" | "ink-wash" | "corner-gradient-shape" | "geometric-lines" | "bottom-accent-bar" | "dotted-grid";
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
    shadow?: {
        color: string;
        alpha: number;
        blur: number;
        dx: number;
        dy: number;
    };
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
export type CoverMotifId = "slash" | "stack" | "rule-box" | "spine" | "bracket" | "halo" | "blob" | "arc" | "frame" | "burst" | "dots" | "wash" | "masthead" | "terminal-bar";
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
    backgroundPaint?: import("@sliiu/present-core").Paint;
    /** 装饰层：compile.ts 在 render 后追加到 layer.shapes 顶部（z 最低）。 */
    decoration?: ThemeDecoration;
    /**
     * 字体 Google Fonts CSS link（注入 <head>，让 SVG 渲染时能解析到真正的字形）。
     * 内置主题用系统 fallback 栈，无需 link。AI 生成主题会指定 1-3 条 link。
     */
    fontCssLinks?: Array<{
        family: string;
        cssUrl: string;
    }>;
}
export declare const THEMES: Record<string, ThemeDef>;
/**
 * 把一份主题用到的 Google Fonts 注入当前 document（idempotent）。
 * 内置模板在 playground 启动时调用，保证"用内置模板新建"时标题/正文字体真的加载，
 * 而不是落到系统默认字形（这是之前"字体不随主题"的根因之一）。
 * 非浏览器环境（SSR / 子进程）自动跳过。
 */
export declare function injectThemeFonts(theme: ThemeDef): void;
export declare const THEME_IDS: string[];
/**
 * 每套主题的「适用场景」一句话（英文，喂给 outline 的 themeId 选择器）。
 * 这是 outline prompt 里主题映射的**单一事实源** —— 新增主题时在这里补一行即可，
 * prompt 会自动带上。
 *
 * 类型 `Record<BuiltinThemeId, string>` 强制覆盖 schema 里全部 builtin id：漏一个就编译报错。
 * 加新主题的完整流程：THEMES 加条目 → BUILTIN_THEME_IDS 加 id → 这里加一行 hint。
 */
export declare const THEME_OUTLINE_HINTS: Record<BuiltinThemeId, string>;
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
export declare const THEME_STYLE_SEEDS: Record<BuiltinThemeId, string>;
export declare function getTheme(id: string | undefined): ThemeDef;
import { z } from "zod";
/** AI 输出的"主题 spec"。compile 之前用 `realizeGeneratedTheme` 把它具象化为 ThemeDef。 */
export declare const GeneratedThemeSpecSchema: z.ZodObject<{
    name: z.ZodString;
    description: z.ZodString;
    mode: z.ZodEnum<{
        dark: "dark";
        light: "light";
    }>;
    palette: z.ZodObject<{
        bg: z.ZodString;
        bgAlt: z.ZodString;
        text: z.ZodString;
        textMuted: z.ZodString;
        accent1: z.ZodString;
        accent2: z.ZodString;
        accent3: z.ZodString;
        accent4: z.ZodString;
        divider: z.ZodString;
    }, z.core.$strip>;
    background: z.ZodUnion<readonly [z.ZodObject<{
        kind: z.ZodLiteral<"solid">;
    }, z.core.$strip>, z.ZodObject<{
        kind: z.ZodLiteral<"linear">;
        angle: z.ZodNumber;
        stops: z.ZodArray<z.ZodObject<{
            offset: z.ZodNumber;
            color: z.ZodString;
            alpha: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strip>>;
    }, z.core.$strip>, z.ZodObject<{
        kind: z.ZodLiteral<"radial">;
        stops: z.ZodArray<z.ZodObject<{
            offset: z.ZodNumber;
            color: z.ZodString;
            alpha: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strip>>;
    }, z.core.$strip>]>;
    fonts: z.ZodObject<{
        title: z.ZodString;
        body: z.ZodString;
        mono: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
    decoration: z.ZodEnum<{
        aurora: "aurora";
        authority: "authority";
        confetti: "confetti";
        gilded: "gilded";
        "ink-thread": "ink-thread";
        "ink-wash": "ink-wash";
        manuscript: "manuscript";
        masthead: "masthead";
        "neon-burst": "neon-burst";
        none: "none";
        "organic-blobs": "organic-blobs";
        "sunrise-arc": "sunrise-arc";
        "tech-bracket": "tech-bracket";
        terminal: "terminal";
    }>;
    layout: z.ZodOptional<z.ZodEnum<{
        centered: "centered";
        classic: "classic";
        editorial: "editorial";
        terminal: "terminal";
    }>>;
}, z.core.$strip>;
export type GeneratedThemeSpec = z.infer<typeof GeneratedThemeSpecSchema>;
/**
 * 把 AI 输出的 spec 具象化为 ThemeDef：
 *   - 字体：family → 查 THEME_FONT_POOL 拿 stack & cssUrl；找不到回退到默认栈。
 *   - 背景：solid 时 backgroundPaint 留 undefined（compile 走 palette.bg）；
 *           gradient 时构造 LinearGradientPaint / RadialGradientPaint。
 *   - palette：源头对比度兜底（sanitizePaletteContrast），保证 text/textMuted 相对底色达 WCAG。
 *   - 装饰：原样保留，compile 时翻译为 Shape。
 *   - 浏览器内自动注入 Google Fonts CSS（subprocess / server-side 无 document 时跳过）。
 */
export declare function realizeGeneratedTheme(spec: GeneratedThemeSpec, opts?: {
    autoInject?: boolean;
    debug?: boolean;
}): ThemeDef;
/** 给 prompt / UI 用的字体 family 白名单（与 THEME_FONT_POOL 同步）。 */
export declare const THEME_FONT_FAMILIES: string[];
