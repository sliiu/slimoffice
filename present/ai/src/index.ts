// @ppt/ai v2 公共 API。
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
//             server（对外：@ppt/ai/mcp-server 子路径导出，Node-only）

// ---- 配置 -----------------------------------------------------------------
export {
  AiConfigSchema,
  TextConfigSchema,
  ImageConfigSchema,
  ImageryConfigSchema,
  TEXT_PROVIDER_KINDS,
  IMAGE_PROVIDER_KINDS,
  IMAGE_GEN_CONCURRENCY_MIN,
  IMAGE_GEN_CONCURRENCY_MAX,
  IMAGE_GEN_CONCURRENCY_DEFAULT,
  TEXT_REQUEST_CONCURRENCY_MIN,
  TEXT_REQUEST_CONCURRENCY_MAX,
  TEXT_REQUEST_CONCURRENCY_DEFAULT,
  defaultConfig,
  parseConfig,
  parseCustomHeaders,
  PROVIDER_PRESETS,
  IMAGE_PROVIDER_PRESETS,
  getProviderPreset,
  getImageProviderPreset,
  resolveTextConfig,
  resolveImageConfig,
  applyProxyUrl,
  clampImageGenConcurrency,
  clampTextRequestConcurrency,
  isConfigUsable,
  textModelSupportsVision,
  browserConfigStore,
  envConfigStore,
  memoryConfigStore,
  type AiConfig,
  type TextConfig,
  type ImageConfig,
  type ImageryConfig,
  type TextProviderKind,
  type ImageProviderKind,
  type ProviderPreset,
  type ImageProviderPreset,
  type ImageApiKind,
  type ProviderGroup,
  type ConfigStore,
} from "./config";

// ---- LLM ------------------------------------------------------------------
export { createLlm, generateJson, stripJsonFences, extractLlmUsage, setSystemImageRoute, setSystemTextRoute, isSystemTextRouteActive, type LlmClient, type GenerateJsonOptions, type LlmUsage } from "./llm";
export {
  recognizeHandwritingImage,
  type RecognizeHandwritingInput,
} from "./handwriting";

// ---- Kernel（PPT 调用链）----------------------------------------------------
export { createEditorPort, createHeadlessPort, type DocumentPort, type EditorPortOptions } from "./kernel";

// ---- 工具层 -----------------------------------------------------------------
export {
  buildEditToolDefs,
  buildPainterToolDefs,
  buildEditToolRegistry,
  ToolRegistry,
  defineTool,
  createToolRuntime,
  toVercelTool,
  toVercelTools,
  assertShapeInScope,
  capabilityTools,
  paintSummary,
  textStyleSummary,
  shapeSummary,
  slideSummary,
  type ToolDef,
  type ToolTag,
  type ToolResult,
  type ToolRuntime,
  type ToolRuntimeOptions,
  type CapabilityChangedEvent,
} from "./tools";

// ---- 对话 -------------------------------------------------------------------
export {
  ChatEngine,
  sliceChatThroughTurn,
  chatSystemPrompt,
  formatTurnScope,
  summarizeChatTitle,
  type ChatEvent,
  type ChatLogEntry,
  type ChatEngineOptions,
  type SendOptions,
  type SummarizeChatTitleOptions,
  type HostChatStore,
} from "./chat";

// ---- 生成流水线 --------------------------------------------------------------
export * from "./generate";

// ---- deckgen v1（四层模型，独立于 generate/ 工具链）---------------------------
export * as deckgen from "./deckgen";

// ---- 主题 / 字体 / 装饰 / 动画（确定性模块）------------------------------------
export {
  THEMES,
  THEME_IDS,
  THEME_GALLERY_ORDER,
  THEME_OUTLINE_HINTS,
  THEME_STYLE_SEEDS,
  getTheme,
  realizeGeneratedTheme,
  injectThemeFonts,
  buildMastersFromThemeDef,
  GeneratedThemeSpecSchema,
  THEME_FONT_FAMILIES,
  type ThemeDef,
  type ThemeWordArt,
  type ThemeGalleryId,
  type GeneratedThemeSpec,
  type ThemeDecoration,
} from "./themes";
export { THEME_FONT_POOL, findFontPreset, injectFontCss, type ThemeFontPreset } from "./fonts/inject";
export {
  ApplyCustomThemeCmd,
  ApplyThemeCmd,
  type ApplyCustomThemeOpts,
  type ApplyThemeOpts,
} from "./tools/commands/slide-commands";
export {
  applyAnimationsToSlide,
  applyBundleTransitionToSlide,
  autoAnimatePresentation,
  autoAnimateSlide,
  clearSlideAnimations,
  getMotionBundle,
  isBuiltInMotionBundleId,
  MAINSTREAM_ANIMATION_GUIDELINES,
  MAINSTREAM_EFFECT_LIST,
  MOTION_BUNDLE_IDS,
  MOTION_BUNDLES,
  MOTION_SCHEME_CONFIGURABLE_ROLES,
  MotionSchemeSpecSchema,
  resolveBundleForPresentation,
  resolveEffectPreset,
  synthesizeBundleFromMotionScheme,
  type AnimationEffectSpec,
  type AnimRole,
  type AutoAnimateOptions,
  type AutoAnimatePresentationResult,
  type MainstreamEffect,
  type MotionBundle,
  type MotionBundleId,
  type MotionSchemeRole,
  type MotionSchemeSpec,
} from "./animations";

// ---- MCP（Model Context Protocol，客户端方向）--------------------------------
//
// 浏览器内 MCP 能力框架：
//   - builtin 工具组（stock-images / stock-fonts / chat-history）—— 基于 ToolDef，
//     受能力开关控制，逐轮合并进对话工具集
//   - 用户自定义 HTTP / SSE 远端 MCP（Capabilities tab 增删改，@ai-sdk/mcp 连接池）
//
// 服务端方向（对外暴露 PPT 编辑）在 "@ppt/ai/mcp-server" 子路径（Node-only）。
export {
  BUILTIN_TOOL_GROUPS,
  listServers as listMcpServers,
  getServerView as getMcpServerView,
  getEnabledTools as getEnabledMcpTools,
  setEnabled as setMcpEnabled,
  toggleEnabled as toggleMcpEnabled,
  addUserMcpServer,
  testUserMcpConnection,
  removeUserMcpServer,
  reconnectUserMcpServer,
  getUserMcpToolNames,
  isUserMcpConnected,
  loadUserServers as loadUserMcpServers,
} from "./mcp/client/registry";
export type {
  BuiltinToolGroup,
  McpServerView,
  UserMcpConfig,
  ConnectResult as McpConnectResult,
  ConnectError as McpConnectError,
} from "./mcp/client/registry";

// ---- Skills（注入到 system prompt 的命名 / 可开关 / 可用户自定义片段）-----------
//
// 与 MCP 同级的"能力管理"心智：每个 Skill 是带 frontmatter 的 markdown，注入
// 对应 stage（generate / chat / both）的 system prompt。builtin 由仓库内置，
// user skill 由宿主 HostSkillStore 注入。
export {
  BUILTIN_SKILLS,
  listSkills,
  getSkill,
  isBuiltinSkillId,
  getEnabledSkillFragments,
  getEnabledSkillsPromptSection,
  getEnabledChecklist,
  getSkillInjectionReport,
  getKnownStyleFamilyIds,
  listSkillVisualSystems,
  listSampleSkills,
  type SampleSkill,
  styleFamilyHint,
  styleFamilyListLines,
  setSkillEnabled,
  toggleSkillEnabled,
  clearSkillEnabled,
  type SkillInjectionRecord,
  type SkillInjectionStatus,
} from "./skills/registry";
export { parseSkillSections, filterSkillBody, extractChecklistSections } from "./skills/sections";
export { lintSkill, type SkillLintContext } from "./skills/lint-fonts";
export {
  parseSkill,
  stringifySkill,
  composeRawFromUserInput,
  SkillSpecSchema,
  MissingFrontmatterError,
  SkillParseError,
} from "./skills/parse";
export {
  parseStyleFamiliesCsv,
  formatStyleFamiliesCsv,
  resolveCustomStyleFamilies,
  isBuiltinStyleFamilyId,
  type CustomStyleFamilyDef,
} from "./skills/style-families";
export {
  resolveCustomVisualSystems,
  syncCustomVisualSystems,
  stripVisualSystemBlocks,
  type CustomVisualSystemDef,
} from "./skills/visual-systems";
export {
  GENERATE_BRIEF_FIELD_IDS,
  parseBriefFieldsCsv,
  formatBriefFieldsCsv,
  resolveRequiredBriefFields,
  resolveCustomBriefFields,
  isBriefFieldFilled,
  isSkillGatedBriefField,
  isBriefFieldVisibleForGenerate,
  isGenerateBriefFieldId,
  type GenerateBriefFieldId,
  type BriefFieldValues,
  type ResolvedBriefField,
  type ResolvedCustomBriefField,
} from "./skills/brief-fields";
export {
  classifySourceFile,
  topicFromSourceName,
  mediaTypeForKind,
  type IncomingSourceFile,
  type SourceKind,
} from "./source-files/kinds";
export {
  byteRouteFor,
  filesNeedingDegrade,
  unknownSourceNames,
  responsesAuth,
  type ByteRoute,
  type ResponsesAuth,
} from "./source-files/support";
export { extractSourceText, SourceFileError } from "./source-files/extract";
export {
  resolveSourceDelivery,
  materialFromParts,
  SourceDegradeDeclined,
  type ResolvedSources,
} from "./source-files/resolve";
export type { ModelFilePart } from "./source-files/complete";
export {
  compositionDigest,
  SampleDeckError,
  sampleOutlineRule,
  sampleDensityRule,
  sampleCanvasRule,
  withPageComposition,
} from "./generate/sample-composition";
export { speechPlanFromOutlineItem } from "./generate/reveal-order";
export {
  layoutsFromTemplate,
  layoutsFromMasters,
  presentationFromTemplateOutline,
  resolveVisualSource,
  templateUsesPlaceholders,
  type ResolvedVisualSource,
  type TemplateLayoutChoice,
} from "./generate/template-fill";
export {
  ChangeProposalSchema,
  changeProposalSystemPrompt,
  changeProposalUserPrompt,
  applyChangeProposal,
  digestSlides,
  type ChangeProposal,
} from "./chat/change-proposal";
export type {
  SkillSpec,
  SkillDescriptor,
  SkillView,
  SkillStage,
  SkillEnabledState,
  HostSkillStore,
  SkillInjectionContext,
} from "./skills/types";
