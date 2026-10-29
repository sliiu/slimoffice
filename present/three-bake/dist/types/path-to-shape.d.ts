import * as THREE from "three";
export interface PathParse {
    shapes: THREE.Shape[];
    bbox: {
        minX: number;
        minY: number;
        maxX: number;
        maxY: number;
    };
}
export declare function pathDToShapes(d: string): PathParse;
