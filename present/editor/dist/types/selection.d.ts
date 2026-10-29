import type { Shape, Slide } from "@sliiu/present-core";
export type SelectionListener = (ids: ReadonlySet<string>) => void;
export declare const BACKGROUND_SEL_ID = "__background__";
export declare class Selection {
    private ids;
    private listeners;
    get values(): ReadonlySet<string>;
    isBackground(): boolean;
    has(id: string): boolean;
    set(ids: Iterable<string>): void;
    add(id: string): void;
    remove(id: string): void;
    toggle(id: string): void;
    clear(): void;
    subscribe(fn: SelectionListener): () => void;
    private emit;
}
export declare function findShape(slide: Slide, id: string): Shape | undefined;
export interface FoundShape {
    shape: Shape;
    layer: Slide["layers"][number];
}
export declare function findShapeWithLayer(slide: Slide, id: string): FoundShape | undefined;
export declare function isMasterCopyLayer(layer: Slide["layers"][number]): boolean;
export declare function findTopLevelId(slide: Slide, id: string): string | undefined;
export declare function findParentGroup(slide: Slide, id: string): (Shape & {
    kind: "group";
}) | undefined;
/**
 * Parser 把带 txBody 的 sp 拆成 group(sp_N_base, sp_N_text)。
 * 选择窗里的 "TextBox N text · text" 是文字半边；移动 / 缩放应对整框，
 * 否则 _base 停在解析期 bbox，保存后边框落在旧位置。
 */
export declare function syntheticTextBoxGroupId(slide: Slide, id: string): string;
/**
 * 从外到内返回 id 的祖先 group（不含自身）。空数组 = 顶层 shape。
 * 行内文本 overlay / 选中框需要把这些 group 的 rotation/flip 叠到叶子 bbox 上，
 * 才和 renderer 父 <g> 变换后的画面重合。
 */
export declare function findShapeAncestors(slide: Slide, id: string): Shape[];
