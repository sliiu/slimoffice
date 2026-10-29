import type { DeckComment } from "@ppt/core";
import { COMMENT_META_TAG } from "@ppt/core";
import type { PptxArchive } from "./zip";
import { strFromU8 } from "fflate";
import { loadXmlPart, type RelMap } from "./parts";
import { findAllByLocalName, findByLocalName, attr } from "./xml";
import { emuToPx } from "./units";
import { followFirstRelByType } from "./slide-like";
import { loadModernSlideComments, type ModernAuthorIndex } from "./modern-comments";

const TYPE_TAGS = "/tags";

function unescapeXmlAttr(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/** 从 presentation tags part 读取指定 SlimPPT 侧车键（绕过超大 tagLst 的常规解析限制）。 */
export function loadMetaTagFromArchive(
  archive: PptxArchive,
  presRels: RelMap,
  tagName: string,
): string | undefined {
  const path = followFirstRelByType(presRels, TYPE_TAGS);
  if (!path) return undefined;
  const bytes = archive.files.get(path);
  if (!bytes) return undefined;
  const xml = strFromU8(bytes);
  const needle = `name="${tagName}" val="`;
  const i = xml.indexOf(needle);
  if (i < 0) return undefined;
  const start = i + needle.length;
  const end = xml.indexOf('"/>', start);
  if (end < 0) return undefined;
  return unescapeXmlAttr(xml.slice(start, end));
}

/** 从 presentation tags part 读取 SlimPPT 批注元数据。 */
export function loadCommentMetaFromArchive(
  archive: PptxArchive,
  presRels: RelMap,
): string | undefined {
  return loadMetaTagFromArchive(archive, presRels, COMMENT_META_TAG);
}

const TYPE_COMMENT_AUTHORS = "/commentAuthors";
const TYPE_COMMENTS = "/comments";

export interface CommentAuthorIndex {
  byId: Map<number, string>;
}

export function loadCommentAuthors(archive: PptxArchive, presRels: RelMap): CommentAuthorIndex {
  const path = followFirstRelByType(presRels, TYPE_COMMENT_AUTHORS);
  const byId = new Map<number, string>();
  if (!path) return { byId };
  const xml = loadXmlPart(archive, path);
  if (!xml) return { byId };
  const lst = findByLocalName(xml, "cmAuthorLst");
  for (const node of findAllByLocalName(lst, "cmAuthor")) {
    const id = Number(attr(node, "id"));
    const name = attr(node, "name");
    if (Number.isFinite(id) && name) byId.set(id, name);
  }
  return { byId };
}

export function loadSlideComments(
  archive: PptxArchive,
  slideRels: RelMap,
  authors: CommentAuthorIndex,
  slideIndex: number,
  modernAuthors?: ModernAuthorIndex,
): { comments: DeckComment[]; commentsPartPath?: string; commentsModern?: boolean } {
  const modern = loadModernSlideComments(archive, slideRels, modernAuthors ?? { byId: new Map() }, slideIndex);
  if (modern.comments.length || modern.commentsModern) return modern;

  const commentsPartPath = followFirstRelByType(slideRels, TYPE_COMMENTS);
  if (!commentsPartPath) return { comments: [] };
  const xml = loadXmlPart(archive, commentsPartPath);
  if (!xml) return { comments: [], commentsPartPath };
  const lst = findByLocalName(xml, "cmLst");
  const comments: DeckComment[] = [];
  for (const node of findAllByLocalName(lst, "cm")) {
    const authorId = Number(attr(node, "authorId"));
    const idx = Number(attr(node, "idx"));
    const dt = attr(node, "dt");
    const pos = findByLocalName(node, "pos");
    const textNode = findByLocalName(node, "text");
    const text = textNode ? String((textNode as { "#text"?: string })["#text"] ?? "").trim() : "";
    if (!text) continue;
    const x = pos ? emuToPx(attr(pos, "x") ?? "0") : undefined;
    const y = pos ? emuToPx(attr(pos, "y") ?? "0") : undefined;
    const author = authors.byId.get(authorId) ?? `Author ${authorId}`;
    const createdAt = dt ? Date.parse(dt) : Date.now();
    comments.push({
      id: `cmt_${slideIndex}_${authorId}_${idx}`,
      slideIndex,
      author,
      text,
      createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
      x,
      y,
    });
  }
  return { comments, commentsPartPath, commentsModern: false };
}

const MAX_REPLY_GAP_MS = 7 * 24 * 60 * 60 * 1000;
const ANCHOR_NEAR_PX = 80;

function anchorsNear(a: DeckComment, b: DeckComment): boolean {
  if (a.x == null || a.y == null || b.x == null || b.y == null) return true;
  return Math.hypot(a.x - b.x, a.y - b.y) <= ANCHOR_NEAR_PX;
}

/** 将 classic cmLst 扁平批注按作者 + 锚点邻近 + 时间链重建 parentId 线程。 */
export function linkImportedCommentThreads(comments: DeckComment[]): void {
  const bySlide = new Map<number, DeckComment[]>();
  for (const c of comments) {
    const list = bySlide.get(c.slideIndex) ?? [];
    list.push(c);
    bySlide.set(c.slideIndex, list);
  }
  for (const list of bySlide.values()) {
    list.sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
    let prev: DeckComment | undefined;
    for (const c of list) {
      if (
        prev &&
        prev.author === c.author &&
        c.createdAt - prev.createdAt <= MAX_REPLY_GAP_MS &&
        anchorsNear(prev, c)
      ) {
        c.parentId = prev.id;
      }
      prev = c;
    }
  }
}
