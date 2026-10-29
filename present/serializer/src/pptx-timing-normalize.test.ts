import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ooxml } from "@ppt/animation";
import { needsOoxmlNormalization, normalizeTimingForOoxml } from "./pptx-timing-normalize.js";
import { serializeTiming } from "./pptx-timing.js";

type Par = ooxml.ParNode;

let nextId = 100;
const id = (): string => String(nextId++);

/** 复刻 editor insertEffect + 模板展开的产物：mainSeq 直挂包装 par，cTn.delay 非标。 */
function wrapper(
  nodeType: "clickEffect" | "withEffect" | "afterEffect",
  spid: string,
  opts: { delayMs?: number; durMs?: number; presetSubtype?: number; repeatCount?: number } = {},
): Par {
  const dur = opts.durMs ?? 500;
  const inner: Par = {
    kind: "par",
    ctn: {
      id: id(),
      presetID: 10,
      presetClass: "entr",
      presetSubtype: 0,
      fill: "hold",
      grpId: 0,
      nodeType: "clickEffect", // 模板从源 PPT 抄来的，包装层才是真值
      stCondLst: [{ delay: 0 }],
      childTnLst: [
        {
          kind: "set",
          cBhvr: { ctn: { id: id(), dur: 1, fill: "hold", stCondLst: [{ delay: 0 }] }, tgtEl: { spTgt: { spid } }, attrNameLst: ["style.visibility"] },
          to: { kind: "str", val: "visible" },
        },
        { kind: "animEffect", transition: "in", filter: "fade", cBhvr: { ctn: { id: id(), dur }, tgtEl: { spTgt: { spid } } } },
      ],
    },
  };
  return {
    kind: "par",
    ctn: {
      id: id(),
      fill: "hold",
      presetID: 10,
      presetClass: "entr",
      presetSubtype: opts.presetSubtype,
      nodeType,
      delay: opts.delayMs ?? 0,
      dur,
      ...(opts.repeatCount !== undefined ? { repeatCount: opts.repeatCount } : {}),
      childTnLst: [inner],
    },
  };
}

function timingOf(children: ooxml.TimeNode[]): ooxml.OoxmlTiming {
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
              ctn: { id: "2", nodeType: "mainSeq", childTnLst: children },
              prevCondLst: [{ evt: "onPrev", delay: 0, tgtEl: { sldTgt: true } }],
              nextCondLst: [{ evt: "onNext", delay: 0, tgtEl: { sldTgt: true } }],
            },
          ],
        },
      },
    ],
    bldLst: [],
  };
}

function mainSeq(t: ooxml.OoxmlTiming): ooxml.SeqNode {
  const root = t.tnLst[0] as Par;
  return root.ctn.childTnLst![0] as ooxml.SeqNode;
}

function condDelay(c: ooxml.CTn): ooxml.DurationValue | undefined {
  return c.stCondLst?.[0]?.delay;
}

describe("normalizeTimingForOoxml", () => {
  it("does not mutate the in-memory tree", () => {
    const t = timingOf([wrapper("clickEffect", "3", { delayMs: 250 })]);
    const before = JSON.stringify(t);
    normalizeTimingForOoxml(t);
    assert.equal(JSON.stringify(t), before);
  });

  it("moves cTn.delay into stCondLst and never writes a delay attribute on cTn", () => {
    const t = timingOf([wrapper("clickEffect", "3", { delayMs: 250 })]);
    const xml = serializeTiming(t);
    assert.doesNotMatch(xml, /<p:cTn[^>]*\sdelay=/);
    assert.match(xml, /<p:cond delay="250"/);
  });

  it("wraps click effects into PowerPoint's click-group → with-group → effect nesting", () => {
    const t = normalizeTimingForOoxml(timingOf([wrapper("clickEffect", "3")]));
    const seq = mainSeq(t);
    assert.equal(seq.ctn.dur, "indefinite");
    const click = (seq.ctn.childTnLst as Par[])[0]!;
    assert.equal(click.ctn.presetID, undefined, "click group must not carry preset fields");
    assert.equal(click.ctn.nodeType, undefined);
    assert.equal(click.ctn.fill, "hold");
    assert.deepEqual(click.ctn.stCondLst, [{ delay: "indefinite" }]);
    const withGroup = (click.ctn.childTnLst as Par[])[0]!;
    assert.equal(withGroup.ctn.presetID, undefined);
    assert.deepEqual(withGroup.ctn.stCondLst, [{ delay: 0 }]);
    const effect = (withGroup.ctn.childTnLst as Par[])[0]!;
    assert.equal(effect.ctn.presetID, 10);
    assert.equal(effect.ctn.presetClass, "entr");
    assert.equal(effect.ctn.nodeType, "clickEffect");
    assert.equal(effect.ctn.grpId, 0);
    assert.equal(effect.ctn.childTnLst!.length, 2, "effect keeps set + animEffect leaves");
  });

  it("attaches with/after effects to the preceding click group with after-delays from the group's end", () => {
    const t = normalizeTimingForOoxml(
      timingOf([
        wrapper("clickEffect", "3", { durMs: 500 }),
        wrapper("withEffect", "4", { durMs: 700, delayMs: 100 }),
        wrapper("afterEffect", "5", { durMs: 300 }),
        wrapper("afterEffect", "6", { durMs: 300, delayMs: 50 }),
        wrapper("clickEffect", "7"),
      ]),
    );
    const groups = mainSeq(t).ctn.childTnLst as Par[];
    assert.equal(groups.length, 2, "two clicks → two click groups");
    const withGroups = groups[0]!.ctn.childTnLst as Par[];
    assert.equal(withGroups.length, 3);
    assert.equal(condDelay(withGroups[0]!.ctn), 0);
    // 第一组结束于 max(500, 100+700) = 800
    assert.equal(condDelay(withGroups[1]!.ctn), 800);
    // 第二组 300ms 后 → 1100
    assert.equal(condDelay(withGroups[2]!.ctn), 1100);
    const effects0 = withGroups[0]!.ctn.childTnLst as Par[];
    assert.equal(effects0.length, 2);
    assert.equal(effects0[1]!.ctn.nodeType, "withEffect");
    assert.equal(condDelay(effects0[1]!.ctn), 100, "user delay lives on the effect node");
    const after2 = (withGroups[2]!.ctn.childTnLst as Par[])[0]!;
    assert.equal(after2.ctn.nodeType, "afterEffect");
    assert.equal(condDelay(after2.ctn), 50);
    assert.equal((groups[1]!.ctn.childTnLst as Par[]).length, 1);
  });

  it("auto-starts the first group when the deck opens with a with/after-previous effect", () => {
    const t = normalizeTimingForOoxml(timingOf([wrapper("afterEffect", "3")]));
    const click = (mainSeq(t).ctn.childTnLst as Par[])[0]!;
    assert.deepEqual(click.ctn.stCondLst, [{ delay: "indefinite" }, { evt: "onBegin", delay: 0, tn: "2" }]);
  });

  it("moves editor-level repeat/subtype from the wrapper onto the effect node", () => {
    const t = normalizeTimingForOoxml(timingOf([wrapper("clickEffect", "3", { presetSubtype: 4, repeatCount: 3000 })]));
    const effect = ((mainSeq(t).ctn.childTnLst![0] as Par).ctn.childTnLst![0] as Par).ctn.childTnLst![0] as Par;
    assert.equal(effect.ctn.presetSubtype, 4);
    assert.equal(effect.ctn.repeatCount, 3000);
  });

  it("adds a bldP per animated shape, paragraph builds when the target is a pRg", () => {
    const w = wrapper("clickEffect", "3");
    const para = wrapper("clickEffect", "9");
    for (const leaf of (para.ctn.childTnLst![0] as Par).ctn.childTnLst!) {
      (leaf as ooxml.SetNode).cBhvr.tgtEl.spTgt!.txEl = { pRg: { st: 0, end: 0 } };
    }
    const t = normalizeTimingForOoxml(timingOf([w, wrapper("withEffect", "3"), para]));
    assert.deepEqual(t.bldLst, [
      { kind: "bldP", spid: "3", grpId: 0 },
      { kind: "bldP", spid: "9", grpId: 0, build: "p" },
    ]);
    assert.match(serializeTiming(t), /<p:bldLst><p:bldP spid="3" grpId="0"\/><p:bldP spid="9" grpId="0" build="p"\/><\/p:bldLst>/);
  });

  it("drops effects whose target never got a numeric cNvPr id (deleted / renamed shape) instead of writing the logical id", () => {
    const t = normalizeTimingForOoxml(timingOf([
      wrapper("clickEffect", "3"),
      wrapper("withEffect", "dg_data_title_1"),
      wrapper("clickEffect", "sp_gone"),
    ]));
    const xml = serializeTiming(t);
    assert.doesNotMatch(xml, /spid="(dg_|sp_)/);
    assert.equal((xml.match(/<p:spTgt spid="3"/g) ?? []).length, 2);
    // 第二个点击组只剩悬空效果，整组连同 bldP 一起消失。
    assert.equal(mainSeq(t).ctn.childTnLst!.length, 1);
    assert.deepEqual(t.bldLst, [{ kind: "bldP", spid: "3", grpId: 0 }]);
  });

  it("allocates fresh cTn ids for the new group nodes", () => {
    const t = normalizeTimingForOoxml(timingOf([wrapper("clickEffect", "3"), wrapper("afterEffect", "4")]));
    const ids: string[] = [];
    const visit = (n: ooxml.TimeNode): void => {
      const c = n.kind === "par" || n.kind === "seq" || n.kind === "excl" ? n.ctn : "cBhvr" in n ? n.cBhvr.ctn : n.cMediaNode.ctn;
      if (c.id) ids.push(c.id);
      for (const ch of c.childTnLst ?? []) visit(ch);
    };
    for (const n of t.tnLst) visit(n);
    assert.equal(new Set(ids).size, ids.length, `duplicate cTn ids: ${ids.join(",")}`);
  });

  it("passes a canonical PowerPoint tree through untouched", () => {
    const canonical: Par = {
      kind: "par",
      ctn: {
        id: "3",
        fill: "hold",
        stCondLst: [{ delay: "indefinite" }],
        childTnLst: [
          {
            kind: "par",
            ctn: {
              id: "4",
              fill: "hold",
              stCondLst: [{ delay: 0 }],
              childTnLst: [
                {
                  kind: "par",
                  ctn: {
                    id: "5",
                    presetID: 1,
                    presetClass: "entr",
                    presetSubtype: 0,
                    fill: "hold",
                    nodeType: "clickEffect",
                    stCondLst: [{ delay: 0 }],
                    childTnLst: [
                      {
                        kind: "set",
                        cBhvr: { ctn: { id: "6", dur: 1, fill: "hold" }, tgtEl: { spTgt: { spid: "2" } }, attrNameLst: ["style.visibility"] },
                        to: { kind: "str", val: "visible" },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    };
    const t = timingOf([canonical]);
    mainSeq(t).ctn.dur = "indefinite";
    t.bldLst = [{ kind: "bldP", spid: "2", grpId: 0 }];
    assert.equal(JSON.stringify(normalizeTimingForOoxml(t)), JSON.stringify(t));
  });

  it("flags editor-shaped trees so round-trip rewrites them even when unedited", () => {
    assert.equal(needsOoxmlNormalization(undefined), false);
    assert.equal(needsOoxmlNormalization(timingOf([])), false);
    assert.equal(needsOoxmlNormalization(timingOf([wrapper("clickEffect", "3")])), true);
    const normalized = normalizeTimingForOoxml(timingOf([wrapper("clickEffect", "3"), wrapper("afterEffect", "4", { delayMs: 200 })]));
    assert.equal(needsOoxmlNormalization(normalized), false, "normalized output must be a fixed point");
  });

  it("hangs a trailing with-previous edit onto an existing canonical click group", () => {
    const canonicalClick: Par = {
      kind: "par",
      ctn: {
        id: "3",
        fill: "hold",
        stCondLst: [{ delay: "indefinite" }],
        childTnLst: [
          {
            kind: "par",
            ctn: {
              id: "4",
              fill: "hold",
              stCondLst: [{ delay: 0 }],
              childTnLst: [
                {
                  kind: "par",
                  ctn: {
                    id: "5",
                    presetID: 1,
                    presetClass: "entr",
                    fill: "hold",
                    nodeType: "clickEffect",
                    stCondLst: [{ delay: 0 }],
                    childTnLst: [
                      {
                        kind: "set",
                        cBhvr: { ctn: { id: "6", dur: 1, fill: "hold" }, tgtEl: { spTgt: { spid: "2" } }, attrNameLst: ["style.visibility"] },
                        to: { kind: "str", val: "visible" },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    };
    const t = normalizeTimingForOoxml(timingOf([canonicalClick, wrapper("withEffect", "7"), wrapper("afterEffect", "8")]));
    const groups = mainSeq(t).ctn.childTnLst as Par[];
    assert.equal(groups.length, 1);
    const withGroups = groups[0]!.ctn.childTnLst as Par[];
    assert.equal(withGroups.length, 2);
    assert.equal(withGroups[0]!.ctn.childTnLst!.length, 2);
    // 原效果 1ms + with 500ms → after 组从 500 开始
    assert.equal(condDelay(withGroups[1]!.ctn), 500);
  });
});
