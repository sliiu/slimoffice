import type { ToolDef } from "./types.js";
import { ToolRegistry } from "./registry.js";
/** 内置编辑工具全集（不含 capability 管理工具）。 */
export declare function buildEditToolDefs(): ToolDef[];
/** 生成 polish 专用子集。extra 可并入额外工具名。 */
export declare function buildPainterToolDefs(extra?: readonly string[]): ToolDef[];
/** 组装成注册表（重名在 register 时抛错，防止两个域撞名）。 */
export declare function buildEditToolRegistry(): ToolRegistry;
export { ToolRegistry } from "./registry.js";
export { defineTool, createToolRuntime, ok, err, type ToolDef, type ToolTag, type ToolResult, type ToolRuntime, type ToolRuntimeOptions, type CapabilityChangedEvent, } from "./types.js";
export { toVercelTool, toVercelTools } from "./adapters/vercel.js";
export { assertShapeInScope, extractShapeTarget } from "./guard.js";
export { paintSummary, textStyleSummary, shapeSummary, slideSummary, elideUrlForSummary, findShapeDeep } from "./summaries.js";
export { capabilityTools } from "./domains/capabilities.js";
