import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Animatable } from "../../types";
import { getCTn, getChildren, type OoxmlTiming, type TimeNode } from "../types";
import { expandPresetTemplate, findPresetTemplate } from "../presets-template";
import { TimingRuntime } from "../runtime";
import { ManualTicker } from "../ticker";
import { compileTiming } from "./core";
import type { CompileCtx } from "./types";

const ctx: CompileCtx = {
  slideWidth: 1280,
  slideHeight: 720,
  resolve: (tgt) => (tgt.spTgt ? { id: `sp_${tgt.spTgt.spid}`, bbox: { x: 100, y: 100, w: 100, h: 100 } } : null),
};

function clickTiming(effect: TimeNode): OoxmlTiming {
  const click: TimeNode = {
    kind: "par",
    ctn: {
      id: "3",
      fill: "hold",
      stCondLst: [{ delay: "indefinite" }],
      childTnLst: [{ kind: "par", ctn: { id: "4", fill: "hold", stCondLst: [{ delay: 0 }], childTnLst: [effect] } }],
    },
  };
  return {
    tnLst: [
      {
        kind: "par",
        ctn: {
          id: "1",
          dur: "indefinite",
          restart: "never",
          nodeType: "tmRoot",
          childTnLst: [{ kind: "seq", concurrent: true, nextAc: "seek", ctn: { id: "2", dur: "indefinite", nodeType: "mainSeq", childTnLst: [click] } }],
        },
      },
    ],
    bldLst: [],
  } as OoxmlTiming;
}

function effect(cls: "emph", id: number): TimeNode {
  const tpl = findPresetTemplate(cls, id);
  assert.ok(tpl, `template ${cls} ${id}`);
  return expandPresetTemplate(tpl, { tgtSpid: "7" });
}

function recorder(): { target: Animatable; props: Map<string, unknown> } {
  const props = new Map<string, unknown>();
  return { props, target: { setProperty: (k, v) => void props.set(k, v), getProperty: (k) => props.get(k) } };
}

function playToEnd(timing: OoxmlTiming, target: Animatable, ms: number): void {
  const ticker = new ManualTicker();
  const rt = new TimingRuntime({ timing: compileTiming(timing, ctx), resolve: () => target, ticker });
  rt.click();
  for (let t = 0; t < ms; t += 50) ticker.tick(50);
}

describe("autoRev", () => {
  it("an auto-reversed Grow/Shrink ends back at its original scale", () => {
    const grow = effect("emph", 6);
    getCTn(grow).autoRev = true;
    const { target, props } = recorder();
    playToEnd(clickTiming(grow), target, 1000);
    const peak = props.get("scaleX");
    assert.ok(typeof peak === "number" && peak > 1.2, `grows first: ${String(peak)}`);
    playToEnd(clickTiming(grow), target, 6000);
    assert.equal(props.get("scaleX"), 1);
  });

  it("reverses an auto-reversed effect merged into a flat click segment", () => {
    // 编辑器 / AI 写出的平铺 mainSeq：[clickEffect(autoRev), afterEffect] 被 emitSegment
    // 打包成一个 step，autoRev 的 effect 不再是 step 根。
    const grow = effect("emph", 6);
    getCTn(grow).autoRev = true;
    const spin = effect("emph", 8);
    getCTn(spin).nodeType = "afterEffect";
    const timing = clickTiming(grow);
    getCTn(getChildren(timing.tnLst[0]!)[0]!).childTnLst = [grow, spin];
    const [step] = compileTiming(timing, ctx).mainSteps;
    assert.ok(step);
    const growAtoms = step.atoms.filter((a) => a.atom.source.kind === "animScale");
    assert.ok(growAtoms.length > 0 && growAtoms.every((a) => a.atom.autoReverse));
    const spinStart = step.atoms.find((a) => a.atom.source.kind === "animRot")!.offset;
    assert.ok(Math.abs(spinStart - 2 * growAtoms[0]!.atom.duration) < 1e-6, `after-effect waits for the reverse: ${spinStart}`);
  });

  it("Pulse keeps PowerPoint's tmFilter so its fade returns to fully visible", () => {
    const pulse = effect("emph", 26);
    const fade = getChildren(pulse).find((c) => c.kind === "animEffect");
    assert.ok(fade && "cBhvr" in fade);
    assert.equal(fade.cBhvr.ctn.tmFilter, "0, 0; .2, .5; .8, .5; 1, 0");

    const visibility = (ms: number): number => {
      const { target, props } = recorder();
      playToEnd(clickTiming(effect("emph", 26)), target, ms);
      return Number(String(props.get("effect:fade")).split("|")[1]);
    };
    assert.equal(visibility(250), 0.5, "dips to half on the tmFilter plateau");
    assert.equal(visibility(2000), 1, "ends fully visible");
  });
});
