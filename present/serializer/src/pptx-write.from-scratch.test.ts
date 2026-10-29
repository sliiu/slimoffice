import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { strFromU8, unzipSync } from "fflate";
import type { GroupShape, Presentation, RectShape, Shape } from "@ppt/core";
import { buildSmartArtShapes } from "@ppt/core";
import type { ooxml } from "@ppt/animation";
import { writePptx } from "./pptx-write.js";

const transform = { tx: 0, ty: 0, rotation: 0, scaleX: 1, scaleY: 1, skewX: 0, skewY: 0 };
const meta = (id: string, name: string) => ({ id, name, zIndex: 0, visible: true, locked: false, opacity: 1, transform });

/** 最小 entrance 时序树：mainSeq → clickEffect(entr) → set(style.visibility) 指向 spid。 */
function entranceTiming(spid: string): ooxml.OoxmlTiming {
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
              ctn: {
                id: "2",
                nodeType: "mainSeq",
                childTnLst: [
                  {
                    kind: "par",
                    ctn: {
                      id: "3",
                      presetID: 1,
                      presetClass: "entr",
                      nodeType: "clickEffect",
                      fill: "hold",
                      childTnLst: [
                        {
                          kind: "set",
                          cBhvr: {
                            ctn: { id: "4", dur: 1, fill: "hold" },
                            tgtEl: { spTgt: { spid } },
                            attrNameLst: ["style.visibility"],
                          },
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
      },
    ],
    bldLst: [],
  };
}

function unzipXml(bytes: Uint8Array): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [path, u8] of Object.entries(unzipSync(bytes))) {
    if (/\.(xml|rels)$/.test(path)) out[path] = strFromU8(u8);
  }
  return out;
}

function buildPres(shapes: Shape[], timing?: ooxml.OoxmlTiming): Presentation {
  return {
    id: "t",
    size: { width: 1280, height: 720 },
    slides: [
      {
        id: "s1",
        name: "Slide 1",
        background: { kind: "solid", color: "#0A0C10" },
        layers: [{ id: "l1", name: "main", shapes }],
        ...(timing ? { ooxmlTiming: timing } : {}),
      },
    ],
  } as unknown as Presentation;
}

describe("writePptx from-scratch", () => {
  it("does not bake runtime entrance-hide opacity=0 into fill alpha", () => {
    // parser timing pass / applyInitialEntranceState 会把 entrance 目标的 opacity 压成 0；
    // 这是"入场前隐藏"的运行时状态，写盘时必须仍是可见 shape。
    const hidden: RectShape = {
      ...meta("sp_7", "slot:bar"),
      kind: "rect",
      bbox: { x: 64, y: 40, w: 8, h: 20 },
      fill: { kind: "solid", color: "#22D3EE" },
      opacity: 0,
    };
    // 用户主动设成 0 且没有 entrance 动画的 shape 仍按 0 写（保持编辑器语义）。
    const userZero: RectShape = {
      ...meta("sp_8", "ghost"),
      kind: "rect",
      bbox: { x: 100, y: 40, w: 8, h: 20 },
      fill: { kind: "solid", color: "#FFFFFF" },
      opacity: 0,
    };
    const files = unzipXml(writePptx(buildPres([hidden, userZero], entranceTiming("7"))));
    const slide = files["ppt/slides/slide1.xml"]!;
    const sp = (name: string): string => new RegExp(`<p:sp>(?:(?!</p:sp>).)*name="${name}"(?:(?!</p:sp>).)*</p:sp>`, "s").exec(slide)![0];
    assert.match(sp("slot:bar"), /<a:srgbClr val="22D3EE"\/>/);
    assert.doesNotMatch(sp("slot:bar"), /<a:alpha val="0"\/>/);
    assert.match(sp("ghost"), /<a:alpha val="0"\/>/);
  });

  it("rewrites logical animation spids to the cNvPr id written on the shape", () => {
    const title: RectShape = {
      ...meta("sp_dg_cover_title_0", "cover title"),
      kind: "rect",
      bbox: { x: 80, y: 80, w: 400, h: 80 },
      fill: { kind: "solid", color: "#FFFFFF" },
    };
    const body: RectShape = {
      ...meta("sp_7", "body"),
      kind: "rect",
      bbox: { x: 80, y: 200, w: 400, h: 40 },
      fill: { kind: "solid", color: "#22D3EE" },
    };
    const timing = entranceTiming("dg_cover_title_0");
    const before = JSON.stringify(timing);
    const files = unzipXml(writePptx(buildPres([title, body], timing)));
    const slide = files["ppt/slides/slide1.xml"]!;
    const titleId = /<p:cNvPr id="(\d+)" name="cover title"/.exec(slide)?.[1];
    const bodyId = /<p:cNvPr id="(\d+)" name="body"/.exec(slide)?.[1];
    assert.ok(titleId);
    assert.equal(bodyId, "7");
    assert.notEqual(titleId, "7");
    assert.match(slide, new RegExp(`<p:spTgt spid="${titleId}"`));
    assert.doesNotMatch(slide, /dg_cover_title_0/);
    assert.equal(JSON.stringify(timing), before);
  });

  it("resolves device-expanded animation spids (regression: SlimPPT demo lost all motion)", () => {
    // 真实回归：deckgen device 展开出的子部件 id 形如
    // `sp_dg_agenda_device-8.row0.num_8`（含点、含枚举后缀），insertEffect 把
    // spTgt.spid 存成去掉 `sp_` 的部分。旧 serializer 不 remap，spid 原样写出、
    // cNvPr 却是顺序数字 → PowerPoint/WPS 找不到目标，整页动画静默丢失。
    const partIds = [
      "sp_dg_agenda_device-8.row0.num_8",
      "sp_dg_agenda_device-8.row0.title_9",
      "sp_dg_agenda_text-1_1",
    ];
    const shapes: Shape[] = partIds.map((id, i) => ({
      ...meta(id, `slot:${id.replace(/^sp_dg_agenda_/, "").replace(/_\d+$/, "")}`),
      kind: "rect",
      bbox: { x: 40 + i * 260, y: 120, w: 220, h: 60 },
      fill: { kind: "solid", color: "#FFFFFF" },
    })) as Shape[];

    // 每个部件一个 set 动画，spid = id 去掉 sp_。
    const behaviors: ooxml.TimeNode[] = partIds.map((id, i) => ({
      kind: "set",
      cBhvr: {
        ctn: { id: String(10 + i), dur: 1, fill: "hold" },
        tgtEl: { spTgt: { spid: id.replace(/^sp_/, "") } },
        attrNameLst: ["style.visibility"],
      },
      to: { kind: "str", val: "visible" },
    }));
    const timing: ooxml.OoxmlTiming = {
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
                ctn: {
                  id: "2",
                  nodeType: "mainSeq",
                  childTnLst: [{ kind: "par", ctn: { id: "3", childTnLst: behaviors } }],
                },
              },
            ],
          },
        },
      ],
      bldLst: [],
    };

    const files = unzipXml(writePptx(buildPres(shapes, timing)));
    const slide = files["ppt/slides/slide1.xml"]!;

    const cNvPrIds = new Set([...slide.matchAll(/<p:cNvPr id="(\d+)"/g)].map((m) => m[1]!));
    const timingXml = slide.slice(slide.indexOf("<p:timing>"));
    const spids = [...new Set([...timingXml.matchAll(/spid="([^"]+)"/g)].map((m) => m[1]!))];
    assert.ok(spids.length >= partIds.length, "timing must retain a target per animated part");
    for (const spid of spids) {
      assert.ok(cNvPrIds.has(spid), `spid "${spid}" must resolve to a written cNvPr id`);
    }
    // 逻辑 id 绝不能泄漏到写出的时序里。
    assert.doesNotMatch(timingXml, /spid="[^"]*dg_/);
    assert.doesNotMatch(timingXml, /spid="[^"]*\./);
  });

  it("schemeClr references point at a slot holding the same color (dk*/lt* and tx*/bg* keys)", () => {
    const card: RectShape = {
      ...meta("sp_1", "card"),
      kind: "rect",
      bbox: { x: 80, y: 80, w: 400, h: 200 },
      fill: { kind: "solid", color: "#1C1C1E" },
    };
    const pres = buildPres([card]);
    // 手写主题只给槽位名（dk2），没给 tx2 别名 —— 旧版 theme writer 只读别名，
    // 写出 Office 默认 44546A，而 shape 却被映射成 schemeClr dk2 → 卡片变蓝灰。
    (pres as { theme?: unknown }).theme = {
      id: "t",
      name: "T",
      colors: { dk1: "#F5F5F7", lt1: "#000000", dk2: "#1C1C1E", lt2: "#98989D", accent1: "#2997FF" },
    };
    const files = unzipXml(writePptx(pres));
    const slide = files["ppt/slides/slide1.xml"]!;
    const theme = files["ppt/theme/theme1.xml"]!;
    const scheme = Object.fromEntries(
      [...theme.matchAll(/<a:(\w+)><a:srgbClr val="([0-9A-F]{6})"\/><\/a:\1>/g)].map((m) => [m[1]!, m[2]!]),
    );
    const ref = /name="card"[\s\S]*?<a:solidFill><a:(schemeClr|srgbClr) val="(\w+)"/.exec(slide)!;
    const written = ref[1] === "schemeClr" ? scheme[ref[2]!] : ref[2];
    assert.equal(written, "1C1C1E");
    assert.equal(scheme.dk2, "1C1C1E");
  });

  it("writes SmartArt drawing shapes with unique ids and host-relative connector geometry", () => {
    const bbox = { x: 64, y: 200, w: 1152, h: 280 };
    const children = buildSmartArtShapes(
      "process",
      [
        { id: "a", text: "解析 .pptx\nOOXML 解析" },
        { id: "b", text: "渲染" },
        { id: "c", text: "导出" },
      ],
      bbox,
    );
    const group: GroupShape = { ...meta("sp_6", "slot:diagram"), kind: "group", bbox, children, smartArtMeta: { layout: "process" } };
    const files = unzipXml(writePptx(buildPres([group])));
    const drawing = files["ppt/diagrams/drawing1.xml"];
    assert.ok(drawing, "drawing part written");
    const ids = [...drawing.matchAll(/<dsp:cNvPr id="(\d+)"/g)].map((m) => m[1]!);
    assert.ok(ids.length > 3, `expected several dsp shapes, got ${ids.length}`);
    assert.equal(new Set(ids).size, ids.length, `dsp:cNvPr ids must be unique: ${ids.join(",")}`);

    // 连接符 xfrm 必须已经减掉 host 原点：任何 off.y 都不能大于 group 高度。
    const groupH = Math.round(bbox.h * 12700);
    const offs = [...drawing.matchAll(/<a:off x="(-?\d+)" y="(-?\d+)"\/>/g)].map((m) => Number(m[2]));
    assert.ok(offs.length > 0);
    assert.ok(offs.every((y) => y >= 0 && y <= groupH), `dsp offsets must be host-relative: ${offs.join(",")}`);

    // 换行 = 多段落：run 里不能残留 "\n"（PowerPoint 会把它当空白折叠）。
    assert.doesNotMatch(drawing, /<a:t>[^<]*\n[^<]*<\/a:t>/);
    assert.match(drawing, /<a:t>解析 \.pptx<\/a:t>/);
    assert.match(drawing, /<a:t>OOXML 解析<\/a:t>/);
  });
});
