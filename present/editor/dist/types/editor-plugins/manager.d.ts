import type { CommandStackInfo, EditCommand, Presentation } from "@sliiu/present-core";
import type { EditorCommandEvent, EditorPlugin } from "./types.js";
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
export declare function createEditorPluginRuntime(deps: EditorPluginRuntimeDeps, initialPlugins?: EditorPlugin[]): EditorPluginRuntime;
