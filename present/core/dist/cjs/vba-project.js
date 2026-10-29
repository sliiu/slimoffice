"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PPTM_MIME = exports.VBA_PROJECT_PART_PATH = void 0;
exports.archiveHasVbaProject = archiveHasVbaProject;
exports.presentationHasVbaProject = presentationHasVbaProject;
exports.presentationExportExtension = presentationExportExtension;
exports.presentationExportMime = presentationExportMime;
/** Standard OOXML part path for embedded VBA project bytes. */
exports.VBA_PROJECT_PART_PATH = "ppt/vbaProject.bin";
exports.PPTM_MIME = "application/vnd.ms-powerpoint.presentation.macroEnabled.12";
function archiveHasVbaProject(files) {
    return files.has(exports.VBA_PROJECT_PART_PATH);
}
function presentationHasVbaProject(pres) {
    const src = pres.__source;
    if (!src)
        return false;
    if (src.macroEnabled)
        return true;
    return archiveHasVbaProject(src.files);
}
function presentationExportExtension(pres) {
    return presentationHasVbaProject(pres) ? "pptm" : "pptx";
}
function presentationExportMime(pres) {
    return presentationHasVbaProject(pres) ? exports.PPTM_MIME : "application/vnd.openxmlformats-officedocument.presentationml.presentation";
}
