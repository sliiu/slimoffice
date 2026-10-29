import { morphPathSignature } from "./morph-path";

export interface MorphShapeRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface MorphShapeCandidate {
  id: string;
  name: string;
  tag: string;
  rect: MorphShapeRect;
  pathD?: string;
  placeholderType?: string;
}

export function morphGeometryHash(c: MorphShapeCandidate): string {
  const aspect = c.rect.height > 0 ? c.rect.width / c.rect.height : 1;
  const area = Math.round(Math.log2(c.rect.width * c.rect.height + 1));
  const pathSig = c.pathD ? morphPathSignature(c.pathD) : "0";
  return `${c.tag}|${aspect.toFixed(1)}|${area}|${pathSig}`;
}

function pathScore(a: string, b: string): number {
  const sa = morphPathSignature(a);
  const sb = morphPathSignature(b);
  if (sa === sb) return 1;
  const m = Math.min(sa.length, sb.length);
  let same = 0;
  for (let i = 0; i < m; i++) if (sa[i] === sb[i]) same++;
  return same / Math.max(1, Math.max(sa.length, sb.length));
}

export function morphSimilarity(a: MorphShapeCandidate, b: MorphShapeCandidate): number {
  const w1 = a.rect.width || 1;
  const h1 = a.rect.height || 1;
  const w2 = b.rect.width || 1;
  const h2 = b.rect.height || 1;
  const ar1 = w1 / h1;
  const ar2 = w2 / h2;
  const arDiff = Math.abs(ar1 - ar2) / Math.max(ar1, ar2);
  const sizeDiff = Math.abs(Math.log2(w1 * h1 + 1) - Math.log2(w2 * h2 + 1)) / 4;
  let score = 1 - arDiff * 0.5 - sizeDiff * 0.3;
  if (a.pathD && b.pathD) {
    const ps = morphPathSignature(a.pathD) === morphPathSignature(b.pathD) ? 1 : pathScore(a.pathD, b.pathD);
    score = score * 0.6 + ps * 0.4;
  }
  return Math.max(0, score);
}

// cNvPr ids are only unique within one slide, so `sp_2` on two slides is usually two
// unrelated shapes; PowerPoint pairs by name. The id tier only covers shapes that carry no name.
const EXACT_TIERS: Array<{
  reason: "name" | "id" | "placeholder";
  same: (s: MorphShapeCandidate, g: MorphShapeCandidate) => boolean;
}> = [
  { reason: "name", same: (s, g) => !!s.name && g.name === s.name },
  { reason: "id", same: (s, g) => !s.name && !g.name && g.id === s.id },
  { reason: "placeholder", same: (s, g) => !!s.placeholderType && g.placeholderType === s.placeholderType },
];

/** How a morph pair was matched (mirrors `matchMorphShapePairs` priority). */
export function morphMatchReason(
  ghost: MorphShapeCandidate,
  stage: MorphShapeCandidate,
): "id" | "name" | "placeholder" | "geometry" {
  return EXACT_TIERS.find((t) => t.same(stage, ghost))?.reason ?? "geometry";
}

// 1 = same top-left, → 0 as the offset grows relative to the larger of the two boxes.
function morphPositionScore(a: MorphShapeRect, b: MorphShapeRect): number {
  const d = Math.hypot(a.left - b.left, a.top - b.top);
  const scale = Math.max(a.width, a.height, b.width, b.height, 1);
  return 1 / (1 + d / scale);
}

/**
 * name/id/placeholder/geometry matching for morph FLIP (testable without DOM).
 * Each tier is resolved for every shape before the next one, and geometry pairs are assigned
 * best-score-first: a stage-order greedy pass lets an early shape take the ghost that an
 * unchanged later shape (same kicker, same folio) matches exactly.
 */
export function matchMorphShapePairs(
  ghost: MorphShapeCandidate[],
  stage: MorphShapeCandidate[],
): Array<{ ghost: MorphShapeCandidate; stage: MorphShapeCandidate }> {
  const usedGhost = new Set<string>();
  const matched = new Map<MorphShapeCandidate, MorphShapeCandidate>();
  for (const { same } of EXACT_TIERS) {
    for (const s of stage) {
      if (matched.has(s)) continue;
      const g = ghost.find((c) => !usedGhost.has(c.id) && same(s, c));
      if (!g) continue;
      usedGhost.add(g.id);
      matched.set(s, g);
    }
  }
  const scored: Array<{ s: MorphShapeCandidate; g: MorphShapeCandidate; score: number }> = [];
  for (const s of stage) {
    if (matched.has(s)) continue;
    for (const g of ghost) {
      if (usedGhost.has(g.id) || g.tag !== s.tag) continue;
      const shape = morphSimilarity(s, g);
      if (shape <= 0.45) continue;
      scored.push({ s, g, score: shape * 0.7 + morphPositionScore(s.rect, g.rect) * 0.3 });
    }
  }
  scored.sort((a, b) => b.score - a.score);
  for (const { s, g } of scored) {
    if (matched.has(s) || usedGhost.has(g.id)) continue;
    usedGhost.add(g.id);
    matched.set(s, g);
  }
  return stage.flatMap((s) => {
    const g = matched.get(s);
    return g ? [{ ghost: g, stage: s }] : [];
  });
}
