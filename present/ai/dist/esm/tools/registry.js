// ToolRegistry：中立工具注册表。
//
// 注册表本身只是 name → ToolDef 的有序表；消费方拿到后用适配器转换：
//   - toVercelTools(registry, rt)（adapters/vercel.ts）→ 对话循环
//   - mcp/server 直接遍历 defs 注册成 MCP tools
//
// buildEditToolRegistry() 组装全部内置编辑工具域。MCP client 的 builtin
// 工具组（stock-images 等）不在这里 —— 它们受"能力开关"控制，由
// mcp/client/registry.ts 按启用状态动态并入对话工具集。
export class ToolRegistry {
    map = new Map();
    register(defs) {
        for (const def of Array.isArray(defs) ? defs : [defs]) {
            if (this.map.has(def.name)) {
                throw new Error(`[ai] duplicate tool name: ${def.name}`);
            }
            this.map.set(def.name, def);
        }
        return this;
    }
    get(name) {
        return this.map.get(name);
    }
    has(name) {
        return this.map.has(name);
    }
    list() {
        return [...this.map.values()];
    }
    /** 按 tag 过滤（如 MCP server 排除 capability 工具）。 */
    filter(predicate) {
        return this.list().filter(predicate);
    }
}
