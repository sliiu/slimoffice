import type { EasingFn } from "../../types.js";
import type { PropKind } from "../attr-map.js";
import { type AnimNode, type AnimVal, type Cond, type TimeAnimValue, type TimeNode } from "../types.js";
import type { DecodeCtx } from "../attr-map.js";
import type { TnTimeEntry, AncestorEntrExitPreset } from "./types.js";
export declare const genId: (p: string) => string;
export declare function msOf(d: number | "indefinite" | undefined): number;
export declare function condDelay(conds: Cond[] | undefined, tnIndex?: Map<string, TnTimeEntry>): number;
export declare function decodeAnimVal(v: AnimVal, kind: PropKind, decode: (raw: string) => unknown, colorCtx?: import("../color.js").ColorResolveCtx): unknown;
export declare function decodeTavValue(t: TimeAnimValue, kind: PropKind, decode: (raw: string) => unknown, ctx: DecodeCtx): unknown;
export declare function tavEasing(t: TimeAnimValue, parentEasing: EasingFn | undefined): EasingFn | undefined;
export declare function leafDefaultDuration(node: TimeNode): number;
/**
 * 编辑器在没有样本时写出的占位：可见性 set + 一条透明度 anim。
 * 旁边已经有位移 / 滤镜 / 缩放时返回 false，那些叶子按文件里的树播放。
 */
export declare function presetChildrenAreOpacityPlaceholder(node: TimeNode): boolean;
/** Appear / Disappear 与叶子 opacity 组合时仍走叶子语义，避免与预设表冲突。 */
export declare function shouldDelegateAnimToParPreset(inh: AncestorEntrExitPreset, node: AnimNode): boolean;
