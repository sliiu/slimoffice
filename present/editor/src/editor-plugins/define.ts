import type { EditorPlugin } from "./types";

export function defineEditorPlugin<T extends EditorPlugin>(plugin: T): T {
  if (!plugin.id) throw new Error("defineEditorPlugin: plugin.id is required");
  if (typeof plugin.activate !== "function") {
    throw new Error("defineEditorPlugin: plugin.activate is required");
  }
  return plugin;
}

export function withEditorPluginErrorBoundary(plugin: EditorPlugin): EditorPlugin {
  return {
    ...plugin,
    async activate(ctx) {
      try {
        return await plugin.activate(ctx);
      } catch (e) {
        console.error(`[ppt-editor] plugin '${plugin.id}' activate failed`, e);
      }
    },
  };
}
