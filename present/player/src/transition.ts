import type { SlideTransition } from "@ppt/core";
import { runTransition as runFx } from "@ppt/transition-fx";

/** 2D transitions available on Free / Lite during SaaS playback. */
const BASIC_TRANSITION_KINDS = new Set([
  "cut",
  "fade",
  "push",
  "cover",
  "uncover",
  "wipe",
  "dissolve",
  "split",
  "blinds",
  "checker",
  "randomBar",
]);

export function clampTransitionForPlan(
  transition: SlideTransition | undefined,
  advancedAllowed: boolean,
): SlideTransition | undefined {
  if (!transition || advancedAllowed) return transition;
  if (transition.kind === "cut" || transition.duration <= 0) return transition;
  if (BASIC_TRANSITION_KINDS.has(transition.kind)) return transition;
  return { ...transition, kind: "fade", duration: Math.min(transition.duration, 0.75) };
}

let _ghostSeq = 0;

export function snapshotStage(stage: HTMLElement): HTMLElement {
  const ghost = stage.cloneNode(true) as HTMLElement;
  ghost.removeAttribute("id");
  const prefix = `__ghost${++_ghostSeq}_`;
  const idMap = new Map<string, string>();
  ghost.querySelectorAll("[id]").forEach((el) => {
    const old = el.getAttribute("id");
    if (!old) return;
    const next = prefix + old;
    el.setAttribute("id", next);
    idMap.set(old, next);
  });
  if (idMap.size > 0) rewriteLocalRefs(ghost, idMap);
  copyCanvasBitmaps(stage, ghost);
  ghost.style.pointerEvents = "none";
  ghost.style.position = "absolute";
  ghost.style.left = stage.offsetLeft + "px";
  ghost.style.top = stage.offsetTop + "px";
  ghost.style.width = stage.style.width || stage.clientWidth + "px";
  ghost.style.height = stage.style.height || stage.clientHeight + "px";
  ghost.style.transform = stage.style.transform || "";
  ghost.style.transformOrigin = stage.style.transformOrigin || "center center";
  ghost.style.zIndex = "2";
  stage.parentElement?.appendChild(ghost);
  return ghost;
}

export async function runTransition(
  ghost: HTMLElement,
  stage: HTMLElement,
  transition: SlideTransition,
): Promise<void> {
  if (transition.kind === "cut" || transition.duration <= 0) {
    ghost.remove();
    return;
  }
  const wrap = stage.parentElement;
  const prevWrapClip = wrap?.style.clipPath ?? "";
  const prevWrapOverflow = wrap?.style.overflow ?? "";
  if (wrap) {
    const rect = stage.getBoundingClientRect();
    const wrapRect = wrap.getBoundingClientRect();
    const top = Math.max(0, rect.top - wrapRect.top);
    const left = Math.max(0, rect.left - wrapRect.left);
    const right = Math.max(0, wrapRect.right - rect.right);
    const bottom = Math.max(0, wrapRect.bottom - rect.bottom);
    wrap.style.clipPath = `inset(${top}px ${right}px ${bottom}px ${left}px)`;
    wrap.style.overflow = "hidden";
  }
  try {
    await runFx(ghost, stage, transition);
  } finally {
    stage.style.clipPath = "";
    if (wrap) {
      wrap.style.clipPath = prevWrapClip;
      wrap.style.overflow = prevWrapOverflow;
    }
    ghost.remove();
  }
}

function copyCanvasBitmaps(src: HTMLElement, dst: HTMLElement): void {
  const srcCanvases = src.querySelectorAll("canvas");
  const dstCanvases = dst.querySelectorAll("canvas");
  const n = Math.min(srcCanvases.length, dstCanvases.length);
  for (let i = 0; i < n; i++) {
    const s = srcCanvases[i] as HTMLCanvasElement;
    const d = dstCanvases[i] as HTMLCanvasElement;
    if (s.width === 0 || s.height === 0) continue;
    d.width = s.width;
    d.height = s.height;
    const ctx = d.getContext("2d");
    if (!ctx) continue;
    try {
      ctx.drawImage(s, 0, 0);
    } catch {
      // tainted canvas (cross-origin) – best-effort skip
    }
  }
}

function rewriteLocalRefs(root: HTMLElement, idMap: Map<string, string>): void {
  const xlinkNs = "http://www.w3.org/1999/xlink";
  const replaceUrl = (s: string): string =>
    s.replace(/url\(\s*#([^)\s"']+)\s*\)/g, (m, id) => {
      const next = idMap.get(id);
      return next ? `url(#${next})` : m;
    });
  const visit = (el: Element): void => {
    for (let i = 0; i < el.attributes.length; i++) {
      const a = el.attributes[i]!;
      if (a.name === "id") continue;
      if (a.value.includes("url(#")) {
        a.value = replaceUrl(a.value);
      } else if ((a.localName === "href" || a.name === "href") && a.value.startsWith("#")) {
        const next = idMap.get(a.value.slice(1));
        if (next) a.value = "#" + next;
      }
    }
    const xhref = el.getAttributeNS(xlinkNs, "href");
    if (xhref && xhref.startsWith("#")) {
      const next = idMap.get(xhref.slice(1));
      if (next) el.setAttributeNS(xlinkNs, "href", "#" + next);
    }
    for (const child of Array.from(el.children)) visit(child);
  };
  visit(root);
}
