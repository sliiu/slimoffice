export type {
  EditorPlugin,
  EditorPluginAPI,
  EditorPluginCleanup,
  EditorPluginContext,
  EditorPluginUIHandle,
  EditorPluginUIHost,
  EditorCommandEvent,
  EditorEventBus,
  EditorEventMap,
  EditorEventType,
  EditorEventUnsubscribe,
  EditorPanelOptions,
  EditorRibbonButtonOptions,
  EditorSelectionEvent,
  EditorSlideChangeEvent,
} from "./types";
export { defineEditorPlugin, withEditorPluginErrorBoundary } from "./define";
export { createEditorPluginRuntime, type EditorPluginRuntime, type EditorPluginRuntimeDeps } from "./manager";
export { slideStatsEditorPlugin } from "./builtin/slide-stats";
export { speakerNotesEditorPlugin } from "./builtin/speaker-notes";
export {
  BUILTIN_EDITOR_PLUGIN_CATALOG,
  mergeEditorPluginCatalog,
  type EditorPluginCatalogEntry,
} from "./catalog";
export { createMockEditorPluginContext, type MockEditorCallLog, type MockEditorPluginContextOptions } from "./testing";
