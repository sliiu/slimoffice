// OLE embedding 部件池 — from-scratch 导出时把 embed data URL 写成 ppt/embeddings/oleObjectN.bin。
import { dataUrlToBytes } from "./zip-write";

export const OLE_OBJECT_REL_TYPE =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/oleObject";

export interface OleEmbeddingRegistrar {
  registerOle(embedSrc: string, fileName?: string): string;
}

export interface OleEmbeddingListItem {
  name: string;
  relId: string;
  bytes: Uint8Array;
}

export class DeckEmbeddingRegistry {
  private srcToName = new Map<string, string>();
  private files = new Map<string, Uint8Array>();
  private nextIdx = 1;

  ensureFile(src: string): { name: string; bytes: Uint8Array } {
    const hit = this.srcToName.get(src);
    if (hit) return { name: hit, bytes: this.files.get(hit) ?? new Uint8Array(0) };
    const decoded = dataUrlToBytes(src);
    const bytes = decoded?.bytes ?? new Uint8Array(0);
    const name = `oleObject${this.nextIdx++}.bin`;
    this.srcToName.set(src, name);
    this.files.set(name, bytes);
    return { name, bytes };
  }

  createPartTable(): SlideOleEmbeddingTable {
    return new SlideOleEmbeddingTable(this);
  }

  fileEntries(): Array<{ name: string; bytes: Uint8Array }> {
    return [...this.files.entries()].map(([name, bytes]) => ({ name, bytes }));
  }
}

export class SlideOleEmbeddingTable implements OleEmbeddingRegistrar {
  private srcToRelIdx = new Map<string, number>();
  private items: Array<{ name: string; bytes: Uint8Array }> = [];

  constructor(private deck: DeckEmbeddingRegistry) {}

  registerOle(embedSrc: string, _fileName?: string): string {
    const existing = this.srcToRelIdx.get(embedSrc);
    if (existing !== undefined) return `rIdOle${existing}`;
    const { name, bytes } = this.deck.ensureFile(embedSrc);
    const idx = this.items.length + 1;
    this.items.push({ name, bytes });
    this.srcToRelIdx.set(embedSrc, idx);
    return `rIdOle${idx}`;
  }

  list(): OleEmbeddingListItem[] {
    return this.items.map((it, i) => ({
      name: it.name,
      bytes: it.bytes,
      relId: `rIdOle${i + 1}`,
    }));
  }
}
