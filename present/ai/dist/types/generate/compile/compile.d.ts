import type { Presentation, SlideMaster, SlideSize } from "@sliiu/present-core";
import type { GuidanceInput, PresentationSpec } from "../schema.js";
import { type GeneratedThemeSpec, type ThemeDef } from "../../themes.js";
import type { LayoutStyleSpec } from "../layout-style.js";
export interface CompileOptions {
    size?: SlideSize;
    defaultThemeId?: string;
    /**
     * 自定义主题（AI 生成 / 用户自定义）。优先级最高，存在时忽略 themeId 查询。
     * 用法：先 realizeGeneratedTheme(spec) → 把得到的 ThemeDef 透传进来。
     */
    themeOverride?: ThemeDef;
    /**
     * 构图种子：驱动 layouts v2 的构图变体选择。缺省时每次 compile 随机 ——
     * "重新生成"会得到可见的构图差异；传入固定值可复现同一构图。
     * 同一 deck 内按 layout kind 派生子种子：相同 layout → 相同变体（整册一致），
     * 不同 layout 各自选型。
     */
    designSeed?: number;
    /**
     * AI 设计的布局风格（generateLayoutStyle 产出）：构图锚点/版心/面板/母题
     * 按 spec 执行；缺省回退种子变体。
     */
    layoutStyle?: LayoutStyleSpec;
    themeSpec?: GeneratedThemeSpec;
    masters?: SlideMaster[];
    guidance?: GuidanceInput;
    /**
     * Compile-path A/B only（非用户开关）。false 时跳过 applyCompileConstraints /
     * 全出血 overlay / no-bullet 剥离，用来量门禁 pass-rate。默认 true。
     */
    constraintsEnabled?: boolean;
}
export declare function decorationRoleForKind(kind: string | undefined): "feature" | "content";
export declare function hashKind(seed: number, kind: string): number;
export declare function compilePresentation(spec: PresentationSpec, opts?: CompileOptions): Presentation;
import type { Outline } from "../schema.js";
export declare function outlineToFallbackSpec(outline: Outline, opts?: {
    injectMissingCover?: boolean;
}): PresentationSpec;
