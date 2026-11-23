/**
 * Module names stored in a vbaProject.bin, read from the dir stream.
 * The module streams themselves are never decompressed or run.
 */
export declare function vbaModuleNames(bytes: Uint8Array | undefined): string[];
/** MS-OVBA 2.4.1 compressed container. A stream that is not one reads as empty. */
export declare function decompress(bytes: Uint8Array): Uint8Array | undefined;
