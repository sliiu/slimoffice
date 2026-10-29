import type { EditorPlugin } from "./types.js";
export declare function defineEditorPlugin<T extends EditorPlugin>(plugin: T): T;
export declare function withEditorPluginErrorBoundary(plugin: EditorPlugin): EditorPlugin;
