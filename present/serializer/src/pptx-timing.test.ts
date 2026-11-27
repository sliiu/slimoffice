import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ooxml } from "@sliiu/present-animation";
import { serializeTiming, serializeTransition } from "./pptx-timing.js";

// 标准三层树：mainSeq → 点击组 → 同步组 → 效果 par(children)。normalize 对它是不动点，
// 这样断言的就是叶子节点本身的 XML 形状。
function timingWith(leaves: ooxml.TimeNode[], effectCtn: Partial<ooxml.CTn> = {}): ooxml.OoxmlTiming {
  return {
    tnLst: [
      {
        kind: "par",
        ctn: {
          id: "1", dur: "indefinite", restart: "never", nodeType: "tmRoot",
          childTnLst: [
            {
              kind: "seq", concurrent: true, nextAc: "seek",
              ctn: {
                id: "2", dur: "indefinite", nodeType: "mainSeq",
                childTnLst: [
                  {
                    kind: "par",
                    ctn: {
                      id: "3", fill: "hold", stCondLst: [{ delay: "indefinite" }],
                      childTnLst: [
                        {
                          kind: "par",
                          ctn: {
                            id: "4", fill: "hold", stCondLst: [{ delay: 0 }],
                            childTnLst: [
                              {
                                kind: "par",
                                ctn: {
                                  id: "5", presetID: 6, presetClass: "emph", fill: "hold", nodeType: "clickEffect",
                                  stCondLst: [{ delay: 0 }], childTnLst: leaves, ...effectCtn,
                                },
                              },
                            ],
                          },
                        },
                      ],
                    },
                  },
                ],
              },
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

const tgt: ooxml.TgtEl = { spTgt: { spid: "4" } };

describe("serializeTiming leaf XML shapes (ECMA-376 §19.5)", () => {
  it("writes animScale / animMotion points as CT_TLPoint attributes, not a nested <p:pt>", () => {
    const xml = serializeTiming(timingWith([
      { kind: "animScale", cBhvr: { ctn: { id: "6", dur: 2000 }, tgtEl: tgt }, by: { x: 150000, y: 150000 } },
      { kind: "animMotion", origin: "layout", path: "M 0 0 L 0.1 0.1 E", cBhvr: { ctn: { id: "7", dur: 2000 }, tgtEl: tgt }, from: { x: 1, y: 2 }, to: { x: 3, y: 4 }, rCtr: { x: 5, y: 6 } },
    ]));
    assert.match(xml, /<p:animScale><p:cBhvr>.*?<\/p:cBhvr><p:by x="150000" y="150000"\/><\/p:animScale>/);
    assert.match(xml, /<p:from x="1" y="2"\/><p:to x="3" y="4"\/><p:rCtr x="5" y="6"\/>/);
    assert.doesNotMatch(xml, /<p:pt /);
  });

  it("wraps set/anim colour values in <p:clrVal> and writes hex without '#'", () => {
    const xml = serializeTiming(timingWith([
      {
        kind: "set",
        cBhvr: { ctn: { id: "6", dur: 1 }, tgtEl: tgt, attrNameLst: ["fillcolor"] },
        to: { kind: "clr", val: { hex: "#FF0000" } },
      },
      {
        kind: "set",
        cBhvr: { ctn: { id: "7", dur: 1 }, tgtEl: tgt, attrNameLst: ["stroke.color"] },
        to: { kind: "clr", val: { scheme: "accent2", modifiers: [{ kind: "lumMod", val: 75000 }] } },
      },
    ]));
    assert.match(xml, /<p:to><p:clrVal><a:srgbClr val="FF0000"(\/>|><\/a:srgbClr>)<\/p:clrVal><\/p:to>/);
    assert.match(xml, /<p:to><p:clrVal><a:schemeClr val="accent2"><a:lumMod val="75000"\/><\/a:schemeClr><\/p:clrVal><\/p:to>/);
    assert.doesNotMatch(xml, /val="#/);
  });

  it("writes animClr from/to as bare CT_Color and by as rgb/hsl", () => {
    const xml = serializeTiming(timingWith([
      {
        kind: "animClr", clrSpc: "rgb",
        cBhvr: { ctn: { id: "6", dur: 500 }, tgtEl: tgt, attrNameLst: ["fillcolor"] },
        to: { hex: "#00FF00" },
        by: { rgb: { r: 1, g: 2, b: 3 } },
      },
    ]));
    assert.match(xml, /<p:animClr clrSpc="rgb"><p:cBhvr>.*?<\/p:cBhvr><p:by><p:rgb r="1" g="2" b="3"\/><\/p:by><p:to><a:srgbClr val="00FF00"(\/>|><\/a:srgbClr>)<\/p:to><\/p:animClr>/);
  });

  it("writes endSync as a CT_TLTimeCondition itself (attributes on <p:endSync>)", () => {
    const xml = serializeTiming(timingWith(
      [{ kind: "set", cBhvr: { ctn: { id: "6", dur: 1 }, tgtEl: tgt, attrNameLst: ["style.visibility"] }, to: { kind: "str", val: "visible" } }],
      { endSync: { evt: "end", delay: 0, rtn: "all" } },
    ));
    assert.match(xml, /<p:endSync evt="end" delay="0"><p:rtn val="all"\/><\/p:endSync>/);
    assert.doesNotMatch(xml, /<p:endSync><p:cond/);
  });

  it("keeps every stCondLst cond as <p:cond> (no positional tag leak from Array.map)", () => {
    const xml = serializeTiming(timingWith([
      { kind: "set", cBhvr: { ctn: { id: "6", dur: 1, stCondLst: [{ delay: 0 }, { evt: "onBegin", delay: 5, tn: "2" }] }, tgtEl: tgt, attrNameLst: ["style.visibility"] }, to: { kind: "str", val: "visible" } },
    ]));
    assert.match(xml, /<p:stCondLst><p:cond delay="0"><\/p:cond><p:cond evt="onBegin" delay="5"><p:tn val="2"\/><\/p:cond><\/p:stCondLst>/);
    assert.doesNotMatch(xml, /<p:\d/);
  });
});

// ECMA-376 §19.5.50：只写 p 命名空间。精确时长折成 spd 三档，标准外的切换退成 fade。
describe("serializeTransition ECMA shapes", () => {
  it("writes an ECMA transition without a duration as a bare <p:transition>", () => {
    assert.equal(serializeTransition({ kind: "push", duration: undefined as unknown as number, params: { dir: "up" } }), `<p:transition><p:push dir="u"/></p:transition>`);
  });

  it("folds a precise duration into the spd bucket and never writes p14:dur", () => {
    const xml = serializeTransition({ kind: "fade", duration: 1.6, params: {} });
    assert.equal(xml, `<p:transition spd="slow"><p:fade/></p:transition>`);
    assert.doesNotMatch(xml, /p14:|schemas\.microsoft\.com|AlternateContent/);
  });

  it("degrades a post-ECMA kind to fade instead of a p14 element", () => {
    const xml = serializeTransition({ kind: "vortex", duration: 1.25, params: { dir: "left" } });
    assert.equal(xml, `<p:transition spd="slow"><p:fade/></p:transition>`);
    assert.doesNotMatch(xml, /vortex|prism/);
  });

  it("degrades the 3D variants and Morph to fade", () => {
    for (const kind of ["orbit", "cube", "prism", "airplane", "morph"]) {
      const xml = serializeTransition({ kind, duration: 1, params: { option: "byWord" } });
      // 1s 落在 med 与 slow 的中点之上，归 slow。
      assert.equal(xml, `<p:transition spd="slow"><p:fade/></p:transition>`, kind);
      assert.doesNotMatch(xml, /p15:|p159:|schemas\.microsoft\.com/);
    }
  });

  it("writes schema-valid direction attributes (pull for Uncover, lu/ru/ld/rd corners, horz/vert as dir)", () => {
    assert.match(serializeTransition({ kind: "uncover", duration: 0, params: { dir: "topRight" } }), /<p:pull dir="ru"\/>/);
    assert.match(serializeTransition({ kind: "strips", duration: 0, params: { dir: "bottomLeft" } }), /<p:strips dir="ld"\/>/);
    assert.match(serializeTransition({ kind: "blinds", duration: 0, params: { orient: "vert" } }), /<p:blinds dir="vert"\/>/);
    assert.match(serializeTransition({ kind: "split", duration: 0, params: { orient: "vert", dir: "in" } }), /<p:split dir="in" orient="vert"\/>/);
    assert.equal(serializeTransition({ kind: "doors", duration: 1, params: { orient: "horz" } }), `<p:transition spd="slow"><p:fade/></p:transition>`);
  });

  it("downgrades an unknown kind to fade rather than inventing a p-namespace element", () => {
    const xml = serializeTransition({ kind: "notAThing", duration: 0.5, params: {} } as never);
    assert.equal(xml, `<p:transition spd="fast"><p:fade/></p:transition>`);
    assert.doesNotMatch(xml, /notAThing/);
  });
});
