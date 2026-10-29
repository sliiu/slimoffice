interface Pt {
    x: number;
    y: number;
}
export interface DrawingMLPathResult {
    /** `<a:moveTo>...` 等命令串（不含外层 `<a:path>`）。 */
    commands: string;
    /** 是否至少有一条有效命令。 */
    ok: boolean;
}
export declare function svgPathToDrawingML(d: string, origin: Pt, pxToEmu: (px: number) => number): DrawingMLPathResult;
export {};
