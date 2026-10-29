import type { Presentation, PresentationSource } from "./slide";

/** Standard OOXML part path for embedded VBA project bytes. */
export const VBA_PROJECT_PART_PATH = "ppt/vbaProject.bin";

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

export const PPTM_MIME = "application/vnd.ms-powerpoint.presentation.macroEnabled.12";

export function archiveHasVbaProject(files: Map<string, Uint8Array>): boolean {
  return files.has(VBA_PROJECT_PART_PATH);
}

export function presentationHasVbaProject(pres: Presentation | { __source?: PresentationSource }): boolean {
  const src = pres.__source;
  if (!src) return false;
  if (src.macroEnabled) return true;
  return archiveHasVbaProject(src.files);
}

export function presentationExportExtension(pres: Presentation): "pptx" | "pptm" {
  return presentationHasVbaProject(pres) ? "pptm" : "pptx";
}

export function presentationExportMime(pres: Presentation): string {
  return presentationHasVbaProject(pres) ? PPTM_MIME : "application/vnd.openxmlformats-officedocument.presentationml.presentation";
}
