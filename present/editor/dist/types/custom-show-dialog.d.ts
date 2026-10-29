import type { CustomShow, Presentation } from "@sliiu/present-core";
export interface CustomShowDialogResult {
    action: "play" | "save";
    shows: CustomShow[];
}
/** Slideshow → Custom Show：管理自定义放映子集。 */
export declare function openCustomShowDialog(doc: Document, pres: Presentation, opts?: {
    onPlay?: (indices: number[]) => void;
}): void;
