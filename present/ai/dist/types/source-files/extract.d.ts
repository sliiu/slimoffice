import { type IncomingSourceFile } from "./kinds.js";
export declare class SourceFileError extends Error {
    constructor(message: string);
}
export declare function extractSourceText(file: IncomingSourceFile): string;
