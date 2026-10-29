import type { CommandStackInfo, Presentation } from "@ppt/core";
import { EditorEventBusImpl } from "./event-bus";
import type {
  EditorPluginAPI,
  EditorPluginContext,
  EditorPluginUIHost,
  EditorSelectionEvent,
  EditorSlideChangeEvent,
} from "./types";

export interface MockEditorPluginContextOptions {
  presentation?: Presentation;
  slideIndex?: number;
  selectedShapeIds?: string[];
  locale?: string;
}

export interface MockEditorCallLog {
  execute: string[];
  undo: number;
  redo: number;
  goto: number[];
}

export function createMockEditorPluginContext(
  opts: MockEditorPluginContextOptions = {},
): EditorPluginContext & {
  fireSelectionChange(e: EditorSelectionEvent): void;
  fireSlideChange(e: EditorSlideChangeEvent): void;
  calls: MockEditorCallLog;
} {
  const bus = new EditorEventBusImpl();
  const calls: MockEditorCallLog = { execute: [], undo: 0, redo: 0, goto: [] };
  let slideIndex = opts.slideIndex ?? 0;
  let selected = [...(opts.selectedShapeIds ?? [])];
  const pres =
    opts.presentation ??
    ({
      id: "mock",
      size: { width: 1280, height: 720 },
      slides: [{
        id: "s1",
        name: "Slide 1",
        index: 0,
        layers: [{ id: "main", name: "main", visible: true, locked: false, shapes: [] }],
      }],
    } as unknown as Presentation);

  const noopUi: EditorPluginUIHost = {
    addPanel: () => ({ remove: () => {} }),
    addRibbonButton: () => ({ remove: () => {} }),
    mount: () => ({ remove: () => {} }),
  };

  const editor: EditorPluginAPI = {
    getPresentation: () => pres,
    getSlideIndex: () => slideIndex,
    getSlideCount: () => pres.slides.length,
    gotoSlide: (i) => {
      calls.goto.push(i);
      slideIndex = i;
    },
    getSelectedShapeIds: () => selected,
    execute: (cmd) => {
      calls.execute.push(cmd.label);
    },
    undo: () => {
      calls.undo++;
      return true;
    },
    redo: () => {
      calls.redo++;
      return true;
    },
    stackInfo: (): CommandStackInfo => ({ canUndo: false, canRedo: false }),
    stageElement: () => ({}) as HTMLElement,
    hostElement: () => ({}) as HTMLElement,
  };

  return {
    presentation: pres,
    editor,
    events: bus,
    ui: noopUi,
    shared: {},
    locale: opts.locale ?? "en",
    log: () => {},
    fireSelectionChange: (e) => bus.fire("selectionchange", e),
    fireSlideChange: (e) => bus.fire("slidechange", e),
    calls,
  };
}
