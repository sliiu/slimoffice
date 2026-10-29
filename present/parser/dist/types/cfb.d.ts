/** MS-CFB (OLE compound file) helpers — stream read by path. */
export declare const CFB_MAGIC: readonly [208, 207, 17, 224, 161, 177, 26, 225];
export declare function isCfb(bytes: Uint8Array): boolean;
/** List stream paths in a CFB container (e.g. `VBA/dir`). */
export declare function listCfbStreamPaths(bytes: Uint8Array): string[];
/** Read a stream by slash-separated path (case-insensitive). */
export declare function readCfbStreamPath(bytes: Uint8Array, wantPath: string): Uint8Array | null;
/** Back-compat: root-level stream name lookup (ole preview). */
export declare function readCfbRootStream(bytes: Uint8Array, streamName: string): Uint8Array | null;
