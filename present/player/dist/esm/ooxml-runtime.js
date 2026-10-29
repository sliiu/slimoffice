// 基于 OOXML 模型的播放运行时适配
// 把 Slide.ooxmlTiming 编译为 CompiledTiming，并桥接到 renderer Scene。
import { ooxml } from "@sliiu/present-animation";
import { resolveAnimatable } from "@sliiu/present-renderer";
export function buildOoxmlPlayback(slide, scene, size, callbacks = {}) {
    if (!slide.ooxmlTiming)
        return null;
    const resolve = makeResolver(scene);
    const compileCtx = {
        slideWidth: size.slideWidth,
        slideHeight: size.slideHeight,
        resolve,
        getTextSlices: (spid, kind) => textSlicesFor(scene, spid, kind),
        // §19.5.3 bldLst：把 slide 解析阶段产出的 build 规格透传给 compile。
        builds: slide.builds,
        // §20.1.2 schemeClr / sysClr 的实际配色来自 theme.clrScheme；compile 时把它注入
        // colorCtx，让 resolveAnimColor 可以正确还原 scheme color → hex。
        colorCtx: callbacks.themeColors ? { scheme: callbacks.themeColors } : undefined,
    };
    const compiled = ooxml.compileTiming(slide.ooxmlTiming, compileCtx);
    const runtime = new ooxml.TimingRuntime({
        timing: compiled,
        resolve: (id) => resolveAnimatable(scene, id),
        onMediaCmd: callbacks.onMediaCmd,
        onCmd: callbacks.onCmd,
        onChange: callbacks.onChange,
        onComplete: callbacks.onComplete,
        ticker: callbacks.ticker,
    });
    return {
        runtime,
        compiled,
        mainSteps: compiled.mainSteps,
        shapeSteps: compiled.shapeSteps,
    };
}
// ECMA-376 §19.5.81 spTgt：
//   - subSp@spid    → 引用组内子形状（与父 sp 共享同一时间节点根）
//   - oleChartEl    → OLE 图表传统模型按 type+lvl 定位
//   - graphicEl/chart/dgm → 现代图表/SmartArt 子部件
// 没有对应渲染节点时回退父 sp，确保动画不至于因子目标无法定位而完全丢失。
function makeResolver(scene) {
    return (tgtEl) => {
        const spTgt = tgtEl.spTgt;
        if (!spTgt) {
            // §19.5.73 sndTgt：动画只播声音、没有形状目标。给 compile 一个幻灯片尺寸的
            // 占位 TargetInfo，runtime 用 soundSrc 放音，不依赖 scene 节点。
            if (tgtEl.sndTgt) {
                return { id: "__snd__", bbox: defaultBox(scene) };
            }
            return null;
        }
        const baseId = `sp_${spTgt.spid}`;
        let id = baseId;
        if (spTgt.subSpId) {
            const subId = `sp_${spTgt.subSpId}`;
            if (resolveAnimatable(scene, subId)) {
                const sBbox = readBbox(scene, subId);
                return { id: subId, bbox: sBbox ?? readBbox(scene, baseId) ?? defaultBox(scene) };
            }
        }
        if (spTgt.txEl) {
            const pRg = spTgt.txEl.pRg;
            const charRg = spTgt.txEl.charRg;
            // 文本目标必须解析到拆分后的 _text 子形状，paraOverrides 才会
            // 被 svg-backend.renderText 读取生效。
            const textBaseId = resolveAnimatable(scene, `${baseId}_text`) ? `${baseId}_text` : baseId;
            // §19.5.37 iterate 同时给出 pRg + charRg（按 wd/lt 拆分时）。makeResolver 必须
            // 生成"段落 + 字符范围"的复合 ID，不能只取 pRg ——否则按 word 拆分的入场会被
            // 误解析为整段，与初始 hide 的 charOverrides 错位（导致动画看似"启动了"但
            // 实际段落内每个 word 仍是 hide 状态，元素永远不可见）。
            if (pRg && charRg) {
                id = `${textBaseId}#p${pRg.st}:c${charRg.st}-${charRg.end}`;
            }
            else if (pRg) {
                id = `${textBaseId}#p${pRg.st}`;
            }
            else if (charRg) {
                id = `${textBaseId}#c${charRg.st}-${charRg.end}`;
            }
            else {
                // §19.5.18 cBhvr@override="childStyle"：上层 walk 把 spTgt 加上空 txEl 作为
                // "把样式只施加在 shape 的文字子部分"的信号——这里 fallback 到 _text 子形状
                // 而非整 shape，避免 set style.visibility=hidden 之类的 after-effect 把矩形
                // 背景一并隐藏（PowerPoint "After Animation: Hide" 行为是只让文字消失）。
                id = textBaseId;
            }
        }
        else if (spTgt.graphicEl?.chartEl) {
            const ce = spTgt.graphicEl.chartEl;
            if (ce.seriesIdx !== undefined && ce.categoryIdx !== undefined) {
                id = `${baseId}#chart:s${ce.seriesIdx}:c${ce.categoryIdx}`;
            }
            else if (ce.seriesIdx !== undefined) {
                id = `${baseId}#chart:s${ce.seriesIdx}`;
            }
            else if (ce.categoryIdx !== undefined) {
                id = `${baseId}#chart:c${ce.categoryIdx}`;
            }
        }
        else if (spTgt.graphicEl?.dgmEl?.id) {
            id = `${baseId}#dgm:${spTgt.graphicEl.dgmEl.id}`;
        }
        else if (spTgt.oleChartEl?.type) {
            const lvl = spTgt.oleChartEl.lvl ?? 0;
            id = `${baseId}#olechart:${spTgt.oleChartEl.type}:${lvl}`;
        }
        let node = resolveAnimatable(scene, id);
        if (!node && id !== baseId) {
            // 子目标不存在时回退到父 sp，避免动画整体丢失。
            id = baseId;
            node = resolveAnimatable(scene, id);
        }
        if (!node)
            return null;
        const bbox = readBbox(scene, baseId);
        return {
            id,
            bbox: bbox ?? defaultBox(scene),
        };
    };
}
function defaultBox(scene) {
    return { x: 0, y: 0, w: scene.width, h: scene.height };
}
function readBbox(scene, baseId) {
    const root = scene.root.findById(baseId);
    if (!root)
        return null;
    return root.shape.bbox;
}
// 找到 sp_<spid> 对应 shape 的 paragraphs，按 iterate 类型切片。
// §19.5.37 iterate type:
//   "el" → 按段落；"wd" → 按词（拉丁字母连续非空白 = 一词，CJK 字符按字独立成"词"，
//   与 PowerPoint 实测一致）；"lt" → 按字符（含 CJK，每个 Unicode codepoint 一个切片）。
function textSlicesFor(scene, spid, kind) {
    const baseId = `sp_${spid}`;
    const node = scene.root.findById(baseId) ?? scene.root.findById(`${baseId}_text`);
    if (!node)
        return [];
    const text = pickTextShape(node.shape);
    if (!text)
        return [];
    const paragraphs = text.paragraphs;
    if (kind === "el") {
        return paragraphs.map((_, i) => ({ pRg: { st: i, end: i } }));
    }
    const out = [];
    for (let p = 0; p < paragraphs.length; p++) {
        const para = paragraphs[p];
        const txt = para.runs.map((r) => r.text ?? "").join("");
        if (kind === "wd") {
            let i = 0;
            while (i < txt.length) {
                while (i < txt.length && /\s/.test(txt[i]))
                    i++;
                if (i >= txt.length)
                    break;
                const st = i;
                if (isCjkChar(txt[i])) {
                    // CJK：每字独立成词（PowerPoint 实测行为）。
                    i++;
                }
                else {
                    // 拉丁等：连续非空白且非 CJK 的字符聚合为一词。
                    while (i < txt.length && !/\s/.test(txt[i]) && !isCjkChar(txt[i]))
                        i++;
                }
                if (i > st)
                    out.push({ pRg: { st: p, end: p }, charRg: { st, end: i } });
            }
        }
        else {
            // lt 逐字符（按 codepoint 走，避免 surrogate pair 被拆开）。
            for (let c = 0; c < txt.length;) {
                const cp = txt.codePointAt(c);
                const step = cp > 0xffff ? 2 : 1;
                out.push({ pRg: { st: p, end: p }, charRg: { st: c, end: c + step } });
                c += step;
            }
        }
    }
    return out;
}
// PowerPoint by-word 把 CJK / 假名 / 全角符号 视作每字独立词。
function isCjkChar(ch) {
    const cp = ch.codePointAt(0);
    if (cp === undefined)
        return false;
    return ((cp >= 0x2e80 && cp <= 0x303f) || // CJK Radicals + Symbols & Punctuation
        (cp >= 0x3040 && cp <= 0x30ff) || // Hiragana + Katakana
        (cp >= 0x3400 && cp <= 0x4dbf) || // CJK Ext-A
        (cp >= 0x4e00 && cp <= 0x9fff) || // CJK Unified
        (cp >= 0xf900 && cp <= 0xfaff) || // CJK Compatibility
        (cp >= 0xfe30 && cp <= 0xfe4f) || // CJK Compat Forms
        (cp >= 0xff00 && cp <= 0xffef) || // Halfwidth/Fullwidth
        (cp >= 0x20000 && cp <= 0x2ffff) // CJK Ext-B/C/D/E/F/G
    );
}
function pickTextShape(s) {
    if (s.kind === "text")
        return s;
    if (s.kind === "group") {
        for (const c of s.children) {
            const t = pickTextShape(c);
            if (t)
                return t;
        }
    }
    return undefined;
}
