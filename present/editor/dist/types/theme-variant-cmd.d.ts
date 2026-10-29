import type { EditCommand, Presentation } from "@sliiu/present-core";
import { type ThemeVariantId } from "./theme-variants.js";
/**
 * 变体色块：改主题色表，并让跟主题走的颜色一起变。
 * 母版 / 版式背景和 dec_ 装饰即使用的不是色表原值，也按背景算法偏色。
 * 正文里对得上旧色表的颜色跟着换；对不上的用户色不动。
 */
export declare class ApplyThemeVariantCmd implements EditCommand {
    private variant;
    readonly label = "Apply theme variant";
    private prev?;
    private patches?;
    constructor(variant: ThemeVariantId);
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
