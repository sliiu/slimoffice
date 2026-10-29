// PowerPoint 2010+ `<p14:sectionLst>`（presentation.xml extLst）。
// URI：{521415D9-36F7-43E2-AB2F-B90AF26B5E84}
// 每个 section 的 p14:sldId@id 对应 presentation sldIdLst 里的 sldId@id。

import type { DeckSection, Presentation, PresentationSource } from "@ppt/core";
import { normalizeDeckSections } from "@ppt/core";
import { strFromU8, strToU8 } from "fflate";
import { esc } from "./xml-util";
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

function sectionsForWrite(pres: Presentation): DeckSection[] {
  return normalizeDeckSections(pres.sections, pres.slides.length);
}

/** from-scratch sldId 约定与 `renderPresentation` 一致：256 + index。 */
export function fromScratchSldIds(slideCount: number): number[] {
  return Array.from({ length: slideCount }, (_, i) => 256 + i);
}

export function renderSectionLstXml(sections: DeckSection[], sldIds: number[]): string {
  const ext = renderSectionExtXml(sections, sldIds);
  return ext ? `<p:extLst>\n  ${ext}\n</p:extLst>` : "";
}

export function renderSectionExtXml(sections: DeckSection[], sldIds: number[]): string {
  const slideCount = sldIds.length;
  const list = normalizeDeckSections(sections, slideCount);
  if (!list.length || !slideCount) return "";
  const rows: string[] = [];
  if (list[0]!.startIndex > 0) {
    rows.push(sectionXml("Default Section", sectionIdToGuid("sec_default"), sldIds.slice(0, list[0]!.startIndex)));
  }
  for (let i = 0; i < list.length; i++) {
    const s = list[i]!;
    const end = i + 1 < list.length ? list[i + 1]!.startIndex : slideCount;
    rows.push(sectionXml(s.name, sectionIdToGuid(s.id), sldIds.slice(s.startIndex, end)));
  }
  return `<p:ext uri="${SECTION_LST_URI}"><p14:sectionLst xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main">${rows.join("")}</p14:sectionLst></p:ext>`;
}

function sectionXml(name: string, id: string, ids: number[]): string {
  const sld = ids.map((n) => `<p14:sldId id="${n}"/>`).join("");
  return `<p14:section name="${esc(name)}" id="${esc(id)}"><p14:sldIdLst>${sld}</p14:sldIdLst></p14:section>`;
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

  let xml = strFromU8(presBytes);
  const sldIds = readSldIdNumbersFromXml(xml);
  const ids = sldIds.length ? sldIds : fromScratchSldIds(pres.slides.length);
  const nextExt = renderSectionExtXml(sectionsForWrite(pres), ids);

  let next = xml;
  if (!nextExt) {
    next = xml.replace(SECTION_EXT_RE, "");
    next = next.replace(/<p:extLst>\s*<\/p:extLst>/, "");
  } else if (SECTION_EXT_RE.test(xml)) {
    next = xml.replace(SECTION_EXT_RE, nextExt);
  } else if (/<\/p:extLst>/.test(xml)) {
    next = xml.replace(/<\/p:extLst>/, `${nextExt}</p:extLst>`);
  } else {
    next = xml.replace(/<\/p:presentation>/, `<p:extLst>${nextExt}</p:extLst></p:presentation>`);
  }
  if (next === xml) return;
  archive.files.set(presPath, strToU8(next));
  if (opts.debug) console.log("[roundtrip] presentation.xml p14:sectionLst patched");
}
