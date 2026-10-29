import type { ToolDef } from "./types.js";
export declare class ToolRegistry {
    private readonly map;
    register(defs: ToolDef | readonly ToolDef[]): this;
    get(name: string): ToolDef | undefined;
    has(name: string): boolean;
    list(): ToolDef[];
    /** 按 tag 过滤（如 MCP server 排除 capability 工具）。 */
    filter(predicate: (def: ToolDef) => boolean): ToolDef[];
}
