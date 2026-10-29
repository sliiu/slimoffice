import { type XmlNode } from "./xml.js";
import { type ThemeData } from "./theme.js";
import type { Sp3DInfo } from "@sliiu/present-core";
export type { Baker, Shape3DRequest, Shape3DResult, Sp3DParams, Scene3DParams, Sp3DInfo, Camera3D, LightRig3D, } from "@sliiu/present-core";
/**
 * 忠实解析 spPr / bodyPr 下的 `<a:scene3d>` 和 `<a:sp3d>` → Sp3DInfo。
 * 只记录 XML 实际写了的内容；preset → 具体相机/材质/默认值 的映射在渲染侧效果层。
 */
export declare function parse3DInfo(spPr: XmlNode | undefined, theme: ThemeData | undefined): Sp3DInfo | undefined;
