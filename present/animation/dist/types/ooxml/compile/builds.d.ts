import type { BuildEnumerator, CompileBuildSpec } from "./types.js";
export type BuildIndex = Map<string, CompileBuildSpec[]>;
export declare function buildBuildIndex(builds: CompileBuildSpec[] | undefined): BuildIndex;
export declare function findBuild(index: BuildIndex, shapeId: string, grpId?: number): CompileBuildSpec | undefined;
export declare function chartSplitCount(spec: CompileBuildSpec | undefined, enumerator?: BuildEnumerator): {
    count: number;
    field: "series" | "category";
} | undefined;
