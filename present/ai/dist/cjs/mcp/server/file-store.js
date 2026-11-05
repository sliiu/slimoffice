"use strict";
// 本地文稿存储：和在线存储 MCP 共用 createPptMcpServer。
// deckId 是 SLIMPPT_ROOT 这一层目录里的文件名（不进子目录）。
// save 把内存里的 Presentation 写成同一个 .pptx / .pptm。
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createFileDeckStore = createFileDeckStore;
exports.resolveDeckFile = resolveDeckFile;
const promises_1 = require("node:fs/promises");
const node_path_1 = __importDefault(require("node:path"));
const parser_1 = require("@sliiu/present-parser");
const serializer_1 = require("@sliiu/present-serializer");
const DECK_EXT = new Set([".pptx", ".pptm"]);
function createFileDeckStore(rootDir) {
    const root = node_path_1.default.resolve(rootDir);
    return {
        async list() {
            const entries = await (0, promises_1.readdir)(root, { withFileTypes: true });
            const decks = [];
            for (const ent of entries) {
                if (!ent.isFile() || ent.name.startsWith("."))
                    continue;
                if (!DECK_EXT.has(node_path_1.default.extname(ent.name).toLowerCase()))
                    continue;
                const file = node_path_1.default.join(root, ent.name);
                const info = await (0, promises_1.stat)(file);
                let slideCount = 0;
                try {
                    const pres = await (0, parser_1.parsePptx)(await (0, promises_1.readFile)(file), { mediaMode: "data" });
                    slideCount = pres.slides.length;
                }
                catch {
                    slideCount = 0;
                }
                decks.push({
                    deckId: ent.name,
                    name: ent.name,
                    slideCount,
                    updatedAt: info.mtimeMs,
                });
            }
            decks.sort((a, b) => a.deckId.localeCompare(b.deckId));
            return decks;
        },
        async load(deckId) {
            const file = resolveDeckFile(root, deckId);
            return (0, parser_1.parsePptx)(await (0, promises_1.readFile)(file), { mediaMode: "data" });
        },
        async save(deckId, pres) {
            const file = resolveDeckFile(root, deckId);
            const bytes = (0, serializer_1.writePptx)(pres);
            const tmp = `${file}.${process.pid}.writing`;
            await (0, promises_1.writeFile)(tmp, bytes);
            await (0, promises_1.rename)(tmp, file);
        },
    };
}
/** deckId 必须是根目录里的一个 .pptx / .pptm 文件名。 */
function resolveDeckFile(root, deckId) {
    if (!deckId || deckId !== node_path_1.default.basename(deckId)) {
        throw new Error(`Deck "${deckId}" is not a file name in the local folder.`);
    }
    const ext = node_path_1.default.extname(deckId).toLowerCase();
    if (!DECK_EXT.has(ext)) {
        throw new Error(`Deck "${deckId}" must be a .pptx or .pptm file.`);
    }
    const file = node_path_1.default.resolve(root, deckId);
    const rel = node_path_1.default.relative(root, file);
    if (rel.startsWith("..") || node_path_1.default.isAbsolute(rel)) {
        throw new Error(`Deck "${deckId}" is outside the local folder.`);
    }
    return file;
}
