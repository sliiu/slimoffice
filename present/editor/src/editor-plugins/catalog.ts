import { slideStatsEditorPlugin } from "./builtin/slide-stats";
import { speakerNotesEditorPlugin } from "./builtin/speaker-notes";
import type { EditorPlugin } from "./types";

/** Catalog metadata for the editor plugin market (View tab). */
export interface EditorPluginCatalogEntry {
  id: string;
  nameKey?: string;
  /** 导入插件的显示名。官方插件走 nameKey。 */
  name?: string;
  descriptionKey?: string;
  description?: string;
  create: () => EditorPlugin;
  /** Used when `enabledEditorPlugins` is not provided on mount. */
  defaultEnabled?: boolean;
  origin?: "official" | "imported";
  /** 导入插件源码的更新时间。变化时重新 activate。 */
  sourceRevision?: number;
}

export const BUILTIN_EDITOR_PLUGIN_CATALOG: EditorPluginCatalogEntry[] = [
  {
    id: slideStatsEditorPlugin.id,
    nameKey: "editorPlugins.slideStats.name",
    descriptionKey: "editorPlugins.slideStats.desc",
    create: () => slideStatsEditorPlugin,
    defaultEnabled: false,
    origin: "official",
  },
  {
    id: speakerNotesEditorPlugin.id,
    nameKey: "editorPlugins.speakerNotes.name",
    descriptionKey: "editorPlugins.speakerNotes.desc",
    create: () => speakerNotesEditorPlugin,
    defaultEnabled: false,
    origin: "official",
  },
];

export function mergeEditorPluginCatalog(extra: EditorPluginCatalogEntry[] = []): EditorPluginCatalogEntry[] {
  const byId = new Map<string, EditorPluginCatalogEntry>();
  for (const e of BUILTIN_EDITOR_PLUGIN_CATALOG) byId.set(e.id, e);
  for (const e of extra) byId.set(e.id, e);
  return [...byId.values()];
}
