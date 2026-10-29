import type { Presentation, PresentationSource, SlideSource } from "@ppt/core";
import {
  buildCommentMeta,
  buildProtectionMeta,
  buildEditorPluginsMeta,
  buildPlaybackPluginsMeta,
  buildDeckSectionsMeta,
  buildProofingLangMeta,
  COMMENT_META_TAG,
  EDITOR_PLUGINS_META_TAG,
  PLAYBACK_PLUGINS_META_TAG,
  PROTECTION_META_TAG,
  PROOFING_LANG_META_TAG,
  SECTIONS_META_TAG,
} from "@ppt/core";
import { strFromU8, strToU8 } from "fflate";
import { esc } from "./xml-util";

export const REL_TYPE_TAGS =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/tags";
export const CT_TAGS =
  "application/vnd.openxmlformats.org/presentationml.tags+xml";

const PML =
  'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';

type MutableArchive = { files: Map<string, Uint8Array> };

function nextTagsPartPath(archive: MutableArchive): string {
  const used = new Set<number>();
  for (const path of archive.files.keys()) {
    const m = path.match(/^ppt\/tags\/tag(\d+)\.xml$/);
    if (m) used.add(Number(m[1]));
  }
  let n = 1;
  while (used.has(n)) n++;
  return `ppt/tags/tag${n}.xml`;
}

function readTagsFromPart(xml: string): Record<string, string> {
  const tags: Record<string, string> = {};
  for (const m of xml.matchAll(/<p:tag\b[^>]*\bname="([^"]*)"[^>]*\bval="([^"]*)"/g)) {
    tags[m[1]!] = m[2]!
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&");
  }
  return tags;
}

function renderTagsXml(tags: Record<string, string>): string {
  const rows = Object.entries(tags)
    .map(([name, val]) => `<p:tag name="${esc(name)}" val="${esc(val)}"/>`)
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<p:tagLst ${PML}>${rows}</p:tagLst>`;
}

function findTagsPartPath(archive: MutableArchive, presSrc?: PresentationSource): string | undefined {
  if (presSrc?.tagsPartPath) return presSrc.tagsPartPath;
  const relsBytes = archive.files.get("ppt/_rels/presentation.xml.rels");
  if (!relsBytes) return undefined;
  const rels = strFromU8(relsBytes);
  const m = rels.match(
    new RegExp(`Type="${REL_TYPE_TAGS.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*Target="([^"]+)"`),
  );
  if (!m) return undefined;
  const target = m[1]!.replace(/^\//, "");
  return target.startsWith("ppt/") ? target : `ppt/${target}`;
}

function allocRelId(relsXml: string): string {
  const used = new Set<string>();
  for (const m of relsXml.matchAll(/Id="([^"]+)"/g)) used.add(m[1]!);
  let n = 1;
  while (used.has(`rId${n}`)) n++;
  return `rId${n}`;
}

const SLIMPPT_TAG_KEYS = new Set([
  COMMENT_META_TAG,
  EDITOR_PLUGINS_META_TAG,
  PLAYBACK_PLUGINS_META_TAG,
  PROTECTION_META_TAG,
  PROOFING_LANG_META_TAG,
  SECTIONS_META_TAG,
]);

function isSlimPptTag(name: string): boolean {
  return SLIMPPT_TAG_KEYS.has(name);
}

function userTagsOf(tags: Record<string, string> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(tags ?? {})) {
    if (!isSlimPptTag(k)) out[k] = v;
  }
  return out;
}

function userTagsFingerprint(tags: Record<string, string> | undefined): string {
  return JSON.stringify(Object.entries(userTagsOf(tags)).sort(([a], [b]) => a.localeCompare(b)));
}

function applySlimPptKeys(tags: Record<string, string>, pres: Presentation): {
  nextComment: string;
  nextProtection: string;
  nextEditorPlugins: string;
  nextPlaybackPlugins: string;
  nextSections: string;
  nextProofingLang: string;
} {
  const nextComment = buildCommentMeta(pres.comments) ?? "";
  const nextProtection = buildProtectionMeta(pres) ?? "";
  const nextEditorPlugins = buildEditorPluginsMeta(pres) ?? "";
  const nextPlaybackPlugins = buildPlaybackPluginsMeta(pres) ?? "";
  const nextSections = buildDeckSectionsMeta(pres) ?? "";
  const nextProofingLang = buildProofingLangMeta(pres) ?? "";
  if (nextComment) tags[COMMENT_META_TAG] = nextComment;
  else delete tags[COMMENT_META_TAG];
  if (nextProtection) tags[PROTECTION_META_TAG] = nextProtection;
  else delete tags[PROTECTION_META_TAG];
  if (nextEditorPlugins) tags[EDITOR_PLUGINS_META_TAG] = nextEditorPlugins;
  else delete tags[EDITOR_PLUGINS_META_TAG];
  if (nextPlaybackPlugins) tags[PLAYBACK_PLUGINS_META_TAG] = nextPlaybackPlugins;
  else delete tags[PLAYBACK_PLUGINS_META_TAG];
  if (nextSections) tags[SECTIONS_META_TAG] = nextSections;
  else delete tags[SECTIONS_META_TAG];
  if (nextProofingLang) tags[PROOFING_LANG_META_TAG] = nextProofingLang;
  else delete tags[PROOFING_LANG_META_TAG];
  return { nextComment, nextProtection, nextEditorPlugins, nextPlaybackPlugins, nextSections, nextProofingLang };
}

function syncUserTags(tags: Record<string, string>, custom: Presentation["customData"]): void {
  if (!custom?.tags) return;
  for (const k of Object.keys(tags)) {
    if (!isSlimPptTag(k) && !(k in custom.tags)) delete tags[k];
  }
  for (const [k, v] of Object.entries(custom.tags)) {
    if (!isSlimPptTag(k)) tags[k] = v;
  }
}

function ensurePresentationTagsRef(
  archive: MutableArchive,
  tagsPartPath: string,
  relId: string,
): void {
  const relsPath = "ppt/_rels/presentation.xml.rels";
  let relsXml = archive.files.has(relsPath) ? strFromU8(archive.files.get(relsPath)!) : "";
  if (!relsXml.includes(`Type="${REL_TYPE_TAGS}"`)) {
    const target = tagsPartPath.replace(/^ppt\//, "");
    if (!relsXml) {
      relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="${relId}" Type="${REL_TYPE_TAGS}" Target="${target}"/>
</Relationships>`;
    } else {
      relsXml = relsXml.replace(
        /<\/Relationships>/,
        `<Relationship Id="${relId}" Type="${REL_TYPE_TAGS}" Target="${target}"/></Relationships>`,
      );
    }
    archive.files.set(relsPath, strToU8(relsXml));
  } else {
    relId = relsXml.match(new RegExp(`Id="([^"]+)"[^>]*Type="${REL_TYPE_TAGS}"`))?.[1] ?? relId;
  }

  const presPath = "ppt/presentation.xml";
  const presBytes = archive.files.get(presPath);
  if (!presBytes) return;
  let presXml = strFromU8(presBytes);
  const tagsRef = `<p:tags r:id="${relId}"/>`;
  if (presXml.includes("<p:custDataLst>")) {
    if (!presXml.includes("<p:tags")) {
      presXml = presXml.replace(/<\/p:custDataLst>/, `${tagsRef}</p:custDataLst>`);
    }
  } else {
    presXml = presXml.replace(
      /<\/p:presentation>/,
      `<p:custDataLst>${tagsRef}</p:custDataLst></p:presentation>`,
    );
  }
  archive.files.set(presPath, strToU8(presXml));
}

function appendContentTypesOverride(archive: MutableArchive, partName: string, contentType: string): void {
  const ctPath = "[Content_Types].xml";
  const bytes = archive.files.get(ctPath);
  if (!bytes) return;
  const xml = strFromU8(bytes);
  if (xml.includes(`PartName="${partName}"`)) return;
  archive.files.set(ctPath, strToU8(xml.replace(/<\/Types>/, `<Override PartName="${partName}" ContentType="${contentType}"/></Types>`)));
}

function readSidecarTags(
  archive: MutableArchive,
  presSrc: PresentationSource | undefined,
): Record<string, string> {
  const tagsPath = findTagsPartPath(archive, presSrc);
  if (!tagsPath || !archive.files.has(tagsPath)) return {};
  return readTagsFromPart(strFromU8(archive.files.get(tagsPath)!));
}

/** 把 SlimPPT 扩展元数据 + 用户 `customData.tags` 写入 presentation tags 部件。 */
export function patchSlimPptSidecarTags(
  pres: Presentation,
  archive: MutableArchive,
  opts: { debug?: boolean } = {},
): void {
  const presSrc = pres.__source as PresentationSource | undefined;
  const inArchive = readSidecarTags(archive, presSrc);
  const slim = {
    nextComment: buildCommentMeta(pres.comments) ?? "",
    nextProtection: buildProtectionMeta(pres) ?? "",
    nextEditorPlugins: buildEditorPluginsMeta(pres) ?? "",
    nextPlaybackPlugins: buildPlaybackPluginsMeta(pres) ?? "",
    nextSections: buildDeckSectionsMeta(pres) ?? "",
    nextProofingLang: buildProofingLangMeta(pres) ?? "",
  };
  const userChanged = userTagsFingerprint(pres.customData?.tags) !== userTagsFingerprint(inArchive);
  const slimUnchanged =
    slim.nextComment === (presSrc?.commentMetaSnapshot ?? "") &&
    slim.nextComment === (inArchive[COMMENT_META_TAG] ?? "") &&
    slim.nextProtection === (presSrc?.protectionMetaSnapshot ?? "") &&
    slim.nextProtection === (inArchive[PROTECTION_META_TAG] ?? "") &&
    slim.nextEditorPlugins === (presSrc?.editorPluginsMetaSnapshot ?? "") &&
    slim.nextEditorPlugins === (inArchive[EDITOR_PLUGINS_META_TAG] ?? "") &&
    slim.nextPlaybackPlugins === (presSrc?.playbackPluginsMetaSnapshot ?? "") &&
    slim.nextPlaybackPlugins === (inArchive[PLAYBACK_PLUGINS_META_TAG] ?? "") &&
    slim.nextSections === (presSrc?.sectionsMetaSnapshot ?? "") &&
    slim.nextSections === (inArchive[SECTIONS_META_TAG] ?? "") &&
    slim.nextProofingLang === (presSrc?.proofingLangMetaSnapshot ?? "") &&
    slim.nextProofingLang === (inArchive[PROOFING_LANG_META_TAG] ?? "");
  if (slimUnchanged && !userChanged) return;

  const tags = { ...inArchive };
  syncUserTags(tags, pres.customData);
  applySlimPptKeys(tags, pres);

  if (!Object.keys(tags).length) {
    const tagsPath = findTagsPartPath(archive, presSrc);
    if (!tagsPath || !archive.files.has(tagsPath)) return;
    archive.files.delete(tagsPath);
    if (presSrc) {
      presSrc.commentMetaSnapshot = "";
      presSrc.protectionMetaSnapshot = "";
      presSrc.editorPluginsMetaSnapshot = "";
      presSrc.playbackPluginsMetaSnapshot = "";
      presSrc.sectionsMetaSnapshot = "";
      presSrc.proofingLangMetaSnapshot = "";
    }
    if (opts.debug) console.log(`[roundtrip] removed empty ${tagsPath}`);
    return;
  }

  let tagsPath = findTagsPartPath(archive, presSrc);
  if (!tagsPath || !archive.files.has(tagsPath)) {
    tagsPath = nextTagsPartPath(archive);
    appendContentTypesOverride(archive, `/${tagsPath}`, CT_TAGS);
    const relId = allocRelId(
      archive.files.has("ppt/_rels/presentation.xml.rels")
        ? strFromU8(archive.files.get("ppt/_rels/presentation.xml.rels")!)
        : "",
    );
    ensurePresentationTagsRef(archive, tagsPath, relId);
    if (presSrc) presSrc.tagsPartPath = tagsPath;
  }

  archive.files.set(tagsPath, strToU8(renderTagsXml(tags)));
  if (presSrc) {
    presSrc.commentMetaSnapshot = slim.nextComment;
    presSrc.protectionMetaSnapshot = slim.nextProtection;
    presSrc.editorPluginsMetaSnapshot = slim.nextEditorPlugins;
    presSrc.playbackPluginsMetaSnapshot = slim.nextPlaybackPlugins;
    presSrc.sectionsMetaSnapshot = slim.nextSections;
    presSrc.proofingLangMetaSnapshot = slim.nextProofingLang;
  }
  if (opts.debug) console.log(`[roundtrip] ${tagsPath} tags patched`);
}

/**
 * from-scratch：把 presentation tags（用户 tagLst + SlimPPT 侧车）写进文本部件表。
 * 缓存恢复丢掉 `__source` 后走这条路径，否则保护 / 插件 / 批注元数据会丢。
 */
export function injectScratchPresentationTags(pres: Presentation, files: Record<string, string>): void {
  const tags: Record<string, string> = {};
  syncUserTags(tags, pres.customData);
  applySlimPptKeys(tags, pres);
  if (!Object.keys(tags).length) return;
  const tagsPath = "ppt/tags/tag1.xml";
  files[tagsPath] = renderTagsXml(tags);
  const relsPath = "ppt/_rels/presentation.xml.rels";
  const relId = allocRelId(files[relsPath] ?? "");
  files[relsPath] = insertRel(files[relsPath] ?? "", relId, REL_TYPE_TAGS, "tags/tag1.xml");
  files["ppt/presentation.xml"] = ensureCustDataTagsRefXml(files["ppt/presentation.xml"] ?? "", relId);
  files["[Content_Types].xml"] = insertContentTypeOverride(
    files["[Content_Types].xml"] ?? "",
    `/${tagsPath}`,
    CT_TAGS,
  );
}

/** from-scratch：slide `cSld/custDataLst` + 独立 tags 部件。 */
export function injectScratchSlideTags(pres: Presentation, files: Record<string, string>): void {
  let n = files["ppt/tags/tag1.xml"] ? 2 : 1;
  pres.slides.forEach((slide, i) => {
    const tags = slide.customData?.tags;
    if (!tags || !Object.keys(tags).length) return;
    const tagIdx = n;
    n += 1;
    const tagsPath = `ppt/tags/tag${tagIdx}.xml`;
    files[tagsPath] = renderTagsXml(tags);
    const relsPath = `ppt/slides/_rels/slide${i + 1}.xml.rels`;
    const relId = allocRelId(files[relsPath] ?? "");
    files[relsPath] = insertRel(files[relsPath] ?? "", relId, REL_TYPE_TAGS, `../tags/tag${tagIdx}.xml`);
    const slidePath = `ppt/slides/slide${i + 1}.xml`;
    files[slidePath] = ensureCSldCustDataTagsXml(files[slidePath] ?? "", relId);
    files["[Content_Types].xml"] = insertContentTypeOverride(
      files["[Content_Types].xml"] ?? "",
      `/${tagsPath}`,
      CT_TAGS,
    );
  });
}

function insertRel(relsXml: string, relId: string, type: string, target: string): string {
  if (relsXml.includes(`Type="${type}"`) && relsXml.includes(`Target="${target}"`)) return relsXml;
  const rel = `<Relationship Id="${relId}" Type="${type}" Target="${target}"/>`;
  if (!relsXml) {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${rel}
</Relationships>`;
  }
  return relsXml.replace(/<\/Relationships>/, `${rel}</Relationships>`);
}

function ensureCustDataTagsRefXml(presXml: string, relId: string): string {
  const tagsRef = `<p:tags r:id="${relId}"/>`;
  if (presXml.includes("<p:custDataLst>")) {
    if (presXml.includes("<p:tags")) return presXml;
    return presXml.replace(/<\/p:custDataLst>/, `${tagsRef}</p:custDataLst>`);
  }
  return presXml.replace(
    /<\/p:presentation>/,
    `<p:custDataLst>${tagsRef}</p:custDataLst></p:presentation>`,
  );
}

function ensureCSldCustDataTagsXml(slideXml: string, relId: string): string {
  if (slideXml.includes("<p:custDataLst>") && slideXml.includes("<p:tags")) return slideXml;
  const tagsRef = `<p:custDataLst><p:tags r:id="${relId}"/></p:custDataLst>`;
  if (slideXml.includes("</p:spTree>")) {
    return slideXml.replace("</p:spTree>", `</p:spTree>${tagsRef}`);
  }
  return slideXml.replace("</p:cSld>", `${tagsRef}</p:cSld>`);
}

function insertContentTypeOverride(ctXml: string, partName: string, contentType: string): string {
  if (ctXml.includes(`PartName="${partName}"`)) return ctXml;
  const row = `<Override PartName="${partName}" ContentType="${contentType}"/>`;
  if (!ctXml.includes("</Types>")) return ctXml;
  return ctXml.replace("</Types>", `${row}</Types>`);
}

function tagsRelTarget(relsXml: string): string | undefined {
  if (!relsXml.includes(`Type="${REL_TYPE_TAGS}"`)) return undefined;
  const escaped = REL_TYPE_TAGS.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return (
    relsXml.match(new RegExp(`Type="${escaped}"[^>]*Target="([^"]+)"`))?.[1] ??
    relsXml.match(new RegExp(`Target="([^"]+)"[^>]*Type="${escaped}"`))?.[1]
  );
}

function tagsPartFromRelTarget(target: string | undefined): string | undefined {
  const fileName = target?.split("/").pop();
  return fileName ? `ppt/tags/${fileName}` : undefined;
}

function tagsFingerprint(tags: Record<string, string> | undefined): string {
  if (!tags || !Object.keys(tags).length) return JSON.stringify(null);
  return JSON.stringify(Object.entries(tags).sort(([a], [b]) => a.localeCompare(b)));
}

/** round-trip：slide `cSld/custDataLst` 用户标签。未改动时保留原字节。 */
export function patchSlideCustomDataTags(
  pres: Presentation,
  archive: MutableArchive,
  opts: { debug?: boolean } = {},
): void {
  let nextIdx = 1;
  for (const path of archive.files.keys()) {
    const m = path.match(/^ppt\/tags\/tag(\d+)\.xml$/);
    if (m) nextIdx = Math.max(nextIdx, Number(m[1]) + 1);
  }
  for (const slide of pres.slides) {
    const src = slide.__source as SlideSource | undefined;
    const tags = slide.customData?.tags;
    const fp = tagsFingerprint(tags);
    const partPath = src?.partPath ?? `ppt/slides/slide${slide.index + 1}.xml`;
    const slideBytes = archive.files.get(partPath);
    if (!slideBytes) continue;
    const relsPath = partPath.replace(/\/([^/]+)$/, "/_rels/$1.rels");
    const relsXml = archive.files.has(relsPath) ? strFromU8(archive.files.get(relsPath)!) : "";
    const existingPath = tagsPartFromRelTarget(tagsRelTarget(relsXml));
    const inArchive = existingPath && archive.files.has(existingPath)
      ? readTagsFromPart(strFromU8(archive.files.get(existingPath)!))
      : undefined;
    // 必须和 clone 出来的 archive 比，不能只看 customDataSnapshot：
    // round-trip 每次从 source.files 克隆，snapshot 在第一次写出后会被改掉，
    // 否则第二次 writePptx 会跳过、用户标签写不进最终 zip。
    if (fp === tagsFingerprint(inArchive)) {
      if (src) src.customDataSnapshot = fp;
      continue;
    }
    if (!tags || !Object.keys(tags).length) {
      if (src) src.customDataSnapshot = fp;
      continue;
    }
    if (existingPath) {
      archive.files.set(existingPath, strToU8(renderTagsXml(tags)));
      if (src) src.customDataSnapshot = fp;
      if (opts.debug) console.log(`[roundtrip] ${partPath} slide tags → ${existingPath}`);
      continue;
    }
    const tagIdx = nextIdx++;
    const tagsPath = `ppt/tags/tag${tagIdx}.xml`;
    archive.files.set(tagsPath, strToU8(renderTagsXml(tags)));
    const relId = allocRelId(relsXml);
    archive.files.set(relsPath, strToU8(insertRel(relsXml, relId, REL_TYPE_TAGS, `../tags/tag${tagIdx}.xml`)));
    archive.files.set(partPath, strToU8(ensureCSldCustDataTagsXml(strFromU8(slideBytes), relId)));
    appendContentTypesOverride(archive, `/${tagsPath}`, CT_TAGS);
    if (src) src.customDataSnapshot = fp;
    if (opts.debug) console.log(`[roundtrip] ${partPath} slide tags → ${tagsPath}`);
  }
}

/** @deprecated 使用 {@link patchSlimPptSidecarTags} */
export function patchCommentMetaTags(
  pres: Presentation,
  archive: MutableArchive,
  opts: { debug?: boolean } = {},
): void {
  patchSlimPptSidecarTags(pres, archive, opts);
}
