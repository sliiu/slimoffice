export { writePptx, buildDeckParts } from "./pptx-write";
export type { WritePptxOptions } from "./pptx-write";
export { assembleDeck } from "./deck-assemble";
export type { DeckParts } from "./deck-assemble";
export type { MediaManifestEntry } from "./media-table";
export { reattachPresentationSource } from "./reattach-source";
export {
  serializePresentationSource,
  deserializePresentationSource,
} from "./source-json";
export type { SerializedPresentationSource } from "./source-json";
export { latexToOMathPara, latexToOmmlInner } from "./omml-write";
export {
  backgroundForThemeExport,
  inferThemeCanvasBackground,
  looksCjkTypeface,
  pickEaTypeface,
  primaryTypeface,
  themeColorsFontsEqual,
  themeTypefacesXml,
} from "./theme-export";
