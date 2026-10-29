/**
 * Editor chrome catalogs (Plan B popovers + Plan C task/quick-bar IA).
 * Surfaces reuse existing RibbonActions; this module does not add commands.
 */
export declare const CHROME_SHARE_INDIGO = "#4F46E5";
export declare const CHROME_POPOVER_BORDER = "#E5E5E5";
export declare const INSERT_COMMON_IDS: readonly ["slide", "text", "image", "shape"];
export type InsertCommonId = (typeof INSERT_COMMON_IDS)[number];
export declare const INSERT_MORE_IDS: readonly ["moreShapes", "table", "chart", "icon", "media"];
export type InsertMoreId = (typeof INSERT_MORE_IDS)[number];
/** Never first-screen. Animation painter / comments toggle / insert action stay dead. */
export declare const CHROME_DEAD_PATHS: readonly ["action", "animationPainter", "showComments"];
export declare const MORE_GROUP_IDS: readonly ["file", "editText", "draw", "lookObject", "present", "workspace", "review", "help", "experimental"];
export type MoreGroupId = (typeof MORE_GROUP_IDS)[number];
/** Plan C bottom task tabs: Plan B eight groups + first-class Insert. File is required when present. */
export declare const TASK_TAB_IDS: readonly ["file", "insert", "editText", "draw", "lookObject", "present", "workspace", "review", "help", "experimental"];
export type TaskTabId = (typeof TASK_TAB_IDS)[number];
/** 「常用」分组：底部命令行的默认内容，也是主插入路径。 */
export declare const QUICK_BAR_IDS: readonly ["slide", "layout", "text", "insert", "image", "shape", "icon", "select", "formatPainter"];
export type QuickBarId = (typeof QUICK_BAR_IDS)[number];
/** 选择类工具前加分隔线。 */
export declare const QUICK_BAR_TOOL_IDS: readonly QuickBarId[];
/** 分组切换器：常用 + 任务组。帮助与实验各自一组。 */
export type CommandGroupId = "common" | TaskTabId;
export declare const LOOK_OBJECT_CHILD_IDS: readonly ["look", "object", "transitions", "animations"];
export type LookObjectChildId = (typeof LOOK_OBJECT_CHILD_IDS)[number];
export declare const HELP_EXPERIMENTAL_CHILD_IDS: readonly ["help", "experimental"];
export type HelpExperimentalChildId = (typeof HELP_EXPERIMENTAL_CHILD_IDS)[number];
export declare const EXPORT_FORMAT_IDS: readonly ["pptx", "pdf", "png", "html", "html-zip"];
export type ExportFormatId = (typeof EXPORT_FORMAT_IDS)[number];
/** Product-name ban for Export first-screen copy (PPTX / 演示文稿 only). */
export declare const EXPORT_COPY_BAN: RegExp;
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
export declare function listInsertCommon(flags: ChromeHookFlags): InsertCommonId[];
export declare function listInsertMore(flags: ChromeHookFlags): Array<InsertMoreId | "extras">;
export declare function listExportFormats(flags: ChromeHookFlags): ExportFormatId[];
export declare function listMoreGroups(flags: ChromeHookFlags): MoreGroupId[];
export declare function listLookObjectChildren(flags: ChromeHookFlags): LookObjectChildId[];
export declare function listHelpExperimentalChildren(flags: ChromeHookFlags): HelpExperimentalChildId[];
export declare function listTaskTabs(flags: ChromeHookFlags): TaskTabId[];
export declare function listQuickBar(flags: ChromeHookFlags): QuickBarId[];
export declare function listCommandGroups(flags: ChromeHookFlags): CommandGroupId[];
