import type { EditorEventBus, EditorEventMap, EditorEventType } from "./types.js";
export declare class EditorEventBusImpl implements EditorEventBus {
    private listeners;
    private lastSelection;
    private lastSlide;
    on<E extends EditorEventType>(event: E, cb: (payload: EditorEventMap[E]) => void): () => void;
    off<E extends EditorEventType>(event: E, cb: (payload: EditorEventMap[E]) => void): void;
    fire<E extends EditorEventType>(event: E, payload: EditorEventMap[E]): void;
    emitCurrentState(): void;
    clear(): void;
}
