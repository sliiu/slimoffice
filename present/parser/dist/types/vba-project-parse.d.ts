import type { VbaModuleMeta, VbaProjectMeta } from "@sliiu/present-core";
/**
 * Decompress and decode VBA module source from `ppt/vbaProject.bin` bytes.
 * Does not execute macros.
 */
export declare function readVbaModuleSource(projectBytes: Uint8Array, module: Pick<VbaModuleMeta, "name" | "streamName"> & {
    sourceOffset?: number;
}, codepage?: number): string | null;
/** List Sub/Function/Property procedure names from decompressed module source. */
export declare function parseVbaModuleProcedures(source: string): string[];
/** Wrap module source as a `.bas`-style export with VB_Name attribute when missing. */
export declare function formatVbaBasExport(moduleName: string, source: string): string;
export interface VbaProcedureHit {
    moduleName: string;
    streamName?: string;
    procedure: string;
}
export interface VbaProcedureIndexEntry {
    moduleName: string;
    streamName?: string;
    procedures: string[];
}
/** List Sub/Function/Property names per module (read-only, no macro execution). */
export declare function indexVbaProceduresInProject(projectBytes: Uint8Array, modules: Array<{
    name: string;
    streamName?: string;
}>, codepage?: number): VbaProcedureIndexEntry[];
/** Search Sub/Function/Property names across decompressed module sources. */
export declare function searchVbaProceduresInProject(projectBytes: Uint8Array, modules: Array<{
    name: string;
    streamName?: string;
}>, query: string, codepage?: number): VbaProcedureHit[];
/** Concatenate all modules as `.bas` blocks (read-only export). */
export declare function exportAllVbaModulesBas(projectBytes: Uint8Array, modules: Array<{
    name: string;
    streamName?: string;
}>, codepage?: number): string;
/**
 * Parse VBA project metadata from `ppt/vbaProject.bin` bytes.
 * Does not execute macros or extract source code.
 */
export declare function parseVbaProjectMetadata(bytes: Uint8Array): VbaProjectMeta;
