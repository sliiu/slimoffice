import type { DocumentPort } from "../kernel/port.js";
export declare function assertShapeInScope(port: DocumentPort, target: {
    shapeId?: string;
    shapeIds?: readonly string[];
}): {
    ok: false;
    error: string;
} | null;
/** 从任意工具入参里抽出 shapeId / shapeIds 字段（适配器统一调用）。 */
export declare function extractShapeTarget(args: unknown): {
    shapeId?: string;
    shapeIds?: readonly string[];
};
