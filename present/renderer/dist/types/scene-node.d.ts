import type { Animatable } from "@sliiu/present-animation";
import type { ClipState, Paint, Shape, Slide } from "@sliiu/present-core";
export interface ParaOverride {
    opacity?: number;
    tx?: number;
    ty?: number;
    scale?: number;
    scaleX?: number;
    scaleY?: number;
    rotation?: number;
    visible?: boolean;
    clip?: ClipState;
    fillColor?: string;
    fontColor?: string;
    fontSize?: number;
    fontWeight?: number | string;
    fontStyle?: boolean;
    fontFamily?: string;
    underline?: string;
}
/** iterate 子目标上的属性叠在段落动画之上（同名字段以后者为准）。 */
export declare function mergeParaOverrides(base?: ParaOverride, over?: ParaOverride): ParaOverride | undefined;
export interface CharRangeOverride extends ParaOverride {
    start: number;
    end: number;
    unit: "char" | "word";
}
export type PropertyListener = (key: string, value: unknown, node: SceneNode) => void;
export declare class SceneNode implements Animatable {
    readonly id: string;
    shape: Shape;
    parent: SceneNode | null;
    children: SceneNode[];
    layerId: string;
    tx: number;
    ty: number;
    scale: number;
    scaleX: number;
    scaleY: number;
    rotation: number;
    /** 动画写入的旋转增量。渲染角 = shape.transform.rotation + animRotation。 */
    animRotation: number;
    opacity: number;
    widthScale: number;
    heightScale: number;
    clip: ClipState | null;
    fillOverride: string | null;
    strokeOverride: string | null;
    strokeWidthOverride: number | null;
    visibleOverride: boolean | null;
    paraOverrides: Map<number, ParaOverride>;
    charOverrides: Map<number, Map<string, CharRangeOverride>>;
    mediaEl: HTMLMediaElement | null;
    private lastMediaAction;
    private listeners;
    constructor(shape: Shape, layerId: string);
    private shapeRotation;
    on(fn: PropertyListener): () => void;
    private fire;
    /**
     * 触发一次 backend redraw 而**不**改变任何节点 / shape 属性。用于离屏光栅 3D 烘焙
     * 把结果写进 shape.meta3D.bakedSrc 副通道后，让 SvgBackend / CanvasBackend 重画读取
     * 新的 bakedSrc（既不污染 shape.src/bbox，也不影响 live WebGL 视图）。
     */
    markDirty(): void;
    /**
     * 内部用：跳过外部 setProperty 的开关 / 派发逻辑，直接把 opacity 强制设为 v 并
     * 通知 listener。专门给 ParagraphAnimatable / CharRangeAnimatable 在 reveal
     * 文字时同步解除 ancestor group hide 用，避免在每次字符 reveal 都走完整 setProperty
     * switch（性能 + 也避免触发不必要 fire-key 字符串）。
     */
    forceOpacity(v: number): void;
    setProperty(key: string, value: unknown): void;
    private applyEffectClip;
    getProperty(key: string): unknown;
    walk(fn: (n: SceneNode) => void): void;
    findById(id: string): SceneNode | null;
    resetAnimState(): void;
    setParaProperty(idx: number, key: string, value: unknown): void;
    getParaProperty(idx: number, key: string): unknown;
    setCharRangeProperty(paraIdx: number, unit: "char" | "word", start: number, end: number, key: string, value: unknown): void;
    getCharRangeProperty(paraIdx: number, unit: "char" | "word", start: number, end: number, key: string): unknown;
}
export declare function netFlipParity(node: SceneNode): {
    x: number;
    y: number;
};
export declare class ParagraphAnimatable implements Animatable {
    readonly node: SceneNode;
    readonly paraIdx: number;
    constructor(node: SceneNode, paraIdx: number);
    setProperty(key: string, value: unknown): void;
    getProperty(key: string): unknown;
}
export declare class CharRangeAnimatable implements Animatable {
    readonly node: SceneNode;
    readonly paraIdx: number;
    readonly unit: "char" | "word";
    readonly start: number;
    readonly end: number;
    constructor(node: SceneNode, paraIdx: number, unit: "char" | "word", start: number, end: number);
    setProperty(key: string, value: unknown): void;
    getProperty(key: string): unknown;
}
export declare function resolveAnimatable(scene: Scene, id: string): Animatable | null;
export interface Scene {
    width: number;
    height: number;
    background?: Shape | null;
    slide: Slide;
    layerNodes: Map<string, SceneNode[]>;
    root: SceneNode;
}
export interface CreateSceneOptions {
    masters?: import("@sliiu/present-core").SlideMaster[];
}
export declare function createScene(slide: Slide, size: {
    width: number;
    height: number;
}, options?: CreateSceneOptions): Scene;
/** `useBgFill`：用幻灯片合成背景填形状，坐标系对齐整页而不是 shape bbox。 */
export declare function shapeRenderFill(s: Shape, scene: Scene, node?: SceneNode): Paint | undefined;
export declare function shapeRenderFillBBox(s: Shape, scene: Scene, node?: SceneNode): {
    x: number;
    y: number;
    w: number;
    h: number;
};
