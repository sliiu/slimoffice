/**
 * User-defined VisualSystems.
 *
 * A skill `.md` may carry one or more fenced blocks whose info string contains
 * `visual-system`; each holds a JSON object in the shape of {@link CustomVisualSystemDef}.
 * Everything is optional except `id`: missing fields come from the builtin system named by
 * `extends` (default `swiss`). The block is validated with zod on upload (save is refused
 * on a hard error) and turned into a {@link RegisteredVisualSystem} when the skill is
 * enabled. Colors are a *seed* only — the author still writes palette hex per deck.
 *
 * ```visual-system
 * {
 *   "id": "apple_keynote",
 *   "name": "Apple keynote",
 *   "extends": "soft-rounded",
 *   "voice": "neo-grotesk",
 *   "typeScale": { "display": 80, "displayCjk": 64, "h1": 40, "h2": 24, "body": 18, "caption": 13 },
 *   "fonts": { "display": "\"SF Pro Display\", \"Inter\", \"PingFang SC\", sans-serif" },
 *   "fontFamilies": ["Inter", "Noto Sans SC"],
 *   "canvas": { "radius": 18, "shadow": false, "glow": false, "tone": "light", "displayTreatment": "none",
 *               "character": "white paper, one product accent, semibold display, one idea per page" },
 *   "palette": { "bg": "#FFFFFF", "ink": "#1D1D1F", "accent": "#0071E3" },
 *   "aliases": ["apple", "keynote"]
 * }
 * ```
 */
import { z } from "zod";
import { type RegisteredVisualSystem } from "./visual-system.js";
export declare const CustomVisualSystemSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodOptional<z.ZodString>;
    extends: z.ZodOptional<z.ZodEnum<{
        brutalist: "brutalist";
        "dark-tech": "dark-tech";
        "data-dense": "data-dense";
        editorial: "editorial";
        "photo-editorial": "photo-editorial";
        "soft-rounded": "soft-rounded";
        swiss: "swiss";
    }>>;
    voice: z.ZodOptional<z.ZodEnum<{
        grotesk: "grotesk";
        humanist: "humanist";
        "neo-grotesk": "neo-grotesk";
        serif: "serif";
    }>>;
    typeScale: z.ZodOptional<z.ZodObject<{
        display: z.ZodOptional<z.ZodNumber>;
        displayCjk: z.ZodOptional<z.ZodNumber>;
        h1: z.ZodOptional<z.ZodNumber>;
        h2: z.ZodOptional<z.ZodNumber>;
        body: z.ZodOptional<z.ZodNumber>;
        caption: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strict>>;
    grid: z.ZodOptional<z.ZodObject<{
        columns: z.ZodOptional<z.ZodNumber>;
        gutter: z.ZodOptional<z.ZodNumber>;
        margin: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strict>>;
    density: z.ZodOptional<z.ZodEnum<{
        airy: "airy";
        tight: "tight";
    }>>;
    bans: z.ZodOptional<z.ZodObject<{
        roundedCorners: z.ZodOptional<z.ZodBoolean>;
        shadows: z.ZodOptional<z.ZodBoolean>;
        gradients: z.ZodOptional<z.ZodBoolean>;
        centeredDisplay: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strict>>;
    fonts: z.ZodOptional<z.ZodObject<{
        display: z.ZodOptional<z.ZodString>;
        body: z.ZodOptional<z.ZodString>;
        mono: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>>;
    fontFamilies: z.ZodOptional<z.ZodArray<z.ZodString>>;
    canvas: z.ZodOptional<z.ZodObject<{
        radius: z.ZodOptional<z.ZodNumber>;
        shadow: z.ZodOptional<z.ZodBoolean>;
        glow: z.ZodOptional<z.ZodBoolean>;
        tone: z.ZodOptional<z.ZodEnum<{
            dark: "dark";
            light: "light";
        }>>;
        ruleWidth: z.ZodOptional<z.ZodNumber>;
        displayTreatment: z.ZodOptional<z.ZodEnum<{
            glow: "glow";
            gradient: "gradient";
            none: "none";
            outline: "outline";
            shadow: "shadow";
        }>>;
        character: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>>;
    palette: z.ZodOptional<z.ZodObject<{
        bg: z.ZodString;
        surface: z.ZodOptional<z.ZodString>;
        ink: z.ZodString;
        muted: z.ZodOptional<z.ZodString>;
        line: z.ZodOptional<z.ZodString>;
        accent: z.ZodString;
        accentSoft: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>>;
    aliases: z.ZodOptional<z.ZodArray<z.ZodString>>;
}, z.core.$strict>;
export type CustomVisualSystemDef = z.infer<typeof CustomVisualSystemSchema>;
export declare class CustomVisualSystemError extends Error {
    readonly blockIndex: number;
    constructor(message: string, blockIndex: number);
}
/**
 * Pull every ```visual-system block out of a skill body. Returns the parsed definitions and
 * the body with those blocks removed (the JSON must not reach the prompt). Throws
 * {@link CustomVisualSystemError} on malformed JSON or schema violations.
 */
export declare function extractCustomVisualSystems(body: string): {
    defs: CustomVisualSystemDef[];
    body: string;
};
/** Writes a definition back as the fenced block `extractCustomVisualSystems` reads. */
export declare function formatCustomVisualSystemBlock(def: CustomVisualSystemDef): string;
/**
 * Resolve a definition against its base: every field the author left out is the base's.
 * `alignment` is always flush-left — the whole canvas pipeline assumes it.
 */
export declare function buildCustomVisualSystem(def: CustomVisualSystemDef, skillId?: string): RegisteredVisualSystem;
