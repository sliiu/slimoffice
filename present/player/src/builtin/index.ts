// 内置插件清单
//
// 这些插件随 @ppt/player 一同分发，编辑器 / 宿主可以通过 `BUILTIN_PLUGINS`
// 拿到完整的可选清单，渲染一个「选择放映时加载哪些插件」的勾选 UI。

import type { Plugin } from "@ppt/plugin-sdk";
import { whiteboardPlugin } from "./whiteboard";
import { laserPointerPlugin } from "./laser-pointer";
import { outlinePlugin } from "./outline";
import { notesPanelPlugin } from "./notes-panel";
import { thumbnailBarPlugin } from "./thumbnail-bar";
import { screenshotPlugin } from "./screenshot";
import { passpadPlugin } from "./passpad";

export interface BuiltinPluginDescriptor {
  id: string;
  name: string;
  description: string;
  plugin: Plugin;
  defaultEnabled?: boolean;
}

export const BUILTIN_PLUGINS: BuiltinPluginDescriptor[] = [
  {
    id: whiteboardPlugin.id,
    name: "Whiteboard",
    description: "Draw on top of slides during playback (pen / highlighter / eraser).",
    plugin: whiteboardPlugin,
    defaultEnabled: true,
  },
  {
    id: laserPointerPlugin.id,
    name: "Laser Pointer",
    description: "Show a red laser dot following the mouse for emphasis.",
    plugin: laserPointerPlugin,
    defaultEnabled: false,
  },
  {
    id: outlinePlugin.id,
    name: "Outline",
    description: "Navigate slides by title in a dock panel.",
    plugin: outlinePlugin,
    defaultEnabled: false,
  },
  {
    id: notesPanelPlugin.id,
    name: "Speaker Notes",
    description: "Show speaker notes for the current slide.",
    plugin: notesPanelPlugin,
    defaultEnabled: false,
  },
  {
    id: thumbnailBarPlugin.id,
    name: "Slide Thumbnails",
    description: "Thumbnail strip for quick slide navigation.",
    plugin: thumbnailBarPlugin,
    defaultEnabled: false,
  },
  {
    id: screenshotPlugin.id,
    name: "Screenshot",
    description: "Save the current slide as a PNG image.",
    plugin: screenshotPlugin,
    defaultEnabled: false,
  },
  {
    id: passpadPlugin.id,
    name: "PassPad Remote",
    description: "Control this slideshow from an AI Passport remote and send speaker notes to the device.",
    plugin: passpadPlugin,
    defaultEnabled: false,
  },
];

export {
  whiteboardPlugin,
  laserPointerPlugin,
  outlinePlugin,
  notesPanelPlugin,
  thumbnailBarPlugin,
  screenshotPlugin,
  passpadPlugin,
};

export function pickBuiltinPlugins(ids: readonly string[]): Plugin[] {
  const map = new Map(BUILTIN_PLUGINS.map((d) => [d.id, d.plugin]));
  const out: Plugin[] = [];
  for (const id of ids) {
    const p = map.get(id);
    if (p) out.push(p);
  }
  return out;
}
