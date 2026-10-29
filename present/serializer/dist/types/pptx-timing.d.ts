import { ooxml } from "@sliiu/present-animation";
import { type SlideTransition } from "@sliiu/present-core";
import type { MediaRegistrar } from "./media-table.js";
type OoxmlTiming = ooxml.OoxmlTiming;
export declare function serializeTransition(t: SlideTransition | undefined, media?: MediaRegistrar): string;
export declare function serializeTiming(timing: OoxmlTiming | undefined, media?: MediaRegistrar): string;
/**
 * 把时序里的 spid 改成这次写出的 `cNvPr@id`。
 *
 * 编辑器 / 播放器用 `sp_${spid}` 找回 shape.id（`sp_7`、`sp_dg_…`、`sp_edit_…` 都成立）。
 * OOXML 的 `spid` 必须是同一 part 里的数字 `cNvPr@id`。`sp_<数字>` 两边一致；
 * 其余 id 在写盘时会被分配一个新数字，不改写的话 PowerPoint 对不上形状，动画落空或打到别的形状上。
 * 只改序列化用的副本，内存里的逻辑 spid 保持不动。
 */
export declare function remapTimingSpids(timing: OoxmlTiming | undefined, spIdByShapeId: ReadonlyMap<string, number> | undefined): OoxmlTiming | undefined;
export type MediaTimingHint = {
    kind: "video" | "audio";
    spid: number;
    autoplay?: boolean;
    loop?: boolean;
    muted?: boolean;
    /** 仅 audio：写成 `p:audio@isNarration="1"`。 */
    isNarration?: boolean;
};
/** 给插入的视频 / 音频补 Office 需要的 `p:video` / `p:audio` 时序节点。 */
export declare function mergeMediaTiming(timing: OoxmlTiming | undefined, hints: MediaTimingHint[] | undefined): OoxmlTiming | undefined;
export {};
