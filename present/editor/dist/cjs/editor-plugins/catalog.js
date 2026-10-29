"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BUILTIN_EDITOR_PLUGIN_CATALOG = void 0;
exports.mergeEditorPluginCatalog = mergeEditorPluginCatalog;
const slide_stats_1 = require("./builtin/slide-stats");
const speaker_notes_1 = require("./builtin/speaker-notes");
exports.BUILTIN_EDITOR_PLUGIN_CATALOG = [
    {
        id: slide_stats_1.slideStatsEditorPlugin.id,
        nameKey: "editorPlugins.slideStats.name",
        descriptionKey: "editorPlugins.slideStats.desc",
        create: () => slide_stats_1.slideStatsEditorPlugin,
        defaultEnabled: false,
        origin: "official",
    },
    {
        id: speaker_notes_1.speakerNotesEditorPlugin.id,
        nameKey: "editorPlugins.speakerNotes.name",
        descriptionKey: "editorPlugins.speakerNotes.desc",
        create: () => speaker_notes_1.speakerNotesEditorPlugin,
        defaultEnabled: false,
        origin: "official",
    },
];
function mergeEditorPluginCatalog(extra = []) {
    const byId = new Map();
    for (const e of exports.BUILTIN_EDITOR_PLUGIN_CATALOG)
        byId.set(e.id, e);
    for (const e of extra)
        byId.set(e.id, e);
    return [...byId.values()];
}
