import type { PlaceholderInfo, Shape, TextStyles } from "@sliiu/present-core";
import type { TxStyles } from "./tx-styles.js";
export declare function phMatch(a: PlaceholderInfo, b: PlaceholderInfo): boolean;
export interface PhIndex {
    list: Shape[];
}
export declare function indexPlaceholders(shapes: Shape[]): PhIndex;
export interface InheritOptions {
    masterTxStyles?: TxStyles;
    presDefaultTextStyle?: TextStyles;
}
export declare function applyInheritance(slideShapes: Shape[], layers: PhIndex[], opts?: InheritOptions): Shape[];
export declare function nonPlaceholderShapes(shapes: Shape[]): Shape[];
export declare function applyAutoFit(shapes: Shape[]): Shape[];
