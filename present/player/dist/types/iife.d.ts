export { mount } from "./player.js";
export type { MountOptions, PlayerHandle, Backend } from "./player.js";
export { definePlugin, composePlugins, withErrorBoundary } from "./define-plugin.js";
export { BUILTIN_PLUGINS, pickBuiltinPlugins, whiteboardPlugin, laserPointerPlugin, outlinePlugin, notesPanelPlugin, thumbnailBarPlugin, screenshotPlugin, } from "./builtin.js";
export type { BuiltinPluginDescriptor } from "./builtin.js";
export type { ContextMenuItemKind, PlayerContextMenuAPI, PlayerContextMenuItem, Plugin, PluginContext, PluginUIHost, PluginUIOptions, PlayerControlAPI, PlayerEventBus, PresentationInfo, SlideInfo, SlideChangeEvent, StepChangeEvent, ThumbnailAPI, ThumbnailHandle, ThumbnailMountOptions, ThumbnailOptions, ThumbnailTarget, PanelOptions, ToolbarButtonOptions, OverlayOptions, UIHandle, } from "./plugins.js";
