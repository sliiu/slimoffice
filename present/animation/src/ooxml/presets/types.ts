/**
 * Declarative preset-effect table types.
 *
 * Each entry maps a (presetClass, presetID, [presetSubtype]) tuple from
 * ECMA-376 PresentationML to a list of behavior channels that drive the
 * scene node directly. The compiler in presets/compile.ts instantiates
 * the channels with concrete numbers (distance, direction, etc.) from
 * the target shape's bbox and the slide size.
 *
 * Value expressions in keyframes accept:
 *   numbers, or strings using $dx/$dy (unit direction),
 *   $dist (default = slide width or height depending on axis),
 *   $bboxW/$bboxH (target bbox size).
 * Times in kf[].t are normalized [0..1] (multiplied by duration at compile).
 */

export type AnimValueKind = "number" | "color" | "bool" | "string";

export type ChannelProp =
  | "opacity"
  | "tx"
  | "ty"
  | "rotation"
  | "scale"
  | "scaleX"
  | "scaleY"
  | "fillColor"
  | "strokeColor"
  | "strokeWidth"
  | "clipDirection"
  | "wheelReveal"
  | "brightness"
  | "saturation"
  | "hueRotate"
  | "fontColor"
  | "fontWeight"
  | "underline";

export interface ChannelKF {
  t: number;
  v: number | string;
  ease?: string;
}

export interface ChannelDesc {
  prop: ChannelProp;
  valueKind?: AnimValueKind;
  relative?: boolean;
  kf: ChannelKF[];
  defaultEase?: string;
}

// ECMA-376 §19.5.8 animEffect 等价描述：preset 简化 XML 没有 cBhvr 子节点时
// 按此回退合成 FilterTrack。prLst 支持 "$axis"/"$dirName"/"$spokes" 模板。
export interface FilterDesc {
  filter: string;
  transition?: "in" | "out";
  prLst?: string;
}

export interface PresetDesc {
  ids: number[];
  name: string;
  supportsSubtype?: boolean;
  channels: ChannelDesc[];
  filters?: FilterDesc[];
}
