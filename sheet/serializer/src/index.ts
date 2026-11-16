import type { Workbook } from "@sheet/core";
import { zipSync } from "fflate";

/** Writes the original parts back. Nothing is rebuilt, so an unread part stays byte for byte. */
export function writeXlsx(workbook: Workbook): Uint8Array {
  if (!workbook.source || workbook.source.size === 0) {
    throw new Error("This workbook has no original parts to write back");
  }
  const files: Record<string, Uint8Array> = {};
  for (const [path, bytes] of workbook.source) files[path] = bytes;
  return zipSync(files);
}
