import type { Rect } from "@sliiu/present-core";
import type { Scene, SceneNode } from "./scene-node.js";
export interface HitOptions {
    ignoreLocked?: boolean;
}
export declare class Selection {
    private ids;
    private listeners;
    get(): string[];
    has(id: string): boolean;
    set(ids: string[]): void;
    add(id: string): void;
    remove(id: string): void;
    toggle(id: string): void;
    clear(): void;
    on(fn: (ids: Set<string>) => void): () => void;
    private fire;
}
export declare function nodeWorldBBox(node: SceneNode): Rect;
export declare function hitTest(scene: Scene, x: number, y: number, opts?: HitOptions): SceneNode | null;
export declare function pointInNode(node: SceneNode, x: number, y: number): boolean;
export declare function attachPointerSelection(hostEl: HTMLElement, scene: Scene, selection: Selection): () => void;
