"use strict";
// Skills（注入到 system prompt 的命名 / 可开关 / 可用户自定义的"风格规则集"）类型层。
//
// 设计动机：
//   1. 当前 `prompts/visual-design.ts` 的 VISUAL_DESIGN_GUIDELINES 是硬编码注入 3 处
//      （outline / slide / theme），用户不能关、模型不能感知。Skills 抽象把这种
//      "命名 prompt 片段"提升为一等公民：每条 skill 都有 id / name / description /
//      stage / body，运行时按 enabled 集合拼接到对应 stage 的 system prompt。
//   2. 与 MCP 共用同一套"管理"心智（list / enabled / persisted）：UI 把它们并列在
//      Capabilities tab；AI 通过 `list_capabilities` / `set_capability_enabled`
//      自助查询 / 持久开关。
//   3. 与 Cursor 的 `.cursor/skills/<id>/SKILL.md` 用同样的 frontmatter 字段
//      （name + description），方便用户在两边复用 / 上传同一个 .md 文件。
//
// 与 MCP 的关键区别：
//   - MCP 出产 Tool（运行时 closure，会改 PPT）；Skill 出产纯文本（只影响模型）。
//   - MCP tools 集在每次 send 前 freeze（中途切换需重发）；Skills 也按"启用集"
//     在拼 prompt 时取值，下一个 turn 即生效，无中途切换问题。
//   - MCP 的开关只走 localStorage；Skill 的"内容"由宿主存储（HostSkillStore）
//     管理（保持 @sliiu/present-ai 不直读 localStorage 的边界）。
Object.defineProperty(exports, "__esModule", { value: true });
