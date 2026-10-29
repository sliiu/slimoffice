import { slideStatsEditorPlugin } from "./builtin/slide-stats.js";
import { speakerNotesEditorPlugin } from "./builtin/speaker-notes.js";
export const BUILTIN_EDITOR_PLUGIN_CATALOG = [
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
export function mergeEditorPluginCatalog(extra = []) {
    const byId = new Map();
    for (const e of BUILTIN_EDITOR_PLUGIN_CATALOG)
        byId.set(e.id, e);
    for (const e of extra)
        byId.set(e.id, e);
    return [...byId.values()];
}
