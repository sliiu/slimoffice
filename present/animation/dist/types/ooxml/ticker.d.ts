export type TickCb = (dtMs: number) => void;
export interface Ticker {
    add(cb: TickCb): () => void;
}
/**
 * 手动推进的帧驱动：离线渲染（导出视频）用固定步长 `tick(dtMs)` 逐帧推进，
 * 与墙钟解耦，让动画时长只取决于帧率 × 帧数，不受渲染耗时影响。
 */
export declare class ManualTicker implements Ticker {
    private cbs;
    add(cb: TickCb): () => void;
    tick(dtMs: number): void;
    get size(): number;
}
export declare const globalTicker: Ticker;
