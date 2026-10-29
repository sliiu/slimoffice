"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PluginSourceError = exports.IMPORTED_PLUGIN_SOURCE_MAX_CHARS = void 0;
exports.loadPluginSource = loadPluginSource;
const plugin_ids_1 = require("./plugin-ids");
exports.IMPORTED_PLUGIN_SOURCE_MAX_CHARS = 96 * 1024;
class PluginSourceError extends Error {
    code;
    constructor(code) {
        super(code);
        this.code = code;
        this.name = "PluginSourceError";
    }
}
exports.PluginSourceError = PluginSourceError;
/**
 * 执行插件文件。文件必须调用且只调用一次 `defineEditorPlugin` 或 `definePlaybackPlugin`。
 * 编辑器 CSP 需要 `unsafe-eval`（`new Function`）。HTTP 头和 `<meta>` 都要写上，浏览器取交集。导出 HTML 不走这里，源码直接写进 script。
 */
function loadPluginSource(source) {
    if (typeof source !== "string" || !source.trim())
        throw new PluginSourceError("empty");
    if (source.length > exports.IMPORTED_PLUGIN_SOURCE_MAX_CHARS)
        throw new PluginSourceError("too_large");
    let editor;
    let playback;
    let calls = 0;
    const take = (slot, plugin) => {
        calls += 1;
        if (slot === "editor")
            editor = plugin;
        else
            playback = plugin;
        return plugin;
    };
    const fn = new Function("defineEditorPlugin", "definePlaybackPlugin", `"use strict";\n${source}`);
    fn((plugin) => take("editor", plugin), (plugin) => take("playback", plugin));
    if (calls !== 1 || Boolean(editor) === Boolean(playback))
        throw new PluginSourceError("define");
    const kind = editor ? "editor" : "playback";
    const plugin = (editor ?? playback);
    if (!plugin || typeof plugin !== "object")
        throw new PluginSourceError("define");
    if (typeof plugin.id !== "string" || !(0, plugin_ids_1.isImportablePluginId)(plugin.id))
        throw new PluginSourceError("id");
    if (typeof plugin.activate !== "function")
        throw new PluginSourceError("activate");
    const name = typeof plugin.name === "string" && plugin.name.trim()
        ? plugin.name.trim().slice(0, 80)
        : plugin.id;
    const description = typeof plugin.description === "string" ? plugin.description.trim().slice(0, 240) : "";
    plugin.name = name;
    plugin.description = description;
    return { kind, id: plugin.id, name, description, plugin };
}
