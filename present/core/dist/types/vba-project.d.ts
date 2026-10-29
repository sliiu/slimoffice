import type { Presentation, PresentationSource } from "./slide.js";
/** Standard OOXML part path for embedded VBA project bytes. */
export declare const VBA_PROJECT_PART_PATH = "ppt/vbaProject.bin";
export type VbaModuleKind = "standard" | "document" | "class";
export interface VbaModuleMeta {
    name: string;
    streamName?: string;
    kind: VbaModuleKind;
}
/** Parsed metadata from `ppt/vbaProject.bin` (no macro execution). */
export interface VbaProjectMeta {
    projectName?: string;
    codepage?: number;
    modules: VbaModuleMeta[];
    byteSize: number;
    warnings?: string[];
}
export declare const PPTM_MIME = "application/vnd.ms-powerpoint.presentation.macroEnabled.12";
export declare function archiveHasVbaProject(files: Map<string, Uint8Array>): boolean;
export declare function presentationHasVbaProject(pres: Presentation | {
    __source?: PresentationSource;
}): boolean;
export declare function presentationExportExtension(pres: Presentation): "pptx" | "pptm";
export declare function presentationExportMime(pres: Presentation): string;
