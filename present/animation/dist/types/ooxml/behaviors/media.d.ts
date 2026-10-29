import type { AudioNode, VideoNode } from "../types.js";
import type { AtomTrack } from "../compile/types.js";
export declare function compileMedia(node: AudioNode | VideoNode): AtomTrack[];
