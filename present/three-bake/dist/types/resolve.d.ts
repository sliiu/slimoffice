import type { Backdrop3D, Camera3D, LightRig3D, Sp3DInfo, Sp3DParams } from "@sliiu/present-core";
export interface ResolvedCamera {
    lat: number;
    lon: number;
    rev: number;
    /** 度；<1 视为正交。 */
    fov: number;
    isOrtho: boolean;
    /** 倍率（1 = 100%），undefined = 不缩放。 */
    zoom?: number;
}
export interface ResolvedBevel {
    /** px，已补默认。 */
    w: number;
    h: number;
}
export interface ResolvedSp3D {
    /** px，原始 extrusionH（缺省 0）。 */
    extrusionH: number;
    contourW?: number;
    contourClr?: string;
    extrusionClr?: string;
    /** 已补默认（warmMatte）。 */
    prstMaterial: string;
    /** 仅当 XML 写了 `<a:bevelT>` 才有；w/h 已补默认。 */
    bevelT?: ResolvedBevel;
    bevelB?: ResolvedBevel;
    /** bevelT/bevelB 任一存在（即声明了倒角）。 */
    hasBevel: boolean;
}
export interface ResolvedLightRig {
    /** 已补默认（threePt）。 */
    rig: string;
    dir?: string;
}
export interface ResolvedScene3D {
    camera: ResolvedCamera;
    sp3d: ResolvedSp3D;
    lightRig: ResolvedLightRig;
    /** undefined = OOXML 未写或 identity（+Z / +Y），相机保持 preset 朝向。 */
    backdrop?: ResolvedBackdrop;
}
export interface ResolvedBackdrop {
    target: {
        x: number;
        y: number;
        z: number;
    };
    /** 单位法向；identity (+Z) 时省略。 */
    forward?: {
        x: number;
        y: number;
        z: number;
    };
    /** 单位 up；identity (+Y) / 零向量时省略。 */
    up?: {
        x: number;
        y: number;
        z: number;
    };
}
export declare function resolveCamera(cam: Camera3D | undefined): ResolvedCamera;
export declare function resolveSp3D(sp3d: Sp3DParams | undefined): ResolvedSp3D;
export declare function resolveLightRig(lr: LightRig3D | undefined): ResolvedLightRig;
/** identity / 全 0 → undefined，setupCamera 保持 preset 朝向。 */
export declare function resolveBackdrop(bd: Backdrop3D | undefined): ResolvedBackdrop | undefined;
export declare function resolveScene3D(info: Sp3DInfo): ResolvedScene3D;
