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
export declare function morphGeometryHash(c: MorphShapeCandidate): string;
export declare function morphSimilarity(a: MorphShapeCandidate, b: MorphShapeCandidate): number;
/** How a morph pair was matched (mirrors `matchMorphShapePairs` priority). */
export declare function morphMatchReason(ghost: MorphShapeCandidate, stage: MorphShapeCandidate): "id" | "name" | "placeholder" | "geometry";
/**
 * name/id/placeholder/geometry matching for morph FLIP (testable without DOM).
 * Each tier is resolved for every shape before the next one, and geometry pairs are assigned
 * best-score-first: a stage-order greedy pass lets an early shape take the ghost that an
 * unchanged later shape (same kicker, same folio) matches exactly.
 */
export declare function matchMorphShapePairs(ghost: MorphShapeCandidate[], stage: MorphShapeCandidate[]): Array<{
    ghost: MorphShapeCandidate;
    stage: MorphShapeCandidate;
}>;
