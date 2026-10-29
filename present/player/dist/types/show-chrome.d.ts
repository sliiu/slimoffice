import type { EndScreenKind, ProductHome } from "./end-screen.js";
import type { PlayerTranslator } from "./i18n.js";
import type { ThumbnailAPI } from "./plugins.js";
export type BlankKind = "black" | "white";
export interface ShowChrome {
    isBlank(): boolean;
    toggleBlank(kind: BlankKind): void;
    dismissBlank(): boolean;
    isGrid(): boolean;
    toggleGrid(): void;
    dismissGrid(): boolean;
    isHelp(): boolean;
    toggleHelp(): void;
    dismissHelp(): boolean;
    isEnd(): boolean;
    endKind(): EndScreenKind | null;
    showEnd(spec: {
        kind: EndScreenKind;
        onExit: () => void;
        onReplay: () => void;
        homeHref?: ProductHome;
        replayLabel: string;
        homeLabel: string;
        onContextMenu?: (e: MouseEvent) => void;
    }): void;
    /** 关掉结束黑屏，回到最后一页（不退出放映）。 */
    dismissEnd(): boolean;
    /** 关掉黑/白屏、总览、帮助（不含结束黑屏）。 */
    dismissTransient(): boolean;
    pointerOnOverlay(e: Event): boolean;
    setJumpHint(text: string | null): void;
    setPaused(on: boolean): void;
    armIdleCursor(): void;
    destroy(): void;
}
export declare function createShowChrome(opts: {
    host: HTMLElement;
    tr: PlayerTranslator;
    visibleTotal: () => number;
    currentSlot: () => number;
    gotoSlot: (slot: number) => void;
    thumbnail?: ThumbnailAPI;
    toAbsIndex: (slot: number) => number;
}): ShowChrome;
