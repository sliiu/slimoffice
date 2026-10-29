import type { BulletDef, ShapeEffect, TextParagraph } from "@sliiu/present-core";
/**
 * §21.1.2.1.1 bodyPr@lIns/tIns/rIns/bIns 的 OOXML 缺省值：
 * 左右 91440 EMU = 7.2pt ≈ 9.6px，上下 45720 EMU = 3.6pt ≈ 4.8px。
 */
export declare const DEFAULT_TEXT_INSETS: {
    readonly l: 9.6;
    readonly t: 4.8;
    readonly r: 9.6;
    readonly b: 4.8;
};
/** 未写 lnSpc 时的行框系数。§21.1.2.2.5 只说由字号决定，这里取 1.2。 */
export declare const DEFAULT_LINE_HEIGHT_FACTOR = 1.2;
/** 继承链都没写 sz 时的绘制字号（px）。schema 不给 sz 缺省值；Office 用 18pt。 */
export declare const FALLBACK_FONT_SIZE: number;
export type VertMode = NonNullable<import("@sliiu/present-core").TextShape["vert"]>;
/**
 * §21.1.2.1.1 bodyPr@vert — 整框旋转角度。
 * 仅 vert/vert270 走"外层 rotate"路径；其余竖排模式靠自定义竖排 layout。
 */
export declare function vertRotateDeg(v: VertMode | undefined): number;
export declare function isVerticalStack(v: VertMode | undefined): v is "wordArtVert" | "wordArtVertRtl" | "eaVert" | "mongolianVert";
/**
 * 竖排堆叠的列推进方向。
 * wordArtVertRtl = 从右到左（WPS「行顺序：从右到左」）。
 * wordArtVert = 从左到右（WPS「行顺序：从左到右」）。rtlCol 对这两种 vert 无效。
 */
export declare function stackedColumnsLtr(vert: "wordArtVert" | "wordArtVertRtl" | "eaVert" | "mongolianVert", rtlCol?: boolean): boolean;
/**
 * §21.1.2.1.1 bodyPr@rot / @vert / @upright 叠加后，文字内容相对 slide 的总旋转角。
 * 渲染端把 shape 自身的 rotation 加在 scene node 上、把 bodyRot+vert 加在文本组上，
 * upright 再抵消掉 shape 的 rotation —— 三者之和就是文字最终看起来的旋转角度。
 */
export declare function textTotalRotationDeg(s: {
    transform?: {
        rotation?: number;
    };
    bodyRot?: number;
    vert?: VertMode;
    upright?: boolean;
}): number;
/** 段落缺省字号：取段内最大显式字号，全缺省时用 FALLBACK_FONT_SIZE。 */
export declare function paragraphFallbackFontSize(p: TextParagraph): number;
/**
 * §21.1.2.2.5 spcPct 是最大字号的百分比：120000 = 1.2 × 字号，不再乘第二层系数。
 * 未写 lnSpc 时用 DEFAULT_LINE_HEIGHT_FACTOR；compatLnSpc 时按 1 × 字号。
 */
export declare function lineHeightFactor(p: TextParagraph, compatLnSpc?: boolean): number;
/** 段落行高（px）：显式 lineHeightPx 优先，否则按 §21.1.2.2.5 的百分比系数算。 */
export declare function paragraphLineHeightPx(p: TextParagraph, fallbackFs?: number, compatLnSpc?: boolean): number;
export interface BulletNumState {
    lastLevel: number;
    lastType: string;
    count: number;
}
export declare function newBulletNumState(): BulletNumState;
/** §21.1.2.4.1 buAutoNum@type — 把序号按 ST_TextAutonumberScheme 格式化。 */
export declare function formatBulletNumber(n: number, type: string): string;
/**
 * §21.1.2.4.5 buSzPts 优先于 §21.1.2.4.4 buSzPct；两者都缺省时跟随 run 字号（buSzTx）。
 */
export declare function bulletFontSize(bullet: BulletDef, runFs: number): number;
/**
 * 推进自动编号状态机，返回该段 bullet 的显示文本。
 * none / picture 返回 null（picture bullet 由各消费者自行绘制图片）。
 *
 * 编号连续性规则：连续的同 level buAutoNum 段落累加；一旦遇到 buChar / buNone /
 * level 变化就重置，与 PowerPoint 表现一致。
 */
export declare function advanceBulletLabel(p: TextParagraph, state: BulletNumState): string | null;
export declare function hexWithAlpha(color: string, alpha: number): string;
/**
 * §21.1.2.3.9 rPr/effectLst → CSS `filter` 串（drop-shadow 链式叠加）。
 *
 * `scale` 用来把 slide 单位换算成目标坐标系的 px：SVG 里 filter 走 user-space
 * 会随 viewBox 自动缩放，所以后端传 1；HTML overlay（编辑器）按屏幕 px 绘制，
 * 必须传当前 stageScale，否则缩放后阴影 / 光晕的偏移和模糊半径会明显不对。
 *
 * inner shadow 与 reflection 不走这条 CSS 链：SVG 用 feComposite / 镜像 <use>，
 * Canvas 在 drawText 里单独画。这里若把 reflection 收成 drop-shadow，倒影会变成一团光。
 */
export declare function textEffectsCssFilter(effects: ShapeEffect[] | undefined, scale?: number): string | undefined;
/** 取 paragraph 内首个声明 effects 的 run 的 CSS filter（paragraph 级近似）。 */
export declare function pickRunEffectsCssFilter(runs: ReadonlyArray<{
    effects?: ShapeEffect[];
}>, scale?: number): string | undefined;
