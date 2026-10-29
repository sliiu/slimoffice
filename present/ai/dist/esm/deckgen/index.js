/**
 * SlimPPT deckgen — compile an editable Presentation.
 *
 * Live (API key): canvas author → snap → emit.
 * Offline / no key: VisualSystem → Layout+Variant → fill → ColorTheme.
 */
export { VISUAL_SYSTEM_IDS, CANVAS_SYSTEM_IDS, isCanvasSystemId, isBuiltinCanvasSystemId, listCanvasSystemIds, LAYOUT_IDS, LAYOUT_VARIANTS, COLOR_THEME_IDS, COLOR_THEME_PAIRING, DEFAULT_COLOR_THEME, SLOT_CAPS, PAINT_ROLES, isVisualSystemId, isLayoutId, isColorThemeId, isVariantForLayout, variantsForLayout, themesForSystem, assertThemePairing, } from "./ids.js";
export { CANVAS, VISUAL_SYSTEMS, DECKGEN_FONT_FAMILIES, resolveVisualSystem, listCanvasSystems, listCustomVisualSystems, getRegisteredVisualSystem, registerCustomVisualSystems, fontFamiliesForSystem, normalizeSystemId, TYPE_VOICES, displaySize, typeRole, } from "./visual-system.js";
export { CustomVisualSystemSchema, CustomVisualSystemError, extractCustomVisualSystems, buildCustomVisualSystem, formatCustomVisualSystemBlock, } from "./custom-system.js";
export { listLayoutCatalog, resolveLayout, imageSlotsAllowed } from "./layouts.js";
export { COLOR_THEME_PALETTES, resolveColorTheme, defaultColorThemeId, paletteOf, registerColorThemePalette, listColorThemes, pairingTable, seedColorTheme, mergeAuthoredPalette, themeFromAuthoredLook, parseBrandHex, isHexColor, } from "./color-theme.js";
export { buildNarrativeOutline } from "./narrative.js";
export { assignPagePlan, enforceSlotCaps } from "./page-plan.js";
export { fillSlide, fillPlans } from "./fill.js";
export { applyColorTheme } from "./apply-theme.js";
export { emitPresentation } from "./emit.js";
export { buildDeckgenMasters, deckgenMasterId, deckgenLayoutId, ooxmlTypeForLayout, } from "./masters.js";
export { injectDeckgenFonts, injectDeckgenFontsFromPres, deckgenFontLinks } from "./fonts.js";
export { structureOf, structureEqual, structureDiff } from "./compare.js";
export { reflectPainted, reflectPresentation, assertReflect, } from "./reflect.js";
export { generateDeck, generateDeckPair, compileCanvasDeck, canvasStats, lockColorTheme, } from "./pipeline.js";
export { snapCanvas, snapCanvasReport, deriveScrim, realImageSrc, canvasTypeRamp, isContentPage, isTitleSlot, contentTitleSize, findContentTitle, textUnits, MAX_FLOATING_PER_PAGE, } from "./snap.js";
export { reflectCanvas, MAX_COPY_BLOCKS, READING_CAP, MIN_DENSE_FIELD_COVERAGE } from "./reflect-canvas.js";
export { jobsFromPages, jobFromOutlineItem, briefsFromJobs } from "./jobs.js";
export { CANVAS_PRESET_IDS, CANVAS_ICON_IDS, CANVAS_DIAGRAM_LAYOUTS, DEVICE_KINDS, DEVICE_MENU, isCanvasPresetId, isCanvasIconId, isCanvasDiagramLayout, isDeviceKind, vocabularyPromptLines, } from "./vocab.js";
export { expandDevice } from "./devices.js";
export { iconPathShape, lucidePathData, scalePathData } from "./icons.js";
export { DECK_MODES, DECK_MODE_HINTS, RELATIONSHIPS, RELATIONSHIP_CARRIERS, PAGE_RHYTHMS, CARRIERS, COMPOSITIONS, COMPOSITION_HINTS, coercePageBrief, coerceDeckBrief, defaultRhythm, defaultComposition, breakCompositionRuns, inferRelationship, } from "./brief.js";
