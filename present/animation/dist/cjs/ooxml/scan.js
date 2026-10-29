"use strict";
// 扫描 OoxmlTiming 提取入场目标 - 用于初始化阶段把入场目标 opacity 设为 0。
// 兼容 PowerPoint 的 "hidden until entrance" 行为。
//
// §19.5.37 iterate 处理：当 entrance leaf 处于 iterate 容器内时，单条 leaf
// 在 walk/编译阶段会被 expandIterateSlices 拆成 N 个带 pRg/charRg 的子目标。
// 初始隐藏必须与之对齐，否则会出现"shape 整体被 hide，但 atom 只 set 一个段落
// → 该段落 opacity=1，其它仍 0"或反之"shape 整体 hide，paragraph atom 被它压制，
// 永远显示不出来"的视觉错位。本扫描器同样消费 iterate 信息，给每个段落/字符切片
// 各发一份 EntranceTarget。
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.collectEntranceTargets = collectEntranceTargets;
const types = __importStar(require("./types"));
function collectEntranceTargets(timing, opts = {}) {
    if (!timing)
        return [];
    const out = [];
    const seen = new Set();
    const addTarget = (t) => {
        const key = `${t.spid}|${t.paraRange?.st ?? ""}|${t.paraRange?.end ?? ""}|${t.charRange?.st ?? ""}|${t.charRange?.end ?? ""}`;
        if (seen.has(key))
            return;
        seen.add(key);
        out.push(t);
    };
    const visit = (n, insideEntr, iterate) => {
        const cTn = types.getCTn(n);
        const here = insideEntr || cTn.presetClass === "entr";
        // §19.5.18 cTn.iterate 仅在最近的 par/seq 容器层有效；嵌套时由内向外覆盖。
        const iter = cTn.iterate ?? iterate;
        if (types.isBehavior(n)) {
            if (here && n.cBhvr.tgtEl.spTgt?.spid) {
                const spTgt = n.cBhvr.tgtEl.spTgt;
                const basePRg = spTgt.txEl?.pRg;
                const baseCharRg = spTgt.txEl?.charRg;
                // iterate 容器：参考 walk.ts/expandIterateSlices 的拆分规则——每个 slice
                // 各发一份 EntranceTarget；过滤到 leaf 自身已限定的 pRg/charRg 范围内。
                if (iter && opts.getTextSlices) {
                    const slices = opts.getTextSlices(spTgt.spid, iter.type) ?? [];
                    const filtered = slices.filter((sl) => {
                        if (basePRg) {
                            const p = sl.pRg?.st ?? -1;
                            if (p < basePRg.st || p > basePRg.end)
                                return false;
                        }
                        if (baseCharRg && sl.charRg) {
                            if (sl.charRg.st < baseCharRg.st || sl.charRg.end > baseCharRg.end)
                                return false;
                        }
                        return true;
                    });
                    if (filtered.length > 0) {
                        for (const sl of filtered) {
                            addTarget({
                                spid: spTgt.spid,
                                paraRange: sl.pRg,
                                charRange: sl.charRg,
                            });
                        }
                        return;
                    }
                }
                addTarget({
                    spid: spTgt.spid,
                    paraRange: basePRg,
                    charRange: baseCharRg,
                });
            }
            return;
        }
        for (const c of types.getChildren(n))
            visit(c, here, iter);
    };
    for (const root of timing.tnLst)
        visit(root, false, undefined);
    return out;
}
