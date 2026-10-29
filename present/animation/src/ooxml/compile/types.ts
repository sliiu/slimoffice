// Public compile-time data structures.
// 把 OOXML TimeNode 编译为可执行的 Steps（按 click 切分）+ Atoms（每个行为节点）。
// 严格按 ECMA-376 §19.5 语义；编译产物是数据结构，运行时仅做 seek/apply。

import type { ColorResolveCtx } from "../color";
import type { InterpKey, ValueKind } from "../interp";
import type { SampledPoint } from "../path";
import type {
  AnimClrNode,
  AnimEffectNode,
  AnimMotionNode,
  AnimNode,
  AnimRotNode,
  AnimScaleNode,
  AudioNode,
  CalcMode,
  CmdNode,
  PresetClass,
  SetNode,
  SlideEnv,
  TargetBox,
  TgtEl,
  TimeNode,
  VideoNode,
} from "../types";

export interface TargetInfo {
  id: string;
  bbox: TargetBox;
}

export interface Resolver {
  (tgtEl: TgtEl): TargetInfo | null;
}

// ECMA-376 §19.5.37 iterate 把单个动画行为对目标文本的逐元素/词/字分别施加。
// host 提供文本切片信息（按 spid + iterate type）；compile 用切片重写每个 leaf 的 spTgt.txEl 并错开偏移。
export interface TextSlice {
  pRg?: { st: number; end: number };
  charRg?: { st: number; end: number };
}

// §19.5.20 cond：cTn.tn 引用其他节点的 begin/end。
// 编译期先做一遍 Walk 计算每个 cTn id 的 (start, end) 估值（ms，相对 timing 根，
// 跳过 click 边界，仅在同步可计算的范围内成立）。
export interface TnTimeEntry {
  start: number;
  end: number;
}

// §19.5.3 bldLst 项的精简形态；compile 期用于按 spid/grpId 索引 build 行为。
// 与 packages/core/src/slide.ts BuildSpec 字段对齐。
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

// 给 chart/graphic/ole/diagram 拆分提供子元素枚举（compileCtx 调用方按需提供）。
// 例如 chart series 数 = chartSeriesCount(spid)；按 build="series" 时 compile 会克隆 leaf。
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
  // §19.5.3 bldLst：按 spid 索引的 build 规格，驱动 chart/diagram series/category 拆分；
  // 对 bldP（按段落 build）PowerPoint 出品的 PPT 通常已在 timing 树中展开 pRg，无需 compile 端再拆。
  builds?: CompileBuildSpec[];
  buildEnumerator?: BuildEnumerator;
  // 内部用：buildBuildIndex(builds) 的缓存，避免每个 leaf 都重建索引。compile 内部填充。
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
  // §19.5.14 cBhvr.additive: 与其他作用同一 prop 的动画的合成方式。
  // "base"（默认）省略不存；非默认值才写入。
  additive?: "sum" | "repl" | "mult" | "none" | "base";
  accumulate?: "always" | "none";
  // §19.5.7 animClr by-only：from/to 缺省时，颜色动画是"在 base 颜色上按 by 增量"，
  // runtime 需要在 apply 帧抓当前 prop 颜色作为 base，再按 progress 缩放 by 并合成。
  // compile 期把 by/clrSpc/dir 透传到这里，runtime 用 applyColorBy 求每帧颜色。
  colorBy?: {
    by: import("../types").ColorBy;
    clrSpc: "rgb" | "hsl";
    dir: "cw" | "ccw";
  };
}

export interface MotionTrack {
  kind: "motion";
  points: SampledPoint[];
  rotateToPath?: boolean;
  origin: "parent" | "layout";
  // §19.5.9 pathEditMode: "relative" = 路径相对当前 shape 中心；"fixed" = 路径
  // 锚定到 slide 绝对坐标（shape resize 不改变路径）。runtime 当前都按 relative
  // 处理（与 tx/ty 偏移语义一致），保留字段用于未来"fixed"模式落点修正。
  pathEditMode?: "relative" | "fixed";
  // §19.5.18 cTn.accel/decel/tmFilter 注入的 progress 时间映射；
  // runtime applyMotion 用它对 [0,1] 推进做 easing。
  easing?: import("../../types").EasingFn;
  // §19.5.14 cBhvr.additive：motion 写 tx/ty 时的合成策略。默认 "base"（覆盖）；
  // 设为 "sum" 时多 motion 与 prop 位移叠加。runtime 通过 PropertyAccumulator 应用。
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
  // §19.5.18 cTn@tmFilter / accel / decel：progress 时间映射（Pulse 的 0→.5→.5→0 即靠它回到原态）。
  easing?: import("../../types").EasingFn;
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

export type LeafNode =
  | SetNode
  | AnimNode
  | AnimClrNode
  | AnimEffectNode
  | AnimMotionNode
  | AnimRotNode
  | AnimScaleNode
  | CmdNode
  | AudioNode
  | VideoNode;

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
  // §19.5.3 bldLst 关联信息：renderer/player 用它决定背景动画是否参与、build 拆分粒度等。
  buildInfo?: {
    kind: "para" | "diagram" | "chart" | "graphic" | "ole";
    build?: string;
    animBg?: boolean;
    bldLvl?: number;
    // chart/diagram/ole 分支的子元素索引（若 compile 期已拆分）。
    seriesIdx?: number;
    categoryIdx?: number;
    diagramNodeIdx?: number;
  };
  // §19.5.18 cTn 其他元数据（runtime 当前不消费但 round-trip / 调试需要）：
  //   - evtFilter: PowerPoint 私有，写在 click/event 触发的过滤表达式
  //   - display:   动画前是否显示（false → 进入动画前 hide）
  //   - nodePh:    节点是否仅作占位（不实际推进任何属性）
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

export type StepTrigger =
  | "onClick"
  | "onLoad"
  | "onShapeClick"
  | "onShapeDblClick"
  | "onShapeHover"
  | "onShapeMouseOut"
  | "onPrev"
  | "onNext"
  | "withPrevious"
  | "afterPrevious";

export interface CompiledStep {
  id: string;
  trigger: StepTrigger;
  triggerTargetId?: string;
  delay: number;
  duration: number;
  iterations: number;
  hold: boolean;
  // §19.5.18 cTn.autoRev：step 层每一次循环内反向播放（duration 实际为 2×dur）。
  autoReverse: boolean;
  source: TimeNode;
  atoms: AtomInstance[];
}

export interface CompiledTiming {
  mainSteps: CompiledStep[];
  shapeSteps: CompiledStep[];
}

// PPT 常把预设写在父 par 的 cTn，叶子仅下发 style.opacity anim；必须把预设下传到 compile。
export interface AncestorEntrExitPreset {
  presetClass: PresetClass;
  presetID: number;
  presetSubtype?: number;
  durMs: number;
  // false：这份预设容器里已经有位移 / 滤镜 / 缩放，透明度叶子按自身播放。
  opacityPlaceholder?: boolean;
}
