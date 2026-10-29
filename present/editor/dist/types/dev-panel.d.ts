import type { CommandStack, Presentation, Shape } from "@sliiu/present-core";
export interface DevDumpAction {
    label: string;
    run: () => void;
}
export interface DevDumpSection {
    title: string;
    actions: readonly DevDumpAction[];
}
export interface DevPanelOpts {
    pres: Presentation;
    stack: CommandStack;
    currentSlide(): number;
    gotoSlide?: (index: number) => void;
    getSelectedShapes?: () => readonly Shape[];
    extraSections?: () => readonly DevDumpSection[];
}
export interface DevPanelHandle {
    el: HTMLElement;
    refresh(): void;
    destroy(): void;
}
export declare function mountDevPanel(parent: HTMLElement, opts: DevPanelOpts): DevPanelHandle;
