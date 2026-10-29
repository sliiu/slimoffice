import type { Paint, Shape, SlideSize } from "@sliiu/present-core";
export interface SnapshotInput {
    size: SlideSize;
    background?: Paint;
    shapes: Shape[];
}
export declare function snapshotThemeShapes(input: SnapshotInput): string;
