// 本地文稿存储：和在线存储 MCP 共用 createPptMcpServer。
// deckId 是 SLIMPPT_ROOT 这一层目录里的文件名（不进子目录）。
// save 把内存里的 Presentation 写成同一个 .pptx / .pptm。

import { readdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Presentation } from "@ppt/core";
import { parsePptx } from "@ppt/parser";
import { writePptx } from "@ppt/serializer";
import type { PptMcpDeckStore } from "./index";

const DECK_EXT = new Set([".pptx", ".pptm"]);

export function createFileDeckStore(rootDir: string): PptMcpDeckStore {
  const root = path.resolve(rootDir);
  return {
    async list() {
      const entries = await readdir(root, { withFileTypes: true });
      const decks: Array<{ deckId: string; name: string; slideCount: number; updatedAt: number }> = [];
      for (const ent of entries) {
        if (!ent.isFile() || ent.name.startsWith(".")) continue;
        if (!DECK_EXT.has(path.extname(ent.name).toLowerCase())) continue;
        const file = path.join(root, ent.name);
        const info = await stat(file);
        let slideCount = 0;
        try {
          const pres = await parsePptx(await readFile(file), { mediaMode: "data" });
          slideCount = pres.slides.length;
        } catch {
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
    async load(deckId: string): Promise<Presentation> {
      const file = resolveDeckFile(root, deckId);
      return parsePptx(await readFile(file), { mediaMode: "data" });
    },
    async save(deckId: string, pres: Presentation): Promise<void> {
      const file = resolveDeckFile(root, deckId);
      const bytes = writePptx(pres);
      const tmp = `${file}.${process.pid}.writing`;
      await writeFile(tmp, bytes);
      await rename(tmp, file);
    },
  };
}

/** deckId 必须是根目录里的一个 .pptx / .pptm 文件名。 */
export function resolveDeckFile(root: string, deckId: string): string {
  if (!deckId || deckId !== path.basename(deckId)) {
    throw new Error(`Deck "${deckId}" is not a file name in the local folder.`);
  }
  const ext = path.extname(deckId).toLowerCase();
  if (!DECK_EXT.has(ext)) {
    throw new Error(`Deck "${deckId}" must be a .pptx or .pptm file.`);
  }
  const file = path.resolve(root, deckId);
  const rel = path.relative(root, file);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`Deck "${deckId}" is outside the local folder.`);
  }
  return file;
}
