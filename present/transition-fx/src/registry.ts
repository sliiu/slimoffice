import type { SlideTransition } from "@ppt/core";
import * as fx2d from "./2d";
import * as fx3d from "./3d";
import * as fxGl from "./webgl";
import { morph } from "./morph";
import type { TransitionFactory, TransitionCtx } from "./types";

const registry = new Map<string, TransitionFactory>();

function register(name: string, fn: TransitionFactory): void {
  registry.set(name, fn);
}

register("cut", fx2d.cut);
register("fade", fx2d.fade);
register("push", fx2d.push);
register("cover", fx2d.cover);
register("uncover", fx2d.uncover);
register("wipe", fx2d.wipe);
register("split", fx2d.split);
register("zoom", fx2d.zoom);
register("blinds", fx2d.blinds);
register("checker", fx2d.checker);
register("randomBar", fx2d.randomBar);
register("dissolve", fxGl.dissolveWebGL);
register("newsflash", fx2d.newsflash);
register("wheel", fx2d.wheel);
register("wheelReverse", fx2d.wheelReverse);
register("circle", fx2d.circle);
register("diamond", fx2d.diamond);
register("plus", fx2d.plus);
register("comb", fx2d.comb);
register("strips", fx2d.strips);
register("wedge", fx2d.wedge);
register("fall", fx2d.fall);
register("reveal", fx2d.reveal);
register("flash", fx2d.flash);
register("random", fx2d.random);
register("glitter", fx2d.glitter);
register("honeycomb", fx2d.honeycomb);
register("fracture", fx2d.fracture);
register("shred", fx2d.shred);
register("prestige", fx2d.prestige);
register("prism", fx3d.prism);

register("cube", fxGl.cubeWebGL);
register("box", fxGl.boxWebGL);
register("gallery", fx3d.gallery);
register("orbit", fx3d.orbit);
register("conveyor", fx3d.conveyor);
register("doors", fx3d.doors);
register("window", fx3d.window);
register("pageCurl", fxGl.pageCurlWebGL);
register("pageCurlSingle", fx3d.pageCurlSingle);
register("wind", fx3d.wind);
register("crush", fx3d.crush);
register("pageCurlCss", fx3d.pageCurl);
register("airplane", fx3d.airplane);
register("origami", fx3d.origami);
register("flythrough", fx3d.flythrough);
register("rotate", fx3d.rotate);
register("ferris", fx3d.ferris);
register("peelOff", fx3d.peelOff);
register("curtains", fx3d.curtains);
register("drape", fx3d.drape);
register("ripple", fx3d.ripple);
register("warp", fx3d.warp);
register("vortex", fx3d.vortex);
register("flip", fx3d.flip);
register("switch", fx3d.switchFx);

register("morph", morph);

export function getTransition(kind: string): TransitionFactory | undefined {
  return registry.get(kind);
}

export function listTransitions(): string[] {
  return [...registry.keys()];
}

export function registerTransition(kind: string, fn: TransitionFactory): void {
  register(kind, fn);
}

export async function runTransition(
  ghost: HTMLElement,
  stage: HTMLElement,
  transition: SlideTransition,
): Promise<void> {
  if (transition.kind === "cut" || transition.duration <= 0) return;
  const fn = registry.get(transition.kind) ?? registry.get("fade");
  if (!fn) return;
  const rect = stage.getBoundingClientRect();
  const ctx: TransitionCtx = {
    ghost,
    stage,
    duration: transition.duration,
    params: (transition.params as Record<string, unknown>) ?? {},
    transition,
    stageSize: { w: rect.width, h: rect.height },
  };
  await fn(ctx);
}
