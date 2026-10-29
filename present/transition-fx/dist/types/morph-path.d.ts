/** SVG path helpers for Morph transitions (normalize + interpolate). */
export interface PathCommand {
    cmd: string;
    args: number[];
}
interface Point {
    x: number;
    y: number;
}
export declare function parsePathCommands(d: string): PathCommand[];
/** Convert relative path commands to absolute (uppercase) equivalents. */
export declare function pathToAbsolute(commands: PathCommand[]): PathCommand[];
/** Open line path in local coordinates. */
export declare function linePathFromPoints(x1: number, y1: number, x2: number, y2: number): string;
/** Closed rectangle path in local coordinates (0,0)–(w,h). */
export declare function rectPathFromSize(w: number, h: number): string;
/** Closed ellipse path approximated as a polyline in local bbox (w×h). */
export declare function ellipsePathFromSize(w: number, h: number, segments?: number): string;
/** Convert SVG polygon/polyline `points` attribute to a path `d` string. */
export declare function polygonPointsToPath(points: string, closed: boolean): string;
/**
 * Rotate / reverse `b` so closed polylines align for smoother morph tweens.
 * Exported for regression tests.
 */
export declare function alignClosedPolylines(a: Point[], b: Point[]): {
    a: Point[];
    b: Point[];
};
/** Sample absolute path commands into a polyline (Bezier / arc aware). */
export declare function flattenPathToPoints(commands: PathCommand[], segmentsPerCurve?: number): Point[];
/** Build a tween for morphing `fromD` → `toD`, or null when only FLIP should apply. */
export declare function makeMorphPathTween(fromD: string, toD: string): ((t: number) => string) | null;
/** Whether path geometry can morph (vs FLIP-only). */
export declare function morphPathCompatible(fromD: string, toD: string): boolean;
/** Compare two paths after normalization (for shape matching). */
export declare function morphPathSignature(d: string): string;
export {};
