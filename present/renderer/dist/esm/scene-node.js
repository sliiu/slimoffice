import { mediaTrimBounds } from "@sliiu/present-core";
import { composeSlideForRender } from "./compose.js";
/** iterate 子目标上的属性叠在段落动画之上（同名字段以后者为准）。 */
export function mergeParaOverrides(base, over) {
    if (!base && !over)
        return undefined;
    return { ...(base ?? {}), ...(over ?? {}) };
}
const ANIM_PROPS = new Set([
    "opacity",
    "rotation",
    "scale",
    "scaleX",
    "scaleY",
    "tx",
    "ty",
    "fill",
    "stroke",
    "fillColor",
    "strokeColor",
    "strokeWidth",
    "width",
    "height",
    "clipDirection",
    "wheelReveal",
    "visible",
]);
export class SceneNode {
    id;
    shape;
    parent = null;
    children = [];
    layerId;
    tx = 0;
    ty = 0;
    scale = 1;
    scaleX = 1;
    scaleY = 1;
    rotation = 0;
    /** 动画写入的旋转增量。渲染角 = shape.transform.rotation + animRotation。 */
    animRotation = 0;
    opacity = 1;
    widthScale = 1;
    heightScale = 1;
    clip = null;
    fillOverride = null;
    strokeOverride = null;
    strokeWidthOverride = null;
    visibleOverride = null;
    paraOverrides = new Map();
    charOverrides = new Map();
    mediaEl = null;
    lastMediaAction = null;
    listeners = new Set();
    constructor(shape, layerId) {
        this.id = shape.id;
        this.shape = shape;
        this.layerId = layerId;
        this.opacity = shape.opacity ?? 1;
        this.tx = shape.transform?.tx ?? 0;
        this.ty = shape.transform?.ty ?? 0;
        this.animRotation = 0;
        this.rotation = this.shapeRotation();
        // SceneNode 上的 scaleX/scaleY 是 **动画基线**（默认 1），承载 animScale / preset
        // 的 scaleX/scaleY 通道；§20.1.7.6 ST_TransformGroup 的 flipH/flipV（parser 把它
        // 编码到 shape.transform.scaleX/scaleY = ±1）由 backend 在最终 transform 公式
        // 里单独乘入，避免动画把缩放归 1 时把翻转一起冲掉。
        if (shape.kind === "group") {
            this.children = shape.children
                .filter((c) => !c.cellMeta?.hidden)
                .map((c) => {
                const n = new SceneNode(c, layerId);
                n.parent = this;
                return n;
            });
        }
    }
    shapeRotation() {
        return this.shape.transform?.rotation ?? 0;
    }
    on(fn) {
        this.listeners.add(fn);
        return () => this.listeners.delete(fn);
    }
    fire(key, value) {
        for (const l of this.listeners)
            l(key, value, this);
    }
    /**
     * 触发一次 backend redraw 而**不**改变任何节点 / shape 属性。用于离屏光栅 3D 烘焙
     * 把结果写进 shape.meta3D.bakedSrc 副通道后，让 SvgBackend / CanvasBackend 重画读取
     * 新的 bakedSrc（既不污染 shape.src/bbox，也不影响 live WebGL 视图）。
     */
    markDirty() {
        this.fire("dirty", undefined);
    }
    /**
     * 内部用：跳过外部 setProperty 的开关 / 派发逻辑，直接把 opacity 强制设为 v 并
     * 通知 listener。专门给 ParagraphAnimatable / CharRangeAnimatable 在 reveal
     * 文字时同步解除 ancestor group hide 用，避免在每次字符 reveal 都走完整 setProperty
     * switch（性能 + 也避免触发不必要 fire-key 字符串）。
     */
    forceOpacity(v) {
        if (this.opacity === v)
            return;
        this.opacity = v;
        this.fire("opacity", v);
    }
    setProperty(key, value) {
        switch (key) {
            case "tx":
                this.tx = value;
                break;
            case "ty":
                this.ty = value;
                break;
            case "scale":
                this.scale = value;
                break;
            case "scaleX":
                this.scaleX = value;
                break;
            case "scaleY":
                this.scaleY = value;
                break;
            case "rotation":
                // style.rotation / animRot 写的是动画通道，叠在 xfrm rot 上。
                // Spin 入口 360→0 的末态是 0，形状停在自己的旋转角，而不是被归零。
                this.animRotation = typeof value === "number" ? value : 0;
                this.rotation = this.shapeRotation() + this.animRotation;
                break;
            case "opacity":
                this.opacity = value;
                break;
            case "width":
                this.widthScale = value;
                break;
            case "height":
                this.heightScale = value;
                break;
            case "visible":
                this.visibleOverride = value;
                break;
            case "fill":
            case "fillColor":
                this.fillOverride = value;
                break;
            case "stroke":
            case "strokeColor":
                this.strokeOverride = value;
                break;
            case "strokeWidth":
                this.strokeWidthOverride = value;
                break;
            case "clipDirection": {
                if (typeof value === "string") {
                    const [dir, prog] = value.split(":");
                    this.clip = {
                        kind: "rect",
                        direction: (dir ?? "left"),
                        progress: Number(prog ?? "0"),
                    };
                }
                break;
            }
            case "wheelReveal": {
                if (typeof value === "string") {
                    const [s, p] = value.split(":");
                    this.clip = {
                        kind: "wheel",
                        spokes: Math.max(1, Math.floor(Number(s ?? "1"))),
                        progress: Number(p ?? "0"),
                    };
                }
                break;
            }
            case "mediaAction": {
                if (typeof value !== "string")
                    break;
                if (this.lastMediaAction === value)
                    break;
                this.lastMediaAction = value;
                const el = this.mediaEl;
                if (el) {
                    const trim = this.shape.trim;
                    const fallbackDur = this.shape.duration;
                    const dur = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : fallbackDur;
                    const { start } = mediaTrimBounds(trim, dur);
                    switch (value) {
                        case "play":
                            if (el.currentTime < start) {
                                try {
                                    el.currentTime = start;
                                }
                                catch {
                                    /* ignore */
                                }
                            }
                            el.play().catch(() => { });
                            break;
                        case "pause":
                            el.pause();
                            break;
                        case "stop":
                            el.pause();
                            try {
                                el.currentTime = start;
                            }
                            catch {
                                /* ignore */
                            }
                            break;
                        case "resume":
                            el.play().catch(() => { });
                            break;
                    }
                }
                break;
            }
            default: {
                if (key.startsWith("effect:")) {
                    this.applyEffectClip(key.slice(7), value);
                    break;
                }
                if (ANIM_PROPS.has(key)) {
                    this[key] = value;
                }
                else {
                    this.shape[key] = value;
                }
            }
        }
        this.fire(key, value);
    }
    // §19.5.8 animEffect 子节点的 filter+prLst+progress 落到 EffectClipState。
    // 兼容 string 编码 "<prLst>|<progress>|<transition>" 与裸数字 progress。
    // 特殊：value === null 或 value === "" 表示"撤销该 filter"，把 clip 复位
    // 为 null（元素回到未应用 effect 的 base 状态）——用于 fill="remove" 末态。
    applyEffectClip(filter, value) {
        if (value === null || value === undefined || value === "") {
            this.clip = null;
            return;
        }
        let progress = 0;
        let prLst;
        let transition = "in";
        if (typeof value === "string") {
            const parts = value.split("|");
            prLst = parts[0] ? parts[0] : undefined;
            progress = Number(parts[1] ?? "0");
            transition = parts[2] ?? "in";
        }
        else if (typeof value === "number") {
            progress = value;
        }
        this.clip = {
            kind: "effect",
            filter,
            prLst,
            progress: Number.isFinite(progress) ? progress : 0,
            transition,
        };
    }
    getProperty(key) {
        switch (key) {
            case "tx":
                return this.tx;
            case "ty":
                return this.ty;
            case "scale":
                return this.scale;
            case "scaleX":
                return this.scaleX;
            case "scaleY":
                return this.scaleY;
            case "rotation":
                return this.animRotation;
            case "opacity":
                return this.opacity;
            case "width":
                return this.widthScale;
            case "height":
                return this.heightScale;
            case "fill":
            case "fillColor":
                return this.fillOverride;
            case "stroke":
            case "strokeColor":
                return this.strokeOverride;
            case "strokeWidth":
                return this.strokeWidthOverride ?? this.shape.stroke?.width ?? 0;
            default:
                return this.shape[key];
        }
    }
    walk(fn) {
        fn(this);
        for (const c of this.children)
            c.walk(fn);
    }
    findById(id) {
        if (this.id === id)
            return this;
        for (const c of this.children) {
            const f = c.findById(id);
            if (f)
                return f;
        }
        return null;
    }
    resetAnimState() {
        this.tx = 0;
        this.ty = 0;
        this.scale = 1;
        // 动画基线统一归 1；shape.transform.scaleX/scaleY (flipH/flipV ±1) 由 backend
        // 渲染时再乘入，所以这里不需要恢复翻转。
        this.scaleX = 1;
        this.scaleY = 1;
        this.widthScale = 1;
        this.heightScale = 1;
        this.animRotation = 0;
        this.rotation = this.shapeRotation();
        this.opacity = this.shape.opacity ?? 1;
        this.clip = null;
        this.fillOverride = null;
        this.strokeOverride = null;
        this.strokeWidthOverride = null;
        this.visibleOverride = null;
        this.paraOverrides.clear();
        this.charOverrides.clear();
        this.lastMediaAction = null;
        if (this.mediaEl) {
            this.mediaEl.pause();
            try {
                this.mediaEl.currentTime = 0;
            }
            catch { }
        }
        for (const c of this.children)
            c.resetAnimState();
    }
    setParaProperty(idx, key, value) {
        let s = this.paraOverrides.get(idx);
        if (!s) {
            s = {};
            this.paraOverrides.set(idx, s);
        }
        applyOverrideProp(s, key, value);
        this.fire(`para:${idx}:${key}`, value);
    }
    getParaProperty(idx, key) {
        const s = this.paraOverrides.get(idx);
        if (!s)
            return paraDefault(key);
        return readOverrideProp(s, key);
    }
    setCharRangeProperty(paraIdx, unit, start, end, key, value) {
        let m = this.charOverrides.get(paraIdx);
        if (!m) {
            m = new Map();
            this.charOverrides.set(paraIdx, m);
        }
        const k = `${unit[0]}${start}-${end}`;
        let s = m.get(k);
        if (!s) {
            s = { start, end, unit };
            m.set(k, s);
        }
        applyOverrideProp(s, key, value);
        this.fire(`char:${paraIdx}:${k}:${key}`, value);
    }
    getCharRangeProperty(paraIdx, unit, start, end, key) {
        const m = this.charOverrides.get(paraIdx);
        const k = `${unit[0]}${start}-${end}`;
        const s = m?.get(k);
        if (!s)
            return paraDefault(key);
        return readOverrideProp(s, key);
    }
}
function applyOverrideProp(s, key, value) {
    if (key.startsWith("effect:")) {
        // value === null/""/undefined：撤销 filter clip（fill="remove" 末态）。
        if (value === null || value === undefined || value === "") {
            s.clip = undefined;
            return;
        }
        const filter = key.slice(7);
        let progress = 0;
        let prLst;
        let transition = "in";
        if (typeof value === "string") {
            const parts = value.split("|");
            prLst = parts[0] ? parts[0] : undefined;
            progress = Number(parts[1] ?? "0");
            transition = parts[2] ?? "in";
        }
        else if (typeof value === "number") {
            progress = value;
        }
        s.clip = {
            kind: "effect",
            filter,
            prLst,
            progress: Number.isFinite(progress) ? progress : 0,
            transition,
        };
        return;
    }
    switch (key) {
        case "opacity":
            s.opacity = value;
            break;
        case "tx":
            s.tx = value;
            break;
        case "ty":
            s.ty = value;
            break;
        case "scale":
            s.scale = value;
            break;
        case "scaleX":
            s.scaleX = value;
            break;
        case "scaleY":
            s.scaleY = value;
            break;
        case "rotation":
            s.rotation = value;
            break;
        case "visible":
            s.visible = value;
            break;
        case "fill":
        case "fillColor":
            s.fillColor = value;
            break;
        case "fontColor":
            s.fontColor = value;
            break;
        case "fontSize":
            s.fontSize = value;
            break;
        case "fontWeight":
            s.fontWeight = value;
            break;
        case "fontStyle":
            s.fontStyle = value;
            break;
        case "fontFamily":
            s.fontFamily = value;
            break;
        case "underline":
            s.underline = value;
            break;
    }
}
function readOverrideProp(s, key) {
    switch (key) {
        case "opacity":
            return s.opacity ?? 1;
        case "tx":
            return s.tx ?? 0;
        case "ty":
            return s.ty ?? 0;
        case "scale":
            return s.scale ?? 1;
        case "scaleX":
            return s.scaleX ?? 1;
        case "scaleY":
            return s.scaleY ?? 1;
        case "rotation":
            return s.rotation ?? 0;
        case "visible":
            return s.visible ?? true;
        case "fill":
        case "fillColor":
            return s.fillColor;
        case "fontColor":
            return s.fontColor;
        case "fontSize":
            return s.fontSize;
        case "fontWeight":
            return s.fontWeight;
        case "fontStyle":
            return s.fontStyle;
        case "fontFamily":
            return s.fontFamily;
        case "underline":
            return s.underline;
        default:
            return undefined;
    }
}
function paraDefault(key) {
    switch (key) {
        case "opacity":
            return 1;
        case "tx":
        case "ty":
        case "rotation":
            return 0;
        case "scale":
        case "scaleX":
        case "scaleY":
            return 1;
        case "visible":
            return true;
        default:
            return undefined;
    }
}
// 当 entrance 通过 paragraph/char range 触发文字 reveal 时，
// 必须同步把所属 SceneNode（_text）以及它的 ancestor group（如 sp_12 蓝色按钮块）的
// hide 解除。否则 parser 给 group 设的 opacity=0 会一直压制 paragraph reveal，
// 文字虽然写了 opacity=1 但视觉上仍不可见。
//
// 仅在第一次写入 opacity!=0 时把 ancestor 链上 opacity 强制拉到 1，避免反向覆盖
// 后续可能存在的强调/退出动画。同样适用于 fill/visible 等"显式 reveal" 信号。
function autoRevealAncestors(node, key, value) {
    if (key !== "opacity")
        return;
    if (typeof value !== "number" || value <= 0)
        return;
    let cur = node;
    while (cur) {
        if (cur.opacity < 1)
            cur.forceOpacity(1);
        cur = cur.parent;
    }
}
// §20.1.7.6 flipH/flipV：返回 node 自身 + 所有祖先 group 累计的翻转奇偶性（±1）。
// 文字渲染据此对字形做反向翻转，使其在被翻转的 shape/group 内保持可读（PowerPoint
// 行为：翻转只镜像几何与子元素位置，不镜像文字字形）。
export function netFlipParity(node) {
    let x = 1;
    let y = 1;
    let cur = node;
    while (cur) {
        if ((cur.shape.transform?.scaleX ?? 1) < 0)
            x = -x;
        if ((cur.shape.transform?.scaleY ?? 1) < 0)
            y = -y;
        cur = cur.parent;
    }
    return { x, y };
}
export class ParagraphAnimatable {
    node;
    paraIdx;
    constructor(node, paraIdx) {
        this.node = node;
        this.paraIdx = paraIdx;
    }
    setProperty(key, value) {
        this.node.setParaProperty(this.paraIdx, key, value);
        autoRevealAncestors(this.node, key, value);
    }
    getProperty(key) {
        return this.node.getParaProperty(this.paraIdx, key);
    }
}
export class CharRangeAnimatable {
    node;
    paraIdx;
    unit;
    start;
    end;
    constructor(node, paraIdx, unit, start, end) {
        this.node = node;
        this.paraIdx = paraIdx;
        this.unit = unit;
        this.start = start;
        this.end = end;
    }
    setProperty(key, value) {
        this.node.setCharRangeProperty(this.paraIdx, this.unit, this.start, this.end, key, value);
        autoRevealAncestors(this.node, key, value);
    }
    getProperty(key) {
        return this.node.getCharRangeProperty(this.paraIdx, this.unit, this.start, this.end, key);
    }
}
const RANGE_RX = /^(?:p(\d+):)?([cwp])(\d+)-(\d+)$/;
export function resolveAnimatable(scene, id) {
    const hashIdx = id.indexOf("#");
    if (hashIdx === -1)
        return scene.root.findById(id);
    const baseId = id.slice(0, hashIdx);
    const sel = id.slice(hashIdx + 1);
    const base = scene.root.findById(baseId);
    if (!base)
        return null;
    if (/^p\d+$/.test(sel)) {
        const idx = Number(sel.slice(1));
        if (Number.isFinite(idx))
            return new ParagraphAnimatable(base, idx);
    }
    const m = RANGE_RX.exec(sel);
    if (m) {
        const paraIdx = m[1] !== undefined ? Number(m[1]) : 0;
        const kind = m[2];
        const start = Number(m[3]);
        const end = Number(m[4]);
        if (kind === "c")
            return new CharRangeAnimatable(base, paraIdx, "char", start, end);
        if (kind === "w")
            return new CharRangeAnimatable(base, paraIdx, "word", start, end);
        if (kind === "p")
            return new ParagraphAnimatable(base, start);
    }
    return base;
}
export function createScene(slide, size, options = {}) {
    const layerNodes = new Map();
    const identity = {
        tx: 0,
        ty: 0,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        skewX: 0,
        skewY: 0,
    };
    // composedLayers 阶段 2 起取代 slide.layers.flatMap：把 deck masters[] 中
    // slide.layoutRef 指向的 master/layout 装饰合成为 layers 前缀。
    const composedLayers = composeSlideForRender(slide, options.masters);
    const layerShapes = composedLayers.flatMap((l) => l.shapes);
    // 背景优先级：slide.background > master.background > 不渲染。
    // slide 没有显式背景时（新建 / 从模板创建的初始 slide），回退到 master 主题背景。
    let effectiveBg = slide.background;
    if ((!effectiveBg || effectiveBg.kind === "none") && slide.layoutRef && options.masters) {
        const masterForBg = options.masters.find((m) => m.id === slide.layoutRef.masterId);
        if (masterForBg?.background && masterForBg.background.kind !== "none") {
            effectiveBg = masterForBg.background;
        }
    }
    let background = null;
    if (effectiveBg && effectiveBg.kind !== "none") {
        const bg = effectiveBg;
        const bbox = { x: 0, y: 0, w: size.width, h: size.height };
        const common = {
            id: `__bg_${slide.id}`,
            name: "Background",
            zIndex: -1,
            visible: true,
            locked: true,
            opacity: 1,
            bbox,
            transform: { ...identity },
        };
        // 所有背景（含 image）统一渲染成一个铺满整页的 rect，fill 直接挂 Paint，
        // 由 paintToSvg / paintToCanvas 统一处理 fit / adjust / alpha / tile / srcRect。
        // 旧实现把 image 背景特判成 image shape，只带 src + opacity，丢掉了 fit 和
        // 图片调整，导致"切换填充方式 / 灰度亮度"在背景上全部无效。
        const bgShape = { ...common, kind: "rect", fill: bg };
        background = bgShape;
        layerShapes.unshift(bgShape);
    }
    const rootShape = {
        id: `__slide_${slide.id}`,
        kind: "group",
        name: slide.name,
        zIndex: 0,
        visible: true,
        locked: false,
        opacity: 1,
        bbox: { x: 0, y: 0, w: size.width, h: size.height },
        transform: { ...identity },
        children: layerShapes,
    };
    const root = new SceneNode(rootShape, "__root");
    for (const layer of composedLayers) {
        const nodes = [];
        for (const s of layer.shapes) {
            const n = root.findById(s.id);
            if (n) {
                n.layerId = layer.id;
                nodes.push(n);
            }
        }
        layerNodes.set(layer.id, nodes);
    }
    if (slide.initialParaOverrides) {
        for (const o of slide.initialParaOverrides) {
            const n = root.findById(o.shapeId);
            if (!n)
                continue;
            if (o.opacity !== undefined)
                n.setParaProperty(o.paraIdx, "opacity", o.opacity);
            if (o.visible !== undefined)
                n.setParaProperty(o.paraIdx, "visible", o.visible);
        }
    }
    if (slide.initialCharOverrides) {
        for (const o of slide.initialCharOverrides) {
            const n = root.findById(o.shapeId);
            if (!n)
                continue;
            if (o.opacity !== undefined)
                n.setCharRangeProperty(o.paraIdx, o.unit, o.start, o.end, "opacity", o.opacity);
            if (o.visible !== undefined)
                n.setCharRangeProperty(o.paraIdx, o.unit, o.start, o.end, "visible", o.visible);
        }
    }
    return { width: size.width, height: size.height, background, slide, layerNodes, root };
}
/** `useBgFill`：用幻灯片合成背景填形状，坐标系对齐整页而不是 shape bbox。 */
export function shapeRenderFill(s, scene, node) {
    if (s.useBgFill) {
        const fromBg = scene.background && "fill" in scene.background
            ? scene.background.fill
            : undefined;
        if (fromBg && fromBg.kind !== "none")
            return fromBg;
        const slideBg = scene.slide.background;
        if (slideBg && slideBg.kind !== "none")
            return slideBg;
        return undefined;
    }
    if (s.fill?.kind === "groupFill" && node)
        return inheritedGroupFill(node)?.paint;
    return s.fill;
}
export function shapeRenderFillBBox(s, scene, node) {
    if (s.useBgFill)
        return { x: 0, y: 0, w: scene.width, h: scene.height };
    if (s.fill?.kind === "groupFill" && node) {
        const inherited = inheritedGroupFill(node);
        if (inherited)
            return inherited.bbox;
    }
    return s.bbox;
}
// ECMA-376 §20.1.8.35 grpFill：子形状使用所在组 grpSpPr 的填充。
// 渐变 / 图片按组的外接框铺，子形状只露出自己那一块。
function inheritedGroupFill(node) {
    let p = node.parent;
    while (p) {
        const fill = p.shape.fill;
        if (fill && fill.kind !== "groupFill") {
            if (fill.kind === "none")
                return undefined;
            return { paint: fill, bbox: p.shape.bbox };
        }
        p = p.parent;
    }
    return undefined;
}
