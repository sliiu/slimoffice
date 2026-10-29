import { ooxml } from "@sliiu/present-animation";
import type { Slide } from "@sliiu/present-core";
import { type Scene } from "@sliiu/present-renderer";
type CompiledTiming = ooxml.CompiledTiming;
type SlideEnv = ooxml.SlideEnv;
type CompiledStep = ooxml.CompiledStep;
export interface OoxmlPlayback {
    runtime: ooxml.TimingRuntime;
    compiled: CompiledTiming;
    mainSteps: CompiledStep[];
    shapeSteps: CompiledStep[];
}
export interface BuildOoxmlPlaybackOptions {
    onMediaCmd?: (info: ooxml.MediaCmdInfo) => void;
    onCmd?: (info: ooxml.CmdInfo) => void;
    onChange?: () => void;
    onComplete?: () => void;
    themeColors?: Record<string, string>;
    /** 帧驱动；缺省 requestAnimationFrame。离线渲染传 ManualTicker 逐帧推进。 */
    ticker?: ooxml.Ticker;
}
export declare function buildOoxmlPlayback(slide: Slide, scene: Scene, size: SlideEnv, callbacks?: BuildOoxmlPlaybackOptions): OoxmlPlayback | null;
export {};
