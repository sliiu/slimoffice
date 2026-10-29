import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { expandPresetPlaceholders } from "./preset-expand";
import { compileTiming } from "./core";
import type { CompileCtx } from "./types";
import type { OoxmlTiming, TimeNode } from "../types";
import { getCTn, getChildren } from "../types";

const ctx: CompileCtx = {
  slideWidth: 1280,
  slideHeight: 720,
  resolve: (tgt) =>
    tgt.spTgt ? { id: `sp_${tgt.spTgt.spid}`, bbox: { x: 100, y: 100, w: 200, h: 80 } } : null,
};

function opacityAnim(id: string): TimeNode {
  return {
    kind: "anim",
    cBhvr: {
      ctn: { id, dur: 500, fill: "hold" },
      tgtEl: { spTgt: { spid: "7" } },
      attrNameLst: ["style.opacity"],
    },
    calcMode: "lin",
    valueType: "num",
    tavLst: [
      { tm: 0, val: { kind: "str", val: "0" } },
      { tm: 100000, val: { kind: "str", val: "1" } },
    ],
  };
}

function visibilitySet(id: string): TimeNode {
  return {
    kind: "set",
    cBhvr: {
      ctn: { id, dur: 1, fill: "hold" },
      tgtEl: { spTgt: { spid: "7" } },
      attrNameLst: ["style.visibility"],
    },
    to: { kind: "str", val: "visible" },
  };
}

function wrap(effect: TimeNode): OoxmlTiming {
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
          childTnLst: [
            {
              kind: "seq",
              concurrent: true,
              nextAc: "seek",
              ctn: { id: "2", dur: "indefinite", nodeType: "mainSeq", childTnLst: [click] },
            },
          ],
        },
      },
    ],
    bldLst: [],
  } as OoxmlTiming;
}

describe("preset placeholder expansion", () => {
  it("replaces a channel-less preset leaf with the sampled subtree", () => {
    const leaf: TimeNode = {
      kind: "anim",
      cBhvr: {
        ctn: {
          id: "5",
          presetID: 32,
          presetClass: "entr",
          fill: "hold",
          dur: 1000,
        },
        tgtEl: { spTgt: { spid: "7" } },
      },
    };
    const parent: TimeNode = {
      kind: "par",
      ctn: { id: "4", fill: "hold", nodeType: "clickEffect", childTnLst: [leaf] },
    };
    expandPresetPlaceholders(parent);
    const dumped = JSON.stringify(parent);
    assert.match(dumped, /0\.31/);
    assert.equal(getCTn(parent).nodeType, "clickEffect");
    assert.equal(
      getChildren(parent).some(
        (c) => (c.kind === "anim" || c.kind === "set") && !(c.cBhvr.attrNameLst && c.cBhvr.attrNameLst.length > 0),
      ),
      false,
    );
  });

  it("keeps a channel-less leaf when no template exists", () => {
    const leaf: TimeNode = {
      kind: "anim",
      cBhvr: {
        ctn: { id: "5", presetID: 99999, presetClass: "entr", fill: "hold" },
        tgtEl: { spTgt: { spid: "7" } },
      },
    };
    const parent: TimeNode = {
      kind: "par",
      ctn: { id: "4", fill: "hold", childTnLst: [leaf] },
    };
    expandPresetPlaceholders(parent);
    assert.equal(getChildren(parent).length, 1);
    assert.equal(getChildren(parent)[0]!.kind, "anim");
  });

  it("plays the sampled center-revolve tree for the unsampled same-name id", () => {
    const effect: TimeNode = {
      kind: "par",
      ctn: {
        id: "5",
        presetID: 32,
        presetClass: "entr",
        nodeType: "clickEffect",
        fill: "hold",
        childTnLst: [visibilitySet("6"), opacityAnim("7")],
      },
    };
    expandPresetPlaceholders(effect);
    const dumped = JSON.stringify(effect);
    assert.match(dumped, /0\.31/);
    assert.equal(getCTn(effect).presetID, 32);
    assert.equal(
      getChildren(effect).some((c) => c.kind === "anim" && c.cBhvr.attrNameLst?.[0] === "style.opacity"),
      false,
    );
  });

  it("leaves a real motion tree alone and does not replace its opacity leaf with the preset", () => {
    const motion: TimeNode = {
      kind: "anim",
      cBhvr: {
        ctn: { id: "8", dur: 500, fill: "hold" },
        tgtEl: { spTgt: { spid: "7" } },
        attrNameLst: ["ppt_x"],
      },
      calcMode: "lin",
      valueType: "num",
      tavLst: [
        { tm: 0, val: { kind: "str", val: "#ppt_x+9" } },
        { tm: 100000, val: { kind: "str", val: "#ppt_x" } },
      ],
    };
    const effect: TimeNode = {
      kind: "par",
      ctn: {
        id: "5",
        presetID: 2,
        presetClass: "entr",
        nodeType: "clickEffect",
        fill: "hold",
        childTnLst: [opacityAnim("7"), motion],
      },
    };
    const timing = wrap(effect);
    const [step] = compileTiming(timing, ctx).mainSteps;
    assert.ok(step);
    const dumped = JSON.stringify(step.atoms.map((a) => a.atom.source));
    assert.match(dumped, /#ppt_x\+9/);
    const opacityAtoms = step.atoms.filter(
      (a) => a.atom.source.kind === "anim" && a.atom.source.cBhvr.attrNameLst?.[0] === "style.opacity",
    );
    assert.equal(opacityAtoms.length, 1);
    assert.deepEqual(
      opacityAtoms[0]!.atom.tracks.map((t) => (t.kind === "prop" ? t.property : t.kind)),
      ["opacity"],
    );
  });
});
