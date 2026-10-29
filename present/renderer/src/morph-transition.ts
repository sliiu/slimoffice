import type { Scene } from "./scene-node";
import { SvgBackend } from "./svg-backend";

function overlayBoxStyle(stage: HTMLElement): string {
  return [
    "position:absolute",
    `left:${stage.offsetLeft}px`,
    `top:${stage.offsetTop}px`,
    `width:${stage.style.width || `${stage.clientWidth}px`}`,
    `height:${stage.style.height || `${stage.clientHeight}px`}`,
    "pointer-events:none",
    "overflow:hidden",
  ].join(";");
}

export interface MorphTransitionMount {
  ghost: HTMLElement;
  target: HTMLElement;
  cleanup(): void;
}

/**
 * Mount SVG shape layers for morph (FLIP) when the live stage lacks per-shape DOM
 * ids (canvas / hybrid bitmap segments). Pure-SVG stages only need the ghost overlay.
 */
export function mountMorphTransitionLayers(
  stageWrap: HTMLElement,
  stage: HTMLElement,
  prevScene: Scene,
  curScene: Scene,
  opts: { ghostZIndex?: number; stageZIndex?: number; chromeBg?: string } = {},
): MorphTransitionMount {
  const ghostZ = opts.ghostZIndex ?? 1000;
  const stageZ = opts.stageZIndex ?? 1001;

  const ghostWrap = document.createElement("div");
  ghostWrap.style.cssText = `${overlayBoxStyle(stage)};z-index:${ghostZ}`;
  if (opts.chromeBg) ghostWrap.style.background = opts.chromeBg;
  stageWrap.appendChild(ghostWrap);

  const ghostBe = new SvgBackend(prevScene, ghostWrap, { transparent: true });
  ghostBe.flush();

  const needsStageOverlay = !stage.querySelector("[data-id],[data-shape-id]");
  let stageOverlay: HTMLDivElement | null = null;
  let stageBe: SvgBackend | null = null;
  let target: HTMLElement = stage;
  let hidStage = false;

  if (needsStageOverlay) {
    stageOverlay = document.createElement("div");
    stageOverlay.style.cssText = `${overlayBoxStyle(stage)};z-index:${stageZ}`;
    stageWrap.appendChild(stageOverlay);
    stageBe = new SvgBackend(curScene, stageOverlay, { transparent: true });
    stageBe.flush();
    target = stageOverlay;
    stage.style.visibility = "hidden";
    hidStage = true;
  }

  return {
    ghost: ghostWrap,
    target,
    cleanup() {
      ghostBe.destroy();
      stageBe?.destroy();
      ghostWrap.remove();
      stageOverlay?.remove();
      if (hidStage) stage.style.visibility = "";
    },
  };
}
