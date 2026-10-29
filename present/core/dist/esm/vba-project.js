/** Standard OOXML part path for embedded VBA project bytes. */
export const VBA_PROJECT_PART_PATH = "ppt/vbaProject.bin";
export const PPTM_MIME = "application/vnd.ms-powerpoint.presentation.macroEnabled.12";
export function archiveHasVbaProject(files) {
    return files.has(VBA_PROJECT_PART_PATH);
}
export function presentationHasVbaProject(pres) {
    const src = pres.__source;
    if (!src)
        return false;
    if (src.macroEnabled)
        return true;
    return archiveHasVbaProject(src.files);
}
export function presentationExportExtension(pres) {
    return presentationHasVbaProject(pres) ? "pptm" : "pptx";
}
export function presentationExportMime(pres) {
    return presentationHasVbaProject(pres) ? PPTM_MIME : "application/vnd.openxmlformats-officedocument.presentationml.presentation";
}
