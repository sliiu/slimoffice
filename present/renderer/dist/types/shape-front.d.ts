import type { Shape } from "@sliiu/present-core";
import type { Scene } from "./scene-node.js";
/** 文字 3D 的正面：字形画进 PNG，再贴到挤出体上。非文字返回 undefined。 */
export declare function shapeFrontImageSrc(scene: Scene, shape: Shape): string | undefined;
