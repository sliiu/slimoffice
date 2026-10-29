/**
 * SlimPPT deckgen — compile an editable Presentation.
 *
 * Live (API key): canvas author → snap → emit.
 * Offline / no key: VisualSystem → Layout+Variant → fill → ColorTheme.
 */

export {
  VISUAL_SYSTEM_IDS,
  CANVAS_SYSTEM_IDS,
  isCanvasSystemId,
  isBuiltinCanvasSystemId,
  listCanvasSystemIds,
  type CanvasSystemId,
  type BuiltinCanvasSystemId,
  LAYOUT_IDS,
  LAYOUT_VARIANTS,
  COLOR_THEME_IDS,
  COLOR_THEME_PAIRING,
  DEFAULT_COLOR_THEME,
  SLOT_CAPS,
  PAINT_ROLES,
  isVisualSystemId,
  isLayoutId,
  isColorThemeId,
  isVariantForLayout,
  variantsForLayout,
  themesForSystem,
  assertThemePairing,
  type VisualSystemId,
  type LayoutId,
  type ColorThemeId,
  type AnyVariantId,
  type PaintRole,
} from "./ids.js";

export {
  CANVAS,
  VISUAL_SYSTEMS,
  DECKGEN_FONT_FAMILIES,
  resolveVisualSystem,
  listCanvasSystems,
  listCustomVisualSystems,
  getRegisteredVisualSystem,
  registerCustomVisualSystems,
  fontFamiliesForSystem,
  normalizeSystemId,
  TYPE_VOICES,
  type RegisteredVisualSystem,
  displaySize,
  typeRole,
  type VisualSystem,
  type CanvasPolicy,
  type TypeVoice,
  type TypeScale,
  type TypeRole,
  type TypeRoleStyle,
  type VisualGrid,
  type VisualBans,
  type VisualFonts,
} from "./visual-system.js";

export {
  CustomVisualSystemSchema,
  CustomVisualSystemError,
  extractCustomVisualSystems,
  buildCustomVisualSystem,
  formatCustomVisualSystemBlock,
  type CustomVisualSystemDef,
} from "./custom-system.js";

export { listLayoutCatalog, resolveLayout, imageSlotsAllowed, type LayoutDef, type SlotDef, type SlotKind } from "./layouts.js";

export {
  COLOR_THEME_PALETTES,
  resolveColorTheme,
  defaultColorThemeId,
  paletteOf,
  registerColorThemePalette,
  listColorThemes,
  pairingTable,
  seedColorTheme,
  mergeAuthoredPalette,
  themeFromAuthoredLook,
  parseBrandHex,
  isHexColor,
  type ColorTheme,
  type ColorPalette,
} from "./color-theme.js";

export { buildNarrativeOutline, type NarrativeOutline, type NarrativeBeat, type NarrativeInput } from "./narrative.js";

export { assignPagePlan, enforceSlotCaps, type SlidePlan } from "./page-plan.js";

export { fillSlide, fillPlans } from "./fill.js";
export type { FilledEl, FilledSlide, CanvasKind, CanvasBackground } from "./ir.js";

export { applyColorTheme, type PaintedEl, type PaintedSlide } from "./apply-theme.js";

export { emitPresentation } from "./emit.js";
export {
  buildDeckgenMasters,
  deckgenMasterId,
  deckgenLayoutId,
  ooxmlTypeForLayout,
} from "./masters.js";
export { injectDeckgenFonts, injectDeckgenFontsFromPres, deckgenFontLinks } from "./fonts.js";

export { structureOf, structureEqual, structureDiff } from "./compare.js";

export {
  reflectPainted,
  reflectPresentation,
  assertReflect,
  type ReflectResult,
  type ReflectFinding,
  type ReflectKind,
} from "./reflect.js";

export {
  generateDeck,
  generateDeckPair,
  compileCanvasDeck,
  canvasStats,
  lockColorTheme,
  type CanvasStats,
  type GenerateDeckInput,
  type GenerateDeckResult,
} from "./pipeline.js";
export {
  snapCanvas,
  snapCanvasReport,
  deriveScrim,
  realImageSrc,
  canvasTypeRamp,
  isContentPage,
  isTitleSlot,
  contentTitleSize,
  findContentTitle,
  textUnits,
  MAX_FLOATING_PER_PAGE,
  type SnapDrop,
} from "./snap.js";
export { reflectCanvas, MAX_COPY_BLOCKS, READING_CAP, MIN_DENSE_FIELD_COVERAGE } from "./reflect-canvas.js";
export { jobsFromPages, jobFromOutlineItem, briefsFromJobs, type PageJob, type PageJobItem, type VisualJob } from "./jobs.js";

export type { CanvasRun, CanvasScrim, CanvasDiagram, CanvasDevice, DeviceItem, DeviceKind } from "./ir.js";
export {
  CANVAS_PRESET_IDS,
  CANVAS_ICON_IDS,
  CANVAS_DIAGRAM_LAYOUTS,
  DEVICE_KINDS,
  DEVICE_MENU,
  isCanvasPresetId,
  isCanvasIconId,
  isCanvasDiagramLayout,
  isDeviceKind,
  vocabularyPromptLines,
  type CanvasPresetId,
  type CanvasIconId,
} from "./vocab.js";
export { expandDevice } from "./devices.js";
export { iconPathShape, lucidePathData, scalePathData } from "./icons.js";
export {
  DECK_MODES,
  DECK_MODE_HINTS,
  RELATIONSHIPS,
  RELATIONSHIP_CARRIERS,
  PAGE_RHYTHMS,
  CARRIERS,
  COMPOSITIONS,
  COMPOSITION_HINTS,
  coercePageBrief,
  coerceDeckBrief,
  defaultRhythm,
  defaultComposition,
  breakCompositionRuns,
  inferRelationship,
  type DeckMode,
  type Relationship,
  type PageRhythm,
  type Carrier,
  type Composition,
  type PageBrief,
  type DeckBrief,
} from "./brief.js";
