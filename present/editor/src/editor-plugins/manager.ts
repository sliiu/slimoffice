import type { CommandStackInfo, EditCommand, Presentation } from "@ppt/core";
import { EditorEventBusImpl } from "./event-bus";
import { createEditorPluginUIHost, removeEditorPluginLayers } from "./ui-host";
import type {
  EditorCommandEvent,
  EditorPlugin,
  EditorPluginAPI,
  EditorPluginContext,
  EditorPluginUIHost,
} from "./types";

export interface EditorPluginRuntimeDeps {
  doc: Document;
  host: HTMLElement;
  root: HTMLElement;
  stage: HTMLElement;
  locale: string;
  getPresentation: () => Presentation;
  getSlideIndex: () => number;
  getSelectedShapeIds: () => ReadonlySet<string>;
  execute: (cmd: EditCommand) => void;
  undo: () => boolean;
  redo: () => boolean;
  stackInfo: () => CommandStackInfo;
  gotoSlide: (index: number) => void;
}

export interface EditorPluginRuntime {
  register(plugin: EditorPlugin): Promise<void>;
  unregister(id: string): void;
  list(): string[];
  notifySelectionChange(): void;
  notifySlideChange(): void;
  notifyCommand(event: EditorCommandEvent): void;
  notifyPresentationChange(): void;
  destroy(): void;
}

interface ActiveRecord {
  plugin: EditorPlugin;
  cleanups: Array<() => void>;
}

export function createEditorPluginRuntime(
  deps: EditorPluginRuntimeDeps,
  initialPlugins: EditorPlugin[] = [],
): EditorPluginRuntime {
  const bus = new EditorEventBusImpl();
  const shared: Record<string, unknown> = {};
  const records = new Map<string, ActiveRecord>();
  const uiHandles = new Map<string, Set<{ remove(): void }>>();

  const editorApi: EditorPluginAPI = {
    getPresentation: () => deps.getPresentation(),
    getSlideIndex: () => deps.getSlideIndex(),
    getSlideCount: () => deps.getPresentation().slides.length,
    gotoSlide: (i) => deps.gotoSlide(i),
    getSelectedShapeIds: () => [...deps.getSelectedShapeIds()],
    execute: (cmd) => deps.execute(cmd),
    undo: () => deps.undo(),
    redo: () => deps.redo(),
    stackInfo: () => deps.stackInfo(),
    stageElement: () => deps.stage,
    hostElement: () => deps.host,
  };

  const wrapUi = (pluginId: string, ui: EditorPluginUIHost): EditorPluginUIHost => {
    const orig = ui;
    const tracked = new Set<{ remove(): void }>();
    uiHandles.set(pluginId, tracked);
    const wrapHandle = <T extends { remove(): void }>(h: T): T => {
      tracked.add(h);
      const origRemove = h.remove.bind(h);
      h.remove = () => {
        origRemove();
        tracked.delete(h);
      };
      return h;
    };
    return {
      addPanel: (opts) => wrapHandle(orig.addPanel(opts)),
      addRibbonButton: (opts) => wrapHandle(orig.addRibbonButton(opts)),
      mount: (node) => wrapHandle(orig.mount(node)),
    };
  };

  const buildCtx = (pluginId: string): EditorPluginContext => {
    const ui = wrapUi(pluginId, createEditorPluginUIHost(deps.doc, deps.root, pluginId));
    return {
      get presentation() {
        return deps.getPresentation();
      },
      editor: editorApi,
      events: bus,
      ui,
      shared,
      locale: deps.locale,
      log: (...args: unknown[]) => console.log(`[editor-plugin:${pluginId}]`, ...args),
    };
  };

  const disposeUi = (pluginId: string): void => {
    const set = uiHandles.get(pluginId);
    if (!set) return;
    for (const h of [...set]) h.remove();
    uiHandles.delete(pluginId);
  };

  const unregister = (id: string): void => {
    const rec = records.get(id);
    if (!rec) return;
    for (const fn of [...rec.cleanups].reverse()) {
      try {
        fn();
      } catch (e) {
        console.error(`[ppt-editor] plugin '${id}' cleanup threw`, e);
      }
    }
    try {
      rec.plugin.deactivate?.();
    } catch (e) {
      console.error(`[ppt-editor] plugin '${id}' deactivate threw`, e);
    }
    disposeUi(id);
    records.delete(id);
  };

  const register = async (plugin: EditorPlugin): Promise<void> => {
    if (!plugin?.id) throw new Error("[ppt-editor] editor plugin.id is required");
    if (!plugin.activate) throw new Error("[ppt-editor] editor plugin.activate is required");
    if (records.has(plugin.id)) unregister(plugin.id);
    const ctx = buildCtx(plugin.id);
    const cleanups: Array<() => void> = [];
    try {
      const ret = await plugin.activate(ctx);
      if (typeof ret === "function") cleanups.push(ret);
    } catch (e) {
      console.error(`[ppt-editor] plugin '${plugin.id}' activate threw`, e);
      disposeUi(plugin.id);
      return;
    }
    records.set(plugin.id, { plugin, cleanups });
    bus.emitCurrentState();
  };

  const runtime: EditorPluginRuntime = {
    register,
    unregister,
    list: () => [...records.keys()],
    notifySelectionChange: () => {
      bus.fire("selectionchange", {
        slideIndex: deps.getSlideIndex(),
        shapeIds: [...deps.getSelectedShapeIds()],
      });
    },
    notifySlideChange: () => {
      const pres = deps.getPresentation();
      bus.fire("slidechange", {
        slideIndex: deps.getSlideIndex(),
        total: pres.slides.length,
      });
    },
    notifyCommand: (event) => bus.fire("command", event),
    notifyPresentationChange: () => bus.fire("presentationchange", undefined),
    destroy: () => {
      bus.fire("destroy", undefined);
      for (const id of [...records.keys()]) unregister(id);
      bus.clear();
      removeEditorPluginLayers(deps.root);
    },
  };

  if (initialPlugins.length) {
    void Promise.all(initialPlugins.map((p) => register(p)));
  }

  return runtime;
}
