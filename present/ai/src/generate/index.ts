// 生成模块入口：阶段化流水线 + schema + compile + enrich + qa + template。
// 主路径 generatePresentation / generateFromOutline 走 deckgen 适配器 + polish。

export {
  generateOutline,
  generateFromOutline,
  generatePresentation,
  generateTheme,
  generateMotionScheme,
  generateThemeWithMotion,
  generateLayoutStyle,
  themeContextFromSpec,
  ensureConfig,
  type GenerateOptions,
  type PipelineEvent,
  type PipelineEventDetailKey,
  abortError,
  bindGenerateWallClock,
  classifyGenerateEndError,
  GENERATE_PAUSE_KIND,
  GENERATE_TIMEOUT_KIND,
  GENERATE_WALL_MS,
  generatePauseError,
  generateTimeoutError,
  isAbortError,
  isGeneratePauseError,
  isGenerateTimeoutError,
  shouldCommitGeneratedDeck,
  startGenerateWallClock,
  throwIfAborted,
  withGenerateWallClock,
  formatGenerateProgress,
  formatUsageAmounts,
  hasRealGenerateUsage,
  UsageCounter,
  type GenerateEndKind,
  type GenerateResume,
  type GenerateWallClockOptions,
} from "./pipeline";
export {
  isDeckgenGenerateEnabled,
  resolveDeckgenSystem,
  resolveDeckgenTheme,
  toDeckgenInput,
  assertDeckgenBoundary,
  compileDeckgenPresentation,
  generatePresentationViaDeckgen,
} from "./deckgen-adapter";
export {
  clampOutlineToDeckgenSlots,
  specFromOutlineImagery,
  enrichOutlineContent,
  polishGeneratedDeck,
} from "./polish";
export { convertImageIdeaToEnglish, type ConvertImageIdeaOptions } from "./convert-image-idea";
export {
  DeckgenUserError,
  formatDeckgenUserError,
  sanitizeDeckgenErrorCopy,
  looksLikeStackDump,
  colorThemeOptions,
  isThemeAllowedForSystem,
  layoutVariantOptions,
  isWhitelistedLayoutVariant,
  defaultVariantFor,
  defaultOutlinePageLock,
  applyOutlinePageLock,
  readOutlinePageLock,
  pagesFromOutline,
  formatResultBadge,
  badgeFromSlideTags,
  pickBadgeForeground,
  contrastRatio,
  DECKGEN_CAPTION_PX,
  type DeckgenErrorKind,
  type ThemeOption,
  type LayoutVariantOption,
  type PageLock,
  type ResultBadgeMeta,
} from "./deckgen-ui";

export {
  LayoutStyleSpecSchema,
  clampLayoutStyle,
  layoutStyleSystemPrompt,
  layoutStyleUserPrompt,
  LAYOUT_STYLE_ARCHETYPES,
  type LayoutStyleSpec,
  type LayoutStyleGuidance,
} from "./layout-style";

export {
  OutlineSchema,
  SlideSpecSchema,
  PresentationSpecSchema,
  BUILTIN_THEME_IDS,
  OUTLINE_THEME_IDS,
  OUTLINE_LAYOUT_HINTS,
  STYLE_FAMILY_IDS,
  STYLE_FAMILY_STYLE_HINTS,
  STYLE_FAMILY_LAYOUT_POLICY,
  STYLE_FAMILY_IMAGERY,
  bannedLayoutsForFamily,
  imageryForFamily,
  clampOutlineToStyleFamily,
  diversifyOutlineLayouts,
  inferStyleFamilyFromGuidance,
} from "./schema";
export type {
  GuidanceInput,
  Outline,
  OutlineItem,
  SlideSpecZ,
  PresentationSpec,
  BuiltinThemeId,
  OutlineThemeId,
  OutlineLayoutHint,
  StyleFamilyId,
  StyleFamilyLayoutPolicy,
  StyleFamilyImagery,
} from "./schema";

export { renderLayout, LAYOUT_KINDS, type SlideSpec, type LayoutKind } from "./compile/layouts";
export { compilePresentation, outlineToFallbackSpec, type CompileOptions } from "./compile/compile";
export {
  applyCompileConstraints,
  GENERATE_BRIEF_CONSTRAINTS,
  type GenerateBriefConstraints,
} from "./compile/constraints";
export {
  runGatePassRateHarness,
  formatPassRateMarkdown,
  printGatePassRateReport,
  darkLaunchWizardOutline,
  DARK_LAUNCH_WIZARD_GUIDANCE,
  GATE_PASS_RATE_SEEDS,
  GATE_PASS_RATE_TARGET,
} from "./compile/constraints-harness";
export {
  LIVE_GATE_SKIP_REASON,
  LIVE_GATE_AUTH_FAIL_REASON,
  LIVE_GATE_NO_LLM_REASON,
  resolveLiveGateConfig,
  runLiveGatePassRateHarness,
  formatLivePassRateMarkdown,
  evaluateLiveGatePassRate,
  formatWallClock,
  parseLiveGateSeeds,
  extractGateResult,
  isLiveGateAuthOrProviderError,
  liveSeedEvidencedPass,
  liveGenerateContentGate,
  type LiveGatePassRateResult,
  type LiveGatePassRateRun,
  type LiveGateVerdict,
} from "./qa/live-gate-pass-rate";
export { tallyGateFindings, GATE_KINDS } from "./qa/gates";
export { reportGateResult, formatGatePassMarkdown, type GatePassReport } from "./qa/gates-report";
export { buildBadDeckFixture } from "./qa/fixtures";

export {
  PIPELINE_P2_STAGES,
  PIPELINE_P2_WHOLE_JOB_STAGES,
  isPipelineP2WholeJobStage,
  isPipelineP2MotionSoftEnd,
  mapDetailKeyToPipelineP2Stage,
  pipelineP2StepIndex,
  resumeSkipFlags,
  resumeStageFromProgress,
  PipelineP2StageError,
  throwIfPipelineP2Inject,
  type PipelineP2Stage,
  type PipelineP2Inject,
} from "./qa/pipeline-p2-policy";
export {
  runDesignGates,
  DESIGN_LAYOUT_CATALOG,
  DESIGN_GATE_KINDS,
  tallyDesignGateFindings,
  type DesignGateResult,
  type DesignGateFinding,
  type DesignGateKind,
} from "./qa/design-gates";
export {
  VISUAL_SYSTEM_IDS,
  VISUAL_SYSTEMS,
  resolveVisualSystem,
  visualSystemPalette,
  type VisualSystemId,
  type VisualSystemPalette,
} from "./visual-system";
export {
  GENERATE_MODEL_CALL_BUDGET,
  ModelCallBudget,
  plannedGenerateModelCalls,
  type PlannedGenerateCallsInput,
} from "./call-budget";

export {
  outlineSystemPrompt,
  outlineUserPrompt,
  slideSystemPrompt,
  slideUserPrompt,
  slotFillSystemPrompt,
  slotFillUserPrompt,
  themeSystemPrompt,
  themeUserPrompt,
  motionSystemPrompt,
  motionUserPrompt,
  guidanceStyleHint,
  guidanceHardConstraints,
  resolveGuidanceLanguage,
  type ThemeGuidance,
  type MotionGuidance,
  type ThemeContextForMotion,
} from "./prompts";

export {
  DesignSpecSchema,
  buildDesignSpecSchema,
  designSpecSystemPrompt,
  designSpecUserPrompt,
  clampDesignSpec,
  renderDesignBrief,
  type DesignSpec,
} from "./design-spec";

export {
  enrichImagesInPresentation,
  type EnrichImagesOptions,
  type EnrichImagesResult,
} from "./enrich/images";
export {
  DEFAULT_IMAGE_ENRICHMENT_PRIORITY,
  imageEnrichmentAvailable,
  imageEnrichmentSources,
  resolveImageGenConcurrency,
  type ImageEnrichmentPriority,
} from "./enrich/fetch-enrichment-image";
export {
  fillImagePlaceholdersViaCommands,
  collectInlinePlaceholderTasksFromPres,
  findInlineImagePlaceholder,
  type FillPlaceholdersResult,
} from "./enrich/placeholders";
export { applyNoImageryAtmosphere } from "./enrich/atmosphere-fallback";

export {
  validateAndRepairPresentation,
  type QaReport,
  type QaFix,
  type QaFixKind,
  type ValidateOptions,
} from "./qa/validate";
export { ensureSlideSpecQuality, defaultImageQuery } from "./qa/ensure-spec-quality";
export {
  reviewPresentation,
  resolveReviewLanguage,
  applyArtDirectorEdits,
  ArtDirectorReportSchema,
  type ArtDirectorReport,
  type ArtDirectorFinding,
  type ArtDirectorEdit,
  type ReviewOptions,
  type ReviewResult,
} from "./qa/art-director";

export {
  generateTemplate,
  generatePresentationFromTemplate,
  templateFromThemeDef,
  type GenerateTemplateOptions,
  type GeneratedTemplate,
} from "./template/generate-template";
export { snapshotThemeShapes } from "./template/snapshot";
export {
  induceSlotsFromSlide,
  induceSlideSchema,
  induceReferenceSchemas,
  induceSlotsFromPresentation,
  fillSlotsOnSlide,
  fillSlotsByShapeId,
  mapOutlineToReference,
  assembleReferencePresentation,
  cloneReferenceSlideWithIdMap,
  formatSlotsForPrompt,
  type ContentSlot,
  type SlotFill,
  type ShapeSlotFill,
  type InducedSlideSlots,
  type InducedSlideSchema,
  type SlideFunctionalType,
  type OutlineReferenceMapping,
} from "./template/slots";
