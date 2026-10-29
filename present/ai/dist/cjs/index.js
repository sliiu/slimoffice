"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.paintSummary = exports.capabilityTools = exports.assertShapeInScope = exports.toVercelTools = exports.toVercelTool = exports.createToolRuntime = exports.defineTool = exports.ToolRegistry = exports.buildEditToolRegistry = exports.buildPainterToolDefs = exports.buildEditToolDefs = exports.createHeadlessPort = exports.createEditorPort = exports.recognizeHandwritingImage = exports.isSystemTextRouteActive = exports.setSystemTextRoute = exports.setSystemImageRoute = exports.extractLlmUsage = exports.stripJsonFences = exports.generateJson = exports.createLlm = exports.memoryConfigStore = exports.envConfigStore = exports.browserConfigStore = exports.textModelSupportsVision = exports.isConfigUsable = exports.clampTextRequestConcurrency = exports.clampImageGenConcurrency = exports.applyProxyUrl = exports.resolveImageConfig = exports.resolveTextConfig = exports.getImageProviderPreset = exports.getProviderPreset = exports.IMAGE_PROVIDER_PRESETS = exports.PROVIDER_PRESETS = exports.parseCustomHeaders = exports.parseConfig = exports.defaultConfig = exports.TEXT_REQUEST_CONCURRENCY_DEFAULT = exports.TEXT_REQUEST_CONCURRENCY_MAX = exports.TEXT_REQUEST_CONCURRENCY_MIN = exports.IMAGE_GEN_CONCURRENCY_DEFAULT = exports.IMAGE_GEN_CONCURRENCY_MAX = exports.IMAGE_GEN_CONCURRENCY_MIN = exports.IMAGE_PROVIDER_KINDS = exports.TEXT_PROVIDER_KINDS = exports.ImageryConfigSchema = exports.ImageConfigSchema = exports.TextConfigSchema = exports.AiConfigSchema = void 0;
exports.removeUserMcpServer = exports.testUserMcpConnection = exports.addUserMcpServer = exports.toggleMcpEnabled = exports.setMcpEnabled = exports.getEnabledMcpTools = exports.getMcpServerView = exports.listMcpServers = exports.BUILTIN_TOOL_GROUPS = exports.synthesizeBundleFromMotionScheme = exports.resolveEffectPreset = exports.resolveBundleForPresentation = exports.MotionSchemeSpecSchema = exports.MOTION_SCHEME_CONFIGURABLE_ROLES = exports.MOTION_BUNDLES = exports.MOTION_BUNDLE_IDS = exports.MAINSTREAM_EFFECT_LIST = exports.MAINSTREAM_ANIMATION_GUIDELINES = exports.isBuiltInMotionBundleId = exports.getMotionBundle = exports.clearSlideAnimations = exports.autoAnimateSlide = exports.autoAnimatePresentation = exports.applyBundleTransitionToSlide = exports.applyAnimationsToSlide = exports.ApplyThemeCmd = exports.ApplyCustomThemeCmd = exports.injectFontCss = exports.findFontPreset = exports.THEME_FONT_POOL = exports.THEME_FONT_FAMILIES = exports.GeneratedThemeSpecSchema = exports.buildMastersFromThemeDef = exports.injectThemeFonts = exports.realizeGeneratedTheme = exports.getTheme = exports.THEME_STYLE_SEEDS = exports.THEME_OUTLINE_HINTS = exports.THEME_GALLERY_ORDER = exports.THEME_IDS = exports.THEMES = exports.deckgen = exports.summarizeChatTitle = exports.formatTurnScope = exports.chatSystemPrompt = exports.sliceChatThroughTurn = exports.ChatEngine = exports.slideSummary = exports.shapeSummary = exports.textStyleSummary = void 0;
exports.byteRouteFor = exports.mediaTypeForKind = exports.topicFromSourceName = exports.classifySourceFile = exports.isGenerateBriefFieldId = exports.isBriefFieldVisibleForGenerate = exports.isSkillGatedBriefField = exports.isBriefFieldFilled = exports.resolveCustomBriefFields = exports.resolveRequiredBriefFields = exports.formatBriefFieldsCsv = exports.parseBriefFieldsCsv = exports.GENERATE_BRIEF_FIELD_IDS = exports.stripVisualSystemBlocks = exports.syncCustomVisualSystems = exports.resolveCustomVisualSystems = exports.isBuiltinStyleFamilyId = exports.resolveCustomStyleFamilies = exports.formatStyleFamiliesCsv = exports.parseStyleFamiliesCsv = exports.SkillParseError = exports.MissingFrontmatterError = exports.SkillSpecSchema = exports.composeRawFromUserInput = exports.stringifySkill = exports.parseSkill = exports.lintSkill = exports.extractChecklistSections = exports.filterSkillBody = exports.parseSkillSections = exports.clearSkillEnabled = exports.toggleSkillEnabled = exports.setSkillEnabled = exports.styleFamilyListLines = exports.styleFamilyHint = exports.listSampleSkills = exports.listSkillVisualSystems = exports.getKnownStyleFamilyIds = exports.getSkillInjectionReport = exports.getEnabledChecklist = exports.getEnabledSkillsPromptSection = exports.getEnabledSkillFragments = exports.isBuiltinSkillId = exports.getSkill = exports.listSkills = exports.BUILTIN_SKILLS = exports.loadUserMcpServers = exports.isUserMcpConnected = exports.getUserMcpToolNames = exports.reconnectUserMcpServer = void 0;
exports.digestSlides = exports.applyChangeProposal = exports.changeProposalUserPrompt = exports.changeProposalSystemPrompt = exports.ChangeProposalSchema = exports.templateUsesPlaceholders = exports.resolveVisualSource = exports.presentationFromTemplateOutline = exports.layoutsFromMasters = exports.layoutsFromTemplate = exports.speechPlanFromOutlineItem = exports.withPageComposition = exports.sampleCanvasRule = exports.sampleDensityRule = exports.sampleOutlineRule = exports.SampleDeckError = exports.compositionDigest = exports.SourceDegradeDeclined = exports.materialFromParts = exports.resolveSourceDelivery = exports.SourceFileError = exports.extractSourceText = exports.responsesAuth = exports.unknownSourceNames = exports.filesNeedingDegrade = void 0;
// ---- 配置 -----------------------------------------------------------------
var config_1 = require("./config");
Object.defineProperty(exports, "AiConfigSchema", { enumerable: true, get: function () { return config_1.AiConfigSchema; } });
Object.defineProperty(exports, "TextConfigSchema", { enumerable: true, get: function () { return config_1.TextConfigSchema; } });
Object.defineProperty(exports, "ImageConfigSchema", { enumerable: true, get: function () { return config_1.ImageConfigSchema; } });
Object.defineProperty(exports, "ImageryConfigSchema", { enumerable: true, get: function () { return config_1.ImageryConfigSchema; } });
Object.defineProperty(exports, "TEXT_PROVIDER_KINDS", { enumerable: true, get: function () { return config_1.TEXT_PROVIDER_KINDS; } });
Object.defineProperty(exports, "IMAGE_PROVIDER_KINDS", { enumerable: true, get: function () { return config_1.IMAGE_PROVIDER_KINDS; } });
Object.defineProperty(exports, "IMAGE_GEN_CONCURRENCY_MIN", { enumerable: true, get: function () { return config_1.IMAGE_GEN_CONCURRENCY_MIN; } });
Object.defineProperty(exports, "IMAGE_GEN_CONCURRENCY_MAX", { enumerable: true, get: function () { return config_1.IMAGE_GEN_CONCURRENCY_MAX; } });
Object.defineProperty(exports, "IMAGE_GEN_CONCURRENCY_DEFAULT", { enumerable: true, get: function () { return config_1.IMAGE_GEN_CONCURRENCY_DEFAULT; } });
Object.defineProperty(exports, "TEXT_REQUEST_CONCURRENCY_MIN", { enumerable: true, get: function () { return config_1.TEXT_REQUEST_CONCURRENCY_MIN; } });
Object.defineProperty(exports, "TEXT_REQUEST_CONCURRENCY_MAX", { enumerable: true, get: function () { return config_1.TEXT_REQUEST_CONCURRENCY_MAX; } });
Object.defineProperty(exports, "TEXT_REQUEST_CONCURRENCY_DEFAULT", { enumerable: true, get: function () { return config_1.TEXT_REQUEST_CONCURRENCY_DEFAULT; } });
Object.defineProperty(exports, "defaultConfig", { enumerable: true, get: function () { return config_1.defaultConfig; } });
Object.defineProperty(exports, "parseConfig", { enumerable: true, get: function () { return config_1.parseConfig; } });
Object.defineProperty(exports, "parseCustomHeaders", { enumerable: true, get: function () { return config_1.parseCustomHeaders; } });
Object.defineProperty(exports, "PROVIDER_PRESETS", { enumerable: true, get: function () { return config_1.PROVIDER_PRESETS; } });
Object.defineProperty(exports, "IMAGE_PROVIDER_PRESETS", { enumerable: true, get: function () { return config_1.IMAGE_PROVIDER_PRESETS; } });
Object.defineProperty(exports, "getProviderPreset", { enumerable: true, get: function () { return config_1.getProviderPreset; } });
Object.defineProperty(exports, "getImageProviderPreset", { enumerable: true, get: function () { return config_1.getImageProviderPreset; } });
Object.defineProperty(exports, "resolveTextConfig", { enumerable: true, get: function () { return config_1.resolveTextConfig; } });
Object.defineProperty(exports, "resolveImageConfig", { enumerable: true, get: function () { return config_1.resolveImageConfig; } });
Object.defineProperty(exports, "applyProxyUrl", { enumerable: true, get: function () { return config_1.applyProxyUrl; } });
Object.defineProperty(exports, "clampImageGenConcurrency", { enumerable: true, get: function () { return config_1.clampImageGenConcurrency; } });
Object.defineProperty(exports, "clampTextRequestConcurrency", { enumerable: true, get: function () { return config_1.clampTextRequestConcurrency; } });
Object.defineProperty(exports, "isConfigUsable", { enumerable: true, get: function () { return config_1.isConfigUsable; } });
Object.defineProperty(exports, "textModelSupportsVision", { enumerable: true, get: function () { return config_1.textModelSupportsVision; } });
Object.defineProperty(exports, "browserConfigStore", { enumerable: true, get: function () { return config_1.browserConfigStore; } });
Object.defineProperty(exports, "envConfigStore", { enumerable: true, get: function () { return config_1.envConfigStore; } });
Object.defineProperty(exports, "memoryConfigStore", { enumerable: true, get: function () { return config_1.memoryConfigStore; } });
// ---- LLM ------------------------------------------------------------------
var llm_1 = require("./llm");
Object.defineProperty(exports, "createLlm", { enumerable: true, get: function () { return llm_1.createLlm; } });
Object.defineProperty(exports, "generateJson", { enumerable: true, get: function () { return llm_1.generateJson; } });
Object.defineProperty(exports, "stripJsonFences", { enumerable: true, get: function () { return llm_1.stripJsonFences; } });
Object.defineProperty(exports, "extractLlmUsage", { enumerable: true, get: function () { return llm_1.extractLlmUsage; } });
Object.defineProperty(exports, "setSystemImageRoute", { enumerable: true, get: function () { return llm_1.setSystemImageRoute; } });
Object.defineProperty(exports, "setSystemTextRoute", { enumerable: true, get: function () { return llm_1.setSystemTextRoute; } });
Object.defineProperty(exports, "isSystemTextRouteActive", { enumerable: true, get: function () { return llm_1.isSystemTextRouteActive; } });
var handwriting_1 = require("./handwriting");
Object.defineProperty(exports, "recognizeHandwritingImage", { enumerable: true, get: function () { return handwriting_1.recognizeHandwritingImage; } });
// ---- Kernel（PPT 调用链）----------------------------------------------------
var kernel_1 = require("./kernel");
Object.defineProperty(exports, "createEditorPort", { enumerable: true, get: function () { return kernel_1.createEditorPort; } });
Object.defineProperty(exports, "createHeadlessPort", { enumerable: true, get: function () { return kernel_1.createHeadlessPort; } });
// ---- 工具层 -----------------------------------------------------------------
var tools_1 = require("./tools");
Object.defineProperty(exports, "buildEditToolDefs", { enumerable: true, get: function () { return tools_1.buildEditToolDefs; } });
Object.defineProperty(exports, "buildPainterToolDefs", { enumerable: true, get: function () { return tools_1.buildPainterToolDefs; } });
Object.defineProperty(exports, "buildEditToolRegistry", { enumerable: true, get: function () { return tools_1.buildEditToolRegistry; } });
Object.defineProperty(exports, "ToolRegistry", { enumerable: true, get: function () { return tools_1.ToolRegistry; } });
Object.defineProperty(exports, "defineTool", { enumerable: true, get: function () { return tools_1.defineTool; } });
Object.defineProperty(exports, "createToolRuntime", { enumerable: true, get: function () { return tools_1.createToolRuntime; } });
Object.defineProperty(exports, "toVercelTool", { enumerable: true, get: function () { return tools_1.toVercelTool; } });
Object.defineProperty(exports, "toVercelTools", { enumerable: true, get: function () { return tools_1.toVercelTools; } });
Object.defineProperty(exports, "assertShapeInScope", { enumerable: true, get: function () { return tools_1.assertShapeInScope; } });
Object.defineProperty(exports, "capabilityTools", { enumerable: true, get: function () { return tools_1.capabilityTools; } });
Object.defineProperty(exports, "paintSummary", { enumerable: true, get: function () { return tools_1.paintSummary; } });
Object.defineProperty(exports, "textStyleSummary", { enumerable: true, get: function () { return tools_1.textStyleSummary; } });
Object.defineProperty(exports, "shapeSummary", { enumerable: true, get: function () { return tools_1.shapeSummary; } });
Object.defineProperty(exports, "slideSummary", { enumerable: true, get: function () { return tools_1.slideSummary; } });
// ---- 对话 -------------------------------------------------------------------
var chat_1 = require("./chat");
Object.defineProperty(exports, "ChatEngine", { enumerable: true, get: function () { return chat_1.ChatEngine; } });
Object.defineProperty(exports, "sliceChatThroughTurn", { enumerable: true, get: function () { return chat_1.sliceChatThroughTurn; } });
Object.defineProperty(exports, "chatSystemPrompt", { enumerable: true, get: function () { return chat_1.chatSystemPrompt; } });
Object.defineProperty(exports, "formatTurnScope", { enumerable: true, get: function () { return chat_1.formatTurnScope; } });
Object.defineProperty(exports, "summarizeChatTitle", { enumerable: true, get: function () { return chat_1.summarizeChatTitle; } });
// ---- 生成流水线 --------------------------------------------------------------
__exportStar(require("./generate"), exports);
// ---- deckgen v1（四层模型，独立于 generate/ 工具链）---------------------------
exports.deckgen = __importStar(require("./deckgen"));
// ---- 主题 / 字体 / 装饰 / 动画（确定性模块）------------------------------------
var themes_1 = require("./themes");
Object.defineProperty(exports, "THEMES", { enumerable: true, get: function () { return themes_1.THEMES; } });
Object.defineProperty(exports, "THEME_IDS", { enumerable: true, get: function () { return themes_1.THEME_IDS; } });
Object.defineProperty(exports, "THEME_GALLERY_ORDER", { enumerable: true, get: function () { return themes_1.THEME_GALLERY_ORDER; } });
Object.defineProperty(exports, "THEME_OUTLINE_HINTS", { enumerable: true, get: function () { return themes_1.THEME_OUTLINE_HINTS; } });
Object.defineProperty(exports, "THEME_STYLE_SEEDS", { enumerable: true, get: function () { return themes_1.THEME_STYLE_SEEDS; } });
Object.defineProperty(exports, "getTheme", { enumerable: true, get: function () { return themes_1.getTheme; } });
Object.defineProperty(exports, "realizeGeneratedTheme", { enumerable: true, get: function () { return themes_1.realizeGeneratedTheme; } });
Object.defineProperty(exports, "injectThemeFonts", { enumerable: true, get: function () { return themes_1.injectThemeFonts; } });
Object.defineProperty(exports, "buildMastersFromThemeDef", { enumerable: true, get: function () { return themes_1.buildMastersFromThemeDef; } });
Object.defineProperty(exports, "GeneratedThemeSpecSchema", { enumerable: true, get: function () { return themes_1.GeneratedThemeSpecSchema; } });
Object.defineProperty(exports, "THEME_FONT_FAMILIES", { enumerable: true, get: function () { return themes_1.THEME_FONT_FAMILIES; } });
var inject_1 = require("./fonts/inject");
Object.defineProperty(exports, "THEME_FONT_POOL", { enumerable: true, get: function () { return inject_1.THEME_FONT_POOL; } });
Object.defineProperty(exports, "findFontPreset", { enumerable: true, get: function () { return inject_1.findFontPreset; } });
Object.defineProperty(exports, "injectFontCss", { enumerable: true, get: function () { return inject_1.injectFontCss; } });
var slide_commands_1 = require("./tools/commands/slide-commands");
Object.defineProperty(exports, "ApplyCustomThemeCmd", { enumerable: true, get: function () { return slide_commands_1.ApplyCustomThemeCmd; } });
Object.defineProperty(exports, "ApplyThemeCmd", { enumerable: true, get: function () { return slide_commands_1.ApplyThemeCmd; } });
var animations_1 = require("./animations");
Object.defineProperty(exports, "applyAnimationsToSlide", { enumerable: true, get: function () { return animations_1.applyAnimationsToSlide; } });
Object.defineProperty(exports, "applyBundleTransitionToSlide", { enumerable: true, get: function () { return animations_1.applyBundleTransitionToSlide; } });
Object.defineProperty(exports, "autoAnimatePresentation", { enumerable: true, get: function () { return animations_1.autoAnimatePresentation; } });
Object.defineProperty(exports, "autoAnimateSlide", { enumerable: true, get: function () { return animations_1.autoAnimateSlide; } });
Object.defineProperty(exports, "clearSlideAnimations", { enumerable: true, get: function () { return animations_1.clearSlideAnimations; } });
Object.defineProperty(exports, "getMotionBundle", { enumerable: true, get: function () { return animations_1.getMotionBundle; } });
Object.defineProperty(exports, "isBuiltInMotionBundleId", { enumerable: true, get: function () { return animations_1.isBuiltInMotionBundleId; } });
Object.defineProperty(exports, "MAINSTREAM_ANIMATION_GUIDELINES", { enumerable: true, get: function () { return animations_1.MAINSTREAM_ANIMATION_GUIDELINES; } });
Object.defineProperty(exports, "MAINSTREAM_EFFECT_LIST", { enumerable: true, get: function () { return animations_1.MAINSTREAM_EFFECT_LIST; } });
Object.defineProperty(exports, "MOTION_BUNDLE_IDS", { enumerable: true, get: function () { return animations_1.MOTION_BUNDLE_IDS; } });
Object.defineProperty(exports, "MOTION_BUNDLES", { enumerable: true, get: function () { return animations_1.MOTION_BUNDLES; } });
Object.defineProperty(exports, "MOTION_SCHEME_CONFIGURABLE_ROLES", { enumerable: true, get: function () { return animations_1.MOTION_SCHEME_CONFIGURABLE_ROLES; } });
Object.defineProperty(exports, "MotionSchemeSpecSchema", { enumerable: true, get: function () { return animations_1.MotionSchemeSpecSchema; } });
Object.defineProperty(exports, "resolveBundleForPresentation", { enumerable: true, get: function () { return animations_1.resolveBundleForPresentation; } });
Object.defineProperty(exports, "resolveEffectPreset", { enumerable: true, get: function () { return animations_1.resolveEffectPreset; } });
Object.defineProperty(exports, "synthesizeBundleFromMotionScheme", { enumerable: true, get: function () { return animations_1.synthesizeBundleFromMotionScheme; } });
// ---- MCP（Model Context Protocol，客户端方向）--------------------------------
//
// 浏览器内 MCP 能力框架：
//   - builtin 工具组（stock-images / stock-fonts / chat-history）—— 基于 ToolDef，
//     受能力开关控制，逐轮合并进对话工具集
//   - 用户自定义 HTTP / SSE 远端 MCP（Capabilities tab 增删改，@ai-sdk/mcp 连接池）
//
// 服务端方向（对外暴露 PPT 编辑）在 "@sliiu/present-ai/mcp-server" 子路径（Node-only）。
var registry_1 = require("./mcp/client/registry");
Object.defineProperty(exports, "BUILTIN_TOOL_GROUPS", { enumerable: true, get: function () { return registry_1.BUILTIN_TOOL_GROUPS; } });
Object.defineProperty(exports, "listMcpServers", { enumerable: true, get: function () { return registry_1.listServers; } });
Object.defineProperty(exports, "getMcpServerView", { enumerable: true, get: function () { return registry_1.getServerView; } });
Object.defineProperty(exports, "getEnabledMcpTools", { enumerable: true, get: function () { return registry_1.getEnabledTools; } });
Object.defineProperty(exports, "setMcpEnabled", { enumerable: true, get: function () { return registry_1.setEnabled; } });
Object.defineProperty(exports, "toggleMcpEnabled", { enumerable: true, get: function () { return registry_1.toggleEnabled; } });
Object.defineProperty(exports, "addUserMcpServer", { enumerable: true, get: function () { return registry_1.addUserMcpServer; } });
Object.defineProperty(exports, "testUserMcpConnection", { enumerable: true, get: function () { return registry_1.testUserMcpConnection; } });
Object.defineProperty(exports, "removeUserMcpServer", { enumerable: true, get: function () { return registry_1.removeUserMcpServer; } });
Object.defineProperty(exports, "reconnectUserMcpServer", { enumerable: true, get: function () { return registry_1.reconnectUserMcpServer; } });
Object.defineProperty(exports, "getUserMcpToolNames", { enumerable: true, get: function () { return registry_1.getUserMcpToolNames; } });
Object.defineProperty(exports, "isUserMcpConnected", { enumerable: true, get: function () { return registry_1.isUserMcpConnected; } });
Object.defineProperty(exports, "loadUserMcpServers", { enumerable: true, get: function () { return registry_1.loadUserServers; } });
// ---- Skills（注入到 system prompt 的命名 / 可开关 / 可用户自定义片段）-----------
//
// 与 MCP 同级的"能力管理"心智：每个 Skill 是带 frontmatter 的 markdown，注入
// 对应 stage（generate / chat / both）的 system prompt。builtin 由仓库内置，
// user skill 由宿主 HostSkillStore 注入。
var registry_2 = require("./skills/registry");
Object.defineProperty(exports, "BUILTIN_SKILLS", { enumerable: true, get: function () { return registry_2.BUILTIN_SKILLS; } });
Object.defineProperty(exports, "listSkills", { enumerable: true, get: function () { return registry_2.listSkills; } });
Object.defineProperty(exports, "getSkill", { enumerable: true, get: function () { return registry_2.getSkill; } });
Object.defineProperty(exports, "isBuiltinSkillId", { enumerable: true, get: function () { return registry_2.isBuiltinSkillId; } });
Object.defineProperty(exports, "getEnabledSkillFragments", { enumerable: true, get: function () { return registry_2.getEnabledSkillFragments; } });
Object.defineProperty(exports, "getEnabledSkillsPromptSection", { enumerable: true, get: function () { return registry_2.getEnabledSkillsPromptSection; } });
Object.defineProperty(exports, "getEnabledChecklist", { enumerable: true, get: function () { return registry_2.getEnabledChecklist; } });
Object.defineProperty(exports, "getSkillInjectionReport", { enumerable: true, get: function () { return registry_2.getSkillInjectionReport; } });
Object.defineProperty(exports, "getKnownStyleFamilyIds", { enumerable: true, get: function () { return registry_2.getKnownStyleFamilyIds; } });
Object.defineProperty(exports, "listSkillVisualSystems", { enumerable: true, get: function () { return registry_2.listSkillVisualSystems; } });
Object.defineProperty(exports, "listSampleSkills", { enumerable: true, get: function () { return registry_2.listSampleSkills; } });
Object.defineProperty(exports, "styleFamilyHint", { enumerable: true, get: function () { return registry_2.styleFamilyHint; } });
Object.defineProperty(exports, "styleFamilyListLines", { enumerable: true, get: function () { return registry_2.styleFamilyListLines; } });
Object.defineProperty(exports, "setSkillEnabled", { enumerable: true, get: function () { return registry_2.setSkillEnabled; } });
Object.defineProperty(exports, "toggleSkillEnabled", { enumerable: true, get: function () { return registry_2.toggleSkillEnabled; } });
Object.defineProperty(exports, "clearSkillEnabled", { enumerable: true, get: function () { return registry_2.clearSkillEnabled; } });
var sections_1 = require("./skills/sections");
Object.defineProperty(exports, "parseSkillSections", { enumerable: true, get: function () { return sections_1.parseSkillSections; } });
Object.defineProperty(exports, "filterSkillBody", { enumerable: true, get: function () { return sections_1.filterSkillBody; } });
Object.defineProperty(exports, "extractChecklistSections", { enumerable: true, get: function () { return sections_1.extractChecklistSections; } });
var lint_fonts_1 = require("./skills/lint-fonts");
Object.defineProperty(exports, "lintSkill", { enumerable: true, get: function () { return lint_fonts_1.lintSkill; } });
var parse_1 = require("./skills/parse");
Object.defineProperty(exports, "parseSkill", { enumerable: true, get: function () { return parse_1.parseSkill; } });
Object.defineProperty(exports, "stringifySkill", { enumerable: true, get: function () { return parse_1.stringifySkill; } });
Object.defineProperty(exports, "composeRawFromUserInput", { enumerable: true, get: function () { return parse_1.composeRawFromUserInput; } });
Object.defineProperty(exports, "SkillSpecSchema", { enumerable: true, get: function () { return parse_1.SkillSpecSchema; } });
Object.defineProperty(exports, "MissingFrontmatterError", { enumerable: true, get: function () { return parse_1.MissingFrontmatterError; } });
Object.defineProperty(exports, "SkillParseError", { enumerable: true, get: function () { return parse_1.SkillParseError; } });
var style_families_1 = require("./skills/style-families");
Object.defineProperty(exports, "parseStyleFamiliesCsv", { enumerable: true, get: function () { return style_families_1.parseStyleFamiliesCsv; } });
Object.defineProperty(exports, "formatStyleFamiliesCsv", { enumerable: true, get: function () { return style_families_1.formatStyleFamiliesCsv; } });
Object.defineProperty(exports, "resolveCustomStyleFamilies", { enumerable: true, get: function () { return style_families_1.resolveCustomStyleFamilies; } });
Object.defineProperty(exports, "isBuiltinStyleFamilyId", { enumerable: true, get: function () { return style_families_1.isBuiltinStyleFamilyId; } });
var visual_systems_1 = require("./skills/visual-systems");
Object.defineProperty(exports, "resolveCustomVisualSystems", { enumerable: true, get: function () { return visual_systems_1.resolveCustomVisualSystems; } });
Object.defineProperty(exports, "syncCustomVisualSystems", { enumerable: true, get: function () { return visual_systems_1.syncCustomVisualSystems; } });
Object.defineProperty(exports, "stripVisualSystemBlocks", { enumerable: true, get: function () { return visual_systems_1.stripVisualSystemBlocks; } });
var brief_fields_1 = require("./skills/brief-fields");
Object.defineProperty(exports, "GENERATE_BRIEF_FIELD_IDS", { enumerable: true, get: function () { return brief_fields_1.GENERATE_BRIEF_FIELD_IDS; } });
Object.defineProperty(exports, "parseBriefFieldsCsv", { enumerable: true, get: function () { return brief_fields_1.parseBriefFieldsCsv; } });
Object.defineProperty(exports, "formatBriefFieldsCsv", { enumerable: true, get: function () { return brief_fields_1.formatBriefFieldsCsv; } });
Object.defineProperty(exports, "resolveRequiredBriefFields", { enumerable: true, get: function () { return brief_fields_1.resolveRequiredBriefFields; } });
Object.defineProperty(exports, "resolveCustomBriefFields", { enumerable: true, get: function () { return brief_fields_1.resolveCustomBriefFields; } });
Object.defineProperty(exports, "isBriefFieldFilled", { enumerable: true, get: function () { return brief_fields_1.isBriefFieldFilled; } });
Object.defineProperty(exports, "isSkillGatedBriefField", { enumerable: true, get: function () { return brief_fields_1.isSkillGatedBriefField; } });
Object.defineProperty(exports, "isBriefFieldVisibleForGenerate", { enumerable: true, get: function () { return brief_fields_1.isBriefFieldVisibleForGenerate; } });
Object.defineProperty(exports, "isGenerateBriefFieldId", { enumerable: true, get: function () { return brief_fields_1.isGenerateBriefFieldId; } });
var kinds_1 = require("./source-files/kinds");
Object.defineProperty(exports, "classifySourceFile", { enumerable: true, get: function () { return kinds_1.classifySourceFile; } });
Object.defineProperty(exports, "topicFromSourceName", { enumerable: true, get: function () { return kinds_1.topicFromSourceName; } });
Object.defineProperty(exports, "mediaTypeForKind", { enumerable: true, get: function () { return kinds_1.mediaTypeForKind; } });
var support_1 = require("./source-files/support");
Object.defineProperty(exports, "byteRouteFor", { enumerable: true, get: function () { return support_1.byteRouteFor; } });
Object.defineProperty(exports, "filesNeedingDegrade", { enumerable: true, get: function () { return support_1.filesNeedingDegrade; } });
Object.defineProperty(exports, "unknownSourceNames", { enumerable: true, get: function () { return support_1.unknownSourceNames; } });
Object.defineProperty(exports, "responsesAuth", { enumerable: true, get: function () { return support_1.responsesAuth; } });
var extract_1 = require("./source-files/extract");
Object.defineProperty(exports, "extractSourceText", { enumerable: true, get: function () { return extract_1.extractSourceText; } });
Object.defineProperty(exports, "SourceFileError", { enumerable: true, get: function () { return extract_1.SourceFileError; } });
var resolve_1 = require("./source-files/resolve");
Object.defineProperty(exports, "resolveSourceDelivery", { enumerable: true, get: function () { return resolve_1.resolveSourceDelivery; } });
Object.defineProperty(exports, "materialFromParts", { enumerable: true, get: function () { return resolve_1.materialFromParts; } });
Object.defineProperty(exports, "SourceDegradeDeclined", { enumerable: true, get: function () { return resolve_1.SourceDegradeDeclined; } });
var sample_composition_1 = require("./generate/sample-composition");
Object.defineProperty(exports, "compositionDigest", { enumerable: true, get: function () { return sample_composition_1.compositionDigest; } });
Object.defineProperty(exports, "SampleDeckError", { enumerable: true, get: function () { return sample_composition_1.SampleDeckError; } });
Object.defineProperty(exports, "sampleOutlineRule", { enumerable: true, get: function () { return sample_composition_1.sampleOutlineRule; } });
Object.defineProperty(exports, "sampleDensityRule", { enumerable: true, get: function () { return sample_composition_1.sampleDensityRule; } });
Object.defineProperty(exports, "sampleCanvasRule", { enumerable: true, get: function () { return sample_composition_1.sampleCanvasRule; } });
Object.defineProperty(exports, "withPageComposition", { enumerable: true, get: function () { return sample_composition_1.withPageComposition; } });
var reveal_order_1 = require("./generate/reveal-order");
Object.defineProperty(exports, "speechPlanFromOutlineItem", { enumerable: true, get: function () { return reveal_order_1.speechPlanFromOutlineItem; } });
var template_fill_1 = require("./generate/template-fill");
Object.defineProperty(exports, "layoutsFromTemplate", { enumerable: true, get: function () { return template_fill_1.layoutsFromTemplate; } });
Object.defineProperty(exports, "layoutsFromMasters", { enumerable: true, get: function () { return template_fill_1.layoutsFromMasters; } });
Object.defineProperty(exports, "presentationFromTemplateOutline", { enumerable: true, get: function () { return template_fill_1.presentationFromTemplateOutline; } });
Object.defineProperty(exports, "resolveVisualSource", { enumerable: true, get: function () { return template_fill_1.resolveVisualSource; } });
Object.defineProperty(exports, "templateUsesPlaceholders", { enumerable: true, get: function () { return template_fill_1.templateUsesPlaceholders; } });
var change_proposal_1 = require("./chat/change-proposal");
Object.defineProperty(exports, "ChangeProposalSchema", { enumerable: true, get: function () { return change_proposal_1.ChangeProposalSchema; } });
Object.defineProperty(exports, "changeProposalSystemPrompt", { enumerable: true, get: function () { return change_proposal_1.changeProposalSystemPrompt; } });
Object.defineProperty(exports, "changeProposalUserPrompt", { enumerable: true, get: function () { return change_proposal_1.changeProposalUserPrompt; } });
Object.defineProperty(exports, "applyChangeProposal", { enumerable: true, get: function () { return change_proposal_1.applyChangeProposal; } });
Object.defineProperty(exports, "digestSlides", { enumerable: true, get: function () { return change_proposal_1.digestSlides; } });
