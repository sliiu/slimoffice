import type { DeckComment } from "@ppt/core";
import { esc, pxToEmu } from "./xml-util";

export const REL_TYPE_COMMENTS =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments";
export const REL_TYPE_COMMENT_AUTHORS =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/commentAuthors";
export const CT_COMMENTS =
  "application/vnd.openxmlformats-officedocument.presentationml.comments+xml";
export const CT_COMMENT_AUTHORS =
  "application/vnd.openxmlformats-officedocument.presentationml.commentAuthors+xml";

const PML =
  'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

function authorInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return parts
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 2);
}

/** 导出到 OOXML 时跳过已解决批注（classic cmLst 无 resolved 字段）。 */
export function exportableComments(comments: DeckComment[] | undefined): DeckComment[] {
  return (comments ?? []).filter((c) => !c.resolved);
}

export function slideCommentsForExport(
  comments: DeckComment[] | undefined,
  slideIndex: number,
  modern: boolean,
): DeckComment[] {
  const list = modern ? (comments ?? []) : exportableComments(comments);
  return list.filter((c) => c.slideIndex === slideIndex);
}

export function commentsSnapshotForSlide(
  comments: DeckComment[] | undefined,
  slideIndex: number,
  modern?: boolean,
): string {
  return JSON.stringify(slideCommentsForExport(comments, slideIndex, !!modern));
}

export function buildCommentAuthors(comments: DeckComment[]): {
  authors: Array<{ id: number; name: string; lastIdx: number }>;
  authorIdByName: Map<string, number>;
} {
  const order: string[] = [];
  const counts = new Map<string, number>();
  for (const c of comments) {
    if (!counts.has(c.author)) {
      order.push(c.author);
      counts.set(c.author, 0);
    }
    counts.set(c.author, (counts.get(c.author) ?? 0) + 1);
  }
  const authorIdByName = new Map<string, number>();
  const authors = order.map((name, id) => {
    authorIdByName.set(name, id);
    return { id, name, lastIdx: counts.get(name) ?? 0 };
  });
  return { authors, authorIdByName };
}

export function renderCommentAuthorsXml(
  authors: Array<{ id: number; name: string; lastIdx: number }>,
): string {
  const rows = authors
    .map(
      (a) =>
        `<p:cmAuthor id="${a.id}" name="${esc(a.name)}" initials="${esc(authorInitials(a.name))}" lastIdx="${a.lastIdx}"/>`,
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<p:cmAuthorLst ${PML}>${rows}</p:cmAuthorLst>`;
}

export function renderCommentsXml(
  comments: DeckComment[],
  authorIdByName: Map<string, number>,
  slideSize: { width: number; height: number },
): string {
  const byId = new Map(comments.map((c) => [c.id, c]));
  const anchorFor = (c: DeckComment): { x: number; y: number } => {
    if (c.x != null && c.y != null) return { x: c.x, y: c.y };
    if (c.parentId) {
      const parent = byId.get(c.parentId);
      if (parent) return anchorFor(parent);
    }
    return { x: slideSize.width * 0.08, y: slideSize.height * 0.12 };
  };
  const perAuthorIdx = new Map<string, number>();
  const cms = comments.map((c) => {
    const authorId = authorIdByName.get(c.author) ?? 0;
    const idx = (perAuthorIdx.get(c.author) ?? 0) + 1;
    perAuthorIdx.set(c.author, idx);
    const anchor = anchorFor(c);
    const x = pxToEmu(anchor.x);
    const y = pxToEmu(anchor.y);
    const dt = new Date(c.createdAt).toISOString();
    return `<p:cm authorId="${authorId}" dt="${esc(dt)}" idx="${idx}"><p:pos x="${x}" y="${y}"/><p:text>${esc(c.text)}</p:text></p:cm>`;
  });
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<p:cmLst ${PML}>${cms.join("")}</p:cmLst>`;
}
