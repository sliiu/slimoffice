import type { InkMode, InkPoint } from "./ink-tool.js";
export interface InkOverlayHandle {
    setMode(mode: InkMode | null): void;
    setPenColor(color: string): void;
    setPenWidth(width: number): void;
    bringToFront(): void;
    destroy(): void;
}
export interface InkOverlayOptions {
    stage: HTMLElement;
    slideW: number;
    slideH: number;
    screenToStage: (clientX: number, clientY: number) => InkPoint;
    onStroke: (points: InkPoint[], mode: "pen" | "highlighter") => void;
    onEraseAt: (pt: InkPoint) => void;
}
export declare function mountInkOverlay(opts: InkOverlayOptions): InkOverlayHandle;
