import type { ChartDef } from "@sliiu/present-core";
import type { ThemeData } from "./theme.js";
import type { PptxArchive } from "./zip.js";
export interface ChartExCtx {
    theme?: ThemeData;
}
export declare function parseChartEx(archive: PptxArchive, chartPath: string, ctx: ChartExCtx): ChartDef | null;
