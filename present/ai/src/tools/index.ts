// 工具层入口：内置编辑工具全集 + 注册表 / 适配器 / 类型再导出。
//
// 消费方：
//   - chat/engine.ts    → buildEditToolDefs() + toVercelTools() 组装对话工具集
//   - mcp/server        → buildEditToolDefs() 直接注册为 MCP tools（对外暴露编辑能力）
//
// capability 工具（list_capabilities 等）不在 buildEditToolDefs 里 —— 由 chat
// 组装层单独最后合并（保证不被 MCP shadow），MCP server 也不暴露它们。

import type { ToolDef } from "./types";
import { ToolRegistry } from "./registry";
import { readTools } from "./domains/read";
import { slideTools } from "./domains/slides";
import { shapeBasicTools } from "./domains/shapes-basic";
import { shapeTools } from "./domains/shapes";
import { textTools } from "./domains/text";
import { tableTools } from "./domains/tables";
import { chartTools } from "./domains/charts";
import { effectTools } from "./domains/effects";
import { wordArtTools } from "./domains/wordart";
import { masterTools } from "./domains/masters";
import { animationBasicTools } from "./domains/animations-basic";
import { animationEditTools } from "./domains/animation-edit";
import { imageTools } from "./domains/images";
import { themeTools } from "./domains/theme";
import { motionTools } from "./domains/motion";
import { embedTools } from "./domains/embeds";
import { commentTools } from "./domains/comments";
import { smartArtTools } from "./domains/smartart";
import { fontTools } from "./domains/fonts";
import { protectionTools } from "./domains/protection";
import { agendaTools } from "./domains/agenda";
import { iconTools } from "./domains/icons";
import { stockFontsGroup } from "../mcp/client/builtin/stock-fonts";

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
export function buildEditToolDefs(): ToolDef[] {
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
export function buildPainterToolDefs(extra: readonly string[] = []): ToolDef[] {
  const names = extra.length ? new Set([...PAINTER_TOOL_NAMES, ...extra]) : PAINTER_TOOL_NAMES;
  return [...buildEditToolDefs(), ...stockFontsGroup.tools].filter((t) => names.has(t.name));
}

/** 组装成注册表（重名在 register 时抛错，防止两个域撞名）。 */
export function buildEditToolRegistry(): ToolRegistry {
  return new ToolRegistry().register(buildEditToolDefs());
}

export { ToolRegistry } from "./registry";
export {
  defineTool,
  createToolRuntime,
  ok,
  err,
  type ToolDef,
  type ToolTag,
  type ToolResult,
  type ToolRuntime,
  type ToolRuntimeOptions,
  type CapabilityChangedEvent,
} from "./types";
export { toVercelTool, toVercelTools } from "./adapters/vercel";
export { assertShapeInScope, extractShapeTarget } from "./guard";
export { paintSummary, textStyleSummary, shapeSummary, slideSummary, elideUrlForSummary, findShapeDeep } from "./summaries";
export { capabilityTools } from "./domains/capabilities";
