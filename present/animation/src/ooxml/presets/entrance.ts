// ECMA-376 §19.5.13 entrance preset definitions (presetClass="entr").
//
// preset ID → name 映射严格按 OOXML 标准（=PowerPoint 内置 entrance 库），通过
// samples/Animations.pptx slide 2..8 的 shape label 逐一对照核实，详见 README 末尾对照表。
//
// channels 是 hard-coded 关键帧近似，目的是接近 PowerPoint 视觉。后续 Phase A
// 路线会用 OOXML subtree 模板替换。

import type { PresetDesc } from "./types";
import {
  ENTR_FLASH_ONCE,
  FADE_IN,
  FLOAT_IN_TY,
  FLY_IN_X,
  FLY_IN_Y,
  HOLD_OPACITY_ON_THEN_FADE_TAIL,
  SCALE_FROM_QUARTER,
  SCALE_FROM_ZERO,
  STEP_OPACITY_ON,
} from "./shared";

// 真实 ID → 名称对照表（PowerPoint）：
//   1  Appear              | 11 Flash Once          | 21 Wheel              | 31 Grow & Turn
//   2  Fly In              | 12 Peek In             | 22 Wipe               | 34 Light Speed
//   3  Blinds              | 13 Plus                | 23 Zoom               | 35 Pinwheel
//   4  Box                 | 14 Random Bars         | 24 Random Effects     | 37 Rise Up
//   5  Checkerboard        | 15 Spiral In           | 25 Boomerang          | 38 Swish
//   6  Circle              | 16 Split               | 26 Bounce             | 39 Thread
//   7  Crawl In            | 17 Stretch             | 27 Color Typewriter   | 40 Unfold
//   8  Diamond             | 18 Strips              | 28 Credits            | 41 Whip
//   9  Dissolve In         | 19 Swivel              | 29 Ease In            | 42 Ascend
//   10 Fade                | 20 Wedge               | 30 Float              | 43 Center Revolve
//   45 Faded Swivel        | 48 Sling               | 50 Compress           | 53 Faded Zoom
//   47 Descend             | 49 Spinner             | 51 Magnify            | 54 Glide
//                                                   | 52 Curve Up           | 55 Expand
//                                                                            | 56 Flip
//                                                                            | 58 Fold

export const ENTR: PresetDesc[] = [
  // ---- Basic (1..24) — 多数为 sweep filter，由 effect-clip 渲染 ----
  {
    // §19.5.13 entr id=1 "Appear"。瞬时显现（无过渡）。
    ids: [1],
    name: "Appear",
    channels: [STEP_OPACITY_ON],
  },
  {
    // §19.5.13 entr id=2 "Fly In"。supportsSubtype 控制 fly 来向。
    ids: [2],
    name: "Fly In",
    supportsSubtype: true,
    channels: [HOLD_OPACITY_ON_THEN_FADE_TAIL(0.3), FLY_IN_X, FLY_IN_Y],
  },
  {
    // §19.5.13 entr id=3 "Blinds"。supportsSubtype 控制方向（horz/vert）。
    ids: [3],
    name: "Blinds",
    supportsSubtype: true,
    channels: [],
    filters: [{ filter: "blinds", transition: "in", prLst: "$axis(in)" }],
  },
  {
    // §19.5.13 entr id=4 "Box"。subtype 16=in / 32=out。
    ids: [4],
    name: "Box",
    supportsSubtype: true,
    channels: [],
    filters: [{ filter: "box", transition: "in", prLst: "$inOut" }],
  },
  {
    // §19.5.13 entr id=5 "Checkerboard"。subtype 区分 across/down。
    ids: [5],
    name: "Checkerboard",
    supportsSubtype: true,
    channels: [],
    filters: [{ filter: "checkerboard", transition: "in", prLst: "$checker(in)" }],
  },
  {
    // §19.5.13 entr id=6 "Circle"。subtype in/out。
    ids: [6],
    name: "Circle",
    supportsSubtype: true,
    channels: [],
    filters: [{ filter: "circle", transition: "in", prLst: "$inOut" }],
  },
  {
    // §19.5.13 entr id=7 "Crawl In"。慢速 fly + fade。
    ids: [7],
    name: "Crawl In",
    supportsSubtype: true,
    channels: [FADE_IN, FLY_IN_X, FLY_IN_Y],
  },
  {
    // §19.5.13 entr id=8 "Diamond"。
    ids: [8],
    name: "Diamond",
    supportsSubtype: true,
    channels: [],
    filters: [{ filter: "diamond", transition: "in", prLst: "$inOut" }],
  },
  {
    // §19.5.13 entr id=9 "Dissolve In"。dissolve filter。
    ids: [9],
    name: "Dissolve In",
    channels: [],
    filters: [{ filter: "dissolve", transition: "in" }],
  },
  {
    // §19.5.13 entr id=10 "Fade"。仅淡入。
    ids: [10],
    name: "Fade",
    channels: [FADE_IN],
  },
  {
    // §19.5.13 entr id=11 "Flash Once"。slide 2 shape "Flash Once" 验证。
    // 修正：旧 entr.ts 把 11 当 "Flash Bulb"。
    ids: [11],
    name: "Flash Once",
    channels: [ENTR_FLASH_ONCE],
  },
  {
    // §19.5.13 entr id=12 "Peek In"。slide 3 shape "Peek In" 验证。
    // 修正：旧 entr.ts 把 12 当 "Flash Once"。Peek In = fly-in + fade。
    ids: [12],
    name: "Peek In",
    supportsSubtype: true,
    channels: [FADE_IN, FLY_IN_X, FLY_IN_Y],
  },
  {
    // §19.5.13 entr id=13 "Plus"。
    ids: [13],
    name: "Plus",
    supportsSubtype: true,
    channels: [],
    filters: [{ filter: "plus", transition: "in", prLst: "$inOut" }],
  },
  {
    // §19.5.13 entr id=14 "Random Bars"。
    ids: [14],
    name: "Random Bars",
    supportsSubtype: true,
    channels: [],
    filters: [{ filter: "randombar", transition: "in", prLst: "$axis(in)" }],
  },
  {
    // §19.5.13 entr id=15 "Spiral In"。
    ids: [15],
    name: "Spiral In",
    channels: [
      FADE_IN,
      SCALE_FROM_ZERO,
      {
        prop: "rotation",
        relative: true,
        defaultEase: "easeOutCubic",
        kf: [
          { t: 0, v: -540 },
          { t: 1, v: 0 },
        ],
      },
    ],
  },
  {
    // §19.5.13 entr id=16 "Split"。slide 3 shape "Split" 验证。
    // 修正：旧 entr.ts 把 16 当 "Peek In"。Split = clipDirection（horz/vert）
    // + fade。
    ids: [16],
    name: "Split",
    supportsSubtype: true,
    channels: [
      {
        prop: "clipDirection",
        kf: [
          { t: 0, v: "$dirName:0" },
          { t: 1, v: "$dirName:1" },
        ],
      },
      FADE_IN,
    ],
  },
  {
    // §19.5.13 entr id=17 "Stretch"。slide 6 shape "Stretch / Collapse" 验证。
    // 修正：旧 entr.ts 把 17 当 "Split"。Stretch = scaleX (subtype across) 或
    // scaleY (subtype out) + fade。
    ids: [17],
    name: "Stretch",
    supportsSubtype: true,
    channels: [
      FADE_IN,
      {
        prop: "scaleX",
        defaultEase: "easeOutCubic",
        kf: [
          { t: 0, v: 0 },
          { t: 1, v: 1 },
        ],
      },
    ],
  },
  {
    // §19.5.13 entr id=18 "Strips"。slide 3 shape "Strips" 验证。
    // 修正：旧 entr.ts 把 18 当 "Stretch"。
    ids: [18],
    name: "Strips",
    supportsSubtype: true,
    channels: [],
    filters: [{ filter: "strips", transition: "in", prLst: "$strips" }],
  },
  {
    // §19.5.13 entr id=19 "Swivel"。slide 8 shape "Swivel (Horizontal In,
    // Vertical Out)" 验证。修正：旧 entr.ts 把 19 当 "Strips"。
    // Swivel = scaleX 翻转 + fade。
    ids: [19],
    name: "Swivel",
    supportsSubtype: true,
    channels: [
      FADE_IN,
      {
        prop: "scaleX",
        defaultEase: "easeOutCubic",
        kf: [
          { t: 0, v: 0 },
          { t: 1, v: 1 },
        ],
      },
    ],
  },
  {
    // §19.5.13 entr id=20 "Wedge"。slide 3 shape "Wedge" 验证。
    ids: [20],
    name: "Wedge",
    channels: [],
    filters: [{ filter: "wedge", transition: "in" }],
  },
  {
    // §19.5.13 entr id=21 "Wheel"。
    ids: [21],
    name: "Wheel",
    supportsSubtype: true,
    channels: [
      {
        prop: "wheelReveal",
        valueKind: "string",
        kf: [
          { t: 0, v: "$spokes:0" },
          { t: 1, v: "$spokes:1" },
        ],
      },
    ],
  },
  {
    // §19.5.13 entr id=22 "Wipe"。
    ids: [22],
    name: "Wipe",
    supportsSubtype: true,
    channels: [],
    filters: [{ filter: "wipe", transition: "in", prLst: "$wipeFrom" }],
  },
  {
    // §19.5.13 entr id=23 "Zoom"。
    ids: [23],
    name: "Zoom",
    channels: [
      FADE_IN,
      {
        prop: "scale",
        defaultEase: "easeOutBack",
        kf: [
          { t: 0, v: 0 },
          { t: 1, v: 1 },
        ],
      },
    ],
  },
  {
    // §19.5.13 entr id=24 "Random Effects"。降级到 fade。
    ids: [24],
    name: "Random Effects",
    channels: [FADE_IN],
  },

  // ---- Moderate / Exciting (25..58) ----
  {
    // §19.5.13 entr id=25 "Boomerang"。slide 7 shape "Boomerang" 验证。
    // 横向飞入并轻微回弹。
    ids: [25],
    name: "Boomerang",
    channels: [
      FADE_IN,
      {
        prop: "tx",
        relative: true,
        defaultEase: "easeOutQuad",
        kf: [
          { t: 0, v: "$bboxW*1.2" },
          { t: 0.7, v: "-$bboxW*0.15" },
          { t: 1, v: 0 },
        ],
      },
      {
        prop: "rotation",
        relative: true,
        defaultEase: "easeOutQuad",
        kf: [
          { t: 0, v: -25 },
          { t: 0.7, v: 6 },
          { t: 1, v: 0 },
        ],
      },
    ],
  },
  {
    // §19.5.13 entr id=26 "Bounce"。slide 7 shape "Bounce" 验证。
    // PowerPoint 实际是从上方落下、地面弹跳几次；这里用 fade + wipe(down)
    // filter + ty 弹跳近似。
    ids: [26],
    name: "Bounce",
    channels: [
      FADE_IN,
      {
        prop: "ty",
        relative: true,
        defaultEase: "easeOutBounce",
        kf: [
          { t: 0, v: "-$bboxH*1.5" },
          { t: 1, v: 0 },
        ],
      },
    ],
  },
  {
    // §19.5.13 entr id=27 "Color Typewriter"。slide 5 shape "Color Typewriter"
    // 验证。字符级逐字显现（按当前 channel 模型只能近似为渐显）。
    ids: [27],
    name: "Color Typewriter",
    channels: [
      FADE_IN,
      {
        prop: "scaleX",
        defaultEase: "linear",
        kf: [
          { t: 0, v: 0 },
          { t: 1, v: 1 },
        ],
      },
    ],
  },
  {
    // §19.5.13 entr id=28 "Credits"。slide 7 shape "Credits" 验证。
    // 自下往上飘过整个屏幕。
    ids: [28],
    name: "Credits",
    channels: [
      FADE_IN,
      {
        prop: "ty",
        relative: true,
        defaultEase: "linear",
        kf: [
          { t: 0, v: "$bboxH*2" },
          { t: 1, v: "-$bboxH*2" },
        ],
      },
    ],
  },
  {
    // §19.5.13 entr id=29 "Ease In"。slide 5 shape "Ease In" 验证。
    // 从下方平滑滑入。
    ids: [29],
    name: "Ease In",
    channels: [
      FADE_IN,
      {
        prop: "ty",
        relative: true,
        defaultEase: "easeOutCubic",
        kf: [
          { t: 0, v: "$bboxH*0.5" },
          { t: 1, v: 0 },
        ],
      },
    ],
  },
  {
    // §19.5.13 entr id=30 "Float"。slide 7 shape "Float" 验证。
    // 从下方飘入，类似 fade + 微 ty。
    ids: [30],
    name: "Float",
    channels: [FADE_IN, FLOAT_IN_TY],
  },
  {
    // §19.5.13 entr id=31 "Grow & Turn"。slide 6 shape "Grow & Turn" 验证。
    // scale + 旋转。
    ids: [31],
    name: "Grow & Turn",
    channels: [
      FADE_IN,
      SCALE_FROM_ZERO,
      {
        prop: "rotation",
        relative: true,
        defaultEase: "easeOutCubic",
        kf: [
          { t: 0, v: -180 },
          { t: 1, v: 0 },
        ],
      },
    ],
  },
  {
    // 与已抽样的 43 同名。回退表按那条半圆弧：从下方抬起，水平摆出再回到原位。
    ids: [32],
    name: "Center Revolve",
    channels: [
      FADE_IN,
      {
        prop: "tx",
        relative: true,
        defaultEase: "linear",
        kf: [
          { t: 0, v: 0 },
          { t: 0.5, v: "$sw*0.155" },
          { t: 1, v: 0 },
        ],
      },
      {
        prop: "ty",
        relative: true,
        defaultEase: "linear",
        kf: [
          { t: 0, v: "$sh*0.31" },
          { t: 0.5, v: "$sh*0.155" },
          { t: 1, v: 0 },
        ],
      },
    ],
  },
  {
    // 没有抽出的子树。从上方向下落，过冲一点再停住。距离按幻灯片高度，不按形状高度。
    ids: [33],
    name: "Arrive",
    channels: [
      FADE_IN,
      {
        prop: "ty",
        relative: true,
        defaultEase: "easeOutCubic",
        kf: [
          { t: 0, v: "-$sh*0.35" },
          { t: 0.72, v: "$sh*0.04" },
          { t: 1, v: 0 },
        ],
      },
    ],
  },
  {
    // §19.5.13 entr id=34 "Light Speed"。slide 7 shape "Light Speed" 验证。
    // 高速横向飞入 + 透视扭曲（近似为快速 fly + scaleX）。
    ids: [34],
    name: "Light Speed",
    channels: [
      FADE_IN,
      {
        prop: "tx",
        relative: true,
        defaultEase: "easeOutCubic",
        kf: [
          { t: 0, v: "$bboxW*2" },
          { t: 1, v: 0 },
        ],
      },
      {
        prop: "scaleX",
        defaultEase: "easeOutCubic",
        kf: [
          { t: 0, v: 2.5 },
          { t: 1, v: 1 },
        ],
      },
    ],
  },
  {
    // §19.5.13 entr id=35 "Pinwheel"。slide 8 shape "Pinwheel" 验证。
    // 旋转 720°缩放入场。
    ids: [35],
    name: "Pinwheel",
    channels: [
      FADE_IN,
      SCALE_FROM_ZERO,
      {
        prop: "rotation",
        relative: true,
        defaultEase: "easeOutCubic",
        kf: [
          { t: 0, v: 720 },
          { t: 1, v: 0 },
        ],
      },
    ],
  },
  {
    // 与已抽样的 37 同名。从画面下方升上来，略过冲再落回。
    ids: [36],
    name: "Rise Up",
    channels: [
      FADE_IN,
      {
        prop: "ty",
        relative: true,
        defaultEase: "easeOutCubic",
        kf: [
          { t: 0, v: "$sh" },
          { t: 0.75, v: "-$sh*0.03" },
          { t: 1, v: 0 },
        ],
      },
    ],
  },
  {
    // §19.5.13 entr id=37 "Rise Up"。slide 6 shape "Rise Up / Sink Down" 验证。
    ids: [37],
    name: "Rise Up",
    channels: [FADE_IN, FLOAT_IN_TY],
  },
  {
    // §19.5.13 entr id=38 "Swish"。slide 8 shape "Swish" 验证。
    // 横向快速滑入。
    ids: [38],
    name: "Swish",
    channels: [
      FADE_IN,
      {
        prop: "tx",
        relative: true,
        defaultEase: "easeOutQuad",
        kf: [
          { t: 0, v: "$bboxW*1.5" },
          { t: 1, v: 0 },
        ],
      },
    ],
  },
  {
    // §19.5.13 entr id=39 "Thread"。slide 8 shape "Thread" 验证。
    // 类似 stretch + fade。
    ids: [39],
    name: "Thread",
    channels: [
      FADE_IN,
      {
        prop: "scaleX",
        defaultEase: "easeOutQuad",
        kf: [
          { t: 0, v: 0 },
          { t: 1, v: 1 },
        ],
      },
    ],
  },
  {
    // §19.5.13 entr id=40 "Unfold"。slide 6 shape "Unfold" 验证。
    // 纵向展开。
    ids: [40],
    name: "Unfold",
    channels: [
      FADE_IN,
      {
        prop: "scaleY",
        defaultEase: "easeOutCubic",
        kf: [
          { t: 0, v: 0 },
          { t: 1, v: 1 },
        ],
      },
    ],
  },
  {
    // §19.5.13 entr id=41 "Whip"。slide 8 shape "Whip" 验证。
    // 横向甩入并轻微回弹。
    ids: [41],
    name: "Whip",
    supportsSubtype: true,
    channels: [
      FADE_IN,
      {
        prop: "tx",
        relative: true,
        defaultEase: "easeOutCubic",
        kf: [
          { t: 0, v: "$bboxW" },
          { t: 1, v: 0 },
        ],
      },
    ],
  },
  {
    // §19.5.13 entr id=42 "Ascend"。slide 5 shape "Ascend" 验证。
    // 自下而上滑入。
    ids: [42],
    name: "Ascend",
    channels: [
      FADE_IN,
      {
        prop: "ty",
        relative: true,
        defaultEase: "easeOutCubic",
        kf: [
          { t: 0, v: "$bboxH" },
          { t: 1, v: 0 },
        ],
      },
    ],
  },
  {
    // §19.5.13 entr id=43 "Center Revolve"。slide 5 shape "Center Revolve" 验证。
    // 围绕中心 Y 轴翻转入场。
    ids: [43],
    name: "Center Revolve",
    channels: [
      FADE_IN,
      {
        prop: "scaleX",
        defaultEase: "easeOutCubic",
        kf: [
          { t: 0, v: 0 },
          { t: 1, v: 1 },
        ],
      },
    ],
  },
  {
    // 与已抽样的 47 同名。从略高于原位的地方落到原位。
    ids: [44],
    name: "Descend",
    channels: [
      FADE_IN,
      {
        prop: "ty",
        relative: true,
        defaultEase: "easeOutCubic",
        kf: [
          { t: 0, v: "-$sh*0.1" },
          { t: 1, v: 0 },
        ],
      },
    ],
  },
  {
    // §19.5.13 entr id=45 "Faded Swivel"。slide 4 shape "Faded Swivel" 验证。
    // 修正：旧 entr.ts 把 45 当 "Grow & Rotate"。Faded Swivel = fade + scaleX
    // 翻转。
    ids: [45],
    name: "Faded Swivel",
    channels: [
      FADE_IN,
      {
        prop: "scaleX",
        defaultEase: "easeOutCubic",
        kf: [
          { t: 0, v: 0 },
          { t: 1, v: 1 },
        ],
      },
    ],
  },
  {
    // 没有抽出的子树。从无到整，同时把偏色和提亮收回。
    ids: [46],
    name: "Grow with Color",
    channels: [
      FADE_IN,
      SCALE_FROM_ZERO,
      {
        prop: "brightness",
        valueKind: "number",
        defaultEase: "easeOutCubic",
        kf: [
          { t: 0, v: 0.55 },
          { t: 1, v: 0 },
        ],
      },
      {
        prop: "hueRotate",
        valueKind: "number",
        defaultEase: "easeOutCubic",
        kf: [
          { t: 0, v: 48 },
          { t: 1, v: 0 },
        ],
      },
    ],
  },
  {
    // §19.5.13 entr id=47 "Descend"。slide 5 shape "Descend" 验证（exit 同 ID =
    // Descend exit）。自上而下滑入。
    // 修正：旧 entr.ts 把 47 当 "Swivel"，但 Swivel 实际是 ID=19。
    ids: [47],
    name: "Descend",
    channels: [
      FADE_IN,
      {
        prop: "ty",
        relative: true,
        defaultEase: "easeOutCubic",
        kf: [
          { t: 0, v: "-$bboxH" },
          { t: 1, v: 0 },
        ],
      },
    ],
  },
  {
    // §19.5.13 entr id=48 "Sling"。slide 8 shape "Sling" 验证。
    // scale + rotation back。
    ids: [48],
    name: "Sling",
    channels: [
      FADE_IN,
      SCALE_FROM_ZERO,
      {
        prop: "rotation",
        relative: true,
        defaultEase: "easeOutBack",
        kf: [
          { t: 0, v: -60 },
          { t: 1, v: 0 },
        ],
      },
    ],
  },
  {
    // §19.5.13 entr id=49 "Spinner"。slide 6 shape "Spinner" 验证。
    // 旋转一周入场。
    ids: [49],
    name: "Spinner",
    channels: [
      FADE_IN,
      {
        prop: "rotation",
        relative: true,
        defaultEase: "easeOutCubic",
        kf: [
          { t: 0, v: 360 },
          { t: 1, v: 0 },
        ],
      },
    ],
  },
  {
    // §19.5.13 entr id=50 "Compress"。slide 5 shape "Compress / Stretchy" 验证。
    // 修正：旧 entr.ts 把 50 当 "Sling"。Compress = scale 缩小→1。
    ids: [50],
    name: "Compress",
    channels: [
      FADE_IN,
      {
        prop: "scale",
        defaultEase: "easeOutCubic",
        kf: [
          { t: 0, v: 1.5 },
          { t: 1, v: 1 },
        ],
      },
    ],
  },
  {
    // §19.5.13 entr id=51 "Magnify"。slide 8 shape "Magnify" 验证。
    // 从小放大并超过 1 再回缩。
    ids: [51],
    name: "Magnify",
    channels: [
      FADE_IN,
      {
        prop: "scale",
        defaultEase: "easeOutBack",
        kf: [
          { t: 0, v: 0.15 },
          { t: 0.85, v: 1.1 },
          { t: 1, v: 1 },
        ],
      },
    ],
  },
  {
    // §19.5.13 entr id=52 "Curve Up"。slide 7 shape "Curve Up / Curve Down" 验证。
    // 修正：旧 entr.ts 把 52 当 "Unfold"，但 Unfold 实际是 ID=40。
    // Curve Up ≈ fade + ty 从下方曲线上升。
    ids: [52],
    name: "Curve Up",
    channels: [
      FADE_IN,
      {
        prop: "ty",
        relative: true,
        defaultEase: "easeOutQuad",
        kf: [
          { t: 0, v: "$bboxH*1.5" },
          { t: 1, v: 0 },
        ],
      },
      {
        prop: "tx",
        relative: true,
        defaultEase: "easeOutQuad",
        kf: [
          { t: 0, v: "-$bboxW*0.4" },
          { t: 1, v: 0 },
        ],
      },
    ],
  },
  {
    // §19.5.13 entr id=53 "Faded Zoom"。slide 4 shape "Faded Zoom" 验证。
    // 修正：旧 entr.ts 把 53 当 "Grow & Turn"。Faded Zoom = fade + scale。
    ids: [53],
    name: "Faded Zoom",
    channels: [FADE_IN, SCALE_FROM_QUARTER],
  },
  {
    // §19.5.13 entr id=54 "Glide"。slide 7 shape "Glide" 验证。
    // 修正：旧 entr.ts 把 54 当 "Zoom Rotate"。Glide = fade + 平移。
    ids: [54],
    name: "Glide",
    channels: [
      FADE_IN,
      {
        prop: "ty",
        relative: true,
        defaultEase: "easeOutCubic",
        kf: [
          { t: 0, v: "$bboxH*0.8" },
          { t: 1, v: 0 },
        ],
      },
    ],
  },
  {
    // §19.5.13 entr id=55 "Expand"。slide 4 shape "Expand / Contract" 验证。
    // 修正：旧 entr.ts 把 55 当 "Curvy Star"。Expand = fade + scale 从 0.25→1。
    ids: [55],
    name: "Expand",
    channels: [FADE_IN, SCALE_FROM_QUARTER],
  },
  {
    // §19.5.13 entr id=56 "Flip"。slide 7 shape "Flip" 验证。
    // 横向翻转入场（scaleX 从负到正）。
    ids: [56],
    name: "Flip",
    channels: [
      FADE_IN,
      {
        prop: "scaleX",
        defaultEase: "easeOutCubic",
        kf: [
          { t: 0, v: -1 },
          { t: 1, v: 1 },
        ],
      },
    ],
  },
  {
    // 没有抽出的子树。从上方漂下来，水平轻轻摆一下，末尾过冲再停住。
    ids: [57],
    name: "Float Down",
    channels: [
      FADE_IN,
      {
        prop: "ty",
        relative: true,
        defaultEase: "easeInOutSine",
        kf: [
          { t: 0, v: "-$sh*0.4" },
          { t: 0.75, v: "$sh*0.03" },
          { t: 1, v: 0 },
        ],
      },
      {
        prop: "tx",
        relative: true,
        defaultEase: "easeInOutSine",
        kf: [
          { t: 0, v: "-$sw*0.08" },
          { t: 0.55, v: "$sw*0.03" },
          { t: 1, v: 0 },
        ],
      },
      {
        prop: "rotation",
        relative: true,
        defaultEase: "easeOutCubic",
        kf: [
          { t: 0, v: -12 },
          { t: 1, v: 0 },
        ],
      },
    ],
  },
  {
    // §19.5.13 entr id=58 "Fold"。slide 7 shape "Fold" 验证。
    // 沿纵向折入。
    ids: [58],
    name: "Fold",
    channels: [
      FADE_IN,
      {
        prop: "scaleY",
        defaultEase: "easeOutCubic",
        kf: [
          { t: 0, v: 0 },
          { t: 1, v: 1 },
        ],
      },
    ],
  },
];
