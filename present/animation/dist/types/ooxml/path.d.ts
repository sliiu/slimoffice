export interface SampledPoint {
    x: number;
    y: number;
    angle: number;
    cornerAhead?: boolean;
}
export declare function normalizeMotionPath(raw: string): string;
export declare function samplePath(d: string, n: number, scaleW: number, scaleH: number, ptsTypes?: string): SampledPoint[];
export declare function rotateMotionPath(d: string, deg: number): string;
