// 本地 .pptx 的打开和写回。外部 agent 不经过网关，直接对一份文件工作。

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Presentation } from "@ppt/core";
import { parsePptx } from "@ppt/parser";
import { writePptx } from "@ppt/serializer";

export function resolvePptxPath(filePath: string): string {
  const abs = path.resolve(filePath);
  if (!abs.toLowerCase().endsWith(".pptx")) {
    throw new Error(`path must be a .pptx file: ${filePath}`);
  }
  return abs;
}

export async function readPptxFile(filePath: string): Promise<{ path: string; pres: Presentation }> {
  const abs = resolvePptxPath(filePath);
  const bytes = await readFile(abs);
  const pres = await parsePptx(bytes);
  return { path: abs, pres };
}

export async function writePptxFile(filePath: string, pres: Presentation): Promise<string> {
  const abs = resolvePptxPath(filePath);
  await writeFile(abs, writePptx(pres));
  return abs;
}
