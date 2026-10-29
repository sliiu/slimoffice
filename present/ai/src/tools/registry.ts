// ToolRegistry：中立工具注册表。
//
// 注册表本身只是 name → ToolDef 的有序表；消费方拿到后用适配器转换：
//   - toVercelTools(registry, rt)（adapters/vercel.ts）→ 对话循环
//   - mcp/server 直接遍历 defs 注册成 MCP tools
//
// buildEditToolRegistry() 组装全部内置编辑工具域。MCP client 的 builtin
// 工具组（stock-images 等）不在这里 —— 它们受"能力开关"控制，由
// mcp/client/registry.ts 按启用状态动态并入对话工具集。

import type { ToolDef } from "./types";

export class ToolRegistry {
  private readonly map = new Map<string, ToolDef>();

  register(defs: ToolDef | readonly ToolDef[]): this {
    for (const def of Array.isArray(defs) ? defs : [defs as ToolDef]) {
      if (this.map.has(def.name)) {
        throw new Error(`[ai] duplicate tool name: ${def.name}`);
      }
      this.map.set(def.name, def);
    }
    return this;
  }

  get(name: string): ToolDef | undefined {
    return this.map.get(name);
  }

  has(name: string): boolean {
    return this.map.has(name);
  }

  list(): ToolDef[] {
    return [...this.map.values()];
  }

  /** 按 tag 过滤（如 MCP server 排除 capability 工具）。 */
  filter(predicate: (def: ToolDef) => boolean): ToolDef[] {
    return this.list().filter(predicate);
  }
}
