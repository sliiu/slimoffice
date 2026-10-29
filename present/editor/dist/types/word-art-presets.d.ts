export type WordArtShadowKind = "soft" | "hard" | "glow" | "inner" | "reflection";
/** Two-stop linear gradient written as TextRun.fill. */
export interface WordArtGradient {
    from: string;
    to: string;
    /** Degrees, same convention as Paint linear angle (0 = left → right). */
    angle: number;
}
export interface WordArtState {
    text: string;
    fontFamily: string;
    fontSize: number;
    bold: boolean;
    italic: boolean;
    fillColor: string;
    fillGradient: WordArtGradient | null;
    outlineColor: string | null;
    outlineWidth: number;
    shadowKind: WordArtShadowKind | null;
    shadowColor: string;
}
export interface WordArtPreset {
    id: string;
    state: Omit<WordArtState, "text">;
}
export declare const PRESET_FONT_DEFAULT = "Calibri, 'PingFang SC', 'Microsoft YaHei', sans-serif";
export declare const WORDART_PRESETS: WordArtPreset[];
export declare function defaultWordArtState(text: string): WordArtState;
