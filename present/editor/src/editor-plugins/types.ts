import type { CommandStackInfo, EditCommand, Presentation } from "@ppt/core";

/** Editor-phase plugin — mirrors `@ppt/plugin-sdk` `Plugin` lifecycle, different context. */
export interface EditorPlugin {
  id: string;
  name?: string;
  version?: string;
  activate(
    ctx: EditorPluginContext,
  ): EditorPluginCleanup | void | Promise<EditorPluginCleanup | void>;
  deactivate?(): void;
}

export type EditorPluginCleanup = () => void;

export type EditorEventType =
  | "selectionchange"
  | "slidechange"
  | "command"
  | "presentationchange"
  | "destroy";

export interface EditorSelectionEvent {
  slideIndex: number;
  shapeIds: readonly string[];
}

export interface EditorSlideChangeEvent {
  slideIndex: number;
  total: number;
}

export interface EditorCommandEvent {
  label: string;
  kind: "apply" | "undo" | "redo";
}

export interface EditorEventMap {
  selectionchange: EditorSelectionEvent;
  slidechange: EditorSlideChangeEvent;
  command: EditorCommandEvent;
  presentationchange: void;
  destroy: void;
}

export type EditorEventUnsubscribe = () => void;

export interface EditorEventBus {
  on<E extends EditorEventType>(
    event: E,
    cb: (payload: EditorEventMap[E]) => void,
  ): EditorEventUnsubscribe;
  off<E extends EditorEventType>(
    event: E,
    cb: (payload: EditorEventMap[E]) => void,
  ): void;
  /** Re-emit latest selection / slide snapshot (like player `emitCurrentSlide`). */
  emitCurrentState(): void;
}

export interface EditorPluginAPI {
  getPresentation(): Presentation;
  getSlideIndex(): number;
  getSlideCount(): number;
  gotoSlide(index: number): void;
  getSelectedShapeIds(): readonly string[];
  execute(cmd: EditCommand): void;
  undo(): boolean;
  redo(): boolean;
  stackInfo(): CommandStackInfo;
  stageElement(): HTMLElement;
  hostElement(): HTMLElement;
}

export interface EditorPanelOptions {
  id?: string;
  title: string;
  render: (body: HTMLElement) => void;
  initialOpen?: boolean;
  order?: number;
}

export interface EditorRibbonButtonOptions {
  label: string;
  tooltip?: string;
  onClick: (e: MouseEvent) => void;
}

export interface EditorPluginUIHandle {
  remove(): void;
}

export interface EditorPluginUIHost {
  addPanel(opts: EditorPanelOptions): EditorPluginUIHandle;
  addRibbonButton(opts: EditorRibbonButtonOptions): EditorPluginUIHandle;
  mount(node: HTMLElement): EditorPluginUIHandle;
}

export interface EditorPluginContext {
  readonly presentation: Presentation;
  readonly editor: EditorPluginAPI;
  readonly events: EditorEventBus;
  readonly ui: EditorPluginUIHost;
  readonly shared: Record<string, unknown>;
  readonly locale: string;
  log(...args: unknown[]): void;
}
