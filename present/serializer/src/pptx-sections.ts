// 节。ECMA-376 第 5 版的 presentationml 没有节，所以不写 `<p14:sectionLst>`。
// 节留在内存里，编辑器照常分组；写盘时清掉原件里的 p14 节，避免和当前分组不一致。

import type { DeckSection, Presentation, PresentationSource } from "@sliiu/present-core";
import { strFromU8, strToU8 } from "fflate";
import type { RoundTripOptions } from "./pptx-roundtrip";

type MutableArchive = { files: Map<string, Uint8Array> };

export const SECTION_LST_URI = "{521415D9-36F7-43E2-AB2F-B90AF26B5E84}";

/** 把编辑器里的 `sec_open` 之类 id 折成 Office 认的 {GUID}。已是 GUID 则原样（大写）。 */
export function sectionIdToGuid(id: string): string {
  const t = id.trim();
  if (/^\{[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}\}$/.test(t)) {
    return t.toUpperCase();
  }
  let h = 2166136261;
  for (let i = 0; i < t.length; i++) {
    h ^= t.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const hex = (n: number, w: number) => (n >>> 0).toString(16).padStart(w, "0");
  const a = hex(h, 8);
  let h2 = h;
  for (let i = 0; i < t.length; i++) {
    h2 = Math.imul(h2 ^ (t.charCodeAt(i) + i * 13), 16777619);
  }
  const raw = (a + hex(h2, 8) + hex(~h2, 8) + hex(h ^ 0xabcdef, 8)).padEnd(32, "0").slice(0, 32);
  return `{${raw.slice(0, 8)}-${raw.slice(8, 12)}-4${raw.slice(13, 16)}-A${raw.slice(17, 20)}-${raw.slice(20, 32)}}`.toUpperCase();
}

/** from-scratch sldId 约定与 `renderPresentation` 一致：256 + index。 */
export function fromScratchSldIds(slideCount: number): number[] {
  return Array.from({ length: slideCount }, (_, i) => 256 + i);
}

/** ECMA-376 没有节，写盘不产出任何标记。参数留着，调用方不用改。 */
export function renderSectionLstXml(_sections: DeckSection[], _sldIds: number[]): string {
  return "";
}

/** ECMA-376 没有节，写盘不产出任何标记。 */
export function renderSectionExtXml(_sections: DeckSection[], _sldIds: number[]): string {
  return "";
}

function readSldIdNumbersFromXml(xml: string): number[] {
  const out: number[] = [];
  for (const m of xml.matchAll(/<p:sldId\b([^>]*?)\/>|<p:sldId\b([^>]*)>/g)) {
    const attrs = m[1] ?? m[2] ?? "";
    const id = /(?:\s|^)id="(\d+)"/.exec(attrs)?.[1];
    if (id) out.push(Number(id));
  }
  return out;
}

const SECTION_EXT_RE =
  /<p:ext\b[^>]*uri="\{521415D9-36F7-43E2-AB2F-B90AF26B5E84\}"[^>]*(?:\/>|>[\s\S]*?<\/p:ext>)/;

export function patchSectionLst(
  pres: Presentation,
  archive: MutableArchive,
  opts: RoundTripOptions,
): void {
  const source = pres.__source as PresentationSource | undefined;
  const presPath = source?.presentationPath ?? "ppt/presentation.xml";
  const presBytes = archive.files.get(presPath);
  if (!presBytes) return;

  const xml = strFromU8(presBytes);
  // 节不在 ECMA-376 里。原件带的 p14 节清掉，不按内存里的分组重写。
  let next = xml.replace(SECTION_EXT_RE, "");
  next = next.replace(/<p:extLst>\s*<\/p:extLst>/, "");
  if (next === xml) return;
  archive.files.set(presPath, strToU8(next));
  if (opts.debug) console.log("[roundtrip] presentation.xml p14:sectionLst removed (not in ECMA-376)");
}
