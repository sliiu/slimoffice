"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SvgBackend = void 0;
const font_stack_1 = require("./font-stack");
const core_1 = require("@sliiu/present-core");
const scene_node_1 = require("./scene-node");
const paint_svg_1 = require("./paint-svg");
const cell_borders_1 = require("./cell-borders");
const linked_src_1 = require("./linked-src");
const paint_canvas_1 = require("./paint-canvas");
const metafile_preview_1 = require("./metafile-preview");
const chart_svg_1 = require("./chart-svg");
const ole_render_1 = require("./ole-render");
const model3d_render_1 = require("./model3d-render");
const video_frame_1 = require("./video-frame");
const effect_clip_1 = require("./effect-clip");
const text_layout_1 = require("./text-layout");
const text_stacked_1 = require("./text-stacked");
const shape_effects_1 = require("./shape-effects");
const text_autofit_1 = require("./text-autofit");
const text_wordart_1 = require("./text-wordart");
const text_warp_1 = require("./text-warp");
const three_bake_1 = require("@sliiu/present-three-bake");
const text_shared_1 = require("./text-shared");
const SVG_NS = "http://www.w3.org/2000/svg";
// 每个 SvgBackend 实例一个唯一序号，用来给 <defs> 里的 clipPath id 加前缀。
// 编辑器里同一篇 PPT 会被多个 backend 同时渲染（主画布 + 各缩略图 + 放映 player），
// 它们对同一个 shape 生成相同的 clip id（如 imgclip-sp_36），导致全局 id 冲突：
// url(#imgclip-sp_36) 只会解析到文档里第一个同 id 元素，进入放映时主画布若被隐藏/
// 销毁，放映 player 的 <image> 就指向了失效的 clipPath → 裁剪失效 → 放大的精灵图
// 整张露出（米粒放大叠在一起）。加实例前缀后每个 backend 只引用自己的 clipPath。
let svgBackendSeq = 0;
// ECMA-376 §21.1.2.1.1 bodyPr — `vert` 用来指明文本框的整体走向。
// 实现策略（OOXML 规定的视觉等价物）：
//   - "horz"          → 水平正向
//   - "vert"          → 文本框内容旋转 90° 顺时针；行从右往左堆叠（视觉上每行像横向文字侧躺）
//   - "vert270"       → 旋转 270° 顺时针（即 90° 逆时针）；行从左往右堆叠
//   - "wordArtVert"   → 字符竖直堆叠（不旋转字符）；列从左往右（WPS「行顺序从左到右」）
//   - "wordArtVertRtl"→ 同 wordArtVert，列从右往左（WPS「行顺序从右到左」）
//   - "eaVert"        → 同 wordArtVertRtl，但拉丁脚本字符顺时针 90° 旋转（CJK 直立）
//   - "mongolianVert" → 同 wordArtVert，列从左往右
// 我们把前两种用 group transform 来旋转整个段落树（W/H 互换），
// 后三种用"逐字符竖排"布局（每字一行，按字号推进 y），以更贴近 PowerPoint/WPS 的真实排版。
// vertRotateDeg / isVerticalStack / DEFAULT_TEXT_INSETS 都来自 ./text-shared，
// 与 canvas-backend 和编辑器的行内文本编辑器共用同一套判定。
// ECMA-376 §20.1.5.5 scene3d/<a:camera> — 把相机转成 CSS 3D。需要挤出、倒角或
// 明显相机角的文字改走 three-bake，这里不再调用，避免和贴图各转一次。
//
// 角度映射约定（与 packages/three-bake/src/camera.ts:setupCamera 中的相机摆放等价）：
//   - PowerPoint lat 取负值 = 相机抬高从上往下俯视 ⇒ CSS 上把对象的"顶边"往后倾，
//     等价于 `rotateX(-lat°)` (lat=-20 → rotateX(20°))。
//   - PowerPoint lon 取正值 = 相机绕 Y 轴右移、看向对象左侧 ⇒ 对象的"右边"远离视点，
//     CSS 中 `rotateY` 的右手系约定下需要 `rotateY(lon°)` 取**正号**（实测对得上）。
//   - rev 是相机自身绕镜头轴的滚转（rev>0 顺时针）⇒ CSS 上旋转对象自身 = `rotateZ(rev°)`。
// fov→perspective 距离：CSS `perspective(P)` 是观察者到投影面的距离（px）。
function cssTransformFromBody3D(info, bbox) {
    const cam = info?.scene3d?.camera;
    if (!cam)
        return "";
    const r = (0, three_bake_1.resolveCamera)(cam);
    const near0 = (v) => Math.abs(v) < 0.5;
    if (near0(r.lat) && near0(r.lon) && near0(r.rev))
        return "";
    const maxDim = Math.max(bbox.w, bbox.h, 1);
    const fov = Math.max(5, r.fov || 50);
    const persp = r.isOrtho ? 0 : (maxDim / 2) / Math.tan((fov * Math.PI) / 360);
    const parts = [];
    if (persp > 0)
        parts.push(`perspective(${Math.round(persp)}px)`);
    parts.push(`rotateX(${(-r.lat).toFixed(2)}deg)`);
    parts.push(`rotateY(${r.lon.toFixed(2)}deg)`);
    if (!near0(r.rev))
        parts.push(`rotateZ(${r.rev.toFixed(2)}deg)`);
    if (r.zoom && Math.abs(r.zoom - 1) > 0.01)
        parts.push(`scale(${r.zoom})`);
    return parts.join(" ");
}
// 与 text-layout.ts 共享的"东亚 / CJK"判定（renderer 内部别名导出，供 stacked vert 等使用）。
const isEastAsianChar = text_layout_1.isEastAsianChar;
// PowerPoint 的 animEffect filter="fade" 是 opacity-based 过渡，而不是几何 mask。
// runtime.applyTrack 已经把 transition 的方向编码进 progress：
//   transition="in"  → progress = u（0→1）
//   transition="out" → progress = 1 - u（1→0）
// 所以这里 fadeMul 直接取 progress 即可（不再二次反转）：
//   in 时  opacity *= progress（0→1）→ fade-in
//   out 时 opacity *= progress（1→0）→ fade-out
//   none/缺失 → 保持 1
// 注意 effect-clip 路径里 fade 在 progress=1 时已返回 fullRect（不挡 shape），
// 所以这里只负责 opacity 部分；其他 filter（wipe/blinds/diamond 等）仍走 clip 几何。
function fadeOpacityFromClip(clip) {
    if (!clip || clip.kind !== "effect" || clip.filter !== "fade")
        return 1;
    if (clip.transition === "none")
        return 1;
    return Math.max(0, Math.min(1, clip.progress ?? 0));
}
function findCharOverride(overrides, charIdx) {
    for (const ov of overrides.values()) {
        if (charIdx >= ov.start && charIdx < ov.end)
            return ov;
    }
    return undefined;
}
function hasRangeTransform(ov) {
    return ((ov.scaleX !== undefined && ov.scaleX !== 1) ||
        (ov.scaleY !== undefined && ov.scaleY !== 1) ||
        (ov.scale !== undefined && ov.scale !== 1) ||
        (ov.rotation !== undefined && ov.rotation !== 0));
}
/** 视频画面按 srcRect 放大后放进 foreignObject，窗口外的部分被裁掉。用像素，避免百分比相对宽度。 */
function layoutMediaCrop(el, crop, boxW, boxH) {
    const l = crop?.l ?? 0;
    const t = crop?.t ?? 0;
    const r = crop?.r ?? 0;
    const b = crop?.b ?? 0;
    const cw = Math.max(1e-6, 1 - l - r);
    const ch = Math.max(1e-6, 1 - t - b);
    el.style.position = "absolute";
    el.style.left = `${(-l / cw) * boxW}px`;
    el.style.top = `${(-t / ch) * boxH}px`;
    el.style.width = `${boxW / cw}px`;
    el.style.height = `${boxH / ch}px`;
}
class SvgBackend {
    root;
    defs;
    bindings = new Map();
    scene;
    // 本实例的 clip id 前缀，避免多 backend 同 id 冲突（见文件顶部 svgBackendSeq 注释）。
    uid = `b${svgBackendSeq++}`;
    rafId = 0;
    dispose = [];
    shapeFilter;
    preview;
    measureCtx = null;
    textFxSeq = 0;
    textInnerFilters = new Map();
    getMeasureCtx() {
        if (!this.measureCtx) {
            const c = document.createElement("canvas");
            this.measureCtx = c.getContext("2d");
        }
        return this.measureCtx;
    }
    constructor(scene, container, opts = {}) {
        this.scene = scene;
        this.shapeFilter = opts.shapeFilter ?? (() => true);
        this.preview = opts.preview === true;
        this.root = document.createElementNS(SVG_NS, "svg");
        this.root.setAttribute("viewBox", `0 0 ${scene.width} ${scene.height}`);
        this.root.setAttribute("width", "100%");
        this.root.setAttribute("height", "100%");
        // 默认 display:inline 会在基线下方留出一行空隙。舞台按视口贴齐时，
        // 这几像素会让滚动容器认为内容溢出，适应窗口仍出现滚动条。
        this.root.style.display = "block";
        if (!opts.transparent)
            this.root.style.background = "#fff";
        if (opts.clipToSlide === false) {
            this.root.style.overflow = "visible";
            this.root.setAttribute("overflow", "visible");
        }
        this.defs = document.createElementNS(SVG_NS, "defs");
        this.root.appendChild(this.defs);
        container.appendChild(this.root);
        this.mount(scene.root, this.root);
        this.scheduleRedraw();
        scene.root.walk((n) => {
            const off = n.on(() => this.scheduleRedraw());
            this.dispose.push(off);
        });
    }
    scheduleRedraw() {
        if (this.rafId)
            return;
        this.rafId = requestAnimationFrame(() => {
            this.rafId = 0;
            this.redraw(this.scene.root);
        });
    }
    /**
     * 同步刷新当前 scene 到 DOM，并取消 pending rAF。
     * 主要用于编辑器中切换/重建 backend 时，确保新 backend 的视觉在旧 backend
     * 被销毁前已经写入 DOM，避免出现"先空一帧再绘制"的闪屏。
     */
    flush() {
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
            this.rafId = 0;
        }
        this.redraw(this.scene.root);
    }
    mount(node, parentEl) {
        const g = document.createElementNS(SVG_NS, "g");
        g.setAttribute("data-id", node.id);
        g.setAttribute("data-shape-id", node.id);
        g.setAttribute("data-name", node.shape.name);
        g.setAttribute("data-shape-name", node.shape.name);
        const ph = node.shape.placeholder?.type;
        if (ph)
            g.setAttribute("data-placeholder-type", ph);
        parentEl.appendChild(g);
        const accepted = this.shapeFilter(node.shape);
        const shapeEl = accepted ? this.createShapeEl(node.shape) : undefined;
        if (shapeEl)
            g.appendChild(shapeEl);
        this.bindings.set(node.id, { el: g, shapeEl });
        if (node.shape.kind === "group") {
            for (const c of node.children)
                this.mount(c, g);
        }
    }
    createShapeEl(shape) {
        switch (shape.kind) {
            case "rect":
                return document.createElementNS(SVG_NS, "rect");
            case "ellipse":
                return document.createElementNS(SVG_NS, "ellipse");
            case "path":
                return document.createElementNS(SVG_NS, "path");
            case "line":
                return document.createElementNS(SVG_NS, "line");
            case "polygon":
                return document.createElementNS(SVG_NS, "polygon");
            case "text":
                return document.createElementNS(SVG_NS, "g");
            case "image":
                return document.createElementNS(SVG_NS, "image");
            case "chart":
                return document.createElementNS(SVG_NS, "g");
            case "video":
            case "audio":
            case "ole":
            case "webEmbed":
                return document.createElementNS(SVG_NS, "g");
            case "model3d":
                return document.createElementNS(SVG_NS, "g");
            case "group":
                return undefined;
        }
    }
    redraw(node) {
        const b = this.bindings.get(node.id);
        if (!b)
            return;
        const s = node.shape;
        const visible = (node.visibleOverride ?? s.visible) !== false;
        b.el.style.display = visible ? "" : "none";
        const cx = s.bbox.x + s.bbox.w / 2;
        const cy = s.bbox.y + s.bbox.h / 2;
        // §20.1.7.6 flipH/flipV → shape.transform.scaleX/scaleY ∈ {1,-1}，与动画基线
        // scaleX/scaleY 解耦地乘入最终 transform；animScale / widthScale 等动画乘子
        // 即使归 1 也不会冲掉翻转。
        const flipX = s.transform?.scaleX ?? 1;
        const flipY = s.transform?.scaleY ?? 1;
        const sx = node.scale * node.scaleX * node.widthScale * (flipX < 0 ? -1 : 1);
        const sy = node.scale * node.scaleY * node.heightScale * (flipY < 0 ? -1 : 1);
        const transforms = [];
        transforms.push(`translate(${node.tx},${node.ty})`);
        if (node.rotation !== 0 || sx !== 1 || sy !== 1) {
            transforms.push(`translate(${cx},${cy})`);
            if (node.rotation !== 0)
                transforms.push(`rotate(${node.rotation})`);
            if (sx !== 1 || sy !== 1)
                transforms.push(`scale(${sx},${sy})`);
            transforms.push(`translate(${-cx},${-cy})`);
        }
        // ECMA-376 §20.1.5.5 scene3d — image shape 走 packages/three-bake 的 WebGL bake
        // 把"3D 旋转 + 倒角 + 侧面 + 高光"烘进 PNG（packages/player/src/bake-3d.ts）。
        // 之前这里还保留过一条 CSS 3D transform 的 fallback 路径，但 bake 一旦完成
        // setProperty('src') 立刻把 2D 图换成 3D PNG，会看到"扁平倾斜 → 立体"的跳变；
        // 而且 cropRect 在 bake 完成前还活着，CSS 3D 旋转的是被 clip 出来的小窗口
        // （image 实际尺寸 ≈ src/(1-b)，旋转 pivot 又是 bbox 中心），第一帧的几何
        // 也对不齐 bake 之后的位置。直接交给 SVG transform 走 2D，bake 替换 src 时
        // 不再有"双重 3D"。如果 bake 失败（无 WebGL 环境）就退化成普通 2D image，
        // 至少形状大小 / 位置都正确。
        const ss = b.el.style;
        if (ss.transform)
            ss.transform = "";
        if (ss.transformOrigin)
            ss.transformOrigin = "";
        if (ss.transformBox)
            ss.transformBox = "";
        b.el.setAttribute("transform", transforms.join(" "));
        // §19.5.8 animEffect filter="fade" 在 PowerPoint 中是 opacity-based 过渡（不是几何 mask），
        // progress 直接乘到 opacity 上：in 时 0→1，out 时 1→0；其他 filter 仍走 clip 几何。
        // node.opacity 已包含 set/anim opacity 末态，这里再乘 fade 进度即可。
        const fadeMul = fadeOpacityFromClip(node.clip);
        b.el.setAttribute("opacity", String(node.opacity * fadeMul));
        this.applyShapeEffects(b, node, s);
        if (b.shapeEl && this.paintBaked3D(s, b)) {
            // 非 image 的 3D 已换成 baked PNG。image 仍走 applyShapeAttrs 里的 image 分支。
        }
        else if (b.shapeEl) {
            this.applyShapeAttrs(s, b.shapeEl, node, b);
        }
        this.applyClip(node, b);
        for (const c of node.children)
            this.redraw(c);
    }
    // ECMA-376 §20.1.8.45 effectLst — shape 级效果链：
    //   outerShdw / glow → CSS filter（drop-shadow 链）
    //   innerShdw / softEdge → SVG <filter> 原语（url() 拼进同一条 CSS filter 链）
    //   reflection → <use> 克隆 + 渐变 mask（见 applyReflection）
    // parser 保证"带 txBody 的形状"拆成 [base=几何(带效果), text=文字(无效果)]，
    // 所以这里作用到 node group 等价于只作用到图形体。
    applyShapeEffects(b, node, s) {
        const fx = (0, shape_effects_1.collectShapeEffects)(s);
        const parts = [];
        const css = (0, shape_effects_1.cssFilterForEffects)(fx);
        if (css)
            parts.push(css);
        if (fx.inner || fx.softEdge) {
            const id = `${this.uid}-fx-${node.id}`;
            this.ensureEffectFilter(b, id, fx);
            parts.push(`url(#${id})`);
        }
        else if (b.fxFilter) {
            b.fxFilter.remove();
            b.fxFilter = undefined;
        }
        const filterStr = parts.join(" ");
        if (b.el.style.filter !== filterStr)
            b.el.style.filter = filterStr;
        this.applyReflection(b, node, s, fx);
    }
    ensureEffectFilter(b, id, fx) {
        let f = b.fxFilter;
        if (!f) {
            f = document.createElementNS(SVG_NS, "filter");
            this.defs.appendChild(f);
            b.fxFilter = f;
        }
        // 每帧 redraw 都会到这里：用签名比对做幂等，避免动画期间反复重建 DOM。
        const sig = JSON.stringify([id, fx.inner ?? null, fx.softEdge ?? null]);
        if (f.getAttribute("data-sig") === sig)
            return;
        f.setAttribute("data-sig", sig);
        f.setAttribute("id", id);
        // 放宽 filter 区域，避免默认 10% 边距把 blur 裁掉。
        f.setAttribute("x", "-30%");
        f.setAttribute("y", "-30%");
        f.setAttribute("width", "160%");
        f.setAttribute("height", "160%");
        let inner = "";
        let src = "SourceGraphic";
        if (fx.softEdge) {
            // §20.1.8.53 softEdge — 对 alpha 通道做高斯羽化后 composite in，
            // 线性变换轻度收缩 alpha 让边缘向内羽化（更接近 PowerPoint 的向内收边）。
            const std = Math.max(0.01, fx.softEdge.radius / 2);
            inner +=
                `<feGaussianBlur in="SourceAlpha" stdDeviation="${std}" result="se-blur"/>` +
                    `<feComponentTransfer in="se-blur" result="se-a"><feFuncA type="linear" slope="1.3" intercept="-0.3"/></feComponentTransfer>` +
                    `<feComposite in="${src}" in2="se-a" operator="in" result="se-out"/>`;
            src = "se-out";
        }
        if (fx.inner) {
            // §20.1.8.40 innerShdw — 经典配方：反相 alpha → blur → offset → 上色 →
            // 裁回形状内部 → 叠加在图形体上。
            const std = Math.max(0.01, fx.inner.blur / 2);
            inner +=
                `<feComponentTransfer in="SourceAlpha" result="is-inv"><feFuncA type="table" tableValues="1 0"/></feComponentTransfer>` +
                    `<feGaussianBlur in="is-inv" stdDeviation="${std}" result="is-blur"/>` +
                    `<feOffset in="is-blur" dx="${fx.inner.dx}" dy="${fx.inner.dy}" result="is-off"/>` +
                    `<feFlood flood-color="${fx.inner.color}" flood-opacity="${fx.inner.alpha}" result="is-col"/>` +
                    `<feComposite in="is-col" in2="is-off" operator="in" result="is-shadow"/>` +
                    `<feComposite in="is-shadow" in2="SourceAlpha" operator="in" result="is-clip"/>` +
                    `<feMerge><feMergeNode in="${src}"/><feMergeNode in="is-clip"/></feMerge>`;
        }
        f.innerHTML = inner;
    }
    // §20.1.8.50 reflection — 用 <use> 引用图形体做垂直镜像，套"上实下虚"的渐变
    // mask 模拟倒影渐隐，blur 直接用 CSS。倒影插在 shapeEl 之前（z 序在图形体下）。
    applyReflection(b, node, s, fx) {
        const refl = fx.reflection;
        if (!refl || !b.shapeEl || s.bbox.h <= 0) {
            if (b.reflectUse) {
                b.reflectUse.remove();
                b.reflectUse = undefined;
            }
            if (b.reflectMask) {
                b.reflectMask.remove();
                b.reflectMask = undefined;
            }
            if (b.reflectGrad) {
                b.reflectGrad.remove();
                b.reflectGrad = undefined;
            }
            return;
        }
        if (!b.shapeEl.id)
            b.shapeEl.id = `${this.uid}-shape-${node.id}`;
        const gradId = `${this.uid}-reflgrad-${node.id}`;
        const maskId = `${this.uid}-reflmask-${node.id}`;
        if (!b.reflectGrad) {
            b.reflectGrad = document.createElementNS(SVG_NS, "linearGradient");
            b.reflectGrad.setAttribute("id", gradId);
            this.defs.appendChild(b.reflectGrad);
        }
        if (!b.reflectMask) {
            b.reflectMask = document.createElementNS(SVG_NS, "mask");
            b.reflectMask.setAttribute("id", maskId);
            this.defs.appendChild(b.reflectMask);
        }
        if (!b.reflectUse) {
            b.reflectUse = document.createElementNS(SVG_NS, "use");
            b.el.insertBefore(b.reflectUse, b.shapeEl);
        }
        // 倒影几何：绕 bbox 底边镜像（scale -sy），沿 dir 的垂直分量平移 dist。
        const bottom = s.bbox.y + s.bbox.h;
        const rad = ((refl.dir ?? 90) * Math.PI) / 180;
        const dy = Math.sin(rad) * (refl.dist ?? 0);
        const dx = Math.cos(rad) * (refl.dist ?? 0);
        const sy = refl.sy !== undefined ? Math.abs(refl.sy) : 1;
        const reflTop = bottom + dy;
        const reflH = s.bbox.h * sy;
        const sig = JSON.stringify([refl, s.bbox, b.shapeEl.id]);
        if (b.reflectUse.getAttribute("data-sig") === sig)
            return;
        b.reflectUse.setAttribute("data-sig", sig);
        b.reflectUse.setAttribute("href", `#${b.shapeEl.id}`);
        b.reflectUse.setAttribute("transform", `translate(${dx}, ${bottom * (1 + sy) + dy}) scale(1, ${-sy})`);
        b.reflectUse.setAttribute("mask", `url(#${maskId})`);
        b.reflectUse.style.filter = refl.blur > 0 ? `blur(${refl.blur}px)` : "";
        // 渐变：靠近本体一端 startAlpha，向远端 endAlpha（stPos/endPos 是沿渐隐方向的分数）。
        b.reflectGrad.setAttribute("gradientUnits", "userSpaceOnUse");
        b.reflectGrad.setAttribute("x1", "0");
        b.reflectGrad.setAttribute("x2", "0");
        b.reflectGrad.setAttribute("y1", String(reflTop));
        b.reflectGrad.setAttribute("y2", String(reflTop + reflH));
        b.reflectGrad.innerHTML =
            `<stop offset="${refl.startPos}" stop-color="#fff" stop-opacity="${refl.startAlpha}"/>` +
                `<stop offset="${refl.endPos}" stop-color="#fff" stop-opacity="${refl.endAlpha}"/>`;
        b.reflectMask.setAttribute("maskUnits", "userSpaceOnUse");
        b.reflectMask.setAttribute("x", String(s.bbox.x - 50));
        b.reflectMask.setAttribute("y", String(reflTop - 50));
        b.reflectMask.setAttribute("width", String(s.bbox.w + 100));
        b.reflectMask.setAttribute("height", String(reflH + 100));
        // mask 内容 rect：注意 mask 坐标是 userSpaceOnUse，但 <use> 自带 transform（镜像），
        // mask 应用在 <use> 的**变换后**坐标系 → 直接用倒影落点区域。
        b.reflectMask.innerHTML = `<rect x="${s.bbox.x - 50}" y="${reflTop - 50}" width="${s.bbox.w + 100}" height="${reflH + 100}" fill="url(#${gradId})"/>`;
    }
    /** 离屏 3D：用 baked PNG 替换矢量或文字。image 的未烘焙分支仍走 applyShapeAttrs。 */
    paintBaked3D(s, b) {
        if (s.kind === "group")
            return false;
        const info = (0, three_bake_1.shape3DInfo)(s);
        const baked = info?.bakedSrc;
        if (!baked || !b.shapeEl)
            return false;
        const bb = info?.bakedBBox ?? s.bbox;
        let im = b.shapeEl;
        if (im.tagName.toLowerCase() !== "image") {
            const next = document.createElementNS(SVG_NS, "image");
            im.replaceWith(next);
            b.shapeEl = next;
            im = next;
        }
        this.removeImageClip(b);
        im.setAttribute("x", String(bb.x));
        im.setAttribute("y", String(bb.y));
        im.setAttribute("width", String(bb.w));
        im.setAttribute("height", String(bb.h));
        im.setAttribute("href", baked);
        im.setAttributeNS("http://www.w3.org/1999/xlink", "href", baked);
        im.setAttribute("preserveAspectRatio", "none");
        return true;
    }
    applyShapeAttrs(s, el, node, b) {
        if (s.kind !== "group" && s.kind !== "image" && s.kind !== "text") {
            // gradFill path="shape" 的等值线沿形状轮廓走，renderPaint 需要知道轮廓类别
            // 才能选精确渲染路径（矩形 → 框带 pattern；椭圆 → objectBoundingBox 椭圆）。
            const hint = s.kind === "rect" ? "rect" : s.kind === "ellipse" ? "ellipse" : "other";
            const fill = (0, scene_node_1.shapeRenderFill)(s, this.scene, node);
            const fillBBox = (0, scene_node_1.shapeRenderFillBBox)(s, this.scene, node);
            const fillPaint = node.fillOverride
                ? { paint: node.fillOverride }
                : (0, paint_svg_1.renderPaint)(fill, this.defs, fillBBox, () => this.scheduleRedraw(), hint);
            el.setAttribute("fill", fillPaint.paint);
            if ("opacity" in fillPaint && fillPaint.opacity !== undefined) {
                el.setAttribute("fill-opacity", String(fillPaint.opacity));
            }
            if (node.strokeOverride) {
                el.setAttribute("stroke", node.strokeOverride);
                el.setAttribute("stroke-width", String(node.strokeWidthOverride ?? s.stroke?.width ?? 1));
            }
            else {
                (0, paint_svg_1.applyStroke)(el, s.stroke, this.defs, `${this.uid}-`);
                if (node.strokeWidthOverride !== null) {
                    el.setAttribute("stroke-width", String(node.strokeWidthOverride));
                }
            }
        }
        switch (s.kind) {
            case "rect":
                el.setAttribute("x", String(s.bbox.x));
                el.setAttribute("y", String(s.bbox.y));
                el.setAttribute("width", String(s.bbox.w));
                el.setAttribute("height", String(s.bbox.h));
                if (s.rx !== undefined)
                    el.setAttribute("rx", String(s.rx));
                if (s.ry !== undefined)
                    el.setAttribute("ry", String(s.ry));
                break;
            case "ellipse":
                el.setAttribute("cx", String(s.bbox.x + s.bbox.w / 2));
                el.setAttribute("cy", String(s.bbox.y + s.bbox.h / 2));
                el.setAttribute("rx", String(s.bbox.w / 2));
                el.setAttribute("ry", String(s.bbox.h / 2));
                break;
            case "path":
                el.setAttribute("d", s.d);
                if (s.fillRule)
                    el.setAttribute("fill-rule", s.fillRule);
                break;
            case "line":
                el.setAttribute("x1", String(s.x1));
                el.setAttribute("y1", String(s.y1));
                el.setAttribute("x2", String(s.x2));
                el.setAttribute("y2", String(s.y2));
                break;
            case "polygon":
                el.setAttribute("points", s.points.map((p) => `${p[0]},${p[1]}`).join(" "));
                break;
            case "text":
                this.renderText(s, el, node);
                break;
            case "image": {
                const im = el;
                // 离屏光栅副通道：若已烘出 3D PNG（meta3D.bakedSrc），用它 + bakedBBox 显示，
                // 跳过 cropRect（3D / 裁剪都已 burn 进 PNG）。live 视图不会走到这里。
                const baked3d = s.meta3D?.bakedSrc;
                if (baked3d) {
                    const bb = s.meta3D?.bakedBBox ?? s.bbox;
                    this.removeImageClip(b);
                    im.setAttribute("x", String(bb.x));
                    im.setAttribute("y", String(bb.y));
                    im.setAttribute("width", String(bb.w));
                    im.setAttribute("height", String(bb.h));
                    im.setAttribute("href", baked3d);
                    im.setAttributeNS("http://www.w3.org/1999/xlink", "href", baked3d);
                    im.setAttribute("preserveAspectRatio", "none");
                    break;
                }
                const cr = s.cropRect;
                let ix = s.bbox.x;
                let iy = s.bbox.y;
                let iw = s.bbox.w;
                let ih = s.bbox.h;
                if (cr) {
                    const cw = Math.max(1e-6, 1 - cr.l - cr.r);
                    const ch = Math.max(1e-6, 1 - cr.t - cr.b);
                    iw = s.bbox.w / cw;
                    ih = s.bbox.h / ch;
                    ix = s.bbox.x - cr.l * iw;
                    iy = s.bbox.y - cr.t * ih;
                }
                if (cr || s.clipD)
                    this.applyImageClip(node.id, b, s.bbox, s.clipD);
                else
                    this.removeImageClip(b);
                im.setAttribute("x", String(ix));
                im.setAttribute("y", String(iy));
                im.setAttribute("width", String(iw));
                im.setAttribute("height", String(ih));
                const redraw = () => this.scheduleRedraw();
                const probe = (0, paint_canvas_1.getImage)(s.src, redraw);
                const shown = (0, metafile_preview_1.previewImageSrc)(s.src, probe, redraw);
                const href = !shown
                    ? ""
                    : (s.adjust && (0, paint_canvas_1.rasterizedAdjustHref)(shown, s.adjust, redraw)) ||
                        (0, linked_src_1.displayImageSrc)(shown, s.bbox.w, s.bbox.h);
                im.setAttribute("href", href);
                im.setAttributeNS("http://www.w3.org/1999/xlink", "href", href);
                im.setAttribute("preserveAspectRatio", "none");
                this.applyImageStroke(s, b, node);
                break;
            }
            case "chart":
                (0, chart_svg_1.renderChart)(el, s);
                break;
            case "video":
                this.renderMedia(s, el, b, "video", node);
                break;
            case "audio":
                this.renderMedia(s, el, b, "audio", node);
                break;
            case "ole":
                (0, ole_render_1.renderOleSvg)(el, s);
                break;
            case "webEmbed":
                this.renderWebEmbed(s, el, b, node);
                break;
            case "model3d":
                (0, model3d_render_1.renderModel3DSvg)(el, s, () => this.scheduleRedraw());
                break;
            case "group":
                break;
        }
    }
    renderMedia(s, container, b, kind, node) {
        if (this.preview) {
            const poster = kind === "video" ? s.poster : undefined;
            const videoCrop = kind === "video" ? s.cropRect : undefined;
            if (poster) {
                this.renderPreviewPoster(container, s.bbox, poster, videoCrop);
                return;
            }
            if (kind === "video") {
                const frame = (0, video_frame_1.getVideoPosterFrame)(s.src, () => this.scheduleRedraw(), s.trim?.start ?? 0.08);
                if (frame?.src) {
                    this.renderPreviewPoster(container, s.bbox, frame.src, videoCrop);
                    return;
                }
            }
            this.renderMediaPlaceholder(container, s.bbox, kind);
            return;
        }
        let fo = container.firstElementChild;
        if (!fo) {
            fo = document.createElementNS(SVG_NS, "foreignObject");
            container.appendChild(fo);
            const el = document.createElement(kind);
            el.style.position = "absolute";
            el.style.margin = "0";
            // foreignObject 里的控件必须自己接指针。点在进度条 / 播放上不能穿透到
            // stage，否则放映的 pointerdown 会把它当成翻页。
            el.style.pointerEvents = "auto";
            el.preload = "metadata";
            if (kind === "audio") {
                el.style.display = "none";
            }
            else {
                const v = el;
                v.playsInline = true;
                v.controls = s.controls ?? true;
                v.style.objectFit = "fill";
                if (s.poster)
                    v.poster = s.poster;
            }
            el.muted = !!s.muted;
            el.loop = !!s.loop;
            if (s.volume !== undefined)
                el.volume = Math.max(0, Math.min(1, s.volume));
            // 媒体控件交互（点击播放/暂停、拖动进度条等）必须独立于 stage 容器的
            // click/pointerdown 默认推进逻辑。否则用户点视频的 play 按钮会被 player
            // 的 stage.pointerdown 监听器吞掉并触发"前进到下一步/下一页"。
            // 这里统一在 video/audio 上吃掉 pointerdown / mousedown / click / pointerup
            // 的冒泡，让宿主 stage 收不到原始事件；播放器的 hyperlink/动画/前进逻辑
            // 走 stage 路径，对视频区域完全失效（这与 PowerPoint 行为一致）。
            const stopBubble = (ev) => ev.stopPropagation();
            el.addEventListener("pointerdown", stopBubble);
            el.addEventListener("mousedown", stopBubble);
            el.addEventListener("click", stopBubble);
            el.addEventListener("dblclick", stopBubble);
            el.addEventListener("touchstart", stopBubble, { passive: true });
            fo.appendChild(el);
            b.mediaEl = el;
            node.mediaEl = el;
        }
        if (b.mediaEl && s.src && b.mediaEl.src !== s.src)
            b.mediaEl.src = s.src;
        if (b.mediaEl) {
            b.mediaEl.muted = !!s.muted;
            b.mediaEl.loop = !!s.loop;
            if (s.volume !== undefined)
                b.mediaEl.volume = Math.max(0, Math.min(1, s.volume));
            if (kind === "video") {
                const poster = s.poster;
                const v = b.mediaEl;
                if (poster) {
                    if (v.poster !== poster)
                        v.poster = poster;
                }
                else if (v.poster) {
                    v.removeAttribute("poster");
                }
            }
            b.mediaTrimDetach?.();
            b.mediaTrimDetach = (0, core_1.attachMediaTrimPlayback)(b.mediaEl, s.trim, s.duration, !!s.loop);
        }
        fo.setAttribute("x", String(s.bbox.x));
        fo.setAttribute("y", String(s.bbox.y));
        fo.setAttribute("width", String(s.bbox.w));
        fo.setAttribute("height", String(s.bbox.h));
        fo.setAttribute("overflow", "hidden");
        fo.setAttribute("pointer-events", "auto");
        fo.style.pointerEvents = "auto";
        if (b.mediaEl) {
            layoutMediaCrop(b.mediaEl, kind === "video" ? s.cropRect : undefined, s.bbox.w, s.bbox.h);
        }
    }
    renderWebEmbed(s, container, b, node) {
        if (this.preview || !(0, core_1.isAllowedWebEmbedSrc)(s.embedUrl)) {
            this.renderMediaPlaceholder(container, s.bbox, "video");
            return;
        }
        let fo = container.firstElementChild;
        if (!fo) {
            fo = document.createElementNS(SVG_NS, "foreignObject");
            container.appendChild(fo);
            const iframe = document.createElement("iframe");
            iframe.style.width = "100%";
            iframe.style.height = "100%";
            iframe.style.border = "none";
            // 放映 / HTML 导出需要点进 iframe（HybridBackend 的 svg 层是 pointer-events:none，
            // 必须在 foreignObject 内显式恢复）。编辑器会在 adaptMediaForEditor 里改回 none，
            // 否则跨域 iframe 会把点击吞进子文档，舞台选不中也拖不动。
            iframe.style.pointerEvents = "auto";
            iframe.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
            iframe.setAttribute("sandbox", "allow-scripts allow-popups allow-popups-to-escape-sandbox allow-presentation allow-forms");
            iframe.setAttribute("allow", "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share");
            if (s.allowFullscreen !== false) {
                iframe.setAttribute("allowfullscreen", "");
            }
            const stopBubble = (ev) => ev.stopPropagation();
            iframe.addEventListener("pointerdown", stopBubble);
            iframe.addEventListener("mousedown", stopBubble);
            iframe.addEventListener("click", stopBubble);
            iframe.addEventListener("dblclick", stopBubble);
            iframe.addEventListener("touchstart", stopBubble, { passive: true });
            fo.appendChild(iframe);
            b.webEmbedEl = iframe;
        }
        const iframe = b.webEmbedEl;
        if (iframe && iframe.src !== s.embedUrl) {
            iframe.src = s.embedUrl;
        }
        fo.setAttribute("x", String(s.bbox.x));
        fo.setAttribute("y", String(s.bbox.y));
        fo.setAttribute("width", String(s.bbox.w));
        fo.setAttribute("height", String(s.bbox.h));
    }
    renderPreviewPoster(container, b, src, crop) {
        while (container.firstChild)
            container.removeChild(container.firstChild);
        const im = document.createElementNS(SVG_NS, "image");
        let ix = b.x;
        let iy = b.y;
        let iw = b.w;
        let ih = b.h;
        if (crop && (crop.l || crop.t || crop.r || crop.b)) {
            const cw = Math.max(1e-6, 1 - crop.l - crop.r);
            const ch = Math.max(1e-6, 1 - crop.t - crop.b);
            iw = b.w / cw;
            ih = b.h / ch;
            ix = b.x - crop.l * iw;
            iy = b.y - crop.t * ih;
            const rawId = (container.getAttribute("data-id") ?? "m").replace(/[^A-Za-z0-9_-]/g, "");
            const cpId = `${this.uid}-poster-${rawId || "m"}`;
            let cp = this.defs.querySelector(`#${cpId}`);
            if (!cp) {
                cp = document.createElementNS(SVG_NS, "clipPath");
                cp.setAttribute("id", cpId);
                cp.appendChild(document.createElementNS(SVG_NS, "rect"));
                this.defs.appendChild(cp);
            }
            const rect = cp.firstChild;
            rect.setAttribute("x", String(b.x));
            rect.setAttribute("y", String(b.y));
            rect.setAttribute("width", String(b.w));
            rect.setAttribute("height", String(b.h));
            im.setAttribute("clip-path", `url(#${cpId})`);
        }
        im.setAttribute("preserveAspectRatio", "none");
        im.setAttribute("x", String(ix));
        im.setAttribute("y", String(iy));
        im.setAttribute("width", String(iw));
        im.setAttribute("height", String(ih));
        im.setAttribute("href", src);
        im.setAttributeNS("http://www.w3.org/1999/xlink", "href", src);
        im.style.pointerEvents = "none";
        container.appendChild(im);
    }
    /** Static tile used when `preview` is on — no live iframe / video / audio. */
    renderMediaPlaceholder(container, b, kind) {
        while (container.firstChild)
            container.removeChild(container.firstChild);
        const g = document.createElementNS(SVG_NS, "g");
        g.style.pointerEvents = "none";
        const bg = document.createElementNS(SVG_NS, "rect");
        bg.setAttribute("x", String(b.x));
        bg.setAttribute("y", String(b.y));
        bg.setAttribute("width", String(b.w));
        bg.setAttribute("height", String(b.h));
        bg.setAttribute("rx", String(Math.min(b.w, b.h) * 0.12));
        bg.setAttribute("fill", "#f3f4f6");
        bg.setAttribute("stroke", "#9ca3af");
        bg.setAttribute("stroke-dasharray", "4 3");
        bg.setAttribute("stroke-width", "1");
        g.appendChild(bg);
        const cx = b.x + b.w / 2;
        const cy = b.y + b.h / 2;
        const r = Math.min(b.w, b.h) * 0.22;
        if (kind === "audio") {
            const speaker = document.createElementNS(SVG_NS, "path");
            speaker.setAttribute("d", `M ${cx - r} ${cy - r * 0.45}` +
                ` L ${cx - r * 0.25} ${cy - r * 0.45}` +
                ` L ${cx + r * 0.35} ${cy - r}` +
                ` L ${cx + r * 0.35} ${cy + r}` +
                ` L ${cx - r * 0.25} ${cy + r * 0.45}` +
                ` L ${cx - r} ${cy + r * 0.45} Z`);
            speaker.setAttribute("fill", "#9ca3af");
            g.appendChild(speaker);
            for (let i = 1; i <= 2; i++) {
                const arc = document.createElementNS(SVG_NS, "path");
                const rArc = r * (0.5 + i * 0.3);
                const ax = cx + r * 0.5;
                arc.setAttribute("d", `M ${ax} ${cy - rArc * 0.7} A ${rArc} ${rArc} 0 0 1 ${ax} ${cy + rArc * 0.7}`);
                arc.setAttribute("stroke", "#9ca3af");
                arc.setAttribute("stroke-width", String(Math.max(1, r * 0.12)));
                arc.setAttribute("fill", "none");
                arc.setAttribute("stroke-linecap", "round");
                g.appendChild(arc);
            }
        }
        else {
            const disc = document.createElementNS(SVG_NS, "circle");
            disc.setAttribute("cx", String(cx));
            disc.setAttribute("cy", String(cy));
            disc.setAttribute("r", String(r * 1.1));
            disc.setAttribute("fill", "#9ca3af");
            g.appendChild(disc);
            const tri = document.createElementNS(SVG_NS, "polygon");
            const t = r * 0.55;
            tri.setAttribute("points", `${cx - t * 0.35},${cy - t} ${cx + t},${cy} ${cx - t * 0.35},${cy + t}`);
            tri.setAttribute("fill", "#f3f4f6");
            g.appendChild(tri);
        }
        container.appendChild(g);
    }
    renderText(s, container, node) {
        while (container.firstChild)
            container.removeChild(container.firstChild);
        // §20.1.7.6 flipH/flipV：PowerPoint 对 shape / group 的翻转只镜像**几何与子元素
        // 位置**，文字字形本身保持可读（不镜像）。但 backend 把 flip 当 scale(-1) 加在
        // 节点 transform 上，会连同文字一起镜像。这里按"自身 + 所有祖先 group"的累计
        // flip 奇偶性，对文字内容绕文本框自身中心做一次反向翻转抵消镜像——位置仍随
        // 父级镜像（落到正确的对称位置），字形恢复可读。
        const parity = (0, scene_node_1.netFlipParity)(node);
        let host = container;
        if (parity.x < 0 || parity.y < 0) {
            const fcx = s.bbox.x + s.bbox.w / 2;
            const fcy = s.bbox.y + s.bbox.h / 2;
            const counter = document.createElementNS(SVG_NS, "g");
            counter.setAttribute("transform", `translate(${fcx},${fcy}) scale(${parity.x},${parity.y}) translate(${-fcx},${-fcy})`);
            container.appendChild(counter);
            host = counter;
        }
        // ECMA-376 §20.1.2.2 sp/spPr — text frame 同样可以有 fill / stroke（典型场景：
        // 表格 a:tc 单元格、placeholder 背景色、callout 文字框轮廓等）。原本 svg-backend
        // 的通用 applyShapeAttrs 把 text 排除，会导致 textShape 的 fill / stroke 丢失。
        // 这里在文本内容之前先绘制一个矩形背景，复用 paint-svg 的 renderPaint / applyStroke，
        // 与其它形状的填充逻辑保持一致。
        const perSide = (0, cell_borders_1.cellHasPerSideBorders)(s);
        const fill = (0, scene_node_1.shapeRenderFill)(s, this.scene, node);
        const fillBBox = (0, scene_node_1.shapeRenderFillBBox)(s, this.scene, node);
        const hasBg = !!fill || (!!s.stroke && !perSide);
        if (hasBg) {
            const bg = document.createElementNS(SVG_NS, "rect");
            bg.setAttribute("x", String(s.bbox.x));
            bg.setAttribute("y", String(s.bbox.y));
            bg.setAttribute("width", String(s.bbox.w));
            bg.setAttribute("height", String(s.bbox.h));
            const fillPaint = node.fillOverride
                ? { paint: node.fillOverride }
                : (0, paint_svg_1.renderPaint)(fill, this.defs, fillBBox, () => this.scheduleRedraw(), "rect");
            bg.setAttribute("fill", fillPaint.paint);
            if ("opacity" in fillPaint && fillPaint.opacity !== undefined) {
                bg.setAttribute("fill-opacity", String(fillPaint.opacity));
            }
            if (perSide) {
                bg.setAttribute("stroke", "none");
            }
            else if (node.strokeOverride) {
                bg.setAttribute("stroke", node.strokeOverride);
                bg.setAttribute("stroke-width", String(node.strokeWidthOverride ?? s.stroke?.width ?? 1));
            }
            else if (s.stroke) {
                (0, paint_svg_1.applyStroke)(bg, s.stroke, this.defs, `${this.uid}-`);
                if (node.strokeWidthOverride !== null && node.strokeWidthOverride !== undefined) {
                    bg.setAttribute("stroke-width", String(node.strokeWidthOverride));
                }
            }
            host.appendChild(bg);
        }
        if (perSide && s.cellMeta?.borders) {
            for (const seg of (0, cell_borders_1.cellBorderSegments)(s.bbox, s.cellMeta.borders)) {
                const ln = document.createElementNS(SVG_NS, "line");
                ln.setAttribute("x1", String(seg.x1));
                ln.setAttribute("y1", String(seg.y1));
                ln.setAttribute("x2", String(seg.x2));
                ln.setAttribute("y2", String(seg.y2));
                (0, paint_svg_1.applyStroke)(ln, seg.stroke, this.defs, `${this.uid}-`);
                host.appendChild(ln);
            }
        }
        // 需要 3D 的文字走 WebGL / 烘焙贴图，这里不再叠一层 CSS 相机，避免和挤出体各转一次。
        const css3d = (0, three_bake_1.needs3DRender)(s.body3D) ? "" : cssTransformFromBody3D(s.body3D, s.bbox);
        if (css3d) {
            const wrap3d = document.createElementNS(SVG_NS, "g");
            const cx3 = s.bbox.x + s.bbox.w / 2;
            const cy3 = s.bbox.y + s.bbox.h / 2;
            wrap3d.style.transformBox = "view-box";
            wrap3d.style.transformOrigin = `${cx3}px ${cy3}px`;
            wrap3d.style.transform = css3d;
            host.appendChild(wrap3d);
            host = wrap3d;
        }
        // ECMA-376 §21.1.2.1.1 bodyPr@rot / @vert — 整个文字框的旋转。
        // - bodyRot：文字框相对于形状的 2D 旋转角度（degree，°）。
        // - vert：除 horz/wordArtVert/eaVert/mongolianVert 外，"vert"/"vert270" 等价于
        //   一次外部旋转。两者叠加后，作用于"段落布局完成后的内容组"——即旋转的中心
        //   仍是文字框（bbox）的几何中心，与 PowerPoint 表现一致。
        const bodyRot = s.bodyRot ?? 0;
        const vertRot = (0, text_shared_1.vertRotateDeg)(s.vert);
        const vertStack = (0, text_shared_1.isVerticalStack)(s.vert);
        // upright（§21.1.2.1.1 @upright）：CJK 习惯下保持文字直立——即把形状自身
        // 的旋转抵消掉，文字旋转仅来自 bodyRot/vert。这里 node.rotation 已经是形状的
        // 最终旋转（包含动画）。我们将 -node.rotation 加到文字框上。
        const uprightCorr = s.upright ? -(node.rotation ?? 0) : 0;
        const totalRot = bodyRot + vertRot + uprightCorr;
        // 内边距（§21.1.2.1.1 lIns/tIns/rIns/bIns），缺省由 OOXML 给出：lr=91440EMU=7.2pt，tb=45720EMU=3.6pt。
        const ins = s.insets ?? text_shared_1.DEFAULT_TEXT_INSETS;
        // 注意：当 vert==="vert"/"vert270" 走 transform 路径时，布局发生在"旋转前坐标系"下，
        // 因此布局区域的宽 = 形状原 height，高 = 形状原 width。eaVert/wordArtVert/mongolianVert
        // 走自定义竖排 layout，宽高保持原样。bodyRot 同理（旋转外置）。
        const swap = vertRot !== 0;
        const baseW = Math.max(0, s.bbox.w - ins.l - ins.r);
        const baseH = Math.max(0, s.bbox.h - ins.t - ins.b);
        const innerW = swap ? baseH : baseW;
        const innerH = swap ? baseW : baseH;
        const innerX = swap ? s.bbox.x + s.bbox.w / 2 - innerW / 2 : s.bbox.x + ins.l;
        const innerY = swap ? s.bbox.y + s.bbox.h / 2 - innerH / 2 : s.bbox.y + ins.t;
        // 当存在 bodyRot/vert/upright 时，把内容渲染进 outerG，再绕形状中心旋转。
        let outerG = host;
        if (totalRot !== 0) {
            const cx = s.bbox.x + s.bbox.w / 2;
            const cy = s.bbox.y + s.bbox.h / 2;
            const wrap = document.createElementNS(SVG_NS, "g");
            wrap.setAttribute("transform", `rotate(${totalRot} ${cx} ${cy})`);
            host.appendChild(wrap);
            outerG = wrap;
        }
        if (vertStack) {
            this.renderTextStacked(s, outerG, node, innerX, innerY, baseW, baseH);
            return;
        }
        if ((0, text_warp_1.warpActive)(s)) {
            this.renderTextWarped(s, outerG, innerX, innerY, innerW, innerH);
            return;
        }
        if (s.fromWordArt) {
            const fitG = document.createElementNS(SVG_NS, "g");
            outerG.appendChild(fitG);
            this.renderTextHorizontal(s, fitG, node, innerX, innerY, innerW, innerH);
            this.applyWordArtFit(fitG, s.bbox);
            return;
        }
        this.renderTextHorizontal(s, outerG, node, innerX, innerY, innerW, innerH);
    }
    /**
     * 艺术字：把已画出的墨迹外接矩形拉到形状框。
     */
    applyWordArtFit(g, box) {
        const texts = [...g.querySelectorAll("text")];
        // 祖先上的 transform 会让 userSpaceOnUse 的图片填充画不出来，所以改字号和
        // textLength，不在组上缩放。
        if (texts.length !== 1) {
            const ink = this.wordArtInkBox(g) ?? this.wordArtFallbackBox(g);
            if (!ink)
                return;
            const fit = (0, text_wordart_1.wordArtFitTransform)(ink, box);
            if (!fit)
                return;
            g.setAttribute("transform", `matrix(${fit.sx} 0 0 ${fit.sy} ${fit.tx} ${fit.ty})`);
            return;
        }
        const text = texts[0];
        const anchorEl = text.querySelector("tspan");
        const runEl = anchorEl?.querySelector("tspan") ?? anchorEl;
        if (!anchorEl || !runEl)
            return;
        const ch = text.textContent ?? "";
        if (!ch)
            return;
        const size = Number(runEl.getAttribute("font-size")) || 16;
        const weight = runEl.getAttribute("font-weight") || "normal";
        const italic = runEl.getAttribute("font-style") === "italic" ? "italic " : "";
        const family = runEl.getAttribute("font-family") || "sans-serif";
        const ctx = this.getMeasureCtx();
        ctx.font = `${italic}${weight} ${size}px ${family}`;
        const m = ctx.measureText(ch);
        const inkH = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
        const inkW = m.actualBoundingBoxLeft + m.actualBoundingBoxRight;
        if (!(inkH > 0.5 && inkW > 0.5 && m.actualBoundingBoxAscent > 0))
            return;
        const scaleY = box.h / inkH;
        if (!Number.isFinite(scaleY) || scaleY > 8 || scaleY < 0.125)
            return;
        if (Math.abs(scaleY - 1) < 0.02 && Math.abs(box.w / m.width - 1) < 0.02)
            return;
        runEl.setAttribute("font-size", String(size * scaleY));
        text.setAttribute("textLength", String(box.w));
        text.setAttribute("lengthAdjust", "spacingAndGlyphs");
        const anchor = anchorEl.getAttribute("text-anchor") || "start";
        const ax = anchor === "middle" ? box.x + box.w / 2 : anchor === "end" ? box.x + box.w : box.x;
        anchorEl.setAttribute("x", String(ax));
        anchorEl.setAttribute("y", String(box.y + m.actualBoundingBoxAscent * scaleY));
    }
    /** 字形墨迹，不含 em 方框上下的空档。getBBox 含整格，拉满后笔画仍缩在框里。 */
    wordArtInkBox(g) {
        const ctx = this.getMeasureCtx();
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        let any = false;
        for (const text of g.querySelectorAll("text")) {
            const anchorEl = text.querySelector("tspan");
            if (!anchorEl)
                continue;
            const anchor = anchorEl.getAttribute("text-anchor") || "start";
            const ax = Number(anchorEl.getAttribute("x"));
            const baseline = Number(anchorEl.getAttribute("y"));
            if (!Number.isFinite(ax) || !Number.isFinite(baseline))
                continue;
            const runEl = anchorEl.querySelector("tspan") ?? anchorEl;
            const ch = text.textContent ?? "";
            if (!ch)
                continue;
            const size = Number(runEl.getAttribute("font-size")) || 16;
            const weight = runEl.getAttribute("font-weight") || "normal";
            const italic = runEl.getAttribute("font-style") === "italic" ? "italic " : "";
            const family = runEl.getAttribute("font-family") || "sans-serif";
            ctx.font = `${italic}${weight} ${size}px ${family}`;
            const m = ctx.measureText(ch);
            if (!(m.actualBoundingBoxAscent > 0))
                continue;
            const left = m.actualBoundingBoxLeft;
            const right = m.actualBoundingBoxRight;
            let origin = ax;
            if (anchor === "middle")
                origin = ax - m.width / 2;
            else if (anchor === "end")
                origin = ax - m.width;
            const x0 = origin - left;
            const x1 = origin + right;
            const y0 = baseline - m.actualBoundingBoxAscent;
            const y1 = baseline + m.actualBoundingBoxDescent;
            if (x0 < minX)
                minX = x0;
            if (y0 < minY)
                minY = y0;
            if (x1 > maxX)
                maxX = x1;
            if (y1 > maxY)
                maxY = y1;
            any = true;
        }
        if (!any || !(maxX > minX) || !(maxY > minY))
            return null;
        return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    }
    wordArtFallbackBox(g) {
        try {
            const bb = g.getBBox();
            if (!(bb.width > 0 && bb.height > 0))
                return null;
            return { x: bb.x, y: bb.y, w: bb.width, h: bb.height };
        }
        catch {
            return null;
        }
    }
    renderTextWarped(s, container, innerX, innerY, innerW, innerH) {
        const meas = typeof document !== "undefined" ? document.createElement("canvas").getContext("2d") : null;
        const prst = s.prstTxWarp?.prst ?? "textArchUp";
        const glyphs = (0, text_warp_1.flattenWarpGlyphs)(s, (run, ch) => {
            const fs = run.fontSize ?? text_shared_1.FALLBACK_FONT_SIZE;
            if (!meas)
                return fs * 0.6;
            const it = run.italic ? "italic " : "";
            meas.font = `${it}${run.fontWeight ?? "normal"} ${fs}px ${(0, font_stack_1.withFontFallback)(run.fontFamily)}`;
            return meas.measureText(ch).width;
        });
        const samples = (0, text_warp_1.sampleWarpPath)(prst, { x: innerX, y: innerY, w: innerW, h: innerH }, s.prstTxWarp?.avLst);
        const placed = (0, text_warp_1.placeGlyphsOnWarp)(glyphs, samples, prst);
        for (const g of placed) {
            if (g.ch === " ")
                continue;
            const t = document.createElementNS(SVG_NS, "text");
            t.setAttribute("x", "0");
            t.setAttribute("y", "0");
            t.setAttribute("text-anchor", "middle");
            t.setAttribute("dominant-baseline", "middle");
            const scale = g.scaleY !== 1 ? ` scale(1 ${g.scaleY})` : "";
            t.setAttribute("transform", `translate(${g.x} ${g.y}) rotate(${g.angle})${scale}`);
            this.applyRunStyle(t, g.run);
            t.textContent = g.ch;
            container.appendChild(t);
        }
    }
    // §21.1.2.1.1 标准的横排 + bodyRot/vert/vert270 旋转布局。
    // vert/vert270 由调用方通过外层 group 旋转处理；这里按"水平排版"对待。
    renderTextHorizontal(s, container, node, innerX, innerY, innerW, innerH) {
        // ECMA-376 §21.1.2.1.1 numCol / spcCol — 多栏布局：把段落均分到 N 栏；
        // rtlCol 控制栏顺序（默认从左到右，rtlCol="1" 从右到左）。
        const numCol = Math.max(1, Math.floor(s.numCol ?? 1));
        const spcCol = Math.max(0, s.spcCol ?? 0);
        const colW = numCol > 1 ? Math.max(0, (innerW - spcCol * (numCol - 1)) / numCol) : innerW;
        // §21.1.2.1.1 normAutofit — 编辑后文字变多导致溢出时运行时重算缩放
        // （多栏场景 autofit 语义复杂且罕见，跳过）。派生 shape 仅用于本帧渲染。
        if (numCol === 1) {
            s = (0, text_autofit_1.autofitTextShape)(s, innerH, (sh) => sh.paragraphs.reduce((acc, p) => {
                const l = this.layoutParagraphHoriz(sh, p, colW);
                return acc + l.before + l.totalH + l.after;
            }, 0));
        }
        // 先按列宽对每个段落做 wrap，再分列。
        const paraLayouts = s.paragraphs.map((p) => this.layoutParagraphHoriz(s, p, colW));
        const colsLayout = numCol > 1
            ? this.distributeParagraphsAcrossColumns(paraLayouts, innerH, numCol)
            : [paraLayouts.map((_, i) => i)];
        const totalCols = colsLayout.length;
        // ECMA-376 §21.1.2.1.1 bodyPr@vertOverflow — overflow|ellipsis|clip。
        // clip / ellipsis 都需要把绘制裁切到 innerW × innerH（坐标系是已经做完
        // bodyRot/vert 旋转后的 inner box）。
        let drawTarget = container;
        const vertOverflow = s.vertOverflow ?? "overflow";
        const horzOverflow = s.horzOverflow ?? "overflow";
        if (vertOverflow !== "overflow" || horzOverflow !== "overflow") {
            const clipId = `${this.uid}-text-clip-${node.id}`;
            const clip = document.createElementNS(SVG_NS, "clipPath");
            clip.setAttribute("id", clipId);
            const r = document.createElementNS(SVG_NS, "rect");
            r.setAttribute("x", String(innerX));
            r.setAttribute("y", String(innerY));
            r.setAttribute("width", String(innerW));
            r.setAttribute("height", String(innerH));
            clip.appendChild(r);
            this.defs.appendChild(clip);
            const wrap = document.createElementNS(SVG_NS, "g");
            wrap.setAttribute("clip-path", `url(#${clipId})`);
            container.appendChild(wrap);
            drawTarget = wrap;
        }
        let bulletNumState = (0, text_shared_1.newBulletNumState)();
        // ECMA-376 §21.1.2.1.1 + PowerPoint 实际表现：
        //   - vAlign="middle" 时，**即使 vertOverflow="overflow"**，PowerPoint 也只允许
        //     bottom 溢出（即 totalH>innerH 时退化为 top-anchor，不让顶部跑到 inner box 上方）。
        //     如果允许上溢，会让"形状内文字"在文字过长时整体往上漂，破坏视觉重心。
        //   - vAlign="bottom" 时，反过来允许 top 溢出（bottom anchor 必须把文字底贴 innerY+innerH，
        //     不够装就向上扩）。
        //   - vertOverflow="clip" / "ellipsis" 始终钳到非负（依赖 clipPath 裁切；让前 N 行可见而非
        //     整体截掉）。
        const clampMiddle = (space) => Math.max(0, space); // 中央对齐：永不上溢
        const clampBottom = (space) => vertOverflow === "overflow" ? space : Math.max(0, space);
        // ECMA-376 §21.1.2.1.1 bodyPr@spcFirstLastPara — 控制**列内**第一段的 spcBef
        // 和最后一段的 spcAft 是否生效。规范默认 false，但 PowerPoint 实际渲染常为
        // true（取决于 shape 类型与版本），样本里也几乎全部依赖该默认值。我们采取
        // 折中：仅当 attribute 显式写为 false 时才抑制首末段的对应间距，未显式声明
        // 时维持 "全应用"（与现有 baseline 行为一致；显式 true 等价于默认）。
        const respectFirstLast = s.spcFirstLastPara !== false;
        for (let cIdx = 0; cIdx < totalCols; cIdx++) {
            const visualCol = s.rtlCol ? totalCols - 1 - cIdx : cIdx;
            const colX = innerX + visualCol * (colW + spcCol);
            const idxs = colsLayout[cIdx];
            const colLayouts = idxs.map((i) => paraLayouts[i]);
            const lastIdx = colLayouts.length - 1;
            const effBefore = (k) => !respectFirstLast && k === 0 ? 0 : colLayouts[k].before;
            const effAfter = (k) => !respectFirstLast && k === lastIdx ? 0 : colLayouts[k].after;
            const totalH = colLayouts.reduce((acc, l, k) => acc + effBefore(k) + l.totalH + effAfter(k), 0);
            let yCursor = innerY;
            if (s.vAlign === "middle")
                yCursor = innerY + clampMiddle((innerH - totalH) / 2);
            else if (s.vAlign === "bottom")
                yCursor = innerY + clampBottom(innerH - totalH);
            const colBottom = innerY + innerH;
            for (let k = 0; k < idxs.length; k++) {
                const i = idxs[k];
                const p = s.paragraphs[i];
                const layout = colLayouts[k];
                // §21.1.2.1.1 vertOverflow=ellipsis：当段落（或某行）超出底部时，
                // 在最后一行尾部追加省略号；clip 仅依赖 clipPath 已经裁切。
                const ellipsis = vertOverflow === "ellipsis";
                this.renderHorizontalParagraph(s, drawTarget, node, p, i, layout, {
                    innerX: colX,
                    innerY,
                    innerW: colW,
                    innerH,
                    yCursor,
                    bulletNumState,
                    colBottom,
                    ellipsis,
                    spaceBefore: effBefore(k),
                    spaceAfter: effAfter(k),
                });
                yCursor += effBefore(k) + layout.totalH + effAfter(k);
            }
        }
    }
    // 段落级 wrap + 行高 + RTL/对齐计算：把一个 TextParagraph 拆成若干 visual line。
    // 返回的对象包含 totalH（所有行的高度之和）、before/after（段前/段后间距），
    // 以及 layout 阶段需要的 marL/indent/rtl/align 等。
    layoutParagraphHoriz(_s, p, maxWidth) {
        const fallbackFs = (0, text_shared_1.paragraphFallbackFontSize)(p);
        const before = p.spaceBeforePx ?? 0;
        const after = p.spaceAfterPx ?? 0;
        const noWrap = _s.wrap === false;
        const rtl = !!p.rtl;
        const align = (0, text_layout_1.mapVisualAlignWithAnchorCtr)(_s, p);
        const marL = (rtl ? p.marginRight : p.marginLeft) ?? 0;
        const indent = p.indent ?? 0;
        const hasBullet = !!p.bullet && p.bullet.kind !== "none";
        // §21.1.2.2.6 pPr@indent — 正值是首行缩进；负值通常用于 hanging indent + bullet。
        // 当存在 bullet 时，正负 indent 都仅影响 bullet 位置，文本主体自始至终从 marL 起；
        // 当不存在 bullet 时，正 indent 仅作用于"首行"，让第一行向 marL+indent 处推。
        const firstLineIndent = hasBullet ? 0 : Math.max(0, indent);
        const textAreaW = Math.max(0, maxWidth - marL);
        const firstLineW = Math.max(0, textAreaW - firstLineIndent);
        const ctx = this.getMeasureCtx();
        const lines = (0, text_layout_1.wrapParagraphIntoLines)(p, textAreaW, fallbackFs, ctx, firstLineW, noWrap, {
            slideIndex: this.scene.slide.index,
        }, _s.compatLnSpc);
        const totalH = lines.reduce((acc, l) => acc + l.height, 0);
        return {
            lines,
            totalH,
            before,
            after,
            rtl,
            align,
            marL,
            indent,
            hasBullet,
            firstLineIndent,
        };
    }
    // 把段落按"wrap 后高度等分"地分到多列：尽量保证每列总高度 ≤ innerH，溢出再开下一列。
    // 总列数最多不超过 numCol；若内容超出，剩余段落集中到最后一列（OOXML 没有强制
    // 约束溢出列的处理；此实现与 PowerPoint 把溢出留在最后一列的视觉一致）。
    distributeParagraphsAcrossColumns(layouts, innerH, numCol) {
        const cols = Array.from({ length: numCol }, () => []);
        const heights = new Array(numCol).fill(0);
        let curCol = 0;
        for (let i = 0; i < layouts.length; i++) {
            const l = layouts[i];
            const h = l.before + l.totalH + l.after;
            if (curCol < numCol - 1 &&
                heights[curCol] > 0 &&
                heights[curCol] + h > innerH) {
                curCol += 1;
            }
            cols[curCol].push(i);
            heights[curCol] += h;
        }
        return cols;
    }
    renderHorizontalParagraph(_s, container, node, p, i, pl, layout) {
        const { innerX, innerW, bulletNumState, colBottom, ellipsis } = layout;
        const { rtl, align, marL, indent, hasBullet, lines } = pl;
        // 段前间距已由调用方按 spcFirstLastPara 取舍（首段时可能为 0），不再走 pl.before。
        const yStart = layout.yCursor + layout.spaceBefore;
        const textLeft = rtl ? innerX : innerX + marL;
        const textRight = rtl ? innerX + innerW - marL : innerX + innerW;
        const textAreaW = Math.max(0, textRight - textLeft);
        const para = node.paraOverrides.get(i);
        const paraG = document.createElementNS(SVG_NS, "g");
        const opacity = para?.opacity ?? 1;
        const tx = para?.tx ?? 0;
        const ty = para?.ty ?? 0;
        const scale = para?.scale ?? 1;
        const sX = (para?.scaleX ?? 1) * scale;
        const sY = (para?.scaleY ?? 1) * scale;
        const rot = para?.rotation ?? 0;
        const visible = para?.visible ?? true;
        if (!visible)
            paraG.style.display = "none";
        const paraFadeMul = fadeOpacityFromClip(para?.clip ?? null);
        paraG.setAttribute("opacity", String(opacity * paraFadeMul));
        // hanging indent 的 bullet 在 textLeft 之外（rtl 时翻到右边），clip 包络也要相应扩张。
        const bulletAbs = hasBullet
            ? rtl
                ? innerX + innerW - marL - indent
                : innerX + marL + indent
            : textLeft;
        const clipLeft = Math.min(textLeft, bulletAbs);
        const clipRight = Math.max(textRight, bulletAbs);
        this.applyParaClip(paraG, para?.clip, node.id, i, {
            x: clipLeft,
            y: yStart,
            w: Math.max(1, clipRight - clipLeft),
            h: pl.totalH,
        });
        if (tx !== 0 || ty !== 0 || sX !== 1 || sY !== 1 || rot !== 0) {
            const parts = [];
            if (tx !== 0 || ty !== 0)
                parts.push(`translate(${tx}px,${ty}px)`);
            if (sX !== 1 || sY !== 1 || rot !== 0) {
                paraG.style.transformBox = "fill-box";
                paraG.style.transformOrigin = "center center";
                if (rot !== 0)
                    parts.push(`rotate(${rot}deg)`);
                if (sX !== 1 || sY !== 1)
                    parts.push(`scale(${sX},${sY})`);
            }
            if (parts.length > 0)
                paraG.style.transform = parts.join(" ");
        }
        const runEffectsFilter = (0, text_shared_1.pickRunEffectsCssFilter)(p.runs);
        if (runEffectsFilter) {
            const prev = paraG.style.filter;
            paraG.style.filter = prev ? `${prev} ${runEffectsFilter}` : runEffectsFilter;
        }
        const charOverrides = node.charOverrides.get(i);
        const anchor = align === "middle" ? "middle" : align === "end" ? "end" : "start";
        let yLine = yStart;
        // 找到"最后一行"——可能是真正的末行，也可能是 ellipsis 模式下"还能放下"的最后一行。
        let lastVisibleLineIdx = lines.length - 1;
        if (ellipsis) {
            let acc = yStart;
            for (let li = 0; li < lines.length; li++) {
                const lh = lines[li].height;
                if (acc + lh > colBottom && li > 0) {
                    lastVisibleLineIdx = li - 1;
                    break;
                }
                acc += lh;
            }
        }
        for (let li = 0; li < lines.length; li++) {
            const line = lines[li];
            const baseline = yLine + line.ascent;
            // 每行的水平起锚点：受 align/rtl/firstLineIndent 影响。
            let lineLeft = textLeft;
            let lineRight = textRight;
            if (li === 0 && pl.firstLineIndent > 0) {
                if (rtl)
                    lineRight = textRight - pl.firstLineIndent;
                else
                    lineLeft = textLeft + pl.firstLineIndent;
            }
            const lineAreaW = Math.max(0, lineRight - lineLeft);
            const hang = line.hang;
            const ax = align === "middle"
                ? lineLeft + lineAreaW / 2 + hang / 2
                : align === "end"
                    ? lineRight + hang
                    : lineLeft;
            // bullet 仅在第一行渲染。
            if (li === 0) {
                const bulletEl = this.renderBullet(p, bulletAbs, baseline, { height: line.height, ascent: line.ascent }, bulletNumState);
                if (bulletEl)
                    paraG.appendChild(bulletEl);
            }
            if (line.segments.length === 0) {
                yLine += line.height;
                continue;
            }
            // ellipsis：仅在"被截断"的那一行末尾追加 …
            const appendEllipsis = ellipsis && li === lastVisibleLineIdx && li < lines.length - 1;
            if (charOverrides && charOverrides.size > 0 && lines.length === 1) {
                // 字符级动画走单行 segmented 路径（与原行为保持一致）。
                this.renderParaSegmented(paraG, p, charOverrides, ax, baseline, anchor, line.height, para);
            }
            else {
                const textEl = document.createElementNS(SVG_NS, "text");
                // ECMA-376 §21.1.2.3 a:t 用 xml:space="preserve" 表示文本中的空白字符
                // （含连续空格、Tab、首/尾空白）必须按字面渲染。SVG <text> 的默认
                // xml:space="default" 会执行 XML 1.0 空白折叠：连续空白合并为一个，并
                // 把首尾空白去掉。这会让 layout 阶段 ctx.measureText 算出的"含空格段宽"
                // 与 SVG 实际渲染宽度不一致——文字被错误地居中/右对齐/截断，并且
                // `"a    b"` 渲染成 `"a b"`。
                // 在 <text> 上声明一次 preserve，所有后代 tspan 都会继承（SVG 1.1 §5.10.1）。
                textEl.setAttributeNS("http://www.w3.org/XML/1998/namespace", "xml:space", "preserve");
                const tspan = document.createElementNS(SVG_NS, "tspan");
                tspan.setAttribute("x", String(ax));
                tspan.setAttribute("text-anchor", anchor);
                tspan.setAttribute("y", String(baseline));
                // §21.1.2.2.6 @rtl — SVG 的 Unicode bidi 算法已经按字符的 bidi class 处理
                // RTL 字符（阿拉伯/希伯来）的字符级翻转。我们只需要在"对齐方向"上把 start↔end
                // 互换（已通过 mapVisualAlign + ax 完成）。**不要**额外写 direction=rtl，否则
                // 在与 text-anchor 组合时会把拉丁文 run 的视觉顺序也翻转。
                for (let si = 0; si < line.segments.length; si++) {
                    const seg = line.segments[si];
                    const run = seg.run;
                    const t = document.createElementNS(SVG_NS, "tspan");
                    this.applyRunStyle(t, run, para);
                    // xml:space="preserve" 会让 SVG 把"行末空白"也计入 text-anchor=middle/end 的宽度，
                    // 导致 center/right 对齐的文本被尾空白挤偏（CSS `text-align` 对非 pre 内容是忽略
                    // 行末空白的，PowerPoint/WPS 的视觉表现与 CSS 一致）。这里仅对**最后一个 segment**
                    // 在 center/end 对齐时去除末尾空白，保留行中间的连续空格（仍然按字面渲染）。
                    // 单字符竖排路径不会走到这（renderStackedColumn 单独走 g.ch），所以那边不需要同步。
                    const isLastSeg = si === line.segments.length - 1;
                    const trimTail = isLastSeg && (anchor === "middle" || anchor === "end");
                    const rawText = trimTail ? seg.text.replace(/[ \t\u3000]+$/, "") : seg.text;
                    if (!seg.text) {
                        t.setAttribute("dx", String(seg.width));
                        t.textContent = "";
                        tspan.appendChild(t);
                        continue;
                    }
                    if (run.baseline) {
                        const fs = (para?.fontSize ?? run.fontSize) ?? text_shared_1.FALLBACK_FONT_SIZE;
                        const shift = run.baseline * fs;
                        t.setAttribute("dy", String(-shift));
                        const reduced = fs * (1 - Math.min(0.5, Math.abs(run.baseline)));
                        t.setAttribute("font-size", String(reduced));
                        t.textContent = rawText + (appendEllipsis && isLastSeg ? "…" : "");
                        tspan.appendChild(t);
                        const reset = document.createElementNS(SVG_NS, "tspan");
                        reset.setAttribute("dy", String(shift));
                        reset.textContent = "\u200B";
                        tspan.appendChild(reset);
                        continue;
                    }
                    t.textContent = rawText + (appendEllipsis && isLastSeg ? "…" : "");
                    tspan.appendChild(t);
                }
                textEl.appendChild(tspan);
                paraG.appendChild(textEl);
            }
            yLine += line.height;
            if (ellipsis && li === lastVisibleLineIdx)
                break;
        }
        container.appendChild(paraG);
        this.attachTextRunEffects(container, paraG, p.runs);
    }
    // wordArtVert / eaVert / mongolianVert — 逐字符竖排堆叠。
    // 段内字符流按列高拆成 1+ 列；列宽 = 该列内最大字号；列从右往左（mongolianVert / rtlCol 反向）。
    // 拆点：半角 / 全角空格、\t、零宽空格；若无可拆点则硬切。
    // - eaVert：CJK 直立；非 CJK 字符顺时针旋转 90°（保持横向阅读体验）。
    // - wordArtVert / mongolianVert：所有字符直立。
    // bullet 仅出现在段的首列。
    renderTextStacked(s, container, node, innerX, innerY, innerW, innerH) {
        const vert = s.vert;
        // wordArtVertRtl：列从右往左。wordArtVert / mongolianVert 默认从左往右。
        const ltrColumns = (0, text_shared_1.stackedColumnsLtr)(vert, s.rtlCol);
        const spcCol = Math.max(0, s.spcCol ?? 0);
        let bulletNumState = (0, text_shared_1.newBulletNumState)();
        const paraColumns = [];
        for (let pi = 0; pi < s.paragraphs.length; pi++) {
            const p = s.paragraphs[pi];
            const para = node.paraOverrides.get(pi);
            const glyphs = (0, text_stacked_1.buildStackedGlyphs)(p, para, vert, { slideIndex: this.scene.slide.index });
            if (glyphs.length === 0) {
                // 空段：保留一根"占位列"用于视觉段间距；列宽 = 段任一 run 的 fontSize。
                const fs = p.runs.find((r) => r.fontSize)?.fontSize ?? text_shared_1.FALLBACK_FONT_SIZE;
                paraColumns.push({ paraIdx: pi, paragraph: p, glyphs: [], width: fs, isFirstColOfPara: true });
                continue;
            }
            // ---- Step 2：按 innerH 把段拆成多列；空白处可拆，空白进下一列时被丢弃。 ----
            const wrapped = (0, text_stacked_1.wrapGlyphsIntoColumns)(glyphs, innerH);
            for (let wi = 0; wi < wrapped.length; wi++) {
                const colGlyphs = wrapped[wi];
                const colW = colGlyphs.reduce((m, g) => Math.max(m, g.fontSize), 0);
                paraColumns.push({
                    paraIdx: pi,
                    paragraph: p,
                    glyphs: colGlyphs,
                    width: colW,
                    isFirstColOfPara: wi === 0,
                });
            }
        }
        // ---- Step 3：按方向放置每一列；R→L 时从右边界开始向左推进。 ----
        let cursorX = ltrColumns ? innerX : innerX + innerW;
        for (const col of paraColumns) {
            if (!ltrColumns)
                cursorX -= col.width;
            this.renderStackedColumn(s, container, node, col.paragraph, col.paraIdx, col.glyphs, col.isFirstColOfPara, vert, { x: cursorX, y: innerY, w: col.width, h: innerH }, bulletNumState);
            if (ltrColumns)
                cursorX += col.width + spcCol;
            else
                cursorX -= spcCol;
        }
    }
    renderStackedColumn(_s, container, node, p, paraIdx, glyphs, showBullet, vert, box, bulletNumState) {
        void vert;
        const para = node.paraOverrides.get(paraIdx);
        const paraG = document.createElementNS(SVG_NS, "g");
        const opacity = para?.opacity ?? 1;
        const fadeMul = fadeOpacityFromClip(para?.clip ?? null);
        paraG.setAttribute("opacity", String(opacity * fadeMul));
        if ((para?.visible ?? true) === false)
            paraG.style.display = "none";
        const totalH = glyphs.reduce((acc, g) => acc + g.stepY, 0);
        // 与 horizontal 路径相同的 clamp 规则（详见 renderTextHorizontal 注释）：
        //   - middle / start：永远钳到非负（"center anchor 退化为 top anchor"，匹配 PowerPoint）；
        //   - end / bottom：仅 vertOverflow="overflow" 时允许负偏移（顶端上溢）；clip/ellipsis 钳到 0。
        const allowVertOverflow = (_s.vertOverflow ?? "overflow") === "overflow";
        const clampMiddle = (space) => Math.max(0, space);
        const clampEnd = (space) => allowVertOverflow ? space : Math.max(0, space);
        // 竖排下主轴 = 垂直方向；p.align 在主轴上控制段内字符的"上/中/下/两端对齐"。
        // 段级 algn 优先于 shape 级 vAlign：因为段对齐是 per-paragraph，而 vAlign 是块级，
        // 在竖排里两者落到同一根轴上时段优先（这与 PowerPoint 表现一致）。
        let yCursor = box.y;
        let extraStep = 0; // justify 时分配给字符间的额外间距
        const space = box.h - totalH;
        const pAlign = p.align;
        if (pAlign === "middle")
            yCursor = box.y + clampMiddle(space / 2);
        else if (pAlign === "end")
            yCursor = box.y + clampEnd(space);
        else if (pAlign === "justify" && glyphs.length > 1 && space > 0) {
            extraStep = space / (glyphs.length - 1);
        }
        else {
            // start / 缺省：回退到 shape vAlign（保持旧行为）
            if (_s.vAlign === "middle")
                yCursor = box.y + clampMiddle(space / 2);
            else if (_s.vAlign === "bottom")
                yCursor = box.y + clampEnd(space);
        }
        const cx = box.x + box.w / 2;
        // bullet 仅在该段的"首列"出现；后续 wrap 出来的列复用同一段的样式但不重复 bullet。
        // 注意：advanceBulletLabel 同时更新 bulletNumState（编号递增 / 重置），所以非首列必须跳过调用。
        const bulletText = showBullet && glyphs.length > 0 ? (0, text_shared_1.advanceBulletLabel)(p, bulletNumState) : null;
        if (bulletText) {
            const t = document.createElementNS(SVG_NS, "text");
            // 与 horizontal 路径保持一致：bullet 文本（编号"1.")/(2."等含点号"）的
            // 显示宽度依赖空白保留，否则居中锚点偏移。
            t.setAttributeNS("http://www.w3.org/XML/1998/namespace", "xml:space", "preserve");
            t.setAttribute("x", String(cx));
            t.setAttribute("y", String(yCursor + glyphs[0].fontSize));
            t.setAttribute("text-anchor", "middle");
            t.setAttribute("font-size", String(glyphs[0].fontSize * (p.bullet && "sizePct" in p.bullet && p.bullet.sizePct ? p.bullet.sizePct : 1)));
            if (p.bullet && "color" in p.bullet && p.bullet.color)
                t.setAttribute("fill", p.bullet.color);
            else if (p.runs[0]?.color)
                t.setAttribute("fill", p.runs[0].color);
            if (p.bullet && "font" in p.bullet && p.bullet.font)
                t.setAttribute("font-family", p.bullet.font);
            else if (p.runs[0]?.fontFamily)
                t.setAttribute("font-family", (0, font_stack_1.withFontFallback)(p.runs[0].fontFamily));
            t.textContent = bulletText;
            paraG.appendChild(t);
            yCursor += glyphs[0].stepY;
        }
        for (let gi = 0; gi < glyphs.length; gi++) {
            const g = glyphs[gi];
            const baseline = yCursor + g.fontSize; // 字符底部对齐"行底"近似
            const t = document.createElementNS(SVG_NS, "text");
            // 竖排单字符渲染：单个字符通常不含空白，但全角空格 \u3000 等
            // CJK 留白要保留。统一加 preserve 与 horizontal 路径一致。
            t.setAttributeNS("http://www.w3.org/XML/1998/namespace", "xml:space", "preserve");
            t.setAttribute("x", String(cx));
            t.setAttribute("y", String(baseline));
            t.setAttribute("text-anchor", "middle");
            // applyRunStyle 内部已经处理 textOutline + paint-order。
            this.applyRunStyle(t, g.run, para);
            t.textContent = g.ch;
            if (!g.upright) {
                // 非 CJK 字符在 eaVert 下顺时针 90°：以字符中心为锚，旋转 +90°。
                // 旋转后字符的"水平基线"变成竖直方向，视觉上字符"侧躺"在列内向下读。
                t.setAttribute("transform", `rotate(90 ${cx} ${baseline - g.fontSize / 2})`);
            }
            paraG.appendChild(t);
            yCursor += g.stepY;
            // justify：在每对相邻字符间分配额外空间（最后一个字符不再加）。
            if (gi < glyphs.length - 1)
                yCursor += extraStep;
        }
        container.appendChild(paraG);
        this.attachTextRunEffects(container, paraG, p.runs);
    }
    /**
     * Run-level innerShdw / reflection. Outer shadow and glow stay on the CSS
     * filter from pickRunEffectsCssFilter. Inner shadow is an SVG filter; reflection
     * is a mirrored <use> under the paragraph.
     */
    attachTextRunEffects(container, paraG, runs) {
        const effects = runs.flatMap((r) => r.effects ?? []);
        const inner = effects.find((e) => e.kind === "inner");
        if (inner) {
            const id = this.ensureTextInnerFilter(inner);
            const url = `url(#${id})`;
            const prev = paraG.style.filter;
            paraG.style.filter = prev ? `${prev} ${url}` : url;
        }
        const refl = effects.find((e) => e.kind === "reflection");
        if (!refl)
            return;
        let box;
        try {
            box = paraG.getBBox();
        }
        catch {
            return;
        }
        if (box.height <= 0)
            return;
        if (!paraG.id)
            paraG.id = `${this.uid}-txfx-${this.textFxSeq++}`;
        const bottom = box.y + box.height;
        const dist = refl.dist ?? 2;
        const use = document.createElementNS(SVG_NS, "use");
        use.setAttribute("href", `#${paraG.id}`);
        use.setAttribute("transform", `translate(0 ${bottom + dist}) scale(1 -1) translate(0 ${-bottom})`);
        use.setAttribute("opacity", String(refl.startAlpha ?? 0.4));
        if (refl.blur > 0)
            use.style.filter = `blur(${refl.blur}px)`;
        container.insertBefore(use, paraG);
    }
    ensureTextInnerFilter(inner) {
        const sig = `${inner.blur}|${inner.dx}|${inner.dy}|${inner.color}|${inner.alpha}`;
        const cached = this.textInnerFilters.get(sig);
        if (cached)
            return cached;
        const id = `${this.uid}-txinner-${this.textInnerFilters.size}`;
        const f = document.createElementNS(SVG_NS, "filter");
        f.setAttribute("id", id);
        f.setAttribute("x", "-20%");
        f.setAttribute("y", "-20%");
        f.setAttribute("width", "140%");
        f.setAttribute("height", "140%");
        const std = Math.max(0.01, inner.blur / 2);
        f.innerHTML =
            `<feComponentTransfer in="SourceAlpha" result="is-inv"><feFuncA type="table" tableValues="1 0"/></feComponentTransfer>` +
                `<feGaussianBlur in="is-inv" stdDeviation="${std}" result="is-blur"/>` +
                `<feOffset in="is-blur" dx="${inner.dx}" dy="${inner.dy}" result="is-off"/>` +
                `<feFlood flood-color="${inner.color}" flood-opacity="${inner.alpha}" result="is-col"/>` +
                `<feComposite in="is-col" in2="is-off" operator="in" result="is-shadow"/>` +
                `<feComposite in="is-shadow" in2="SourceAlpha" operator="in" result="is-clip"/>` +
                `<feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="is-clip"/></feMerge>`;
        this.defs.appendChild(f);
        this.textInnerFilters.set(sig, id);
        return id;
    }
    renderBullet(p, bulletX, baseline, metrics, state) {
        const bullet = p.bullet;
        const lvl = p.level ?? 0;
        if (!bullet || bullet.kind === "none") {
            if (state.lastType === "number") {
                state.lastType = "";
                state.count = 0;
            }
            state.lastLevel = lvl;
            return null;
        }
        if (!hasAnyText(p) && bullet.kind !== "picture")
            return null;
        const firstRun = p.runs[0];
        const runFs = firstRun?.fontSize ?? text_shared_1.FALLBACK_FONT_SIZE;
        const bulletFs = (0, text_shared_1.bulletFontSize)(bullet, runFs);
        if (bullet.kind === "picture") {
            const img = document.createElementNS(SVG_NS, "image");
            img.setAttribute("href", bullet.src);
            img.setAttributeNS("http://www.w3.org/1999/xlink", "href", bullet.src);
            img.setAttribute("x", String(bulletX));
            img.setAttribute("y", String(baseline - bulletFs));
            img.setAttribute("width", String(bulletFs));
            img.setAttribute("height", String(bulletFs));
            img.setAttribute("preserveAspectRatio", "xMidYMid meet");
            if (state.lastType === "number") {
                state.lastType = "";
                state.count = 0;
            }
            state.lastLevel = lvl;
            return img;
        }
        let text = "";
        if (bullet.kind === "char") {
            text = bullet.char;
            if (state.lastType === "number") {
                state.lastType = "";
                state.count = 0;
            }
        }
        else if (bullet.kind === "number") {
            if (state.lastType !== "number" || state.lastLevel !== lvl) {
                state.count = (bullet.startAt ?? 1) - 1;
                state.lastType = "number";
            }
            state.count += 1;
            text = (0, text_shared_1.formatBulletNumber)(state.count, bullet.numType);
        }
        state.lastLevel = lvl;
        const t = document.createElementNS(SVG_NS, "text");
        // bullet 文本含"1.""(2)"等带标点的编号；同样需要 preserve 以避免空白折叠。
        t.setAttributeNS("http://www.w3.org/XML/1998/namespace", "xml:space", "preserve");
        t.setAttribute("x", String(bulletX));
        t.setAttribute("y", String(baseline));
        t.setAttribute("text-anchor", "start");
        if (bullet.font)
            t.setAttribute("font-family", bullet.font);
        else if (firstRun?.fontFamily)
            t.setAttribute("font-family", (0, font_stack_1.withFontFallback)(firstRun.fontFamily));
        t.setAttribute("font-size", String(bulletFs));
        if (bullet.color)
            t.setAttribute("fill", bullet.color);
        else if (firstRun?.color)
            t.setAttribute("fill", firstRun.color);
        t.textContent = text;
        void metrics;
        return t;
    }
    applyRunStyle(el, run, override) {
        const fontFamily = override?.fontFamily ?? run.fontFamily;
        if (fontFamily)
            el.setAttribute("font-family", (0, font_stack_1.withFontFallback)(fontFamily));
        const fontSize = override?.fontSize ?? run.fontSize ?? text_shared_1.FALLBACK_FONT_SIZE;
        el.setAttribute("font-size", String(fontSize));
        // ECMA-376 §21.1.2.3.7 rPr@b — bold。仅在显式声明（true/false）时写入 font-weight，
        // 缺省时不写以让上游/CSS 继承生效。`b="0"` 时写 400 是为了"显式压回 normal"，
        // 防止 placeholder 默认样式被一个空 rPr 误升级到加粗。
        const fontWeight = override?.fontWeight ?? run.fontWeight;
        if (fontWeight !== undefined)
            el.setAttribute("font-weight", String(fontWeight));
        const italic = override?.fontStyle ?? run.italic;
        if (italic)
            el.setAttribute("font-style", "italic");
        else if (italic === false)
            el.setAttribute("font-style", "normal");
        const underlineSrc = override?.underline ?? run.underline;
        const isUnderline = typeof underlineSrc === "string" ? underlineSrc !== "none" : !!underlineSrc;
        const decos = [];
        if (isUnderline)
            decos.push("underline");
        if (run.strikethrough && run.strikethrough !== "none")
            decos.push("line-through");
        if (decos.length > 0) {
            el.setAttribute("text-decoration", decos.join(" "));
            const style = typeof underlineSrc === "string" && underlineSrc !== "single" && underlineSrc !== "true"
                ? underlineSrc
                : undefined;
            if (style)
                el.setAttribute("text-decoration-style", style);
            if (run.underlineColor)
                el.setAttribute("text-decoration-color", run.underlineColor);
        }
        const color = override?.fontColor ?? override?.fillColor ?? run.color;
        const paint = run.fill;
        if (paint && paint.kind !== "none" && paint.kind !== "solid") {
            const fs = override?.fontSize ?? run.fontSize ?? text_shared_1.FALLBACK_FONT_SIZE;
            const painted = (0, paint_svg_1.renderPaint)(paint, this.defs, { x: 0, y: 0, w: fs * 4, h: fs }, () => this.scheduleRedraw());
            if (painted.defNode)
                this.defs.appendChild(painted.defNode);
            el.setAttribute("fill", painted.paint);
            if (painted.opacity != null)
                el.setAttribute("fill-opacity", String(painted.opacity));
        }
        else if (paint?.kind === "solid") {
            el.setAttribute("fill", paint.color);
        }
        else if (color) {
            el.setAttribute("fill", color);
        }
        if (run.letterSpacing)
            el.setAttribute("letter-spacing", String(run.letterSpacing));
        if (run.caps === "small")
            el.setAttribute("font-variant", "small-caps");
        if (run.caps === "all")
            el.style.textTransform = "uppercase";
        // ECMA-376 §21.1.2.3.9 rPr/ln — 文字描边（textOutline）。OOXML 期望
        // 字身先描边再填色（描边在外，不蚕食字形），因此显式声明 paint-order。
        if (run.textOutline) {
            (0, paint_svg_1.applyStroke)(el, run.textOutline, this.defs, `${this.uid}-`);
            el.setAttribute("paint-order", "stroke fill");
        }
    }
    renderParaSegmented(paraG, p, overrides, ax, baseline, anchor, lineHeight, paraOv) {
        const ctx = this.getMeasureCtx();
        const entries = [];
        let absIdx = 0;
        for (const run of p.runs) {
            const fs = run.fontSize ?? text_shared_1.FALLBACK_FONT_SIZE;
            const fw = run.fontWeight;
            const fa = (0, font_stack_1.withFontFallback)(run.fontFamily);
            const it = run.italic ? "italic " : "";
            ctx.font = `${it}${fw ?? "normal"} ${fs}px ${fa}`;
            for (const ch of Array.from(run.text)) {
                const width = ctx.measureText(ch).width + (run.letterSpacing ?? 0);
                const ov = findCharOverride(overrides, absIdx);
                entries.push({ ch, run, width, ov, absIdx });
                absIdx += ch.length;
            }
        }
        const totalWidth = entries.reduce((acc, e) => acc + e.width, 0);
        const startX = anchor === "middle" ? ax - totalWidth / 2 : anchor === "end" ? ax - totalWidth : ax;
        const segments = [];
        let cur = null;
        let cursorX = 0;
        for (const e of entries) {
            if (!cur || cur.ov !== e.ov) {
                cur = { ov: e.ov, entries: [], offsetX: cursorX, width: 0 };
                segments.push(cur);
            }
            cur.entries.push(e);
            cur.width += e.width;
            cursorX += e.width;
        }
        for (const seg of segments) {
            const segX = startX + seg.offsetX;
            const wrap = document.createElementNS(SVG_NS, "g");
            const textEl = document.createElementNS(SVG_NS, "text");
            // char-range 路径下每个字符宽度都已用 measureText 算入 segment 偏移，
            // 渲染时必须保留所有空白才能与 layout 对齐。
            textEl.setAttributeNS("http://www.w3.org/XML/1998/namespace", "xml:space", "preserve");
            textEl.setAttribute("x", String(segX));
            textEl.setAttribute("y", String(baseline));
            textEl.setAttribute("text-anchor", "start");
            let lastRun = null;
            let curTspan = null;
            for (const e of seg.entries) {
                if (e.run !== lastRun || !curTspan) {
                    curTspan = document.createElementNS(SVG_NS, "tspan");
                    this.applyRunStyle(curTspan, e.run, (0, scene_node_1.mergeParaOverrides)(paraOv, seg.ov));
                    textEl.appendChild(curTspan);
                    lastRun = e.run;
                }
                curTspan.appendChild(document.createTextNode(e.ch));
            }
            wrap.appendChild(textEl);
            const ov = seg.ov;
            if (ov) {
                const op = ov.opacity ?? 1;
                if (op !== 1)
                    wrap.setAttribute("opacity", String(op));
                if (ov.visible === false)
                    wrap.setAttribute("visibility", "hidden");
                const tx = ov.tx ?? 0;
                const ty = ov.ty ?? 0;
                const sX = (ov.scaleX ?? 1) * (ov.scale ?? 1);
                const sY = (ov.scaleY ?? 1) * (ov.scale ?? 1);
                const rot = ov.rotation ?? 0;
                if (tx !== 0 || ty !== 0 || sX !== 1 || sY !== 1 || rot !== 0) {
                    const cx = segX + seg.width / 2;
                    const cy = baseline - lineHeight * 0.35;
                    const parts = [];
                    if (tx !== 0 || ty !== 0)
                        parts.push(`translate(${tx},${ty})`);
                    if (sX !== 1 || sY !== 1 || rot !== 0) {
                        parts.push(`translate(${cx},${cy})`);
                        if (rot !== 0)
                            parts.push(`rotate(${rot})`);
                        if (sX !== 1 || sY !== 1)
                            parts.push(`scale(${sX},${sY})`);
                        parts.push(`translate(${-cx},${-cy})`);
                    }
                    wrap.setAttribute("transform", parts.join(" "));
                }
                // §19.5.8 char-range 的 effect:clip 渲染（fade/wipe/diamond 等 entrance filter）。
                // 之前只在 paragraph 级渲染 clip，char-range 级被忽略 → fade 等过渡完全不可见，
                // 字符在动画期间一直显示 → 视觉上"先在最终位置显示再做动画"。
                if (ov.clip && ov.clip.kind === "effect") {
                    this.applyCharClip(wrap, ov.clip, segX, baseline - lineHeight + (lineHeight * 0.15), seg.width, lineHeight);
                }
            }
            paraG.appendChild(wrap);
        }
    }
    renderTextRunsWithOverrides(parent, p, overrides) {
        let absIdx = 0;
        let appliedDx = 0;
        let appliedDy = 0;
        for (const run of p.runs) {
            const chars = Array.from(run.text);
            const runEl = document.createElementNS(SVG_NS, "tspan");
            this.applyRunStyle(runEl, run);
            parent.appendChild(runEl);
            for (const ch of chars) {
                const ov = findCharOverride(overrides, absIdx);
                const targetDx = ov?.tx ?? 0;
                const targetDy = ov?.ty ?? 0;
                const deltaDx = targetDx - appliedDx;
                const deltaDy = targetDy - appliedDy;
                const seg = document.createElementNS(SVG_NS, "tspan");
                seg.textContent = ch;
                if (deltaDx)
                    seg.setAttribute("dx", String(deltaDx));
                if (deltaDy)
                    seg.setAttribute("dy", String(deltaDy));
                if (ov) {
                    const op = ov.opacity ?? 1;
                    if (op !== 1)
                        seg.setAttribute("opacity", String(op));
                    if (ov.visible === false)
                        seg.setAttribute("visibility", "hidden");
                }
                runEl.appendChild(seg);
                appliedDx = targetDx;
                appliedDy = targetDy;
                absIdx += ch.length;
            }
        }
    }
    applyImageClip(nodeId, b, box, d) {
        if (!b.shapeEl)
            return;
        const cpId = `${this.uid}-imgclip-${nodeId}`;
        // 裁剪图（cropRect）在 SVG 里是"整张精灵图放大铺开 + 用这个 clip 矩形只露出
        // bbox 那一小块"。clip 一旦失效，露出的就是放大 N 倍的整图（见 image case 里
        // iw=bbox.w/(1-l-r)）。因此 clipPath 元素和 shapeEl 上的 clip-path 属性都必须
        // 每次重绘幂等地重新挂回：
        //   - clipPath 可能被 removeImageClip 摘过属性、或在 hybrid 多 backend / 重挂
        //     场景里从 defs 脱离；
        //   - shapeEl 可能被重建成新的 <image> 而旧 b.imgClipPath 还在。
        // 旧实现只在"首次创建"时 setAttribute，导致属性一旦被摘就再也补不回来 →
        // 米粒精灵图放大叠在一起。
        // custGeom 用路径代替矩形：clipPath 子节点是并集，不能再叠一个矩形。
        const mode = d ? "path" : "rect";
        if (!b.imgClipPath || !b.imgClipPath.isConnected || b.imgClipPath.dataset.mode !== mode) {
            b.imgClipPath?.remove();
            const cp = document.createElementNS(SVG_NS, "clipPath");
            cp.setAttribute("id", cpId);
            cp.dataset.mode = mode;
            if (d) {
                const p = document.createElementNS(SVG_NS, "path");
                cp.appendChild(p);
                b.imgClipShape = p;
                b.imgClipRect = undefined;
            }
            else {
                const r = document.createElementNS(SVG_NS, "rect");
                cp.appendChild(r);
                b.imgClipRect = r;
                b.imgClipShape = undefined;
            }
            this.defs.appendChild(cp);
            b.imgClipPath = cp;
        }
        if (b.shapeEl.getAttribute("clip-path") !== `url(#${cpId})`) {
            b.shapeEl.setAttribute("clip-path", `url(#${cpId})`);
        }
        if (d && b.imgClipShape) {
            b.imgClipShape.setAttribute("d", d);
            if ((d.match(/[Mm]/g)?.length ?? 0) > 1)
                b.imgClipShape.setAttribute("clip-rule", "evenodd");
            return;
        }
        const r = b.imgClipRect;
        r.setAttribute("x", String(box.x));
        r.setAttribute("y", String(box.y));
        r.setAttribute("width", String(box.w));
        r.setAttribute("height", String(box.h));
    }
    removeImageClip(b) {
        if (b.imgClipPath && b.shapeEl) {
            b.shapeEl.removeAttribute("clip-path");
        }
    }
    applyImageStroke(s, b, node) {
        const stroke = s.stroke;
        if (!stroke) {
            if (b.imgStrokeRect) {
                b.imgStrokeRect.remove();
                b.imgStrokeRect = undefined;
            }
            return;
        }
        if (!b.imgStrokeRect) {
            const r = document.createElementNS(SVG_NS, "rect");
            r.setAttribute("fill", "none");
            b.el.appendChild(r);
            b.imgStrokeRect = r;
        }
        const r = b.imgStrokeRect;
        r.setAttribute("x", String(s.bbox.x));
        r.setAttribute("y", String(s.bbox.y));
        r.setAttribute("width", String(s.bbox.w));
        r.setAttribute("height", String(s.bbox.h));
        if (node.strokeOverride) {
            r.setAttribute("stroke", node.strokeOverride);
            r.setAttribute("stroke-width", String(node.strokeWidthOverride ?? stroke.width));
        }
        else {
            (0, paint_svg_1.applyStroke)(r, stroke, this.defs, `${this.uid}-`);
            if (node.strokeWidthOverride !== null) {
                r.setAttribute("stroke-width", String(node.strokeWidthOverride));
            }
        }
    }
    // char-range 级别的 effect clip：与 paragraph 级 applyParaClip 共用渲染逻辑，
    // 但 bbox 用字符段实际像素范围，id 加 seg 起点保证 char-range 之间互不覆盖。
    applyCharClip(wrap, clip, x, y, w, h) {
        if (clip.kind !== "effect")
            return;
        const id = `${this.uid}-clip-seg-${Math.round(x)}-${Math.round(y)}-${Math.round(w)}-${Math.round(h)}-${clip.filter}-${Math.round((clip.progress ?? 0) * 1000)}`;
        let cp = this.defs.querySelector(`#${CSS.escape(id)}`);
        if (!cp) {
            cp = document.createElementNS(SVG_NS, "clipPath");
            cp.setAttribute("id", id);
            this.defs.appendChild(cp);
        }
        while (cp.firstChild)
            cp.removeChild(cp.firstChild);
        const geom = {
            filter: clip.filter,
            prLst: clip.prLst,
            progress: clip.progress,
            transition: clip.transition,
            bbox: { x, y, w: Math.max(1, w), h: Math.max(1, h) },
        };
        const d = (0, effect_clip_1.effectClipPathD)(geom);
        if (!d)
            return;
        const path = document.createElementNS(SVG_NS, "path");
        path.setAttribute("d", d);
        if ((0, effect_clip_1.effectClipUsesEvenOdd)(geom))
            path.setAttribute("clip-rule", "evenodd");
        cp.appendChild(path);
        wrap.setAttribute("clip-path", `url(#${id})`);
    }
    applyParaClip(paraG, clip, nodeId, paraIdx, bbox) {
        if (!clip || clip.kind !== "effect")
            return;
        // filter="fade" 走 opacity 通道（见 fadeOpacityFromClip），不需要 clip-path；
        // 否则 clip-path 仍会被设上，潜在地切掉 hanging-indent 的 bullet 等内容。
        if (clip.filter === "fade")
            return;
        const id = `${this.uid}-clip-${nodeId}-p${paraIdx}`;
        let cp = this.defs.querySelector(`#${CSS.escape(id)}`);
        if (!cp) {
            cp = document.createElementNS(SVG_NS, "clipPath");
            cp.setAttribute("id", id);
            this.defs.appendChild(cp);
        }
        while (cp.firstChild)
            cp.removeChild(cp.firstChild);
        const geom = {
            filter: clip.filter,
            prLst: clip.prLst,
            progress: clip.progress,
            transition: clip.transition,
            bbox,
        };
        const d = (0, effect_clip_1.effectClipPathD)(geom);
        if (!d)
            return;
        const path = document.createElementNS(SVG_NS, "path");
        path.setAttribute("d", d);
        if ((0, effect_clip_1.effectClipUsesEvenOdd)(geom))
            path.setAttribute("clip-rule", "evenodd");
        cp.appendChild(path);
        paraG.setAttribute("clip-path", `url(#${id})`);
    }
    applyClip(node, b) {
        const clip = node.clip;
        // §19.5.8 animEffect filter="fade" 是 opacity-based 过渡（见 fadeOpacityFromClip），
        // 不需要任何几何 clip。如果走 effect-clip 路径会把整 shape 裁到 bbox，导致
        // 像 line 的 marker（箭头）这种超出 bbox 的几何被切掉。
        const isFade = clip?.kind === "effect" && clip.filter === "fade";
        // §19.5.21 fill="hold"：entrance 完成后 progress 恒为 1，effectClipPathD 退化成
        // fullRect(bbox)——视觉上不裁任何 *内部* 像素，却仍会把超出 bbox 的几何（line 的
        // 箭头 marker、stroke overshoot 等）切掉，导致"播放完箭头消失、编辑器里却在"。
        // 完成态（progress>=1）= 完全可见，直接撤掉几何 clip。
        const isComplete = clip?.kind === "effect" && (clip.progress ?? 0) >= 1;
        if (!clip || isFade || isComplete) {
            if (b.clipPath)
                b.el.removeAttribute("clip-path");
            return;
        }
        if (!b.clipPath) {
            const cp = document.createElementNS(SVG_NS, "clipPath");
            const cpId = `${this.uid}-clip-${node.id}`;
            cp.setAttribute("id", cpId);
            this.defs.appendChild(cp);
            b.clipPath = cp;
        }
        // 始终（重新）挂上 clip-path 引用：completeState/replay 时上面会 removeAttribute，
        // 若 b.clipPath 已存在则不会再进创建分支，必须在这里幂等地补回属性。
        b.el.setAttribute("clip-path", `url(#${this.uid}-clip-${node.id})`);
        const cp = b.clipPath;
        if (clip.kind === "wheel") {
            while (cp.firstChild)
                cp.removeChild(cp.firstChild);
            b.clipRect = undefined;
            const path = document.createElementNS(SVG_NS, "path");
            const d = wheelPathD(node.shape.bbox, clip.spokes, clip.progress);
            path.setAttribute("d", d);
            cp.appendChild(path);
            return;
        }
        if (clip.kind === "effect") {
            while (cp.firstChild)
                cp.removeChild(cp.firstChild);
            b.clipRect = undefined;
            const geom = {
                filter: clip.filter,
                prLst: clip.prLst,
                progress: clip.progress,
                transition: clip.transition,
                bbox: node.shape.bbox,
            };
            const d = (0, effect_clip_1.effectClipPathD)(geom);
            if (d) {
                const path = document.createElementNS(SVG_NS, "path");
                path.setAttribute("d", d);
                if ((0, effect_clip_1.effectClipUsesEvenOdd)(geom))
                    path.setAttribute("clip-rule", "evenodd");
                cp.appendChild(path);
            }
            return;
        }
        if (!b.clipRect) {
            while (cp.firstChild)
                cp.removeChild(cp.firstChild);
            const r = document.createElementNS(SVG_NS, "rect");
            cp.appendChild(r);
            b.clipRect = r;
        }
        const rect = b.clipRect;
        const { x, y, w, h } = rectFor(node.shape.bbox, clip);
        rect.setAttribute("x", String(x));
        rect.setAttribute("y", String(y));
        rect.setAttribute("width", String(w));
        rect.setAttribute("height", String(h));
    }
    destroy() {
        for (const d of this.dispose)
            d();
        this.dispose = [];
        this.root.remove();
        this.bindings.clear();
    }
}
exports.SvgBackend = SvgBackend;
function paragraphMetrics(p) {
    const sizes = p.runs.map((r) => r.fontSize ?? 0).filter((n) => n > 0);
    const fs = sizes.length ? Math.max(...sizes) : text_shared_1.FALLBACK_FONT_SIZE;
    const height = p.lineHeightPx ?? fs * (0, text_shared_1.lineHeightFactor)(p);
    return {
        height,
        ascent: height - fs * 0.25,
        before: p.spaceBeforePx ?? 0,
        after: p.spaceAfterPx ?? 0,
    };
}
function hasAnyText(p) {
    for (const r of p.runs)
        if (r.text && r.text !== "")
            return true;
    return false;
}
function rectFor(b, c) {
    if (c.kind === "wheel" || c.kind === "effect")
        return { x: b.x, y: b.y, w: b.w, h: b.h };
    const p = Math.max(0, Math.min(1, c.progress));
    switch (c.direction) {
        case "left":
            return { x: b.x, y: b.y, w: b.w * p, h: b.h };
        case "right":
            return { x: b.x + b.w * (1 - p), y: b.y, w: b.w * p, h: b.h };
        case "top":
            return { x: b.x, y: b.y, w: b.w, h: b.h * p };
        case "bottom":
            return { x: b.x, y: b.y + b.h * (1 - p), w: b.w, h: b.h * p };
    }
}
function wheelPathD(b, spokes, progress) {
    const p = Math.max(0, Math.min(1, progress));
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const R = Math.hypot(b.w, b.h);
    const n = Math.max(1, Math.floor(spokes));
    const span = (2 * Math.PI) / n;
    const steps = Math.max(2, Math.ceil(24 / n));
    let d = "";
    for (let i = 0; i < n; i++) {
        const a0 = i * span - Math.PI / 2;
        const reveal = span * p;
        d += `M ${cx} ${cy} `;
        for (let s = 0; s <= steps; s++) {
            const a = a0 + reveal * (s / steps);
            d += `L ${cx + R * Math.cos(a)} ${cy + R * Math.sin(a)} `;
        }
        d += "Z ";
    }
    return d.trim();
}
