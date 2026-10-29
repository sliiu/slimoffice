import type { Shape, SlideSize } from "@sliiu/present-core";
import type { ThemeDecoration, ThemePalette } from "./themes.js";
export interface DecorationContext {
    palette: ThemePalette;
    size: SlideSize;
    locked: boolean;
    /** id 唯一性前缀（调用方传 stamp / 前缀字串）。 */
    idPrefix: string;
    /**
     * 页面角色（缺省 "feature" = 完整装饰，向后兼容）：
     *   - feature：封面/章节/结尾/hero/stat/quote 等全出血戏剧页 → 完整装饰；
     *   - content：要点/表格/卡片等信息密度高的页 → 静默版。大面积氛围元素
     *     （aurora 的光幕、organic-blobs 的山脊等）会被滤掉，只保留细线、角标、
     *     散点等结构性小元素 —— 否则同一组氛围块每页重复，呆板且抢内容。
     */
    role?: "feature" | "content";
}
export declare function buildDecorationShapesShared(dec: ThemeDecoration, ctx: DecorationContext): Shape[];
