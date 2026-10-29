import type {
  EditorEventBus,
  EditorEventMap,
  EditorEventType,
  EditorSelectionEvent,
  EditorSlideChangeEvent,
} from "./types";

export class EditorEventBusImpl implements EditorEventBus {
  private listeners = new Map<EditorEventType, Set<(p: unknown) => void>>();
  private lastSelection: EditorSelectionEvent | null = null;
  private lastSlide: EditorSlideChangeEvent | null = null;

  on<E extends EditorEventType>(
    event: E,
    cb: (payload: EditorEventMap[E]) => void,
  ): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(cb as (p: unknown) => void);
    if (event === "selectionchange" && this.lastSelection) {
      (cb as (p: EditorSelectionEvent) => void)(this.lastSelection);
    }
    if (event === "slidechange" && this.lastSlide) {
      (cb as (p: EditorSlideChangeEvent) => void)(this.lastSlide);
    }
    return (): void => {
      this.listeners.get(event)?.delete(cb as (p: unknown) => void);
    };
  }

  off<E extends EditorEventType>(
    event: E,
    cb: (payload: EditorEventMap[E]) => void,
  ): void {
    this.listeners.get(event)?.delete(cb as (p: unknown) => void);
  }

  fire<E extends EditorEventType>(event: E, payload: EditorEventMap[E]): void {
    if (event === "selectionchange") this.lastSelection = payload as EditorSelectionEvent;
    if (event === "slidechange") this.lastSlide = payload as EditorSlideChangeEvent;
    const set = this.listeners.get(event);
    if (!set) return;
    for (const cb of [...set]) {
      try {
        (cb as (p: unknown) => void)(payload);
      } catch (e) {
        console.error(`[ppt-editor] event '${event}' listener threw`, e);
      }
    }
  }

  emitCurrentState(): void {
    if (this.lastSlide) this.fire("slidechange", this.lastSlide);
    if (this.lastSelection) this.fire("selectionchange", this.lastSelection);
  }

  clear(): void {
    this.listeners.clear();
    this.lastSelection = null;
    this.lastSlide = null;
  }
}
