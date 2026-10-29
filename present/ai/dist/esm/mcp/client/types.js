// MCP 客户端（对内方向）类型层。
//
// v2 设计：
//   1. **builtin 工具组**（stock-images / stock-fonts / chat-history）不再是
//      "in-process MCP server"，而是基于 ToolRegistry 的普通 ToolDef 工具组 ——
//      与内置编辑工具同构，仅多了一层"能力开关"（enabled / ready / missing）。
//      运行时（config / port / hostChatStore）在执行时从 ToolRuntime 取，
//      不再靠 createTools(ctx) 闭包注入。
//   2. **用户远端 MCP**（HTTP / Streamable HTTP / SSE）继续走 @ai-sdk/mcp
//      客户端连接池，工具在连接时拉取缓存，逐轮合并进对话工具集。
//   3. UI 视图（McpServerView）与能力管理心智保持 v1：list / enabled / ready /
//      missing / runtime，builtin 与 user 并列展示在 Capabilities tab。
export {};
