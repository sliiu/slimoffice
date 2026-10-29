import type { Plugin } from "@sliiu/present-plugin-sdk";
import { whiteboardPlugin } from "./whiteboard.js";
import { laserPointerPlugin } from "./laser-pointer.js";
import { outlinePlugin } from "./outline.js";
import { notesPanelPlugin } from "./notes-panel.js";
import { thumbnailBarPlugin } from "./thumbnail-bar.js";
import { screenshotPlugin } from "./screenshot.js";
import { passpadPlugin } from "./passpad.js";
export interface BuiltinPluginDescriptor {
    id: string;
    name: string;
    description: string;
    plugin: Plugin;
    defaultEnabled?: boolean;
}
export declare const BUILTIN_PLUGINS: BuiltinPluginDescriptor[];
export { whiteboardPlugin, laserPointerPlugin, outlinePlugin, notesPanelPlugin, thumbnailBarPlugin, screenshotPlugin, passpadPlugin, };
export declare function pickBuiltinPlugins(ids: readonly string[]): Plugin[];
