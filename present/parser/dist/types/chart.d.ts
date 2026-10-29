import type { ChartDef } from "@sliiu/present-core";
import type { ThemeData } from "./theme.js";
import type { PptxArchive } from "./zip.js";
export interface ChartCtx {
    theme?: ThemeData;
}
export declare function parseChart(archive: PptxArchive, chartPath: string, ctx: ChartCtx): ChartDef | null;
