export type NodeType = "clickEffect" | "clickPar" | "clickTn" | "mainSeq" | "interactiveSeq" | "withEffect" | "withGroup" | "withPar" | "afterEffect" | "afterGroup" | "tmRoot" | "tnNode";
export type RestartType = "always" | "never" | "whenNotActive";
export type FillType = "remove" | "freeze" | "hold" | "transition";
export type SyncBehavior = "canSlip" | "locked";
export type ContainerKind = "par" | "seq" | "excl";
export type PresetClass = "entr" | "exit" | "emph" | "path" | "verb" | "mediacall";
export type MasterRel = "sameClick" | "nextClick" | "lastClick";
export type DurationValue = number | "indefinite";
export type CondEvent = "onBegin" | "onEnd" | "begin" | "end" | "onClick" | "onDblClick" | "onMouseOver" | "onMouseOut" | "onNext" | "onPrev" | "onStopAudio" | "resume";
export interface TxEl {
    charRg?: {
        st: number;
        end: number;
    };
    pRg?: {
        st: number;
        end: number;
    };
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
export interface Iterate {
    type: "el" | "wd" | "lt";
    backwards?: boolean;
    tmAbs?: number;
    tmPct?: number;
    baseDurMs?: number;
}
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
    repeatCount?: number | "indefinite";
    repeatDur?: DurationValue;
    spd?: string;
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
export interface CMediaNode {
    ctn: CTn;
    tgtEl: TgtEl;
    mute?: boolean;
    numSld?: number;
    showWhenStopped?: boolean;
    vol?: number;
}
export interface TimeAnimValue {
    tm?: number;
    fmla?: string;
    val?: AnimVal;
    bySpline?: string;
}
export type AnimVal = {
    kind: "str";
    val: string;
} | {
    kind: "int";
    val: number;
} | {
    kind: "flt";
    val: number;
} | {
    kind: "bool";
    val: boolean;
} | {
    kind: "clr";
    val: AnimColor;
};
export type AnimValueType = "str" | "num" | "clr";
export type CalcMode = "discrete" | "lin" | "fmla";
export interface AnimColor {
    hex?: string;
    scheme?: string;
    prst?: string;
    hsl?: {
        h: number;
        s: number;
        l: number;
    };
    scrgb?: {
        r: number;
        g: number;
        b: number;
    };
    sys?: {
        val?: string;
        lastClr?: string;
    };
    modifiers?: ColorModifier[];
}
export type ColorModifier = {
    kind: "lumMod";
    val: number;
} | {
    kind: "lumOff";
    val: number;
} | {
    kind: "shade";
    val: number;
} | {
    kind: "tint";
    val: number;
} | {
    kind: "satMod";
    val: number;
} | {
    kind: "satOff";
    val: number;
} | {
    kind: "hueMod";
    val: number;
} | {
    kind: "hueOff";
    val: number;
} | {
    kind: "alpha";
    val: number;
} | {
    kind: "alphaMod";
    val: number;
} | {
    kind: "alphaOff";
    val: number;
};
export interface ColorBy {
    rgb?: {
        r: number;
        g: number;
        b: number;
    };
    hsl?: {
        h: number;
        s: number;
        l: number;
    };
}
export interface AnimPoint {
    x: number;
    y: number;
}
export type TimeNode = ParNode | SeqNode | ExclNode | SetNode | AnimNode | AnimClrNode | AnimEffectNode | AnimMotionNode | AnimRotNode | AnimScaleNode | CmdNode | AudioNode | VideoNode;
export interface ParNode {
    kind: "par";
    ctn: CTn;
}
export interface SeqNode {
    kind: "seq";
    ctn: CTn;
    concurrent?: boolean;
    prevAc?: "none" | "skipTimed";
    nextAc?: "none" | "seek";
    prevCondLst?: Cond[];
    nextCondLst?: Cond[];
}
export interface ExclNode {
    kind: "excl";
    ctn: CTn;
}
export interface SetNode {
    kind: "set";
    cBhvr: CBhvr;
    to?: AnimVal;
}
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
export interface AnimClrNode {
    kind: "animClr";
    cBhvr: CBhvr;
    clrSpc?: "rgb" | "hsl";
    dir?: "cw" | "ccw";
    by?: ColorBy;
    from?: AnimColor;
    to?: AnimColor;
}
export interface AnimEffectNode {
    kind: "animEffect";
    cBhvr: CBhvr;
    transition?: "in" | "out" | "none";
    filter?: string;
    prLst?: string;
    progress?: number;
}
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
export interface AnimRotNode {
    kind: "animRot";
    cBhvr: CBhvr;
    by?: number;
    from?: number;
    to?: number;
}
export interface AnimScaleNode {
    kind: "animScale";
    cBhvr: CBhvr;
    zoomContents?: boolean;
    from?: AnimPoint;
    to?: AnimPoint;
    by?: AnimPoint;
}
export interface CmdNode {
    kind: "cmd";
    cBhvr: CBhvr;
    type?: "evt" | "call" | "verb";
    cmd?: string;
}
export interface AudioNode {
    kind: "audio";
    cMediaNode: CMediaNode;
    isNarration?: boolean;
}
export interface VideoNode {
    kind: "video";
    cMediaNode: CMediaNode;
    fullScrn?: boolean;
}
export type BuildParaType = "p" | "cust" | "whole" | "allAtOnce" | "p1" | "p2" | "p3" | "p4" | "p5";
export type BuildDgmType = "whole" | "allAtOnce" | "lvlOne" | "lvlAtOnce" | "fromLeaves" | "fromCenter";
export type BuildOleChartType = "allAtOnce" | "series" | "category" | "seriesEl" | "categoryEl";
export type BuildEntry = {
    kind: "bldP";
    spid: string;
    grpId: number;
    uiExpand?: boolean;
    build?: BuildParaType;
    bldLvl?: number;
    animBg?: boolean;
    rev?: boolean;
    advAuto?: DurationValue;
    autoUpdateAnimBg?: boolean;
    tmplLst?: BuildTmplLst;
} | {
    kind: "bldGraphic";
    spid: string;
    grpId: number;
    bldAsOne?: boolean;
    bldChart?: BuildOleChartType;
    bldDgm?: BuildDgmType;
} | {
    kind: "bldDgm";
    spid: string;
    grpId: number;
    bld?: BuildDgmType;
} | {
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
export interface OoxmlTiming {
    tnLst: TimeNode[];
    bldLst: BuildEntry[];
}
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
export declare function isContainer(n: TimeNode): n is ParNode | SeqNode | ExclNode;
export declare function isBehavior(n: TimeNode): n is SetNode | AnimNode | AnimClrNode | AnimEffectNode | AnimMotionNode | AnimRotNode | AnimScaleNode | CmdNode;
export declare function isMedia(n: TimeNode): n is AudioNode | VideoNode;
export declare function getCTn(n: TimeNode): CTn;
export declare function getTgtEl(n: TimeNode): TgtEl | undefined;
export declare function getChildren(n: TimeNode): TimeNode[];
export declare function getSubChildren(n: TimeNode): TimeNode[];
