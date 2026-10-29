import * as THREE from "three";
import type { Paint, Stroke } from "@sliiu/present-core";
import type { ResolvedBackdrop, ResolvedCamera, ResolvedScene3D } from "./resolve.js";
export interface BuildSceneInputs {
    /** 几何基准尺寸（px）= shape bbox。 */
    baseW: number;
    baseH: number;
    pathD?: string;
    fill?: Paint;
    stroke?: Stroke;
    resolved: ResolvedScene3D;
    /** image shape 的正面贴图（已加载 + 已按 cropRect 裁 UV）。 */
    texture?: THREE.Texture | null;
    /** 是否 image shape（决定 slab 几何 + 贴图保色路径）。 */
    isImage: boolean;
}
export interface BuiltScene {
    scene: THREE.Scene;
    /** 几何在世界坐标的宽/高（用于相机 fit）。 */
    geoW: number;
    geoH: number;
    dispose(): void;
}
export declare function buildThreeScene(inputs: BuildSceneInputs): BuiltScene;
/**
 * 把相机摆到「物体在 viewW×viewH 视口里接近 1:1（含 pad 余量）」的距离并构建 THREE 相机。
 * offscreen 与 live 共用：offscreen 传 padded canvas 尺寸；live 传显示像素尺寸。
 */
export declare function createSceneCamera(cam: ResolvedCamera, geoW: number, geoH: number, viewW: number, viewH: number, pad: number, backdrop?: ResolvedBackdrop): THREE.Camera;
/**
 * 若 src 对应图片此前已被 loadImageTexture 解码过，则同步返回一个新 Texture；否则
 * 返回 null（调用方需走异步 loadImageTexture）。用于热路径（拖动重建）下零延迟首渲。
 */
export declare function getCachedImageTexture(src: string): THREE.Texture | null;
export declare function loadImageTexture(src: string): Promise<THREE.Texture | null>;
