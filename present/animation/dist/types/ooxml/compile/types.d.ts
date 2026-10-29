import type { ColorResolveCtx } from "../color.js";
import type { InterpKey, ValueKind } from "../interp.js";
import type { SampledPoint } from "../path.js";
import type { AnimClrNode, AnimEffectNode, AnimMotionNode, AnimNode, AnimRotNode, AnimScaleNode, AudioNode, CalcMode, CmdNode, PresetClass, SetNode, SlideEnv, TargetBox, TgtEl, TimeNode, VideoNode } from "../types.js";
export interface TargetInfo {
    id: string;
    bbox: TargetBox;
}
export interface Resolver {
    (tgtEl: TgtEl): TargetInfo | null;
}
export interface TextSlice {
    pRg?: {
        st: number;
        end: number;
    };
    charRg?: {
        st: number;
        end: number;
    };
}
export interface TnTimeEntry {
    start: number;
    end: number;
}
export interface CompileBuildSpec {
    kind: "para" | "diagram" | "chart" | "graphic" | "ole";
    shapeId: string;
    grpId?: number;
    build?: string;
    bldLvl?: number;
    animBg?: boolean;
    autoUpdateAnimBg?: boolean;
    rev?: boolean;
    uiExpand?: boolean;
}
export interface BuildEnumerator {
    chartSeriesCount?: (spid: string) => number;
    chartCategoryCount?: (spid: string) => number;
    diagramNodeCount?: (spid: string) => number;
}
export interface CompileCtx extends SlideEnv {
    resolve: Resolver;
    colorCtx?: ColorResolveCtx;
    getTextSlices?: (spid: string, kind: "el" | "wd" | "lt") => TextSlice[];
    tnIndex?: Map<string, TnTimeEntry>;
    builds?: CompileBuildSpec[];
    buildEnumerator?: BuildEnumerator;
    buildIndex?: Map<string, CompileBuildSpec[]>;
}
export type TrackKind = "prop" | "motion" | "filter" | "cmd" | "media";
export interface PropTrack {
    kind: "prop";
    property: string;
    valueKind: ValueKind;
    keys: InterpKey[];
    relative?: boolean;
    calcMode?: CalcMode;
    additive?: "sum" | "repl" | "mult" | "none" | "base";
    accumulate?: "always" | "none";
    colorBy?: {
        by: import("../types.js").ColorBy;
        clrSpc: "rgb" | "hsl";
        dir: "cw" | "ccw";
    };
}
export interface MotionTrack {
    kind: "motion";
    points: SampledPoint[];
    rotateToPath?: boolean;
    origin: "parent" | "layout";
    pathEditMode?: "relative" | "fixed";
    easing?: import("../../types.js").EasingFn;
    additive?: "sum" | "repl" | "mult" | "none" | "base";
    accumulate?: "always" | "none";
}
export interface FilterTrack {
    kind: "filter";
    filter: string;
    transition: "in" | "out" | "none";
    prLst?: string;
    presetId?: number;
    subtype?: number;
    duration: number;
    easing?: import("../../types.js").EasingFn;
}
export interface CmdTrack {
    kind: "cmd";
    cmdType: "evt" | "call" | "verb";
    cmd: string;
    /** `<p:tgtEl><p:sndTgt>` 解析后的媒体 src，放映时播放。 */
    soundSrc?: string;
}
export interface MediaTrack {
    kind: "media";
    mediaKind: "audio" | "video";
    action: "play" | "pause" | "stop" | "resume";
    vol?: number;
    mute?: boolean;
    fullScreen?: boolean;
    isNarration?: boolean;
    soundSrc?: string;
}
export type AtomTrack = PropTrack | MotionTrack | FilterTrack | CmdTrack | MediaTrack;
export type LeafNode = SetNode | AnimNode | AnimClrNode | AnimEffectNode | AnimMotionNode | AnimRotNode | AnimScaleNode | CmdNode | AudioNode | VideoNode;
export interface Atom {
    id: string;
    source: LeafNode;
    targetId: string;
    duration: number;
    iterations: number;
    /**
     * 父容器 repeatCount="indefinite" 时，子节点按这个周期重复。
     * 周期内超出本 atom 时长的部分不贡献（短 set 不能靠自身 duration 取模，
     * 否则 1ms 的隐藏会每帧都写上）。
     */
    repeatPeriod?: number;
    autoReverse: boolean;
    /** cTn@spd 为负：这段从末态播回起点。祖先链上的负号成对抵消。 */
    reverse: boolean;
    hold: boolean;
    tracks: AtomTrack[];
    presetClass?: string;
    presetId?: number;
    presetSubtype?: number;
    buildInfo?: {
        kind: "para" | "diagram" | "chart" | "graphic" | "ole";
        build?: string;
        animBg?: boolean;
        bldLvl?: number;
        seriesIdx?: number;
        categoryIdx?: number;
        diagramNodeIdx?: number;
    };
    meta?: {
        evtFilter?: string;
        display?: boolean;
        nodePh?: boolean;
    };
}
export interface AtomInstance {
    atom: Atom;
    offset: number;
}
export type StepTrigger = "onClick" | "onLoad" | "onShapeClick" | "onShapeDblClick" | "onShapeHover" | "onShapeMouseOut" | "onPrev" | "onNext" | "withPrevious" | "afterPrevious";
export interface CompiledStep {
    id: string;
    trigger: StepTrigger;
    triggerTargetId?: string;
    delay: number;
    duration: number;
    iterations: number;
    hold: boolean;
    autoReverse: boolean;
    source: TimeNode;
    atoms: AtomInstance[];
}
export interface CompiledTiming {
    mainSteps: CompiledStep[];
    shapeSteps: CompiledStep[];
}
export interface AncestorEntrExitPreset {
    presetClass: PresetClass;
    presetID: number;
    presetSubtype?: number;
    durMs: number;
    opacityPlaceholder?: boolean;
}
