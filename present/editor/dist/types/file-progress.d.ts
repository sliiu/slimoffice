export declare function showFileProgress(doc: Document, label: string): void;
export declare function setFileProgress(ratio: number): void;
export declare function hideFileProgress(): void;
export declare function readAsDataURL(file: Blob, onProgress?: (ratio: number) => void): Promise<string>;
export declare function readAsArrayBuffer(file: Blob, onProgress?: (ratio: number) => void): Promise<ArrayBuffer>;
