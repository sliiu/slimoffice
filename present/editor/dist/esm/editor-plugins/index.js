export { defineEditorPlugin, withEditorPluginErrorBoundary } from "./define.js";
export { createEditorPluginRuntime } from "./manager.js";
export { slideStatsEditorPlugin } from "./builtin/slide-stats.js";
export { speakerNotesEditorPlugin } from "./builtin/speaker-notes.js";
export { BUILTIN_EDITOR_PLUGIN_CATALOG, mergeEditorPluginCatalog, } from "./catalog.js";
export { createMockEditorPluginContext } from "./testing.js";
