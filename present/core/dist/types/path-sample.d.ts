export interface PathPoint {
    x: number;
    y: number;
}
interface Segment {
    fn: (t: number) => PathPoint;
    length: number;
}
export declare function buildSegments(d: string, sx?: number, sy?: number): Segment[];
export declare function translatePathD(d: string, dx: number, dy: number): string;
export declare function samplePath(d: string, count: number, sx?: number, sy?: number): PathPoint[];
export {};
