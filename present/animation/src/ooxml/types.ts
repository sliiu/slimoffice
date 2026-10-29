// ECMA-376 Part 1 §19.5 PresentationML Animations
// 严格按规范命名，零损失保留 XML 结构。
// 所有时间单位 ms（OOXML 原生）；角度 60000 = 1°；百分比 100000 = 1.0；点坐标 100000 = slide 维度的 100%。

export type NodeType =
  | "clickEffect"
  | "clickPar"
  | "clickTn"
  | "mainSeq"
  | "interactiveSeq"
  | "withEffect"
  | "withGroup"
  | "withPar"
  | "afterEffect"
  | "afterGroup"
  | "tmRoot"
  | "tnNode";

export type RestartType = "always" | "never" | "whenNotActive";

export type FillType = "remove" | "freeze" | "hold" | "transition";

export type SyncBehavior = "canSlip" | "locked";

export type ContainerKind = "par" | "seq" | "excl";

export type PresetClass = "entr" | "exit" | "emph" | "path" | "verb" | "mediacall";

export type MasterRel = "sameClick" | "nextClick" | "lastClick";

export type DurationValue = number | "indefinite";

// §19.5.20 cond
export type CondEvent =
  | "onBegin"
  | "onEnd"
  | "begin"
  | "end"
  | "onClick"
  | "onDblClick"
  | "onMouseOver"
  | "onMouseOut"
  | "onNext"
  | "onPrev"
  | "onStopAudio"
  | "resume";

// §19.5.81 tgtEl
export interface TxEl {
  charRg?: { st: number; end: number };
  pRg?: { st: number; end: number };
}

export interface ChartElTarget {
  type?: string;
  lvl?: number;
}

export interface GraphicChartElTarget {
  seriesIdx?: number;
  categoryIdx?: number;
  bldStep?: string;
}

export interface GraphicDgmElTarget {
  id?: string;
  bldStep?: string;
}

export interface SpTgt {
  spid: string;
  bg?: boolean;
  subSpId?: string;
  oleChartEl?: ChartElTarget;
  txEl?: TxEl;
  graphicEl?: {
    chartEl?: GraphicChartElTarget;
    dgmEl?: GraphicDgmElTarget;
  };
}

export interface SoundTgt {
  embed?: string;
  link?: string;
  builtIn?: boolean;
  rId?: string;
  /** `<p:sndTgt name>` */
  name?: string;
  /** 解析后的媒体 src（data URL / file: / http）；from-scratch 用它重登记 rId。 */
  src?: string;
}

export interface TgtEl {
  inkTgt?: string;
  sldTgt?: true;
  sndTgt?: SoundTgt;
  spTgt?: SpTgt;
}

export interface Cond {
  evt?: CondEvent;
  delay?: DurationValue;
  tn?: string;
  rtn?: "first" | "last" | "all";
  tgtEl?: TgtEl;
}

// §19.5.37 iterate
export interface Iterate {
  type: "el" | "wd" | "lt";
  backwards?: boolean;
  tmAbs?: number;
  tmPct?: number;
  // §19.5.37 stepMs 应基于"iterate 所属容器整体 dur"，而不是各 leaf 自己的 cTn.dur。
  // walk.ts 进入带 iterate 的容器时，扫描子叶子 cTn.dur 取 max，注入到这里供
  // expandIterateSlices 使用，避免 set leaf (dur=1ms) 导致 tmPct 计算出 0.3ms 这种
  // 失真的 stepMs。
  baseDurMs?: number;
}

// §19.5.18 cTn
export interface CTn {
  id?: string;
  presetID?: number;
  presetClass?: PresetClass;
  presetSubtype?: number;
  presetVersion?: number;
  nodeType?: NodeType;
  dur?: DurationValue;
  delay?: DurationValue;
  restart?: RestartType;
  fill?: FillType;
  syncBehavior?: SyncBehavior;
  accel?: number;
  decel?: number;
  autoRev?: boolean;
  // §19.5.18 cTn.repeatCount: ST_TLIterateVal = unsignedInt (千分比, 1000=1 次) | "indefinite"
  repeatCount?: number | "indefinite";
  repeatDur?: DurationValue;
  // §19.5.18 cTn@spd: ST_Percentage. 100000 = 100% = 1×；负值表示反向播放。
  // PowerPoint 还会写非规范的字符串 "slow" / "med" / "fast"，parser 保留原值，
  // 下游 resolveSpdRatio 负责解析为倍率。
  spd?: string;
  // §19.5.18 cTn@tmFilter: SMIL 2.1 时间过滤器，"t1,v1; t2,v2; ..." 形式定义
  // dur 内 progress 推进的曲线，比 accel/decel 更精细；解析层保留原始字符串，
  // 由 compile/leaf 在转 atom keyframes 时合并到 easing。
  tmFilter?: string;
  iterate?: Iterate;
  stCondLst?: Cond[];
  endCondLst?: Cond[];
  endSync?: Cond;
  evtFilter?: string;
  display?: boolean;
  masterRel?: MasterRel;
  bldLvl?: number;
  grpId?: number;
  afterEffect?: boolean;
  nodePh?: boolean;
  childTnLst?: TimeNode[];
  subTnLst?: TimeNode[];
}

// §19.5.14 cBhvr
export type AdditiveType = "base" | "sum" | "repl" | "mult" | "none";
export type AccumulateType = "none" | "always";
export type XfrmType = "pt" | "img" | "txt";
export type OverrideType = "childStyle" | "normal";

export interface CBhvr {
  ctn: CTn;
  tgtEl: TgtEl;
  attrNameLst?: string[];
  additive?: AdditiveType;
  accumulate?: AccumulateType;
  xfrmType?: XfrmType;
  from?: string;
  to?: string;
  by?: string;
  rctx?: string;
  override?: OverrideType;
}

// §19.5.17 cMediaNode
export interface CMediaNode {
  ctn: CTn;
  tgtEl: TgtEl;
  mute?: boolean;
  numSld?: number;
  showWhenStopped?: boolean;
  vol?: number;
}

// §19.5.78 tav
export interface TimeAnimValue {
  tm?: number;
  fmla?: string;
  val?: AnimVal;
  // §19.5.18 cTn 子节点 by/spline 的控制点（"x1 y1 x2 y2"），定义 keyframe 局部 cubic-bezier easing。
  bySpline?: string;
}

// §19.5.86 Value Variant
export type AnimVal =
  | { kind: "str"; val: string }
  | { kind: "int"; val: number }
  | { kind: "flt"; val: number }
  | { kind: "bool"; val: boolean }
  | { kind: "clr"; val: AnimColor };

export type AnimValueType = "str" | "num" | "clr";
export type CalcMode = "discrete" | "lin" | "fmla";

// §20.1.2 颜色子模型（动画上下文）
export interface AnimColor {
  hex?: string;
  scheme?: string;
  prst?: string;
  hsl?: { h: number; s: number; l: number };
  scrgb?: { r: number; g: number; b: number };
  sys?: { val?: string; lastClr?: string };
  modifiers?: ColorModifier[];
}

export type ColorModifier =
  | { kind: "lumMod"; val: number }
  | { kind: "lumOff"; val: number }
  | { kind: "shade"; val: number }
  | { kind: "tint"; val: number }
  | { kind: "satMod"; val: number }
  | { kind: "satOff"; val: number }
  | { kind: "hueMod"; val: number }
  | { kind: "hueOff"; val: number }
  | { kind: "alpha"; val: number }
  | { kind: "alphaMod"; val: number }
  | { kind: "alphaOff"; val: number };

export interface ColorBy {
  rgb?: { r: number; g: number; b: number };
  hsl?: { h: number; s: number; l: number };
}

export interface AnimPoint {
  x: number;
  y: number;
}

// §19.5.86 顶层时间节点联合（容器 + 9 种行为）
export type TimeNode =
  | ParNode
  | SeqNode
  | ExclNode
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

export interface ParNode {
  kind: "par";
  ctn: CTn;
}

export interface SeqNode {
  kind: "seq";
  ctn: CTn;
  concurrent?: boolean;
  // §19.5.32 seq@prevAc: ST_TLPreviousActionType = "none" | "skipTimed"。
  prevAc?: "none" | "skipTimed";
  nextAc?: "none" | "seek";
  prevCondLst?: Cond[];
  nextCondLst?: Cond[];
}

export interface ExclNode {
  kind: "excl";
  ctn: CTn;
}

// §19.5.69 set
export interface SetNode {
  kind: "set";
  cBhvr: CBhvr;
  to?: AnimVal;
}

// §19.5.6 anim
export interface AnimNode {
  kind: "anim";
  cBhvr: CBhvr;
  tavLst?: TimeAnimValue[];
  by?: string;
  from?: string;
  to?: string;
  calcMode?: CalcMode;
  valueType?: AnimValueType;
}

// §19.5.7 animClr
export interface AnimClrNode {
  kind: "animClr";
  cBhvr: CBhvr;
  clrSpc?: "rgb" | "hsl";
  dir?: "cw" | "ccw";
  by?: ColorBy;
  from?: AnimColor;
  to?: AnimColor;
}

// §19.5.8 animEffect
export interface AnimEffectNode {
  kind: "animEffect";
  cBhvr: CBhvr;
  transition?: "in" | "out" | "none";
  filter?: string;
  prLst?: string;
  progress?: number;
}

// §19.5.9 animMotion
export interface AnimMotionNode {
  kind: "animMotion";
  cBhvr: CBhvr;
  origin?: "parent" | "layout";
  path?: string;
  pathEditMode?: "relative" | "fixed";
  rAng?: number;
  ptsTypes?: string;
  from?: AnimPoint;
  to?: AnimPoint;
  by?: AnimPoint;
  rCtr?: AnimPoint;
}

// §19.5.10 animRot
export interface AnimRotNode {
  kind: "animRot";
  cBhvr: CBhvr;
  by?: number;
  from?: number;
  to?: number;
}

// §19.5.11 animScale
export interface AnimScaleNode {
  kind: "animScale";
  cBhvr: CBhvr;
  zoomContents?: boolean;
  from?: AnimPoint;
  to?: AnimPoint;
  by?: AnimPoint;
}

// §19.5.16 cmd
export interface CmdNode {
  kind: "cmd";
  cBhvr: CBhvr;
  type?: "evt" | "call" | "verb";
  cmd?: string;
}

// §19.5.12 audio
export interface AudioNode {
  kind: "audio";
  cMediaNode: CMediaNode;
  isNarration?: boolean;
}

// §19.5.74 video
export interface VideoNode {
  kind: "video";
  cMediaNode: CMediaNode;
  fullScrn?: boolean;
}

// §19.5.13 bldLst
export type BuildParaType =
  | "p"
  | "cust"
  | "whole"
  | "allAtOnce"
  | "p1"
  | "p2"
  | "p3"
  | "p4"
  | "p5";

export type BuildDgmType =
  | "whole"
  | "allAtOnce"
  | "lvlOne"
  | "lvlAtOnce"
  | "fromLeaves"
  | "fromCenter";

export type BuildOleChartType =
  | "allAtOnce"
  | "series"
  | "category"
  | "seriesEl"
  | "categoryEl";

export type BuildEntry =
  | {
      kind: "bldP";
      spid: string;
      grpId: number;
      uiExpand?: boolean;
      build?: BuildParaType;
      // §19.5.3 bldP@bldLvl: 段落层级（默认 1，仅在 build="p"/"cust" 下有意义）。
      bldLvl?: number;
      // §19.5.3 bldP@animBg: 是否同时动画 shape 背景（默认 false）。
      animBg?: boolean;
      rev?: boolean;
      // §19.5.3 bldP@advAuto: ST_TLTime = unsignedInt | "indefinite"，默认 indefinite。
      advAuto?: DurationValue;
      autoUpdateAnimBg?: boolean;
      tmplLst?: BuildTmplLst;
    }
  | {
      kind: "bldGraphic";
      spid: string;
      grpId: number;
      bldAsOne?: boolean;
      bldChart?: BuildOleChartType;
      bldDgm?: BuildDgmType;
    }
  | {
      kind: "bldDgm";
      spid: string;
      grpId: number;
      bld?: BuildDgmType;
    }
  | {
      kind: "bldOleChart";
      spid: string;
      grpId: number;
      animBg?: boolean;
      bld?: BuildOleChartType;
    };

export interface BuildTmpl {
  lvl?: number;
  tnLst?: TimeNode[];
}

export type BuildTmplLst = BuildTmpl[];

// §19.5.81 timing 顶层
export interface OoxmlTiming {
  tnLst: TimeNode[];
  bldLst: BuildEntry[];
}

// runtime 求值上下文
export interface SlideEnv {
  slideWidth: number;
  slideHeight: number;
}

export interface TargetBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

// 类型守卫
export function isContainer(n: TimeNode): n is ParNode | SeqNode | ExclNode {
  return n.kind === "par" || n.kind === "seq" || n.kind === "excl";
}

export function isBehavior(
  n: TimeNode,
): n is
  | SetNode
  | AnimNode
  | AnimClrNode
  | AnimEffectNode
  | AnimMotionNode
  | AnimRotNode
  | AnimScaleNode
  | CmdNode {
  return (
    n.kind === "set" ||
    n.kind === "anim" ||
    n.kind === "animClr" ||
    n.kind === "animEffect" ||
    n.kind === "animMotion" ||
    n.kind === "animRot" ||
    n.kind === "animScale" ||
    n.kind === "cmd"
  );
}

export function isMedia(n: TimeNode): n is AudioNode | VideoNode {
  return n.kind === "audio" || n.kind === "video";
}

export function getCTn(n: TimeNode): CTn {
  if (isContainer(n)) return n.ctn;
  if (isMedia(n)) return n.cMediaNode.ctn;
  return n.cBhvr.ctn;
}

export function getTgtEl(n: TimeNode): TgtEl | undefined {
  if (isContainer(n)) return undefined;
  if (isMedia(n)) return n.cMediaNode.tgtEl;
  return n.cBhvr.tgtEl;
}

export function getChildren(n: TimeNode): TimeNode[] {
  return getCTn(n).childTnLst ?? [];
}

// subTnLst 单独取出：含音频/"播放完成后隐藏/快退"等附加效果。需要单独编译并
// 用 tn 引用对齐绝对时间，不能与 childTnLst 共用同一相对 offset 计算路径。
export function getSubChildren(n: TimeNode): TimeNode[] {
  return getCTn(n).subTnLst ?? [];
}
