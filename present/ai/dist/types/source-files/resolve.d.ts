import { type IncomingSourceFile } from "./kinds.js";
import type { ModelFilePart } from "./complete.js";
import type { TextConfig } from "../config/types.js";
export declare class SourceDegradeDeclined extends Error {
    constructor();
}
export interface ResolvedSources {
    material: string;
    parts: ModelFilePart[];
}
export declare function resolveSourceDelivery(text: TextConfig, files: IncomingSourceFile[], ask: (names: string[]) => Promise<boolean>): Promise<ResolvedSources>;
export declare function materialFromParts(parts: ModelFilePart[]): string;
