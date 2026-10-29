"use strict";
// 工具层入口：内置编辑工具全集 + 注册表 / 适配器 / 类型再导出。
//
// 消费方：
//   - chat/engine.ts    → buildEditToolDefs() + toVercelTools() 组装对话工具集
//   - mcp/server        → buildEditToolDefs() 直接注册为 MCP tools（对外暴露编辑能力）
//
// capability 工具（list_capabilities 等）不在 buildEditToolDefs 里 —— 由 chat
// 组装层单独最后合并（保证不被 MCP shadow），MCP server 也不暴露它们。
Object.defineProperty(exports, "__esModule", { value: true });
exports.capabilityTools = exports.findShapeDeep = exports.elideUrlForSummary = exports.slideSummary = exports.shapeSummary = exports.textStyleSummary = exports.paintSummary = exports.extractShapeTarget = exports.assertShapeInScope = exports.toVercelTools = exports.toVercelTool = exports.err = exports.ok = exports.createToolRuntime = exports.defineTool = exports.ToolRegistry = void 0;
exports.buildEditToolDefs = buildEditToolDefs;
exports.buildPainterToolDefs = buildPainterToolDefs;
exports.buildEditToolRegistry = buildEditToolRegistry;
const registry_1 = require("./registry");
const read_1 = require("./domains/read");
const slides_1 = require("./domains/slides");
const shapes_basic_1 = require("./domains/shapes-basic");
const shapes_1 = require("./domains/shapes");
const text_1 = require("./domains/text");
const tables_1 = require("./domains/tables");
const charts_1 = require("./domains/charts");
const effects_1 = require("./domains/effects");
const wordart_1 = require("./domains/wordart");
const masters_1 = require("./domains/masters");
const animations_basic_1 = require("./domains/animations-basic");
const animation_edit_1 = require("./domains/animation-edit");
const images_1 = require("./domains/images");
const theme_1 = require("./domains/theme");
const motion_1 = require("./domains/motion");
const embeds_1 = require("./domains/embeds");
const comments_1 = require("./domains/comments");
const smartart_1 = require("./domains/smartart");
const fonts_1 = require("./domains/fonts");
const protection_1 = require("./domains/protection");
const agenda_1 = require("./domains/agenda");
const icons_1 = require("./domains/icons");
const stock_fonts_1 = require("../mcp/client/builtin/stock-fonts");
const PAINTER_TOOL_NAMES = new Set([
    "insertTextBox",
    "insertShape",
    "replaceShapeText",
    "setShapeTextStyle",
    "setShapeAlignment",
    "moveShape",
    "deleteShape",
    "reorderShape",
    "setShapeOpacity",
    "setSlideNotes",
    "renameSlide",
    "setTextBody",
    "insertChart",
    "convertToSmartArt",
    "insertWordArt",
    "insertIcon",
    "searchIcons",
]);
/** 内置编辑工具全集（不含 capability 管理工具）。 */
function buildEditToolDefs() {
    return [
        ...read_1.readTools,
        ...slides_1.slideTools,
        ...shapes_basic_1.shapeBasicTools,
        ...shapes_1.shapeTools,
        ...text_1.textTools,
        ...tables_1.tableTools,
        ...charts_1.chartTools,
        ...effects_1.effectTools,
        ...wordart_1.wordArtTools,
        ...masters_1.masterTools,
        ...animations_basic_1.animationBasicTools,
        ...animation_edit_1.animationEditTools,
        ...images_1.imageTools,
        ...theme_1.themeTools,
        ...motion_1.motionTools,
        ...embeds_1.embedTools,
        ...comments_1.commentTools,
        ...smartart_1.smartArtTools,
        ...fonts_1.fontTools,
        ...protection_1.protectionTools,
        ...agenda_1.agendaTools,
        ...icons_1.iconTools,
    ];
}
/** 生成 polish 专用子集。extra 可并入额外工具名。 */
function buildPainterToolDefs(extra = []) {
    const names = extra.length ? new Set([...PAINTER_TOOL_NAMES, ...extra]) : PAINTER_TOOL_NAMES;
    return [...buildEditToolDefs(), ...stock_fonts_1.stockFontsGroup.tools].filter((t) => names.has(t.name));
}
/** 组装成注册表（重名在 register 时抛错，防止两个域撞名）。 */
function buildEditToolRegistry() {
    return new registry_1.ToolRegistry().register(buildEditToolDefs());
}
var registry_2 = require("./registry");
Object.defineProperty(exports, "ToolRegistry", { enumerable: true, get: function () { return registry_2.ToolRegistry; } });
var types_1 = require("./types");
Object.defineProperty(exports, "defineTool", { enumerable: true, get: function () { return types_1.defineTool; } });
Object.defineProperty(exports, "createToolRuntime", { enumerable: true, get: function () { return types_1.createToolRuntime; } });
Object.defineProperty(exports, "ok", { enumerable: true, get: function () { return types_1.ok; } });
Object.defineProperty(exports, "err", { enumerable: true, get: function () { return types_1.err; } });
var vercel_1 = require("./adapters/vercel");
Object.defineProperty(exports, "toVercelTool", { enumerable: true, get: function () { return vercel_1.toVercelTool; } });
Object.defineProperty(exports, "toVercelTools", { enumerable: true, get: function () { return vercel_1.toVercelTools; } });
var guard_1 = require("./guard");
Object.defineProperty(exports, "assertShapeInScope", { enumerable: true, get: function () { return guard_1.assertShapeInScope; } });
Object.defineProperty(exports, "extractShapeTarget", { enumerable: true, get: function () { return guard_1.extractShapeTarget; } });
var summaries_1 = require("./summaries");
Object.defineProperty(exports, "paintSummary", { enumerable: true, get: function () { return summaries_1.paintSummary; } });
Object.defineProperty(exports, "textStyleSummary", { enumerable: true, get: function () { return summaries_1.textStyleSummary; } });
Object.defineProperty(exports, "shapeSummary", { enumerable: true, get: function () { return summaries_1.shapeSummary; } });
Object.defineProperty(exports, "slideSummary", { enumerable: true, get: function () { return summaries_1.slideSummary; } });
Object.defineProperty(exports, "elideUrlForSummary", { enumerable: true, get: function () { return summaries_1.elideUrlForSummary; } });
Object.defineProperty(exports, "findShapeDeep", { enumerable: true, get: function () { return summaries_1.findShapeDeep; } });
var capabilities_1 = require("./domains/capabilities");
Object.defineProperty(exports, "capabilityTools", { enumerable: true, get: function () { return capabilities_1.capabilityTools; } });
