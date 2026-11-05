import type { PptMcpDeckStore } from "./index.js";
export declare function createFileDeckStore(rootDir: string): PptMcpDeckStore;
/** deckId 必须是根目录里的一个 .pptx / .pptm 文件名。 */
export declare function resolveDeckFile(root: string, deckId: string): string;
