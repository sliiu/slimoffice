export type { EditorPlugin, EditorPluginAPI, EditorPluginCleanup, EditorPluginContext, EditorPluginUIHandle, EditorPluginUIHost, EditorCommandEvent, EditorEventBus, EditorEventMap, EditorEventType, EditorEventUnsubscribe, EditorPanelOptions, EditorRibbonButtonOptions, EditorSelectionEvent, EditorSlideChangeEvent, } from "./types.js";
export { defineEditorPlugin, withEditorPluginErrorBoundary } from "./define.js";
export { createEditorPluginRuntime, type EditorPluginRuntime, type EditorPluginRuntimeDeps } from "./manager.js";
export { slideStatsEditorPlugin } from "./builtin/slide-stats.js";
export { speakerNotesEditorPlugin } from "./builtin/speaker-notes.js";
export { BUILTIN_EDITOR_PLUGIN_CATALOG, mergeEditorPluginCatalog, type EditorPluginCatalogEntry, } from "./catalog.js";
export { createMockEditorPluginContext, type MockEditorCallLog, type MockEditorPluginContextOptions } from "./testing.js";
