import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ooxml } from "@ppt/animation";
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

// [MS-PPTX] §2.3：p14 / p15 / p159 过渡与精确时长只能出现在 mc:Choice 里，p 命名空间下不能有
// 未知元素 / 属性。xmllint + ISO 29500-4 XSD 对这些形状全部 0 报错。
describe("serializeTransition MCE shapes", () => {
  it("writes an ECMA transition without a precise duration as a bare <p:transition>", () => {
    assert.equal(serializeTransition({ kind: "push", duration: undefined as unknown as number, params: { dir: "up" } }), `<p:transition><p:push dir="u"/></p:transition>`);
  });

  it("moves a precise duration into p14:dur inside a Requires=p14 Choice with a dur-less Fallback", () => {
    const xml = serializeTransition({ kind: "fade", duration: 1.6, params: {} });
    assert.match(xml, /<mc:Choice Requires="p14"><p:transition spd="slow" p14:dur="1600"><p:fade\/><\/p:transition><\/mc:Choice>/);
    assert.match(xml, /<mc:Fallback><p:transition spd="slow"><p:fade\/><\/p:transition><\/mc:Fallback>/);
    assert.doesNotMatch(xml, / dur="/);
  });

  it("emits PowerPoint 2010 kinds as p14 elements (never <p:vortex>)", () => {
    const xml = serializeTransition({ kind: "vortex", duration: 1.25, params: { dir: "left" } });
    assert.match(xml, /Requires="p14"><p:transition spd="slow" p14:dur="1250"><p14:vortex dir="l"\/>/);
    assert.match(xml, /<mc:Fallback><p:transition spd="slow"><p:fade\/>/);
    assert.doesNotMatch(xml, /<p:vortex/);
  });

  it("folds the editor's cube/box/rotate/orbit onto p14:prism flags and round-trips explicit prism flags", () => {
    assert.match(serializeTransition({ kind: "orbit", duration: 1, params: {} }), /<p14:prism isContent="1" isInverted="1"\/>/);
    assert.match(serializeTransition({ kind: "cube", duration: 1, params: {} }), /<p14:prism\/>/);
    assert.match(serializeTransition({ kind: "prism", duration: 1, params: { isInverted: true } }), /<p14:prism isInverted="1"\/>/);
  });

  it("emits PowerPoint 2013 kinds as <p15:prstTrans prst=…/> and Morph as <p159:morph/>", () => {
    const air = serializeTransition({ kind: "airplane", duration: 2, params: {} });
    assert.match(air, /<mc:Choice Requires="p15" xmlns:p15="http:\/\/schemas.microsoft.com\/office\/powerpoint\/2012\/main"><p:transition spd="slow" p14:dur="2000"><p15:prstTrans prst="airplane"\/>/);
    assert.match(serializeTransition({ kind: "airplane", duration: 2, params: { dir: "right" } }), /<p15:prstTrans prst="airplane" invX="1"\/>/);
    assert.match(serializeTransition({ kind: "airplane", duration: 2, params: { dir: "left" } }), /<p15:prstTrans prst="airplane"\/>/);
    assert.match(serializeTransition({ kind: "fall", duration: 2, params: {} }), /<p15:prstTrans prst="fallOver"\/>/);
    assert.match(serializeTransition({ kind: "wind", duration: 0.7, params: { dir: "right" } }), /<p15:prstTrans prst="wind" invX="1"\/>/);
    assert.match(serializeTransition({ kind: "crush", duration: 0.7, params: { dir: "down" } }), /<p15:prstTrans prst="crush" invY="1"\/>/);
    assert.match(serializeTransition({ kind: "pageCurlSingle", duration: 0.7, params: {} }), /<p15:prstTrans prst="pageCurlSingle"\/>/);
    const morph = serializeTransition({ kind: "morph", duration: 2, params: { option: "byWord" } });
    assert.match(morph, /<mc:Choice Requires="p159" xmlns:p159="http:\/\/schemas.microsoft.com\/office\/powerpoint\/2015\/09\/main"><p:transition spd="slow" p14:dur="2000"><p159:morph option="byWord"\/>/);
    assert.doesNotMatch(morph, /extLst/);
  });

  it("writes schema-valid direction attributes (pull for Uncover, lu/ru/ld/rd corners, horz/vert as dir)", () => {
    assert.match(serializeTransition({ kind: "uncover", duration: 0, params: { dir: "topRight" } }), /<p:pull dir="ru"\/>/);
    assert.match(serializeTransition({ kind: "strips", duration: 0, params: { dir: "bottomLeft" } }), /<p:strips dir="ld"\/>/);
    assert.match(serializeTransition({ kind: "blinds", duration: 0, params: { orient: "vert" } }), /<p:blinds dir="vert"\/>/);
    assert.match(serializeTransition({ kind: "split", duration: 0, params: { orient: "vert", dir: "in" } }), /<p:split dir="in" orient="vert"\/>/);
    assert.match(serializeTransition({ kind: "doors", duration: 1, params: { orient: "horz" } }), /<p14:doors dir="horz"\/>/);
  });

  it("downgrades an unknown kind to fade rather than inventing a p-namespace element", () => {
    const xml = serializeTransition({ kind: "notAThing", duration: 0.5, params: {} } as never);
    assert.match(xml, /<mc:Choice Requires="p14"><p:transition spd="fast" p14:dur="500"><p:fade\/><\/p:transition><\/mc:Choice><mc:Fallback><p:transition spd="fast"><p:fade\/><\/p:transition><\/mc:Fallback>/);
    assert.doesNotMatch(xml, /notAThing/);
  });
});
