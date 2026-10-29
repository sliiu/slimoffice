export interface CameraPreset {
    /** 纬度（俯仰），度。负值=相机在物体上方俯视（"Above" 类语义）。 */
    lat: number;
    /** 经度（偏航），度。 */
    lon: number;
    /** 自转，度。 */
    rev: number;
    /** 视场角，度。<1 视为正交投影。 */
    fov: number;
}
export declare const CAMERA_PRESETS: Record<string, CameraPreset>;
export declare const FOV_LOCKED_PRESETS: Set<string>;
/**
 * ECMA-376 §20.1.5.4：`<a:bevelT/>` / `<a:bevelB/>` 缺省 w/h = 76200 EMU。
 * 76200 ÷ 9525 EMU/px = 8 px。parser 把缺省留 undefined，这里补默认。
 */
export declare const DEFAULT_BEVEL_PX = 8;
/** ECMA-376 §20.1.5.12 sp3d/@prstMaterial 默认 = warmMatte。 */
export declare const DEFAULT_MATERIAL = "warmMatte";
/** ECMA-376 §20.1.5.9 lightRig 缺省（无 scene3d 时）我们用 threePt 兜底。 */
export declare const DEFAULT_LIGHT_RIG = "threePt";
/** PerspectiveCamera 缺省 fov（无 preset 也无显式 fov 时）。 */
export declare const DEFAULT_FOV = 35;
