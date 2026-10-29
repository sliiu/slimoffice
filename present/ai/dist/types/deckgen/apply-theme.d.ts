/**
 * Apply ColorTheme last. Must not change layout, variant, or geometry.
 */
import type { ColorTheme } from "./color-theme.js";
import { type ColorPalette } from "./color-theme.js";
import type { CanvasBackground, FilledEl, FilledSlide } from "./ir.js";
import { type Rgb } from "../generate/qa/color.js";
export interface PaintedEl extends FilledEl {
    color: string;
    /** Set when `color` is a token pushed darker/lighter for AA; holds the original token hex. */
    liftedFrom?: string;
    /** Set when the text token was swapped for another palette token to clear AA on its backdrop. */
    recoloredFrom?: string;
    /** What the text visually sits on (panel under it, else the field), when it can be known. Emit
     *  uses it to keep display treatments (gradient) readable on an accent band, not just on paper. */
    backdrop?: string;
}
export interface PaintedSlide extends Omit<FilledSlide, "elements"> {
    elements: PaintedEl[];
}
export declare function applyColorTheme(slides: FilledSlide[], theme: ColorTheme): PaintedSlide[];
/**
 * What a text element visually sits on: the panel under it, else the slide field — solid paper,
 * the middle of a linear field, or the scrimmed side of a photo. `undefined` = cannot be known
 * (photo with no scrim / overlay), in which case the element is left alone.
 */
export declare function backdropOf(elements: PaintedEl[], ti: number, background: CanvasBackground | undefined, pal: ColorPalette): Rgb | undefined;
/** Palette token (plus onPhoto) that clears `min` on `bg`, preferring the polarity opposite the field; else the best available. */
export declare function bestTextToken(bg: Rgb, min: number, pal: ColorPalette, onPhoto?: string): string | undefined;
