import type { GuidanceInput, OutlineLayoutHint, PresentationSpec, SlideSpecZ } from "../schema";
import { ensureSlideSpecQuality, remapSlideSpec } from "../qa/ensure-spec-quality";

export const FULL_BLEED_ROLES = ["cover", "section", "closing", "hero"] as const;
export const NO_BULLET_LAYOUTS = [
  "cards",
  "process",
  "comparison",
  "metrics",
  "timeline",
  "chart",
  "agenda",
] as const;
export const WEB_EXCLUSIVE_LAYOUTS = ["cards", "process", "comparison", "two-column"] as const;
export const WEB_EXCLUSIVE_COUNT_KINDS = [
  "cards",
  "process",
  "comparison",
  "two-column",
  "twocolumn",
  "metrics",
  "timeline",
  "chart",
] as const;
export const WEB_EXCLUSIVE_MIN_PAGES = 4;
export const WEB_EXCLUSIVE_DECK_MIN_SLIDES = 6;

export interface GenerateBriefConstraints {
  fullBleedRoles: typeof FULL_BLEED_ROLES;
  noBulletLayouts: typeof NO_BULLET_LAYOUTS;
  webExclusiveLayouts: typeof WEB_EXCLUSIVE_LAYOUTS;
  webExclusiveMinPages: typeof WEB_EXCLUSIVE_MIN_PAGES;
}

export const GENERATE_BRIEF_CONSTRAINTS: GenerateBriefConstraints = {
  fullBleedRoles: FULL_BLEED_ROLES,
  noBulletLayouts: NO_BULLET_LAYOUTS,
  webExclusiveLayouts: WEB_EXCLUSIVE_LAYOUTS,
  webExclusiveMinPages: WEB_EXCLUSIVE_MIN_PAGES,
};

const STRUCTURAL = new Set<string>(["cover", "hero", "section", "closing"]);

export function isFullBleedRole(kind: string | undefined): boolean {
  return !!kind && (FULL_BLEED_ROLES as readonly string[]).includes(kind);
}

export function isNoBulletLayout(kind: string | undefined): boolean {
  return !!kind && (NO_BULLET_LAYOUTS as readonly string[]).includes(kind);
}

export function isWebExclusiveKind(kind: string | undefined): boolean {
  const n = (kind ?? "").toLowerCase();
  return WEB_EXCLUSIVE_COUNT_KINDS.some((k) => n === k || n.includes(k));
}

function countWebExclusive(slides: SlideSpecZ[]): number {
  return slides.filter((s) => isWebExclusiveKind(s.kind)).length;
}

function ensureWebExclusiveQuota(slides: SlideSpecZ[], guidance: Partial<GuidanceInput>): { slides: SlideSpecZ[]; fixes: string[] } {
  if (slides.length < WEB_EXCLUSIVE_DECK_MIN_SLIDES) return { slides, fixes: [] };
  const out = slides.slice();
  const fixes: string[] = [];
  let count = countWebExclusive(out);
  if (count >= WEB_EXCLUSIVE_MIN_PAGES) return { slides: out, fixes };
  let rotate = 0;
  for (let i = 0; i < out.length && count < WEB_EXCLUSIVE_MIN_PAGES; i++) {
    const cur = out[i]!;
    if (STRUCTURAL.has(cur.kind) || isWebExclusiveKind(cur.kind)) continue;
    const target = WEB_EXCLUSIVE_LAYOUTS[rotate % WEB_EXCLUSIVE_LAYOUTS.length]!;
    rotate += 1;
    out[i] = remapSlideSpec(target as OutlineLayoutHint, cur, {
      ...(guidance.topic ? { topic: guidance.topic } : {}),
    });
    fixes.push(`slide ${i + 1}: ${cur.kind} → ${out[i]!.kind} (web-exclusive)`);
    count += 1;
  }
  return { slides: out, fixes };
}

export function applyCompileConstraints(
  spec: PresentationSpec,
  guidance: Partial<GuidanceInput> = {},
): { spec: PresentationSpec; fixes: string[] } {
  const g: GuidanceInput = { topic: guidance.topic ?? "", ...guidance };
  const ensured = ensureSlideSpecQuality(spec.slides as SlideSpecZ[], g);
  const web = ensureWebExclusiveQuota(ensured.specs, g);
  return {
    spec: { ...spec, slides: web.slides },
    fixes: [...ensured.fixes, ...web.fixes],
  };
}
