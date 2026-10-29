export { mount } from "./player";
export type { MountOptions, PlayerHandle, Backend } from "./player";
export { definePlugin, composePlugins, withErrorBoundary } from "./define-plugin";
export {
  BUILTIN_PLUGINS,
  pickBuiltinPlugins,
  whiteboardPlugin,
  laserPointerPlugin,
  outlinePlugin,
  notesPanelPlugin,
  thumbnailBarPlugin,
  screenshotPlugin,
} from "./builtin";
export type { BuiltinPluginDescriptor } from "./builtin";
export type {
  ContextMenuItemKind,
  PlayerContextMenuAPI,
  PlayerContextMenuItem,
  Plugin,
  PluginContext,
  PluginUIHost,
  PluginUIOptions,
  PlayerControlAPI,
  PlayerEventBus,
  PresentationInfo,
  SlideInfo,
  SlideChangeEvent,
  StepChangeEvent,
  ThumbnailAPI,
  ThumbnailHandle,
  ThumbnailMountOptions,
  ThumbnailOptions,
  ThumbnailTarget,
  PanelOptions,
  ToolbarButtonOptions,
  OverlayOptions,
  UIHandle,
} from "./plugins";
