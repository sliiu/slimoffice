import { ooxml } from "@sliiu/present-animation";
import type { Slide } from "@sliiu/present-core";
type OoxmlTiming = ooxml.OoxmlTiming;
type TimeNode = ooxml.TimeNode;
type CTn = ooxml.CTn;
export type EffectTrigger = "onClick" | "withPrevious" | "afterPrevious" | "onShapeClick" | "onShapeDblClick" | "onShapeHover" | "onShapeMouseOut" | "onPrev" | "onNext" | "onLoad";
export type EffectClass = "entr" | "emph" | "exit" | "path" | "media" | "custom";
export interface Effect {
    id: string;
    trigger: EffectTrigger;
    triggerShapeId?: string;
    targetShapeId: string;
    paraRange?: {
        st: number;
        end: number;
    };
    charRange?: {
        st: number;
        end: number;
    };
    presetClass: EffectClass;
    presetId?: number;
    presetSubtype?: number;
    durationMs: number;
    delayMs: number;
    iterations: number;
    autoReverse: boolean;
    repeatCount?: number;
    spd?: string;
    accel?: number;
    decel?: number;
    path: EffectPath;
}
export interface EffectPath {
    topIdx: number;
    cTnId?: string;
    parentPath: number[];
}
export declare function buildEffectList(timing: OoxmlTiming | undefined): Effect[];
export interface InsertEffectArgs {
    targetShapeId: string;
    presetClass: EffectClass;
    presetId: number;
    presetSubtype?: number;
    durationMs?: number;
    delayMs?: number;
    trigger?: EffectTrigger;
    paraRange?: {
        st: number;
        end: number;
    };
    charRange?: {
        st: number;
        end: number;
    };
    index?: number;
}
export declare function ensureTiming(slide: Slide): ooxml.OoxmlTiming;
export declare function findMainSeq(timing: OoxmlTiming): CTn | null;
export declare function freshCTnId(timing: OoxmlTiming): string;
export declare function insertEffect(timing: OoxmlTiming, args: InsertEffectArgs): TimeNode | null;
export declare function removeEffect(timing: OoxmlTiming, effectPath: EffectPath): TimeNode | null;
export declare function moveEffect(timing: OoxmlTiming, effectPath: EffectPath, newIndex: number): void;
export declare function setEffectProperty(timing: OoxmlTiming, effectPath: EffectPath, patch: Partial<Pick<Effect, "trigger" | "durationMs" | "delayMs" | "iterations" | "autoReverse" | "presetSubtype" | "accel" | "decel" | "spd">>): void;
/** 把 source shape 上的动画效果克隆到 target shape（Animation Painter）。 */
export declare function copyShapeAnimations(timing: OoxmlTiming, sourceShapeId: string, targetShapeId: string): number;
export {};
