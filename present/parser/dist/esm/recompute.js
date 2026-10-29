import { attachFillStrokeSnapshots } from "./parse.js";
import { applyAutoFit, applyInheritance, indexPlaceholders } from "./inherit.js";
// 阶段 2.1：editor / AI 改 master/layout 后用此函数刷新 slide.layers[main]，
// 让占位符 inherited 字段（bbox、fontSize/fontFamily/color、bullet 等）与最新 master 同步。
//
// 实现要点：
//   1. 必须用 raw shapes 重算 —— 如果用当前 inherited 后的 shapes 再 inherit 一次，
//      已经 baked 的字段会"卡住"，新 master 的改动反映不出来。
//   2. raw shapes 由 parser 在 parseSlide 内通过 slide.__source.rawMainShapes 保存。
//   3. 没有 layoutRef / 没有 raw 的 slide 跳过（return false），调用方据此提示用户。
//
// 返回 true 表示重算成功并已写回 slide.layers；false 表示缺数据没改动。
export function recomputeSlideInheritance(pres, slideIdx) {
    const slide = pres.slides[slideIdx];
    if (!slide)
        return false;
    const raw = slide.__source?.rawMainShapes;
    if (!raw)
        return false;
    if (!slide.layoutRef) {
        const main = slide.layers.find((l) => l.id === "main");
        if (main) {
            main.shapes = raw.map((s) => structuredCloneShape(s));
            // structuredClone 丢非可枚举的 __origin → 重挂 fill/stroke/src/opacity 基线，
            // 保持未编辑形状的 round-trip 幂等（groupFrame 不重挂，走 serializer 的安全空帧回退）。
            attachFillStrokeSnapshots(main.shapes);
        }
        return true;
    }
    const master = pres.masters?.find((m) => m.id === slide.layoutRef.masterId);
    const layout = master?.layouts?.find((l) => l.id === slide.layoutRef.layoutId);
    const phIndexes = [];
    if (layout)
        phIndexes.push(indexPlaceholders(layout.shapes));
    if (master)
        phIndexes.push(indexPlaceholders(master.shapes));
    const masterTxStyles = master?.txStyles ? coreToParserTxStyles(master.txStyles) : undefined;
    const inherited = applyAutoFit(applyInheritance(raw.map((s) => structuredCloneShape(s)), phIndexes, { masterTxStyles, presDefaultTextStyle: pres.defaultTextStyle }));
    const main = slide.layers.find((l) => l.id === "main");
    if (main) {
        main.shapes = inherited;
        attachFillStrokeSnapshots(main.shapes);
    }
    return true;
}
function structuredCloneShape(v) {
    // 真正 structuredClone 在 Node ≥17 / 浏览器原生可用；retro fallback 走 JSON 深拷贝，
    // 对纯数据 shape（不含函数 / Date / Map）足够。
    if (typeof structuredClone === "function")
        return structuredClone(v);
    return JSON.parse(JSON.stringify(v));
}
// core.TextStyles → parser.TxStyles 的反向转换 —— 与 parse.ts:convertTxStylesToCore 对偶。
// 这一步比较 silly，但因为 inherit.ts 的 applyInheritance 当前耦合在 parser 包内部类型上，
// 阶段 2.1 不动 inherit.ts。后续若把 inherit 抽到 core，可去掉这层转换。
function coreToParserTxStyles(s) {
    const conv = (arr) => {
        if (!arr)
            return [];
        // tx-styles.readStyle 输出 9 个槽（lvl1..lvl9）。这里同步补齐长度。
        const out = [];
        for (let i = 0; i < 9; i++) {
            const spec = arr[i] ?? {};
            out.push({
                pPr: { ...(spec.pPr ?? {}) },
                rPr: { ...(spec.rPr ?? {}) },
                bullet: spec.bullet,
            });
        }
        return out;
    };
    return { title: conv(s.title), body: conv(s.body), other: conv(s.other) };
}
