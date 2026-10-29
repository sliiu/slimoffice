// §19.5.69 a:set — 离散赋值行为。
import { lookupAttr } from "../attr-map.js";
import { decodeAnimVal } from "../compile/helpers.js";
export function compileSet(node, ctx, dur) {
    const v = node.to;
    if (!v)
        return [];
    const names = node.cBhvr.attrNameLst ?? [];
    const out = [];
    for (const name of names) {
        const spec = lookupAttr(name);
        if (!spec)
            continue;
        const decoded = decodeAnimVal(v, spec.kind, (s) => spec.decode?.(s, ctx) ?? s, ctx.colorCtx);
        out.push({
            kind: "prop",
            property: spec.property,
            valueKind: spec.kind,
            keys: [
                { time: 0, value: decoded },
                { time: dur, value: decoded },
            ],
            calcMode: "discrete",
        });
    }
    return out;
}
