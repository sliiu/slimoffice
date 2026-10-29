/**
 * Assign Layout + Variant from the whitelist only.
 * Inventing a layout is a hard fail.
 */

import { SLOT_CAPS, type LayoutId, type AnyVariantId } from "./ids.js";
import { resolveLayout } from "./layouts.js";
import type { NarrativeOutline } from "./narrative.js";
import { chunk, truncateChars } from "./text-measure.js";

export interface SlidePlan {
  layout: LayoutId;
  variant: AnyVariantId;
  title?: string;
  subtitle?: string;
  meta?: string;
  number?: string;
  claim?: string;
  note?: string;
  items?: string[];
  leftTitle?: string;
  leftItems?: string[];
  rightTitle?: string;
  rightItems?: string[];
  imageSrc?: string;
  value?: string;
  label?: string;
  kpis?: Array<{ value: string; label: string }>;
  next?: string;
}

export function assignPagePlan(outline: NarrativeOutline): SlidePlan[] {
  const slides: SlidePlan[] = [];
  let sectionNo = 0;

  for (const beat of outline.beats) {
    switch (beat.intent) {
      case "open":
        slides.push({
          layout: "cover",
          variant: outline.subtitle ? "title-meta" : "poster",
          title: outline.title,
          ...(outline.subtitle ? { subtitle: outline.subtitle } : {}),
          ...(outline.subtitle ? { meta: outline.language } : {}),
        });
        break;
      case "frame":
        sectionNo += 1;
        slides.push({
          layout: "section",
          variant: "num-title",
          number: String(sectionNo).padStart(2, "0"),
          title: beat.claim,
        });
        break;
      case "claim": {
        const raw = beat.claim;
        const hasNote = beat.evidence[0] && beat.evidence[0] !== beat.claim;
        if (/\?\s*$/.test(raw)) {
          slides.push({
            layout: "statement",
            variant: "question",
            claim: truncateChars(raw, SLOT_CAPS.statementClaimChars).text,
            ...(hasNote ? { note: beat.evidence[0] } : {}),
          });
        } else if ([...raw].length > SLOT_CAPS.statementClaimChars) {
          slides.push({
            layout: "quote",
            variant: "serif-mark",
            claim: truncateChars(raw, SLOT_CAPS.quoteChars).text,
            ...(hasNote ? { note: beat.evidence[0] } : {}),
          });
        } else {
          slides.push({
            layout: "statement",
            variant: hasNote ? "line-plus-note" : "single-line",
            claim: truncateChars(raw, SLOT_CAPS.statementClaimChars).text,
            ...(hasNote ? { note: beat.evidence[0] } : {}),
          });
        }
        break;
      }
      case "evidence": {
        const items = beat.evidence.length ? beat.evidence : [beat.claim];
        const n = items.length;
        if (n === 3 || n === 4 || n === 6) {
          const variant = n === 6 ? "six" : n === 4 ? "four" : "three";
          slides.push({
            layout: "cards",
            variant,
            title: beat.claim,
            items: items.map((b) => truncateChars(b, SLOT_CAPS.bulletItemChars).text),
          });
        } else if (n === 5) {
          slides.push({
            layout: "steps",
            variant: "row-5",
            title: beat.claim,
            items: items.map((b) => truncateChars(b, SLOT_CAPS.bulletItemChars).text),
          });
        } else {
          for (const group of chunk(items, SLOT_CAPS.bulletItems)) {
            slides.push({
              layout: "bullets",
              variant: "title-5",
              title: beat.claim,
              items: group.map((b) => truncateChars(b, SLOT_CAPS.bulletItemChars).text),
            });
          }
        }
        break;
      }
      case "contrast": {
        const ev = beat.evidence.length ? beat.evidence : [beat.claim];
        const half = Math.max(1, Math.ceil(ev.length / 2));
        slides.push({
          layout: "compare",
          variant: "two-col",
          title: beat.claim,
          leftItems: ev.slice(0, half),
          rightItems: ev.slice(half).length ? ev.slice(half) : [ev[0]!],
        });
        slides.push({
          layout: "split",
          variant: beat.imageIdea ? "figure-text" : "text-text",
          title: beat.claim,
        leftItems: ev.slice(0, Math.min(3, ev.length)),
        ...(beat.imageIdea
          ? {}
          : { rightItems: ev.slice(Math.min(3, ev.length)).length ? ev.slice(Math.min(3, ev.length), 6) : ev.slice(0, Math.min(3, ev.length)) }),
        });
        break;
      }
      case "proof": {
        slides.push({
          layout: "figure",
          variant: "hero",
          title: beat.claim,
        });
        if (beat.metric) {
          slides.push({
            layout: "kpi",
            variant: "big-number",
            value: beat.metric.value,
            label: truncateChars(beat.metric.label, SLOT_CAPS.bulletItemChars).text,
          });
        }
        break;
      }
      case "close": {
        const items = (beat.evidence.length ? beat.evidence : [beat.claim]).slice(0, SLOT_CAPS.closeTakeaways);
        if (items.length >= 3) {
          slides.push({
            layout: "close",
            variant: "manifesto",
            title: beat.claim,
            items: items.slice(0, 3).map((t) => truncateChars(t, SLOT_CAPS.bulletItemChars).text),
          });
        } else {
          slides.push({
            layout: "close",
            variant: "next-step",
            title: beat.claim,
            next: items[0] ?? beat.claim,
          });
        }
        break;
      }
      default:
        throw new Error(`Unknown beat intent "${(beat as { intent: string }).intent}".`);
    }
  }

  for (const s of slides) resolveLayout(s.layout, s.variant);
  return slides;
}

/** Apply slot caps and split overflow into extra whitelist pages. Never shrink type. */
export function enforceSlotCaps(plans: SlidePlan[]): SlidePlan[] {
  const out: SlidePlan[] = [];
  for (const plan of plans) {
    resolveLayout(plan.layout, plan.variant);
    if (plan.layout === "statement" && plan.claim) {
      out.push({ ...plan, claim: truncateChars(plan.claim, SLOT_CAPS.statementClaimChars).text });
      continue;
    }
    if (plan.layout === "bullets" && plan.items && plan.items.length > SLOT_CAPS.bulletItems) {
      for (const group of chunk(plan.items, SLOT_CAPS.bulletItems)) {
        out.push({
          ...plan,
          items: group.map((b) => truncateChars(b, SLOT_CAPS.bulletItemChars).text),
        });
      }
      continue;
    }
    if (plan.layout === "bullets" && plan.items) {
      out.push({
        ...plan,
        items: plan.items.map((b) => truncateChars(b, SLOT_CAPS.bulletItemChars).text),
      });
      continue;
    }
    if (plan.layout === "quote" && plan.claim) {
      out.push({ ...plan, claim: truncateChars(plan.claim, SLOT_CAPS.quoteChars).text });
      continue;
    }
    if (plan.layout === "cards" && plan.items) {
      const cap = plan.variant === "six" ? SLOT_CAPS.cardItems : plan.variant === "four" ? 4 : 3;
      out.push({
        ...plan,
        items: plan.items.slice(0, cap).map((b) => truncateChars(b, SLOT_CAPS.bulletItemChars).text),
      });
      continue;
    }
    if ((plan.layout === "steps" || plan.layout === "timeline" || plan.layout === "loop" || plan.layout === "bars" || plan.layout === "gallery") && plan.items) {
      const cap =
        plan.layout === "steps" && plan.variant === "row-3"
          ? 3
          : plan.layout === "steps"
            ? SLOT_CAPS.stepItems
            : plan.layout === "timeline"
              ? SLOT_CAPS.timelineItems
              : plan.layout === "loop"
                ? SLOT_CAPS.loopItems
                : plan.layout === "gallery" && plan.variant === "trio"
                  ? 3
                  : plan.layout === "gallery"
                    ? SLOT_CAPS.galleryItems
                    : SLOT_CAPS.barItems;
      out.push({
        ...plan,
        items: plan.items.slice(0, cap).map((b) => truncateChars(b, SLOT_CAPS.bulletItemChars).text),
      });
      continue;
    }
    if (plan.layout === "kpi" && (plan.variant === "ledger" || plan.variant === "number-row") && plan.kpis && plan.kpis.length > (plan.variant === "ledger" ? SLOT_CAPS.barItems + 2 : SLOT_CAPS.kpiRow)) {
      const cap = plan.variant === "ledger" ? SLOT_CAPS.barItems + 2 : SLOT_CAPS.kpiRow;
      for (const group of chunk(plan.kpis, cap)) {
        out.push({ ...plan, kpis: group });
      }
      continue;
    }
    if (plan.layout === "close" && (plan.variant === "three-takeaways" || plan.variant === "manifesto") && plan.items) {
      out.push({ ...plan, items: plan.items.slice(0, SLOT_CAPS.closeTakeaways) });
      continue;
    }
    out.push(plan);
  }
  return out;
}
