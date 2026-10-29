import { ooxml } from "@sliiu/present-animation";
type OoxmlTiming = ooxml.OoxmlTiming;
export declare function normalizeTimingForOoxml(timing: OoxmlTiming): OoxmlTiming;
/**
 * 源文件里的时序是不是我们早期 serializer 直出的编辑器结构（cTn@delay、效果包装直挂 mainSeq）。
 * round-trip 遇到这种快照即使用户没动动画也要重写，否则旧稿子再保存一次仍然打不开动画。
 */
export declare function needsOoxmlNormalization(timing: OoxmlTiming | undefined): boolean;
export {};
