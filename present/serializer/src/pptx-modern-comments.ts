import type { DeckComment } from "@sliiu/present-core";

export const P188_NS = "http://schemas.microsoft.com/office/powerpoint/2018/8/main";
export const REL_MODERN_COMMENTS =
  "http://schemas.microsoft.com/office/2018/10/relationships/comments";

export interface ModernAuthor {
  id: string;
  name: string;
}

/**
 * p188 批注不在 ECMA-376 里，写盘一律走经典 p:cm。
 * 线程和已解决状态读得进，导出走 exportableComments 能表达的那一部分。
 */
export function shouldUseModernComments(
  _comments: DeckComment[] | undefined,
  _commentsModern?: boolean,
): boolean {
  return false;
}

function stableGuid(seed: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    const c = seed.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= c << (i % 8);
    h2 = Math.imul(h2, 0x01000193);
  }
  const a = (h1 >>> 0).toString(16).padStart(8, "0");
  const b = (h2 >>> 0).toString(16).padStart(8, "0");
  return `${a.slice(0, 8)}-${b.slice(0, 4)}-4${b.slice(4, 7)}-a${a.slice(0, 3)}-${b}${a.slice(3, 7)}`.slice(
    0,
    36,
  );
}

export function commentModernId(c: DeckComment): string {
  return c.modernId ?? officeGuid(`slimppt-cmt:${c.id}`);
}

function authorModernId(name: string, existing?: Map<string, string>): string {
  const hit = existing?.get(name);
  if (hit) return hit;
  return officeGuid(`slimppt-author:${name}`);
}

export function buildModernAuthors(
  comments: DeckComment[],
  existing?: Map<string, string>,
): { authors: ModernAuthor[]; authorIdByName: Map<string, string> } {
  const order: string[] = [];
  for (const c of comments) {
    if (!order.includes(c.author)) order.push(c.author);
  }
  const authorIdByName = new Map<string, string>();
  const authors: ModernAuthor[] = order.map((name) => {
    const id = authorModernId(name, existing);
    authorIdByName.set(name, id);
    return { id, name };
  });
  return { authors, authorIdByName };
}

function officeGuid(seed: string): string {
  return `{${stableGuid(seed).toUpperCase()}}`;
}

// p188 批注不在 ECMA-376 里，不生成。读入识别留在 parser，这里只判断一个部件是不是 p188，
// 以便往返时把它换成经典 p:cm。

export function isModernCommentsXml(xml: string): boolean {
  return xml.includes(P188_NS) || xml.includes("powerpoint/2018/8/main");
}

/** Parse author name → GUID from an existing modern authors part. */
export function parseModernAuthorsFromXml(xml: string): Map<string, string> {
  const byName = new Map<string, string>();
  for (const m of xml.matchAll(/<p188:author[^>]*id="([^"]+)"[^>]*name="([^"]+)"/g)) {
    byName.set(m[2]!, m[1]!);
  }
  return byName;
}

export function isModernCommentsPartPath(partPath: string): boolean {
  return /\/modernComment\d+\.xml$/i.test(partPath) || partPath.includes("/comments/modern");
}
