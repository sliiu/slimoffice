export type EasingFn = (t: number) => number;
export interface Animatable {
    setProperty(key: string, value: unknown): void;
    getProperty(key: string): unknown;
}
export type FillMode = "none" | "forwards" | "backwards" | "both";
export interface PlayState {
    time: number;
    duration: number;
    iteration: number;
    done: boolean;
}
export interface IClip {
    readonly duration: number;
    seek(localTime: number): void;
    reset(): void;
}
