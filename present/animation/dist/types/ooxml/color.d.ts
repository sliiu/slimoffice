import type { AnimColor, ColorBy } from "./types.js";
export interface ColorResolveCtx {
    scheme?: Record<string, string>;
    sys?: Record<string, string>;
}
export declare function resolveAnimColor(c: AnimColor | undefined, ctx?: ColorResolveCtx): string | undefined;
export declare function applyColorBy(from: string, by: ColorBy, space: "rgb" | "hsl", dir: "cw" | "ccw"): string | undefined;
