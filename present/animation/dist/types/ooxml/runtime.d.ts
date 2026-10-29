import { type Ticker } from "./ticker.js";
import type { CompiledStep, CompiledTiming, StepTrigger } from "./compile.js";
import type { Animatable } from "../types.js";
export interface RuntimeOpts {
    timing: CompiledTiming;
    resolve: (id: string) => Animatable | null;
    onMediaCmd?: (info: MediaCmdInfo) => void;
    onCmd?: (info: CmdInfo) => void;
    onChange?: () => void;
    onComplete?: () => void;
    ticker?: Ticker;
}
export interface MediaCmdInfo {
    targetId: string;
    mediaKind: "audio" | "video";
    action: "play" | "pause" | "stop" | "resume";
    vol?: number;
    mute?: boolean;
    fullScreen?: boolean;
    soundSrc?: string;
}
export interface CmdInfo {
    targetId: string;
    type: "evt" | "call" | "verb";
    cmd: string;
    soundSrc?: string;
}
export declare class TimingRuntime {
    private steps;
    private shapeSteps;
    private resolve;
    private onMediaCmd?;
    private onCmd?;
    private onChange?;
    private onComplete?;
    private ticker;
    private cursor;
    private shapeCursors;
    private active;
    private elapsed;
    private unsub?;
    private playing;
    private propAcc;
    private colorBase;
    private colorBaseSeen;
    constructor(opts: RuntimeOpts);
    startAutoSteps(): void;
    /**
     * 把主序列 cursor 推到 `want`。迟到快进时 freeze 已过的 step；
     * `playLast` 时最后开始的那一步正常播放（直播跟随时不要跳到末态）。
     */
    seekMainCursor(want: number, playLast: boolean): void;
    click(): boolean;
    shapeClick(targetId: string): boolean;
    shapeDblClick(targetId: string): boolean;
    /** 该形状上这一类序列是否还有没播过的步。 */
    hasQueuedShape(targetId: string, trigger: "onShapeClick" | "onShapeDblClick"): boolean;
    /** 进入形状时重播该形状上的悬停序列，不占用单击游标。 */
    shapeHover(targetId: string): boolean;
    /** 指针离开形状时重播移出序列。 */
    shapeMouseOut(targetId: string): boolean;
    /**
     * interactiveSeq 的 onPrev / onNext。不推进主序列游标。
     * 有步骤就从头再播一遍。
     */
    playNav(which: "onPrev" | "onNext"): boolean;
    listShapeSteps(): {
        trigger: StepTrigger;
        triggerTargetId?: string;
    }[];
    hasNext(): boolean;
    totalSteps(): number;
    currentStep(): number;
    /** 主序列或形状序列是否仍有未播完的 active step（含 indefinite）。 */
    isPlaying(): boolean;
    destroy(): void;
    reset(): void;
    seekStep(step: CompiledStep, ms: number): void;
    /**
     * 调试/视觉对比专用：把所有当前 active step 强制冻结到"该 step 一次完整 iteration 的末态"。
     * 对 indefinite/loop 动画选择 step.duration（首次循环末尾）作为确定性截图位点；
     * 对有限步选择实际总时长。结束后停止 ticker，让后续截图捕捉到稳定帧。
     *
     * NOTE: 不修改 elapsed / active 列表（保留 indefinite，移除 finite），保证后续
     * click/tickActive 的时序语义不变。target 上的 hold 末态由 propAcc.flush() 写入，
     * 因 setProperty 是持久写入，下一帧 propAcc.beginFrame() 不会冲掉它。
     */
    freezeActiveToEnd(): void;
    private replayShape;
    private shapeQueue;
    private playQueuedShape;
    private beginStep;
    /** 点击另一形状时结束其它形状动画（excl 互斥）。主序列 onClick 不受影响。 */
    private interruptShapeSteps;
    private hasRunningActive;
    private completePendingClickStep;
    private start;
    private stop;
    private tickActive;
    private applyStepAt;
    private applyAtomAt;
    private applyTrack;
    private colorBaseFor;
    private applyMotion;
    private emitDiscreteFor;
}
