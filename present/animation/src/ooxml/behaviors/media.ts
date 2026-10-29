// §19.5.12 a:audio / §19.5.74 a:video — 媒体控制行为。

import type { AudioNode, VideoNode } from "../types";
import type { AtomTrack } from "../compile/types";

export function compileMedia(node: AudioNode | VideoNode): AtomTrack[] {
  return [
    {
      kind: "media",
      mediaKind: node.kind,
      action: "play",
      vol: node.cMediaNode.vol,
      mute: node.cMediaNode.mute,
      fullScreen: node.kind === "video" ? node.fullScrn : undefined,
      isNarration: node.kind === "audio" ? node.isNarration : undefined,
      soundSrc: playableSoundSrc(node.cMediaNode.tgtEl?.sndTgt?.src),
    },
  ];
}

function playableSoundSrc(src: string | undefined): string | undefined {
  if (!src || /^rId\d+/i.test(src)) return undefined;
  return src;
}
