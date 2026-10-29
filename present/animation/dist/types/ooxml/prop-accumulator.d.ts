import type { Animatable } from "../types.js";
export type AdditiveMode = "base" | "sum" | "repl" | "mult" | "none";
export declare class PropertyAccumulator {
    private entries;
    private baseSnapshot;
    private seenAtomKeys;
    beginFrame(): void;
    endFrame(): void;
    contribute(target: Animatable | null, targetId: string, key: string, value: unknown, additive: AdditiveMode | undefined, atomId?: string): void;
    flush(resolve: (id: string) => Animatable | null): void;
    private baseFor;
}
