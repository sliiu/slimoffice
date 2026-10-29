export { mountEditor } from "./editor";
export { readAsArrayBuffer, readAsDataURL, showFileProgress, setFileProgress, hideFileProgress } from "./file-progress";
export { combinedReadRatio, mediaKindOf, progressLabel } from "./file-kind";
export type {
  EditorOptions,
  EditorHandle,
  InsertShapeKind,
  PlaybackPluginOption,
  SaveFormat,
  ExtraContextMenuInfo,
} from "./editor";
export type { DevDumpAction, DevDumpSection } from "./dev-panel";
export {
  defineEditorPlugin,
  withEditorPluginErrorBoundary,
  slideStatsEditorPlugin,
  speakerNotesEditorPlugin,
  createMockEditorPluginContext,
  BUILTIN_EDITOR_PLUGIN_CATALOG,
  mergeEditorPluginCatalog,
} from "./editor-plugins";
export type {
  EditorPlugin,
  EditorPluginAPI,
  EditorPluginContext,
  EditorPluginUIHost,
  EditorPluginCatalogEntry,
  EditorEventBus,
  EditorCommandEvent,
  EditorSelectionEvent,
  EditorSlideChangeEvent,
  MockEditorCallLog,
} from "./editor-plugins";
export { openEditorPluginMarketPopover } from "./editor-plugin-market";
export type { EditorPluginMarketEntry, EditorPluginMarketPopoverOptions } from "./editor-plugin-market";
export type { ContextMenuItem } from "./context-menu";
export { showContextMenu } from "./context-menu";
export {
  SHAPE_LIBRARY,
  SHAPE_BY_ID,
  CATEGORY_ORDER,
  entriesByCategory,
} from "./shape-library";
export type { ShapeCategory, ShapeGeom, ShapeLibraryEntry } from "./shape-library";
export { Selection } from "./selection";
export {
  MoveShapeCmd,
  ResizeShapeCmd,
  SetLineEndpointsCmd,
  SetPathConnectorEndsCmd,
  SetPolygonPointsCmd,
  SetPresetAdjCmd,
  DeleteShapeCmd,
  EditTextCmd,
  SetFillCmd,
  SetStrokeCmd,
  SetTextStyleCmd,
  SetTextAlignCmd,
  SetParagraphBulletCmd,
  SetParagraphRtlCmd,
  SetParagraphCjkCmd,
  SetSlideSizeCmd,
  SetSlideBackgroundCmd,
  SetSlideShowCmd,
  SetSlideHfCmd,
  AddShapeCmd,
  DuplicateShapeCmd,
  ReorderShapeCmd,
  SetShapeBboxCmd,
  SetShapeRotationCmd,
  SetShapeOpacityCmd,
  FlipShapeCmd,
  SetShapeLockedCmd,
  SetShapeVisibleCmd,
  SetMediaPropsCmd,
  UpdateMediaSrcCmd,
  GroupShapesCmd,
  UngroupShapesCmd,
  AlignShapesCmd,
  DistributeShapesCmd,
  InsertTableRowCmd,
  InsertTableColumnCmd,
  RemoveTableRowCmd,
  RemoveTableColumnCmd,
  MergeTableCellsCmd,
  UnmergeTableCellsCmd,
  SetTableCellStyleCmd,
  SetSlideTransitionCmd,
  ClearTextFormattingCmd,
  ChangeTextCaseCmd,
  SetParagraphSpacingCmd,
  SetRichTextCmd,
  SetParagraphsCmd,
  SetTextBodyCmd,
  SetShapeEffectsCmd,
  SetShape3DCmd,
  SetImageCropCmd,
  SetCropFrameCmd,
  ReplaceImageSrcCmd,
  SetChartDefCmd,
  captureFormatSnapshot,
  ApplyFormatCmd,
} from "./commands";
export type {
  TextStylePatch,
  MediaPropsPatch,
  MediaTrimPatch,
  AlignMode,
  ParagraphSpacingPatch,
  RichRun,
  RichParagraph,
  TextBodyPatch,
  ShapeEffectsPatch,
  Shape3DPatch,
  FormatSnapshot,
  TextCaseMode,
  TableCellStylePatch,
} from "./commands";
export {
  slideTarget,
  masterTarget,
  layoutTarget,
  resolveTarget,
  shapeAtAnyLayer,
  isWordArtStackedVert,
  textRowOrderPatch,
  textRowOrderRtl,
} from "./commands";
export type { EditTarget, TargetContainer } from "./commands";
export {
  SetSlideLayoutRefCmd,
  AddLayoutCmd,
  DeleteLayoutCmd,
  RenameLayoutCmd,
  DuplicateMasterCmd,
  SetPlaceholderTypeCmd,
  SetMasterTxStylesCmd,
} from "./master-commands";
export type { TxStyleScope, LevelStylePatch } from "./master-commands";
export {
  createShapeFromPreset,
  officialPresetId,
  createTextBox,
  createLine,
  createTable,
  createChart,
  genShapeId,
} from "./shape-factory";
export type {
  BaseOpts,
  CreateShapeOptions,
  CreateTextBoxOptions,
  CreateLineOptions,
  CreateTableOptions,
  CreateChartOptions,
} from "./shape-factory";
export * from "./animation";
export { setLocale, getLocale, registerMessages, t } from "./i18n";
export type { Locale, MessageKey } from "./i18n";
export {
  DEFAULT_LUCIDE_ICON,
  normalizeLucideIconName,
  lucideSvg,
  fillLucideIcon,
  svgIcon,
  appendLucideIcon,
  appendLabelWithIcon,
  mkLucideIconButton,
  mkLucideButton,
  setButtonLucideIcon,
} from "./icons";
export type { IconName } from "./icons";
export { WORDART_PRESETS, defaultWordArtState } from "./dialog";
export type { WordArtState, WordArtShadowKind, WordArtPreset, WordArtGradient } from "./dialog";
export { openFormatBackgroundDialog } from "./format-background-dialog";
export { openCustomShowDialog } from "./custom-show-dialog";
export { openIconPickerDialog, encodeIconDescr, decodeIconDescr } from "./icon-picker-dialog";
export { openStockImagePickerDialog } from "./stock-image-picker-dialog";
export { openMediaLibraryDialog } from "./media-library-dialog";
export { searchStockImages, type StockImageHit } from "./stock-image-search";
export { captureScreenshot, isScreenshotSupported } from "./screenshot-capture";
export { openEquationDialog, encodeEquationDescr, decodeEquationDescr, renderEquationToDataUrl, rasterizeEquationShapesInPlace } from "./equation-dialog";
export { lucideIconToDataUrl, lucideIconToPngDataUrl, listLucideIconIds } from "./lucide-export";
export { recomputeSlidesForMasterEdit } from "./master-refresh";
export {
  AddCommentCmd,
  EditCommentCmd,
  ResolveCommentCmd,
  ResolveSlideCommentsCmd,
  DeleteCommentCmd,
  SetCommentAnchorCmd,
  genCommentId,
  commentSubtreeIds,
} from "./comment-commands";
export { mountCommentsPanel } from "./comments-panel";
export type { CommentsPanelHandle, CommentAssignUi } from "./comments-panel";
export type { AiInlineUi } from "./ai-inline-box";
export {
  buildCommentThreadForest,
  countThreadReplies,
  collectThreadComments,
  authorInitials,
} from "./comment-threads";
export {
  auditPresentationAccessibility,
  contrastIssuesFromReport,
  missingAltIssuesFromReport,
  suggestedImageAltText,
  summarizeAccessibilityByKind,
} from "./accessibility-audit";
export type { AccessibilityIssue, AccessibilityIssueKind, AccessibilityReport } from "./accessibility-audit";
export { openAccessibilityDialog } from "./accessibility-dialog";
export {
  accessibilityIssueKindCount,
  accessibilityReadinessPercent,
  compareChangeCount,
  compareChangePercent,
  averageCompareChangeWeight,
  averageAccessibilityIssuesPerAffectedSlide,
  compareSlideIndicesWithStructureChanges,
  countCompareSlidesClean,
  countCompareSlidesWithChanges,
  countSlidesWithAccessibilityIssues,
  countSlidesWithoutAccessibilityIssues,
  exportA11ySlideCoverageText,
  exportAccessibilityReadinessText,
  exportCompareReadinessText,
  exportCompareSlideCoverageText,
  exportCompareStructureIndicesText,
  exportDeckReviewReadinessText,
  exportProtectionReadinessText,
  exportAccessibilityCompactText,
  exportAccessibilityKindBreakdownText,
  exportAccessibilityReportText,
  exportCompareAcceptIndicesText,
  exportCompareCompactText,
  exportCompareReportText,
  exportDeckReviewCompactText,
  exportDeckReviewSummaryText,
  exportProtectionCompactText,
  exportProtectionStatusText,
  exportSmartLookupCompactText,
  exportSmartLookupText,
  exportThesaurusCompactText,
  exportThesaurusText,
  exportTranslatePairCompactText,
  exportTranslatePairText,
  filterAccessibilityIssues,
  filterCompareEntries,
  formatA11ySlideCoverageBreakdownLine,
  formatAccessibilityIssueLine,
  formatAccessibilityKindBreakdown,
  formatAccessibilityReadinessLine,
  formatAccessibilityScoreLine,
  formatCompareEntryLine,
  compareSlideIndicesToAccept,
  formatCompareChangeBreakdownLine,
  formatCompareSlideCoverageBreakdownLine,
  formatDeckReviewReadinessLine,
  formatProtectionReadinessLine,
  formatCompareReadinessLine,
  formatCompareStatsLine,
  formatDeckReviewStatsLine,
  groupAccessibilityIssuesBySlide,
  slideWithFirstAccessibilityIssue,
  slideWithFirstCompareChange,
  slideWithFewestAccessibilityIssues,
  slideWithFewestCompareChanges,
  slideWithMostAccessibilityIssues,
  slideWithMostCompareChanges,
  slideWithMostIssuesOfKind,
  slideWithMostStructureCompareChanges,
  slidesWithAccessibilityIssues,
  slidesWithoutAccessibilityIssues,
  slidesWithMostAccessibilityIssues,
} from "./review-export";
export type { CompareReportFilter } from "./review-export";
export {
  averageVbaProceduresPerModule,
  countVbaProceduresInProject,
  countVbaModulesWithProcedures,
  countVbaModulesWithoutProcedures,
  exportAuxSessionCompactText,
  exportAuxSessionCoverageText,
  exportAuxSessionSummaryText,
  exportLayoutReadinessText,
  exportVbaEmptyModulesText,
  exportVbaModuleCoverageText,
  exportVbaModuleInventoryCompactText,
  exportVbaModuleInventoryText,
  exportVbaProcedureIndexCompactText,
  exportVbaProcedureIndexFilteredText,
  exportVbaProcedureIndexText,
  exportVbaProjectCompactText,
  exportVbaProjectSummaryText,
  exportVbaReadinessText,
  exportViewReadinessText,
  exportViewWorkspaceCompactText,
  exportViewWorkspaceStatsText,
  exportViewWorkspaceSummaryText,
  filterVbaModulesByKind,
  formatAuxSessionCompactLine,
  formatAuxSessionCoverageBreakdownLine,
  formatAuxWindowCountLine,
  formatLayoutReadinessLine,
  formatVbaModuleCoverageBreakdownLine,
  formatVbaModuleKindsLine,
  formatVbaProcedureSpreadLine,
  formatVbaProjectStatsLine,
  formatVbaReadinessLine,
  formatViewReadinessLine,
  formatViewWorkspaceStatsLine,
  summarizeVbaModuleKinds,
  vbaModuleWithFewestProcedures,
  vbaModuleWithMostProcedures,
  vbaModulesWithoutProcedures,
} from "./view-export";
export type { AuxSessionSummary } from "./view-export";
export { computePipDrawRect, formatPipDrawRectLine, PIP_WIDTH_FRACTION } from "./record-composite";
export type { PipDrawRect } from "./record-composite";
export {
  mountRecordShowOverlay,
  clampOverlayPosition,
  defaultPipOverlayPosition,
  loadPipPreferences,
  resetPipPreferences,
  savePipPreferences,
  DEFAULT_PIP_PREFERENCES,
  PIP_WIDTH_PX,
  PIP_CORNER_CYCLE,
  cyclePipCorner,
  cyclePipSize,
} from "./record-show-overlay";
export type { PipCorner, PipPreferences, PipSizePreset, RecordShowOverlayHandle, RecordShowOverlayOptions } from "./record-show-overlay";
export {
  averagePipCoverageAcrossCorners,
  averagePipCoverageAcrossSizes,
  averageRehearseSecondsPerSlide,
  exportNarrationReadinessText,
  exportNarrationRehearseBreakdownText,
  exportNarrationSessionCompactText,
  exportNarrationSessionText,
  exportPipCornerCoverageBreakdownText,
  exportPipCoverageSpreadText,
  exportPipPreferencesCompactText,
  exportPipPreferencesText,
  exportPipReadinessText,
  exportPipSizeCoverageBreakdownText,
  exportRecordModeReadinessText,
  exportRecordingCompactText,
  exportRecordReadinessText,
  exportRecordSettingsCompactText,
  exportRecordSettingsText,
  exportRecordingSummaryText,
  exportRecordWorkspaceCompactText,
  exportRecordWorkspaceSummaryText,
  formatNarrationReadinessLine,
  formatNarrationRehearseBreakdownLine,
  formatPipCompositeLayoutLine,
  formatPipCornerCoverageBreakdownLine,
  formatPipCoverageLine,
  formatPipCoverageSpreadLine,
  formatPipLargestCornerLine,
  formatPipPreferencesCompactLine,
  formatPipReadinessLine,
  formatPipSizeCoverageBreakdownLine,
  formatPipSmallestSizeLine,
  formatRecordModePipLine,
  formatRecordReadinessLine,
  formatRecordWorkspaceStatsLine,
  formatRecordingStatsLine,
  isLargeRecording,
  pipCanvasCoveragePercent,
  pipCornerWithLargestCoverage,
  pipCornerWithSmallestCoverage,
  pipCoveragePercentForCorner,
  pipCoveragePercentForSize,
  pipCoverageSpreadPercent,
  pipCornerLabel,
  pipSizeLabel,
  pipSizeWithLargestCoverage,
  pipSizeWithSmallestCoverage,
  PIP_CORNER_PRESETS,
  PIP_RECORD_MODES,
  PIP_SIZE_PRESETS,
  RECORD_MODES,
  recordModeLabel,
  recordModeSupportsPip,
  recordModesWithoutPip,
  recordingBitrateKbps,
  shouldConfirmLargeRecording,
  summarizePipPreferences,
  summarizeRecording,
} from "./record-meta";
export { SetProofingLanguageCmd } from "./proofing-language-cmd";
export { getProofingLanguage, PROOFING_LANGUAGES } from "./proofing-language";
export { auditPresentationDesign } from "./design-audit";
export type { DesignSuggestion, DesignAuditReport, DesignSuggestionCategory, DesignSuggestionSeverity } from "./design-audit";
export { openDesignerDialog } from "./designer-dialog";
export type { DesignerAiResult, DesignerAiFinding, DesignerDialogOptions } from "./designer-dialog";
export { mountInkOverlay } from "./ink-overlay";
export type { InkOverlayHandle, InkOverlayOptions } from "./ink-overlay";
export { buildInkPathShape, hitInkShapeAt, isInkShapeId } from "./ink-tool";
export type { InkMode, InkPoint } from "./ink-tool";
export {
  downloadBlob,
  ensureExportRecordingBlob,
  ensureMp4AudioBlob,
  ensureMp4VideoBlob,
  extensionForRecordingMime,
  formatRecordingDuration,
  formatRecordingFileSize,
  isAudioRecordingBlob,
  isMp4RecordingMime,
  RECORDING_LARGE_BYTES,
  suggestedRecordingFilename,
} from "./video-export";
export {
  averageInsertPayloadBytesPerShape,
  collectUnsizedInsertShapesInDeck,
  countSlidesWithInsertShapes,
  countSlidesWithoutInsertShapes,
  collectInsertShapesInDeck,
  collectInsertShapesOnSlide,
  collectLargeInsertShapesInDeck,
  collectLargeInsertShapesOnSlide,
  countLargeInsertShapesInDeck,
  copyTextToClipboard,
  duplicateSmartArtItemAt,
  exportDeckInsertCompactText,
  exportDeckInsertByKindCompactText,
  exportDeckInsertByKindText,
  exportDeckInsertInventoryText,
  exportInsertLargestShapeText,
  exportInsertReadinessText,
  exportInsertShapeCompactText,
  exportInsertShapeSummary,
  exportInsertSlideCoverageText,
  exportInsertUnsizedShapesText,
  exportLargeInsertCompactText,
  exportLargeInsertReportText,
  exportSlideInsertCompactText,
  exportSlideInsertInventoryText,
  filterInsertRefsByKind,
  filterSmartArtLayouts,
  findInsertShapeInDeck,
  formatInsertDeckStatsLine,
  formatInsertKindBreakdownLine,
  formatInsertInventoryStatsLine,
  formatInsertLargestShapeLine,
  formatInsertReadinessLine,
  formatInsertSlideCoverageBreakdownLine,
  formatMediaTrimSummary,
  insertPayloadCoveragePercent,
  insertShapeByteSize,
  insertShapeWithLargestPayload,
  isLargeInsertShape,
  isLargeMediaBytes,
  largeInsertPayloadBytes,
  mediaMimeLabel,
  MEDIA_LARGE_BYTES,
  parseDataUrlMime,
  shouldConfirmLargeInsertBytes,
  slideWithFewestInsertShapes,
  slideWithFirstWithoutInsertShapes,
  slideWithLargestInsertPayload,
  slideWithMostInsertShapes,
  slideWithMostLargeInsertShapes,
  slidesWithoutInsertShapes,
  smartArtPictureCount,
  summarizeInsertKinds,
  summarizeMediaShape,
  summarizeModel3DShape,
  summarizeOleShape,
  summarizeSmartArtGroup,
  totalInsertPayloadBytes,
} from "./insert-meta";
export type { InsertShapeDeckRef, InsertShapeDeckSizeRef, InsertShapeRef, InsertShapeSizeRef } from "./insert-meta";
export {
  openRecordDialog,
  isRecordSupported,
  loadRecordMode,
  saveRecordMode,
  pickRecordMime,
} from "./record-dialog";
export type { RecordMode, RecordResult } from "./record-dialog";
export { openLectureDeviceDialog, openLectureSaveNotice } from "./lecture-devices";
export type { LectureDeviceChoice } from "./lecture-devices";
export { openSetupSlideShowDialog } from "./setup-slideshow-dialog";
export type { SlideshowSetupState } from "./setup-slideshow-dialog";
export { openNarrationCompleteDialog } from "./narration-complete-dialog";
export { openPasteSpecialDialog } from "./paste-special-dialog";
export type { PasteSpecialMode } from "./paste-special-dialog";
export { openLayoutPickerDialog } from "./layout-picker-dialog";
export { openSectionDialog } from "./section-dialog";
export { mountSelectionPane } from "./selection-pane";
export type { SelectionPaneHandle } from "./selection-pane";
export { ApplySlideLayoutCmd, ResetSlideToLayoutCmd } from "./slide-layout-commands";
export {
  DeleteSlideCmd,
  DeleteSlidesCmd,
  DuplicateSlideCmd,
  InsertSlideCmd,
  MoveSlideCmd,
  computeSlideMoveTarget,
  remapIndexAfterSlideMove,
  remapSlideIndexSetAfterMove,
  newSlideId,
  reindexPresentationSlides,
} from "./slide-commands";
export { listLayoutsForSlide } from "./slide-layout-utils";
export type { LayoutListEntry } from "./slide-layout-utils";
export { SetDeckSectionsCmd, addSectionAt, renameSection, removeSection } from "./section-commands";
export { SetViewGuidesCmd, SetShowPropertiesCmd } from "./view-show-commands";

export { QUICK_STYLE_PRESETS } from "./quick-styles";
export type { QuickStylePreset } from "./quick-styles";
export { ConvertInkToShapeCmd, ConvertInkToTextCmd } from "./ink-commands";
export {
  recognizeInkPaths,
  recognizeInkCanvas,
  rasterizeInkPaths,
  isInkOcrSupported,
  unionInkBbox,
  parseSimplePathD,
  inkPathIsLocalToBbox,
  tesseractLangFromProofing,
  sortInkPathsByReadingOrder,
  normalizeOcrCrop,
  inferOcrPsm,
  inkOcrConfidenceLevel,
  disposeInkOcrWorker,
  OCR_PSM,
} from "./ink-ocr";
export { paddleLangFromProofing, paddleOcrReady, recognizeInkPaddle, disposePaddleOcr, preloadPaddleOcr, hasPaddleModelConsent, PADDLE_MODEL_APPROX_BYTES } from "./ink-ocr-paddle";
export type { PaddleLoadProgress } from "./ink-ocr-paddle";
export type { InkOcrResult, InkOcrEngine, InkOcrScope } from "./ink-ocr";
export { openInkOcrDialog, openInkOcrModelDialog } from "./ink-ocr-dialog";
export type { InkOcrDialogResult, InkOcrDialogOptions, InkOcrModelDialogHandlers } from "./ink-ocr-dialog";
export { SetPresentationProtectionCmd } from "./protection-cmd";
export { ApplyPhotoAlbumCmd } from "./photo-album-cmd";
export { EmbedFontsCmd } from "./embed-fonts-cmd";
export { openEmbedFontsDialog } from "./embed-fonts-dialog";
export { setGoogleFontProxyBase } from "./font-embed-fetch";
export { openVbaInfoDialog } from "./vba-info-dialog";
export { InsertModel3DCmd, buildModel3DShape, model3DPresetById } from "./model3d-cmd";
export { InsertOleCmd, buildOleShape, downloadOleEmbed, formatByteSize, oleEmbedByteSize } from "./ole-cmd";
export type { BuildOleShapeInput } from "./ole-cmd";
export { openOleInsertDialog } from "./ole-insert-dialog";
export type { OleInsertResult } from "./ole-insert-dialog";
export {
  fetchGlbAsDataUrl,
  loadModel3DFromFile,
  loadModel3DFromUrl,
  loadModel3DPresetAsDataUrl,
  model3DPresetAssetUrl,
  readModel3DFileAsDataUrl,
  detectModel3DMime,
  normalizeModel3DDataUrl,
  model3DDataUrlFromBytes,
  MODEL3D_CUSTOM_PRESET_ID,
} from "./model3d-load";
export { openModel3DPickerDialog } from "./model3d-picker-dialog";
export type { Model3DPickerOptions, Model3DPickerResult } from "./model3d-picker-dialog";
export { buildPhotoAlbumSlides, imagesPerSlide, gridForLayout } from "./photo-album-layout";
export type { PhotoAlbumImageInput, PhotoAlbumLayoutId } from "./photo-album-layout";
export { openPhotoAlbumDialog } from "./photo-album-dialog";
export type { PhotoAlbumDialogResult } from "./photo-album-dialog";
export { openSmartLookupDialog, fetchSmartLookup } from "./smart-lookup-dialog";
export type { SmartLookupResult, LookupMeaning } from "./smart-lookup-dialog";
export { openHelpDialog, openExternalHelpLink } from "./help-dialog";
export type { HelpLinks } from "./help-dialog";
export {
  ApplyCustomThemeCmd,
  ApplyThemeCmd,
  THEMES,
  THEME_IDS,
  getTheme,
  injectThemeFonts,
  type ApplyCustomThemeOpts,
  type ApplyThemeOpts,
  type ThemeDef,
} from "@ppt/themes";
export { openBookmarkDialog } from "./bookmark-dialog";
export { ApplyThemeVariantCmd } from "./theme-variant-cmd";
export { THEME_VARIANT_OPTIONS } from "./theme-variants";
export type { ThemeVariantId, ThemeVariantOption } from "./theme-variants";
export { openSmartArtDialog } from "./smartart-dialog";
export {
  AddSmartArtItemCmd,
  RemoveSmartArtItemCmd,
  SetSmartArtLayoutCmd,
  RebuildSmartArtCmd,
  UpdateSmartArtItemsCmd,
  MoveSmartArtItemCmd,
  SetSmartArtItemLevelCmd,
  ConvertToSmartArtCmd,
  ClearSmartArtPicturesCmd,
  DuplicateSmartArtItemCmd,
} from "./smartart-commands";
export {
  createSmartArtGroup,
  defaultSmartArtItems,
  itemsFromTextShape,
  inferSmartArtLayout,
  convertTextShapeToSmartArt,
} from "./smartart-factory";
export {
  VIRTUAL_LIST_THRESHOLD,
  createVirtualList,
  createVirtualGrid,
  gridColumnCount,
} from "./virtual-list";
export type { VirtualListHandle, VirtualGridHandle } from "./virtual-list";
export {
  serializeCollabCommand,
  deserializeCollabCommand,
} from "./collab-command-codec";
export type { CollabCommandWire } from "./collab-command-codec";
