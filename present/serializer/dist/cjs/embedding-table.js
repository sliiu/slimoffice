"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SlideOleEmbeddingTable = exports.DeckEmbeddingRegistry = exports.OLE_OBJECT_REL_TYPE = void 0;
// OLE embedding 部件池 — from-scratch 导出时把 embed data URL 写成 ppt/embeddings/oleObjectN.bin。
const zip_write_1 = require("./zip-write");
exports.OLE_OBJECT_REL_TYPE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/oleObject";
class DeckEmbeddingRegistry {
    srcToName = new Map();
    files = new Map();
    nextIdx = 1;
    ensureFile(src) {
        const hit = this.srcToName.get(src);
        if (hit)
            return { name: hit, bytes: this.files.get(hit) ?? new Uint8Array(0) };
        const decoded = (0, zip_write_1.dataUrlToBytes)(src);
        const bytes = decoded?.bytes ?? new Uint8Array(0);
        const name = `oleObject${this.nextIdx++}.bin`;
        this.srcToName.set(src, name);
        this.files.set(name, bytes);
        return { name, bytes };
    }
    createPartTable() {
        return new SlideOleEmbeddingTable(this);
    }
    fileEntries() {
        return [...this.files.entries()].map(([name, bytes]) => ({ name, bytes }));
    }
}
exports.DeckEmbeddingRegistry = DeckEmbeddingRegistry;
class SlideOleEmbeddingTable {
    deck;
    srcToRelIdx = new Map();
    items = [];
    constructor(deck) {
        this.deck = deck;
    }
    registerOle(embedSrc, _fileName) {
        const existing = this.srcToRelIdx.get(embedSrc);
        if (existing !== undefined)
            return `rIdOle${existing}`;
        const { name, bytes } = this.deck.ensureFile(embedSrc);
        const idx = this.items.length + 1;
        this.items.push({ name, bytes });
        this.srcToRelIdx.set(embedSrc, idx);
        return `rIdOle${idx}`;
    }
    list() {
        return this.items.map((it, i) => ({
            name: it.name,
            bytes: it.bytes,
            relId: `rIdOle${i + 1}`,
        }));
    }
}
exports.SlideOleEmbeddingTable = SlideOleEmbeddingTable;
