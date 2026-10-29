// ECMA-376 §19.5.13 exit preset definitions (presetClass="exit").
//
// preset ID 与 entrance 平行（1 Disappear = entrance 1 Appear 的反向，依次类推）。
// samples/Animations.pptx slide 2..8 的 shape label 同时为 entrance 和 exit 命名
// （形如 "Box (\"In\" In, \"Out\" Out)"），逐一对照核实。
//
// 注意几个 entrance / exit 含义互换的 ID：
//   - 42 entrance=Ascend，exit=Descend（自下而上 vs 自上而下）
//   - 47 entrance=Descend，exit=Ascend
// 这是 PowerPoint 历史命名遗留，并非 bug。
//
// channels 是 hard-coded 关键帧近似，目的是接近 PowerPoint 视觉。后续 Phase A
// 路线会用 OOXML subtree 模板替换。
import { EXIT_FLASH_ONCE, FADE_OUT, FLOAT_OUT_TY, FLY_OUT_X, FLY_OUT_Y, HOLD_OPACITY_THEN_FADE_OUT, SCALE_TO_ZERO, STEP_OPACITY_OFF, } from "./shared.js";
export const EXIT = [
    // ---- Basic (1..24) ----
    {
        ids: [1],
        name: "Disappear",
        channels: [STEP_OPACITY_OFF],
    },
    {
        ids: [2],
        name: "Fly Out",
        supportsSubtype: true,
        channels: [HOLD_OPACITY_THEN_FADE_OUT(0.7), FLY_OUT_X, FLY_OUT_Y],
    },
    {
        ids: [3],
        name: "Blinds Out",
        supportsSubtype: true,
        channels: [],
        filters: [{ filter: "blinds", transition: "out", prLst: "$axis(out)" }],
    },
    {
        ids: [4],
        name: "Box Out",
        supportsSubtype: true,
        channels: [],
        filters: [{ filter: "box", transition: "out", prLst: "$inOut" }],
    },
    {
        ids: [5],
        name: "Checkerboard Out",
        supportsSubtype: true,
        channels: [],
        filters: [{ filter: "checkerboard", transition: "out", prLst: "$checker(out)" }],
    },
    {
        ids: [6],
        name: "Circle Out",
        supportsSubtype: true,
        channels: [],
        filters: [{ filter: "circle", transition: "out", prLst: "$inOut" }],
    },
    {
        ids: [7],
        name: "Crawl Out",
        supportsSubtype: true,
        channels: [FADE_OUT, FLY_OUT_X, FLY_OUT_Y],
    },
    {
        ids: [8],
        name: "Diamond Out",
        supportsSubtype: true,
        channels: [],
        filters: [{ filter: "diamond", transition: "out", prLst: "$inOut" }],
    },
    {
        ids: [9],
        name: "Dissolve Out",
        channels: [],
        filters: [{ filter: "dissolve", transition: "out" }],
    },
    {
        ids: [10],
        name: "Fade Out",
        channels: [FADE_OUT],
    },
    {
        // §19.5.13 exit id=11 "Flash Once"。
        ids: [11],
        name: "Flash Once Out",
        channels: [EXIT_FLASH_ONCE],
    },
    {
        // §19.5.13 exit id=12 "Peek Out"。slide 3 shape "Peek In / Peek Out"
        // 验证。修正：旧 exit.ts 把 12 当 "Flash Once"，但 OOXML 12=Peek Out。
        ids: [12],
        name: "Peek Out",
        supportsSubtype: true,
        channels: [FADE_OUT, FLY_OUT_X, FLY_OUT_Y],
    },
    {
        ids: [13],
        name: "Plus Out",
        supportsSubtype: true,
        channels: [],
        filters: [{ filter: "plus", transition: "out", prLst: "$inOut" }],
    },
    {
        ids: [14],
        name: "Random Bars Out",
        supportsSubtype: true,
        channels: [],
        filters: [{ filter: "randombar", transition: "out", prLst: "$axis(out)" }],
    },
    {
        ids: [15],
        name: "Spiral Out",
        channels: [
            FADE_OUT,
            SCALE_TO_ZERO,
            {
                prop: "rotation",
                relative: true,
                defaultEase: "easeInCubic",
                kf: [
                    { t: 0, v: 0 },
                    { t: 1, v: 540 },
                ],
            },
        ],
    },
    {
        // §19.5.13 exit id=16 "Split Out"。slide 3 shape "Split" 验证。
        // 修正：旧 exit.ts 把 16 当 "Peek Out"。Split Out = clipDirection 反向 + fade。
        ids: [16],
        name: "Split Out",
        supportsSubtype: true,
        channels: [
            {
                prop: "clipDirection",
                kf: [
                    { t: 0, v: "$dirName:1" },
                    { t: 1, v: "$dirName:0" },
                ],
            },
            FADE_OUT,
        ],
    },
    {
        // §19.5.13 exit id=17 "Stretch Out" (Collapse)。slide 6 shape "Stretch /
        // Collapse"。修正：旧 exit.ts 把 17 当 "Split Out"。
        ids: [17],
        name: "Stretch Out",
        supportsSubtype: true,
        channels: [
            FADE_OUT,
            {
                prop: "scaleX",
                defaultEase: "easeInCubic",
                kf: [
                    { t: 0, v: 1 },
                    { t: 1, v: 0 },
                ],
            },
        ],
    },
    {
        // §19.5.13 exit id=18 "Strips Out"。slide 3 shape "Strips" 验证。
        // 修正：旧 exit.ts 把 18 当 "Collapse"。
        ids: [18],
        name: "Strips Out",
        supportsSubtype: true,
        channels: [],
        filters: [{ filter: "strips", transition: "out", prLst: "$strips" }],
    },
    {
        // §19.5.13 exit id=19 "Swivel Out"。slide 8 shape "Swivel" 验证。
        // 修正：旧 exit.ts 把 19 当 "Strips Out"。
        ids: [19],
        name: "Swivel Out",
        supportsSubtype: true,
        channels: [
            FADE_OUT,
            {
                prop: "scaleX",
                defaultEase: "easeInCubic",
                kf: [
                    { t: 0, v: 1 },
                    { t: 1, v: 0 },
                ],
            },
        ],
    },
    {
        ids: [20],
        name: "Wedge Out",
        channels: [],
        filters: [{ filter: "wedge", transition: "out" }],
    },
    {
        ids: [21],
        name: "Wheel Out",
        supportsSubtype: true,
        channels: [],
        filters: [{ filter: "wheel", transition: "out", prLst: "$spokes" }],
    },
    {
        ids: [22],
        name: "Wipe Out",
        supportsSubtype: true,
        channels: [],
        filters: [{ filter: "wipe", transition: "out", prLst: "$wipeFrom" }],
    },
    {
        ids: [23],
        name: "Zoom Out",
        channels: [
            FADE_OUT,
            {
                prop: "scale",
                defaultEase: "easeInBack",
                kf: [
                    { t: 0, v: 1 },
                    { t: 1, v: 0 },
                ],
            },
        ],
    },
    {
        ids: [24],
        name: "Random Effects Out",
        channels: [FADE_OUT],
    },
    // ---- Moderate / Exciting (25..58) ----
    {
        ids: [25],
        name: "Boomerang Out",
        channels: [
            FADE_OUT,
            {
                prop: "tx",
                relative: true,
                defaultEase: "easeInQuad",
                kf: [
                    { t: 0, v: 0 },
                    { t: 0.3, v: "$bboxW*0.2" },
                    { t: 1, v: "$bboxW*1.2" },
                ],
            },
            {
                prop: "rotation",
                relative: true,
                defaultEase: "easeInQuad",
                kf: [
                    { t: 0, v: 0 },
                    { t: 1, v: 35 },
                ],
            },
        ],
    },
    {
        // §19.5.13 exit id=26 "Bounce Out"。slide 7 shape "Bounce"。
        ids: [26],
        name: "Bounce Out",
        channels: [
            FADE_OUT,
            {
                prop: "ty",
                relative: true,
                defaultEase: "easeInBack",
                kf: [
                    { t: 0, v: 0 },
                    { t: 1, v: "-$bboxH*1.5" },
                ],
            },
        ],
    },
    {
        // §19.5.13 exit id=27 "Color Typewriter Out"。slide 5。
        ids: [27],
        name: "Color Typewriter Out",
        channels: [
            FADE_OUT,
            {
                prop: "scaleX",
                defaultEase: "linear",
                kf: [
                    { t: 0, v: 1 },
                    { t: 1, v: 0 },
                ],
            },
        ],
    },
    {
        // §19.5.13 exit id=28 "Credits Out"。
        ids: [28],
        name: "Credits Out",
        channels: [
            FADE_OUT,
            {
                prop: "ty",
                relative: true,
                defaultEase: "linear",
                kf: [
                    { t: 0, v: 0 },
                    { t: 1, v: "-$bboxH*2" },
                ],
            },
        ],
    },
    {
        // §19.5.13 exit id=29 "Ease Out"。slide 5。
        ids: [29],
        name: "Ease Out",
        channels: [
            FADE_OUT,
            {
                prop: "ty",
                relative: true,
                defaultEase: "easeInCubic",
                kf: [
                    { t: 0, v: 0 },
                    { t: 1, v: "-$bboxH*0.5" },
                ],
            },
        ],
    },
    {
        // §19.5.13 exit id=30 "Float Down"。
        ids: [30],
        name: "Float Down",
        channels: [FADE_OUT, FLOAT_OUT_TY],
    },
    {
        // §19.5.13 exit id=31 "Grow & Turn Out"。slide 6。
        ids: [31],
        name: "Grow & Turn Out",
        channels: [
            FADE_OUT,
            SCALE_TO_ZERO,
            {
                prop: "rotation",
                relative: true,
                defaultEase: "easeInCubic",
                kf: [
                    { t: 0, v: 0 },
                    { t: 1, v: 180 },
                ],
            },
        ],
    },
    {
        // 与已抽样的 43 同名。沿半圆弧落到下方。
        ids: [32],
        name: "Center Revolve",
        channels: [
            FADE_OUT,
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
                    { t: 0, v: 0 },
                    { t: 0.5, v: "$sh*0.155" },
                    { t: 1, v: "$sh*0.31" },
                ],
            },
        ],
    },
    {
        // 没有抽出的子树。先略抬起，再落到画面下方。
        ids: [33],
        name: "Depart",
        channels: [
            FADE_OUT,
            {
                prop: "ty",
                relative: true,
                defaultEase: "easeInCubic",
                kf: [
                    { t: 0, v: 0 },
                    { t: 0.28, v: "-$sh*0.04" },
                    { t: 1, v: "$sh*0.35" },
                ],
            },
        ],
    },
    {
        // §19.5.13 exit id=34 "Light Speed Out"。slide 7。
        ids: [34],
        name: "Light Speed Out",
        channels: [
            FADE_OUT,
            {
                prop: "tx",
                relative: true,
                defaultEase: "easeInCubic",
                kf: [
                    { t: 0, v: 0 },
                    { t: 1, v: "-$bboxW*2" },
                ],
            },
            {
                prop: "scaleX",
                defaultEase: "easeInCubic",
                kf: [
                    { t: 0, v: 1 },
                    { t: 1, v: 2.5 },
                ],
            },
        ],
    },
    {
        // §19.5.13 exit id=35 "Pinwheel Out"。slide 8。
        ids: [35],
        name: "Pinwheel Out",
        channels: [
            FADE_OUT,
            SCALE_TO_ZERO,
            {
                prop: "rotation",
                relative: true,
                defaultEase: "easeInCubic",
                kf: [
                    { t: 0, v: 0 },
                    { t: 1, v: 720 },
                ],
            },
        ],
    },
    {
        // 与已抽样的 37 同名。先略抬起，再沉到画面下方。
        ids: [36],
        name: "Sink Down",
        channels: [
            FADE_OUT,
            {
                prop: "ty",
                relative: true,
                defaultEase: "easeInCubic",
                kf: [
                    { t: 0, v: 0 },
                    { t: 0.25, v: "-$sh*0.03" },
                    { t: 1, v: "$sh" },
                ],
            },
        ],
    },
    {
        // §19.5.13 exit id=37 "Sink Down"。slide 6 shape "Rise Up / Sink Down"。
        ids: [37],
        name: "Sink Down",
        channels: [FADE_OUT, FLOAT_OUT_TY],
    },
    {
        // §19.5.13 exit id=38 "Swish Out"。slide 8。
        ids: [38],
        name: "Swish Out",
        channels: [
            FADE_OUT,
            {
                prop: "tx",
                relative: true,
                defaultEase: "easeInQuad",
                kf: [
                    { t: 0, v: 0 },
                    { t: 1, v: "$bboxW*1.5" },
                ],
            },
        ],
    },
    {
        // §19.5.13 exit id=39 "Thread Out"。slide 8。
        ids: [39],
        name: "Thread Out",
        channels: [
            FADE_OUT,
            {
                prop: "scaleX",
                defaultEase: "easeInQuad",
                kf: [
                    { t: 0, v: 1 },
                    { t: 1, v: 0 },
                ],
            },
        ],
    },
    {
        // §19.5.13 exit id=40 "Unfold Out"。slide 6。
        ids: [40],
        name: "Unfold Out",
        channels: [
            FADE_OUT,
            {
                prop: "scaleY",
                defaultEase: "easeInCubic",
                kf: [
                    { t: 0, v: 1 },
                    { t: 1, v: 0 },
                ],
            },
        ],
    },
    {
        // §19.5.13 exit id=41 "Whip Out"。slide 8。
        ids: [41],
        name: "Whip Out",
        supportsSubtype: true,
        channels: [
            FADE_OUT,
            {
                prop: "tx",
                relative: true,
                defaultEase: "easeInCubic",
                kf: [
                    { t: 0, v: 0 },
                    { t: 1, v: "-$bboxW" },
                ],
            },
        ],
    },
    {
        // §19.5.13 exit id=42 "Descend"。slide 5 shape "Descend"（exit 用 42）。
        // 注意 entrance 42=Ascend，exit 42=Descend（方向相反）。
        ids: [42],
        name: "Descend",
        channels: [
            FADE_OUT,
            {
                prop: "ty",
                relative: true,
                defaultEase: "easeInCubic",
                kf: [
                    { t: 0, v: 0 },
                    { t: 1, v: "$bboxH" },
                ],
            },
        ],
    },
    {
        // §19.5.13 exit id=43 "Center Revolve Out"。slide 5。
        ids: [43],
        name: "Center Revolve Out",
        channels: [
            FADE_OUT,
            {
                prop: "scaleX",
                defaultEase: "easeInCubic",
                kf: [
                    { t: 0, v: 1 },
                    { t: 1, v: 0 },
                ],
            },
        ],
    },
    {
        // 与已抽样的 47 同名。向上离开约十分之一画面。
        ids: [44],
        name: "Ascend",
        channels: [
            FADE_OUT,
            {
                prop: "ty",
                relative: true,
                defaultEase: "easeInCubic",
                kf: [
                    { t: 0, v: 0 },
                    { t: 1, v: "-$sh*0.1" },
                ],
            },
        ],
    },
    {
        // §19.5.13 exit id=45 "Faded Swivel Out"。slide 4。
        ids: [45],
        name: "Faded Swivel Out",
        channels: [
            FADE_OUT,
            {
                prop: "scaleX",
                defaultEase: "easeInCubic",
                kf: [
                    { t: 0, v: 1 },
                    { t: 1, v: 0 },
                ],
            },
        ],
    },
    {
        // 没有抽出的子树。进入的彩色放大倒过来：缩到看不见，同时偏色、提亮。
        ids: [46],
        name: "Grow with Color Out",
        channels: [
            FADE_OUT,
            SCALE_TO_ZERO,
            {
                prop: "brightness",
                valueKind: "number",
                defaultEase: "easeInCubic",
                kf: [
                    { t: 0, v: 0 },
                    { t: 1, v: 0.55 },
                ],
            },
            {
                prop: "hueRotate",
                valueKind: "number",
                defaultEase: "easeInCubic",
                kf: [
                    { t: 0, v: 0 },
                    { t: 1, v: 55 },
                ],
            },
        ],
    },
    {
        // §19.5.13 exit id=47 "Ascend"。slide 5（entrance 47=Descend，exit 47=Ascend）。
        ids: [47],
        name: "Ascend",
        channels: [
            FADE_OUT,
            {
                prop: "ty",
                relative: true,
                defaultEase: "easeInCubic",
                kf: [
                    { t: 0, v: 0 },
                    { t: 1, v: "-$bboxH" },
                ],
            },
        ],
    },
    {
        // §19.5.13 exit id=48 "Sling Out"。slide 8。
        ids: [48],
        name: "Sling Out",
        channels: [
            FADE_OUT,
            SCALE_TO_ZERO,
            {
                prop: "rotation",
                relative: true,
                defaultEase: "easeInBack",
                kf: [
                    { t: 0, v: 0 },
                    { t: 1, v: 60 },
                ],
            },
        ],
    },
    {
        // §19.5.13 exit id=49 "Spinner Out"。slide 6。
        ids: [49],
        name: "Spinner Out",
        channels: [
            FADE_OUT,
            {
                prop: "rotation",
                relative: true,
                defaultEase: "easeInCubic",
                kf: [
                    { t: 0, v: 0 },
                    { t: 1, v: -360 },
                ],
            },
        ],
    },
    {
        // §19.5.13 exit id=50 "Compress Out" (Stretchy)。slide 5。
        ids: [50],
        name: "Compress Out",
        channels: [
            FADE_OUT,
            {
                prop: "scale",
                defaultEase: "easeInCubic",
                kf: [
                    { t: 0, v: 1 },
                    { t: 1, v: 1.5 },
                ],
            },
        ],
    },
    {
        // §19.5.13 exit id=51 "Magnify Out"。slide 8。
        ids: [51],
        name: "Magnify Out",
        channels: [
            FADE_OUT,
            {
                prop: "scale",
                defaultEase: "easeInBack",
                kf: [
                    { t: 0, v: 1 },
                    { t: 0.15, v: 1.1 },
                    { t: 1, v: 0.15 },
                ],
            },
        ],
    },
    {
        // §19.5.13 exit id=52 "Curve Down"。slide 7 shape "Curve Up / Curve Down"。
        ids: [52],
        name: "Curve Down",
        channels: [
            FADE_OUT,
            {
                prop: "ty",
                relative: true,
                defaultEase: "easeInQuad",
                kf: [
                    { t: 0, v: 0 },
                    { t: 1, v: "$bboxH*1.5" },
                ],
            },
            {
                prop: "tx",
                relative: true,
                defaultEase: "easeInQuad",
                kf: [
                    { t: 0, v: 0 },
                    { t: 1, v: "$bboxW*0.4" },
                ],
            },
        ],
    },
    {
        // §19.5.13 exit id=53 "Faded Zoom Out"。slide 4。
        ids: [53],
        name: "Faded Zoom Out",
        channels: [
            FADE_OUT,
            {
                prop: "scale",
                defaultEase: "easeInCubic",
                kf: [
                    { t: 0, v: 1 },
                    { t: 1, v: 0.25 },
                ],
            },
        ],
    },
    {
        // §19.5.13 exit id=54 "Glide Out"。slide 7。
        ids: [54],
        name: "Glide Out",
        channels: [
            FADE_OUT,
            {
                prop: "ty",
                relative: true,
                defaultEase: "easeInCubic",
                kf: [
                    { t: 0, v: 0 },
                    { t: 1, v: "-$bboxH*0.8" },
                ],
            },
        ],
    },
    {
        // §19.5.13 exit id=55 "Contract"。slide 4 shape "Expand / Contract"。
        ids: [55],
        name: "Contract",
        channels: [
            FADE_OUT,
            {
                prop: "scale",
                defaultEase: "easeInCubic",
                kf: [
                    { t: 0, v: 1 },
                    { t: 1, v: 0.25 },
                ],
            },
        ],
    },
    {
        // §19.5.13 exit id=56 "Flip Out"。slide 7。
        ids: [56],
        name: "Flip Out",
        channels: [
            FADE_OUT,
            {
                prop: "scaleX",
                defaultEase: "easeInCubic",
                kf: [
                    { t: 0, v: 1 },
                    { t: 1, v: -1 },
                ],
            },
        ],
    },
    {
        // 没有抽出的子树。向上漂出，水平轻轻摆一下，并略微转开。
        ids: [57],
        name: "Float Up",
        channels: [
            FADE_OUT,
            {
                prop: "ty",
                relative: true,
                defaultEase: "easeInOutSine",
                kf: [
                    { t: 0, v: 0 },
                    { t: 0.25, v: "$sh*0.03" },
                    { t: 1, v: "-$sh*0.4" },
                ],
            },
            {
                prop: "tx",
                relative: true,
                defaultEase: "easeInOutSine",
                kf: [
                    { t: 0, v: 0 },
                    { t: 0.45, v: "$sw*0.03" },
                    { t: 1, v: "-$sw*0.08" },
                ],
            },
            {
                prop: "rotation",
                relative: true,
                defaultEase: "easeInCubic",
                kf: [
                    { t: 0, v: 0 },
                    { t: 1, v: -12 },
                ],
            },
        ],
    },
    {
        // §19.5.13 exit id=58 "Fold Out"。slide 7。
        ids: [58],
        name: "Fold Out",
        channels: [
            FADE_OUT,
            {
                prop: "scaleY",
                defaultEase: "easeInCubic",
                kf: [
                    { t: 0, v: 1 },
                    { t: 1, v: 0 },
                ],
            },
        ],
    },
];
