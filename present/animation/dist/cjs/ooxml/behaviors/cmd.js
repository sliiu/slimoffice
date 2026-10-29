"use strict";
// §19.5.16 a:cmd — evt/call/verb 命令行为。
Object.defineProperty(exports, "__esModule", { value: true });
exports.compileCmd = compileCmd;
function compileCmd(node) {
    return [{
            kind: "cmd",
            cmdType: node.type ?? "evt",
            cmd: node.cmd ?? "",
            soundSrc: playableSoundSrc(node.cBhvr.tgtEl?.sndTgt?.src),
        }];
}
function playableSoundSrc(src) {
    if (!src || /^rId\d+/i.test(src))
        return undefined;
    return src;
}
