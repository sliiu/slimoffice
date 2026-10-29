import { type Tool } from "ai";
import type { ToolDef, ToolRuntime } from "../types.js";
export declare function toVercelTool(def: ToolDef, rt: ToolRuntime): Tool;
export declare function toVercelTools(defs: readonly ToolDef[], rt: ToolRuntime): Record<string, Tool>;
