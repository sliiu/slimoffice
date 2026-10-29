// §19.5.16 a:cmd — evt/call/verb 命令行为。

import type { CmdNode } from "../types";
import type { AtomTrack } from "../compile/types";

export function compileCmd(node: CmdNode): AtomTrack[] {
  return [{
    kind: "cmd",
    cmdType: node.type ?? "evt",
    cmd: node.cmd ?? "",
    soundSrc: playableSoundSrc(node.cBhvr.tgtEl?.sndTgt?.src),
  }];
}

function playableSoundSrc(src: string | undefined): string | undefined {
  if (!src || /^rId\d+/i.test(src)) return undefined;
  return src;
}
