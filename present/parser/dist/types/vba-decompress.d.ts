/** MS-OVBA §2.4.1 — decompress `dir` / module streams in vbaProject.bin. */
/** Decompress a VBA compressed container; returns null when signature / layout invalid. */
export declare function decompressVbaStream(data: Uint8Array): Uint8Array | null;
