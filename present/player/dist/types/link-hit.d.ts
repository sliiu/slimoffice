import type { HyperlinkRef } from "@sliiu/present-core";
import { type SceneNode } from "@sliiu/present-renderer";
export type LinkSlot = "hyperlink" | "hoverLink";
/**
 * 放映命中：入场还没把形状画出来（自身或祖先 opacity≤0 / visible=false）时，
 * 超链和单击触发都不该吃掉这次点击。点击应落到后面的推进。
 */
export declare function nodeShownForPointer(node: SceneNode): boolean;
export declare function paragraphShownForPointer(node: SceneNode, paraIdx: number): boolean;
/**
 * 命中当前已显示形状上的 hlinkClick / hlinkHover。
 * z 序与原先 player 内联扫描一致：walk 顺序靠后的盖住靠前的。
 */
export declare function findHyperlinkAt(root: SceneNode, x: number, y: number, slot: LinkSlot): {
    link: HyperlinkRef;
    id: string;
} | null;
