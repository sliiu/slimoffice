import { type Slide } from "@sliiu/present-core";
import type { Scene } from "./scene-node.js";
/**
 * 放映专用：按当前 timing 把 entrance 目标在 scene 上藏起来（opacity=0 / 段落级 hide）。
 *
 * 编辑器会 `forceVisibleForEdit`，让入场图形在编辑态全部可见；分享 / 导出 / 直播快照
 * 打的是这份数据。播放器必须在这里重算 hidden-until-entrance，不能依赖 shape.opacity。
 */
export declare function applyEntranceHideToScene(scene: Scene, slide: Slide): void;
/**
 * 放映缩略图 / 下一张预览：画出设计稿，而不是「点击前隐藏」的初态。
 *
 * 进入放映时编辑器会把 entrance 目标的 opacity 写回 0。播放舞台要这个初态，
 * 缩略图如果跟着藏，演讲者看到的是空白页。只改 scene，不改 slide 数据。
 */
export declare function revealDesignedAppearance(scene: Scene, slide: Slide): void;
