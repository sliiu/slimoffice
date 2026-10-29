export { parsePptx, parseFromArchive, applyMediaAutoplayFromTiming, PptxOpenError } from "./parse";
export { parsePhotoAlbum, photoAlbumSnapshot } from "./photo-album";
export type { ParseOptions, PptxOpenErrorCode } from "./parse";
export type { ExplicitRPrSnapshot } from "./text";
export { recomputeSlideInheritance } from "./recompute";
export { rebuildOriginsFromSource } from "./rebuild-origins";
export { loadArchive, ZipBombError } from "./zip";
export type { PptxArchive } from "./zip";
export { MediaResolver, type MediaMode } from "./media";
export { extractOmmlFrom, ommlToLatex, ommlToPlain, inspectMathMarkup } from "./omml";
export {
  presetToShape,
  pathHasSubPaths,
  officialPresetAdjDefaults,
  listOfficialAdjustHandles,
  dragOfficialAdjustHandle,
} from "./preset-geom";
export type { PresetResult } from "./preset-geom";
export type { ResolvedAdjustHandle } from "./cust-geom";
export {
  guessOleProgId,
  oleBadgeColor,
  oleBadgeText,
  oleTypeLabel,
  OLE_GRAPHIC_URI,
  parseOleGraphicFrame,
} from "./ole";
export { extractOlePreviewPayload } from "./ole-preview";
export {
  parseVbaProjectMetadata,
  readVbaModuleSource,
  parseVbaModuleProcedures,
  formatVbaBasExport,
  searchVbaProceduresInProject,
  exportAllVbaModulesBas,
  indexVbaProceduresInProject,
} from "./vba-project-parse";
export type { VbaProcedureHit, VbaProcedureIndexEntry } from "./vba-project-parse";
export { decompressVbaStream } from "./vba-decompress";
export type {
  Baker,
  Shape3DRequest,
  Shape3DResult,
  Sp3DParams,
  Scene3DParams,
  Sp3DInfo,
  Camera3D,
  LightRig3D,
} from "./shape-3d";
