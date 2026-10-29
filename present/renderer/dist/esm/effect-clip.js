// ECMA-376 §19.5.8 animEffect filter 的几何实现。
// 把 (filter, prLst, progress, transition) 转成 SVG path d，供 SVG clipPath / Canvas
// Path2D 共用。返回的 path 永远定义"可见区域"。
// 规范定义的 filter 值：
//   barn / blinds / box / checkerboard / circle / diamond / dissolve / fade /
//   image / pixelate / plus / randombar / slide / stretch / strips / wedge / wheel / wipe
// prLst 常见取值：horz / vert / in / out / horz(in) / vert(out) / fromLeft / fromTop ...
//
// §19.5.8 entrance / exit 语义（与 PowerPoint 实际行为一致）：
//   filter 描述一个随时长向前推进的"sweep 边界"（例如 box(in) = 边框从外缘向中心
//   收缩、wipe(down) = 水平线从上往下扫）。
//   - entrance: 已扫过的区域 = 可见区。runtime 把 val 从 0 → 1。
//   - exit:     已扫过的区域 = 隐藏区。runtime 把 val 从 1 → 0。
//
//   因而 entrance 和 exit 在同一 val 下的可见区是"互补"关系，公式：
//     visible_exit(val) = fullRect ∖ visible_entrance(1-val)
//
//   这条规律对所有 sweep 类 filter（box/circle/diamond/plus/barn/wipe/blinds/
//   wedge/wheel/checkerboard/randombar/strips/dissolve）都成立。runtime 已经把
//   transition 信息一并写入 EffectGeom.transition，这里在 entrance 几何外面包
//   一层 complement 即可——无需为每个 filter 单独写一套 exit 几何。
//
//   fade / image 不属于 sweep 类，可见区永远是 fullRect，opacity 通道单独管
//   visibility（见 svg-backend 的 fadeOpacityFromClip）。
const TWO_PI = Math.PI * 2;
// 解析 prLst 中的方向语义。
// PowerPoint 实际取值（ECMA-376 §19.5.8）举例：
//   horizontal / vertical / across / inHorizontal / outHorizontal /
//   inVertical / outVertical / in / out / inDownward / outFromCenter /
//   down / up / left / right / downward / upward / leftward / rightward /
//   fromBottom / fromTop / fromLeft / fromRight / horizontalIn / verticalOut ...
// side 表示"内容显现的起点边"（wipePath 据此确定 reveal 锚定边）：
//   left=从左侧显现向右扩（L→R），right=从右侧向左扩（R→L），
//   top=从顶部向下扩（上→下），bottom=从底部向上扩（下→上）。
//
// §19.5.8 wipe 方向 token 是"混合约定"（与 PowerPoint 实际渲染一致，参 22.x 预设：
//   subtype1=wipe(up)=From Bottom，subtype8=wipe(left)=From Left）：
//   - 水平 token 用"起点边"语义：wipe(left)="From Left"=L→R，wipe(right)="From Right"=R→L。
//     （token 名 left/right 本就是边名，PowerPoint UI 即 "自左侧/自右侧"。）
//   - 垂直 token 用"运动方向"语义：wipe(up)=向上扫=从底部显现（下→上）=From Bottom；
//     wipe(down)=向下扫=从顶部显现（上→下）=From Top。（token 名 up/down 是运动词，
//     不是边名 top/bottom。）
//   显式 from* token（fromLeft/fromRight/fromTop/fromBottom）一律按起点边，
//   与水平裸 token 同向：fromLeft→left、fromRight→right。
function parseDir(prLst) {
    const s = (prLst ?? "").toLowerCase();
    const axis = /vertical|vert/.test(s)
        ? "vert"
        : /horizontal|across|horz/.test(s)
            ? "horz"
            : "diag";
    // 检测 in/out 前后缀，避免与 "horiz**in**ate" 等不存在的字串误匹配。
    const inOut = /(?:^|[^a-z])in(?:[a-z]|$)|inhorizontal|invertical|\(in\)|^in$/.test(s)
        ? "in"
        : /(?:^|[^a-z])out(?:[a-z]|$)|outhorizontal|outvertical|\(out\)|^out$/.test(s)
            ? "out"
            : "none";
    let side = "center";
    // 垂直：运动方向语义（up=向上扫=从底部显现）。fromTop/fromBottom 为起点边语义。
    if (/down|downward|fromtop/.test(s))
        side = "top";
    else if (/up|upward|frombottom/.test(s))
        side = "bottom";
    // 水平：起点边语义（left=从左侧显现→向右扩 L→R）。裸 left/right 与 fromLeft/fromRight 同向。
    else if (/(^|[^a-z])left|leftward|fromleft/.test(s))
        side = "left";
    else if (/(^|[^a-z])right|rightward|fromright/.test(s))
        side = "right";
    return { axis, inOut, side };
}
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
// 整体可见矩形，作为兜底（progress=1）和 dissolve 等"非几何"滤镜使用。
function fullRect(b) {
    return `M ${b.x} ${b.y} h ${b.w} v ${b.h} h ${-b.w} Z`;
}
function emptyPath() {
    return "";
}
// blinds：n 条平行带从 0 → bandWidth*p 增长。
function blindsPath(b, axis, p, count = 6) {
    const n = Math.max(2, count);
    if (axis === "horz") {
        const band = b.h / n;
        let d = "";
        for (let i = 0; i < n; i++) {
            const y = b.y + i * band;
            const h = band * p;
            d += `M ${b.x} ${y} h ${b.w} v ${h} h ${-b.w} Z `;
        }
        return d.trim();
    }
    const band = b.w / n;
    let d = "";
    for (let i = 0; i < n; i++) {
        const x = b.x + i * band;
        const w = band * p;
        d += `M ${x} ${b.y} v ${b.h} h ${w} v ${-b.h} Z `;
    }
    return d.trim();
}
// strips：N 条水平条带沿对角方向 snap-to-grid 的"阶梯擦除"。
//
// §19.5.8 strips(corner) 视觉特征（与 WPS / PowerPoint 实际渲染一致）：
//   - 把 bbox 切成 N 条等高水平条带
//   - 每条带的 reveal 边界 x 不同，整体形成一条贴着对角线的"阶梯（staircase）"
//   - p 推进时，阶梯保持形状，沿对角法线整体平移；视觉是"砖块层层叠加铺过去"
//   - 因为条带高度 = H/N 固定、阶梯水平段长度 = H/N（由 wavefront 几何决定），
//     每一格约等于正方形小砖（与 WPS 截图一致）
//
// 4 个 corner 子类型代表 wave 行进方向，对应不同的起点角：
//   downRight：起点 = upLeft   (0,0)，wave 朝 +x+y 推进 → 显现先在左上、终在右下
//   downLeft： 起点 = upRight  (W,0)，wave 朝 -x+y 推进 → 显现先在右上、终在左下
//   upRight：  起点 = downLeft (0,H)，wave 朝 +x-y 推进 → 显现先在左下、终在右上
//   upLeft：   起点 = downRight(W,H)，wave 朝 -x-y 推进 → 显现先在右下、终在左上
//
// 统一映射到参考帧 "downRight"：起点左上、wavefront 沿 +x+y、可见区在 wavefront 左上侧。
// 砖块尺寸：WPS / PowerPoint 把 bbox 长宽各 13 等分，单砖 = W/13 × H/13（aspect 跟随 bbox）。
//   - N = 13 条水平 strip，每条高 H/13
//   - 阶梯横向 step 长度 = W/13（不是 stripH，所以单砖不是方形而是与 bbox 同比例的长方形）
// wavefront 方程：x/W + y/H = 2·p（线性插值的"对角进度"）
//   - p=0 → 直线退化到 (0,0) → 可见区为空
//   - p=0.5 → 直线 = 主对角线 (0,H) - (W,0) → 可见区 = 左上半三角
//   - p=1 → 直线退化到对角 (W,H) → 可见区 = fullRect
//   等价写法：front = (W + ASPECT·H)·p，其中 ASPECT = W/H 把垂直距离归一到水平等价距离。
//
// 阶梯 snap：对每条 strip i（y ∈ [i·stripH, (i+1)·stripH]，0=top），取 strip 顶边 y = i·stripH
// 处的 wavefront x：x_i = front - ASPECT·i·stripH = W·(2p - i/N)。strip i 的可见 x 范围
// = [0, clamp(x_i, 0, W)]。取顶边而非中线/底边能让阶梯外轮廓正好贴住 wavefront 切线、
// 相邻 strip 共边无缝衔接。
//
// 几何：用一条单一闭合多边形描述整片可见区域：左上角起，沿 top → strip 顶部水平段 →
// 阶梯下行（H-V-H-V...）→ 右下区域 → 左侧回到起点。NONZERO winding 即可填充，
// 不需要 even-odd（也不会产生 strips 之间的反走样缝）。
//
// 注：OOXML §19.5.3 明确"Exact rendering of any animation is determined by the
// rendering application"，N 由实现决定。N=13 与 WPS / PowerPoint 一致。
const STRIPS_BAND_COUNT = 13;
function stripsPath(b, p, corner) {
    if (p <= 0)
        return emptyPath();
    if (p >= 1)
        return fullRect(b);
    const W = b.w;
    const H = b.h;
    const N = STRIPS_BAND_COUNT;
    const stripH = H / N;
    // aspect = W/H 让阶梯横向 step = W/N、纵向 step = H/N，单砖与 bbox 长宽比一致。
    // H=0 退化保护：直接用 1，避免除 0（实际上 H=0 时 stripH=0，整个动画不可见）。
    const aspect = H > 0 ? W / H : 1;
    // 4 corner → flipX / flipY 映射到参考帧 downRight（起点左上、wavefront +x+y）。
    const flipX = corner === "downLeft" || corner === "upLeft";
    const flipY = corner === "upRight" || corner === "upLeft";
    // 参考帧下每条 strip 顶边 y 处的 wavefront x（可见区 x 范围 = [0, x_i]）。
    // wavefront 方程：x/W + y/H = 2·p，等价 x + aspect·y = (W+aspect·H)·p = 2W·p（因 aspect·H = W）。
    const front = (W + aspect * H) * p;
    const xAtRow = (rowY) => clamp(front - aspect * rowY, 0, W);
    // 收集每条 strip 的右边界 x（参考帧）。
    // strip i 顶边 y = i·stripH（0 = 最上方 strip）。
    const xs = [];
    for (let i = 0; i < N; i++) {
        xs.push(xAtRow(i * stripH));
    }
    // 末位用底边 y = H 处的 wavefront x 作为底部水平段的 x（保证多边形闭合到 (xBot, H)）。
    const xBot = xAtRow(H);
    // 找出有可见 reveal 的 strip 范围。所有 strip 都未 reveal → emptyPath。
    let firstWithReveal = -1;
    for (let i = 0; i < N; i++) {
        if (xs[i] > 0) {
            firstWithReveal = i;
            break;
        }
    }
    if (firstWithReveal === -1 && xBot <= 0)
        return emptyPath();
    // 构造单条闭合阶梯多边形（参考帧顺时针）。
    // 路径：从 (0, 0) 开始 →
    //   top edge: (0,0) → (x_0, 0)
    //   阶梯下行：对每条 strip i，先垂直到 (x_i, (i+1)·stripH)，再水平到 (x_{i+1}, (i+1)·stripH)
    //   末段：垂直到 (xBot, H)，再水平回 (0, H)，最后左边垂直回 (0, 0)
    //
    // 起点 (0, 0) 永远在可见区域内（参考帧起点角），所以多边形总是连通完整。
    const verts = [];
    verts.push([0, 0]);
    verts.push([xs[0], 0]);
    for (let i = 0; i < N; i++) {
        const yBot = (i + 1) * stripH;
        // 垂直下到 strip i 底边
        verts.push([xs[i], yBot]);
        // 水平到下一条 strip 顶边 x（最后一条用 xBot 作为底边水平段终点）
        const xNext = i + 1 < N ? xs[i + 1] : xBot;
        if (xNext !== xs[i])
            verts.push([xNext, yBot]);
    }
    verts.push([0, H]);
    // 反射 + 平移到 bbox 坐标。
    const xform = (xy) => {
        const x = flipX ? W - xy[0] : xy[0];
        const y = flipY ? H - xy[1] : xy[1];
        return [b.x + x, b.y + y];
    };
    let pts = verts.map(xform);
    // 单方向翻转把顺时针 → 逆时针；反转回顺时针保持 winding 一致（NONZERO 下都能填充，
    // 但反转方向后 stroke 等顺序敏感操作仍然正确）。
    if (flipX !== flipY)
        pts = pts.slice().reverse();
    let d = `M ${pts[0][0]} ${pts[0][1]} `;
    for (let i = 1; i < pts.length; i++)
        d += `L ${pts[i][0]} ${pts[i][1]} `;
    return d + "Z";
}
// checkerboard：n×n 棋盘格 reveal。
// §19.5.8 checkerboard(across) → 从左到右逐列扫过；(down) → 从上到下逐行。
// 算法：把每个 cell 的"激活时间"按主方向 + 棋盘奇偶性映射到 [0,1]，
//      cell 内部按副方向 wipe。这样两种方向的视觉差异与 PowerPoint 接近。
function checkerboardPath(b, primary, p, n = 8) {
    const cw = b.w / n;
    const ch = b.h / n;
    let d = "";
    for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
            // 主方向上的归一化进度（0..1）；奇/偶 cell 错开半相位形成棋盘节奏。
            const major = primary === "horz" ? c / Math.max(1, n - 1) : r / Math.max(1, n - 1);
            const phase = ((r + c) % 2 === 0 ? 0 : 0.5) / n;
            const start = major * 0.5 + phase;
            const end = start + 1 / n;
            if (p >= end) {
                d += `M ${b.x + c * cw} ${b.y + r * ch} h ${cw} v ${ch} h ${-cw} Z `;
            }
            else if (p > start) {
                const local = (p - start) / (end - start);
                if (primary === "horz") {
                    const w = cw * local;
                    d += `M ${b.x + c * cw} ${b.y + r * ch} h ${w} v ${ch} h ${-w} Z `;
                }
                else {
                    const h = ch * local;
                    d += `M ${b.x + c * cw} ${b.y + r * ch} h ${cw} v ${h} h ${-cw} Z `;
                }
            }
        }
    }
    return d.trim();
}
// §19.5.8 box / circle / diamond 的 in/out 子类型语义（与 PDF transition /M /I /O
// 同源、与 PowerPoint 实际渲染一致）：
//   (in)  inward sweep ：边框从 bbox 外缘向中心收缩，"中心孔"由 full 缩小到 0。
//                       progress=p 时，可见区 = fullRect ∖ 中心几何(尺寸 = (1-p)·full)。
//                       视觉上元素从四周（环形）逐步显现到中心。
//   (out) outward sweep：几何从中心向外缘扩张，"中心实体"由 0 长到 full。
//                       progress=p 时，可见区 = 中心几何(尺寸 = p·full)。
//                       视觉上元素从中心一个小点逐步胀出到全屏。
//
// runtime（runtime.ts）已通过 transition="out" → val = 1 - u 把"进入/退出"统一为
// "progress=1 完全可见, progress=0 完全不可见"，所以 filter 端只需关心 (in)/(out)
// 这个几何方向，不必区分 entrance/exit。两端边界统一：
//   p≤0 → emptyPath；p≥1 → fullRect（由 effectClipPathD 顶层 guard 兜底）。
//
// 历史 bug：之前实现把 (in) 写成"中心扩张"、(out) 写成"外环收缩"，刚好两个分支
// 颠倒。导致 Box/Circle/Diamond 进入动画方向看起来与 PowerPoint 相反——例如
// Box(in) 进入本应该是"外环逐步覆盖到中心"，被实现成了"中心方框由小到大"。
function circlePath(b, p, inOut) {
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const Rx = b.w / 2;
    const Ry = b.h / 2;
    const R = Math.hypot(b.w, b.h) / 2;
    if (inOut === "in") {
        // 外环 + 收缩孔：孔的半径 = R·(1-p)
        if (p <= 0)
            return emptyPath();
        const f = 1 - p;
        const rx = Rx * f;
        const ry = Ry * f;
        return `${fullRect(b)} M ${cx + rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx - rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx + rx} ${cy} Z`;
    }
    // 从中心扩张的椭圆：半径 = R·p（按 bbox 长宽比缩放）
    const r = R * p;
    if (r <= 0)
        return emptyPath();
    return `M ${cx + r * (Rx / R)} ${cy} A ${r * (Rx / R)} ${r * (Ry / R)} 0 1 0 ${cx - r * (Rx / R)} ${cy} A ${r * (Rx / R)} ${r * (Ry / R)} 0 1 0 ${cx + r * (Rx / R)} ${cy} Z`;
}
function diamondPath(b, p, inOut) {
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const hx = b.w / 2;
    const hy = b.h / 2;
    if (inOut === "in") {
        if (p <= 0)
            return emptyPath();
        const f = 1 - p;
        return `${fullRect(b)} M ${cx} ${cy - hy * f} L ${cx + hx * f} ${cy} L ${cx} ${cy + hy * f} L ${cx - hx * f} ${cy} Z`;
    }
    if (p <= 0)
        return emptyPath();
    return `M ${cx} ${cy - hy * p} L ${cx + hx * p} ${cy} L ${cx} ${cy + hy * p} L ${cx - hx * p} ${cy} Z`;
}
function boxPath(b, p, inOut) {
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    if (inOut === "in") {
        if (p <= 0)
            return emptyPath();
        const f = 1 - p;
        const w = b.w * f;
        const h = b.h * f;
        return `${fullRect(b)} M ${cx - w / 2} ${cy - h / 2} h ${w} v ${h} h ${-w} Z`;
    }
    if (p <= 0)
        return emptyPath();
    const w = b.w * p;
    const h = b.h * p;
    return `M ${cx - w / 2} ${cy - h / 2} h ${w} v ${h} h ${-w} Z`;
}
// 12 顶点的"+"字形多边形（顺时针，单条 closed sub-path）。
// 用单条 path 而不是两个 overlap 矩形是为了让 even-odd 计算 hole 时
// 中心交叉处 winding = 1（不是 2），从而正确表达 cross 内部为单一连通区域。
// 退化情况：cross 覆盖 bbox 时返回 fullRect；任一维度 ≤ 0 时退化为单矩形或空。
function crossPoly(b, hH, vW) {
    if (hH >= b.h || vW >= b.w)
        return fullRect(b);
    if (hH <= 0 && vW <= 0)
        return emptyPath();
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const halfH = hH / 2;
    const halfW = vW / 2;
    if (hH <= 0)
        return `M ${cx - halfW} ${b.y} h ${vW} v ${b.h} h ${-vW} Z`;
    if (vW <= 0)
        return `M ${b.x} ${cy - halfH} h ${b.w} v ${hH} h ${-b.w} Z`;
    return (`M ${cx - halfW} ${b.y} ` +
        `L ${cx + halfW} ${b.y} ` +
        `L ${cx + halfW} ${cy - halfH} ` +
        `L ${b.x + b.w} ${cy - halfH} ` +
        `L ${b.x + b.w} ${cy + halfH} ` +
        `L ${cx + halfW} ${cy + halfH} ` +
        `L ${cx + halfW} ${b.y + b.h} ` +
        `L ${cx - halfW} ${b.y + b.h} ` +
        `L ${cx - halfW} ${cy + halfH} ` +
        `L ${b.x} ${cy + halfH} ` +
        `L ${b.x} ${cy - halfH} ` +
        `L ${cx - halfW} ${cy - halfH} Z`);
}
// plus：与 box/circle/diamond 同源的 inward/outward 几何 filter。
// §19.5.8 plus(in|out)：
//   (in)  inward sweep ：十字形从外向中心收拢 → 可见 = fullRect ∖ 中心收缩"+"孔。
//                       progress=p 时，cross 臂宽/高 = full·(1-p)；
//                       视觉上 4 个角先显，然后向中心合拢直到铺满。
//   (out) outward sweep：十字形从中心向外扩张 → 可见 = 单个增长的"+"。
//                       progress=p 时，cross 臂宽/高 = full·p；
//                       视觉上中心先冒出小十字，然后向四角延伸直到铺满。
// runtime 已通过 transition 反转 progress，filter 端只需用 inOut 决定几何分支。
function plusPath(b, p, inOut) {
    if (p <= 0)
        return emptyPath();
    if (p >= 1)
        return fullRect(b);
    if (inOut === "in") {
        const f = 1 - p;
        const hH = b.h * f;
        const vW = b.w * f;
        return `${fullRect(b)} ${crossPoly(b, hH, vW)}`;
    }
    // outward：十字本身从 0 长到 full
    return crossPoly(b, b.h * p, b.w * p);
}
// wedge：单个扇形从 12 点顺时针扫。
// SVG A 在扫过近 360° 时起终点重合，弧会退化成缺口，wheel(1) 收不拢。
// 用折线扇形，扫满后交给上层 fullRect。
function wedgePath(b, p) {
    const angle = TWO_PI * clamp01(p);
    if (angle <= 0)
        return emptyPath();
    if (angle >= TWO_PI - 1e-3)
        return fullRect(b);
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const R = Math.hypot(b.w, b.h);
    const a0 = -Math.PI / 2;
    const steps = Math.max(8, Math.ceil(48 * (angle / TWO_PI)));
    let d = `M ${cx} ${cy} `;
    for (let s = 0; s <= steps; s++) {
        const a = a0 + angle * (s / steps);
        d += `L ${cx + R * Math.cos(a)} ${cy + R * Math.sin(a)} `;
    }
    return `${d}Z`;
}
// wheel：N 辐条同步旋转。复用 wedge 数学。
function wheelPath(b, p, spokes = 1) {
    const n = Math.max(1, spokes);
    if (n === 1)
        return wedgePath(b, p);
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const R = Math.hypot(b.w, b.h);
    const span = TWO_PI / n;
    const reveal = span * clamp01(p);
    let d = "";
    const steps = Math.max(2, Math.ceil(24 / n));
    for (let i = 0; i < n; i++) {
        const a0 = i * span - Math.PI / 2;
        d += `M ${cx} ${cy} `;
        for (let s = 0; s <= steps; s++) {
            const a = a0 + reveal * (s / steps);
            d += `L ${cx + R * Math.cos(a)} ${cy + R * Math.sin(a)} `;
        }
        d += "Z ";
    }
    return d.trim();
}
// wipe / slide：直接复用矩形定向裁切。
function wipePath(b, p, side) {
    const w = b.w * p;
    const h = b.h * p;
    switch (side) {
        case "left":
            return `M ${b.x} ${b.y} h ${w} v ${b.h} h ${-w} Z`;
        case "right":
            return `M ${b.x + b.w - w} ${b.y} h ${w} v ${b.h} h ${-w} Z`;
        case "top":
            return `M ${b.x} ${b.y} h ${b.w} v ${h} h ${-b.w} Z`;
        case "bottom":
            return `M ${b.x} ${b.y + b.h - h} h ${b.w} v ${h} h ${-b.w} Z`;
    }
}
// barn：双向开门（horz/vert）。
// §19.5.8 barn(inHorizontal|outHorizontal|inVertical|outVertical)：
//   (in)  两扇门向中心收拢 → 可见区 = 外侧双带（fullRect ∖ 中间收缩带）。
//                            progress=p 时中间带宽 = full·(1-p)，环形覆盖率随 p 上升。
//   (out) 两扇门从中心向外推开 → 可见区 = 中间带，宽度 = full·p，从 0 长到 full。
// 与 box/circle/diamond 同源（同样的 inward/outward 语义）。历史 bug 同样存在
// 颠倒：旧版 "in" 输出中央带、"out" 输出外环，与 PowerPoint 真实方向相反。
function barnPath(b, axis, p, inOut) {
    if (axis === "vert") {
        const cx = b.x + b.w / 2;
        if (inOut === "in") {
            if (p <= 0)
                return emptyPath();
            const f = 1 - p;
            const cw = b.w * f;
            return `${fullRect(b)} M ${cx - cw / 2} ${b.y} h ${cw} v ${b.h} h ${-cw} Z`;
        }
        if (p <= 0)
            return emptyPath();
        const half = (b.w * p) / 2;
        return `M ${cx - half} ${b.y} h ${half * 2} v ${b.h} h ${-half * 2} Z`;
    }
    const cy = b.y + b.h / 2;
    if (inOut === "in") {
        if (p <= 0)
            return emptyPath();
        const f = 1 - p;
        const ch = b.h * f;
        return `${fullRect(b)} M ${b.x} ${cy - ch / 2} h ${b.w} v ${ch} h ${-b.w} Z`;
    }
    if (p <= 0)
        return emptyPath();
    const half = (b.h * p) / 2;
    return `M ${b.x} ${cy - half} h ${b.w} v ${half * 2} h ${-b.w} Z`;
}
// randomBars：N 条窄条带在伪随机时刻整条瞬间 pop in，营造"百叶窗洗牌"质感。
// PowerPoint / WPS Random Bars 的视觉特征：
//   - 条带数量较多（~24 条以上），单条带很窄
//   - 每条带在随机时刻"啪"地一下出现（条带内没有左右 / 上下 wipe，是瞬时显示）
//   - 时刻分布在整个动画时长内，最后一条带在 p≈1 时出现
//
// 旧实现错在：N=8 太少 + 每条带在自身 1/N 窗口内做 left→right wipe，单帧只看到 1 条
// 在 wipe 中、其他要么完全显要么完全隐——视觉像缓慢的对角 wipe，几乎看不出 random。
// 现改为 N=24、纯 binary pop（th 阈值过了就整条显），让密集的随机条带感清晰。
//
// 阈值生成：用 pseudoOrder 给每条带分配 [0, 1) 内"等间隔但顺序打乱"的 th。等价于
// "把 N 个时间点随机分配给 N 条带"，保证最后一条在 p=1-1/N 时也已显（不留缝）。
const RANDOM_BARS_COUNT = 24;
function randomBarsPath(b, axis, p) {
    const n = RANDOM_BARS_COUNT;
    const order = pseudoOrder(n);
    let d = "";
    if (axis === "horz") {
        const band = b.h / n;
        for (let i = 0; i < n; i++) {
            // 阈值 = 等分时间点 + 半格偏移，让最后一条在 p ≈ 1 - 1/(2N) 时刚好出现。
            const th = (order[i] + 0.5) / n;
            if (p >= th) {
                d += `M ${b.x} ${b.y + i * band} h ${b.w} v ${band} h ${-b.w} Z `;
            }
        }
        return d.trim();
    }
    const band = b.w / n;
    for (let i = 0; i < n; i++) {
        const th = (order[i] + 0.5) / n;
        if (p >= th) {
            d += `M ${b.x + i * band} ${b.y} v ${b.h} h ${band} v ${-b.h} Z `;
        }
    }
    return d.trim();
}
function pseudoOrder(n) {
    const arr = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
        const j = Math.floor(((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1 * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}
// dissolve / pixelate：按 cell 网格随机阈值 reveal。
function dissolvePath(b, p, n = 16) {
    const cw = b.w / n;
    const ch = b.h / n;
    let d = "";
    for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
            const seed = (r * 73856093) ^ (c * 19349663);
            const th = ((Math.sin(seed) * 43758.5453) % 1 + 1) % 1;
            if (p >= th) {
                d += `M ${b.x + c * cw} ${b.y + r * ch} h ${cw} v ${ch} h ${-cw} Z `;
            }
        }
    }
    return d.trim();
}
function clamp(x, lo, hi) {
    return x < lo ? lo : x > hi ? hi : x;
}
// entrance 路径：把 (filter, prLst, p) 解析成"已被 sweep 覆盖且代表可见"的几何。
// p∈[0,1]，p=0 → empty，p=1 → fullRect。所有 sweep 类 filter 必须在 p=0 时
// 严格为 emptyPath（不带 fullRect 包裹），exit 的 complement 公式才能正确兜底。
function entranceVisibleD(filter, prLst, p, b) {
    if (p >= 1)
        return fullRect(b);
    if (p <= 0)
        return emptyPath();
    const dir = parseDir(prLst);
    switch (filter) {
        case "wipe":
        case "slide": {
            const side = dir.side === "center" ? "left" : dir.side;
            return wipePath(b, p, side);
        }
        case "blinds":
            return blindsPath(b, dir.axis === "vert" ? "vert" : "horz", p);
        case "strips": {
            const s = (prLst ?? "").toLowerCase();
            const corner = s.includes("downright") ? "downRight"
                : s.includes("downleft") ? "downLeft"
                    : s.includes("upright") ? "upRight"
                        : s.includes("upleft") ? "upLeft"
                            : "downRight";
            return stripsPath(b, p, corner);
        }
        case "checkerboard": {
            // §19.5.8 checkerboard(across|down)：
            //   across → 主方向 horz（列扫过）
            //   down   → 主方向 vert（行扫过）
            const s = (prLst ?? "").toLowerCase();
            const primary = s.includes("down") ? "vert" : "horz";
            return checkerboardPath(b, primary, p);
        }
        case "circle":
            return circlePath(b, p, dir.inOut === "out" ? "out" : "in");
        case "diamond":
            return diamondPath(b, p, dir.inOut === "out" ? "out" : "in");
        case "box":
            return boxPath(b, p, dir.inOut === "out" ? "out" : "in");
        case "plus":
            return plusPath(b, p, dir.inOut === "out" ? "out" : "in");
        case "wedge":
            return wedgePath(b, p);
        case "wheel": {
            const spokeMatch = /(\d+)/.exec(prLst ?? "");
            const sp = spokeMatch ? Math.max(1, Number(spokeMatch[1])) : 1;
            return wheelPath(b, p, sp);
        }
        case "barn":
            return barnPath(b, dir.axis === "vert" ? "vert" : "horz", p, dir.inOut === "out" ? "out" : "in");
        case "randombar":
        case "randomBar":
            return randomBarsPath(b, dir.axis === "vert" ? "vert" : "horz", p);
        case "dissolve":
        case "pixelate":
            return dissolvePath(b, p);
        case "stretch":
            return wipePath(b, p, dir.side === "center" ? "left" : dir.side);
        default:
            return fullRect(b);
    }
}
export function effectClipPathD(geom) {
    const { filter, bbox: b, transition } = geom;
    const p = clamp01(geom.progress);
    // §19.5.21 fill="hold"：runtime 已对 exit 反向（val = 1 - u），所以这里 progress
    // 对 entrance / exit 都是"剩余可见进度"语义：
    // - entrance: p=0 → 还没开始显现；p=1 → 已经完全显现
    // - exit:     p=0 → 已经完全隐藏；p=1 → 还没开始隐藏
    if (p >= 1)
        return fullRect(b);
    if (p <= 0)
        return emptyPath();
    // fade / image 不是 sweep 几何——可见区永远 = fullRect，opacity 通道（见
    // svg-backend.fadeOpacityFromClip）负责淡入淡出。
    if (filter === "fade" || filter === "image")
        return fullRect(b);
    if (transition === "out") {
        // §19.5.8 exit：visible = full ∖ entrance_pattern(1-val)。把 entrance 几何
        // 当作"已被遮盖"的形状，外面再包 fullRect 走 even-odd 做减法。
        // 公式对所有 sweep filter（box/circle/diamond/plus/barn/wipe/blinds/wedge/
        // wheel/checkerboard/randombar/strips/dissolve）统一成立。
        //
        // 特例：entrance 本身已经是 "fullRect + inner" 的环形结构（box(in) 等），
        // complement 后路径里出现两次 fullRect，在 even-odd 下相互抵消，最终留下
        // inner 形状——正好就是 exit 想要的"中心几何"。
        const tVal = clamp01(1 - p);
        const inner = entranceVisibleD(filter, geom.prLst, tVal, b);
        if (!inner)
            return fullRect(b);
        if (inner === fullRect(b))
            return emptyPath();
        return `${fullRect(b)} ${inner}`;
    }
    return entranceVisibleD(filter, geom.prLst, p, b);
}
// 判断 filter 渲染是否使用 even-odd 填充规则。
// - exit (transition="out") 的路径始终是 "fullRect + entrance_pattern" 的 complement
//   形式，必须 even-odd 才能解释成"环差/反相"。
// - entrance: 只对天然输出 "fullRect + 中心几何" 的 inward filter
//   （circle/diamond/box/barn/plus 的 (in) 子类型）需要 even-odd；其他 filter
//   都是单条或多条不交叠的 closed path，nonzero 即可。
export function effectClipUsesEvenOdd(geom) {
    if (geom.transition === "out") {
        // fade/image 没有 clip 几何（永远 fullRect），不需要 even-odd。
        if (geom.filter === "fade" || geom.filter === "image")
            return false;
        return true;
    }
    const dir = parseDir(geom.prLst);
    if (dir.inOut !== "in")
        return false;
    switch (geom.filter) {
        case "circle":
        case "diamond":
        case "box":
        case "barn":
        case "plus":
            return true;
        default:
            return false;
    }
}
