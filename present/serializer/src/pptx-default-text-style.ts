// ECMA-376 §19.2.1.7 defaultTextStyle — 演示文稿级 9 级正文默认。
// from-scratch 写出带校对 lang 的 lstStyle；round-trip 在校对语言变化时只改 lang，
// 避免整段覆盖 Office 原有的字号 / 缩进。

import type { Presentation, PresentationSource, TextStyles } from "@ppt/core";
import { buildProofingLangMeta, getProofingLanguage, ooxmlLangFromProofingId } from "@ppt/core";
import { strFromU8, strToU8 } from "fflate";
import { esc } from "./xml-util";
import type { RoundTripOptions } from "./pptx-roundtrip";
import { defaultTextStyleToXml } from "./pptx-shapes";

type MutableArchive = { files: Map<string, Uint8Array> };

function defRPrXml(lang: string, withSz: boolean): string {
  const sz = withSz ? ` sz="1800"` : "";
  return `<a:defRPr lang="${esc(lang)}"${sz} kern="1200" dirty="0"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr>`;
}

/** From-scratch `<p:defaultTextStyle>`：有 IR 就按级写出，否则 PowerPoint 默认 18pt + 校对语言。 */
export function renderDefaultTextStyleXml(lang: string, styles?: TextStyles): string {
  const fromIr = defaultTextStyleToXml(styles, lang);
  if (fromIr) return fromIr;
  const levels: string[] = [`<a:defPPr>${defRPrXml(lang, false)}</a:defPPr>`];
  for (let i = 1; i <= 9; i++) {
    const marL = (i - 1) * 457200;
    levels.push(
      `<a:lvl${i}pPr marL="${marL}" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1">${defRPrXml(lang, true)}</a:lvl${i}pPr>`,
    );
  }
  return `  <p:defaultTextStyle>\n    ${levels.join("\n    ")}\n  </p:defaultTextStyle>\n`;
}

function patchLangInDefaultTextStyle(block: string, lang: string): string {
  if (/\slang="[^"]*"/.test(block)) {
    return block.replace(/\slang="[^"]*"/g, ` lang="${esc(lang)}"`);
  }
  return block.replace(/<a:defRPr\b([^/>]*)(\/?)>/g, (_m, rest: string, slash: string) => {
    if (/\slang=/.test(rest)) return `<a:defRPr${rest}${slash}>`;
    return `<a:defRPr lang="${esc(lang)}"${rest}${slash}>`;
  });
}

export function patchDefaultTextStyleLang(
  pres: Presentation,
  archive: MutableArchive,
  opts: RoundTripOptions,
): void {
  const source = pres.__source as PresentationSource | undefined;
  if (!source) return;
  const prev = source.proofingLangMetaSnapshot ?? "";
  const next = buildProofingLangMeta(pres) ?? "";
  if (next === prev) return;

  const lang = ooxmlLangFromProofingId(getProofingLanguage(pres));
  const presPath = source.presentationPath ?? "ppt/presentation.xml";
  const bytes = archive.files.get(presPath);
  if (!bytes) return;
  let xml = strFromU8(bytes);
  if (/<p:defaultTextStyle\s*\/>/.test(xml) || /<p:defaultTextStyle>\s*<\/p:defaultTextStyle>/.test(xml)) {
    xml = xml
      .replace(/<p:defaultTextStyle\s*\/>/, renderDefaultTextStyleXml(lang).trim())
      .replace(/<p:defaultTextStyle>\s*<\/p:defaultTextStyle>/, renderDefaultTextStyleXml(lang).trim());
  } else if (/<p:defaultTextStyle\b/.test(xml)) {
    xml = xml.replace(/<p:defaultTextStyle\b[\s\S]*?<\/p:defaultTextStyle>/, (block) =>
      patchLangInDefaultTextStyle(block, lang),
    );
  } else {
    xml = xml.replace(/(<\/p:presentation>)/, `${renderDefaultTextStyleXml(lang)}$1`);
  }
  archive.files.set(presPath, strToU8(xml));
  if (opts.debug) console.log(`[roundtrip] defaultTextStyle lang → ${lang}`);
}