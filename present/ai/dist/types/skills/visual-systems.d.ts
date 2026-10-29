import { type CustomVisualSystemDef } from "../deckgen/custom-system.js";
import { type RegisteredVisualSystem } from "../deckgen/visual-system.js";
import type { SkillView } from "./types.js";
/** Build registry entries from the enabled, generate-affecting skills. */
export declare function resolveCustomVisualSystems(skills: Array<Pick<SkillView, "id" | "enabled" | "stage" | "visualSystems">>): RegisteredVisualSystem[];
/** Replace the session registry with what the given skill views declare. */
export declare function syncCustomVisualSystems(skills: Array<Pick<SkillView, "id" | "enabled" | "stage" | "visualSystems">>): RegisteredVisualSystem[];
/** The JSON blocks must not reach the prompt; the prose around them does. */
export declare function stripVisualSystemBlocks(body: string): string;
export type { CustomVisualSystemDef };
