import type { DeckComment } from "@ppt/core";
import type { PptxArchive } from "./zip";
import { loadXmlPart, type RelMap } from "./parts";
import { findAllByLocalName, findByLocalName, attr, type XmlNode } from "./xml";
import { emuToPx } from "./units";
import { followFirstRelByType } from "./slide-like";

const TYPE_MODERN_AUTHORS = "/2018/10/relationships/authors";
const TYPE_MODERN_COMMENTS = "/2018/10/relationships/comments";

export interface ModernAuthorIndex {
  byId: Map<string, string>;
}

export function loadModernAuthors(archive: PptxArchive, presRels: RelMap): ModernAuthorIndex {
  const path = followFirstRelByType(presRels, TYPE_MODERN_AUTHORS);
  const byId = new Map<string, string>();
  if (!path) return { byId };
  const xml = loadXmlPart(archive, path);
  if (!xml) return { byId };
  const lst = findByLocalName(xml, "authorLst");
  for (const node of findAllByLocalName(lst, "author")) {
    const id = attr(node, "id");
    const name = attr(node, "name");
    if (id && name) byId.set(id, name);
  }
  return { byId };
}

function textFromTxBody(node: unknown): string {
  const parts: string[] = [];
  const walk = (n: unknown): void => {
    if (!n || typeof n !== "object") return;
    const rec = n as Record<string, unknown>;
    for (const [k, v] of Object.entries(rec)) {
      if (k === "t" || k.endsWith(":t")) {
        const t = (v as { "#text"?: string })["#text"] ?? (typeof v === "string" ? v : "");
        if (t) parts.push(t);
      } else if (v && typeof v === "object") {
        if (Array.isArray(v)) for (const item of v) walk(item);
        else walk(v);
      }
    }
  };
  walk(node);
  return parts.join("\n").trim();
}

function parseModernCommentNode(
  node: XmlNode,
  authors: ModernAuthorIndex,
  slideIndex: number,
  parentId?: string,
): DeckComment[] {
  const out: DeckComment[] = [];
  const modernId = attr(node, "id");
  const authorId = attr(node, "authorId");
  const created = attr(node, "created");
  const status = attr(node, "status");
  const pos = findByLocalName(node, "pos");
  const txBody = findByLocalName(node, "txBody");
  const text = textFromTxBody(txBody);
  if (!text) return out;
  const author = (authorId && authors.byId.get(authorId)) || `Author ${authorId ?? "?"}`;
  const createdAt = created ? Date.parse(created) : Date.now();
  const x = pos ? emuToPx(attr(pos, "x") ?? "0") : undefined;
  const y = pos ? emuToPx(attr(pos, "y") ?? "0") : undefined;
  const id = modernId ? `cmt_m_${modernId}` : `cmt_${slideIndex}_${out.length}`;
  const comment: DeckComment = {
    id,
    modernId,
    slideIndex,
    author,
    text,
    createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
    x,
    y,
    parentId,
    resolved: status === "resolved" || status === "closed",
  };
  out.push(comment);
  const replyLst = findByLocalName(node, "replyLst");
  for (const reply of findAllByLocalName(replyLst, "reply")) {
    out.push(...parseModernCommentNode(reply, authors, slideIndex, id));
  }
  return out;
}

export function loadModernSlideComments(
  archive: PptxArchive,
  slideRels: RelMap,
  authors: ModernAuthorIndex,
  slideIndex: number,
): { comments: DeckComment[]; commentsPartPath?: string; commentsModern: boolean } {
  const commentsPartPath = followFirstRelByType(slideRels, TYPE_MODERN_COMMENTS);
  if (!commentsPartPath) return { comments: [], commentsModern: false };
  const xml = loadXmlPart(archive, commentsPartPath);
  if (!xml) return { comments: [], commentsPartPath, commentsModern: true };
  const raw = JSON.stringify(xml);
  if (!raw.includes("powerpoint/2018/8/main") && !raw.includes("authorId")) {
    return { comments: [], commentsPartPath, commentsModern: false };
  }
  const lst = findByLocalName(xml, "cmLst");
  const comments: DeckComment[] = [];
  for (const node of findAllByLocalName(lst, "cm")) {
    comments.push(...parseModernCommentNode(node, authors, slideIndex));
  }
  return { comments, commentsPartPath, commentsModern: true };
}

export function modernAuthorsPartPath(_archive: PptxArchive, presRels: RelMap): string | undefined {
  return followFirstRelByType(presRels, TYPE_MODERN_AUTHORS);
}
