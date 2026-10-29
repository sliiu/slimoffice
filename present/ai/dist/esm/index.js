// @sliiu/present-ai v2 公共 API。
//
// 模块地图（详见各目录内注释）：
//   config/   配置层（AiConfig + 可插拔 ConfigStore：浏览器 localStorage / Node env）
//   llm/      Provider 工厂（Vercel AI SDK）+ 结构化 JSON 输出
//   kernel/   DocumentPort —— AI 改动 PPT 的唯一入口（编辑器桥接 / headless 双实现）
//   tools/    中立 ToolDef 注册表 + Vercel / MCP 双适配器（约 90 个编辑工具）
//   chat/     ChatEngine（逐轮 system prompt 组装 + 逐轮事务 + ChatEvent 事件流）
//   generate/ 阶段化生成流水线（deckgen 四层管线 + polish）
//   skills/   builtin + 用户自定义 skill 注册表（frontmatter markdown，按 stage 注入）
//   mcp/      client（对内：builtin 工具组 + 用户远端 HTTP/SSE MCP）
//             server（对外：@sliiu/present-ai/mcp-server 子路径导出，Node-only）
// ---- 配置 -----------------------------------------------------------------
export { AiConfigSchema, TextConfigSchema, ImageConfigSchema, ImageryConfigSchema, TEXT_PROVIDER_KINDS, IMAGE_PROVIDER_KINDS, IMAGE_GEN_CONCURRENCY_MIN, IMAGE_GEN_CONCURRENCY_MAX, IMAGE_GEN_CONCURRENCY_DEFAULT, TEXT_REQUEST_CONCURRENCY_MIN, TEXT_REQUEST_CONCURRENCY_MAX, TEXT_REQUEST_CONCURRENCY_DEFAULT, defaultConfig, parseConfig, parseCustomHeaders, PROVIDER_PRESETS, IMAGE_PROVIDER_PRESETS, getProviderPreset, getImageProviderPreset, resolveTextConfig, resolveImageConfig, applyProxyUrl, clampImageGenConcurrency, clampTextRequestConcurrency, isConfigUsable, textModelSupportsVision, browserConfigStore, envConfigStore, memoryConfigStore, } from "./config/index.js";
// ---- LLM ------------------------------------------------------------------
export { createLlm, generateJson, stripJsonFences, extractLlmUsage, setSystemImageRoute, setSystemTextRoute, isSystemTextRouteActive } from "./llm/index.js";
export { recognizeHandwritingImage, } from "./handwriting.js";
// ---- Kernel（PPT 调用链）----------------------------------------------------
export { createEditorPort, createHeadlessPort } from "./kernel/index.js";
// ---- 工具层 -----------------------------------------------------------------
export { buildEditToolDefs, buildPainterToolDefs, buildEditToolRegistry, ToolRegistry, defineTool, createToolRuntime, toVercelTool, toVercelTools, assertShapeInScope, capabilityTools, paintSummary, textStyleSummary, shapeSummary, slideSummary, } from "./tools/index.js";
// ---- 对话 -------------------------------------------------------------------
export { ChatEngine, sliceChatThroughTurn, chatSystemPrompt, formatTurnScope, summarizeChatTitle, } from "./chat/index.js";
// ---- 生成流水线 --------------------------------------------------------------
export * from "./generate/index.js";
// ---- deckgen v1（四层模型，独立于 generate/ 工具链）---------------------------
export * as deckgen from "./deckgen/index.js";
// ---- 主题 / 字体 / 装饰 / 动画（确定性模块）------------------------------------
export { THEMES, THEME_IDS, THEME_GALLERY_ORDER, THEME_OUTLINE_HINTS, THEME_STYLE_SEEDS, getTheme, realizeGeneratedTheme, injectThemeFonts, buildMastersFromThemeDef, GeneratedThemeSpecSchema, THEME_FONT_FAMILIES, } from "./themes.js";
export { THEME_FONT_POOL, findFontPreset, injectFontCss } from "./fonts/inject.js";
export { ApplyCustomThemeCmd, ApplyThemeCmd, } from "./tools/commands/slide-commands.js";
export { applyAnimationsToSlide, applyBundleTransitionToSlide, autoAnimatePresentation, autoAnimateSlide, clearSlideAnimations, getMotionBundle, isBuiltInMotionBundleId, MAINSTREAM_ANIMATION_GUIDELINES, MAINSTREAM_EFFECT_LIST, MOTION_BUNDLE_IDS, MOTION_BUNDLES, MOTION_SCHEME_CONFIGURABLE_ROLES, MotionSchemeSpecSchema, resolveBundleForPresentation, resolveEffectPreset, synthesizeBundleFromMotionScheme, } from "./animations.js";
// ---- MCP（Model Context Protocol，客户端方向）--------------------------------
//
// 浏览器内 MCP 能力框架：
//   - builtin 工具组（stock-images / stock-fonts / chat-history）—— 基于 ToolDef，
//     受能力开关控制，逐轮合并进对话工具集
//   - 用户自定义 HTTP / SSE 远端 MCP（Capabilities tab 增删改，@ai-sdk/mcp 连接池）
//
// 服务端方向（对外暴露 PPT 编辑）在 "@sliiu/present-ai/mcp-server" 子路径（Node-only）。
export { BUILTIN_TOOL_GROUPS, listServers as listMcpServers, getServerView as getMcpServerView, getEnabledTools as getEnabledMcpTools, setEnabled as setMcpEnabled, toggleEnabled as toggleMcpEnabled, addUserMcpServer, testUserMcpConnection, removeUserMcpServer, reconnectUserMcpServer, getUserMcpToolNames, isUserMcpConnected, loadUserServers as loadUserMcpServers, } from "./mcp/client/registry.js";
// ---- Skills（注入到 system prompt 的命名 / 可开关 / 可用户自定义片段）-----------
//
// 与 MCP 同级的"能力管理"心智：每个 Skill 是带 frontmatter 的 markdown，注入
// 对应 stage（generate / chat / both）的 system prompt。builtin 由仓库内置，
// user skill 由宿主 HostSkillStore 注入。
export { BUILTIN_SKILLS, listSkills, getSkill, isBuiltinSkillId, getEnabledSkillFragments, getEnabledSkillsPromptSection, getEnabledChecklist, getSkillInjectionReport, getKnownStyleFamilyIds, listSkillVisualSystems, listSampleSkills, styleFamilyHint, styleFamilyListLines, setSkillEnabled, toggleSkillEnabled, clearSkillEnabled, } from "./skills/registry.js";
export { parseSkillSections, filterSkillBody, extractChecklistSections } from "./skills/sections.js";
export { lintSkill } from "./skills/lint-fonts.js";
export { parseSkill, stringifySkill, composeRawFromUserInput, SkillSpecSchema, MissingFrontmatterError, SkillParseError, } from "./skills/parse.js";
export { parseStyleFamiliesCsv, formatStyleFamiliesCsv, resolveCustomStyleFamilies, isBuiltinStyleFamilyId, } from "./skills/style-families.js";
export { resolveCustomVisualSystems, syncCustomVisualSystems, stripVisualSystemBlocks, } from "./skills/visual-systems.js";
export { GENERATE_BRIEF_FIELD_IDS, parseBriefFieldsCsv, formatBriefFieldsCsv, resolveRequiredBriefFields, resolveCustomBriefFields, isBriefFieldFilled, isSkillGatedBriefField, isBriefFieldVisibleForGenerate, isGenerateBriefFieldId, } from "./skills/brief-fields.js";
export { classifySourceFile, topicFromSourceName, mediaTypeForKind, } from "./source-files/kinds.js";
export { byteRouteFor, filesNeedingDegrade, unknownSourceNames, responsesAuth, } from "./source-files/support.js";
export { extractSourceText, SourceFileError } from "./source-files/extract.js";
export { resolveSourceDelivery, materialFromParts, SourceDegradeDeclined, } from "./source-files/resolve.js";
export { compositionDigest, SampleDeckError, sampleOutlineRule, sampleDensityRule, sampleCanvasRule, withPageComposition, } from "./generate/sample-composition.js";
export { speechPlanFromOutlineItem } from "./generate/reveal-order.js";
export { layoutsFromTemplate, layoutsFromMasters, presentationFromTemplateOutline, resolveVisualSource, templateUsesPlaceholders, } from "./generate/template-fill.js";
export { ChangeProposalSchema, changeProposalSystemPrompt, changeProposalUserPrompt, applyChangeProposal, digestSlides, } from "./chat/change-proposal.js";
