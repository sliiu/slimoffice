import type { TimeNode } from "../../types.js";
interface ExtractedDB {
    entr: Record<string, TimeNode>;
    exit: Record<string, TimeNode>;
    emph: Record<string, TimeNode>;
    path: Record<string, TimeNode>;
}
export declare const EXTRACTED_PRESETS: ExtractedDB;
export {};
