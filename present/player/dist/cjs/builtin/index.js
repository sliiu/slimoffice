"use strict";
// 内置插件清单
//
// 这些插件随 @sliiu/present-player 一同分发，编辑器 / 宿主可以通过 `BUILTIN_PLUGINS`
// 拿到完整的可选清单，渲染一个「选择放映时加载哪些插件」的勾选 UI。
Object.defineProperty(exports, "__esModule", { value: true });
exports.passpadPlugin = exports.screenshotPlugin = exports.thumbnailBarPlugin = exports.notesPanelPlugin = exports.outlinePlugin = exports.laserPointerPlugin = exports.whiteboardPlugin = exports.BUILTIN_PLUGINS = void 0;
exports.pickBuiltinPlugins = pickBuiltinPlugins;
const whiteboard_1 = require("./whiteboard");
Object.defineProperty(exports, "whiteboardPlugin", { enumerable: true, get: function () { return whiteboard_1.whiteboardPlugin; } });
const laser_pointer_1 = require("./laser-pointer");
Object.defineProperty(exports, "laserPointerPlugin", { enumerable: true, get: function () { return laser_pointer_1.laserPointerPlugin; } });
const outline_1 = require("./outline");
Object.defineProperty(exports, "outlinePlugin", { enumerable: true, get: function () { return outline_1.outlinePlugin; } });
const notes_panel_1 = require("./notes-panel");
Object.defineProperty(exports, "notesPanelPlugin", { enumerable: true, get: function () { return notes_panel_1.notesPanelPlugin; } });
const thumbnail_bar_1 = require("./thumbnail-bar");
Object.defineProperty(exports, "thumbnailBarPlugin", { enumerable: true, get: function () { return thumbnail_bar_1.thumbnailBarPlugin; } });
const screenshot_1 = require("./screenshot");
Object.defineProperty(exports, "screenshotPlugin", { enumerable: true, get: function () { return screenshot_1.screenshotPlugin; } });
const passpad_1 = require("./passpad");
Object.defineProperty(exports, "passpadPlugin", { enumerable: true, get: function () { return passpad_1.passpadPlugin; } });
exports.BUILTIN_PLUGINS = [
    {
        id: whiteboard_1.whiteboardPlugin.id,
        name: "Whiteboard",
        description: "Draw on top of slides during playback (pen / highlighter / eraser).",
        plugin: whiteboard_1.whiteboardPlugin,
        defaultEnabled: true,
    },
    {
        id: laser_pointer_1.laserPointerPlugin.id,
        name: "Laser Pointer",
        description: "Show a red laser dot following the mouse for emphasis.",
        plugin: laser_pointer_1.laserPointerPlugin,
        defaultEnabled: false,
    },
    {
        id: outline_1.outlinePlugin.id,
        name: "Outline",
        description: "Navigate slides by title in a dock panel.",
        plugin: outline_1.outlinePlugin,
        defaultEnabled: false,
    },
    {
        id: notes_panel_1.notesPanelPlugin.id,
        name: "Speaker Notes",
        description: "Show speaker notes for the current slide.",
        plugin: notes_panel_1.notesPanelPlugin,
        defaultEnabled: false,
    },
    {
        id: thumbnail_bar_1.thumbnailBarPlugin.id,
        name: "Slide Thumbnails",
        description: "Thumbnail strip for quick slide navigation.",
        plugin: thumbnail_bar_1.thumbnailBarPlugin,
        defaultEnabled: false,
    },
    {
        id: screenshot_1.screenshotPlugin.id,
        name: "Screenshot",
        description: "Save the current slide as a PNG image.",
        plugin: screenshot_1.screenshotPlugin,
        defaultEnabled: false,
    },
    {
        id: passpad_1.passpadPlugin.id,
        name: "PassPad Remote",
        description: "Control this slideshow from an AI Passport remote and send speaker notes to the device.",
        plugin: passpad_1.passpadPlugin,
        defaultEnabled: false,
    },
];
function pickBuiltinPlugins(ids) {
    const map = new Map(exports.BUILTIN_PLUGINS.map((d) => [d.id, d.plugin]));
    const out = [];
    for (const id of ids) {
        const p = map.get(id);
        if (p)
            out.push(p);
    }
    return out;
}
