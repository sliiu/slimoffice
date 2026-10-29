"use strict";
// §19.5.69 a:set — 离散赋值行为。
Object.defineProperty(exports, "__esModule", { value: true });
exports.compileSet = compileSet;
const attr_map_1 = require("../attr-map");
const helpers_1 = require("../compile/helpers");
function compileSet(node, ctx, dur) {
    const v = node.to;
    if (!v)
        return [];
    const names = node.cBhvr.attrNameLst ?? [];
    const out = [];
    for (const name of names) {
        const spec = (0, attr_map_1.lookupAttr)(name);
        if (!spec)
            continue;
        const decoded = (0, helpers_1.decodeAnimVal)(v, spec.kind, (s) => spec.decode?.(s, ctx) ?? s, ctx.colorCtx);
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
