/**
 * Editor chrome catalogs (Plan B popovers + Plan C task/quick-bar IA).
 * Surfaces reuse existing RibbonActions; this module does not add commands.
 */

export const CHROME_SHARE_INDIGO = "#4F46E5";
export const CHROME_POPOVER_BORDER = "#E5E5E5";

export const INSERT_COMMON_IDS = ["slide", "text", "image", "shape"] as const;
export type InsertCommonId = (typeof INSERT_COMMON_IDS)[number];

export const INSERT_MORE_IDS = ["moreShapes", "table", "chart", "icon", "media"] as const;
export type InsertMoreId = (typeof INSERT_MORE_IDS)[number];

/** Never first-screen. Animation painter / comments toggle / insert action stay dead. */
export const CHROME_DEAD_PATHS = ["action", "animationPainter", "showComments"] as const;

export const MORE_GROUP_IDS = [
  "file",
  "editText",
  "draw",
  "lookObject",
  "present",
  "workspace",
  "review",
  "help",
  "experimental",
] as const;
export type MoreGroupId = (typeof MORE_GROUP_IDS)[number];

/** Plan C bottom task tabs: Plan B eight groups + first-class Insert. File is required when present. */
export const TASK_TAB_IDS = [
  "file",
  "insert",
  "editText",
  "draw",
  "lookObject",
  "present",
  "workspace",
  "review",
  "help",
  "experimental",
] as const;
export type TaskTabId = (typeof TASK_TAB_IDS)[number];

/** 「常用」分组：底部命令行的默认内容，也是主插入路径。 */
export const QUICK_BAR_IDS = [
  "slide",
  "layout",
  "text",
  "insert",
  "image",
  "shape",
  "icon",
  "select",
  "formatPainter",
] as const;
export type QuickBarId = (typeof QUICK_BAR_IDS)[number];

/** 选择类工具前加分隔线。 */
export const QUICK_BAR_TOOL_IDS: readonly QuickBarId[] = ["select", "formatPainter"];

/** 分组切换器：常用 + 任务组。帮助与实验各自一组。 */
export type CommandGroupId = "common" | TaskTabId;

export const LOOK_OBJECT_CHILD_IDS = ["look", "object", "transitions", "animations"] as const;
export type LookObjectChildId = (typeof LOOK_OBJECT_CHILD_IDS)[number];

export const HELP_EXPERIMENTAL_CHILD_IDS = ["help", "experimental"] as const;
export type HelpExperimentalChildId = (typeof HELP_EXPERIMENTAL_CHILD_IDS)[number];

export const EXPORT_FORMAT_IDS = ["pptx", "pdf", "png", "html", "html-zip"] as const;
export type ExportFormatId = (typeof EXPORT_FORMAT_IDS)[number];

/** Product-name ban for Export first-screen copy (PPTX / 演示文稿 only). */
export const EXPORT_COPY_BAN = /PowerPoint/i;

export interface ChromeHookFlags {
  insertSlide?: boolean;
  insertText?: boolean;
  insertImage?: boolean;
  insertShape?: boolean;
  insertTable?: boolean;
  insertChart?: boolean;
  insertIcon?: boolean;
  insertVideo?: boolean;
  insertAudio?: boolean;
  insertExtras?: boolean;
  canExportPdf?: boolean;
  canExportPng?: boolean;
  canExportHtml?: boolean;
  canExportHtmlZip?: boolean;
  formatPainter?: boolean;
  hasFile?: boolean;
  hasEdit?: boolean;
  hasDraw?: boolean;
  hasLook?: boolean;
  hasObject?: boolean;
  hasPresent?: boolean;
  hasWorkspace?: boolean;
  hasReview?: boolean;
  hasHelp?: boolean;
  hasExperimental?: boolean;
  hasTransitions?: boolean;
  hasAnimations?: boolean;
  hasInsert?: boolean;
  hasLayout?: boolean;
}

export function listInsertCommon(flags: ChromeHookFlags): InsertCommonId[] {
  const out: InsertCommonId[] = [];
  for (const id of INSERT_COMMON_IDS) {
    if (id === "slide" && !flags.insertSlide) continue;
    if (id === "text" && flags.insertText === false) continue;
    if (id === "image" && flags.insertImage === false) continue;
    if (id === "shape" && flags.insertShape === false) continue;
    out.push(id);
  }
  return out;
}

export function listInsertMore(flags: ChromeHookFlags): Array<InsertMoreId | "extras"> {
  const out: Array<InsertMoreId | "extras"> = [];
  for (const id of INSERT_MORE_IDS) {
    if (id === "moreShapes" && flags.insertShape === false) continue;
    if (id === "table" && !flags.insertTable) continue;
    if (id === "chart" && !flags.insertChart) continue;
    if (id === "icon" && !flags.insertIcon) continue;
    if (id === "media" && !flags.insertVideo && !flags.insertAudio) continue;
    out.push(id);
  }
  if (flags.insertExtras) out.push("extras");
  return out;
}

export function listExportFormats(flags: ChromeHookFlags): ExportFormatId[] {
  const out: ExportFormatId[] = ["pptx"];
  if (flags.canExportPdf) out.push("pdf");
  if (flags.canExportPng) out.push("png");
  if (flags.canExportHtml) out.push("html");
  if (flags.canExportHtmlZip) out.push("html-zip");
  return out;
}

export function listMoreGroups(flags: ChromeHookFlags): MoreGroupId[] {
  const out: MoreGroupId[] = [];
  for (const id of MORE_GROUP_IDS) {
    if (id === "file" && !flags.hasFile) continue;
    if (id === "editText" && !flags.hasEdit) continue;
    if (id === "draw" && !flags.hasDraw) continue;
    if (id === "lookObject" && !flags.hasLook && !flags.hasObject && !flags.hasTransitions && !flags.hasAnimations) {
      continue;
    }
    if (id === "present" && !flags.hasPresent) continue;
    if (id === "workspace" && !flags.hasWorkspace) continue;
    if (id === "review" && !flags.hasReview) continue;
    if (id === "help" && !flags.hasHelp) continue;
    if (id === "experimental" && !flags.hasExperimental) continue;
    out.push(id);
  }
  return out;
}

export function listLookObjectChildren(flags: ChromeHookFlags): LookObjectChildId[] {
  const out: LookObjectChildId[] = [];
  if (flags.hasLook) out.push("look");
  if (flags.hasObject) out.push("object");
  if (flags.hasTransitions) out.push("transitions");
  if (flags.hasAnimations) out.push("animations");
  return out;
}

export function listHelpExperimentalChildren(flags: ChromeHookFlags): HelpExperimentalChildId[] {
  const out: HelpExperimentalChildId[] = [];
  if (flags.hasHelp) out.push("help");
  if (flags.hasExperimental) out.push("experimental");
  return out;
}

export function listTaskTabs(flags: ChromeHookFlags): TaskTabId[] {
  const out: TaskTabId[] = [];
  for (const id of TASK_TAB_IDS) {
    if (id === "file" && !flags.hasFile) continue;
    if (id === "insert" && !flags.hasInsert) continue;
    if (id === "editText" && !flags.hasEdit) continue;
    if (id === "draw" && !flags.hasDraw) continue;
    if (id === "lookObject" && !flags.hasLook && !flags.hasObject && !flags.hasTransitions && !flags.hasAnimations) {
      continue;
    }
    if (id === "present" && !flags.hasPresent) continue;
    if (id === "workspace" && !flags.hasWorkspace) continue;
    if (id === "review" && !flags.hasReview) continue;
    if (id === "help" && !flags.hasHelp) continue;
    if (id === "experimental" && !flags.hasExperimental) continue;
    out.push(id);
  }
  return out;
}

export function listQuickBar(flags: ChromeHookFlags): QuickBarId[] {
  const out: QuickBarId[] = [];
  for (const id of QUICK_BAR_IDS) {
    if (id === "slide" && !flags.insertSlide) continue;
    if (id === "layout" && !flags.hasLayout) continue;
    if (id === "text" && flags.insertText === false) continue;
    if (id === "image" && flags.insertImage === false) continue;
    if (id === "shape" && flags.insertShape === false) continue;
    if (id === "icon" && !flags.insertIcon) continue;
    if (id === "insert" && !flags.hasInsert) continue;
    if (id === "formatPainter" && !flags.formatPainter) continue;
    out.push(id);
  }
  return out;
}

export function listCommandGroups(flags: ChromeHookFlags): CommandGroupId[] {
  return ["common", ...listTaskTabs(flags)];
}
