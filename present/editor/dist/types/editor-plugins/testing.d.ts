import type { Presentation } from "@sliiu/present-core";
import type { EditorPluginContext, EditorSelectionEvent, EditorSlideChangeEvent } from "./types.js";
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
export declare function createMockEditorPluginContext(opts?: MockEditorPluginContextOptions): EditorPluginContext & {
    fireSelectionChange(e: EditorSelectionEvent): void;
    fireSlideChange(e: EditorSlideChangeEvent): void;
    calls: MockEditorCallLog;
};
