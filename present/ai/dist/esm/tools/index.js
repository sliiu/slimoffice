// 工具层入口：内置编辑工具全集 + 注册表 / 适配器 / 类型再导出。
//
// 消费方：
//   - chat/engine.ts    → buildEditToolDefs() + toVercelTools() 组装对话工具集
//   - mcp/server        → buildEditToolDefs() 直接注册为 MCP tools（对外暴露编辑能力）
//
// capability 工具（list_capabilities 等）不在 buildEditToolDefs 里 —— 由 chat
// 组装层单独最后合并（保证不被 MCP shadow），MCP server 也不暴露它们。
import { ToolRegistry } from "./registry.js";
import { readTools } from "./domains/read.js";
import { slideTools } from "./domains/slides.js";
import { shapeBasicTools } from "./domains/shapes-basic.js";
import { shapeTools } from "./domains/shapes.js";
import { textTools } from "./domains/text.js";
import { tableTools } from "./domains/tables.js";
import { chartTools } from "./domains/charts.js";
import { effectTools } from "./domains/effects.js";
import { wordArtTools } from "./domains/wordart.js";
import { masterTools } from "./domains/masters.js";
import { animationBasicTools } from "./domains/animations-basic.js";
import { animationEditTools } from "./domains/animation-edit.js";
import { imageTools } from "./domains/images.js";
import { themeTools } from "./domains/theme.js";
import { motionTools } from "./domains/motion.js";
import { embedTools } from "./domains/embeds.js";
import { commentTools } from "./domains/comments.js";
import { smartArtTools } from "./domains/smartart.js";
import { fontTools } from "./domains/fonts.js";
import { protectionTools } from "./domains/protection.js";
import { agendaTools } from "./domains/agenda.js";
import { iconTools } from "./domains/icons.js";
import { stockFontsGroup } from "../mcp/client/builtin/stock-fonts.js";
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
export function buildEditToolDefs() {
    return [
        ...readTools,
        ...slideTools,
        ...shapeBasicTools,
        ...shapeTools,
        ...textTools,
        ...tableTools,
        ...chartTools,
        ...effectTools,
        ...wordArtTools,
        ...masterTools,
        ...animationBasicTools,
        ...animationEditTools,
        ...imageTools,
        ...themeTools,
        ...motionTools,
        ...embedTools,
        ...commentTools,
        ...smartArtTools,
        ...fontTools,
        ...protectionTools,
        ...agendaTools,
        ...iconTools,
    ];
}
/** 生成 polish 专用子集。extra 可并入额外工具名。 */
export function buildPainterToolDefs(extra = []) {
    const names = extra.length ? new Set([...PAINTER_TOOL_NAMES, ...extra]) : PAINTER_TOOL_NAMES;
    return [...buildEditToolDefs(), ...stockFontsGroup.tools].filter((t) => names.has(t.name));
}
/** 组装成注册表（重名在 register 时抛错，防止两个域撞名）。 */
export function buildEditToolRegistry() {
    return new ToolRegistry().register(buildEditToolDefs());
}
export { ToolRegistry } from "./registry.js";
export { defineTool, createToolRuntime, ok, err, } from "./types.js";
export { toVercelTool, toVercelTools } from "./adapters/vercel.js";
export { assertShapeInScope, extractShapeTarget } from "./guard.js";
export { paintSummary, textStyleSummary, shapeSummary, slideSummary, elideUrlForSummary, findShapeDeep } from "./summaries.js";
export { capabilityTools } from "./domains/capabilities.js";
