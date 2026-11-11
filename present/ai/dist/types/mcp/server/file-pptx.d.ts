import type { Presentation } from "@sliiu/present-core";
export declare function resolvePptxPath(filePath: string): string;
export declare function readPptxFile(filePath: string): Promise<{
    path: string;
    pres: Presentation;
}>;
export declare function writePptxFile(filePath: string, pres: Presentation): Promise<string>;
