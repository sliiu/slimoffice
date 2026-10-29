// ECMA-376 §19.5.13 emphasis preset definitions (presetClass="emph").
//
// preset ID → name 映射严格按 OOXML 标准（=PowerPoint 内置 emphasis 效果库），通过
// samples/Animations.pptx slide 9-13 的 shape label 逐一对照核实。详见 README 末尾
// 的对照表注释。
//
// channels 是 hard-coded 关键帧近似，目的是让目标属性的变化曲线接近 PowerPoint 渲染。
// 后续 Phase A 路线会用 OOXML subtree 模板替换。

import type { PresetDesc } from "./types";

// 1..9 — Basic Emphasis（slide 9 验证）
// 10..36 — Subtle / Moderate / Exciting Emphasis（slide 10..13 验证）
//
// 对照表（PowerPoint 名称 / OOXML 真实 id）：
//   1  Change Fill Color    | 19 Color Blend         | 28 Grow With Color
//   2  Change Font          | 20 Color Wave          | 30 Lighten
//   3  Change Font Color    | 21 Complementary Color | 31 Style Emphasis
//   4  Change Font Size     | 22 Complementary 2     | 32 Teeter
//   5  Change Font Style    | 23 Contrasting Color   | 33 Vertical Highlight
//   6  Grow / Shrink        | 24 Darken              | 34 Wave
//   7  Change Line Color    | 25 Desaturate          | 35 Blink
//   8  Spin                 | 26 Flash Bulb          | 36 Shimmer
//   9  Transparency         | 27 Flicker
//   10 Bold Flash           | 14 Blast               | 16 Brush On Color
//   15 Bold Reveal          | 18 Brush On Underline
//
// 11, 12, 13, 17, 29 在 samples/Animations.pptx 里未出现 —— 这些 id 用 OOXML
// 常见行为合理近似（详见各 entry 注释），后续遇到反例再修正。

export const EMPH: PresetDesc[] = [
  // ---- Basic Emphasis (slide 9) ----
  {
    // §19.5.13 emph id=1 "Change Fill Color"。slide 9 shape "Change Fill Color"
    // 验证。语义：填充色持续变更（不回归）。
    //
    // 用 hueRotate 而非 fillColor：fillColor 会覆盖 shape 的原 solidFill
    // （PowerPoint accent 主题色等），而 preset 表里没法预知原色；hueRotate 通过
    // CSS / Canvas filter 在原色上偏移色相，保留原 fill 身份。
    ids: [1],
    name: "Change Fill Color",
    channels: [
      {
        prop: "hueRotate",
        valueKind: "number",
        kf: [
          { t: 0, v: 0 },
          { t: 1, v: 150 },
        ],
      },
    ],
  },
  {
    // §19.5.13 emph id=2 "Change Font"。无法在 canvas 中切换 font family，
    // 用 fontWeight 短促 pulse 视觉示意。
    ids: [2],
    name: "Change Font",
    channels: [
      {
        prop: "fontWeight",
        valueKind: "number",
        kf: [
          { t: 0, v: 400 },
          { t: 0.5, v: 600 },
          { t: 1, v: 400 },
        ],
      },
    ],
  },
  {
    // §19.5.13 emph id=3 "Change Font Color"。slide 9 shape "Change Font Color"
    // 验证。fontColor 持续变红。
    ids: [3],
    name: "Change Font Color",
    channels: [
      {
        prop: "fontColor",
        valueKind: "color",
        kf: [
          { t: 0, v: "#000000" },
          { t: 1, v: "#ff0000" },
        ],
      },
    ],
  },
  {
    // §19.5.13 emph id=4 "Change Font Size"。canvas 没有独立 fontSize 通道，
    // 用 scale 放大并保持。
    ids: [4],
    name: "Change Font Size",
    channels: [
      {
        prop: "scale",
        defaultEase: "easeOutCubic",
        kf: [
          { t: 0, v: 1 },
          { t: 1, v: 1.2 },
        ],
      },
    ],
  },
  {
    // §19.5.13 emph id=5 "Change Font Style"。bold/italic 切换，用
    // fontWeight 保持升级近似。
    ids: [5],
    name: "Change Font Style",
    channels: [
      {
        prop: "fontWeight",
        valueKind: "number",
        kf: [
          { t: 0, v: 400 },
          { t: 1, v: 700 },
        ],
      },
    ],
  },
  {
    // §19.5.13 emph id=6 "Grow / Shrink"。pulse 放大再回缩。
    ids: [6],
    name: "Grow / Shrink",
    channels: [
      {
        prop: "scale",
        defaultEase: "easeInOutSine",
        kf: [
          { t: 0, v: 1 },
          { t: 0.5, v: 1.2 },
          { t: 1, v: 1 },
        ],
      },
    ],
  },
  {
    // §19.5.13 emph id=7 "Change Line Color"。slide 9 shape "Change Line Color"
    // 验证。strokeColor（描边/边框）持续变红——之前错把 7 实现成 Change Font
    // Color 是这次重排的核心修复点。
    ids: [7],
    name: "Change Line Color",
    channels: [
      {
        prop: "strokeColor",
        valueKind: "color",
        kf: [
          { t: 0, v: "#000000" },
          { t: 1, v: "#ff0000" },
        ],
      },
    ],
  },
  {
    // §19.5.13 emph id=8 "Spin"。一周旋转。
    ids: [8],
    name: "Spin",
    channels: [
      {
        prop: "rotation",
        relative: true,
        defaultEase: "easeInOutCubic",
        kf: [
          { t: 0, v: 0 },
          { t: 1, v: 360 },
        ],
      },
    ],
  },
  {
    // §19.5.13 emph id=9 "Transparency"。淡出再淡入。
    ids: [9],
    name: "Transparency",
    channels: [
      {
        prop: "opacity",
        defaultEase: "easeInOutSine",
        kf: [
          { t: 0, v: 1 },
          { t: 0.5, v: 0.3 },
          { t: 1, v: 1 },
        ],
      },
    ],
  },

  // ---- Subtle / Moderate / Exciting Emphasis (slide 10..13) ----
  {
    // §19.5.13 emph id=10 "Bold Flash"。slide 10 shape "Bold Flash" 验证。
    // 短促放大 + 加粗。
    ids: [10],
    name: "Bold Flash",
    channels: [
      {
        prop: "scale",
        defaultEase: "easeInOutCubic",
        kf: [
          { t: 0, v: 1 },
          { t: 0.5, v: 1.3 },
          { t: 1, v: 1 },
        ],
      },
      {
        prop: "fontWeight",
        valueKind: "number",
        kf: [
          { t: 0, v: 400 },
          { t: 0.5, v: 700 },
          { t: 1, v: 400 },
        ],
      },
    ],
  },
  {
    // 没有抽出的子树。横向从窄条展开，同时提亮再收回。结束回到原样。
    ids: [11],
    name: "Reveal",
    channels: [
      {
        prop: "scaleX",
        defaultEase: "easeOutCubic",
        kf: [
          { t: 0, v: 0.15 },
          { t: 0.65, v: 1 },
          { t: 1, v: 1 },
        ],
      },
      {
        prop: "brightness",
        valueKind: "number",
        defaultEase: "easeInOutSine",
        kf: [
          { t: 0, v: 0 },
          { t: 0.4, v: 0.35 },
          { t: 1, v: 0 },
        ],
      },
    ],
  },
  {
    // 没有抽出的子树。亮度连闪两次，并轻轻胀一下。
    ids: [12],
    name: "Glow",
    channels: [
      {
        prop: "brightness",
        valueKind: "number",
        defaultEase: "easeInOutSine",
        kf: [
          { t: 0, v: 0 },
          { t: 0.28, v: 0.4 },
          { t: 0.5, v: 0.05 },
          { t: 0.75, v: 0.32 },
          { t: 1, v: 0 },
        ],
      },
      {
        prop: "scale",
        defaultEase: "easeInOutSine",
        kf: [
          { t: 0, v: 1 },
          { t: 0.28, v: 1.06 },
          { t: 0.5, v: 1 },
          { t: 0.75, v: 1.04 },
          { t: 1, v: 1 },
        ],
      },
    ],
  },
  {
    // 没有抽出的子树。色相先偏暖再偏冷，回到原色。
    ids: [13],
    name: "Color Pulse",
    channels: [
      {
        prop: "hueRotate",
        valueKind: "number",
        defaultEase: "easeInOutSine",
        kf: [
          { t: 0, v: 0 },
          { t: 0.35, v: 80 },
          { t: 0.7, v: -40 },
          { t: 1, v: 0 },
        ],
      },
    ],
  },
  {
    // §19.5.13 emph id=14 "Blast"。slide 13 shape "Blast" 验证。
    // 短促大幅放大再回归。
    ids: [14],
    name: "Blast",
    channels: [
      {
        prop: "scale",
        defaultEase: "easeOutCubic",
        kf: [
          { t: 0, v: 1 },
          { t: 0.4, v: 1.45 },
          { t: 1, v: 1 },
        ],
      },
    ],
  },
  {
    // §19.5.13 emph id=15 "Bold Reveal"。slide 13 shape "Bold Reveal" 验证。
    // 加粗并保持。
    ids: [15],
    name: "Bold Reveal",
    channels: [
      {
        prop: "fontWeight",
        valueKind: "number",
        kf: [
          { t: 0, v: 400 },
          { t: 1, v: 700 },
        ],
      },
    ],
  },
  {
    // §19.5.13 emph id=16 "Brush On Color"。slide 10 shape "Brush On Color"
    // 验证。用 brightness 提亮模拟"刷上一层亮色"——避免 fillColor 覆盖原色。
    ids: [16],
    name: "Brush On Color",
    channels: [
      {
        prop: "brightness",
        valueKind: "number",
        defaultEase: "easeOutCubic",
        kf: [
          { t: 0, v: 0 },
          { t: 1, v: 0.18 },
        ],
      },
    ],
  },
  {
    // 与已抽样的 16 同名，插入时走那棵着色子树。这里只是没有样本时的回退。
    ids: [17],
    name: "Brush On Color",
    channels: [
      {
        prop: "brightness",
        valueKind: "number",
        defaultEase: "easeOutCubic",
        kf: [
          { t: 0, v: 0 },
          { t: 0.35, v: 0.28 },
          { t: 0.6, v: 0.1 },
          { t: 1, v: 0.22 },
        ],
      },
    ],
  },
  {
    // §19.5.13 emph id=18 "Brush On Underline"。slide 10 shape "Brush On
    // Underline" 验证。下划线渐显并保持。
    ids: [18],
    name: "Brush On Underline",
    channels: [
      {
        prop: "underline",
        valueKind: "number",
        kf: [
          { t: 0, v: 0 },
          { t: 1, v: 1 },
        ],
      },
    ],
  },
  {
    // §19.5.13 emph id=19 "Color Blend"。slide 10 shape "Color Blend" 验证。
    // 用 hueRotate 在原色上来回偏移色相，避免覆盖原 fill。
    ids: [19],
    name: "Color Blend",
    channels: [
      {
        prop: "hueRotate",
        valueKind: "number",
        defaultEase: "easeInOutSine",
        kf: [
          { t: 0, v: 0 },
          { t: 0.5, v: 120 },
          { t: 1, v: 0 },
        ],
      },
    ],
  },
  {
    // §19.5.13 emph id=20 "Color Wave"。slide 10 shape "Color Wave" 验证。
    // hueRotate + 上下浮动。
    ids: [20],
    name: "Color Wave",
    channels: [
      {
        prop: "hueRotate",
        valueKind: "number",
        defaultEase: "easeInOutSine",
        kf: [
          { t: 0, v: 0 },
          { t: 0.5, v: 45 },
          { t: 1, v: 0 },
        ],
      },
      {
        prop: "ty",
        relative: true,
        defaultEase: "easeInOutSine",
        kf: [
          { t: 0, v: 0 },
          { t: 0.25, v: "-$bboxH*0.04" },
          { t: 0.75, v: "$bboxH*0.04" },
          { t: 1, v: 0 },
        ],
      },
    ],
  },
  {
    // §19.5.13 emph id=21 "Complementary Color"。slide 10 shape "Complementary
    // Color" 验证。hueRotate 至 180 再返回。
    ids: [21],
    name: "Complementary Color",
    channels: [
      {
        prop: "hueRotate",
        valueKind: "number",
        defaultEase: "easeInOutSine",
        kf: [
          { t: 0, v: 0 },
          { t: 0.5, v: 180 },
          { t: 1, v: 0 },
        ],
      },
    ],
  },
  {
    // §19.5.13 emph id=22 "Complementary Color 2"。slide 10 shape
    // "Complementary Color 2" 验证。一次性 hueRotate 到 180 并保持。
    ids: [22],
    name: "Complementary Color 2",
    channels: [
      {
        prop: "hueRotate",
        valueKind: "number",
        kf: [
          { t: 0, v: 0 },
          { t: 1, v: 180 },
        ],
      },
    ],
  },
  {
    // §19.5.13 emph id=23 "Contrasting Color"。slide 10 shape "Contrasting
    // Color" 验证。hueRotate 中等幅度往返。
    ids: [23],
    name: "Contrasting Color",
    channels: [
      {
        prop: "hueRotate",
        valueKind: "number",
        defaultEase: "easeInOutSine",
        kf: [
          { t: 0, v: 0 },
          { t: 0.5, v: 120 },
          { t: 1, v: 0 },
        ],
      },
    ],
  },
  {
    // §19.5.13 emph id=24 "Darken"。slide 11 shape "Darken" 验证。变暗保持。
    ids: [24],
    name: "Darken",
    channels: [
      {
        prop: "brightness",
        valueKind: "number",
        kf: [
          { t: 0, v: 0 },
          { t: 1, v: -0.3 },
        ],
      },
    ],
  },
  {
    // §19.5.13 emph id=25 "Desaturate"。slide 11 shape "Desaturate" 验证。
    // 饱和度降为 0 并保持。
    ids: [25],
    name: "Desaturate",
    channels: [
      {
        prop: "saturation",
        valueKind: "number",
        kf: [
          { t: 0, v: 1 },
          { t: 1, v: 0 },
        ],
      },
    ],
  },
  {
    // §19.5.13 emph id=26 "Flash Bulb"。slide 11 shape "Flash Bulb" 验证。
    // brightness 短促高亮再回归（带轻微缩放）。
    ids: [26],
    name: "Flash Bulb",
    channels: [
      {
        prop: "brightness",
        valueKind: "number",
        defaultEase: "easeOutQuad",
        kf: [
          { t: 0, v: 0 },
          { t: 0.4, v: 0.6 },
          { t: 0.7, v: 0 },
          { t: 1, v: 0 },
        ],
      },
      {
        prop: "scale",
        defaultEase: "easeInOutSine",
        kf: [
          { t: 0, v: 1 },
          { t: 0.4, v: 1.08 },
          { t: 1, v: 1 },
        ],
      },
    ],
  },
  {
    // §19.5.13 emph id=27 "Flicker"。slide 12 shape "Flicker" 验证。
    // opacity 闪烁数次后回归。
    ids: [27],
    name: "Flicker",
    channels: [
      {
        prop: "opacity",
        defaultEase: "linear",
        kf: [
          { t: 0, v: 1 },
          { t: 0.15, v: 0.3 },
          { t: 0.3, v: 1 },
          { t: 0.45, v: 0.3 },
          { t: 0.6, v: 1 },
          { t: 1, v: 1 },
        ],
      },
    ],
  },
  {
    // §19.5.13 emph id=28 "Grow With Color"。slide 12 shape "Grow With Color"
    // 验证。scale pulse + brightness 提亮模拟"加色伴随放大"。
    ids: [28],
    name: "Grow With Color",
    channels: [
      {
        prop: "scale",
        defaultEase: "easeInOutSine",
        kf: [
          { t: 0, v: 1 },
          { t: 0.5, v: 1.18 },
          { t: 1, v: 1 },
        ],
      },
      {
        prop: "brightness",
        valueKind: "number",
        defaultEase: "easeInOutSine",
        kf: [
          { t: 0, v: 0 },
          { t: 0.5, v: 0.2 },
          { t: 1, v: 0 },
        ],
      },
    ],
  },
  {
    // 没有抽出的子树。色相走一整圈回到原色，中间轻轻胀一下。
    ids: [29],
    name: "Color Cycle",
    channels: [
      {
        prop: "hueRotate",
        valueKind: "number",
        defaultEase: "linear",
        kf: [
          { t: 0, v: 0 },
          { t: 0.33, v: 120 },
          { t: 0.66, v: 240 },
          { t: 1, v: 360 },
        ],
      },
      {
        prop: "scale",
        defaultEase: "easeInOutSine",
        kf: [
          { t: 0, v: 1 },
          { t: 0.5, v: 1.05 },
          { t: 1, v: 1 },
        ],
      },
    ],
  },
  {
    // §19.5.13 emph id=30 "Lighten"。slide 11 shape "Lighten" 验证。变亮保持。
    ids: [30],
    name: "Lighten",
    channels: [
      {
        prop: "brightness",
        valueKind: "number",
        kf: [
          { t: 0, v: 0 },
          { t: 1, v: 0.3 },
        ],
      },
    ],
  },
  {
    // §19.5.13 emph id=31 "Style Emphasis"。slide 13 shape "Style Emphasis"
    // 验证。bold 升级 + 微缩放。
    ids: [31],
    name: "Style Emphasis",
    channels: [
      {
        prop: "fontWeight",
        valueKind: "number",
        kf: [
          { t: 0, v: 400 },
          { t: 1, v: 700 },
        ],
      },
      {
        prop: "scaleX",
        defaultEase: "easeInOutSine",
        kf: [
          { t: 0, v: 1 },
          { t: 0.5, v: 1.04 },
          { t: 1, v: 1 },
        ],
      },
    ],
  },
  {
    // §19.5.13 emph id=32 "Teeter"。slide 12 shape "Teeter" 验证。轻微左右摇摆。
    ids: [32],
    name: "Teeter",
    channels: [
      {
        prop: "rotation",
        relative: true,
        defaultEase: "easeInOutSine",
        kf: [
          { t: 0, v: 0 },
          { t: 0.25, v: -8 },
          { t: 0.75, v: 8 },
          { t: 1, v: 0 },
        ],
      },
    ],
  },
  {
    // §19.5.13 emph id=33 "Vertical Highlight"。slide 11 shape "Vertical
    // Highlight" 验证。竖向短暂放大。
    ids: [33],
    name: "Vertical Highlight",
    channels: [
      {
        prop: "scaleY",
        defaultEase: "easeInOutSine",
        kf: [
          { t: 0, v: 1 },
          { t: 0.5, v: 1.12 },
          { t: 1, v: 1 },
        ],
      },
    ],
  },
  {
    // §19.5.13 emph id=34 "Wave"。slide 13 shape "Wave" 验证。上下波动。
    ids: [34],
    name: "Wave",
    channels: [
      {
        prop: "ty",
        relative: true,
        defaultEase: "easeInOutSine",
        kf: [
          { t: 0, v: 0 },
          { t: 0.25, v: "-$bboxH*0.1" },
          { t: 0.5, v: 0 },
          { t: 0.75, v: "$bboxH*0.1" },
          { t: 1, v: 0 },
        ],
      },
    ],
  },
  {
    // §19.5.13 emph id=35 "Blink"。slide 13 shape "Blink" 验证。
    // opacity 急速闪烁回归。
    ids: [35],
    name: "Blink",
    channels: [
      {
        prop: "opacity",
        defaultEase: "linear",
        kf: [
          { t: 0, v: 1 },
          { t: 0.2, v: 0 },
          { t: 0.4, v: 1 },
          { t: 0.6, v: 0 },
          { t: 0.8, v: 1 },
          { t: 1, v: 1 },
        ],
      },
    ],
  },
  {
    // §19.5.13 emph id=36 "Shimmer"。slide 12 shape "Shimmer" 验证。微微闪烁。
    ids: [36],
    name: "Shimmer",
    channels: [
      {
        prop: "opacity",
        defaultEase: "easeInOutSine",
        kf: [
          { t: 0, v: 1 },
          { t: 0.5, v: 0.6 },
          { t: 1, v: 1 },
        ],
      },
    ],
  },
];
