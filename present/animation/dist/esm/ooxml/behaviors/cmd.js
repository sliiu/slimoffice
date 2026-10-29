// §19.5.16 a:cmd — evt/call/verb 命令行为。
export function compileCmd(node) {
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
