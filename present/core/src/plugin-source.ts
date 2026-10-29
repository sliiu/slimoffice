import { isImportablePluginId } from "./plugin-ids";

export const IMPORTED_PLUGIN_SOURCE_MAX_CHARS = 96 * 1024;

export type ImportedPluginKind = "editor" | "playback";

export interface LoadedPluginSource {
  kind: ImportedPluginKind;
  id: string;
  name: string;
  description: string;
  plugin: {
    id: string;
    name?: string;
    description?: string;
    version?: string;
    activate: (ctx: object) => unknown;
    deactivate?: () => void;
  };
}

export class PluginSourceError extends Error {
  constructor(readonly code: "empty" | "too_large" | "define" | "id" | "activate") {
    super(code);
    this.name = "PluginSourceError";
  }
}

/**
 * 执行插件文件。文件必须调用且只调用一次 `defineEditorPlugin` 或 `definePlaybackPlugin`。
 * 编辑器 CSP 需要 `unsafe-eval`（`new Function`）。HTTP 头和 `<meta>` 都要写上，浏览器取交集。导出 HTML 不走这里，源码直接写进 script。
 */
export function loadPluginSource(source: string): LoadedPluginSource {
  if (typeof source !== "string" || !source.trim()) throw new PluginSourceError("empty");
  if (source.length > IMPORTED_PLUGIN_SOURCE_MAX_CHARS) throw new PluginSourceError("too_large");

  let editor: unknown;
  let playback: unknown;
  let calls = 0;
  const take = (slot: ImportedPluginKind, plugin: unknown): unknown => {
    calls += 1;
    if (slot === "editor") editor = plugin;
    else playback = plugin;
    return plugin;
  };

  const fn = new Function(
    "defineEditorPlugin",
    "definePlaybackPlugin",
    `"use strict";\n${source}`,
  );
  fn(
    (plugin: unknown) => take("editor", plugin),
    (plugin: unknown) => take("playback", plugin),
  );

  if (calls !== 1 || Boolean(editor) === Boolean(playback)) throw new PluginSourceError("define");
  const kind: ImportedPluginKind = editor ? "editor" : "playback";
  const plugin = (editor ?? playback) as LoadedPluginSource["plugin"] | null;
  if (!plugin || typeof plugin !== "object") throw new PluginSourceError("define");
  if (typeof plugin.id !== "string" || !isImportablePluginId(plugin.id)) throw new PluginSourceError("id");
  if (typeof plugin.activate !== "function") throw new PluginSourceError("activate");

  const name =
    typeof plugin.name === "string" && plugin.name.trim()
      ? plugin.name.trim().slice(0, 80)
      : plugin.id;
  const description =
    typeof plugin.description === "string" ? plugin.description.trim().slice(0, 240) : "";
  plugin.name = name;
  plugin.description = description;
  return { kind, id: plugin.id, name, description, plugin };
}
