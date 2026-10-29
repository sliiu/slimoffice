import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseSlideTransition } from "./transition.js";
import { findByLocalName, parseXml } from "./xml.js";

const NS = `xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main" xmlns:p15="http://schemas.microsoft.com/office/powerpoint/2012/main" xmlns:p159="http://schemas.microsoft.com/office/powerpoint/2015/09/main"`;

function parse(inner: string) {
  const doc = parseXml(`<p:sld ${NS}>${inner}</p:sld>`);
  return parseSlideTransition(findByLocalName(doc, "sld"));
}

// 下面的 XML 都是 PowerPoint 自己写出来的形状（[MS-PPTX] §2.3 Slide Transitions 示例 + 真实样例）。
describe("parseSlideTransition (PowerPoint 2010+ MCE forms)", () => {
  it("reads the precise p14:dur instead of collapsing to the spd bucket", () => {
    const t = parse(`<mc:AlternateContent><mc:Choice Requires="p14"><p:transition spd="slow" p14:dur="1600"><p14:conveyor dir="l"/></p:transition></mc:Choice><mc:Fallback><p:transition spd="slow"><p:fade/></p:transition></mc:Fallback></mc:AlternateContent>`);
    assert.equal(t?.kind, "conveyor");
    assert.equal(t?.duration, 1.6);
    assert.equal(t?.params?.dir, "left");
  });

  it("still accepts a bare dur attribute (our own older output) and plain ECMA transitions", () => {
    assert.equal(parse(`<p:transition spd="fast" dur="300"><p:wipe dir="r"/></p:transition>`)?.duration, 0.3);
    const t = parse(`<p:transition spd="med"><p:push dir="u"/></p:transition>`);
    assert.equal(t?.kind, "push");
    assert.equal(t?.duration, 0.75);
  });

  it("maps p15:prstTrans directly under p:transition to its prst kind", () => {
    const t = parse(`<mc:AlternateContent><mc:Choice Requires="p15"><p:transition spd="slow" p14:dur="2000"><p15:prstTrans prst="airplane"/></p:transition></mc:Choice><mc:Fallback><p:transition spd="slow"><p:fade/></p:transition></mc:Fallback></mc:AlternateContent>`);
    assert.equal(t?.kind, "airplane");
    assert.equal(t?.duration, 2);
    assert.equal(t?.params?.dir, undefined);
  });

  it("keeps wind, crush, and pageCurlSingle, and reads invX / invY", () => {
    const wind = parse(`<p:transition><p15:prstTrans prst="wind" invX="1"/></p:transition>`);
    assert.equal(wind?.kind, "wind");
    assert.equal(wind?.params?.dir, "right");
    const crush = parse(`<p:transition><p15:prstTrans prst="crush" invY="1"/></p:transition>`);
    assert.equal(crush?.kind, "crush");
    assert.equal(crush?.params?.dir, "down");
    assert.equal(parse(`<p:transition><p15:prstTrans prst="pageCurlSingle"/></p:transition>`)?.kind, "pageCurlSingle");
    assert.equal(parse(`<p:transition><p15:prstTrans prst="pageCurlDouble"/></p:transition>`)?.kind, "pageCurl");
  });

  it("reads p15:prstTrans invX / invY as the mirrored direction", () => {
    const right = parse(`<p:transition spd="slow"><p15:prstTrans prst="airplane" invX="1"/></p:transition>`);
    assert.equal(right?.kind, "airplane");
    assert.equal(right?.params?.dir, "right");
    assert.equal(parse(`<p:transition><p15:prstTrans prst="origami" invY="true"/></p:transition>`)?.params?.dir, "down");
  });

  it("maps PowerPoint's fallOver preset onto the editor's fall kind", () => {
    const t = parse(`<p:transition><p15:prstTrans prst="fallOver" invX="1"/></p:transition>`);
    assert.equal(t?.kind, "fall");
    assert.equal(t?.params?.dir, "right");
  });

  it("reads p159:morph with its option", () => {
    const t = parse(`<mc:AlternateContent><mc:Choice Requires="p159"><p:transition><p159:morph option="byWord"/></p:transition></mc:Choice><mc:Fallback><p:transition><p:fade/></p:transition></mc:Fallback></mc:AlternateContent>`);
    assert.equal(t?.kind, "morph");
    assert.equal(t?.params?.option, "byWord");
  });

  it("maps p14:prism isContent / isInverted onto the Cube / Box / Rotate / Orbit variant", () => {
    const t = parse(`<mc:AlternateContent><mc:Choice Requires="p14"><p:transition spd="slow" p14:dur="1600"><p14:prism dir="r" isContent="1" isInverted="1"/></p:transition></mc:Choice><mc:Fallback><p:transition spd="slow"><p:fade/></p:transition></mc:Fallback></mc:AlternateContent>`);
    assert.equal(t?.kind, "orbit");
    assert.equal(t?.params?.dir, "right");
    assert.equal(parse(`<p:transition><p14:prism/></p:transition>`)?.kind, "cube");
    assert.equal(parse(`<p:transition><p14:prism isInverted="1"/></p:transition>`)?.kind, "box");
    assert.equal(parse(`<p:transition><p14:prism isContent="1"/></p:transition>`)?.kind, "rotate");
  });
});

describe("parseSlideTransition (ECMA-376 attribute shapes)", () => {
  it("reads <p:pull> as Uncover, not Push", () => {
    const t = parse(`<p:transition><p:pull dir="ru"/></p:transition>`);
    assert.equal(t?.kind, "uncover");
    assert.equal(t?.params?.dir, "topRight");
  });

  it("reads ST_TransitionCornerDirectionType lu / ru / ld / rd", () => {
    assert.equal(parse(`<p:transition><p:cover dir="lu"/></p:transition>`)?.params?.dir, "topLeft");
    assert.equal(parse(`<p:transition><p:strips dir="rd"/></p:transition>`)?.params?.dir, "bottomRight");
  });

  it("reads CT_OrientationTransition dir=horz|vert as orient, and split's own orient + dir", () => {
    for (const k of ["blinds", "checker", "comb", "randomBar"]) {
      const t = parse(`<p:transition><p:${k} dir="vert"/></p:transition>`);
      assert.equal(t?.params?.orient, "vert", k);
      assert.equal(t?.params?.dir, undefined, k);
    }
    assert.equal(parse(`<p:transition><p14:doors dir="vert"/></p:transition>`)?.params?.orient, "vert");
    const split = parse(`<p:transition><p:split orient="vert" dir="in"/></p:transition>`);
    assert.equal(split?.params?.orient, "vert");
    assert.equal(split?.params?.dir, "in");
  });
});
